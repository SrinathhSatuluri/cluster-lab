import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { EffectComposer, Bloom } from '@react-three/postprocessing';
import * as THREE from 'three';
import { AsciiEffect } from './AsciiEffect';

export default function ClusterGraph() {
  const meshRef = useRef<THREE.Mesh>(null);
  const ascii = useMemo(() => new AsciiEffect(), []);

  const mat = useMemo(() => new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uColor: { value: new THREE.Color('#6ef3c5') },
      uSea: { value: new THREE.Color('#06161a') },
    },
    vertexShader: `
      varying vec3 vPos;
      varying vec3 vNormal;
      void main() {
        vPos = position;
        vNormal = normalize(normalMatrix * normal);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      varying vec3 vPos;
      varying vec3 vNormal;
      uniform vec3 uColor;
      uniform vec3 uSea;
      uniform float uTime;

      float hash(vec3 p) {
        p = fract(p * 0.3183099 + vec3(0.1, 0.2, 0.3));
        p *= 17.0;
        return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
      }
      float noise(vec3 p) {
        vec3 i = floor(p), f = fract(p);
        f = f * f * (3.0 - 2.0 * f);
        return mix(
          mix(mix(hash(i), hash(i + vec3(1,0,0)), f.x),
              mix(hash(i + vec3(0,1,0)), hash(i + vec3(1,1,0)), f.x), f.y),
          mix(mix(hash(i + vec3(0,0,1)), hash(i + vec3(1,0,1)), f.x),
              mix(hash(i + vec3(0,1,1)), hash(i + vec3(1,1,1)), f.x), f.y),
          f.z);
      }
      float fbm(vec3 p) {
        float v = 0.0, a = 0.5;
        for (int i = 0; i < 5; i++) { v += a * noise(p); p *= 2.0; a *= 0.5; }
        return v;
      }

      void main() {
        float n = fbm(vPos * 1.8);
        float land = smoothstep(0.48, 0.56, n);
        float lit = max(0.0, dot(vNormal, normalize(vec3(0.6, 0.5, 0.8))));
        lit = 0.25 + lit * 0.9;
        vec3 col = mix(uSea, uColor, land) * lit;
        gl_FragColor = vec4(col, 1.0);
      }
    `,
  }), []);

  useFrame((_, dt) => {
    if (meshRef.current) meshRef.current.rotation.y += dt * 0.25;
  });

  return (
    <>
      <color attach="background" args={['#05070a']} />
      <ambientLight intensity={0.3} />
      <pointLight position={[5, 3, 5]} intensity={2} color="#6ef3c5" />
      <mesh ref={meshRef} rotation={[0.25, 0, 0.15]}>
        <sphereGeometry args={[2.1, 96, 96]} />
        <primitive object={mat} attach="material" />
      </mesh>
      <EffectComposer>
        <Bloom intensity={0.9} luminanceThreshold={0.05} luminanceSmoothing={0.3} mipmapBlur />
        <primitive object={ascii} />
      </EffectComposer>
    </>
  );
}
