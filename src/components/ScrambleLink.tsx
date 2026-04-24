import { useRef } from 'react';
import gsap from 'gsap';
import { useGSAP } from '@gsap/react';
import ScrambleTextPlugin from 'gsap/ScrambleTextPlugin';

gsap.registerPlugin(ScrambleTextPlugin);

const CHARS = '!#*_?,/ABCDEFGHIJKLMNOPQRSTUVXYZabcdefghijklmnopqrstuvxyz';

export default function ScrambleLink({ href, children }: { href: string; children: string }) {
  const ref = useRef<HTMLAnchorElement>(null);
  const tl = useRef<gsap.core.Tween | null>(null);

  const { contextSafe } = useGSAP(() => {}, { scope: ref });

  const onEnter = contextSafe(() => {
    if (!ref.current) return;
    if (tl.current?.isActive()) return;
    tl.current = gsap.to(ref.current, {
      duration: 0.3, ease: 'none',
      scrambleText: { text: children, chars: CHARS, speed: 5 },
    });
  });

  return (
    <a ref={ref} href={href} onMouseEnter={onEnter} className="nav-link">{children}</a>
  );
}
