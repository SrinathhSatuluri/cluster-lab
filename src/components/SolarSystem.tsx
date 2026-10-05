import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { EffectComposer, Bloom } from '@react-three/postprocessing';
import * as THREE from 'three';
import { DitherEffect } from './DitherEffect';

interface PlanetSpec {
  radius: number;
  size: number;
  speed: number;
  spin: number;
  incline: number;
  ring?: { inner: number; outer: number };
  moon?: { radius: number; size: number; speed: number };
}

const PLANETS: PlanetSpec[] = [
  { radius: 1.8, size: 0.16, speed: 0.85, spin: 0.5,  incline:  0.05 },
  { radius: 2.6, size: 0.30, speed: 0.55, spin: 0.4,  incline: -0.07,
    moon: { radius: 0.55, size: 0.10, speed: 1.8 } },
  { radius: 3.5, size: 0.24, speed: 0.40, spin: 0.45, incline:  0.09 },
  { radius: 4.5, size: 0.42, speed: 0.28, spin: 0.3,  incline:  0.00,
    ring: { inner: 0.58, outer: 0.92 } },
  { radius: 5.5, size: 0.20, speed: 0.20, spin: 0.5,  incline: -0.06 },
];

interface MeteorState {
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  life: number;
  maxLife: number;
}

const METEOR_COUNT = 7;
const SPAWN_RADIUS = 14;

function respawnMeteor(s: MeteorState) {
  const theta = Math.random() * Math.PI * 2;
  const phi = Math.acos(2 * Math.random() - 1);
  s.pos.set(
    SPAWN_RADIUS * Math.sin(phi) * Math.cos(theta),
    SPAWN_RADIUS * Math.cos(phi) * 0.5,
    SPAWN_RADIUS * Math.sin(phi) * Math.sin(theta),
  );
  const target = new THREE.Vector3(
    (Math.random() - 0.5) * 5,
    (Math.random() - 0.5) * 2.5,
    (Math.random() - 0.5) * 5,
  );
  s.vel.copy(target).sub(s.pos).normalize().multiplyScalar(8 + Math.random() * 8);
  s.life = 0;
  s.maxLife = 1.6 + Math.random() * 1.4;
}

export default function SolarSystem() {
  const groupRef = useRef<THREE.Group>(null);
  const sunRef = useRef<THREE.Mesh>(null);
  const planetRefs = useRef<Array<THREE.Group | null>>([]);
  const moonRefs = useRef<Array<THREE.Group | null>>([]);
  const meteorRefs = useRef<Array<THREE.Mesh | null>>([]);

  const phases = useMemo(() => PLANETS.map(() => Math.random() * Math.PI * 2), []);

  const meteorStates = useMemo<MeteorState[]>(() => {
    return Array.from({ length: METEOR_COUNT }, () => {
      const s: MeteorState = {
        pos: new THREE.Vector3(),
        vel: new THREE.Vector3(),
        life: 0,
        maxLife: 0,
      };
      respawnMeteor(s);
      s.life = Math.random() * s.maxLife;
      return s;
    });
  }, []);

  const _up = useMemo(() => new THREE.Vector3(0, 1, 0), []);
  const _quat = useMemo(() => new THREE.Quaternion(), []);
  const _dir = useMemo(() => new THREE.Vector3(), []);

  const dither = useMemo(
    () => new DitherEffect({ bg: '#000', fg: '#6ef3c5', pixel: 3 }),
    []
  );

  useFrame((state, dt) => {
    const t = state.clock.elapsedTime;

    if (groupRef.current) groupRef.current.rotation.y += dt * 0.04;
    if (sunRef.current) sunRef.current.rotation.y += dt * 0.2;

    PLANETS.forEach((p, i) => {
      const ref = planetRefs.current[i];
      if (ref) {
        const a = phases[i] + t * p.speed;
        ref.position.x = Math.cos(a) * p.radius;
        ref.position.z = Math.sin(a) * p.radius;
        ref.rotation.y += dt * p.spin;
      }
      if (p.moon) {
        const m = moonRefs.current[i];
        if (m) {
          const ma = phases[i] * 1.7 + t * p.moon.speed;
          m.position.x = Math.cos(ma) * p.moon.radius;
          m.position.z = Math.sin(ma) * p.moon.radius;
        }
      }
    });

    meteorStates.forEach((s, i) => {
      s.life += dt;
      if (s.life > s.maxLife) respawnMeteor(s);
      s.pos.addScaledVector(s.vel, dt);
      const ref = meteorRefs.current[i];
      if (ref) {
        ref.position.copy(s.pos);
        _dir.copy(s.vel).normalize();
        _quat.setFromUnitVectors(_up, _dir);
        ref.quaternion.copy(_quat);
      }
    });
  });

  return (
    <>
      <color attach="background" args={['#000']} />
      <ambientLight intensity={0.25} />
      <pointLight position={[0, 0, 0]} intensity={6.0} color="#6ef3c5" distance={18} decay={1.4} />

      <group ref={groupRef} position={[0, -0.9, 0]} rotation={[0.55, 0, 0]}>
        <mesh ref={sunRef}>
          <sphereGeometry args={[0.9, 64, 64]} />
          <meshBasicMaterial color="#cdf6e1" />
        </mesh>

        {PLANETS.map((p, i) => (
          <group key={`o-${i}`} rotation={[0, 0, p.incline]}>
            <mesh rotation={[Math.PI / 2, 0, 0]}>
              <ringGeometry args={[p.radius - 0.012, p.radius + 0.012, 160]} />
              <meshBasicMaterial color="#6ef3c5" transparent opacity={0.35} side={THREE.DoubleSide} />
            </mesh>
            <group ref={(el) => { planetRefs.current[i] = el; }}>
              <mesh>
                <sphereGeometry args={[p.size, 40, 40]} />
                <meshStandardMaterial color="#9ef0d0" roughness={0.7} metalness={0.1} />
              </mesh>
              {p.ring && (
                <mesh rotation={[Math.PI / 2.3, 0, 0.25]}>
                  <ringGeometry args={[p.ring.inner, p.ring.outer, 96]} />
                  <meshStandardMaterial
                    color="#6ef3c5"
                    side={THREE.DoubleSide}
                    transparent
                    opacity={0.8}
                  />
                </mesh>
              )}
              {p.moon && (
                <group ref={(el) => { moonRefs.current[i] = el; }}>
                  <mesh>
                    <sphereGeometry args={[p.moon.size, 24, 24]} />
                    <meshStandardMaterial color="#c8f3da" roughness={0.8} />
                  </mesh>
                </group>
              )}
            </group>
          </group>
        ))}
      </group>

      {meteorStates.map((_, i) => (
        <mesh key={`m-${i}`} ref={(el) => { meteorRefs.current[i] = el; }}>
          <cylinderGeometry args={[0.0, 0.07, 0.7, 8]} />
          <meshBasicMaterial color="#cdf6e1" />
        </mesh>
      ))}

      <EffectComposer>
        <Bloom intensity={1.2} luminanceThreshold={0.05} luminanceSmoothing={0.3} mipmapBlur />
        <primitive object={dither} />
      </EffectComposer>
    </>
  );
}
