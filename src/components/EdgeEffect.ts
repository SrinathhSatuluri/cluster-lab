import { Effect } from 'postprocessing';
import { Color, Uniform } from 'three';

// Sobel edge detection + glow. Scene becomes a neon-on-black schematic:
// edges of geometry light up in the accent color, interiors go dark.
const fragment = `
uniform vec3 uBg;
uniform vec3 uFg;
uniform float uThickness;
uniform float uBoost;

float lum(vec3 c) { return dot(c, vec3(0.299, 0.587, 0.114)); }

void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
  vec2 px = uThickness / resolution;

  float tl = lum(texture2D(inputBuffer, uv + vec2(-px.x,  px.y)).rgb);
  float t  = lum(texture2D(inputBuffer, uv + vec2( 0.0 ,  px.y)).rgb);
  float tr = lum(texture2D(inputBuffer, uv + vec2( px.x,  px.y)).rgb);
  float l  = lum(texture2D(inputBuffer, uv + vec2(-px.x,  0.0 )).rgb);
  float r  = lum(texture2D(inputBuffer, uv + vec2( px.x,  0.0 )).rgb);
  float bl = lum(texture2D(inputBuffer, uv + vec2(-px.x, -px.y)).rgb);
  float b  = lum(texture2D(inputBuffer, uv + vec2( 0.0 , -px.y)).rgb);
  float br = lum(texture2D(inputBuffer, uv + vec2( px.x, -px.y)).rgb);

  float gx = -tl - 2.0*l - bl + tr + 2.0*r + br;
  float gy = -tl - 2.0*t - tr + bl + 2.0*b + br;
  float edge = clamp(sqrt(gx*gx + gy*gy) * uBoost, 0.0, 1.0);

  // soft glow — add a blurred version of edges around hard ones
  vec3 col = mix(uBg, uFg, edge);
  // keep original bright pixels (bloomed parts of scene) tinted
  float sceneLum = lum(texture2D(inputBuffer, uv).rgb);
  col += uFg * smoothstep(0.7, 1.0, sceneLum) * 0.6;

  outputColor = vec4(col, 1.0);
}
`;

export interface EdgeProps {
  bg?: string;
  fg?: string;
  thickness?: number; // sample radius in pixels
  boost?: number;     // edge intensity multiplier
}

export class EdgeEffect extends Effect {
  constructor({ bg = '#05070a', fg = '#6ef3c5', thickness = 1.2, boost = 3.5 }: EdgeProps = {}) {
    super('EdgeEffect', fragment, {
      uniforms: new Map<string, Uniform>([
        ['uBg', new Uniform(new Color(bg))],
        ['uFg', new Uniform(new Color(fg))],
        ['uThickness', new Uniform(thickness)],
        ['uBoost', new Uniform(boost)],
      ]),
    });
  }
}
