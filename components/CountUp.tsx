'use client';

import { useEffect, useRef, useState } from 'react';

interface Props {
  value: number;
  /** Length of the count in milliseconds. */
  duration?: number;
  format?: (n: number) => string;
  className?: string;
}

const REDUCED_MOTION = '(prefers-reduced-motion: reduce)';

// No counting when the visitor asks for less motion, or when there is no frame clock to drive it.
// The checks are guarded because jsdom and some older browsers lack matchMedia or rAF.
function canAnimate(): boolean {
  if (typeof window === 'undefined' || typeof window.requestAnimationFrame !== 'function') return false;
  if (typeof window.matchMedia !== 'function') return true;
  return !window.matchMedia(REDUCED_MOTION).matches;
}

/**
 * Counts up (or down) from the number currently on screen to `value`. It starts at 0 on mount,
 * so the first paint is 0 on the server and on the client, which keeps hydration consistent.
 */
export default function CountUp({ value, duration = 900, format, className }: Props) {
  const target = Math.round(value);
  const [shown, setShown] = useState(0);
  // The last number drawn, so a new target counts on from there rather than jumping back to 0.
  const shownRef = useRef(0);

  useEffect(() => {
    const from = shownRef.current;

    if (!canAnimate()) {
      shownRef.current = target;
      // One extra render per target change, not a loop. Needed because the motion check can only run on the client.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setShown(target);
      return;
    }

    let frame = 0;
    let start: number | null = null;

    const step = (now: number) => {
      if (start === null) start = now;
      const t = duration > 0 ? Math.min(1, (now - start) / duration) : 1;
      const eased = 1 - Math.pow(1 - t, 3);
      // The final frame sets the exact target, so the last text is always right.
      const next = t >= 1 ? target : Math.round(from + (target - from) * eased);
      shownRef.current = next;
      setShown(next);
      if (t < 1) frame = window.requestAnimationFrame(step);
    };

    frame = window.requestAnimationFrame(step);
    return () => window.cancelAnimationFrame(frame);
  }, [target, duration]);

  const text = format ? format(shown) : String(shown);
  return <span className={className}>{text}</span>;
}
