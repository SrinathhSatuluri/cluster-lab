// The in-browser Raft simulator: a five-node cluster on the seeded,
// tick-based network, with controls to inject faults mid-write and a live
// view of Raft's safety invariants.
//
// The page holds a RaftCluster and an InvariantChecker and steps them on
// animation frames. Every fault and write goes through the cluster's action
// log, so the run can be replayed from its seed, and rewound to any tick by
// replaying up to it.

import { useCallback, useEffect, useRef, useState } from 'react';
import { RaftCluster, type Action, type Write } from '../sim/cluster.ts';
import { InvariantChecker, INVARIANTS, type Violation } from '../sim/checker.ts';
import type { InFlight } from '../sim/network.ts';
import type { RaftMessage, RaftNode } from '../sim/raft.ts';
import './lab.css';

const SIZE = 5;
const SPEEDS = [2, 5, 10, 25];
const TERM_COLORS = [
  '#6ef3c5', '#7aa2ff', '#f5c76b', '#ff8fa3',
  '#b892ff', '#5fd4f0', '#9be36b', '#ff9f5a',
];
const LOG_WINDOW = 18;

const VIEW = 440;
const CENTER = VIEW / 2;
const RING = 150;
const NODE_R = 32;

interface Sim {
  cluster: RaftCluster;
  checker: InvariantChecker;
}

function newSim(seed: number): Sim {
  return { cluster: new RaftCluster(seed, { size: SIZE }), checker: new InvariantChecker() };
}

/** Rebuild a run from its seed and actions up to `until`, re-checking every tick. */
function rebuild(seed: number, actions: readonly Action[], until: number): Sim {
  const checker = new InvariantChecker();
  const cluster = RaftCluster.replay(seed, actions, until, { size: SIZE }, (c) => {
    checker.check(c);
  });
  return { cluster, checker };
}

function fingerprint(cluster: RaftCluster): string {
  return cluster.nodes
    .map(
      (n) =>
        `${n.role}${n.currentTerm}/${n.votedFor}/${n.commitIndex}/` +
        n.log.map((e) => `${e.term}${e.command}`).join(','),
    )
    .join('|');
}

function nodePosition(id: number) {
  const angle = -Math.PI / 2 + (id * 2 * Math.PI) / SIZE;
  return { x: CENTER + RING * Math.cos(angle), y: CENTER + RING * Math.sin(angle) };
}

function termColor(term: number) {
  return TERM_COLORS[(term - 1 + TERM_COLORS.length) % TERM_COLORS.length];
}

function messageClass(m: RaftMessage): string {
  switch (m.type) {
    case 'RequestVote':
      return 'msg vote';
    case 'RequestVoteReply':
      return m.granted ? 'msg vote-yes' : 'msg vote-no';
    case 'AppendEntries':
      return m.entries.length > 0 ? 'msg append' : 'msg heartbeat';
    case 'AppendEntriesReply':
      return m.success ? 'msg ack' : 'msg nack';
  }
}

function randomSeed() {
  return Math.floor(Math.random() * 100000);
}

export default function RaftLab() {
  const [seed, setSeed] = useState(() => {
    const fromUrl = Number(new URLSearchParams(location.hash.split('?')[1]).get('seed'));
    return Number.isFinite(fromUrl) && fromUrl > 0 ? fromUrl : 42;
  });
  const sim = useRef<Sim>(newSim(seed));
  const [, setVersion] = useState(0);
  const rerender = useCallback(() => setVersion((v) => v + 1), []);

  const [playing, setPlaying] = useState(true);
  const [speed, setSpeed] = useState(5);
  const [note, setNote] = useState<string | null>(null);
  const [writeCount, setWriteCount] = useState(0);
  const frac = useRef(0); // progress through the current tick, for animation

  const { cluster, checker } = sim.current;

  const step = useCallback(() => {
    const { cluster: c, checker: k } = sim.current;
    c.step();
    k.check(c);
  }, []);

  // Advance the simulation on animation frames while playing.
  useEffect(() => {
    if (!playing) return;
    let last = performance.now();
    let raf = 0;
    const loop = (t: number) => {
      const elapsed = Math.min(t - last, 250);
      last = t;
      frac.current += (elapsed / 1000) * speed;
      while (frac.current >= 1) {
        frac.current -= 1;
        step();
      }
      rerender();
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [playing, speed, step, rerender]);

  const flash = (text: string) => {
    setNote(text);
    window.setTimeout(() => setNote((n) => (n === text ? null : n)), 3500);
  };

  // ---- controls -----------------------------------------------------------

  const restartWith = (next: number) => {
    setSeed(next);
    sim.current = newSim(next);
    frac.current = 0;
    setWriteCount(0);
    history.replaceState(null, '', `#/raft?seed=${next}`);
    rerender();
  };

  const write = () => {
    const n = writeCount + 1;
    setWriteCount(n);
    const w = cluster.write(`x=${n}`);
    flash(w ? `x=${n} sent to S${w.leader} at index ${w.index}` : 'No leader: write rejected');
    rerender();
  };

  const killLeader = () => {
    const leader = cluster.leader();
    if (!leader) return flash('No leader to kill');
    cluster.crash(leader.id);
    flash(`Killed leader S${leader.id}`);
    rerender();
  };

  const strandLeader = () => {
    const leader = cluster.leader();
    if (!leader) return flash('No leader to strand');
    const buddy = (leader.id + 1) % SIZE;
    const minority = [leader.id, buddy];
    const majority = cluster.nodes.map((n) => n.id).filter((id) => !minority.includes(id));
    cluster.partition([minority, majority]);
    flash(`Partitioned S${leader.id} and S${buddy} from the majority`);
    rerender();
  };

  const isolateLeader = () => {
    const leader = cluster.leader();
    if (!leader) return flash('No leader to isolate');
    cluster.partition([[leader.id]]);
    flash(`Isolated leader S${leader.id}`);
    rerender();
  };

  const heal = () => {
    cluster.heal();
    flash('Network healed');
    rerender();
  };

  const restartAll = () => {
    for (const node of cluster.nodes) cluster.restart(node.id);
    flash('Restarted every crashed node');
    rerender();
  };

  const toggleNode = (id: number) => {
    if (cluster.network.isUp(id)) {
      cluster.crash(id);
      flash(`Crashed S${id}`);
    } else {
      cluster.restart(id);
      flash(`Restarted S${id}`);
    }
    rerender();
  };

  const replay = () => {
    const replayed = rebuild(seed, cluster.actions, cluster.now);
    const same = fingerprint(replayed.cluster) === fingerprint(cluster);
    flash(
      same
        ? `Replayed ${cluster.now} ticks from seed ${seed} and ${cluster.actions.length} actions: identical`
        : 'Replay diverged',
    );
  };

  const rewind = (tick: number) => {
    const kept = cluster.actions.filter((a) => a.tick < tick);
    sim.current = rebuild(seed, kept, tick);
    frac.current = 0;
    rerender();
  };

  // ---- derived view state -------------------------------------------------

  const leader = cluster.leader();
  const groups = cluster.network.groups();
  const partitioned = groups.length > 1;
  const groupOf = new Map<number, number>();
  groups.forEach((g, i) => g.forEach((id) => groupOf.set(id, i)));

  const firstViolation = new Map<string, Violation>();
  for (const v of checker.violations) {
    if (!firstViolation.has(v.invariant)) firstViolation.set(v.invariant, v);
  }

  const recentWrites: Write[] = cluster.writes.slice(-6).reverse();
  const feed = [
    ...cluster.events.slice(-12).map((e) => ({
      tick: e.tick,
      text:
        e.kind === 'leader'
          ? `S${e.node} became leader of term ${e.term}`
          : e.kind === 'candidate'
            ? `S${e.node} started an election for term ${e.term}`
            : `S${e.node} stepped down in term ${e.term}`,
    })),
    ...cluster.actions.slice(-12).map((a) => ({
      tick: a.tick,
      text:
        a.kind === 'write'
          ? `client wrote ${a.command}`
          : a.kind === 'crash'
            ? `S${a.node} crashed`
            : a.kind === 'restart'
              ? `S${a.node} restarted`
              : a.kind === 'partition'
                ? `partition ${a.groups.map((g) => g.map((id) => `S${id}`).join(' ')).join(' | ')}`
                : a.kind === 'heal'
                  ? 'network healed'
                  : `drop rate ${a.rate}`,
    })),
  ]
    .sort((x, y) => y.tick - x.tick)
    .slice(0, 10);

  const longest = Math.max(1, ...cluster.nodes.map((n) => n.log.length));
  const firstShown = Math.max(1, longest - LOG_WINDOW + 1);

  return (
    <div className="lab">
      <header className="lab-head">
        <a className="lab-back" href="#">← Cluster-Lab</a>
        <h1>
          Raft <span className="accent">consensus</span>
        </h1>
        <p className="lab-sub">
          Five nodes, one seeded network. Kill the leader or partition it mid-write and watch the
          cluster elect, replicate and recover, tick by tick.
        </p>
      </header>

      <section className="lab-bar" aria-label="Simulation controls">
        <button type="button" onClick={() => setPlaying((p) => !p)}>
          {playing ? 'Pause' : 'Play'}
        </button>
        <button type="button" onClick={() => { step(); rerender(); }} disabled={playing}>
          Step
        </button>
        <label>
          Speed
          <select value={speed} onChange={(e) => setSpeed(Number(e.target.value))}>
            {SPEEDS.map((s) => (
              <option key={s} value={s}>{s} ticks/s</option>
            ))}
          </select>
        </label>
        <span className="lab-tick mono">tick {cluster.now}</span>
        <label className="lab-seed">
          Seed
          <input
            type="number"
            value={seed}
            min={1}
            onChange={(e) => {
              const v = Number(e.target.value);
              if (v > 0) restartWith(v);
            }}
          />
        </label>
        <button type="button" onClick={() => restartWith(randomSeed())}>New run</button>
        <button type="button" onClick={replay}>Replay</button>
      </section>

      <section className="lab-bar faults" aria-label="Writes and faults">
        <button type="button" className="primary" onClick={write}>Client write</button>
        <button type="button" onClick={killLeader}>Kill leader</button>
        <button type="button" onClick={strandLeader}>Partition leader into minority</button>
        <button type="button" onClick={isolateLeader}>Isolate leader</button>
        <button type="button" onClick={heal} disabled={!partitioned}>Heal network</button>
        <button type="button" onClick={restartAll}>Restart crashed</button>
        {note && <span className="lab-note">{note}</span>}
      </section>

      <div className="lab-grid">
        <section className="lab-panel ring" aria-label="Cluster">
          <svg viewBox={`0 0 ${VIEW} ${VIEW}`} role="img" aria-label="Five Raft nodes and the messages between them">
            {cluster.nodes.map((a) =>
              cluster.nodes
                .filter((b) => b.id > a.id)
                .map((b) => {
                  const pa = nodePosition(a.id);
                  const pb = nodePosition(b.id);
                  const cut = !cluster.network.canReach(a.id, b.id);
                  return (
                    <line
                      key={`${a.id}-${b.id}`}
                      x1={pa.x} y1={pa.y} x2={pb.x} y2={pb.y}
                      className={cut ? 'link cut' : 'link'}
                    />
                  );
                }),
            )}
            {cluster.network.messages().map((m: InFlight<RaftMessage>) => {
              const from = nodePosition(m.from);
              const to = nodePosition(m.to);
              const span = Math.max(1, m.deliverAt - m.sentAt);
              const t = Math.min(1, Math.max(0, (cluster.now + frac.current - m.sentAt) / span));
              return (
                <circle
                  key={m.id}
                  cx={from.x + (to.x - from.x) * t}
                  cy={from.y + (to.y - from.y) * t}
                  r={m.msg.type === 'AppendEntries' && m.msg.entries.length > 0 ? 6 : 4}
                  className={messageClass(m.msg)}
                />
              );
            })}
            {cluster.nodes.map((node) => (
              <NodeGlyph
                key={node.id}
                node={node}
                up={cluster.network.isUp(node.id)}
                now={cluster.now}
                group={partitioned ? groupOf.get(node.id) ?? 0 : null}
                stale={node.role === 'leader' && leader !== null && node.id !== leader.id}
                onClick={() => toggleNode(node.id)}
              />
            ))}
          </svg>
          <p className="lab-hint">
            Click a node to crash or restart it. {leader ? `Leader: S${leader.id}, term ${leader.currentTerm}.` : 'No leader.'}
          </p>
          <div className="lab-legend">
            <span><i className="msg vote" /> vote request</span>
            <span><i className="msg vote-yes" /> vote</span>
            <span><i className="msg append" /> entries</span>
            <span><i className="msg heartbeat" /> heartbeat</span>
            <span><i className="msg ack" /> ack</span>
          </div>
        </section>

        <section className="lab-panel" aria-label="Safety invariants">
          <h2>Invariants</h2>
          <p className="lab-small">Checked after every tick.</p>
          <ul className="invariants">
            {INVARIANTS.map((name) => {
              const v = firstViolation.get(name);
              return (
                <li key={name} className={v ? 'bad' : 'ok'}>
                  <span className="inv-mark">{v ? '✗' : '✓'}</span>
                  <span>
                    {name}
                    {v && <small>tick {v.tick}: {v.detail}</small>}
                  </span>
                </li>
              );
            })}
          </ul>

          <h2>Writes</h2>
          {recentWrites.length === 0 ? (
            <p className="lab-small">No writes yet. Send one, then fault the cluster.</p>
          ) : (
            <ul className="writes">
              {recentWrites.map((w) => (
                <li key={w.id}>
                  <span className="mono">{w.command}</span>
                  <span className="lab-small">S{w.leader} · index {w.index} · term {w.term}</span>
                  <span className={`pill ${w.status}`}>{w.status}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <section className="lab-panel logs" aria-label="Logs">
        <h2>Logs</h2>
        <p className="lab-small">
          Filled entries are committed; outlined entries are not yet. Colour is the term.
        </p>
        <div className="log-scroll">
          <table>
            <thead>
              <tr>
                <th />
                {Array.from({ length: Math.min(LOG_WINDOW, longest) }, (_, i) => (
                  <th key={i} className="mono">{firstShown + i}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {cluster.nodes.map((node) => (
                <tr key={node.id} className={cluster.network.isUp(node.id) ? '' : 'down'}>
                  <th className="mono">S{node.id}</th>
                  {Array.from({ length: Math.min(LOG_WINDOW, longest) }, (_, i) => {
                    const index = firstShown + i;
                    const entry = node.log[index - 1];
                    if (!entry) return <td key={i} />;
                    const committed = index <= node.commitIndex;
                    const color = termColor(entry.term);
                    return (
                      <td key={i}>
                        <span
                          className={`entry ${committed ? 'committed' : ''}`}
                          style={{ borderColor: color, background: committed ? color : 'transparent', color: committed ? '#000' : color }}
                          title={`index ${index}, term ${entry.term}${entry.command ? `, ${entry.command}` : ', no-op'}`}
                        >
                          {entry.command ?? '·'}
                        </span>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <div className="lab-grid">
        <section className="lab-panel" aria-label="Timeline">
          <h2>Timeline</h2>
          <p className="lab-small">
            The run is a pure function of the seed and the actions above, so rewinding replays it
            to the chosen tick and drops any action after it.
          </p>
          <input
            className="scrub"
            type="range"
            min={0}
            max={cluster.now}
            value={cluster.now}
            onChange={(e) => {
              setPlaying(false);
              rewind(Number(e.target.value));
            }}
            aria-label="Rewind to tick"
          />
          <p className="lab-small mono">
            seed {seed} · {cluster.actions.length} actions · {checker.committedEntries().length} entries committed
          </p>
        </section>

        <section className="lab-panel" aria-label="Events">
          <h2>Events</h2>
          <ul className="feed">
            {feed.map((f, i) => (
              <li key={i}>
                <span className="mono lab-small">t{f.tick}</span> {f.text}
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}

function NodeGlyph({
  node,
  up,
  now,
  group,
  stale,
  onClick,
}: {
  node: RaftNode;
  up: boolean;
  now: number;
  group: number | null;
  /** A leader that a newer term has replaced, though it does not know yet. */
  stale: boolean;
  onClick: () => void;
}) {
  const { x, y } = nodePosition(node.id);
  const state = up ? `${node.role}${stale ? ' stale' : ''}` : 'down';
  // How much of the election timeout is left, for followers and candidates.
  const remaining = Math.max(0, node.electionDeadline - now);
  const timer = up && node.role !== 'leader' ? Math.min(1, remaining / 30) : 0;
  const circumference = 2 * Math.PI * (NODE_R + 6);

  return (
    <g
      className={`node ${state}`}
      transform={`translate(${x} ${y})`}
      onClick={onClick}
      role="button"
      tabIndex={0}
      aria-label={`S${node.id}, ${stale ? 'stale leader' : up ? node.role : 'down'}, term ${node.currentTerm}. Click to ${up ? 'crash' : 'restart'}.`}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') onClick();
      }}
    >
      {timer > 0 && (
        <circle
          r={NODE_R + 6}
          className="timer"
          strokeDasharray={`${circumference * timer} ${circumference}`}
          transform="rotate(-90)"
        />
      )}
      <circle r={NODE_R} className="body" />
      <text y={-4} className="label">S{node.id}</text>
      <text y={14} className="term">
        {!up ? 'down' : stale ? `stale · t${node.currentTerm}` : `term ${node.currentTerm}`}
      </text>
      {group !== null && (
        <text y={NODE_R + 20} className="group">
          {String.fromCharCode(65 + group)}
        </text>
      )}
    </g>
  );
}
