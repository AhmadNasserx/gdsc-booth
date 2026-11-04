'use client';

import { useId, useState } from 'react';
import Dialog from './Dialog';
import {
  BUTTON_BASE,
  BUTTON_PRIMARY,
  BUTTON_SECONDARY,
  CARD,
  ERROR_TEXT,
  GAME_KEYS,
  GAME_LABELS,
  INPUT,
  MAX_SCORE,
  SUBTLE_TEXT,
  callApi,
  isUnauthorized,
  type AdminPlayer,
  type GameKey,
  type GameScores,
} from './shared';

interface Props {
  players: AdminPlayer[];
  onChanged: () => Promise<void>;
  onUnauthorized: () => void;
}

type Drafts = Record<GameKey, string>;
type EditErrors = Partial<Record<GameKey | 'form', string>>;

const RANGE_MESSAGE = `Use a whole number from 0 to ${MAX_SCORE}.`;

function draftsFor(player: AdminPlayer): Drafts {
  const drafts: Drafts = { riddles: '', memory: '', trivia: '' };
  for (const key of GAME_KEYS) {
    const value = player.games[key];
    drafts[key] = value === undefined ? '' : String(value);
  }
  return drafts;
}

/** Turns the typed scores into the games object to send. Empty fields are left out. */
function readDrafts(drafts: Drafts): { games: GameScores; errors: EditErrors } {
  const games: GameScores = {};
  const errors: EditErrors = {};
  for (const key of GAME_KEYS) {
    const text = drafts[key].trim();
    if (text === '') continue;
    const value = Number(text);
    if (!/^\d+$/.test(text) || value > MAX_SCORE) {
      errors[key] = RANGE_MESSAGE;
      continue;
    }
    games[key] = value;
  }
  if (Object.keys(errors).length === 0 && Object.keys(games).length === 0) {
    errors.form = 'Enter at least one score to save.';
  }
  return { games, errors };
}

function statusText(player: AdminPlayer): string {
  if (!player.finished) return 'Still playing';
  return player.finishedRound === null ? 'Finished' : `Finished in hour ${player.finishedRound}`;
}

export default function PlayersPanel({ players, onChanged, onUnauthorized }: Props) {
  const idBase = useId();
  const removeTitleId = useId();
  const [query, setQuery] = useState('');
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Drafts>({ riddles: '', memory: '', trivia: '' });
  const [editErrors, setEditErrors] = useState<EditErrors>({});
  const [saving, setSaving] = useState(false);
  const [removing, setRemoving] = useState<AdminPlayer | null>(null);
  const [removeBusy, setRemoveBusy] = useState(false);
  const [removeError, setRemoveError] = useState('');

  const needle = query.trim().toLowerCase();
  const visible =
    needle === '' ? players : players.filter((player) => player.name.toLowerCase().includes(needle));

  function startEditing(player: AdminPlayer) {
    setEditingKey(player.key);
    setDrafts(draftsFor(player));
    setEditErrors({});
  }

  function cancelEditing() {
    setEditingKey(null);
    setEditErrors({});
  }

  function setDraft(key: GameKey, value: string) {
    setDrafts((current) => ({ ...current, [key]: value }));
  }

  async function saveScores(player: AdminPlayer) {
    if (saving) return;
    const { games, errors } = readDrafts(drafts);
    setEditErrors(errors);
    if (Object.keys(errors).length > 0) return;

    setSaving(true);
    const result = await callApi('/api/admin/players', {
      method: 'PATCH',
      body: { key: player.key, games },
    });
    if (isUnauthorized(result)) {
      onUnauthorized();
      return;
    }
    setSaving(false);
    if (!result.ok) {
      setEditErrors({ form: result.error });
      return;
    }
    setEditingKey(null);
    await onChanged();
  }

  function closeRemove() {
    if (removeBusy) return;
    setRemoving(null);
    setRemoveError('');
  }

  async function removePlayer() {
    if (!removing || removeBusy) return;
    const target = removing;
    setRemoveBusy(true);
    setRemoveError('');
    const result = await callApi('/api/admin/players', {
      method: 'DELETE',
      body: { key: target.key },
    });
    if (isUnauthorized(result)) {
      onUnauthorized();
      return;
    }
    setRemoveBusy(false);
    if (!result.ok) {
      setRemoveError(result.error);
      return;
    }
    setRemoving(null);
    if (editingKey === target.key) cancelEditing();
    await onChanged();
  }

  return (
    <section aria-labelledby="players-heading" className={CARD}>
      <h2 id="players-heading" className="text-lg font-extrabold text-[#202124]">
        Players
      </h2>

      <div className="mt-4">
        <label htmlFor={`${idBase}-search`} className="mb-1.5 block text-sm font-semibold text-[#202124]">
          Search players by name
        </label>
        <input
          id={`${idBase}-search`}
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          autoComplete="off"
          spellCheck={false}
          className={INPUT}
        />
      </div>

      {players.length === 0 ? (
        <p className={`${SUBTLE_TEXT} mt-4`}>No players yet.</p>
      ) : visible.length === 0 ? (
        <p className={`${SUBTLE_TEXT} mt-4`}>No players match &ldquo;{query.trim()}&rdquo;.</p>
      ) : (
        <ul className="mt-4 grid gap-3 md:grid-cols-2">
          {visible.map((player) => (
            <li key={player.key} className="rounded-2xl border border-[#E8EAED] bg-[#F8F9FA] p-4">
              <p className="break-words text-lg font-bold text-[#202124]">{player.name}</p>
              <p className="mt-1 text-base text-[#202124]">
                <span className="font-black tabular-nums">{player.score}</span> points in total
              </p>
              <p className={SUBTLE_TEXT}>{player.gamesPlayed} of 3 games</p>
              <p className={SUBTLE_TEXT}>{statusText(player)}</p>

              {editingKey === player.key ? (
                <form
                  noValidate
                  aria-label={`Edit scores for ${player.name}`}
                  onSubmit={(e) => {
                    e.preventDefault();
                    void saveScores(player);
                  }}
                  className="mt-4 space-y-4 rounded-2xl bg-white p-4"
                >
                  <div className="grid gap-3 sm:grid-cols-3">
                    {GAME_KEYS.map((key) => {
                      const inputId = `${idBase}-${key}`;
                      const errorId = `${inputId}-error`;
                      const error = editErrors[key];
                      return (
                        <div key={key} className="min-w-0">
                          <label htmlFor={inputId} className="mb-1 block text-sm font-semibold text-[#202124]">
                            {GAME_LABELS[key]}
                          </label>
                          <input
                            id={inputId}
                            type="number"
                            inputMode="numeric"
                            min={0}
                            max={MAX_SCORE}
                            step={1}
                            value={drafts[key]}
                            onChange={(e) => setDraft(key, e.target.value)}
                            aria-invalid={error ? true : undefined}
                            aria-describedby={error ? errorId : undefined}
                            className={INPUT}
                          />
                          {error && (
                            <p id={errorId} role="alert" className={`${ERROR_TEXT} mt-1 text-xs`}>
                              {error}
                            </p>
                          )}
                        </div>
                      );
                    })}
                  </div>
                  {editErrors.form && (
                    <p role="alert" className={ERROR_TEXT}>
                      {editErrors.form}
                    </p>
                  )}
                  <div className="grid gap-3 sm:grid-cols-2">
                    <button type="submit" disabled={saving} className={BUTTON_PRIMARY}>
                      {saving ? 'Saving...' : 'Save'}
                    </button>
                    <button
                      type="button"
                      onClick={cancelEditing}
                      disabled={saving}
                      className={BUTTON_SECONDARY}
                    >
                      Cancel
                    </button>
                  </div>
                </form>
              ) : (
                <div className="mt-4 grid grid-cols-2 gap-3">
                  <button type="button" onClick={() => startEditing(player)} className={BUTTON_SECONDARY}>
                    Edit scores
                  </button>
                  <button
                    type="button"
                    onClick={() => setRemoving(player)}
                    className={`${BUTTON_BASE} border border-[#C5221F] bg-white text-[#C5221F] hover:bg-[#FCE8E6]`}
                  >
                    Delete
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      {removing && (
        <Dialog titleId={removeTitleId} title="Delete player?" onClose={closeRemove}>
          <p className="mt-3 text-base text-[#5F6368]">
            Delete {removing.name}? Their score, name, phone number and contact are removed so they
            can play again. This cannot be undone.
          </p>
          {removeError && (
            <p role="alert" className={`${ERROR_TEXT} mt-3`}>
              {removeError}
            </p>
          )}
          <div className="mt-6 grid gap-3 sm:grid-cols-2">
            <button type="button" onClick={closeRemove} disabled={removeBusy} className={BUTTON_SECONDARY}>
              Cancel
            </button>
            <button
              type="button"
              onClick={removePlayer}
              disabled={removeBusy}
              className={`${BUTTON_BASE} bg-[#C5221F] text-white hover:bg-[#A50E0E]`}
            >
              {removeBusy ? 'Deleting...' : 'Delete player'}
            </button>
          </div>
        </Dialog>
      )}
    </section>
  );
}
