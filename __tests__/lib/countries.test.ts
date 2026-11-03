import { COUNTRIES, DEFAULT_COUNTRY, countryLabel, findCountry } from '@/lib/countries';

describe('country list', () => {
  it('covers the whole world, with about 250 countries and territories', () => {
    expect(COUNTRIES.length).toBeGreaterThanOrEqual(240);
  });

  it('is sorted alphabetically by name', () => {
    const names = COUNTRIES.map((country) => country.name);
    expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b, 'en')));
  });

  it('has one entry per ISO code', () => {
    const codes = COUNTRIES.map((country) => country.code);
    expect(new Set(codes).size).toBe(codes.length);
  });

  it('uses two-letter codes and calling codes made of digits only, without a plus sign', () => {
    for (const country of COUNTRIES) {
      expect(country.code).toMatch(/^[A-Z]{2}$/);
      expect(country.dial).toMatch(/^\d{1,4}$/);
      expect(country.name.length).toBeGreaterThan(0);
    }
  });

  it('has no flag emoji in the names', () => {
    for (const country of COUNTRIES) {
      expect(country.name).not.toMatch(/\p{Regional_Indicator}/u);
    }
  });
});

describe('default country', () => {
  it('is Lebanon, with the code +961', () => {
    expect(DEFAULT_COUNTRY).toBe('LB');
    expect(findCountry(DEFAULT_COUNTRY)).toEqual({ name: 'Lebanon', code: 'LB', dial: '961' });
  });
});

describe('findCountry', () => {
  it('finds a country by its code, whatever the case', () => {
    expect(findCountry('GB')).toMatchObject({ name: 'United Kingdom', dial: '44' });
    expect(findCountry('gb')).toMatchObject({ name: 'United Kingdom', dial: '44' });
  });

  it('returns undefined for a code that is not in the list', () => {
    expect(findCountry('XX')).toBeUndefined();
    expect(findCountry('')).toBeUndefined();
  });
});

describe('countryLabel', () => {
  it('shows the name and the dial code in brackets, with no flag', () => {
    expect(countryLabel(findCountry('LB')!)).toBe('Lebanon (+961)');
    expect(countryLabel(findCountry('US')!)).toBe('United States (+1)');
  });
});
