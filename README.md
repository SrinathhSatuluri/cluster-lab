# Cluster-Lab

An in-browser Raft simulator. Five nodes run Raft on a seeded, tick-based
network; you can kill the leader or partition it in the middle of a write and
watch the cluster elect, replicate and recover one tick at a time, while a
checker verifies Raft's safety properties after every tick.

```
npm install
npm run dev        # then open http://localhost:5173/#/raft
```

## What is in it

- `src/sim/network.ts` is a deterministic, tick-based network. Each tick
  delivers the messages due that tick in send order, then runs every live
  node's timers. Messages take 1 to 3 ticks and may be dropped. A crashed node
  hears nothing; a partition splits nodes into groups, and a message in flight
  is lost if a partition separates its ends before it lands.
- `src/sim/raft.ts` is one Raft server, following Figure 2 of the paper:
  randomized election timeouts, RequestVote with the election restriction,
  AppendEntries with the `prevLogIndex`/`prevLogTerm` consistency check,
  truncation only at a real conflict, and a commit rule that counts replicas
  only of entries from the leader's own term. A new leader appends a no-op so
  entries left by earlier terms commit. `currentTerm`, `votedFor` and the log
  survive a restart; nothing else does.
- `src/sim/cluster.ts` runs a cluster on the network, routes client writes to
  the leader, and tracks each write as pending, committed or lost. Every write,
  crash, restart, partition and heal is recorded with its tick.
- `src/sim/checker.ts` checks the four safety properties of the Raft paper
  after every tick: Election Safety, Log Matching, Leader Completeness and
  State Machine Safety. It keeps its own history of who led each term and of
  every entry ever seen committed.
- `src/lab/RaftLab.tsx` is the simulator page.

## Deterministic replay

All randomness (delays, drops, election timeouts) comes from one seeded
generator owned by the network, and nodes never read a clock: time is the tick
number passed in. A run is therefore a pure function of its seed and its
action log. `RaftCluster.replay(seed, actions, tick)` rebuilds it exactly; the
page's Replay button does that and confirms the result is identical, and its
timeline rewinds by replaying up to the chosen tick.

## Fuzzing

`npm run fuzz -- [seeds] [first-seed]` runs one randomized scenario per seed:
600 ticks of random writes, crashes, restarts, partitions into two or three
groups, heals and 5% message loss, with the checker running every tick; then
every node restarts on a reliable network and the cluster must elect one
leader, commit a new write, and bring every node's committed log level. A
failing seed is printed and replays exactly.

CI runs 2,000 new seeds on every push, alongside typecheck, unit tests and
build. A local run:

```
raft fuzz: 2,000 seeds from 1, 5 nodes each
  ticks simulated            2,000,000
  crashes / restarts         8,746 / 5,156
  partitions / heals         8,961 / 8,903
  leaders elected            7,346 (highest term 32)
  writes attempted           119,871
  writes committed           80,491
  writes lost, uncommitted   4,824
  safety violations          0
  liveness failures          0
  time                       11.8s
```

Lost writes are expected: a write accepted by a leader that is then cut off
from the majority never commits, and a later leader overwrites it. Raft only
promises that a committed write is never lost, and the checker enforces that.

### Does the checker catch real bugs?

Breaking Raft on purpose and running the fuzzer:

| Bug introduced | Caught |
|---|---|
| Vote for any candidate, ignoring the election restriction | Seed 5: Leader Completeness, a new leader lacked a committed entry |
| Vote for more than one candidate in a term | Seed 5: Election Safety, two leaders in term 1 |
| Commit an earlier term's entry by counting its replicas (Figure 8) | Not caught in 80,000 seeds |

The third bug is the one Raft's no-op guards against. Because a new leader
appends a no-op from its own term and sends it in the same AppendEntries as
the older entries, an old-term entry almost never reaches a majority without
the no-op right behind it, so the unsafe commit has nothing to break. Showing
the bug would need a scripted schedule, or the no-op turned off.

## Not modelled

Log compaction and snapshots, membership changes, client sessions and
duplicate detection, and linearizable reads. Durable state survives a crash
whole; there is no torn or lost write to disk.
