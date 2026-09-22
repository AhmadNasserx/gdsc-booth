import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'GDSC Interactive Tech Station',
  description: 'Google Developer Student Clubs booth app',
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
