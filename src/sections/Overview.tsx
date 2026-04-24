import { useRef, type MouseEvent, type ReactNode } from 'react';
import gsap from 'gsap';
import { useGSAP } from '@gsap/react';
import ScrambleTextPlugin from 'gsap/ScrambleTextPlugin';
import Draggable from 'gsap/Draggable';
import InertiaPlugin from 'gsap/InertiaPlugin';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

gsap.registerPlugin(ScrambleTextPlugin, Draggable, InertiaPlugin, ScrollTrigger);

const CHARS = '!#*_?,/ABCDEFGHIJKLMNOPQRSTUVXYZabcdefghijklmnopqrstuvxyz';

const TOPICS: { name: string; body: ReactNode[] }[] = [
  {
    name: 'Consensus',
    body: [
      <p key="a">Distributed systems aren't magic — they're machines arguing about what happened. Raft and Paxos are the rulebooks that end the argument.</p>,
      <p key="b">Elect leaders, replicate logs, survive node failures. Watch an election tick-by-tick and kill the leader to force another.</p>,
      <p key="c">By the end you'll know why quorums are sacred and why split-brain is terrifying.</p>,
    ],
  },
  {
    name: 'Replication',
    body: [
      <p key="a">Copy data across nodes and pray they agree. Learn the honest tradeoffs: strong vs. eventual, sync vs. async, primary-backup vs. multi-leader.</p>,
      <p key="b">Partition the network mid-write and watch CAP stop being a theorem and start being a very real problem.</p>,
      <p key="c">You'll leave with a gut feel for when "eventually consistent" is a feature and when it's a bug.</p>,
    ],
  },
  {
    name: 'Failure Detection',
    body: [
      <p key="a">Is that node dead, or just slow? The whole field exists because you can't tell. Heartbeats, timeouts, gossip, SWIM.</p>,
      <p key="b">Tune detection intervals and see false positives cascade into unnecessary leader elections. Feel the pain of getting it wrong.</p>,
      <p key="c">Coming soon — check back!</p>,
    ],
  },
];

export default function Overview() {
  const container = useRef<HTMLDivElement>(null);

  const { contextSafe } = useGSAP(() => {
    Draggable.create('.card__container', {
      type: 'x,y', inertia: true, bounds: container.current,
      cursor: 'default', zIndexBoost: true, allowEventDefault: true,
    });
    gsap.set('.card__container', { display: 'none', opacity: 1 });
  }, { scope: container });

  const scrambleOnly = contextSafe((e: MouseEvent<HTMLButtonElement>) => {
    const scramble = e.currentTarget.querySelector('.text__scramble');
    if (!scramble) return;
    if (gsap.isTweening(scramble)) return;
    gsap.to(scramble, {
      duration: 0.4, ease: 'none',
      scrambleText: { text: scramble.textContent || '', speed: 4, chars: CHARS },
    });
  });

  const openModal = contextSafe((e: MouseEvent<HTMLButtonElement>) => {
    const target = e.currentTarget;
    const modal = target.parentElement?.querySelector('.card__container');
    const scramble = target.querySelector('.text__scramble');
    if (!modal || !scramble) return;
    gsap.killTweensOf(scramble);
    gsap.to(scramble, {
      duration: 0.4, ease: 'none',
      scrambleText: { text: scramble.textContent || '', speed: 4, chars: CHARS },
    });
    gsap.fromTo(modal,
      { opacity: 0, scaleX: 0.9, scaleY: 0.9, display: 'flex' },
      { opacity: 1, scaleX: 1, scaleY: 1, ease: 'power4.out', duration: 0.25 });
  });

  const handleClose = contextSafe((e: MouseEvent<HTMLButtonElement>) => {
    const li = e.currentTarget.closest('li');
    const modal = e.currentTarget.closest('.card__container');
    if (!li || !modal) return;
    const scramble = li.querySelector('.text__scramble');
    if (scramble) {
      gsap.killTweensOf(scramble);
      gsap.to(scramble, {
        duration: 0.4, ease: 'none',
        scrambleText: { text: scramble.textContent || '', speed: 4, chars: CHARS, rightToLeft: true },
      });
    }
    gsap.to(modal, { opacity: 0, scale: 0.9, display: 'none', ease: 'power4.out', duration: 0.25 });
  });

  return (
    <div ref={container} className="overview-wrap">
      <section className="modules section-bg section-fade-bottom" id="overview">
        <h2>Our content<span className="accent">.</span></h2>
        <p className="lead">Click any topic for an overview of what you'll learn in the cluster simulator.</p>
        <ul className="mlist">
          {TOPICS.map((t) => (
            <li key={t.name} className="mitem">
              <button className="mbtn" type="button" onClick={openModal} onMouseEnter={scrambleOnly}>
                <span className="arrow">&gt;</span>
                <span className="name text__scramble">{t.name}</span>
              </button>
              <article className="card__container">
                <h3>{t.name}</h3>
                <div className="card__body">{t.body}</div>
                <button className="close" type="button" onClick={handleClose}>Close</button>
              </article>
            </li>
          ))}
        </ul>
        <span className="overview-foot">What will you learn?</span>
      </section>
    </div>
  );
}
