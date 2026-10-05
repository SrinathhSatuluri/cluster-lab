// Randomized fault injection against the invariant checker.
//
// One run, for one seed:
//   1. Chaos. For `chaosTicks` ticks, clients write at random while nodes
//      crash and restart, the network partitions and heals, and messages
//      are dropped. The checker runs after every tick.
//   2. Quiet. Every node restarts, the network heals and stops dropping
//      messages, and the cluster runs for `quietTicks` more ticks.
//   3. Liveness. By the end there must be one leader, every node must hold
//      the same committed log, and a client write made during the quiet
//      period must have committed. Like a real Raft client, the client
//      retries a write that was rejected, lost, or left with a leader that
//      has since been deposed, since such a write may never commit.
//
// A run is a pure function of its seed: the fault schedule comes from its
// own generator, the cluster from its own, so any failure replays exactly.

import { Rng } from './rng.ts';
import { RaftCluster, type Write } from './cluster.ts';
import { InvariantChecker, type Violation } from './checker.ts';

export interface FuzzOptions {
  seed: number;
  size?: number;
  chaosTicks?: number;
  quietTicks?: number;
  /** Per-tick probabilities during chaos. */
  writeRate?: number;
  faultRate?: number;
  dropRate?: number;
}

export interface FuzzStats {
  ticks: number;
  writes: number;
  committed: number;
  lost: number;
  crashes: number;
  restarts: number;
  partitions: number;
  heals: number;
  elections: number;
  maxTerm: number;
}

export interface FuzzResult {
  seed: number;
  violations: Violation[];
  /** Why the cluster failed to recover after the faults stopped, if it did. */
  livenessFailure: string | null;
  stats: FuzzStats;
  cluster: RaftCluster;
}

/** Split `ids` into two or three non-empty groups at random. */
function randomPartition(rng: Rng, ids: number[]): number[][] {
  const order = rng.shuffle(ids);
  const groups = rng.chance(0.25) && ids.length >= 3 ? 3 : 2;
  const cuts = rng
    .shuffle(Array.from({ length: ids.length - 1 }, (_, i) => i + 1))
    .slice(0, groups - 1)
    .sort((x, y) => x - y);
  const out: number[][] = [];
  let start = 0;
  for (const cut of [...cuts, ids.length]) {
    out.push(order.slice(start, cut));
    start = cut;
  }
  return out;
}

export function fuzz(options: FuzzOptions): FuzzResult {
  const {
    seed,
    size = 5,
    chaosTicks = 600,
    quietTicks = 400,
    writeRate = 0.1,
    faultRate = 0.03,
    dropRate = 0.05,
  } = options;

  const cluster = new RaftCluster(seed, {
    size,
    network: { minDelay: 1, maxDelay: 3, dropRate },
  });
  const checker = new InvariantChecker();
  const chaos = new Rng(seed ^ 0x5eed5eed);
  const ids = cluster.nodes.map((n) => n.id);
  const stats: FuzzStats = {
    ticks: 0,
    writes: 0,
    committed: 0,
    lost: 0,
    crashes: 0,
    restarts: 0,
    partitions: 0,
    heals: 0,
    elections: 0,
    maxTerm: 0,
  };

  const step = () => {
    cluster.step();
    checker.check(cluster);
  };

  // 1. Chaos.
  for (let t = 0; t < chaosTicks && checker.violations.length === 0; t++) {
    if (chaos.chance(writeRate)) {
      cluster.write(`w${++stats.writes}`);
    }
    if (chaos.chance(faultRate)) {
      const up = ids.filter((id) => cluster.network.isUp(id));
      const down = ids.filter((id) => !cluster.network.isUp(id));
      switch (chaos.int(0, 3)) {
        case 0:
          if (up.length > 0) {
            cluster.crash(chaos.pick(up));
            stats.crashes++;
          }
          break;
        case 1:
          if (down.length > 0) {
            cluster.restart(chaos.pick(down));
            stats.restarts++;
          }
          break;
        case 2:
          cluster.partition(randomPartition(chaos, ids));
          stats.partitions++;
          break;
        case 3:
          cluster.heal();
          stats.heals++;
          break;
      }
    }
    step();
  }

  // 2. Quiet: everything back up, a reliable network.
  cluster.heal();
  for (const id of ids) cluster.restart(id);
  cluster.setDropRate(0);
  const finalWrites: Write[] = [];
  const committed = () => finalWrites.some((w) => w.status === 'committed');
  for (let t = 0; t < quietTicks && checker.violations.length === 0; t++) {
    if (t >= 50 && !committed()) {
      const last = finalWrites[finalWrites.length - 1];
      const owner = last ? cluster.nodes[last.leader] : null;
      const abandoned =
        !last ||
        last.status === 'lost' ||
        owner!.role !== 'leader' ||
        owner!.currentTerm !== last.term;
      if (abandoned) {
        const write = cluster.write(`final${finalWrites.length + 1}`);
        if (write) finalWrites.push(write);
      }
    }
    step();
  }

  // 3. Liveness.
  let livenessFailure: string | null = null;
  if (checker.violations.length === 0) {
    const leaders = cluster.nodes.filter((n) => n.role === 'leader');
    const leader = leaders[0];
    if (leaders.length !== 1) {
      livenessFailure = `${leaders.length} leaders after the faults stopped`;
    } else if (!committed()) {
      livenessFailure = 'a write after the faults stopped did not commit';
    } else {
      for (const node of cluster.nodes) {
        if (
          node.commitIndex !== leader.commitIndex ||
          node.log.length < leader.commitIndex
        ) {
          livenessFailure = `node ${node.id} did not catch up with the leader`;
          break;
        }
      }
    }
  }

  stats.ticks = cluster.now;
  stats.committed = cluster.writes.filter((w) => w.status === 'committed').length;
  stats.lost = cluster.writes.filter((w) => w.status === 'lost').length;
  stats.elections = cluster.events.filter((e) => e.kind === 'leader').length;
  stats.maxTerm = Math.max(...cluster.nodes.map((n) => n.currentTerm));

  return {
    seed,
    violations: checker.violations,
    livenessFailure,
    stats,
    cluster,
  };
}
