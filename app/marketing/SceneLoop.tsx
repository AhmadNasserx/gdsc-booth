'use client';

import { type ReactNode, useEffect, useState } from 'react';
import styles from './marketing.module.css';

const FADE_MS = 800;

type SceneLoopProps = {
  scenes: ReactNode[];
  durations: number[];
  staticIndex: number;
};

function prefersReducedMotion(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}

export default function SceneLoop({ scenes, durations, staticIndex }: SceneLoopProps) {
  const [current, setCurrent] = useState(0);
  const [previous, setPrevious] = useState<number | null>(null);

  useEffect(() => {
    if (prefersReducedMotion()) return;
    const timer = window.setTimeout(() => {
      setPrevious(current);
      setCurrent((current + 1) % scenes.length);
    }, durations[current]);
    return () => window.clearTimeout(timer);
  }, [current, durations, scenes.length]);

  useEffect(() => {
    if (previous === null) return;
    const timer = window.setTimeout(() => setPrevious(null), FADE_MS);
    return () => window.clearTimeout(timer);
  }, [previous]);

  return (
    <div className={styles.loop}>
      {scenes.map((scene, index) => (
        <div
          key={index}
          className={styles.scene}
          data-state={index === current ? 'active' : index === previous ? 'leaving' : 'idle'}
          data-qr={index === staticIndex ? 'true' : undefined}
        >
          {scene}
        </div>
      ))}
    </div>
  );
}
