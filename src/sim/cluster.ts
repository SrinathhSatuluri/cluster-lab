// A Raft cluster on the simulated network, with client writes, faults, and
// an action log that replays a run exactly.
//
// Every change from outside the simulation (a write, a crash, a restart, a
// partition, a heal) goes through this class, which records it with the tick
// it happened at. Because the network is seeded, replaying the same seed and
// the same actions at the same ticks reproduces the run tick for tick.

import { DEFAULT_NETWORK, Network, type NetworkConfig } from './network.ts';
import {
  DEFAULT_RAFT,
  RaftNode,
  type RaftConfig,
  type RaftEvent,
  type RaftMessage,
} from './raft.ts';

export type Action =
  | { tick: number; kind: 'write'; command: string }
  | { tick: number; kind: 'crash'; node: number }
  | { tick: number; kind: 'restart'; node: number }
  | { tick: number; kind: 'partition'; groups: number[][] }
  | { tick: number; kind: 'heal' }
  | { tick: number; kind: 'drop-rate'; rate: number };

export interface Write {
  id: number;
  command: string;
  /** The leader that accepted it, and where it put it. */
  leader: number;
  term: number;
  index: number;
  submittedAt: number;
  /**
   * pending: not yet committed; committed: stored on a majority, so it can
   * never be lost; lost: never committed, and its slot now holds a different
   * entry, because a new leader overwrote it.
   */
  status: 'pending' | 'committed' | 'lost';
  settledAt?: number;
}

export interface ClusterOptions {
  size?: number;
  raft?: RaftConfig;
  network?: NetworkConfig;
}

export class RaftCluster {
  readonly seed: number;
  readonly network: Network<RaftMessage, RaftNode>;
  readonly actions: Action[] = [];
  readonly events: RaftEvent[] = [];
  readonly writes: Write[] = [];

  constructor(seed: number, options: ClusterOptions = {}) {
    this.seed = seed;
    const size = options.size ?? 5;
    const raft = options.raft ?? DEFAULT_RAFT;
    this.network = new Network<RaftMessage, RaftNode>(
      seed,
      (id, network) =>
        new RaftNode(id, size, network.rng, raft, (e) => this.events.push(e)),
      size,
      options.network ?? DEFAULT_NETWORK,
    );
  }

  /** Rebuild the run of `seed` with `actions`, up to tick `until`. */
  static replay(
    seed: number,
    actions: readonly Action[],
    until: number,
    options: ClusterOptions = {},
  ): RaftCluster {
    const cluster = new RaftCluster(seed, options);
    let next = 0;
    for (;;) {
      while (next < actions.length && actions[next].tick === cluster.now) {
        cluster.apply(actions[next++]);
      }
      if (cluster.now >= until) return cluster;
      cluster.step();
    }
  }

  get now(): number {
    return this.network.now;
  }

  get nodes(): readonly RaftNode[] {
    return this.network.nodes;
  }

  step(): void {
    this.network.step();
    this.settleWrites();
  }

  /** Return the live leader with the highest term, if any. */
  leader(): RaftNode | null {
    let best: RaftNode | null = null;
    for (const node of this.nodes) {
      if (!this.network.isUp(node.id) || node.role !== 'leader') continue;
      if (!best || node.currentTerm > best.currentTerm) best = node;
    }
    return best;
  }

  /**
   * Send `command` to the current leader, as a client would. Return the
   * write, or null if no live node believes it is the leader.
   */
  write(command: string): Write | null {
    this.actions.push({ tick: this.now, kind: 'write', command });
    return this.doWrite(command);
  }

  crash(node: number): void {
    this.apply({ tick: this.now, kind: 'crash', node }, true);
  }

  restart(node: number): void {
    this.apply({ tick: this.now, kind: 'restart', node }, true);
  }

  partition(groups: number[][]): void {
    this.apply({ tick: this.now, kind: 'partition', groups }, true);
  }

  heal(): void {
    this.apply({ tick: this.now, kind: 'heal' }, true);
  }

  /** Set the probability that the network loses any one message. */
  setDropRate(rate: number): void {
    this.apply({ tick: this.now, kind: 'drop-rate', rate }, true);
  }

  private apply(action: Action, record = false): void {
    if (record) this.actions.push(action);
    switch (action.kind) {
      case 'write':
        this.doWrite(action.command);
        return;
      case 'crash':
        this.network.crash(action.node);
        return;
      case 'restart':
        this.network.restart(action.node);
        return;
      case 'partition':
        this.network.partition(action.groups);
        return;
      case 'heal':
        this.network.heal();
        return;
      case 'drop-rate':
        this.network.config.dropRate = action.rate;
        return;
    }
  }

  private doWrite(command: string): Write | null {
    const leader = this.leader();
    if (!leader) return null;
    const index = leader.propose(command, this.now);
    if (index === null) return null;
    const write: Write = {
      id: this.writes.length + 1,
      command,
      leader: leader.id,
      term: leader.currentTerm,
      index,
      submittedAt: this.now,
      status: 'pending',
    };
    this.writes.push(write);
    this.settleWrites();
    return write;
  }

  /**
   * Settle pending writes against what some node has committed: the write
   * is committed if a committed entry at its index is its entry, and lost if
   * a committed entry there is a different one.
   */
  private settleWrites(): void {
    for (const write of this.writes) {
      if (write.status !== 'pending') continue;
      for (const node of this.nodes) {
        if (node.commitIndex < write.index) continue;
        const entry = node.log[write.index - 1];
        write.status =
          entry.term === write.term && entry.command === write.command
            ? 'committed'
            : 'lost';
        write.settledAt = this.now;
        break;
      }
    }
  }
}
