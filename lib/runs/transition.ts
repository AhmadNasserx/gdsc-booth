import { calcRunScore } from '../scoring';
import { applyAction, hydrateState, isBatchGame, parseAction, type GameState } from './index';
import { answeredOf, BATCH_MS_PER_ANSWER, minIntervalMs, RunError, type RunRecord } from './shared';

export type Transition =
  | {
      kind: 'applied';
      next: RunRecord;
      /** Game response without `done` and `result`. */
      response: Record<string, unknown>;
      finished: boolean;
    }
  /** The run already finished but the leaderboard was never updated (an earlier request failed). */
  | { kind: 'settle'; run: RunRecord }
  /** A batch that was already graded and settled. The stored reply is sent again, unchanged. */
  | { kind: 'replay'; response: Record<string, unknown> };

/**
 * Applies one action request to a stored run. Pure: no I/O, no clock reads.
 * Throws RunError for every rejection, in the order a client can act on:
 * ownership, status, expiry, throttle, body shape, batch plausibility, then game rules.
 */
export function transition(run: RunRecord, sessionId: string, body: Record<string, unknown>, now: number): Transition {
  if (run.sessionId !== sessionId) throw new RunError(404, 'Run not found');
  if (run.status === 'abandoned') throw new RunError(409, 'This game was replaced by a newer one');
  if (run.status === 'done') return afterFinish(run, body);
  if (run.expiresAt <= now) throw new RunError(409, 'This game has expired');
  if (now - run.lastActionAt < minIntervalMs(run.game)) throw new RunError(429, 'Too fast');

  const state: GameState = hydrateState(run.game, run.state);
  const parsed = parseAction(run.game, body);
  if (parsed.game === 'riddles' || parsed.game === 'trivia' || parsed.game === 'bugs') {
    // Each answered question needs a little time to be read and answered. A faster batch was not played.
    if (now - run.startedAt < answeredOf(parsed.action.answers) * BATCH_MS_PER_ANSWER) {
      throw new RunError(429, 'Too fast');
    }
  }
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

/**
 * A finished run takes no more play. An unsettled one is settled. A batch sent again gets the
 * reply it was given before, so a retry after a lost response is safe. Anything else is 409.
 */
function afterFinish(run: RunRecord, body: Record<string, unknown>): Transition {
  if (run.final && !run.final.settled) return { kind: 'settle', run };
  if (run.final && isBatchGame(run.game) && body.answers !== undefined) {
    parseAction(run.game, body);
    return { kind: 'replay', response: run.final.response };
  }
  throw new RunError(409, 'This game is already finished');
}
