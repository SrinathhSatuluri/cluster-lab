import { Suspense, useRef } from 'react';
import { Canvas } from '@react-three/fiber';
import gsap from 'gsap';
import { useGSAP } from '@gsap/react';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import ClusterGraph from '../components/ClusterGraph';
import { useInView } from '../hooks/useInView';

gsap.registerPlugin(ScrollTrigger);

const STATS = [
  { pos: 'tl', value: '$165K', header: 'Median distributed-systems salary', body: 'Companies pay for people who can reason about failure modes.' },
  { pos: 'tr', value: '92%', header: 'of Fortune 500 run sharded DBs', body: 'Every backend past a certain scale becomes a distributed problem.' },
  { pos: 'bl', value: '10⁹', header: 'requests/day at small startups', body: 'Modern traffic makes distribution inevitable — even for tiny teams.' },
  { pos: 'br', value: '1×', header: 'Learn once, apply everywhere', body: 'Kafka, Cassandra, Spanner, Kubernetes — they all rhyme.' },
];

export default function Benefits() {
  const container = useRef<HTMLElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const inView = useInView(stageRef);

  useGSAP(() => {
    gsap.from('.b-stage', {
      scrollTrigger: { trigger: container.current, start: 'top 70%' },
      scale: 0.8, opacity: 0, duration: 1.1, ease: 'power4.out',
    });
    gsap.utils.toArray<HTMLElement>('.b-stat').forEach((el, i) => {
      gsap.from(el, {
        scrollTrigger: { trigger: container.current, start: 'top 70%' },
        opacity: 0, y: 30, duration: 0.9, delay: 0.3 + i * 0.1, ease: 'power4.out',
      });
    });
  }, { scope: container });

  return (
    <section className="benefits section-bg section-fade-bottom" id="benefits" ref={container}>
      <h2>Why learn this<span className="accent">?</span></h2>
      <p className="lead">The backbone of every system at scale. Also, it pays.</p>

      <div className="b-grid">
        {STATS.map((s) => (
          <div key={s.pos} className={`b-stat b-${s.pos}`}>
            <div className="b-value">{s.value}</div>
            <div className="b-header">{s.header}</div>
            <p className="b-body">{s.body}</p>
          </div>
        ))}
        <div className="b-stage" ref={stageRef}>
          <Canvas
            dpr={[1, 1.5]}
            frameloop={inView ? 'always' : 'never'}
            camera={{ position: [0, 0, 8], fov: 45 }}
            style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}>
            <ambientLight intensity={0.6} />
            <Suspense fallback={null}><ClusterGraph /></Suspense>
          </Canvas>
          <div className="b-label">CLUSTER · N=8 · GOSSIP</div>
        </div>
      </div>
    </section>
  );
}
