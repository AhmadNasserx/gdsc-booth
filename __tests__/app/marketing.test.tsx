import { TextEncoder } from 'util';
import { act, render, screen } from '@testing-library/react';
import QRCode from 'qrcode';
import MarketingPage, { metadata } from '@/app/marketing/page';
import { MARKETING_URL, getQrSvg } from '@/app/marketing/qr';

// jsdom does not provide TextEncoder, which the qrcode encoder needs.
Object.assign(globalThis, { TextEncoder });

const SCENE_COUNT = 8;
const LOOP_MS = 51500;
const STEP_MS = 250;
const XML_DECLARATION = /^<\?xml[^>]*\?>\s*/;

/** Index of each scene wrapper (in document order) whose data-state is 'active'. */
function activeIndexes(): number[] {
  const scenes = Array.from(document.querySelectorAll('[data-state]'));
  return scenes.flatMap((scene, index) => (scene.getAttribute('data-state') === 'active' ? [index] : []));
}

/** Renders the async server page on real timers, since the QR generation awaits. */
async function renderPage() {
  const ui = await MarketingPage();
  render(ui);
}

describe('marketing page', () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  describe('metadata', () => {
    it('sets the booth title', () => {
      expect(metadata.title).toBe('BAU Open Doors 2026 · Faculty of Science: Play and Win');
    });

    it('does not block search engines', () => {
      expect(metadata.robots).toBeUndefined();
    });
  });

  describe('QR helper', () => {
    it('points the QR code at the booth URL', () => {
      expect(MARKETING_URL).toBe('https://gdsc-booth.vercel.app/');
    });

    it('returns SVG markup with the XML declaration removed', async () => {
      const svg = await getQrSvg();
      const expected = (
        await QRCode.toString(MARKETING_URL, { type: 'svg', margin: 1, errorCorrectionLevel: 'M' })
      ).replace(XML_DECLARATION, '');

      expect(svg.startsWith('<svg')).toBe(true);
      expect(svg).toBe(expected);
    });
  });

  describe('render', () => {
    it('draws the QR code inside the QR scene', async () => {
      await renderPage();

      expect(document.querySelector('svg')).not.toBeNull();
      expect(document.querySelector('[data-qr="true"] svg')).not.toBeNull();
    });

    it.each([
      'The door is open.',
      'Four steps to play',
      'Emoji Riddles',
      'Memory Match',
      'Tech Trivia',
      'A prize every 20 minutes',
      'Check the leaderboard',
      'Scan now. Play in 3 minutes.',
    ])('shows the "%s" heading', async (title) => {
      await renderPage();

      expect(screen.getAllByText(title).length).toBeGreaterThanOrEqual(1);
    });

    it('shows the BAU and Open Doors logos and the Faculty of Science', async () => {
      await renderPage();

      expect(screen.getByRole('img', { name: 'Beirut Arab University' })).toBeInTheDocument();
      expect(screen.getByRole('img', { name: 'Open Doors 2026' })).toBeInTheDocument();
      expect(screen.getAllByText(/Faculty of Science/).length).toBeGreaterThanOrEqual(1);
    });

    it('offers sound behind a button', async () => {
      await renderPage();

      expect(screen.getByRole('button', { name: /tap for sound/i })).toBeInTheDocument();
    });

    it('prints the booth URL', async () => {
      await renderPage();

      expect(screen.getAllByText(MARKETING_URL).length).toBeGreaterThanOrEqual(1);
    });

    it('renders exactly one wrapper per scene', async () => {
      await renderPage();

      expect(document.querySelectorAll('[data-state]')).toHaveLength(SCENE_COUNT);
    });
  });

  describe('scene loop timing', () => {
    it('starts on the hook scene', async () => {
      await renderPage();

      expect(activeIndexes()).toEqual([0]);
    });

    it('shows every scene during one minute of looping', async () => {
      const ui = await MarketingPage();
      jest.useFakeTimers();
      render(ui);

      const seen = new Set<number>(activeIndexes());
      for (let elapsed = 0; elapsed < 60000; elapsed += STEP_MS) {
        act(() => {
          jest.advanceTimersByTime(STEP_MS);
        });
        for (const index of activeIndexes()) seen.add(index);
      }

      expect(seen).toEqual(new Set([0, 1, 2, 3, 4, 5, 6, 7]));
    });

    it('returns to the hook scene after one full loop', async () => {
      const ui = await MarketingPage();
      jest.useFakeTimers();
      render(ui);

      // The last scene (QR) is still on screen just before the loop ends.
      for (let elapsed = 0; elapsed < LOOP_MS - STEP_MS; elapsed += STEP_MS) {
        act(() => {
          jest.advanceTimersByTime(STEP_MS);
        });
      }
      expect(activeIndexes()).toEqual([7]);

      act(() => {
        jest.advanceTimersByTime(STEP_MS);
      });
      expect(activeIndexes()).toEqual([0]);
    });
  });
});
