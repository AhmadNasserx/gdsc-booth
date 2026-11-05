import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Page from '@/app/page';
import { COUNTRIES } from '@/lib/countries';

const mockPush = jest.fn();
jest.mock('next/navigation', () => ({ useRouter: () => ({ push: mockPush }) }));

const PLAYER_KEY = /^[0-9a-f]{64}$/;
// What the player types after the country code (Lebanon is the default), and what the server receives.
const NATIONAL = '70 123 456';
const SENT = '+96170123456';
// The school and class prefilled for most tests.
const PROFILE = { school: 'Al Iman School', other: true, grade: '12', track: 'ls' };

/**
 * Most tests are about the name and phone, so the language, school and class come prefilled as if
 * from an earlier visit. The tests for those fields clear them first.
 */
function prefillProfile() {
  localStorage.setItem('bauOpenDoorsLang', 'en');
  localStorage.setItem('bauPlayerProfile', JSON.stringify(PROFILE));
}

interface FetchReply {
  ok: boolean;
  status?: number;
  json: () => Promise<unknown>;
}

const STATUS_OPEN: FetchReply = { ok: true, json: async () => ({ paused: false }) };

// Replies for every call except /api/status, taken in the order the page makes them.
let queuedReplies: FetchReply[] = [];
// Answers any other call once the queue is empty. Unset, an unexpected call rejects.
let fallbackReply: FetchReply | null = null;
// Answer to /api/status. A test can swap in a promise that it resolves later.
let statusReply: Promise<FetchReply> = Promise.resolve(STATUS_OPEN);

/** Routes global.fetch by URL: /api/status always uses statusReply, other calls use the queue, then the fallback. */
function routeFetch() {
  global.fetch = jest.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.startsWith('/api/status')) return statusReply;
    const reply = queuedReplies.shift() ?? fallbackReply;
    if (!reply) throw new Error(`Unexpected fetch to ${url}`);
    return reply;
  }) as unknown as typeof fetch;
}

function resetFetch() {
  queuedReplies = [];
  fallbackReply = null;
  statusReply = Promise.resolve(STATUS_OPEN);
  routeFetch();
}

function queueReplies(...replies: FetchReply[]) {
  queuedReplies.push(...replies);
}

function answerEveryCallWith(reply: FetchReply) {
  fallbackReply = reply;
}

/** The first request whose URL starts with the given text, as [url, init]. Throws until it is made, so waitFor can retry. */
function fetchCall(prefix: string): [string, RequestInit] {
  const call = (global.fetch as jest.Mock).mock.calls.find(([url]) => String(url).startsWith(prefix));
  if (!call) throw new Error(`No request was sent to ${prefix}`);
  return call as [string, RequestInit];
}

function availableResponse(extra: Record<string, unknown> = {}): FetchReply {
  return { ok: true, json: async () => ({ available: true, ...extra }) };
}

function tokenResponse(token = 't'): FetchReply {
  return { ok: true, json: async () => ({ token }) };
}

async function startButtonEnabled() {
  return waitFor(() => {
    const btn = screen.getByRole('button', { name: /start/i });
    expect(btn).not.toBeDisabled();
    return btn;
  });
}

function nameInput() {
  return screen.getByPlaceholderText(/display name/i);
}

function countrySelect() {
  return screen.getByLabelText(/country code/i);
}

function phoneInput() {
  return screen.getByLabelText(/phone number/i);
}

function consentBox() {
  return screen.getByLabelText(/I agree to be contacted on this number/i);
}

/** Types a name and national number and ticks consent. The name check is answered by the next queued reply. */
async function fillForm(name = 'Ahmad', national = NATIONAL) {
  await userEvent.type(nameInput(), name);
  await userEvent.type(phoneInput(), national);
  await userEvent.click(consentBox());
}

/** Fills the form for the given country and number, starts the session and returns the sent request body. */
async function startWith(national: string, country?: string) {
  queueReplies(availableResponse(), tokenResponse());
  render(<Page />);
  if (country) await userEvent.selectOptions(countrySelect(), country);
  await userEvent.type(nameInput(), 'Ahmad');
  await userEvent.type(phoneInput(), national);
  await userEvent.click(consentBox());
  fireEvent.click(await startButtonEnabled());
  await waitFor(() => expect(mockPush).toHaveBeenCalledWith('/play'));
  return JSON.parse(fetchCall('/api/session')[1].body as string);
}

describe('Name Entry Page', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    resetFetch();
    sessionStorage.clear();
    localStorage.clear();
    prefillProfile();
  });

  it('renders name input and consent notice', () => {
    render(<Page />);
    expect(nameInput()).toBeInTheDocument();
    expect(consentBox()).toBeInTheDocument();
    expect(screen.getByText(/both are deleted after 48 hours/i)).toBeInTheDocument();
  });

  it('invites players to play three quick games and win an hourly prize', () => {
    render(<Page />);
    expect(screen.getByText('Play three quick games, once each, in order. Your scores add up.')).toBeInTheDocument();
    expect(screen.getByText('The top 3 players win a prize every round. Finish all three games to qualify.')).toBeInTheDocument();
  });

  it('shows the BAU Open Doors and Faculty of Science branding, and no GDSC or Google branding', () => {
    render(<Page />);
    expect(screen.getByRole('heading', { level: 1, name: /^Tech and Science Challenge/ })).toBeInTheDocument();
    expect(screen.getByText('Beirut Arab University, Tripoli campus')).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Beirut Arab University' })).toHaveAttribute('src', '/brand/bau-logo.png');
    expect(screen.getByRole('img', { name: 'Open Doors 2026' })).toHaveAttribute('src', '/brand/open-doors-2026.png');
    expect(screen.getByText('Faculty of Science')).toBeInTheDocument();
    expect(document.body.textContent ?? '').not.toMatch(/gdsc|google/i);
  });

  it('tells players they can play again and that their best score in each game counts', () => {
    render(<Page />);
    expect(screen.getByText(/each game can be played once/i)).toBeInTheDocument();
  });

  it('never mentions a maximum or a single scored game', () => {
    render(<Page />);
    const text = document.body.textContent ?? '';
    expect(text).not.toMatch(/\bmax\b|out of|1000|pick one/i);
  });

  it('Start button is disabled when name is empty', () => {
    render(<Page />);
    expect(screen.getByRole('button', { name: /start/i })).toBeDisabled();
  });

  it('keeps Start disabled until /api/status has answered, even with a complete form', async () => {
    let releaseStatus!: (reply: FetchReply) => void;
    statusReply = new Promise<FetchReply>((resolve) => {
      releaseStatus = resolve;
    });
    answerEveryCallWith(availableResponse());
    render(<Page />);

    await fillForm();
    expect(await screen.findByText('This name is available!')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /start/i })).toBeDisabled();

    releaseStatus(STATUS_OPEN);
    expect(await startButtonEnabled()).toBeEnabled();
  });

  it('enables Start once the form is valid when /api/status reports the game is open', async () => {
    answerEveryCallWith(availableResponse());
    render(<Page />);

    await fillForm();
    expect(await startButtonEnabled()).toBeEnabled();
    expect(global.fetch).toHaveBeenCalledWith('/api/status', expect.anything());
  });

  it('prefills the input with the name saved last time', async () => {
    localStorage.setItem('gdscPlayerName', 'Ahmad');
    answerEveryCallWith(availableResponse());
    render(<Page />);
    expect(await screen.findByDisplayValue('Ahmad')).toBeInTheDocument();
  });

  it('shows the welcome-back message for a name this browser already holds', async () => {
    localStorage.setItem('gdscPlayerName', 'Ahmad');
    answerEveryCallWith(availableResponse({ mine: true }));
    render(<Page />);
    await userEvent.type(phoneInput(), NATIONAL);
    await userEvent.click(consentBox());

    expect(await screen.findByText('Welcome back, Ahmad! Your best scores are kept.')).toBeInTheDocument();
    expect(await startButtonEnabled()).toBeEnabled();
  });

  it('sends the player key with the availability check', async () => {
    queueReplies(availableResponse());
    render(<Page />);
    await userEvent.type(nameInput(), 'Ahmad');

    await waitFor(() => fetchCall('/api/names/check?'));
    const [url, init] = fetchCall('/api/names/check?');
    const params = new URL(url, 'http://localhost').searchParams;
    expect(url.startsWith('/api/names/check?')).toBe(true);
    expect(params.get('name')).toBe('Ahmad');
    // The key goes in a header so it never reaches the query string or access logs
    expect(params.has('playerKey')).toBe(false);
    expect(url).not.toMatch(PLAYER_KEY);
    expect((init.headers as Record<string, string>)['x-player-key']).toMatch(PLAYER_KEY);
  });

  it('shows the taken message when the name belongs to someone else', async () => {
    queueReplies({ ok: true, json: async () => ({ available: false }) });
    render(<Page />);
    await userEvent.type(nameInput(), 'Ahmad');

    expect(await screen.findByText('This name is already taken — choose another.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /start/i })).toBeDisabled();
  });

  it('shows the session notice left by an expired session, once', async () => {
    sessionStorage.setItem('sessionNotice', 'Your session has ended. Enter your name to keep playing.');
    render(<Page />);

    expect(await screen.findByText('Your session has ended. Enter your name to keep playing.')).toBeInTheDocument();
    expect(sessionStorage.getItem('sessionNotice')).toBeNull();
  });

  it('shows no notice when none was left', () => {
    render(<Page />);
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('navigates to /play on successful session creation', async () => {
    queueReplies(availableResponse(), tokenResponse('test-token'));

    render(<Page />);
    await fillForm();

    // Wait for the debounced availability check to complete and enable the button
    fireEvent.click(await startButtonEnabled());

    await waitFor(() => expect(mockPush).toHaveBeenCalledWith('/play'));
    expect(sessionStorage.getItem('playerToken')).toBe('test-token');
    expect(sessionStorage.getItem('playerName')).toBe('Ahmad');
    expect(sessionStorage.getItem('playerQuestions')).toBeNull();
  });

  it('posts the name, the full number, consent and a 64-character hex player key, and remembers the country and number', async () => {
    queueReplies(availableResponse(), tokenResponse());

    render(<Page />);
    await fillForm();
    fireEvent.click(await startButtonEnabled());
    await waitFor(() => expect(mockPush).toHaveBeenCalledWith('/play'));

    const [url, init] = fetchCall('/api/session');
    expect(url).toBe('/api/session');
    expect(init.method).toBe('POST');
    const body = JSON.parse(init.body as string);
    expect(body).toEqual({
      name: 'Ahmad',
      phone: SENT,
      consent: true,
      playerKey: expect.stringMatching(PLAYER_KEY),
      school: 'Al Iman School',
      grade: '12',
      track: 'ls',
      lang: 'en',
    });
    expect(localStorage.getItem('gdscPlayerKey')).toBe(body.playerKey);
    expect(localStorage.getItem('gdscPlayerName')).toBe('Ahmad');
    expect(JSON.parse(localStorage.getItem('gdscPlayerCountryPhone') as string)).toEqual({
      country: 'LB',
      national: NATIONAL,
    });
  });

  it('starts a returning player with their saved country, number and the welcome-back status', async () => {
    localStorage.setItem('gdscPlayerName', 'Ahmad');
    localStorage.setItem('gdscPlayerCountryPhone', JSON.stringify({ country: 'LB', national: NATIONAL }));
    queueReplies(availableResponse({ mine: true }), tokenResponse());

    render(<Page />);
    await userEvent.click(consentBox());
    fireEvent.click(await startButtonEnabled());

    await waitFor(() => expect(mockPush).toHaveBeenCalledWith('/play'));
    const body = JSON.parse(fetchCall('/api/session')[1].body as string);
    expect(body).toMatchObject({ name: 'Ahmad', phone: SENT, consent: true });
  });

  it('shows error message when session creation fails', async () => {
    queueReplies(availableResponse(), { ok: false, json: async () => ({ error: 'Server error' }) });

    render(<Page />);
    await fillForm();
    fireEvent.click(await startButtonEnabled());

    expect(await screen.findByRole('alert')).toHaveTextContent('Server error');
    expect(mockPush).not.toHaveBeenCalled();
  });

  it('marks the name taken when the server rejects it with 409 and field name', async () => {
    queueReplies(availableResponse(), {
      ok: false,
      status: 409,
      json: async () => ({ error: 'Display name already taken. Choose another.', field: 'name' }),
    });

    render(<Page />);
    await fillForm();
    fireEvent.click(await startButtonEnabled());

    expect(await screen.findByRole('alert')).toHaveTextContent('Display name already taken');
    expect(await screen.findByText('This name is already taken — choose another.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /start/i })).toBeDisabled();
    expect(screen.queryByText('This phone number is already registered.')).not.toBeInTheDocument();
  });

  it('shows the phone error under the phone field, and not the name, when the server refuses the phone', async () => {
    queueReplies(availableResponse(), {
      ok: false,
      status: 409,
      json: async () => ({ error: 'This phone number is already registered.', field: 'phone' }),
    });

    render(<Page />);
    await fillForm();
    fireEvent.click(await startButtonEnabled());

    expect(await screen.findByText('This phone number is already registered.')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.queryByText('This name is already taken — choose another.')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /start/i })).toBeDisabled();
  });

  it('enables Start again once the refused phone number is changed', async () => {
    queueReplies(availableResponse(), {
      ok: false,
      status: 409,
      json: async () => ({ error: 'This phone number is already registered.', field: 'phone' }),
    });

    render(<Page />);
    await fillForm();
    fireEvent.click(await startButtonEnabled());
    await screen.findByText('This phone number is already registered.');

    await userEvent.clear(phoneInput());
    await userEvent.type(phoneInput(), '71 999 888');

    expect(screen.queryByText('This phone number is already registered.')).not.toBeInTheDocument();
    expect(await startButtonEnabled()).toBeEnabled();
  });
});

describe('Phone number and consent', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    resetFetch();
    answerEveryCallWith(availableResponse());
    sessionStorage.clear();
    localStorage.clear();
    prefillProfile();
  });

  it('shows a tel input with the right attributes and a national placeholder, with the helper line under it', () => {
    render(<Page />);
    const input = phoneInput();
    expect(input).toHaveAttribute('type', 'tel');
    expect(input).toHaveAttribute('inputmode', 'tel');
    expect(input).toHaveAttribute('autocomplete', 'tel-national');
    expect(input).toHaveAttribute('placeholder', '70 123 456');
    expect(screen.getByText('Only used to contact the winner. Never shown on the leaderboard.')).toBeInTheDocument();
  });

  it('defaults the country code select to Lebanon (+961)', () => {
    render(<Page />);
    expect(countrySelect()).toHaveValue('LB');
    expect(countrySelect()).toHaveDisplayValue('Lebanon (+961)');
  });

  it('lists every country in the native select, sorted by name', () => {
    render(<Page />);
    const options = Array.from(countrySelect().querySelectorAll('option'));
    expect(options).toHaveLength(COUNTRIES.length);
    expect(options[0]).toHaveTextContent(COUNTRIES[0].name);
    expect(screen.getByRole('option', { name: 'United Kingdom (+44)' })).toBeInTheDocument();
  });

  it('puts the country picker and the number in the same row', () => {
    render(<Page />);
    expect(countrySelect().parentElement).toBe(phoneInput().parentElement);
  });

  it('places the phone field under the name field and the consent box directly under the phone row', () => {
    render(<Page />);
    const name = nameInput();
    const phone = phoneInput();
    const consent = consentBox();
    expect(name.compareDocumentPosition(phone) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(phone.compareDocumentPosition(consent) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('leaves consent unticked by default', () => {
    render(<Page />);
    expect(consentBox()).not.toBeChecked();
  });

  it('keeps Start disabled until the number is valid and consent is ticked', async () => {
    render(<Page />);
    await userEvent.type(nameInput(), 'Ahmad');
    await userEvent.type(phoneInput(), NATIONAL);
    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
    expect(screen.getByRole('button', { name: /start/i })).toBeDisabled();

    await userEvent.click(consentBox());
    expect(await startButtonEnabled()).toBeEnabled();
  });

  it('keeps Start disabled when consent is ticked but the number is empty', async () => {
    render(<Page />);
    await userEvent.type(nameInput(), 'Ahmad');
    await userEvent.click(consentBox());
    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
    expect(screen.getByRole('button', { name: /start/i })).toBeDisabled();
  });

  it.each([
    ['letters', 'call me maybe'],
    ['too few digits', '1234'],
    ['too many digits', '1234567890123'],
    ['a plus sign in the middle', '70+123456'],
    ['a stray symbol', '70123456#'],
  ])('shows an inline error and keeps Start disabled for a number with %s', async (_label, national) => {
    render(<Page />);
    await userEvent.type(nameInput(), 'Ahmad');
    await userEvent.type(phoneInput(), national);
    await userEvent.click(consentBox());

    expect(await screen.findByText('Enter 8 to 15 digits. Spaces, dashes and brackets are fine.')).toBeInTheDocument();
    expect(phoneInput()).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByRole('button', { name: /start/i })).toBeDisabled();
  });

  it('accepts a local number under the default country, and shows the full number it will send', async () => {
    render(<Page />);
    await userEvent.type(nameInput(), 'Ahmad');
    await userEvent.type(phoneInput(), NATIONAL);
    await userEvent.click(consentBox());
    expect(await startButtonEnabled()).toBeEnabled();
    expect(screen.getByText(`Sent as ${SENT}`)).toBeInTheDocument();
  });

  it.each([
    ['a plus sign', '+961 70 123 456'],
    ['a 00 prefix', '0096170123456'],
  ])('refuses %s typed into the number field, since the country is picked above', async (_label, typed) => {
    render(<Page />);
    await userEvent.type(nameInput(), 'Ahmad');
    await userEvent.type(phoneInput(), typed);
    await userEvent.click(consentBox());

    expect(await screen.findByText(/leave out the \+ or 00/i)).toBeInTheDocument();
    expect(phoneInput()).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByRole('button', { name: /start/i })).toBeDisabled();
  });

  it('sends the number with the picked country, not Lebanon', async () => {
    const body = await startWith('07700 900123', 'GB');
    expect(body.phone).toBe('+447700900123');
  });

  it.each(['03 123 456', '3 123 456'])(
    'sends %s and 3 123 456 as the same number, with the trunk 0 dropped',
    async (typed) => {
      const body = await startWith(typed);
      expect(body.phone).toBe('+9613123456');
    },
  );

  it('prefills the country and number from the last visit, but never prefills consent', () => {
    localStorage.setItem('gdscPlayerCountryPhone', JSON.stringify({ country: 'GB', national: '7700 900123' }));
    render(<Page />);
    expect(countrySelect()).toHaveValue('GB');
    expect(phoneInput()).toHaveValue('7700 900123');
    expect(consentBox()).not.toBeChecked();
  });

  it('ignores the raw number saved by the previous version and starts on Lebanon', () => {
    localStorage.setItem('gdscPlayerPhone', '+961 70 123 456');
    render(<Page />);
    expect(countrySelect()).toHaveValue('LB');
    expect(phoneInput()).toHaveValue('');
  });

  it('sends the number and consent with the session request, trimmed', async () => {
    queueReplies(availableResponse(), tokenResponse());

    render(<Page />);
    await userEvent.type(nameInput(), 'Ahmad');
    await userEvent.type(phoneInput(), '  70 123 456 ');
    await userEvent.click(consentBox());
    fireEvent.click(await startButtonEnabled());

    await waitFor(() => expect(mockPush).toHaveBeenCalledWith('/play'));
    const body = JSON.parse(fetchCall('/api/session')[1].body as string);
    expect(body.phone).toBe(SENT);
    expect(body.consent).toBe(true);
  });

  it('keeps the phone number out of the availability check', async () => {
    render(<Page />);
    await userEvent.type(nameInput(), 'Ahmad');
    await userEvent.type(phoneInput(), NATIONAL);
    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
    const urls = (global.fetch as jest.Mock).mock.calls.map(([url]) => String(url));
    expect(urls.every((url) => !url.includes('70123456') && !url.includes('961'))).toBe(true);
  });

  describe('language, school and class', () => {
    function langRadio(name: RegExp) {
      return screen.getByRole('radio', { name });
    }

    it('keeps Start disabled until a language is picked, then remembers it', async () => {
      localStorage.removeItem('bauOpenDoorsLang');
      answerEveryCallWith(availableResponse());
      render(<Page />);
      await fillForm();
      await waitFor(() => expect(screen.getByRole('button', { name: /start/i })).toBeDisabled());
      await userEvent.click(langRadio(/english/i));
      expect(langRadio(/english/i)).toHaveAttribute('aria-checked', 'true');
      expect(await startButtonEnabled()).toBeEnabled();
      expect(localStorage.getItem('bauOpenDoorsLang')).toBe('en');
    });

    it('switches the form to French when Français is picked', async () => {
      render(<Page />);
      await userEvent.click(langRadio(/français/i));
      expect(screen.getByRole('heading', { level: 1, name: /^Défi Sciences et Technologie/ })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /commencer/i })).toBeInTheDocument();
      expect(screen.getByText('Faculté des Sciences')).toBeInTheDocument();
    });

    it('needs a school: a typed one when the school is not in the list', async () => {
      localStorage.removeItem('bauPlayerProfile');
      answerEveryCallWith(availableResponse());
      render(<Page />);
      await fillForm();
      await userEvent.click(screen.getByRole('radio', { name: 'Grade 10' }));
      await waitFor(() => expect(screen.getByRole('button', { name: /start/i })).toBeDisabled());
      await userEvent.selectOptions(screen.getByLabelText('Your school'), 'My school is not in the list');
      await userEvent.type(screen.getByPlaceholderText(/type the name of your school/i), 'Rawdat Al Fayhaa');
      expect(await startButtonEnabled()).toBeEnabled();
    });

    it('asks for a section in Grade 11 and Grade 12 only', async () => {
      localStorage.removeItem('bauPlayerProfile');
      render(<Page />);
      await userEvent.click(screen.getByRole('radio', { name: 'Grade 10' }));
      expect(screen.queryByRole('radiogroup', { name: 'Your section' })).toBeNull();
      await userEvent.click(screen.getByRole('radio', { name: 'Grade 11' }));
      expect(screen.getByRole('radio', { name: 'Scientific' })).toBeInTheDocument();
      expect(screen.getByRole('radio', { name: 'Literature' })).toBeInTheDocument();
      await userEvent.click(screen.getByRole('radio', { name: 'Grade 12' }));
      expect(screen.getByRole('radio', { name: 'GS / SG' })).toBeInTheDocument();
      expect(screen.getByRole('radio', { name: 'SE' })).toBeInTheDocument();
      expect(screen.getByRole('radio', { name: 'LS / SV' })).toBeInTheDocument();
    });

    it('sends the school, class, section and language with the session', async () => {
      localStorage.removeItem('bauPlayerProfile');
      queueReplies(availableResponse(), tokenResponse());
      render(<Page />);
      await userEvent.click(langRadio(/français/i));
      await userEvent.selectOptions(screen.getByLabelText('Ton école'), 'Mon école n’est pas dans la liste');
      await userEvent.type(screen.getByPlaceholderText(/écris le nom de ton école/i), 'Lycée Al Fayhaa');
      await userEvent.click(screen.getByRole('radio', { name: 'Première (11e)' }));
      await userEvent.click(screen.getByRole('radio', { name: 'Scientifique' }));
      await userEvent.type(screen.getByPlaceholderText(/ton pseudo/i), 'Ahmad');
      await userEvent.type(screen.getByLabelText(/numéro de téléphone/i), NATIONAL);
      await userEvent.click(screen.getByLabelText(/j’accepte d’être contacté/i));
      fireEvent.click(await waitFor(() => {
        const btn = screen.getByRole('button', { name: /commencer/i });
        expect(btn).not.toBeDisabled();
        return btn;
      }));
      await waitFor(() => expect(mockPush).toHaveBeenCalledWith('/play'));
      const body = JSON.parse(fetchCall('/api/session')[1].body as string);
      expect(body).toMatchObject({ school: 'Lycée Al Fayhaa', grade: '11', track: 'scientific', lang: 'fr' });
      expect(JSON.parse(localStorage.getItem('bauPlayerProfile') as string)).toEqual({
        school: 'Lycée Al Fayhaa',
        other: true,
        grade: '11',
        track: 'scientific',
      });
    });
  });
});
