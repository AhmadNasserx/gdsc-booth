import { calcRunScore } from '../scoring';
import type { CheckResponse } from '../apiTypes';
import { answersWithChecks, applyAction, checkQuestion, hydrateState, isBatchGame, parseAction, type GameState } from './index';
import { answeredOf, BATCH_MS_PER_ANSWER, minIntervalMs, RunError, type RunRecord } from './shared';

export type Transition =
  | {
      kind: 'applied';
      next: RunRecord;
      /** Game response without `done` and `result`. */
      response: Record<string, unknown>;
      finished: boolean;
    }
  /** One question checked during play. The run goes on, and the reply covers that question only. */
  | { kind: 'checked'; next: RunRecord; response: CheckResponse }
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
  // A check answers one question. It is not a play of the run, so it is not throttled and does not
  // move the clock that the batch is timed from.
  if (body.check !== undefined) return checkAnswer(run, body);
  if (now - run.lastActionAt < minIntervalMs(run.game)) throw new RunError(429, 'Too fast');

  const state: GameState = hydrateState(run.game, run.state);
  const parsed = parseAction(run.game, body);
  if (parsed.game === 'riddles' || parsed.game === 'trivia') {
    // Each answered question needs a little time to be read and answered. A faster batch was not played.
    // Answers already locked in by checks count too, so a batch cannot skip the wait by checking first.
    const answered = answeredOf(answersWithChecks(state, parsed.action.answers));
    if (now - run.startedAt < answered * BATCH_MS_PER_ANSWER) {
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

/** Locks in one answer of a riddles or trivia run. Only that question is revealed. */
function checkAnswer(run: RunRecord, body: Record<string, unknown>): Transition {
  if (!isBatchGame(run.game)) throw new RunError(400, 'This game has no per-question check');
  if (body.answers !== undefined) throw new RunError(400, 'Send either check or answers, not both');
  const step = checkQuestion(hydrateState(run.game, run.state), run.game, body);
  return { kind: 'checked', next: { ...run, state: step.state }, response: step.response };
}

/**
 * A finished run takes no more play. An unsettled one is settled. A batch sent again gets the
 * reply it was given before, so a retry after a lost response is safe. Anything else is 409.
 */
function afterFinish(run: RunRecord, body: Record<string, unknown>): Transition {
  // A check has no answer to give once the game is over.
  if (body.check !== undefined) throw new RunError(409, 'This game is already finished');
  if (run.final && !run.final.settled) return { kind: 'settle', run };
  if (run.final && isBatchGame(run.game) && body.answers !== undefined) {
    parseAction(run.game, body);
    return { kind: 'replay', response: run.final.response };
  }
  throw new RunError(409, 'This game is already finished');
}
