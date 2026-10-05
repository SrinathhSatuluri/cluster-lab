import { describe, expect, it } from 'vitest';
import { RaftCluster } from './cluster.ts';
import { InvariantChecker } from './checker.ts';
import { fuzz } from './fuzz.ts';

function run(cluster: RaftCluster, checker: InvariantChecker, ticks: number) {
  for (let i = 0; i < ticks; i++) {
    cluster.step();
    checker.check(cluster);
  }
}

/** A healthy 5-node cluster that has committed a few writes. */
function healthyCluster(seed = 2) {
  const cluster = new RaftCluster(seed);
  const checker = new InvariantChecker();
  run(cluster, checker, 80);
  for (let i = 0; i < 5; i++) cluster.write(`v${i}`);
  run(cluster, checker, 60);
  expect(checker.violations).toEqual([]);
  expect(checker.committedEntries().length).toBeGreaterThan(5);
  return { cluster, checker };
}

// Each test breaks one property by hand and checks the checker names it.
describe('InvariantChecker', () => {
  it('passes a healthy run', () => {
    healthyCluster();
  });

  it('catches two leaders in one term (Election Safety)', () => {
    const { cluster, checker } = healthyCluster();
    const leader = cluster.leader()!;
    const other = cluster.nodes.find((n) => n.id !== leader.id)!;
    other.role = 'leader';
    other.currentTerm = leader.currentTerm;
    const found = checker.check(cluster);
    expect(found.map((v) => v.invariant)).toContain('Election Safety');
  });

  it('catches a node committing a different entry (State Machine Safety)', () => {
    const { cluster, checker } = healthyCluster();
    const node = cluster.nodes[0];
    node.log[1] = { term: node.log[1].term, command: 'tampered' };
    const found = checker.check(cluster);
    expect(found.map((v) => v.invariant)).toContain('State Machine Safety');
  });

  it('catches a leader missing a committed entry (Leader Completeness)', () => {
    const { cluster, checker } = healthyCluster();
    const follower = cluster.nodes.find((n) => n.role === 'follower')!;
    follower.log.length = 1;
    follower.commitIndex = 0;
    follower.role = 'leader';
    follower.currentTerm += 5;
    const found = checker.check(cluster);
    expect(found.map((v) => v.invariant)).toContain('Leader Completeness');
  });

  it('catches logs that agree on a term but differ earlier (Log Matching)', () => {
    const { cluster, checker } = healthyCluster();
    const [a, b] = cluster.nodes;
    a.commitIndex = 0;
    b.commitIndex = 0;
    // Same term at the last index, different entries before it.
    a.log[0] = { term: 99, command: 'x' };
    const found = checker.check(cluster);
    expect(found.map((v) => v.invariant)).toContain('Log Matching');
    expect(b.log[0].term).not.toBe(99);
  });
});

describe('fuzz', () => {
  it('finds no violation and recovers liveness across many seeds', () => {
    for (let seed = 1; seed <= 40; seed++) {
      const result = fuzz({ seed });
      expect(result.violations, `seed ${seed}`).toEqual([]);
      expect(result.livenessFailure, `seed ${seed}`).toBeNull();
    }
  });

  it('actually injects faults', () => {
    const result = fuzz({ seed: 7 });
    expect(result.stats.crashes + result.stats.partitions).toBeGreaterThan(5);
    expect(result.stats.elections).toBeGreaterThan(1);
    expect(result.stats.committed).toBeGreaterThan(0);
  });

  it('is deterministic per seed, and replays from its action log', () => {
    const a = fuzz({ seed: 13 });
    const b = fuzz({ seed: 13 });
    expect(a.stats).toEqual(b.stats);
    expect(a.cluster.events).toEqual(b.cluster.events);

    const replayed = RaftCluster.replay(13, a.cluster.actions, a.cluster.now, {
      network: { minDelay: 1, maxDelay: 3, dropRate: 0.05 },
    });
    expect(replayed.events).toEqual(a.cluster.events);
    expect(replayed.writes).toEqual(a.cluster.writes);
    expect(replayed.nodes.map((n) => n.log)).toEqual(a.cluster.nodes.map((n) => n.log));
  });
});
