/**
 * The triangle mosaic from the Open Doors poster: five colour bands (plum, teal, leaf, coral and
 * science yellow), each cell split on a diagonal into two triangles of varying strength. The
 * pattern is fixed, so server and client draw the same markup.
 */
const FAMILIES = ['#965D94', '#00A6BA', '#7DB83A', '#F08970', '#F7B500'];
const LEVELS = [0, 0, 0.18, 0.35, 0.55, 0.8, 1];

function hash(c: number, r: number, salt: number): number {
  let h = (c * 374761393 + r * 668265263 + salt * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

interface Props {
  className?: string;
  cols?: number;
  rows?: number;
  /** Colour bands to use, in order. Defaults to all five. */
  families?: readonly string[];
}

export default function Mosaic({ className = '', cols = 20, rows = 9, families = FAMILIES }: Props) {
  const cell = 10;
  const shapes: React.ReactNode[] = [];
  const band = cols / families.length;
  for (let c = 0; c < cols; c++) {
    const color = families[Math.min(families.length - 1, Math.floor(c / band))];
    for (let r = 0; r < rows; r++) {
      // Strong near the top, thinning out towards the bottom.
      const fade = 1 - r / rows;
      const x = c * cell;
      const y = r * cell;
      const down = hash(c, r, 1) > 0.5;
      const a = LEVELS[Math.floor(hash(c, r, 2) * LEVELS.length)] * fade;
      const b = LEVELS[Math.floor(hash(c, r, 3) * LEVELS.length)] * fade;
      const [p1, p2] = down
        ? [`${x},${y} ${x + cell},${y} ${x},${y + cell}`, `${x + cell},${y} ${x + cell},${y + cell} ${x},${y + cell}`]
        : [`${x},${y} ${x + cell},${y} ${x + cell},${y + cell}`, `${x},${y} ${x + cell},${y + cell} ${x},${y + cell}`];
      if (a > 0.05) shapes.push(<polygon key={`${c}-${r}-a`} points={p1} fill={color} fillOpacity={a.toFixed(2)} />);
      if (b > 0.05) shapes.push(<polygon key={`${c}-${r}-b`} points={p2} fill={color} fillOpacity={b.toFixed(2)} />);
    }
  }
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      viewBox={`0 0 ${cols * cell} ${rows * cell}`}
      preserveAspectRatio="xMidYMin slice"
      className={className}
    >
      {shapes}
    </svg>
  );
}
