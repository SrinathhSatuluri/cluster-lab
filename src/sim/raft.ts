// One Raft server, following Figure 2 of the Raft paper (Ongaro and
// Ousterhout, 2014).
//
// Durable state, kept across a crash: currentTerm, votedFor and the log.
// Everything else is rebuilt on restart.
//
// The node never reads a clock or a random number generator of its own:
// time arrives as the `now` argument and randomness comes from the
// network's seeded generator, so a run replays exactly.

import type { Rng } from './rng.ts';
import type { Envelope, SimNode } from './network.ts';

/** A log entry. A null command is the no-op a new leader appends. */
export interface Entry {
  term: number;
  command: string | null;
}

export type Role = 'follower' | 'candidate' | 'leader';

export type RaftMessage =
  | {
      type: 'RequestVote';
      term: number;
      lastLogIndex: number;
      lastLogTerm: number;
    }
  | { type: 'RequestVoteReply'; term: number; granted: boolean }
  | {
      type: 'AppendEntries';
      term: number;
      prevLogIndex: number;
      prevLogTerm: number;
      entries: Entry[];
      leaderCommit: number;
    }
  | {
      type: 'AppendEntriesReply';
      term: number;
      success: boolean;
      /** On success, the index of the last entry the follower now matches. */
      matchIndex: number;
      /** The follower's last index, so a leader can skip back quickly. */
      lastLogIndex: number;
    };

export interface RaftConfig {
  /** Range of the randomized election timeout, in ticks. */
  electionTimeoutMin: number;
  electionTimeoutMax: number;
  /** Ticks between a leader's heartbeats. */
  heartbeatInterval: number;
  /** Most entries sent in one AppendEntries. */
  maxBatch: number;
}

export const DEFAULT_RAFT: RaftConfig = {
  electionTimeoutMin: 15,
  electionTimeoutMax: 30,
  heartbeatInterval: 5,
  maxBatch: 16,
};

export interface RaftEvent {
  tick: number;
  node: number;
  kind: 'candidate' | 'leader' | 'step-down';
  term: number;
}

export class RaftNode implements SimNode<RaftMessage> {
  readonly id: number;
  private readonly size: number;
  private readonly rng: Rng;
  private readonly config: RaftConfig;
  private readonly onEvent: (event: RaftEvent) => void;

  // Durable state.
  currentTerm = 0;
  votedFor: number | null = null;
  /** log[i - 1] is the entry at index i; indexes start at 1. */
  log: Entry[] = [];

  // Volatile state.
  role: Role = 'follower';
  leaderId: number | null = null;
  commitIndex = 0;
  electionDeadline = 0;
  private votes = new Set<number>();
  private heartbeatDue = 0;
  nextIndex: number[];
  matchIndex: number[];

  constructor(
    id: number,
    size: number,
    rng: Rng,
    config: RaftConfig = DEFAULT_RAFT,
    onEvent: (event: RaftEvent) => void = () => {},
  ) {
    this.id = id;
    this.size = size;
    this.rng = rng;
    this.config = config;
    this.onEvent = onEvent;
    this.nextIndex = new Array(size).fill(1);
    this.matchIndex = new Array(size).fill(0);
    this.resetElectionTimer(0);
  }

  lastIndex(): number {
    return this.log.length;
  }

  /** Return the term of the entry at `index`, or 0 for index 0. */
  termAt(index: number): number {
    return index === 0 ? 0 : this.log[index - 1].term;
  }

  private get majority(): number {
    return Math.floor(this.size / 2) + 1;
  }

  private resetElectionTimer(now: number): void {
    this.electionDeadline =
      now +
      this.rng.int(this.config.electionTimeoutMin, this.config.electionTimeoutMax);
  }

  private peers(): number[] {
    const out: number[] = [];
    for (let id = 0; id < this.size; id++) if (id !== this.id) out.push(id);
    return out;
  }

  tick(now: number): Envelope<RaftMessage>[] {
    if (this.role === 'leader') {
      return now >= this.heartbeatDue ? this.broadcastAppend(now) : [];
    }
    return now >= this.electionDeadline ? this.startElection(now) : [];
  }

  receive(from: number, msg: RaftMessage, now: number): Envelope<RaftMessage>[] {
    // Any message from a later term means this node is behind: adopt the
    // term and become a follower before handling the message.
    if (msg.term > this.currentTerm) {
      this.currentTerm = msg.term;
      this.votedFor = null;
      this.leaderId = null;
      this.becomeFollower(now);
    }

    switch (msg.type) {
      case 'RequestVote':
        return this.onRequestVote(from, msg, now);
      case 'RequestVoteReply':
        return this.onRequestVoteReply(from, msg, now);
      case 'AppendEntries':
        return this.onAppendEntries(from, msg, now);
      case 'AppendEntriesReply':
        return this.onAppendEntriesReply(from, msg, now);
    }
  }

  /**
   * Append `command` if this node is the leader and return its index, or
   * return null. The entry is committed once a majority stores it.
   */
  propose(command: string, now: number): number | null {
    if (this.role !== 'leader') return null;
    this.log.push({ term: this.currentTerm, command });
    this.matchIndex[this.id] = this.lastIndex();
    this.advanceCommitIndex();
    this.heartbeatDue = now; // replicate on the next tick
    return this.lastIndex();
  }

  restart(now: number): void {
    // Durable state survives; everything volatile starts over.
    this.role = 'follower';
    this.leaderId = null;
    this.commitIndex = 0;
    this.votes.clear();
    this.nextIndex.fill(1);
    this.matchIndex.fill(0);
    this.resetElectionTimer(now);
  }

  private becomeFollower(now: number): void {
    if (this.role === 'follower') return;
    const was = this.role;
    this.role = 'follower';
    this.votes.clear();
    this.resetElectionTimer(now);
    if (was === 'leader') {
      this.onEvent({ tick: now, node: this.id, kind: 'step-down', term: this.currentTerm });
    }
  }

  private startElection(now: number): Envelope<RaftMessage>[] {
    this.currentTerm += 1;
    this.role = 'candidate';
    this.votedFor = this.id;
    this.leaderId = null;
    this.votes = new Set([this.id]);
    this.resetElectionTimer(now);
    this.onEvent({ tick: now, node: this.id, kind: 'candidate', term: this.currentTerm });

    if (this.votes.size >= this.majority) return this.becomeLeader(now);

    const request: RaftMessage = {
      type: 'RequestVote',
      term: this.currentTerm,
      lastLogIndex: this.lastIndex(),
      lastLogTerm: this.termAt(this.lastIndex()),
    };
    return this.peers().map((to) => ({ to, msg: request }));
  }

  private onRequestVote(
    from: number,
    msg: Extract<RaftMessage, { type: 'RequestVote' }>,
    now: number,
  ): Envelope<RaftMessage>[] {
    // The election restriction: vote only for a candidate whose log is at
    // least as up to date as ours, so a leader always holds every committed
    // entry.
    const myLastTerm = this.termAt(this.lastIndex());
    const upToDate =
      msg.lastLogTerm > myLastTerm ||
      (msg.lastLogTerm === myLastTerm && msg.lastLogIndex >= this.lastIndex());
    const granted =
      msg.term === this.currentTerm &&
      (this.votedFor === null || this.votedFor === from) &&
      upToDate;

    if (granted) {
      this.votedFor = from;
      this.resetElectionTimer(now);
    }
    return [
      { to: from, msg: { type: 'RequestVoteReply', term: this.currentTerm, granted } },
    ];
  }

  private onRequestVoteReply(
    from: number,
    msg: Extract<RaftMessage, { type: 'RequestVoteReply' }>,
    now: number,
  ): Envelope<RaftMessage>[] {
    if (this.role !== 'candidate' || msg.term !== this.currentTerm || !msg.granted) {
      return [];
    }
    this.votes.add(from);
    return this.votes.size >= this.majority ? this.becomeLeader(now) : [];
  }

  private becomeLeader(now: number): Envelope<RaftMessage>[] {
    this.role = 'leader';
    this.leaderId = this.id;
    this.nextIndex.fill(this.lastIndex() + 1);
    this.matchIndex.fill(0);

    // A leader may only count replicas of entries from its own term (see
    // advanceCommitIndex), so it appends a no-op to commit anything earlier
    // terms left behind.
    this.log.push({ term: this.currentTerm, command: null });
    this.matchIndex[this.id] = this.lastIndex();
    this.onEvent({ tick: now, node: this.id, kind: 'leader', term: this.currentTerm });

    this.advanceCommitIndex();
    return this.broadcastAppend(now);
  }

  private appendFor(peer: number): Envelope<RaftMessage> {
    const prevLogIndex = this.nextIndex[peer] - 1;
    return {
      to: peer,
      msg: {
        type: 'AppendEntries',
        term: this.currentTerm,
        prevLogIndex,
        prevLogTerm: this.termAt(prevLogIndex),
        entries: this.log.slice(prevLogIndex, prevLogIndex + this.config.maxBatch),
        leaderCommit: this.commitIndex,
      },
    };
  }

  private broadcastAppend(now: number): Envelope<RaftMessage>[] {
    this.heartbeatDue = now + this.config.heartbeatInterval;
    return this.peers().map((peer) => this.appendFor(peer));
  }

  private onAppendEntries(
    from: number,
    msg: Extract<RaftMessage, { type: 'AppendEntries' }>,
    now: number,
  ): Envelope<RaftMessage>[] {
    const reject = (): Envelope<RaftMessage>[] => [
      {
        to: from,
        msg: {
          type: 'AppendEntriesReply',
          term: this.currentTerm,
          success: false,
          matchIndex: 0,
          lastLogIndex: this.lastIndex(),
        },
      },
    ];

    if (msg.term < this.currentTerm) return reject();

    // A valid leader for this term exists: a candidate gives up, and every
    // follower restarts its election timer.
    if (this.role === 'candidate') this.becomeFollower(now);
    this.leaderId = from;
    this.resetElectionTimer(now);

    // Log matching: accept only if our log holds the entry right before the
    // new ones, with the same term.
    if (
      msg.prevLogIndex > this.lastIndex() ||
      this.termAt(msg.prevLogIndex) !== msg.prevLogTerm
    ) {
      return reject();
    }

    // Append, truncating only at a real conflict: an old or reordered
    // message must never cut off entries a newer one already added.
    msg.entries.forEach((entry, k) => {
      const index = msg.prevLogIndex + 1 + k;
      if (index <= this.lastIndex()) {
        if (this.termAt(index) === entry.term) return;
        this.log.length = index - 1;
      }
      this.log.push({ ...entry });
    });

    const matchIndex = msg.prevLogIndex + msg.entries.length;
    if (msg.leaderCommit > this.commitIndex) {
      this.commitIndex = Math.max(
        this.commitIndex,
        Math.min(msg.leaderCommit, matchIndex),
      );
    }
    return [
      {
        to: from,
        msg: {
          type: 'AppendEntriesReply',
          term: this.currentTerm,
          success: true,
          matchIndex,
          lastLogIndex: this.lastIndex(),
        },
      },
    ];
  }

  private onAppendEntriesReply(
    from: number,
    msg: Extract<RaftMessage, { type: 'AppendEntriesReply' }>,
    _now: number,
  ): Envelope<RaftMessage>[] {
    if (this.role !== 'leader' || msg.term !== this.currentTerm) return [];

    if (msg.success) {
      this.matchIndex[from] = Math.max(this.matchIndex[from], msg.matchIndex);
      this.nextIndex[from] = this.matchIndex[from] + 1;
      this.advanceCommitIndex();
      // Keep sending while the follower is behind.
      return this.nextIndex[from] <= this.lastIndex() ? [this.appendFor(from)] : [];
    }

    // Back up and retry, never below what the follower is known to match.
    this.nextIndex[from] = Math.max(
      this.matchIndex[from] + 1,
      Math.min(this.nextIndex[from] - 1, msg.lastLogIndex + 1),
    );
    return [this.appendFor(from)];
  }

  /**
   * Commit the highest index stored on a majority, counting only entries
   * from the current term (Raft section 5.4.2, Figure 8): an entry from an
   * earlier term can sit on a majority and still be overwritten, so it is
   * committed only indirectly, by a later entry of the leader's own term.
   */
  private advanceCommitIndex(): void {
    for (let n = this.lastIndex(); n > this.commitIndex; n--) {
      if (this.termAt(n) < this.currentTerm) break;
      if (this.termAt(n) !== this.currentTerm) continue;
      const replicas = this.matchIndex.filter((m) => m >= n).length;
      if (replicas >= this.majority) {
        this.commitIndex = n;
        return;
      }
    }
  }
}
