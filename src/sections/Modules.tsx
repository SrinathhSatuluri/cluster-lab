import { useRef } from 'react';
import gsap from 'gsap';
import { useGSAP } from '@gsap/react';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

gsap.registerPlugin(ScrollTrigger);

const MODULES = [
  { n: '01', name: 'Raft Consensus', desc: 'Leader election, log replication, safety proofs — all interactive.' },
  { n: '02', name: 'Gossip & SWIM', desc: 'Epidemic failure detection. Tune fanout, watch convergence.' },
  { n: '03', name: 'Sharded KV Store', desc: 'Consistent hashing, rebalancing, hot-key mitigation.' },
  { n: '04', name: 'Vector Clocks & CRDTs', desc: 'Reason about concurrent edits without a coordinator.' },
  { n: '05', name: 'CAP in Practice', desc: 'Partition the network live and watch the tradeoff bite.' },
];

export default function Modules() {
  const container = useRef<HTMLElement>(null);

  useGSAP(() => {
    gsap.utils.toArray<HTMLElement>('.module-row').forEach((el) => {
      gsap.from(el, {
        scrollTrigger: { trigger: el, start: 'top 85%' },
        opacity: 0, x: -40, duration: 0.7, ease: 'power3.out',
      });
    });
  }, { scope: container });

  return (
    <section className="modules-list section-bg section-fade-bottom" id="modules" ref={container}>
      <h2>Modules<span className="accent">.</span></h2>
      <p className="lead">Five tracks. Each one runs on a live cluster simulator in your browser.</p>
      <ul className="mod-rows">
        {MODULES.map((m) => (
          <li key={m.n} className="module-row">
            <span className="mod-n">{m.n}</span>
            <span className="mod-name">{m.name}</span>
            <span className="mod-desc">{m.desc}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
