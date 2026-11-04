import type { CSSProperties } from 'react';

const DEFAULT_COLORS = ['#F7B500', '#965D94', '#00A6BA', '#7DB83A', '#E1484B'];

interface Props {
  count?: number;
  colors?: readonly string[];
  className?: string;
}

/**
 * Pieces that fly out from the centre of the nearest positioned parent. Positions are computed
 * from the index, not randomly, so server and client render the same markup. A parent remounts
 * it with a changing `key` to play the effect again.
 */
export default function Burst({ count = 12, colors, className }: Props) {
  const palette = colors && colors.length > 0 ? colors : DEFAULT_COLORS;

  return (
    <span aria-hidden="true" className={`burst ${className ?? ''}`.trim()}>
      {Array.from({ length: count }, (_, i) => {
        const angle = (i / count) * Math.PI * 2;
        const distance = 40 + ((i * 37) % 70);
        const style = {
          '--burst-x': `${Math.round(Math.cos(angle) * distance)}px`,
          '--burst-y': `${Math.round(Math.sin(angle) * distance)}px`,
          '--burst-rot': `${(i * 47) % 360}deg`,
          '--burst-delay': `${(i % 4) * 30}ms`,
          '--burst-color': palette[i % palette.length],
        } as CSSProperties;

        return <span key={i} className="burst-piece" style={style} />;
      })}
    </span>
  );
}
