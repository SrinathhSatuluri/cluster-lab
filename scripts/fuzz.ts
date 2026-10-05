// Run the Raft fuzzer over many seeds and print what it did.
//
// Usage: node scripts/fuzz.ts [seeds] [first-seed]
//
// Exits non-zero on the first seed that breaks a safety invariant or fails
// to recover, and prints that seed so the run can be replayed.

import { fuzz } from '../src/sim/fuzz.ts';

const seeds = Number(process.argv[2] ?? 500);
const firstSeed = Number(process.argv[3] ?? 1);

const totals = {
  ticks: 0,
  writes: 0,
  committed: 0,
  lost: 0,
  crashes: 0,
  restarts: 0,
  partitions: 0,
  heals: 0,
  elections: 0,
};
let maxTerm = 0;
const started = Date.now();

for (let i = 0; i < seeds; i++) {
  const seed = firstSeed + i;
  const result = fuzz({ seed });
  for (const key of Object.keys(totals) as (keyof typeof totals)[]) {
    totals[key] += result.stats[key];
  }
  maxTerm = Math.max(maxTerm, result.stats.maxTerm);

  if (result.violations.length > 0 || result.livenessFailure) {
    console.error(`FAIL seed ${seed}`);
    for (const v of result.violations.slice(0, 5)) {
      console.error(`  tick ${v.tick}: ${v.invariant}: ${v.detail}`);
    }
    if (result.livenessFailure) {
      console.error(`  liveness: ${result.livenessFailure}`);
    }
    process.exit(1);
  }
}

const fmt = (n: number) => n.toLocaleString('en-US');
console.log(`raft fuzz: ${fmt(seeds)} seeds from ${firstSeed}, 5 nodes each`);
console.log(`  ticks simulated            ${fmt(totals.ticks)}`);
console.log(`  crashes / restarts         ${fmt(totals.crashes)} / ${fmt(totals.restarts)}`);
console.log(`  partitions / heals         ${fmt(totals.partitions)} / ${fmt(totals.heals)}`);
console.log(`  leaders elected            ${fmt(totals.elections)} (highest term ${maxTerm})`);
console.log(`  writes attempted           ${fmt(totals.writes)}`);
console.log(`  writes committed           ${fmt(totals.committed)}`);
console.log(`  writes lost, uncommitted   ${fmt(totals.lost)}`);
console.log(`  safety violations          0`);
console.log(`  liveness failures          0`);
console.log(`  time                       ${((Date.now() - started) / 1000).toFixed(1)}s`);
