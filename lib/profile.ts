// The school and class a player gives on the home page. Shared by the form and the session route,
// so both accept exactly the same values.
import { SCHOOLS } from './schools';
import type { Lang } from './i18n';

export type Grade = '10' | '11' | '12';
export const GRADES: readonly Grade[] = ['10', '11', '12'];

/** Sections offered in each class. Grade 10 has none. */
export const TRACKS: Record<Grade, readonly string[]> = {
  '10': [],
  '11': ['scientific', 'literature'],
  '12': ['gs', 'se', 'ls'],
};

export const GRADE_LABELS: Record<Lang, Record<Grade, string>> = {
  en: { '10': 'Grade 10', '11': 'Grade 11', '12': 'Grade 12' },
  fr: { '10': 'Seconde (EB10)', '11': 'Première (11e)', '12': 'Terminale (12e)' },
};

export const TRACK_LABELS: Record<Lang, Record<string, string>> = {
  en: { scientific: 'Scientific', literature: 'Literature', gs: 'GS / SG', se: 'SE', ls: 'LS / SV' },
  fr: { scientific: 'Scientifique', literature: 'Littéraire', gs: 'SG / GS', se: 'SE', ls: 'SV / LS' },
};

/** One line for staff, for example "Grade 12 · LS / SV". Always in English. */
export function levelLabel(grade: string, track: string | null | undefined): string {
  const g = GRADE_LABELS.en[grade as Grade] ?? grade;
  const t = track ? TRACK_LABELS.en[track] ?? track : '';
  return t ? `${g} · ${t}` : g;
}

export const SCHOOL_MIN = 2;
export const SCHOOL_MAX = 80;
const SCHOOL_PATTERN = /^[\p{L}\p{N} .,'’()&\-/]+$/u;

export interface Profile {
  school: string;
  /** True when the school was picked from the list, false when the player typed it. */
  schoolListed: boolean;
  grade: Grade;
  track: string | null;
  lang: Lang;
}

export type ProfileCheck = { ok: true; profile: Profile } | { ok: false; field: 'school' | 'grade' | 'lang'; error: string };

/** Checks the profile fields of a session request. Pure. */
export function readProfile(fields: Record<string, unknown>): ProfileCheck {
  const lang = fields.lang;
  if (lang !== 'en' && lang !== 'fr') return { ok: false, field: 'lang', error: 'Choose English or French.' };

  const rawSchool = typeof fields.school === 'string' ? fields.school.replace(/\s+/g, ' ').trim() : '';
  if (rawSchool.length < SCHOOL_MIN || rawSchool.length > SCHOOL_MAX || !SCHOOL_PATTERN.test(rawSchool)) {
    return { ok: false, field: 'school', error: 'Choose your school, or type its name (2 to 80 characters).' };
  }

  const grade = fields.grade;
  if (grade !== '10' && grade !== '11' && grade !== '12') {
    return { ok: false, field: 'grade', error: 'Choose your class: Grade 10, 11 or 12.' };
  }
  const tracks = TRACKS[grade];
  const track = typeof fields.track === 'string' && fields.track ? fields.track : null;
  if (tracks.length === 0 ? track !== null : track === null || !tracks.includes(track)) {
    return { ok: false, field: 'grade', error: 'Choose your section.' };
  }

  return {
    ok: true,
    profile: { school: rawSchool, schoolListed: SCHOOLS.includes(rawSchool), grade, track, lang },
  };
}
