// Phone number checks shared by the name entry page (client) and the session route (server).
// The only import is the country list, which has no runtime dependencies, so both sides can use it.
import { COUNTRIES } from './countries';

export const PHONE_MIN_DIGITS = 8;
export const PHONE_MAX_DIGITS = 15;

export const PHONE_ERROR = 'Enter a valid phone number: 8 to 15 digits, including the country code.';
export const COUNTRY_CODE_ERROR =
  'Choose your country code: start the number with + and the code, for example +961 70 123 456.';

const DIAL_CODES = new Set(COUNTRIES.map((country) => country.dial));

export type PhoneCheck =
  | {
      ok: true;
      /** The number as "+" and digits (E.164 style). Always international. */
      phone: string;
      /** Digits only. The uniqueness key, used as the RTDB key under phones/. */
      key: string;
    }
  | { ok: false; error: string };

/**
 * Checks a typed phone number and normalises it.
 * Spaces, dashes and parentheses are ignored. The number must be international: a leading "+" or "00"
 * is required, and the digits after the country code must not start with a 0 (the trunk prefix).
 * The country code is never guessed, so a local number is refused with COUNTRY_CODE_ERROR.
 */
export function normalizePhone(input: unknown): PhoneCheck {
  if (typeof input !== 'string') return { ok: false, error: PHONE_ERROR };

  const compact = input.replace(/[\s()-]/g, '');
  if (!/^(\+|00)?\d+$/.test(compact)) return { ok: false, error: PHONE_ERROR };

  const international = compact.startsWith('+') || compact.startsWith('00');
  if (!international) return { ok: false, error: COUNTRY_CODE_ERROR };

  const digits = compact.startsWith('+') ? compact.slice(1) : compact.slice(2);

  // Country codes never start with 0, and the national number after the code must not either.
  if (digits.startsWith('0') || hasTrunkZeroAfterDialCode(digits)) return { ok: false, error: PHONE_ERROR };
  if (digits.length < PHONE_MIN_DIGITS || digits.length > PHONE_MAX_DIGITS) {
    return { ok: false, error: PHONE_ERROR };
  }

  return { ok: true, phone: `+${digits}`, key: digits };
}

/**
 * True when a known calling code is followed by a 0, as in "9610...": a trunk prefix that must be dropped.
 * The code length is not known from the digits alone, so every prefix of up to four digits is tried.
 */
function hasTrunkZeroAfterDialCode(digits: string): boolean {
  for (let length = 1; length <= 4 && length < digits.length; length++) {
    if (DIAL_CODES.has(digits.slice(0, length)) && digits[length] === '0') return true;
  }
  return false;
}

/**
 * Joins the chosen country's dial code and the number typed on the page into an international number.
 * Spaces, dashes and parentheses are dropped, and one leading 0 (the trunk prefix) is removed, so
 * "03 123 456" and "3 123 456" give the same number. Returns '' when nothing is left to send.
 * Other characters are kept, so normalizePhone still refuses them.
 */
export function combinePhone(dial: string, typed: string): string {
  let national = typed.replace(/[\s()-]/g, '');
  if (national.startsWith('0')) national = national.slice(1);
  return national ? `+${dial}${national}` : '';
}

/** True when the number typed on the page starts with + or 00, so a country code was typed into the national field. */
export function startsWithCountryCode(typed: string): boolean {
  const compact = typed.replace(/[\s()-]/g, '');
  return compact.startsWith('+') || compact.startsWith('00');
}
