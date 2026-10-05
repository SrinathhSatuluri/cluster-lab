// Checks Raft's safety properties (Figure 3 of the Raft paper) after every
// tick of a run.
//
//   Election Safety      At most one leader is elected in a given term.
//   Log Matching         If two logs hold an entry with the same index and
//                        term, the logs are identical up to that index.
//   Leader Completeness  A leader's log holds every entry committed before
//                        its term.
//   State Machine Safety No two nodes ever commit different entries at the
//                        same index.
//
// The checker keeps its own history (who led each term, and every entry
// ever seen committed) so it catches a violation even when the evidence is
// spread across ticks: a committed entry that a later leader lacks, or a
// node that commits something different at an index after a crash.

import type { RaftCluster } from './cluster.ts';
import type { Entry, RaftNode } from './raft.ts';

export const INVARIANTS = [
  'Election Safety',
  'Log Matching',
  'Leader Completeness',
  'State Machine Safety',
] as const;

export type Invariant = (typeof INVARIANTS)[number];

export interface Violation {
  tick: number;
  invariant: Invariant;
  detail: string;
}

function sameEntry(a: Entry, b: Entry): boolean {
  return a.term === b.term && a.command === b.command;
}

function describe(entry: Entry): string {
  return `term ${entry.term} ${entry.command === null ? 'no-op' : `"${entry.command}"`}`;
}

export class InvariantChecker {
  readonly violations: Violation[] = [];
  /** The node seen leading each term. */
  private readonly leaders = new Map<number, number>();
  /** committed[i - 1] is the first entry seen committed at index i. */
  private readonly committed: Entry[] = [];

  /** Return the entries seen committed so far, by index from 1. */
  committedEntries(): readonly Entry[] {
    return this.committed;
  }

  /** Check every invariant against `cluster` now; return new violations. */
  check(cluster: RaftCluster): Violation[] {
    const found: Violation[] = [];
    const report = (invariant: Invariant, detail: string) =>
      found.push({ tick: cluster.now, invariant, detail });

    const nodes = cluster.nodes;
    this.checkStateMachineSafety(nodes, report);
    this.checkElectionSafetyAndCompleteness(nodes, report);
    this.checkLogMatching(nodes, report);

    this.violations.push(...found);
    return found;
  }

  private checkStateMachineSafety(
    nodes: readonly RaftNode[],
    report: (invariant: Invariant, detail: string) => void,
  ): void {
    for (const node of nodes) {
      for (let i = 1; i <= node.commitIndex; i++) {
        const entry = node.log[i - 1];
        if (!entry) {
          report('State Machine Safety', `node ${node.id} committed index ${i} past the end of its log`);
          break;
        }
        if (i > this.committed.length) {
          this.committed.push({ ...entry });
        } else if (!sameEntry(entry, this.committed[i - 1])) {
          report(
            'State Machine Safety',
            `node ${node.id} committed ${describe(entry)} at index ${i}, ` +
              `but ${describe(this.committed[i - 1])} was committed there`,
          );
          break;
        }
      }
    }
  }

  private checkElectionSafetyAndCompleteness(
    nodes: readonly RaftNode[],
    report: (invariant: Invariant, detail: string) => void,
  ): void {
    for (const node of nodes) {
      if (node.role !== 'leader') continue;
      const term = node.currentTerm;
      const known = this.leaders.get(term);
      if (known !== undefined && known !== node.id) {
        report('Election Safety', `nodes ${known} and ${node.id} both led term ${term}`);
        continue;
      }
      if (known !== undefined) continue;
      this.leaders.set(term, node.id);

      // A new leader must already hold everything committed before it won.
      for (let i = 1; i <= this.committed.length; i++) {
        const entry = node.log[i - 1];
        if (!entry || !sameEntry(entry, this.committed[i - 1])) {
          report(
            'Leader Completeness',
            `node ${node.id} became leader of term ${term} without committed ` +
              `${describe(this.committed[i - 1])} at index ${i}`,
          );
          break;
        }
      }
    }
  }

  private checkLogMatching(
    nodes: readonly RaftNode[],
    report: (invariant: Invariant, detail: string) => void,
  ): void {
    for (let a = 0; a < nodes.length; a++) {
      for (let b = a + 1; b < nodes.length; b++) {
        const logA = nodes[a].log;
        const logB = nodes[b].log;
        const shared = Math.min(logA.length, logB.length);
        let firstDifference = 0;
        for (let i = 1; i <= shared; i++) {
          const x = logA[i - 1];
          const y = logB[i - 1];
          if (x.term === y.term && (x.command !== y.command || firstDifference)) {
            report(
              'Log Matching',
              `nodes ${a} and ${b} hold term ${x.term} at index ${i} ` +
                `but differ at index ${firstDifference || i}`,
            );
            break;
          }
          if (!firstDifference && !sameEntry(x, y)) firstDifference = i;
        }
      }
    }
  }
}
