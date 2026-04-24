import { Effect } from 'postprocessing';
import { Uniform } from 'three';

const fragment = `
uniform float uTime;
uniform float uAberration;
uniform float uScanline;
uniform float uVignette;

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
  // chromatic aberration — sample R/G/B at slightly offset UVs, radially
  vec2 dir = uv - 0.5;
  float dist = length(dir);
  vec2 off = normalize(dir) * dist * uAberration;
  float r = texture2D(inputBuffer, uv - off).r;
  float g = texture2D(inputBuffer, uv).g;
  float b = texture2D(inputBuffer, uv + off).b;
  vec3 col = vec3(r, g, b);

  // scanlines
  float sc = sin(uv.y * resolution.y * 1.2 + uTime * 4.0) * 0.5 + 0.5;
  col *= mix(1.0, 0.82 + 0.18 * sc, uScanline);

  // grain
  col += (hash(uv * resolution + uTime) - 0.5) * 0.035;

  // vignette
  float v = smoothstep(0.9, 0.3, dist);
  col *= mix(1.0, v, uVignette);

  // accent tint lift in shadows
  vec3 accent = vec3(0.43, 0.95, 0.77);
  float lum = dot(col, vec3(0.299, 0.587, 0.114));
  col = mix(col, col + accent * 0.06, 1.0 - smoothstep(0.0, 0.4, lum));

  outputColor = vec4(col, inputColor.a);
}
`;

export class ScanlineEffect extends Effect {
  constructor() {
    super('ScanlineEffect', fragment, {
      uniforms: new Map<string, Uniform>([
        ['uTime', new Uniform(0)],
        ['uAberration', new Uniform(0.004)],
        ['uScanline', new Uniform(0.35)],
        ['uVignette', new Uniform(0.9)],
      ]),
    });
  }
  update(_r: unknown, _i: unknown, dt: number) {
    const u = this.uniforms.get('uTime');
    if (u) u.value += dt;
  }
}
