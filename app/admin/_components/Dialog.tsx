'use client';

import { useEffect, type ReactNode } from 'react';

interface Props {
  titleId: string;
  title: string;
  onClose: () => void;
  children: ReactNode;
}

/** A modal card. Escape closes it; the caller decides what closing means. */
export default function Dialog({ titleId, title, onClose, children }: Props) {
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="w-full max-w-md rounded-3xl border border-line bg-white p-6 shadow-lg"
      >
        <h2 id={titleId} className="text-xl font-extrabold text-ink">
          {title}
        </h2>
        {children}
      </div>
    </div>
  );
}
