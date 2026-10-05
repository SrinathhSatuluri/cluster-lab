import { describe, expect, it } from 'vitest';
import { RaftCluster } from './cluster.ts';
import type { RaftNode } from './raft.ts';

function run(cluster: RaftCluster, ticks: number) {
  for (let i = 0; i < ticks; i++) cluster.step();
}

/** Run until some live node is leader, failing after `limit` ticks. */
function runUntilLeader(cluster: RaftCluster, limit = 500): RaftNode {
  for (let i = 0; i < limit; i++) {
    const leader = cluster.leader();
    if (leader) return leader;
    cluster.step();
  }
  throw new Error(`no leader within ${limit} ticks`);
}

/** Return each node's committed entries, as term:command strings. */
function committedLogs(cluster: RaftCluster): string[][] {
  return cluster.nodes.map((node) =>
    node.log.slice(0, node.commitIndex).map((e) => `${e.term}:${e.command}`),
  );
}

/** Return a fingerprint of every node's state, for replay comparisons. */
function snapshot(cluster: RaftCluster): string {
  return cluster.nodes
    .map(
      (n) =>
        `${n.id}:${n.role}:${n.currentTerm}:${n.votedFor}:${n.commitIndex}:` +
        n.log.map((e) => `${e.term}/${e.command}`).join(','),
    )
    .join('|');
}

describe('leader election', () => {
  it('elects exactly one leader, and every node follows it', () => {
    for (let seed = 1; seed <= 25; seed++) {
      const cluster = new RaftCluster(seed);
      const leader = runUntilLeader(cluster);
      run(cluster, 50);
      const leaders = cluster.nodes.filter((n) => n.role === 'leader');
      expect(leaders).toHaveLength(1);
      expect(leaders[0].id).toBe(leader.id);
      for (const node of cluster.nodes) {
        expect(node.currentTerm).toBe(leader.currentTerm);
        expect(node.leaderId).toBe(leader.id);
      }
    }
  });

  it('elects a new leader in a higher term when the leader crashes', () => {
    const cluster = new RaftCluster(3);
    const first = runUntilLeader(cluster);
    cluster.crash(first.id);
    run(cluster, 1);
    const second = runUntilLeader(cluster);
    expect(second.id).not.toBe(first.id);
    expect(second.currentTerm).toBeGreaterThan(first.currentTerm);
  });

  it('cannot elect a leader without a majority', () => {
    const cluster = new RaftCluster(4);
    const leader = runUntilLeader(cluster);
    const others = cluster.nodes.filter((n) => n.id !== leader.id);
    // Leave 2 of 5 nodes up: no one can win an election.
    cluster.crash(leader.id);
    cluster.crash(others[0].id);
    cluster.crash(others[1].id);
    run(cluster, 300);
    expect(cluster.leader()).toBeNull();
    expect(cluster.nodes[others[2].id].currentTerm).toBeGreaterThan(
      leader.currentTerm,
    );
  });
});

describe('log replication', () => {
  it('commits writes and replicates them to every node in order', () => {
    const cluster = new RaftCluster(11);
    runUntilLeader(cluster);
    for (let i = 1; i <= 20; i++) {
      expect(cluster.write(`x=${i}`)).not.toBeNull();
      run(cluster, 2);
    }
    run(cluster, 60);

    expect(cluster.writes.every((w) => w.status === 'committed')).toBe(true);
    const logs = committedLogs(cluster);
    for (const log of logs) expect(log).toEqual(logs[0]);
    const commands = logs[0].map((e) => e.split(':')[1]).filter((c) => c !== 'null');
    expect(commands).toEqual(Array.from({ length: 20 }, (_, i) => `x=${i + 1}`));
  });

  it('brings a restarted node back up to date', () => {
    const cluster = new RaftCluster(12);
    const leader = runUntilLeader(cluster);
    const follower = cluster.nodes.find((n) => n.id !== leader.id)!;
    cluster.crash(follower.id);
    for (let i = 1; i <= 10; i++) cluster.write(`y=${i}`);
    run(cluster, 40);
    expect(follower.lastIndex()).toBeLessThan(leader.lastIndex());

    cluster.restart(follower.id);
    run(cluster, 80);
    expect(follower.log).toEqual(leader.log);
    expect(follower.commitIndex).toBe(leader.commitIndex);
  });

  it('keeps committed writes and drops the minority side’s writes across a partition', () => {
    const cluster = new RaftCluster(21);
    const oldLeader = runUntilLeader(cluster);
    cluster.write('before');
    run(cluster, 30);

    // Strand the leader with one follower: a minority of 2 out of 5.
    const buddy = cluster.nodes.find((n) => n.id !== oldLeader.id)!;
    const minority = [oldLeader.id, buddy.id];
    const majority = cluster.nodes.map((n) => n.id).filter((id) => !minority.includes(id));
    cluster.partition([minority, majority]);

    // The old leader still accepts a write, but can never commit it. Once
    // the majority's new leader commits its own entry at that index, the
    // write is lost, even though the old leader still holds it.
    const stranded = cluster.write('stranded')!;
    expect(stranded.leader).toBe(oldLeader.id);
    run(cluster, 150);
    expect(stranded.status).toBe('lost');
    expect(oldLeader.role).toBe('leader');
    expect(oldLeader.commitIndex).toBeLessThan(stranded.index);
    expect(oldLeader.log[stranded.index - 1].command).toBe('stranded');

    // The majority elects its own leader and commits.
    const newLeader = cluster.leader()!;
    expect(majority).toContain(newLeader.id);
    expect(newLeader.currentTerm).toBeGreaterThan(oldLeader.currentTerm);
    const accepted = cluster.write('after')!;
    run(cluster, 40);
    expect(accepted.status).toBe('committed');

    // On healing, the old leader steps down and its write is overwritten.
    cluster.heal();
    run(cluster, 120);
    expect(oldLeader.role).toBe('follower');
    expect(stranded.status).toBe('lost');
    const logs = committedLogs(cluster);
    for (const log of logs) expect(log).toEqual(logs[0]);
    expect(logs[0].some((e) => e.endsWith(':before'))).toBe(true);
    expect(logs[0].some((e) => e.endsWith(':after'))).toBe(true);
    expect(logs[0].some((e) => e.endsWith(':stranded'))).toBe(false);
  });
});

describe('determinism', () => {
  function scenario(seed: number): RaftCluster {
    const cluster = new RaftCluster(seed);
    run(cluster, 60);
    cluster.write('a');
    run(cluster, 10);
    cluster.crash(cluster.leader()?.id ?? 0);
    run(cluster, 40);
    cluster.partition([[0, 1], [2, 3, 4]]);
    cluster.write('b');
    run(cluster, 50);
    cluster.heal();
    cluster.restart(0);
    cluster.restart(1);
    cluster.restart(2);
    cluster.restart(3);
    cluster.restart(4);
    run(cluster, 80);
    return cluster;
  }

  it('produces the same run for the same seed and actions', () => {
    expect(snapshot(scenario(5))).toBe(snapshot(scenario(5)));
    expect(scenario(5).events).toEqual(scenario(5).events);
  });

  it('replays a run from its seed and action log, tick for tick', () => {
    const original = scenario(8);
    const replayed = RaftCluster.replay(8, original.actions, original.now);
    expect(snapshot(replayed)).toBe(snapshot(original));
    expect(replayed.events).toEqual(original.events);
    expect(replayed.writes).toEqual(original.writes);
  });
});
