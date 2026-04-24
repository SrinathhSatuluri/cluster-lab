import { CanvasTexture, Color, NearestFilter, RepeatWrapping, Texture, Uniform } from 'three';
import { Effect } from 'postprocessing';

const fragment = `
uniform sampler2D uCharacters;
uniform float uCharactersCount;
uniform float uCellSize;
uniform bool uInvert;
uniform vec3 uColor;

const vec2 SIZE = vec2(16.);

vec3 greyscale(vec3 color) {
  float g = dot(color, vec3(0.299, 0.587, 0.114));
  return vec3(g);
}

void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
  vec2 cell = resolution / uCellSize;
  vec2 grid = 1.0 / cell;
  vec2 pixelizedUV = grid * (0.5 + floor(uv / grid));
  vec4 pixelized = texture2D(inputBuffer, pixelizedUV);
  float greyscaled = greyscale(pixelized.rgb).r;

  if (uInvert) greyscaled = 1.0 - greyscaled;

  float characterIndex = floor((uCharactersCount - 1.0) * greyscaled);
  vec2 characterPosition = vec2(mod(characterIndex, SIZE.x), floor(characterIndex / SIZE.y));
  vec2 offset = vec2(characterPosition.x, -characterPosition.y) / SIZE;
  vec2 charUV = mod(uv * (cell / SIZE), 1.0 / SIZE) - vec2(0., 1.0 / SIZE) + offset;
  vec4 ascii = texture2D(uCharacters, charUV);

  // tint by scene color so bright areas keep their hue
  vec3 tint = mix(uColor, pixelized.rgb, 0.5);
  outputColor = vec4(tint * ascii.r, pixelized.a);
}
`;

export interface AsciiProps {
  characters?: string;
  fontSize?: number;
  cellSize?: number;
  color?: string;
  invert?: boolean;
}

export class AsciiEffect extends Effect {
  constructor({
    characters = ` .:,'-^=*+?!|0#X%WM@`,
    fontSize = 54,
    cellSize = 8,
    color = '#6ef3c5',
    invert = false,
  }: AsciiProps = {}) {
    const uniforms = new Map<string, Uniform>([
      ['uCharacters', new Uniform(new Texture())],
      ['uCellSize', new Uniform(cellSize)],
      ['uCharactersCount', new Uniform(characters.length)],
      ['uColor', new Uniform(new Color(color))],
      ['uInvert', new Uniform(invert)],
    ]);
    super('AsciiEffect', fragment, { uniforms });
    const u = this.uniforms.get('uCharacters');
    if (u) u.value = this.createCharactersTexture(characters, fontSize);
  }

  private createCharactersTexture(characters: string, fontSize: number): Texture {
    const canvas = document.createElement('canvas');
    const SIZE = 1024;
    const MAX_PER_ROW = 16;
    const CELL = SIZE / MAX_PER_ROW;
    canvas.width = canvas.height = SIZE;
    const tex = new CanvasTexture(canvas, undefined, RepeatWrapping, RepeatWrapping, NearestFilter, NearestFilter);
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('2d context unavailable');
    ctx.clearRect(0, 0, SIZE, SIZE);
    ctx.font = `${fontSize}px JetBrains Mono, monospace`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#fff';
    for (let i = 0; i < characters.length; i++) {
      const x = i % MAX_PER_ROW;
      const y = Math.floor(i / MAX_PER_ROW);
      ctx.fillText(characters[i], x * CELL + CELL / 2, y * CELL + CELL / 2);
    }
    tex.needsUpdate = true;
    return tex;
  }
}
