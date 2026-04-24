import { useRef } from 'react';
import gsap from 'gsap';
import { useGSAP } from '@gsap/react';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { SplitText } from 'gsap/SplitText';

gsap.registerPlugin(ScrollTrigger, SplitText);

const COPY = `Cluster-Lab is a sandbox for distributed systems. You'll spin up nodes, break them, partition the network, and watch consensus recover — or fail — in real time. The goal isn't to memorize algorithms; it's to build the instinct for when a system is lying to you.`;

export default function About() {
  const container = useRef<HTMLElement>(null);

  useGSAP(() => {
    const split = new SplitText('.about-copy', { type: 'words' });
    gsap.from(split.words, {
      scrollTrigger: {
        trigger: container.current,
        start: 'top top', end: 'bottom top',
        scrub: true, pin: true,
      },
      opacity: 0.1, filter: 'blur(6px)', stagger: 0.4, ease: 'none',
    });
  }, { scope: container });

  return (
    <section className="about" id="about" ref={container}>
      <div className="about-inner">
        <h2 className="about-kicker">About<span className="accent">.</span></h2>
        <p className="about-copy">{COPY}</p>
      </div>
    </section>
  );
}
