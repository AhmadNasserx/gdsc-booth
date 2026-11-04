// Language for the player's screens: English or French. The player picks it on the home page.
// It is kept in localStorage, read through useSyncExternalStore so the server render (always
// English) and the first client render match, and every component re-renders when it changes.
import { useCallback, useSyncExternalStore } from 'react';
import { translateQuestion } from './questions.fr';

export type Lang = 'en' | 'fr';
export const LANGS: readonly Lang[] = ['en', 'fr'];
export const LANG_STORAGE = 'bauOpenDoorsLang';

const listeners = new Set<() => void>();
// Used only when localStorage is unavailable: the choice then lasts for this page load.
let memoryLang: Lang | null = null;

export function isLang(value: unknown): value is Lang {
  return value === 'en' || value === 'fr';
}

/** The language picked last time in this browser, or null when none was picked. */
export function getSavedLang(): Lang | null {
  try {
    const stored = localStorage.getItem(LANG_STORAGE);
    return isLang(stored) ? stored : null;
  } catch {
    // Storage blocked: fall back to the in-memory choice.
    return memoryLang;
  }
}

export function saveLang(lang: Lang): void {
  memoryLang = lang;
  try {
    localStorage.setItem(LANG_STORAGE, lang);
  } catch {
    // Kept in memory for this page load.
  }
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** The picked language, or null before the player has picked one. Null on the server. */
export function usePickedLang(): Lang | null {
  return useSyncExternalStore(subscribe, getSavedLang, () => null);
}

/** The language to show: the picked one, English until a language is picked. */
export function useLang(): Lang {
  return usePickedLang() ?? 'en';
}

type Vars = Record<string, string | number>;

function fill(template: string, vars?: Vars): string {
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (match, key: string) => (key in vars ? String(vars[key]) : match));
}

/** Text of one UI string in the given language. */
export function text(lang: Lang, key: StringKey, vars?: Vars): string {
  return fill(STRINGS[lang][key] ?? STRINGS.en[key], vars);
}

/**
 * The current language with its two helpers: `t` for interface strings and `tq` for question
 * content. `tq` shows a question, hint, option or answer in French when French is picked. The
 * English text stays the value that is sent to and graded by the server.
 */
export function useT() {
  const lang = useLang();
  const t = useCallback((key: StringKey, vars?: Vars) => text(lang, key, vars), [lang]);
  const tq = useCallback((value: string) => (lang === 'fr' ? translateQuestion(value) : value), [lang]);
  return { lang, t, tq };
}

const EN = {
  // Home page
  'home.title': 'Tech and Science Challenge',
  'home.place': 'Beirut Arab University, Tripoli campus',
  'home.faculty': 'Faculty of Science',
  'home.intro1': 'Play three quick games, once each, in order. Your scores add up.',
  'home.intro2': 'The top 3 players win a prize every hour. Finish all three games to qualify.',
  'home.lang': 'Choose your language',
  'home.langHelp': 'The questions will be in this language.',
  'home.name': 'Choose a display name',
  'home.namePlaceholder': 'Your display name…',
  'home.nameInvalid': 'Use letters, numbers, and spaces only (2–30 characters).',
  'home.nameAvailable': 'This name is available!',
  'home.nameMine': 'Welcome back, {name}! Your best scores are kept.',
  'home.nameTaken': 'This name is already taken — choose another.',
  'home.school': 'Your school',
  'home.schoolPick': 'Select your school…',
  'home.schoolOther': 'My school is not in the list',
  'home.schoolOtherLabel': 'School name',
  'home.schoolOtherPlaceholder': 'Type the name of your school…',
  'home.grade': 'Your class',
  'home.track': 'Your section',
  'home.phone': 'Phone number',
  'home.countryCode': 'Country code',
  'home.phoneHelp': 'Only used to contact the winner. Never shown on the leaderboard.',
  'home.phoneInvalid': 'Enter 8 to 15 digits. Spaces, dashes and brackets are fine.',
  'home.phonePrefixed': 'Leave out the + or 00. Choose your country code in the list instead.',
  'home.phoneTaken': 'This phone number is already registered.',
  'home.phoneSent': 'Sent as {phone}',
  'home.consent': 'I agree to be contacted on this number if I win. My number is stored privately and deleted after 48 hours.',
  'home.rules': 'Letters, numbers, and spaces · 2–30 characters · no duplicates. Your name and score appear on the public leaderboard. Your phone number is used only to contact the winner and is never shown publicly. Both are deleted after 48 hours. Each game can be played once.',
  'home.paused': 'The game is paused right now. The leaderboard is still live.',
  'home.start': 'Start',
  'home.starting': 'Starting…',
  'home.leaderboard': 'Live leaderboard',
  'home.prize': 'A prize every hour',
  'home.prizeSub': 'for the top 3 players',
  // Play page
  'play.ready': 'Getting your game ready…',
  'play.starting': 'Starting {game}…',
  'play.startFailed': "Couldn't start the next game",
  'play.safe': 'Your scores so far are safe.',
  'play.tryAgain': 'Try again',
  'play.gameOf': 'Game {n} of {total}',
  'play.expired': 'Your session has ended. Enter your name to keep playing.',
  'play.runEnded': 'That game had already finished, so we moved you on.',
  'common.error': 'Something went wrong. Please try again.',
  // Shared game strings
  'game.yourAnswers': 'Your answers',
  'game.checking': 'Checking your answers…',
  'game.continue': 'Continue',
  'game.streak': 'x{n} streak',
  'game.correct': 'Correct',
  'game.incorrect': 'Incorrect',
  'game.unanswered': 'Unanswered',
  'game.noAnswer': 'No answer',
  'game.correctAnswer': 'Correct answer: {answer}',
  // Emoji Riddles
  'riddles.question': 'Question {n} of {total}',
  'riddles.progress': 'Question progress',
  'riddles.hint': 'Hint: {hint}',
  'riddles.yourPick': 'Your pick: {pick}',
  'riddles.none': 'No riddles this round.',
  'riddles.notQuite': 'Not quite. The answer is {answer}.',
  // Trivia
  'trivia.title': 'Speed Trivia',
  'trivia.sub': '35 seconds · answer as many as you can',
  'trivia.note': 'Answers are checked together when you finish or time runs out.',
  'trivia.start': 'Start!',
  'trivia.correctCount': '{n} correct',
  'trivia.unansweredCount': ' · {n} unanswered',
  'trivia.wrong': 'Wrong',
  'trivia.yourAnswer': 'Your answer: {answer}',
  'trivia.timeLeft': 'Time left',
  'trivia.locked': 'Locked in',
  'trivia.right': 'Correct!',
  'trivia.notQuite': 'Not quite',
  // Memory
  'memory.moves': 'Moves',
  'memory.time': 'Time',
  'memory.pairs': 'Pairs',
  'memory.noMatch': 'No match, try again',
  'memory.find': 'Find the matching pairs',
  'memory.cards': 'Memory cards',
  'memory.cardUp': 'Card {n}, {emoji}',
  'memory.cardDown': 'Card {n}, face down',
  'memory.retry': 'Something went wrong. Try that card again.',
  'memory.done': '🎉 All pairs found in {moves} moves · {secs}s',
  // Result and finish
  'result.done': 'Game done!',
  'result.total': "Your total: {total} pts · You're #{rank}",
  'result.next': 'Next: {game} →',
  'result.see': 'See my results →',
  'result.leaderboard': 'View leaderboard',
  'finish.title': "That's all three games, {name}!",
  'finish.rank': "You're #{rank} on the leaderboard",
  'finish.note1': 'Each game can be played once. This game is part of Open Doors 2026 at the Faculty of Science, Beirut Arab University, Tripoli campus.',
  'finish.note2': "Prizes are given every hour to that hour's top 3 players. Watch the leaderboard screen and stay near the booth.",
  // Sound
  'sound.on': 'Sound on',
  'sound.off': 'Sound off',
} as const;

export type StringKey = keyof typeof EN;

const FR: Record<StringKey, string> = {
  'home.title': 'Défi Sciences et Technologie',
  'home.place': 'Université Arabe de Beyrouth, campus de Tripoli',
  'home.faculty': 'Faculté des Sciences',
  'home.intro1': 'Joue à trois jeux rapides, une fois chacun, dans l’ordre. Tes scores s’additionnent.',
  'home.intro2': 'Les 3 meilleurs joueurs gagnent un prix chaque heure. Termine les trois jeux pour participer.',
  'home.lang': 'Choisis ta langue',
  'home.langHelp': 'Les questions seront dans cette langue.',
  'home.name': 'Choisis un pseudo',
  'home.namePlaceholder': 'Ton pseudo…',
  'home.nameInvalid': 'Lettres, chiffres et espaces uniquement (2 à 30 caractères).',
  'home.nameAvailable': 'Ce pseudo est disponible !',
  'home.nameMine': 'Bon retour, {name} ! Tes meilleurs scores sont conservés.',
  'home.nameTaken': 'Ce pseudo est déjà pris. Choisis-en un autre.',
  'home.school': 'Ton école',
  'home.schoolPick': 'Choisis ton école…',
  'home.schoolOther': 'Mon école n’est pas dans la liste',
  'home.schoolOtherLabel': 'Nom de l’école',
  'home.schoolOtherPlaceholder': 'Écris le nom de ton école…',
  'home.grade': 'Ta classe',
  'home.track': 'Ta section',
  'home.phone': 'Numéro de téléphone',
  'home.countryCode': 'Indicatif du pays',
  'home.phoneHelp': 'Utilisé seulement pour contacter le gagnant. Jamais affiché au classement.',
  'home.phoneInvalid': 'Entre 8 à 15 chiffres. Les espaces, tirets et parenthèses sont acceptés.',
  'home.phonePrefixed': 'N’écris pas le + ou le 00. Choisis plutôt l’indicatif dans la liste.',
  'home.phoneTaken': 'Ce numéro est déjà enregistré.',
  'home.phoneSent': 'Envoyé comme {phone}',
  'home.consent': 'J’accepte d’être contacté·e à ce numéro si je gagne. Mon numéro reste privé et est supprimé après 48 heures.',
  'home.rules': 'Lettres, chiffres et espaces · 2 à 30 caractères · pas de doublons. Ton pseudo et ton score apparaissent au classement public. Ton numéro sert uniquement à contacter le gagnant et n’est jamais affiché. Les deux sont supprimés après 48 heures. Chaque jeu se joue une seule fois.',
  'home.paused': 'Le jeu est en pause pour le moment. Le classement reste en direct.',
  'home.start': 'Commencer',
  'home.starting': 'Démarrage…',
  'home.leaderboard': 'Classement en direct',
  'home.prize': 'Un prix chaque heure',
  'home.prizeSub': 'pour les 3 meilleurs joueurs',
  'play.ready': 'Préparation de ton jeu…',
  'play.starting': 'Lancement de {game}…',
  'play.startFailed': 'Impossible de lancer le jeu suivant',
  'play.safe': 'Tes scores sont bien enregistrés.',
  'play.tryAgain': 'Réessayer',
  'play.gameOf': 'Jeu {n} sur {total}',
  'play.expired': 'Ta session est terminée. Entre ton pseudo pour continuer à jouer.',
  'play.runEnded': 'Ce jeu était déjà terminé, on t’a donc fait passer à la suite.',
  'common.error': 'Un problème est survenu. Réessaie.',
  'game.yourAnswers': 'Tes réponses',
  'game.checking': 'Vérification de tes réponses…',
  'game.continue': 'Continuer',
  'game.streak': 'Série x{n}',
  'game.correct': 'Correct',
  'game.incorrect': 'Incorrect',
  'game.unanswered': 'Sans réponse',
  'game.noAnswer': 'Pas de réponse',
  'game.correctAnswer': 'Bonne réponse : {answer}',
  'riddles.question': 'Question {n} sur {total}',
  'riddles.progress': 'Progression des questions',
  'riddles.hint': 'Indice : {hint}',
  'riddles.yourPick': 'Ton choix : {pick}',
  'riddles.none': 'Pas de devinettes pour cette manche.',
  'riddles.notQuite': 'Pas tout à fait. La réponse est {answer}.',
  'trivia.title': 'Quiz Express',
  'trivia.sub': '35 secondes · réponds à un maximum de questions',
  'trivia.note': 'Les réponses sont vérifiées ensemble à la fin ou quand le temps est écoulé.',
  'trivia.start': 'C’est parti !',
  'trivia.correctCount': '{n} correctes',
  'trivia.unansweredCount': ' · {n} sans réponse',
  'trivia.wrong': 'Faux',
  'trivia.yourAnswer': 'Ta réponse : {answer}',
  'trivia.timeLeft': 'Temps restant',
  'trivia.locked': 'Validé',
  'trivia.right': 'Correct !',
  'trivia.notQuite': 'Pas tout à fait',
  'memory.moves': 'Coups',
  'memory.time': 'Temps',
  'memory.pairs': 'Paires',
  'memory.noMatch': 'Pas de paire, réessaie',
  'memory.find': 'Trouve les paires',
  'memory.cards': 'Cartes mémoire',
  'memory.cardUp': 'Carte {n}, {emoji}',
  'memory.cardDown': 'Carte {n}, face cachée',
  'memory.retry': 'Un problème est survenu. Retourne cette carte à nouveau.',
  'memory.done': '🎉 Toutes les paires trouvées en {moves} coups · {secs} s',
  'result.done': 'Jeu terminé !',
  'result.total': 'Ton total : {total} pts · Tu es n° {rank}',
  'result.next': 'Suivant : {game} →',
  'result.see': 'Voir mes résultats →',
  'result.leaderboard': 'Voir le classement',
  'finish.title': 'Les trois jeux sont terminés, {name} !',
  'finish.rank': 'Tu es n° {rank} au classement',
  'finish.note1': 'Chaque jeu se joue une seule fois. Ce jeu fait partie des Open Doors 2026 de la Faculté des Sciences, Université Arabe de Beyrouth, campus de Tripoli.',
  'finish.note2': 'Un prix est remis chaque heure aux 3 meilleurs joueurs de l’heure. Surveille l’écran du classement et reste près du stand.',
  'sound.on': 'Son activé',
  'sound.off': 'Son coupé',
};

const STRINGS: Record<Lang, Record<StringKey, string>> = { en: EN, fr: FR };

/** Game names and taglines in each language. */
export const GAME_TEXT: Record<Lang, Record<'riddles' | 'memory' | 'trivia', { title: string; tagline: string }>> = {
  en: {
    riddles: { title: 'Emoji Riddles', tagline: 'Decode 5 emoji puzzles' },
    memory: { title: 'Memory Match', tagline: 'Flip cards and match 8 science pairs' },
    trivia: { title: 'Tech Trivia', tagline: '15 fast questions' },
  },
  fr: {
    riddles: { title: 'Devinettes Emoji', tagline: 'Décode 5 énigmes en emoji' },
    memory: { title: 'Memory', tagline: 'Retourne les cartes et trouve 8 paires' },
    trivia: { title: 'Quiz Tech', tagline: '15 questions rapides' },
  },
};
