import { calcRunScore } from '../scoring';
import { applyAction, hydrateState, parseAction, type GameState } from './index';
import { minIntervalMs, RunError, type RunRecord } from './shared';

export type Transition =
  | {
      kind: 'applied';
      next: RunRecord;
      /** Game response without `done` and `result`. */
      response: Record<string, unknown>;
      finished: boolean;
    }
  /** The run already finished but the leaderboard was never updated (an earlier request failed). */
  | { kind: 'settle'; run: RunRecord };

/**
 * Applies one action request to a stored run. Pure: no I/O, no clock reads.
 * Throws RunError for every rejection, in the order a client can act on:
 * ownership, status, expiry, throttle, body shape, then game rules.
 */
export function transition(run: RunRecord, sessionId: string, body: Record<string, unknown>, now: number): Transition {
  if (run.sessionId !== sessionId) throw new RunError(404, 'Run not found');
  if (run.status === 'abandoned') throw new RunError(409, 'This game was replaced by a newer one');
  if (run.status === 'done') {
    if (run.final && !run.final.settled) return { kind: 'settle', run };
    throw new RunError(409, 'This game is already finished');
  }
  if (run.expiresAt <= now) throw new RunError(409, 'This game has expired');
  if (now - run.lastActionAt < minIntervalMs(run.game)) throw new RunError(429, 'Too fast');

  const state: GameState = hydrateState(run.game, run.state);
  const parsed = parseAction(run.game, body);
  const step = applyAction(state, parsed);
  const finished = step.performance !== undefined;

  const next: RunRecord = { ...run, state: step.state, lastActionAt: now };
  if (finished) {
    const durationMs = Math.max(0, now - run.startedAt);
    const score = calcRunScore(run.game, step.performance as number, durationMs);
    next.status = 'done';
    next.final = { score, durationMs, response: step.response, settled: false };
  }
  return { kind: 'applied', next, response: step.response, finished };
}
