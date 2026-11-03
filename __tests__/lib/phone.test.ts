import { combinePhone, normalizePhone, startsWithCountryCode, COUNTRY_CODE_ERROR, PHONE_ERROR } from '@/lib/phone';

describe('normalizePhone: accepted international numbers', () => {
  it.each([
    ['+961 70 123 456', '+96170123456'],
    ['+96170123456', '+96170123456'],
    ['+961-70-123-456', '+96170123456'],
    ['+961 (70) 123 456', '+96170123456'],
    ['  +961 70 123 456  ', '+96170123456'],
    ['+ 961 70 123 456', '+96170123456'],
    ['0096170123456', '+96170123456'],
    ['00 961 70 123 456', '+96170123456'],
  ])('reads %s as %s', (input, phone) => {
    const result = normalizePhone(input);
    expect(result).toEqual({ ok: true, phone, key: phone.slice(1) });
  });

  it('accepts a Lebanese number once its trunk 0 has been dropped', () => {
    expect(normalizePhone('+961 3 123 456')).toEqual({ ok: true, phone: '+9613123456', key: '9613123456' });
  });

  it('gives the same key for the same number in different spellings', () => {
    const keys = ['+961 70 123 456', '+96170123456', '0096170123456', '(+961) 70-123-456'].map((input) => {
      const result = normalizePhone(input);
      return result.ok ? result.key : null;
    });
    expect(new Set(keys)).toEqual(new Set(['96170123456']));
  });

  it('accepts 8 digits and 15 digits in total, the bounds', () => {
    expect(normalizePhone('+12345678')).toMatchObject({ ok: true, key: '12345678' });
    expect(normalizePhone('+123456789012345')).toMatchObject({ ok: true, key: '123456789012345' });
  });
});

describe('normalizePhone: a country code is required', () => {
  it.each([
    ['a Lebanese mobile without a code', '70 123 456'],
    ['a Lebanese number with the trunk 0', '03 123 456'],
    ['a bracketed local number', '(03) 123-456'],
    ['digits that are long enough without a code', '12345678'],
  ])('refuses %s with the country code message', (_label, input) => {
    expect(normalizePhone(input)).toEqual({ ok: false, error: COUNTRY_CODE_ERROR });
  });

  it('asks for the country code in its message', () => {
    expect(COUNTRY_CODE_ERROR).toMatch(/^Choose your country code/);
    expect(COUNTRY_CODE_ERROR).toMatch(/\+961/);
  });
});

describe('normalizePhone: rejected input', () => {
  it.each([
    ['too few digits with a country code', '+9617012'],
    ['too few digits after 00', '00961701'],
    ['too many digits', '+1234567890123456'],
    ['too many digits with 00', '0012345678901234567'],
    ['letters', '+961 call 70123456'],
    ['a plus sign that is not first', '961+70123456'],
    ['a second plus sign', '++96170123456'],
    ['a zero straight after the plus', '+0961701234'],
    ['a zero straight after 00', '000961701234'],
    ['a zero straight after the country code', '+9610 70 123 456'],
    ['a zero straight after a 4-digit code', '+12420123456'],
    ['a stray symbol', '+96170123456#'],
    ['a dot', '+961.70.123.456'],
    ['only a plus sign', '+'],
    ['only a 00 prefix', '00'],
    ['an empty string', ''],
    ['only spaces', '   '],
  ])('rejects %s', (_label, input) => {
    expect(normalizePhone(input)).toEqual({ ok: false, error: PHONE_ERROR });
  });

  it.each([
    ['a number', 96170123456],
    ['null', null],
    ['undefined', undefined],
    ['an array', ['+96170123456']],
  ])('rejects %s, which is not text', (_label, input) => {
    expect(normalizePhone(input)).toEqual({ ok: false, error: PHONE_ERROR });
  });

  it('uses one message that names the length and the country code', () => {
    expect(PHONE_ERROR).toMatch(/8 to 15 digits/);
    expect(PHONE_ERROR).toMatch(/country code/);
  });
});

describe('combinePhone', () => {
  it('joins the dial code and the typed number, with no spaces', () => {
    expect(combinePhone('961', '70 123 456')).toBe('+96170123456');
    expect(combinePhone('44', '7700 900123')).toBe('+447700900123');
  });

  it('drops one leading 0, so the trunk prefix never reaches the number', () => {
    expect(combinePhone('961', '03 123 456')).toBe('+9613123456');
    expect(combinePhone('961', '070 123 456')).toBe('+96170123456');
    expect(combinePhone('44', '07700 900123')).toBe('+447700900123');
  });

  it('gives the same number with and without the trunk 0', () => {
    expect(combinePhone('961', '03 123 456')).toBe(combinePhone('961', '3 123 456'));
  });

  it('ignores spaces, dashes and parentheses', () => {
    expect(combinePhone('961', '(03) 123-456')).toBe('+9613123456');
    expect(combinePhone('961', ' 70-123 456 ')).toBe('+96170123456');
  });

  it('only removes one leading 0', () => {
    expect(combinePhone('961', '003 123 456')).toBe('+96103123456');
  });

  it('returns an empty string when nothing is left to send', () => {
    expect(combinePhone('961', '')).toBe('');
    expect(combinePhone('961', '   ')).toBe('');
    expect(combinePhone('961', '0')).toBe('');
    expect(combinePhone('961', '()-')).toBe('');
  });

  it('keeps other characters so normalizePhone can refuse them', () => {
    expect(combinePhone('961', '70123456#')).toBe('+96170123456#');
    expect(normalizePhone(combinePhone('961', '70123456#'))).toEqual({ ok: false, error: PHONE_ERROR });
  });

  it('combined numbers pass normalizePhone when the national digits are right', () => {
    expect(normalizePhone(combinePhone('961', '03 123 456'))).toEqual({
      ok: true,
      phone: '+9613123456',
      key: '9613123456',
    });
  });
});

describe('startsWithCountryCode', () => {
  it.each(['+961 70 123 456', '+ 70', '00 961 70', '0096170123456', '  (+961) 70', '0 0 70'])(
    'is true for %s, which carries a country code',
    (input) => {
      expect(startsWithCountryCode(input)).toBe(true);
    },
  );

  it.each(['70 123 456', '03 123 456', '(03) 123-456', '0 70 123 456', ''])(
    'is false for %s, which is a national number',
    (input) => {
      expect(startsWithCountryCode(input)).toBe(false);
    },
  );
});
