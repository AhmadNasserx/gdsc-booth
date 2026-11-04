'use client';

import { useId, useState } from 'react';
import Dialog from './Dialog';
import {
  BUTTON_DANGER,
  BUTTON_PRIMARY,
  BUTTON_SECONDARY,
  CARD,
  ERROR_TEXT,
  INPUT,
  SUBTLE_TEXT,
  callApi,
  formatCountdown,
  formatTime,
  isUnauthorized,
  type EventInfo,
} from './shared';

interface Props {
  event: EventInfo;
  /** Server time: the client clock plus the offset measured when the overview arrived. */
  serverNow: number;
  onChanged: () => Promise<void>;
  onUnauthorized: () => void;
}

const CONFIRM_WORD = 'RESET';

export default function ClockPanel({ event, serverNow, onChanged, onUnauthorized }: Props) {
  const titleId = useId();
  const inputId = useId();
  const [starting, setStarting] = useState(false);
  const [startError, setStartError] = useState('');
  const [resetOpen, setResetOpen] = useState(false);
  const [typed, setTyped] = useState('');
  const [resetting, setResetting] = useState(false);
  const [resetError, setResetError] = useState('');

  async function startClock() {
    if (starting) return;
    setStarting(true);
    setStartError('');
    const result = await callApi('/api/admin/clock', { method: 'POST', body: { action: 'start' } });
    if (isUnauthorized(result)) {
      onUnauthorized();
      return;
    }
    setStarting(false);
    if (result.ok) await onChanged();
    else setStartError(result.error);
  }

  function closeReset() {
    if (resetting) return;
    setResetOpen(false);
    setTyped('');
    setResetError('');
  }

  async function resetEvent() {
    if (typed !== CONFIRM_WORD || resetting) return;
    setResetting(true);
    setResetError('');
    const result = await callApi('/api/admin/clock', {
      method: 'POST',
      body: { action: 'reset', confirm: CONFIRM_WORD },
    });
    if (isUnauthorized(result)) {
      onUnauthorized();
      return;
    }
    setResetting(false);
    if (!result.ok) {
      setResetError(result.error);
      return;
    }
    setResetOpen(false);
    setTyped('');
    await onChanged();
  }

  const endsIn =
    event.roundEndsAt === null ? null : formatCountdown(event.roundEndsAt - serverNow);

  return (
    <section aria-labelledby="clock-heading" className={CARD}>
      <h2 id="clock-heading" className="text-lg font-extrabold text-ink">
        Event clock
      </h2>

      {event.startedAt === null ? (
        <div className="mt-3 space-y-4">
          <p className="text-base text-muted">
            The event clock has not started. It starts when the first player presses Start.
          </p>
          <button
            type="button"
            onClick={startClock}
            disabled={starting}
            className={`${BUTTON_PRIMARY} w-full min-h-[56px] text-lg`}
          >
            {starting ? 'Starting...' : 'Start clock now'}
          </button>
          {startError && (
            <p role="alert" className={ERROR_TEXT}>
              {startError}
            </p>
          )}
        </div>
      ) : (
        <div className="mt-3 space-y-3">
          <p className={SUBTLE_TEXT}>Event started {formatTime(event.startedAt)}</p>
          {event.currentRound !== null && (
            <p className="text-2xl font-extrabold text-ink">Hour {event.currentRound}</p>
          )}
          {event.currentRound !== null && endsIn !== null && (
            <p className="text-base text-ink">
              Hour {event.currentRound} ends in{' '}
              <span className="font-black tabular-nums text-ink">{endsIn}</span>
            </p>
          )}
          <button
            type="button"
            onClick={() => setResetOpen(true)}
            className={`${BUTTON_SECONDARY} w-full`}
          >
            Reset event
          </button>
        </div>
      )}

      {resetOpen && (
        <Dialog titleId={titleId} title="Reset the event clock?" onClose={closeReset}>
          <p className="mt-3 text-base text-muted">
            This clears the event start time. Hour numbers and prize clocks start again from the
            next player. Leaderboard scores are kept.
          </p>
          <label htmlFor={inputId} className="mt-5 block text-sm font-semibold text-ink">
            Type RESET to confirm
          </label>
          <input
            id={inputId}
            type="text"
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            autoComplete="off"
            autoCapitalize="characters"
            spellCheck={false}
            className={`${INPUT} mt-2`}
          />
          {resetError && (
            <p role="alert" className={`${ERROR_TEXT} mt-3`}>
              {resetError}
            </p>
          )}
          <div className="mt-6 grid gap-3 sm:grid-cols-2">
            <button
              type="button"
              onClick={closeReset}
              disabled={resetting}
              className={BUTTON_SECONDARY}
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={resetEvent}
              disabled={typed !== CONFIRM_WORD || resetting}
              className={BUTTON_DANGER}
            >
              {resetting ? 'Resetting...' : 'Reset event'}
            </button>
          </div>
        </Dialog>
      )}
    </section>
  );
}
