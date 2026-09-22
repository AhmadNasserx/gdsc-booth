import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';
import { createHash } from 'crypto';

export const ratelimit = new Ratelimit({
  redis: Redis.fromEnv(),
  limiter: Ratelimit.slidingWindow(1, '10 m'),
  prefix: 'gdsc-booth',
});

export function hashKey(sessionId: string): string {
  return createHash('sha256').update(sessionId).digest('hex');
}
