import { Suspense, useRef } from 'react';
import { Canvas } from '@react-three/fiber';
import gsap from 'gsap';
import { useGSAP } from '@gsap/react';
import ScrambleTextPlugin from 'gsap/ScrambleTextPlugin';
import TextPlugin from 'gsap/TextPlugin';
import Experience from '../components/Experience';
import Marquee from '../components/Marquee';

gsap.registerPlugin(ScrambleTextPlugin, TextPlugin);

export default function Hero() {
  const container = useRef<HTMLDivElement>(null);

  useGSAP(() => {
    const tl = gsap.timeline();
    tl.from('.cli__prompt', {
      duration: 0.6,
      scrambleText: { text: '{original}', chars: 'upperAndLowerCase' },
      ease: 'none',
    })
      .to('.cli__cmd', { delay: 0.3, duration: 0.9, text: './cluster.sh' })
      .fromTo('.stage', { clipPath: 'inset(100%)' }, {
        duration: 1, clipPath: 'inset(0%)', ease: 'power4.out',
      }, '<+=0.1')
      .from('.stage', { scale: 0.4, duration: 1.3, ease: 'power4.inOut' }, '-=1')
      .from('.marquee', {
        yPercent: -40, clipPath: 'inset(50% 0)', opacity: 0, skewX: '15deg',
        duration: 1, ease: 'power3.out',
      }, '-=0.6')
      .from('.text-hero', {
        opacity: 0, yPercent: 40, duration: 1.1, ease: 'power4.out', stagger: 0.1,
      }, '<')
      .from('.stage .cta', {
        opacity: 0, scale: 0.95, yPercent: 40, duration: 0.7, ease: 'power4.out',
      }, '<+=0.15');
  }, { scope: container });

  return (
    <div className="hero" ref={container}>
      <div className="hero-head">
        <h1 className="text-hero">Begin your <span className="tag">cluster</span> journey.</h1>
        <div className="brand-big text-hero">Cluster-Lab</div>
      </div>

      <div className="stage">
        <div className="label">CLUSTER <b>DEMO</b> &nbsp;·&nbsp; RENDER <b>ASCII</b> &nbsp;·&nbsp; MODE <b>PREVIEW</b></div>

        <Canvas
          dpr={[1, 2]}
          camera={{ position: [0, 0, 9], fov: 45 }}
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', zIndex: 1 }}
        >
          <ambientLight intensity={0.6} />
          <pointLight position={[5, 5, 5]} intensity={2} color="#6ef3c5" />
          <Suspense fallback={null}>
            <Experience />
          </Suspense>
        </Canvas>

        <span className="cli-overlay">
          <span className="prompt cli__prompt">user@cluster-lab</span>
          <span className="prompt">:</span>
          <span>~$ </span>
          <span className="cli__cmd"></span>
          <span className="caret"></span>
        </span>

        <div className="cta">
          <a className="btn" href="#modules">Try It Now</a>
          <a className="btn ghost" href="#">Login</a>
        </div>
      </div>

      <Marquee>
        <span>Consensus</span>
        <span>Replication</span>
        <span>Failure Detection</span>
        <span>Partition Tolerance</span>
        <span>Gossip</span>
        <span>Sharding</span>
      </Marquee>
    </div>
  );
}
