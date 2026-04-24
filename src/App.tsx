import { useEffect } from 'react';
import Lenis from 'lenis';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import ScrambleLink from './components/ScrambleLink';
import Hero from './sections/Hero';
import About from './sections/About';
import Overview from './sections/Overview';
import Benefits from './sections/Benefits';
import Modules from './sections/Modules';

gsap.registerPlugin(ScrollTrigger);

export default function App() {
  useEffect(() => {
    const lenis = new Lenis({ smoothWheel: true, lerp: 0.1 });
    lenis.on('scroll', ScrollTrigger.update);
    gsap.ticker.add((time) => lenis.raf(time * 1000));
    gsap.ticker.lagSmoothing(0);
    return () => { lenis.destroy(); };
  }, []);

  return (
    <>
      <nav>
        <div className="brand">Cluster-Lab<span className="accent">.</span></div>
        <ul className="nav-center">
          <li><ScrambleLink href="#about">About</ScrambleLink></li>
          <li><ScrambleLink href="#overview">Overview</ScrambleLink></li>
          <li><ScrambleLink href="#benefits">Benefits</ScrambleLink></li>
          <li><ScrambleLink href="#modules">Modules</ScrambleLink></li>
        </ul>
        <div className="nav-spacer" />
      </nav>
      <Hero />
      <About />
      <Overview />
      <Benefits />
      <Modules />
      <footer>
        <span>© Cluster-Lab — a demo</span>
        <span className="accent">v0.1.0</span>
      </footer>
    </>
  );
}
