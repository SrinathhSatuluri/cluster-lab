import { useEffect, useRef, useState, type ReactNode } from 'react';
import gsap from 'gsap';
import { useGSAP } from '@gsap/react';

export default function Marquee({ children, className = '' }: { children: ReactNode; className?: string }) {
  const container = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState(false);
  const [w, setW] = useState(0);

  useEffect(() => {
    document.fonts.ready.then(() => setReady(true));
  }, []);

  useEffect(() => {
    if (!ready || !container.current) return;
    const item = container.current.querySelector('.marquee__item') as HTMLElement | null;
    if (item) setW(item.clientWidth);
  }, [ready, children]);

  useGSAP(() => {
    if (!ready || !container.current || w <= 0) return;
    const wrap = gsap.utils.wrap(-w, 0);
    const xSet = gsap.quickTo(container.current, 'x', {
      duration: 0.5, ease: 'power4.out',
      modifiers: { x: gsap.utils.unitize(wrap) },
    });

    let value = 0;
    let direction = 1;
    let lastY = window.scrollY;
    let lastT = performance.now();
    let velocity = 0;
    const CONST_VEL = 1;
    const MAX = 10;

    let raf = 0;
    const tick = () => {
      const now = performance.now();
      const dt = Math.max(1, now - lastT);
      const dy = window.scrollY - lastY;
      velocity = (dy / dt) * 16;
      if (dy > 0) direction = 1;
      else if (dy < 0) direction = -1;
      lastY = window.scrollY; lastT = now;
      value = value + gsap.utils.clamp(-MAX, MAX, velocity) + CONST_VEL * direction;
      xSet(value);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, { dependencies: [ready, w] });

  return (
    <div aria-hidden className={`marquee ${className}`}>
      <div ref={container} className="marquee-track">
        <div className="marquee__item">{children}</div>
        <div className="marquee__item">{children}</div>
      </div>
    </div>
  );
}
