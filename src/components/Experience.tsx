import { useMemo, useEffect } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { EffectComposer, Bloom } from '@react-three/postprocessing';
import * as THREE from 'three';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { Observer } from 'gsap/Observer';
import { DitherEffect } from './DitherEffect';

gsap.registerPlugin(ScrollTrigger, Observer);

const COUNT = 420;
const BOUNDS = 4.5;
const MAX_SPEED = 2.2;
const NEIGHBOR_R = 1.2;
const SEPARATION_R = 0.35;

function seed(): { pos: Float32Array; vel: Float32Array } {
  const pos = new Float32Array(COUNT * 3);
  const vel = new Float32Array(COUNT * 3);
  for (let i = 0; i < COUNT; i++) {
    const r = 1.5 + Math.random() * 1.8;
    const th = Math.random() * Math.PI * 2;
    const ph = Math.acos(2 * Math.random() - 1);
    pos[i * 3] = r * Math.sin(ph) * Math.cos(th);
    pos[i * 3 + 1] = r * Math.sin(ph) * Math.sin(th);
    pos[i * 3 + 2] = r * Math.cos(ph);
    vel[i * 3] = (Math.random() - 0.5) * 1.2;
    vel[i * 3 + 1] = (Math.random() - 0.5) * 1.2;
    vel[i * 3 + 2] = (Math.random() - 0.5) * 1.2;
  }
  return { pos, vel };
}

export default function Experience() {
  const { camera, size } = useThree();
  const { pos, vel } = useMemo(seed, []);

  const geom = useMemo(() => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    return g;
  }, [pos]);

  const mat = useMemo(() => new THREE.ShaderMaterial({
    uniforms: { uColor: { value: new THREE.Color('#6ef3c5') } },
    vertexShader: `
      void main() {
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        gl_PointSize = 5.5 * (300.0 / -mv.z);
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: `
      uniform vec3 uColor;
      void main() {
        vec2 c = gl_PointCoord - 0.5;
        float d = length(c);
        if (d > 0.5) discard;
        gl_FragColor = vec4(uColor, smoothstep(0.5, 0.0, d));
      }
    `,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  }), []);

  useEffect(() => {
    const xTo = gsap.quickTo(camera.position, 'x', { duration: 1.4, ease: 'power2.out' });
    const yTo = gsap.quickTo(camera.position, 'y', { duration: 1.4, ease: 'power2.out' });
    const obs = Observer.create({
      target: window,
      onMove: (e) => {
        if (e.x !== undefined && e.y !== undefined) {
          xTo((e.x / size.width - 0.5) * 1.6);
          yTo((e.y / size.height - 0.5) * -1.0);
        }
      },
    });
    const st = gsap.to(camera.position, {
      z: 5.5, ease: 'none',
      scrollTrigger: { start: 'top top', end: '900px top', scrub: true },
    });
    return () => { obs.kill(); st.kill(); };
  }, [camera, size]);

  useFrame((_, dtRaw) => {
    const dt = Math.min(dtRaw, 1 / 30);
    const nr2 = NEIGHBOR_R * NEIGHBOR_R;
    const sr2 = SEPARATION_R * SEPARATION_R;

    for (let i = 0; i < COUNT; i++) {
      const ix = i * 3, iy = ix + 1, iz = ix + 2;
      const px = pos[ix], py = pos[iy], pz = pos[iz];

      let avx = 0, avy = 0, avz = 0;
      let cx = 0, cy = 0, cz = 0;
      let sx = 0, sy = 0, sz = 0;
      let n = 0, sn = 0;

      for (let j = 0; j < COUNT; j++) {
        if (j === i) continue;
        const jx = j * 3;
        const dx = pos[jx] - px, dy = pos[jx + 1] - py, dz = pos[jx + 2] - pz;
        const d2 = dx * dx + dy * dy + dz * dz;
        if (d2 < nr2) {
          avx += vel[jx]; avy += vel[jx + 1]; avz += vel[jx + 2];
          cx += pos[jx]; cy += pos[jx + 1]; cz += pos[jx + 2];
          n++;
          if (d2 < sr2 && d2 > 0) {
            const inv = 1 / Math.sqrt(d2);
            sx -= dx * inv; sy -= dy * inv; sz -= dz * inv;
            sn++;
          }
        }
      }

      if (n > 0) {
        avx /= n; avy /= n; avz /= n;
        cx = cx / n - px; cy = cy / n - py; cz = cz / n - pz;
      }
      if (sn > 0) { sx /= sn; sy /= sn; sz /= sn; }

      const r2 = px * px + py * py + pz * pz;
      const boundK = r2 > BOUNDS * BOUNDS ? 0.9 : 0.0;

      vel[ix] += (avx * 0.9 + cx * 0.45 + sx * 1.6 - px * boundK) * dt;
      vel[iy] += (avy * 0.9 + cy * 0.45 + sy * 1.6 - py * boundK) * dt;
      vel[iz] += (avz * 0.9 + cz * 0.45 + sz * 1.6 - pz * boundK) * dt;

      const sp = Math.sqrt(vel[ix] * vel[ix] + vel[iy] * vel[iy] + vel[iz] * vel[iz]);
      if (sp > MAX_SPEED) {
        const k = MAX_SPEED / sp;
        vel[ix] *= k; vel[iy] *= k; vel[iz] *= k;
      }

      pos[ix] += vel[ix] * dt;
      pos[iy] += vel[iy] * dt;
      pos[iz] += vel[iz] * dt;
    }

    geom.attributes.position.needsUpdate = true;
  });

  const dither = useMemo(
    () => new DitherEffect({ bg: '#05070a', fg: '#6ef3c5', pixel: 3 }),
    []
  );

  return (
    <>
      <color attach="background" args={['#05070a']} />
      <points geometry={geom} material={mat} />

      <EffectComposer>
        <Bloom intensity={1.2} luminanceThreshold={0.05} luminanceSmoothing={0.3} mipmapBlur />
        <primitive object={dither} />
      </EffectComposer>
    </>
  );
}
