import { describe, expect, it } from 'vitest';
import { Rng } from './rng.ts';
import { Network, type Envelope, type SimNode } from './network.ts';

// A node that pings every other node every `period` ticks and records what
// it hears, so tests can see exactly what the network delivered.
class PingNode implements SimNode<string> {
  readonly id: number;
  heard: string[] = [];
  restarts = 0;
  private readonly size: number;
  private readonly period: number;

  constructor(id: number, size: number, period = 5) {
    this.id = id;
    this.size = size;
    this.period = period;
  }

  tick(now: number): Envelope<string>[] {
    if (now % this.period !== 0) return [];
    const out: Envelope<string>[] = [];
    for (let to = 0; to < this.size; to++) {
      if (to !== this.id) out.push({ to, msg: `${this.id}@${now}` });
    }
    return out;
  }

  receive(from: number, msg: string, now: number): Envelope<string>[] {
    this.heard.push(`${msg}->${this.id}@${now}`);
    return [];
  }

  restart(): void {
    this.restarts += 1;
  }
}

function makeNetwork(seed: number, size = 3, dropRate = 0) {
  return new Network<string, PingNode>(
    seed,
    (id) => new PingNode(id, size),
    size,
    { minDelay: 1, maxDelay: 4, dropRate },
  );
}

function run(network: Network<string, PingNode>, ticks: number) {
  for (let i = 0; i < ticks; i++) network.step();
  return network.nodes.map((n) => n.heard.join(' '));
}

describe('Rng', () => {
  it('replays the same sequence for the same seed', () => {
    const a = new Rng(42);
    const b = new Rng(42);
    const seqA = Array.from({ length: 100 }, () => a.next());
    const seqB = Array.from({ length: 100 }, () => b.next());
    expect(seqA).toEqual(seqB);
  });

  it('differs across seeds', () => {
    expect(new Rng(1).next()).not.toBe(new Rng(2).next());
  });

  it('keeps int() within bounds', () => {
    const rng = new Rng(7);
    for (let i = 0; i < 1000; i++) {
      const v = rng.int(3, 9);
      expect(v).toBeGreaterThanOrEqual(3);
      expect(v).toBeLessThanOrEqual(9);
    }
  });
});

describe('Network', () => {
  it('is deterministic: the same seed delivers the same messages at the same ticks', () => {
    expect(run(makeNetwork(9, 3, 0.2), 200)).toEqual(
      run(makeNetwork(9, 3, 0.2), 200),
    );
  });

  it('delivers every message within the delay bounds when nothing is dropped', () => {
    const network = makeNetwork(3);
    run(network, 100);
    for (const node of network.nodes) {
      for (const entry of node.heard) {
        const [, , sent, , at] = entry.match(/^(\d+)@(\d+)->(\d+)@(\d+)$/)!;
        const delay = Number(at) - Number(sent);
        expect(delay).toBeGreaterThanOrEqual(1);
        expect(delay).toBeLessThanOrEqual(4);
      }
    }
    // Each node pings the other two every 5 ticks: 19 rounds land by tick 100.
    expect(network.nodes[0].heard.length).toBeGreaterThanOrEqual(2 * 19);
  });

  it('drops roughly the configured fraction of messages', () => {
    const lossless = makeNetwork(5, 3, 0);
    const lossy = makeNetwork(5, 3, 0.5);
    const count = (n: Network<string, PingNode>) =>
      n.nodes.reduce((sum, node) => sum + node.heard.length, 0);
    run(lossless, 1000);
    run(lossy, 1000);
    const ratio = count(lossy) / count(lossless);
    expect(ratio).toBeGreaterThan(0.4);
    expect(ratio).toBeLessThan(0.6);
  });

  it('delivers nothing to a crashed node, and restarts it', () => {
    const network = makeNetwork(4);
    network.crash(2);
    run(network, 50);
    expect(network.nodes[2].heard).toEqual([]);
    expect(network.isUp(2)).toBe(false);

    network.restart(2);
    expect(network.nodes[2].restarts).toBe(1);
    run(network, 50);
    expect(network.nodes[2].heard.length).toBeGreaterThan(0);
  });

  it('stops messages across a partition, including ones already in flight', () => {
    const network = makeNetwork(6);
    run(network, 5); // pings sent at tick 5 are now in flight
    network.partition([[0, 1], [2]]);
    run(network, 50);
    const crossed = network.nodes[2].heard.filter((h) => !h.startsWith('2'));
    expect(crossed).toEqual([]);
    expect(network.nodes[0].heard.some((h) => h.startsWith('1@'))).toBe(true);
    expect(network.groups()).toEqual([[0, 1], [2]]);

    network.heal();
    run(network, 20);
    expect(network.nodes[2].heard.some((h) => h.startsWith('0@'))).toBe(true);
  });

  it('puts nodes left out of every group into a group of their own', () => {
    const network = makeNetwork(1, 4);
    network.partition([[0]]);
    expect(network.canReach(1, 2)).toBe(true);
    expect(network.canReach(0, 1)).toBe(false);
  });
});
