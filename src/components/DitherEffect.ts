import { Effect } from 'postprocessing';
import { Color, Uniform } from 'three';

// Ordered Bayer 8x8 dithering — produces a clean, print-like 1-bit look.
// Scene is pixelated first, luminance computed, then compared against a
// threshold pulled from the Bayer matrix. Output is two-tone (bg/fg).
const fragment = `
uniform vec3 uBg;
uniform vec3 uFg;
uniform float uPixel;

float bayer8(vec2 p) {
  int x = int(mod(p.x, 8.0));
  int y = int(mod(p.y, 8.0));
  int i = y * 8 + x;
  float m[64];
  m[0]=0.0;  m[1]=32.0; m[2]=8.0;  m[3]=40.0; m[4]=2.0;  m[5]=34.0; m[6]=10.0; m[7]=42.0;
  m[8]=48.0; m[9]=16.0; m[10]=56.0;m[11]=24.0;m[12]=50.0;m[13]=18.0;m[14]=58.0;m[15]=26.0;
  m[16]=12.0;m[17]=44.0;m[18]=4.0; m[19]=36.0;m[20]=14.0;m[21]=46.0;m[22]=6.0; m[23]=38.0;
  m[24]=60.0;m[25]=28.0;m[26]=52.0;m[27]=20.0;m[28]=62.0;m[29]=30.0;m[30]=54.0;m[31]=22.0;
  m[32]=3.0; m[33]=35.0;m[34]=11.0;m[35]=43.0;m[36]=1.0; m[37]=33.0;m[38]=9.0; m[39]=41.0;
  m[40]=51.0;m[41]=19.0;m[42]=59.0;m[43]=27.0;m[44]=49.0;m[45]=17.0;m[46]=57.0;m[47]=25.0;
  m[48]=15.0;m[49]=47.0;m[50]=7.0; m[51]=39.0;m[52]=13.0;m[53]=45.0;m[54]=5.0; m[55]=37.0;
  m[56]=63.0;m[57]=31.0;m[58]=55.0;m[59]=23.0;m[60]=61.0;m[61]=29.0;m[62]=53.0;m[63]=21.0;
  return m[i] / 64.0;
}

void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
  vec2 pixUV = floor(uv * resolution / uPixel) * uPixel / resolution;
  vec3 col = texture2D(inputBuffer, pixUV).rgb;
  float lum = dot(col, vec3(0.299, 0.587, 0.114));

  vec2 pixelCoord = floor(uv * resolution / uPixel);
  float threshold = bayer8(pixelCoord);

  float bit = step(threshold, lum);
  vec3 outCol = mix(uBg, uFg, bit);
  outputColor = vec4(outCol, 1.0);
}
`;

export interface DitherProps {
  bg?: string;
  fg?: string;
  pixel?: number; // pixel cell size in device pixels
}

export class DitherEffect extends Effect {
  constructor({ bg = '#05070a', fg = '#6ef3c5', pixel = 3 }: DitherProps = {}) {
    super('DitherEffect', fragment, {
      uniforms: new Map<string, Uniform>([
        ['uBg', new Uniform(new Color(bg))],
        ['uFg', new Uniform(new Color(fg))],
        ['uPixel', new Uniform(pixel)],
      ]),
    });
  }
}
