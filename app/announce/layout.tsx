import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Winners · BAU Open Doors 2026 · Faculty of Science',
  description: 'The winners ceremony for the Faculty of Science booth at BAU Open Doors 2026.',
  robots: { index: false, follow: false },
};

export default function AnnounceLayout({ children }: { children: React.ReactNode }) {
  return children;
}
