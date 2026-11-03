import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Page from '@/app/page';

const mockPush = jest.fn();
jest.mock('next/navigation', () => ({ useRouter: () => ({ push: mockPush }) }));

global.fetch = jest.fn();

const PLAYER_KEY = /^[0-9a-f]{64}$/;
const PHONE = '+961 70 123 456';

function availableResponse(extra: Record<string, unknown> = {}) {
  return { ok: true, json: async () => ({ available: true, ...extra }) };
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

function phoneInput() {
  return screen.getByLabelText(/phone number/i);
}

function consentBox() {
  return screen.getByLabelText(/I agree to be contacted on this number/i);
}

/** Types a name and phone number and ticks consent. The name check is answered by the next fetch. */
async function fillForm(name = 'Ahmad', phone = PHONE) {
  await userEvent.type(nameInput(), name);
  await userEvent.type(phoneInput(), phone);
  await userEvent.click(consentBox());
}

describe('Name Entry Page', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (global.fetch as jest.Mock).mockReset();
    sessionStorage.clear();
    localStorage.clear();
  });

  it('renders name input and consent notice', () => {
    render(<Page />);
    expect(nameInput()).toBeInTheDocument();
    expect(consentBox()).toBeInTheDocument();
    expect(screen.getByText(/both are deleted after 48 hours/i)).toBeInTheDocument();
  });

  it('invites players to play three games and win the end-of-day prize', () => {
    render(<Page />);
    expect(screen.getByText(/play three games, once each, in order — your scores add up/i)).toBeInTheDocument();
    expect(screen.getByText(/top the leaderboard by the end of the day to win a prize/i)).toBeInTheDocument();
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

  it('prefills the input with the name saved last time', async () => {
    localStorage.setItem('gdscPlayerName', 'Ahmad');
    (global.fetch as jest.Mock).mockResolvedValue(availableResponse());
    render(<Page />);
    expect(await screen.findByDisplayValue('Ahmad')).toBeInTheDocument();
  });

  it('shows the welcome-back message for a name this browser already holds', async () => {
    localStorage.setItem('gdscPlayerName', 'Ahmad');
    (global.fetch as jest.Mock).mockResolvedValue(availableResponse({ mine: true }));
    render(<Page />);
    await userEvent.type(phoneInput(), PHONE);
    await userEvent.click(consentBox());

    expect(await screen.findByText('Welcome back, Ahmad! Your best scores are kept.')).toBeInTheDocument();
    expect(await startButtonEnabled()).toBeEnabled();
  });

  it('sends the player key with the availability check', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce(availableResponse());
    render(<Page />);
    await userEvent.type(nameInput(), 'Ahmad');

    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
    const [url, init] = (global.fetch as jest.Mock).mock.calls[0] as [string, RequestInit];
    const params = new URL(url, 'http://localhost').searchParams;
    expect(url.startsWith('/api/names/check?')).toBe(true);
    expect(params.get('name')).toBe('Ahmad');
    // The key goes in a header so it never reaches the query string or access logs
    expect(params.has('playerKey')).toBe(false);
    expect(url).not.toMatch(PLAYER_KEY);
    expect((init.headers as Record<string, string>)['x-player-key']).toMatch(PLAYER_KEY);
  });

  it('shows the taken message when the name belongs to someone else', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({ ok: true, json: async () => ({ available: false }) });
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
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce(availableResponse())
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ token: 'test-token' }),
      });

    render(<Page />);
    await fillForm();

    // Wait for the debounced availability check to complete and enable the button
    fireEvent.click(await startButtonEnabled());

    await waitFor(() => expect(mockPush).toHaveBeenCalledWith('/play'));
    expect(sessionStorage.getItem('playerToken')).toBe('test-token');
    expect(sessionStorage.getItem('playerName')).toBe('Ahmad');
    expect(sessionStorage.getItem('playerQuestions')).toBeNull();
  });

  it('posts the name, phone, consent and a 64-character hex player key, and remembers name and phone', async () => {
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce(availableResponse())
      .mockResolvedValueOnce({ ok: true, json: async () => ({ token: 't' }) });

    render(<Page />);
    await fillForm();
    fireEvent.click(await startButtonEnabled());
    await waitFor(() => expect(mockPush).toHaveBeenCalledWith('/play'));

    const [url, init] = (global.fetch as jest.Mock).mock.calls[1];
    expect(url).toBe('/api/session');
    expect(init.method).toBe('POST');
    const body = JSON.parse(init.body);
    expect(body).toEqual({
      name: 'Ahmad',
      phone: PHONE,
      consent: true,
      playerKey: expect.stringMatching(PLAYER_KEY),
    });
    expect(localStorage.getItem('gdscPlayerKey')).toBe(body.playerKey);
    expect(localStorage.getItem('gdscPlayerName')).toBe('Ahmad');
    expect(localStorage.getItem('gdscPlayerPhone')).toBe(PHONE);
  });

  it('starts a returning player with their saved name and the welcome-back status', async () => {
    localStorage.setItem('gdscPlayerName', 'Ahmad');
    localStorage.setItem('gdscPlayerPhone', PHONE);
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce(availableResponse({ mine: true }))
      .mockResolvedValueOnce({ ok: true, json: async () => ({ token: 't' }) });

    render(<Page />);
    await userEvent.click(consentBox());
    fireEvent.click(await startButtonEnabled());

    await waitFor(() => expect(mockPush).toHaveBeenCalledWith('/play'));
    const body = JSON.parse((global.fetch as jest.Mock).mock.calls[1][1].body);
    expect(body).toMatchObject({ name: 'Ahmad', phone: PHONE, consent: true });
  });

  it('shows error message when session creation fails', async () => {
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce(availableResponse())
      .mockResolvedValueOnce({ ok: false, json: async () => ({ error: 'Server error' }) });

    render(<Page />);
    await fillForm();
    fireEvent.click(await startButtonEnabled());

    expect(await screen.findByRole('alert')).toHaveTextContent('Server error');
    expect(mockPush).not.toHaveBeenCalled();
  });

  it('marks the name taken when the server rejects it with 409 and field name', async () => {
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce(availableResponse())
      .mockResolvedValueOnce({
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
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce(availableResponse())
      .mockResolvedValueOnce({
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
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce(availableResponse())
      .mockResolvedValueOnce({
        ok: false,
        status: 409,
        json: async () => ({ error: 'This phone number is already registered.', field: 'phone' }),
      });

    render(<Page />);
    await fillForm();
    fireEvent.click(await startButtonEnabled());
    await screen.findByText('This phone number is already registered.');

    await userEvent.clear(phoneInput());
    await userEvent.type(phoneInput(), '+961 71 999 888');

    expect(screen.queryByText('This phone number is already registered.')).not.toBeInTheDocument();
    expect(await startButtonEnabled()).toBeEnabled();
  });
});

describe('Phone number and consent', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (global.fetch as jest.Mock).mockReset();
    (global.fetch as jest.Mock).mockResolvedValue(availableResponse());
    sessionStorage.clear();
    localStorage.clear();
  });

  it('shows a tel input with the right attributes and a placeholder, with the helper line under it', () => {
    render(<Page />);
    const input = phoneInput();
    expect(input).toHaveAttribute('type', 'tel');
    expect(input).toHaveAttribute('inputmode', 'tel');
    expect(input).toHaveAttribute('autocomplete', 'tel');
    expect(input).toHaveAttribute('placeholder', '+961 70 123 456');
    expect(screen.getByText('Only used to contact the winner. Never shown on the leaderboard.')).toBeInTheDocument();
  });

  it('places the phone field under the name field and the consent box directly under the phone field', () => {
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

  it('keeps Start disabled until the phone number is valid and consent is ticked', async () => {
    render(<Page />);
    await userEvent.type(nameInput(), 'Ahmad');
    await userEvent.type(phoneInput(), PHONE);
    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
    expect(screen.getByRole('button', { name: /start/i })).toBeDisabled();

    await userEvent.click(consentBox());
    expect(await startButtonEnabled()).toBeEnabled();
  });

  it('keeps Start disabled when consent is ticked but the phone is empty', async () => {
    render(<Page />);
    await userEvent.type(nameInput(), 'Ahmad');
    await userEvent.click(consentBox());
    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
    expect(screen.getByRole('button', { name: /start/i })).toBeDisabled();
  });

  it.each([
    ['letters', 'call me maybe'],
    ['too few digits', '12345'],
    ['too many digits', '+1234567890123456'],
    ['a plus sign in the middle', '961+70123456'],
    ['a stray symbol', '70123456#'],
  ])('shows an inline error and keeps Start disabled for a phone with %s', async (_label, phone) => {
    render(<Page />);
    await userEvent.type(nameInput(), 'Ahmad');
    await userEvent.type(phoneInput(), phone);
    await userEvent.click(consentBox());

    expect(await screen.findByText('Enter 8 to 15 digits. Spaces, dashes and brackets are fine.')).toBeInTheDocument();
    expect(phoneInput()).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByRole('button', { name: /start/i })).toBeDisabled();
  });

  it('accepts a local number without a country code, and a 00 prefix', async () => {
    render(<Page />);
    await userEvent.type(nameInput(), 'Ahmad');
    await userEvent.type(phoneInput(), '70 123 456');
    await userEvent.click(consentBox());
    expect(await startButtonEnabled()).toBeEnabled();

    await userEvent.clear(phoneInput());
    await userEvent.type(phoneInput(), '0096170123456');
    expect(await startButtonEnabled()).toBeEnabled();
  });

  it('prefills the phone number from the last visit, but never prefills consent', () => {
    localStorage.setItem('gdscPlayerPhone', PHONE);
    render(<Page />);
    expect(phoneInput()).toHaveValue(PHONE);
    expect(consentBox()).not.toBeChecked();
  });

  it('sends the phone and consent with the session request', async () => {
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce(availableResponse())
      .mockResolvedValueOnce({ ok: true, json: async () => ({ token: 't' }) });

    render(<Page />);
    await userEvent.type(nameInput(), 'Ahmad');
    await userEvent.type(phoneInput(), '  +961 70 123 456 ');
    await userEvent.click(consentBox());
    fireEvent.click(await startButtonEnabled());

    await waitFor(() => expect(mockPush).toHaveBeenCalledWith('/play'));
    const body = JSON.parse((global.fetch as jest.Mock).mock.calls[1][1].body);
    expect(body.phone).toBe(PHONE);
    expect(body.consent).toBe(true);
  });

  it('keeps the phone number out of the availability check', async () => {
    render(<Page />);
    await userEvent.type(nameInput(), 'Ahmad');
    await userEvent.type(phoneInput(), PHONE);
    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
    const urls = (global.fetch as jest.Mock).mock.calls.map(([url]) => String(url));
    expect(urls.every((url) => !url.includes('70123456') && !url.includes('961'))).toBe(true);
  });
});
