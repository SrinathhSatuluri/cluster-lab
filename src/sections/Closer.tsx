import { Suspense, useRef, type MouseEvent } from 'react';
import { Canvas } from '@react-three/fiber';
import gsap from 'gsap';
import { useGSAP } from '@gsap/react';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import ScrambleTextPlugin from 'gsap/ScrambleTextPlugin';
import SolarSystem from '../components/SolarSystem';
import { useInView } from '../hooks/useInView';

gsap.registerPlugin(ScrollTrigger, ScrambleTextPlugin);

const CHARS = '!#*_?,/ABCDEFGHIJKLMNOPQRSTUVXYZabcdefghijklmnopqrstuvxyz';

export default function Closer() {
  const container = useRef<HTMLElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const inView = useInView(stageRef);

  const { contextSafe } = useGSAP(() => {
    gsap.fromTo('.closer-stage',
      { yPercent: 50, scale: 1.5, rotate: -100 },
      {
        yPercent: 0, scale: 1, rotate: 0, ease: 'none',
        scrollTrigger: {
          trigger: container.current,
          start: 'top bottom', end: 'top top', scrub: 1.2,
        },
      });
    gsap.to('.closer-text', {
      opacity: 0, yPercent: 30, rotate: 3, scale: 0.9, filter: 'blur(8px)',
      ease: 'none',
      scrollTrigger: {
        trigger: container.current,
        start: 'top+=10% top', end: 'bottom top', scrub: true,
      },
    });
  }, { scope: container });

  const scramble = contextSafe((e: MouseEvent<HTMLSpanElement>) => {
    const el = e.currentTarget;
    if (gsap.isTweening(el)) return;
    gsap.to(el, {
      duration: 0.4, ease: 'none',
      scrambleText: { text: el.textContent || '', chars: CHARS, speed: 4 },
    });
  });

  return (
    <section className="closer" ref={container}>
      <div className="closer-stage" ref={stageRef}>
        <Canvas
          dpr={[1, 1.5]}
          frameloop={inView ? 'always' : 'never'}
          camera={{ position: [0, 0, 10], fov: 45 }}>
          <Suspense fallback={null}><SolarSystem /></Suspense>
        </Canvas>
      </div>
      <h2 className="closer-text">
        <span onMouseEnter={scramble}>Welcome to the world of </span>
        <span className="closer-emph" onMouseEnter={scramble}>distributed systems</span>
        <span onMouseEnter={scramble}>.</span>
      </h2>
    </section>
  );
}
