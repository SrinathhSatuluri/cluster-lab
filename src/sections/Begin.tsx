import { useRef } from 'react';
import gsap from 'gsap';
import { useGSAP } from '@gsap/react';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

gsap.registerPlugin(ScrollTrigger);

const CARDS = [
  { n: '01', name: 'Raft Consensus', level: 'Beginner', desc: 'Elect leaders, replicate logs, kill nodes.', target: '#' },
  { n: '02', name: 'Gossip & SWIM', level: 'Intermediate', desc: 'Epidemic failure detection at scale.', target: '#' },
  { n: '03', name: 'Sharded KV Store', level: 'Advanced', desc: 'Consistent hashing, hot-key mitigation.', target: '#' },
];

export default function Begin() {
  const container = useRef<HTMLElement>(null);

  useGSAP(() => {
    gsap.fromTo('.begin-card',
      { clipPath: 'inset(100% 0 0 0)', opacity: 0, y: 40 },
      {
        scrollTrigger: { trigger: container.current, start: 'top 75%' },
        clipPath: 'inset(0%)', opacity: 1, y: 0,
        duration: 0.9, ease: 'power4.out', stagger: 0.12,
      });
  }, { scope: container });

  return (
    <section className="begin section-bg section-fade-bottom" id="begin" ref={container}>
      <h2>Where will you begin<span className="accent">?</span></h2>
      <p className="lead">Pick a track. Each one drops you into a live simulator.</p>
      <div className="begin-grid">
        {CARDS.map((c) => (
          <a key={c.n} href={c.target} className="begin-card">
            <span className="begin-n">{c.n}</span>
            <span className="begin-name">{c.name}</span>
            <span className="begin-level">{c.level}</span>
            <p className="begin-desc">{c.desc}</p>
            <span className="begin-arrow">&gt;</span>
          </a>
        ))}
      </div>
    </section>
  );
}
