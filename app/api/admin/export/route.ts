import { NextResponse } from 'next/server';
import { adminError } from '@/lib/admin/http';
import { requireAdmin } from '@/lib/admin/auth';
import { winnersCsv } from '@/lib/admin/csv';
import { readWinnerRounds } from '@/lib/admin/winners';

export async function GET(request: Request) {
  const access = requireAdmin(request);
  if (!access.ok) return access.response;

  const now = Date.now();
  try {
    const { rounds } = await readWinnerRounds(now);
    const csv = winnersCsv(rounds);
    return new NextResponse(csv, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': 'attachment; filename="winners.csv"',
        'Cache-Control': 'no-store',
      },
    });
  } catch (err) {
    console.error('Admin API error', (err as Error).name);
    return adminError(500, 'Server error. Try again.');
  }
}
