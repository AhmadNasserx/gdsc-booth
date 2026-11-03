import { normalizePhone, PHONE_ERROR } from '@/lib/phone';

describe('normalizePhone: accepted formats', () => {
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

  it.each([
    ['70123456', '70123456'],
    ['70 123 456', '70123456'],
    ['03 123 456', '03123456'],
    ['(03) 123-456', '03123456'],
  ])('keeps a local number %s as its digits %s, without guessing a country code', (input, digits) => {
    expect(normalizePhone(input)).toEqual({ ok: true, phone: digits, key: digits });
  });

  it('gives the same key for the same number in different spellings', () => {
    const keys = ['+961 70 123 456', '+96170123456', '0096170123456', '(+961) 70-123-456'].map((input) => {
      const result = normalizePhone(input);
      return result.ok ? result.key : null;
    });
    expect(new Set(keys)).toEqual(new Set(['96170123456']));
  });

  it('accepts 8 digits and 15 digits, the bounds', () => {
    expect(normalizePhone('12345678')).toMatchObject({ ok: true, key: '12345678' });
    expect(normalizePhone('+123456789012345')).toMatchObject({ ok: true, key: '123456789012345' });
  });
});

describe('normalizePhone: rejected input', () => {
  it.each([
    ['too few digits', '1234567'],
    ['too few digits with a country code', '+9617012'],
    ['too many digits', '1234567890123456'],
    ['too many digits with a country code', '+9617012345678901'],
    ['letters', 'call 70123456'],
    ['a plus sign that is not first', '961+70123456'],
    ['a second plus sign', '++96170123456'],
    ['a zero straight after the plus', '+0961701234'],
    ['a zero straight after 00', '000961701234'],
    ['a stray symbol', '70123456#'],
    ['a dot', '70.123.456'],
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

  it('uses one message that names the length and the optional prefix', () => {
    expect(PHONE_ERROR).toMatch(/8 to 15 digits/);
    expect(PHONE_ERROR).toMatch(/\+ or 00/);
  });
});
