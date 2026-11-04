import type { Metadata } from 'next';
import localFont from 'next/font/local';
import './globals.css';

// Oswald (headlines) and Source Sans 3 (text), both SIL Open Font License, shipped with the app so
// the build needs no network and the strict CSP needs no font host. Latin subset, which covers French.
const oswald = localFont({
  src: './fonts/oswald-latin-wght-normal.woff2',
  weight: '200 700',
  variable: '--font-oswald',
  display: 'swap',
});
const source = localFont({
  src: './fonts/source-sans-3-latin-wght-normal.woff2',
  weight: '200 900',
  variable: '--font-source',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'BAU Open Doors 2026 · Faculty of Science Challenge',
  description:
    'Play three quick science and tech games at the Faculty of Science booth, BAU Open Doors 2026, Tripoli campus. The top 3 players win a prize every hour.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${oswald.variable} ${source.variable}`}>
      <body className="bg-mist text-ink font-sans antialiased">
        {children}
      </body>
    </html>
  );
}
