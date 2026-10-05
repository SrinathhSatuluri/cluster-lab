// Pixel-art Glenda — Plan 9's bunny mascot, rendered as a pixel grid in accent.
// Each char = one cell. '#' filled, '.' transparent, 'o' eye (bg), 'x' cheek.
import type { ReactElement } from 'react';

const ART = [
  '....##........##....',
  '...####......####...',
  '...####......####...',
  '...####......####...',
  '...#####....#####...',
  '....##############..',
  '...################.',
  '..##################',
  '..####o########o####',
  '..##################',
  '..#######xxxx#######',
  '..##################',
  '...################.',
  '....##############..',
  '.....############...',
  '......##########....',
  '.....############...',
  '....##############..',
  '...####......####...',
  '..####........####..',
];

const CELL = 12;
const COLS = ART[0].length;
const ROWS = ART.length;

export default function Glenda({ className = '' }: { className?: string }) {
  const cells: ReactElement[] = [];
  for (let y = 0; y < ROWS; y++) {
    for (let x = 0; x < COLS; x++) {
      const c = ART[y][x];
      if (c === '.') continue;
      const fill = c === 'o' ? 'var(--bg)' : c === 'x' ? 'var(--accent-dim)' : 'var(--accent)';
      cells.push(
        <rect key={`${x}-${y}`} x={x * CELL} y={y * CELL} width={CELL} height={CELL} fill={fill} />
      );
    }
  }
  return (
    <svg
      className={`glenda ${className}`}
      viewBox={`0 0 ${COLS * CELL} ${ROWS * CELL}`}
      xmlns="http://www.w3.org/2000/svg"
      shapeRendering="crispEdges"
    >
      {cells}
    </svg>
  );
}
