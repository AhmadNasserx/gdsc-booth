// Phone number checks shared by the name entry page (client) and the session route (server).
// No runtime imports, so both sides can use it.

export const PHONE_MIN_DIGITS = 8;
export const PHONE_MAX_DIGITS = 15;

export const PHONE_ERROR = 'Enter a valid phone number: 8 to 15 digits, with an optional leading + or 00.';

export type PhoneCheck =
  | {
      ok: true;
      /** International numbers as "+" and digits (E.164 style). Local numbers as digits only, since their country is unknown. */
      phone: string;
      /** Digits only. The uniqueness key, used as the RTDB key under phones/. */
      key: string;
    }
  | { ok: false; error: string };

/**
 * Checks a typed phone number and normalises it.
 * Spaces, dashes and parentheses are ignored. A leading "+" or "00" marks an international number.
 * The country code is never guessed: a number without one is kept as the digits typed.
 */
export function normalizePhone(input: unknown): PhoneCheck {
  if (typeof input !== 'string') return { ok: false, error: PHONE_ERROR };

  const compact = input.replace(/[\s()-]/g, '');
  if (!/^(\+|00)?\d+$/.test(compact)) return { ok: false, error: PHONE_ERROR };

  const international = compact.startsWith('+') || compact.startsWith('00');
  const digits = compact.startsWith('+')
    ? compact.slice(1)
    : compact.startsWith('00')
      ? compact.slice(2)
      : compact;

  // Country codes never start with 0, so "+0..." is not a valid international number.
  if (international && digits.startsWith('0')) return { ok: false, error: PHONE_ERROR };
  if (digits.length < PHONE_MIN_DIGITS || digits.length > PHONE_MAX_DIGITS) {
    return { ok: false, error: PHONE_ERROR };
  }

  return { ok: true, phone: international ? `+${digits}` : digits, key: digits };
}
