'use client';

import { useSyncExternalStore } from 'react';
import { feedback, isSoundMuted, setSoundMuted, subscribeSoundMuted } from '@/lib/feedback';

// The server and first client render both show "not muted", so hydration matches.
export default function SoundToggle() {
  const muted = useSyncExternalStore(subscribeSoundMuted, isSoundMuted, () => false);

  function toggle() {
    const next = !muted;
    setSoundMuted(next);
    // A tap confirms the sound is back. Turning sound off stays silent.
    if (!next) feedback('tap');
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={muted ? 'Turn sound on' : 'Turn sound off'}
      className="min-h-11 min-w-11 inline-flex items-center justify-center rounded-full border border-line bg-white text-lg focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-sci/40"
    >
      <span aria-hidden="true" className="font-emoji">{muted ? '🔇' : '🔊'}</span>
    </button>
  );
}
