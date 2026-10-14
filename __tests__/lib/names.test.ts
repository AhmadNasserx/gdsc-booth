/**
 * @jest-environment node
 */
import { NAME_PATTERN, normalizeName, hashPlayerKey, isValidPlayerKey } from '@/lib/names';

describe('NAME_PATTERN', () => {
  it('accepts letters, digits, spaces and Latin accents, 2 to 30 characters', () => {
    expect(NAME_PATTERN.test('Ahmad')).toBe(true);
    expect(NAME_PATTERN.test('Ahmad Nasser 2')).toBe(true);
    expect(NAME_PATTERN.test('José Ñandú')).toBe(true);
    expect(NAME_PATTERN.test('AB')).toBe(true);
    expect(NAME_PATTERN.test('A'.repeat(30))).toBe(true);
  });

  it('rejects names that are too short, too long, or contain other characters', () => {
    expect(NAME_PATTERN.test('A')).toBe(false);
    expect(NAME_PATTERN.test('')).toBe(false);
    expect(NAME_PATTERN.test('A'.repeat(31))).toBe(false);
    expect(NAME_PATTERN.test('<script>')).toBe(false);
    expect(NAME_PATTERN.test('a_b')).toBe(false);
    expect(NAME_PATTERN.test('Ahmad!')).toBe(false);
  });
});

describe('normalizeName', () => {
  it('lowercases and turns whitespace runs into single underscores', () => {
    expect(normalizeName('Ahmad Nasser')).toBe('ahmad_nasser');
    expect(normalizeName('ahmad    NASSER')).toBe('ahmad_nasser');
    expect(normalizeName('a \t b')).toBe('a_b');
  });

  it('removes anything outside a-z, 0-9 and underscore', () => {
    expect(normalizeName('Jo-hn!')).toBe('john');
    expect(normalizeName('Ana 2')).toBe('ana_2');
    expect(normalizeName('under_score')).toBe('under_score');
  });

  it('returns an empty string when nothing survives normalization', () => {
    expect(normalizeName('ÀÀ')).toBe('');
    expect(normalizeName('ñ ñ')).toBe('_');
  });
});

describe('hashPlayerKey', () => {
  it('returns the lowercase hex sha256 of the key', () => {
    // Standard SHA-256 test vector for "abc"
    expect(hashPlayerKey('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  });

  it('is deterministic and never returns the key itself', () => {
    const key = 'c'.repeat(64);
    const hash = hashPlayerKey(key);
    expect(hash).toBe(hashPlayerKey(key));
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(hash).not.toContain(key);
  });

  it('gives different hashes for different keys', () => {
    expect(hashPlayerKey('a'.repeat(64))).not.toBe(hashPlayerKey('b'.repeat(64)));
  });
});

describe('isValidPlayerKey', () => {
  it('accepts 64 lowercase hex characters', () => {
    expect(isValidPlayerKey('0123456789abcdef'.repeat(4))).toBe(true);
  });

  it('rejects wrong lengths, uppercase, non-hex characters and non-strings', () => {
    expect(isValidPlayerKey('a'.repeat(63))).toBe(false);
    expect(isValidPlayerKey('a'.repeat(65))).toBe(false);
    expect(isValidPlayerKey('A'.repeat(64))).toBe(false);
    expect(isValidPlayerKey('g'.repeat(64))).toBe(false);
    expect(isValidPlayerKey(' ' + 'a'.repeat(63))).toBe(false);
    expect(isValidPlayerKey(undefined)).toBe(false);
    expect(isValidPlayerKey(null)).toBe(false);
    expect(isValidPlayerKey(12345)).toBe(false);
    expect(isValidPlayerKey(['a'.repeat(64)])).toBe(false);
  });
});
