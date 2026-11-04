/* eslint-disable @next/next/no-img-element -- small static logos; next/image adds nothing here */

interface Props {
  className?: string;
  /** Height of the logos. */
  size?: 'sm' | 'md' | 'lg';
  /** Shows the Faculty of Science tag after the logos. */
  faculty?: string | null;
  /** Sets the logos on a white card, for use over the triangle mosaic. */
  chip?: boolean;
}

const HEIGHTS = {
  sm: { bau: 'h-7', doors: 'h-9' },
  md: { bau: 'h-9 md:h-11', doors: 'h-11 md:h-14' },
  lg: { bau: 'h-12 md:h-16', doors: 'h-16 md:h-20' },
};

/** BAU and Open Doors 2026 logos, with the Faculty of Science tag. */
export default function BrandMark({ className = '', size = 'md', faculty = 'Faculty of Science', chip = false }: Props) {
  const h = HEIGHTS[size];
  return (
    <span className={`inline-flex items-center gap-3 md:gap-4 ${chip ? 'rounded-2xl bg-white/95 px-3 py-2 shadow-[0_6px_20px_-8px_rgba(43,27,87,0.35)]' : ''} ${className}`.trim()}>
      <img src="/brand/bau-logo.png" alt="Beirut Arab University" className={`${h.bau} w-auto`} />
      <span aria-hidden="true" className="h-8 w-px bg-line md:h-10" />
      <img src="/brand/open-doors-2026.png" alt="Open Doors 2026" className={`${h.doors} w-auto`} />
      {faculty && (
        <span className="font-display rounded-md bg-sci px-2.5 py-1 text-xs font-semibold leading-none tracking-wider text-ink md:text-sm">
          {faculty}
        </span>
      )}
    </span>
  );
}
