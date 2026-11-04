import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'BAU Tripoli Open House: Tech and Science Challenge',
  description: 'Play three quick tech and science games at the BAU Tripoli Open House. The top 3 players win a prize every hour.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-[#F8F9FA] text-[#202124] font-sans antialiased">
        {children}
      </body>
    </html>
  );
}
