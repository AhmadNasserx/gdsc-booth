import type { NextConfig } from 'next';

const isDev = process.env.NODE_ENV === 'development';

// Dev relaxes script-src for Next.js/Turbopack inline hydration scripts and HMR websocket.
// Production enforces strict 'self'-only script policy.
const csp = isDev
  ? "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; connect-src 'self' https://*.firebaseio.com https://*.googleapis.com https://*.firebasedatabase.app wss://*.firebasedatabase.app ws://localhost:*; img-src 'self' data:; style-src 'self' 'unsafe-inline';"
  : "default-src 'self'; script-src 'self' 'unsafe-inline'; connect-src 'self' https://*.firebaseio.com https://*.googleapis.com https://*.firebasedatabase.app wss://*.firebasedatabase.app; img-src 'self' data:; style-src 'self' 'unsafe-inline';";

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          {
            key: 'Content-Security-Policy',
            value: csp,
          },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
        ],
      },
    ];
  },
};

export default nextConfig;
