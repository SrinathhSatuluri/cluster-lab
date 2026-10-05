// A deterministic, tick-based network of simulated nodes.
//
// Time advances in whole ticks. Each tick the network delivers the messages
// due that tick, in the order they were sent, then lets every live node run
// its timers. A message takes a random number of ticks to arrive and may be
// dropped. A crashed node receives nothing and runs no timers; a partition
// splits the nodes into groups that cannot reach each other, and a message
// already in flight is lost if a partition separates its ends before it
// lands.
//
// The network owns the only random number generator, and nodes draw from it
// through the network, so a run is a pure function of its seed and of the
// faults applied to it at given ticks. Replaying both reproduces it exactly.

import { Rng } from './rng.ts';

export interface Envelope<M> {
  to: number;
  msg: M;
}

/** A node the network can drive. */
export interface SimNode<M> {
  readonly id: number;
  /** Run timers at `now`, returning messages to send. */
  tick(now: number): Envelope<M>[];
  /** Handle `msg` from `from` at `now`, returning messages to send. */
  receive(from: number, msg: M, now: number): Envelope<M>[];
  /** Come back up at `now` after a crash, keeping only durable state. */
  restart(now: number): void;
}

export interface InFlight<M> {
  id: number;
  from: number;
  to: number;
  msg: M;
  sentAt: number;
  deliverAt: number;
}

export interface NetworkConfig {
  /** Fewest and most ticks a message takes to arrive. */
  minDelay: number;
  maxDelay: number;
  /** Probability that any one message is lost. */
  dropRate: number;
}

export const DEFAULT_NETWORK: NetworkConfig = {
  minDelay: 1,
  maxDelay: 3,
  dropRate: 0,
};

export class Network<M, N extends SimNode<M>> {
  readonly rng: Rng;
  readonly nodes: N[];
  config: NetworkConfig;

  now = 0;
  private nextMessageId = 0;
  private inFlight: InFlight<M>[] = [];
  private up: boolean[];
  /** Partition group of each node; nodes talk only within a group. */
  private group: number[];

  constructor(
    seed: number,
    makeNode: (id: number, network: Network<M, N>) => N,
    size: number,
    config: NetworkConfig = DEFAULT_NETWORK,
  ) {
    this.rng = new Rng(seed);
    this.config = { ...config };
    this.up = new Array(size).fill(true);
    this.group = new Array(size).fill(0);
    this.nodes = [];
    for (let id = 0; id < size; id++) {
      this.nodes.push(makeNode(id, this));
    }
  }

  get size(): number {
    return this.nodes.length;
  }

  isUp(id: number): boolean {
    return this.up[id];
  }

  /** Return whether a message from `a` can currently reach `b`. */
  canReach(a: number, b: number): boolean {
    return this.group[a] === this.group[b];
  }

  /** Return the partition groups, each a sorted list of node ids. */
  groups(): number[][] {
    const byGroup = new Map<number, number[]>();
    this.group.forEach((g, id) => {
      if (!byGroup.has(g)) byGroup.set(g, []);
      byGroup.get(g)!.push(id);
    });
    return [...byGroup.values()];
  }

  messages(): readonly InFlight<M>[] {
    return this.inFlight;
  }

  /** Advance one tick: deliver what is due, then run every live node. */
  step(): void {
    this.now += 1;

    const due = this.inFlight.filter((m) => m.deliverAt <= this.now);
    this.inFlight = this.inFlight.filter((m) => m.deliverAt > this.now);
    for (const m of due) {
      if (!this.up[m.to] || !this.canReach(m.from, m.to)) continue;
      this.send(m.to, this.nodes[m.to].receive(m.from, m.msg, this.now));
    }

    for (const node of this.nodes) {
      if (this.up[node.id]) this.send(node.id, node.tick(this.now));
    }
  }

  /** Queue `out` from `from`, dropping what the network would lose. */
  send(from: number, out: Envelope<M>[]): void {
    for (const { to, msg } of out) {
      if (to === from) continue;
      // Draw both numbers for every message so that whether one message is
      // dropped never shifts the random stream for the next.
      const delay = this.rng.int(this.config.minDelay, this.config.maxDelay);
      const dropped = this.rng.chance(this.config.dropRate);
      if (dropped || !this.canReach(from, to)) continue;
      this.inFlight.push({
        id: this.nextMessageId++,
        from,
        to,
        msg,
        sentAt: this.now,
        deliverAt: this.now + delay,
      });
    }
  }

  /** Crash node `id`: it stops receiving and running timers. */
  crash(id: number): void {
    this.up[id] = false;
  }

  /** Bring node `id` back with only its durable state. */
  restart(id: number): void {
    if (this.up[id]) return;
    this.up[id] = true;
    this.nodes[id].restart(this.now);
  }

  /**
   * Split the nodes into `groups`. Nodes left out of every group form one
   * more group of their own.
   */
  partition(groups: number[][]): void {
    this.group.fill(groups.length);
    groups.forEach((members, g) => {
      for (const id of members) this.group[id] = g;
    });
  }

  /** Remove every partition. */
  heal(): void {
    this.group.fill(0);
  }
}
