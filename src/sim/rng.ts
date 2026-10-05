// Seeded pseudo-random numbers (mulberry32).
//
// Every random choice in a simulation (message delays, drops, election
// timeouts, injected faults) comes from one Rng, so a run is a pure function
// of its seed: the same seed replays the same run, tick for tick.

export class Rng {
  private state: number;

  constructor(seed: number) {
    this.state = seed >>> 0;
  }

  /** Return the next 32-bit unsigned integer. */
  next(): number {
    this.state = (this.state + 0x6d2b79f5) >>> 0;
    let t = this.state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return (t ^ (t >>> 14)) >>> 0;
  }

  /** Return a float in [0, 1). */
  float(): number {
    return this.next() / 4294967296;
  }

  /** Return an integer in [lo, hi], inclusive. */
  int(lo: number, hi: number): number {
    return lo + (this.next() % (hi - lo + 1));
  }

  /** Return true with probability p. */
  chance(p: number): boolean {
    return this.float() < p;
  }

  /** Return a uniformly chosen element of a non-empty array. */
  pick<T>(items: readonly T[]): T {
    return items[this.next() % items.length];
  }

  /** Return a shuffled copy of items. */
  shuffle<T>(items: readonly T[]): T[] {
    const out = items.slice();
    for (let i = out.length - 1; i > 0; i--) {
      const j = this.next() % (i + 1);
      [out[i], out[j]] = [out[j], out[i]];
    }
    return out;
  }
}
