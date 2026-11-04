import { render, screen, fireEvent } from '@testing-library/react';
import SoundToggle from '@/components/SoundToggle';
import { setSoundMuted } from '@/lib/feedback';

beforeEach(() => {
  localStorage.clear();
  setSoundMuted(false);
});

afterEach(() => {
  localStorage.clear();
  Reflect.deleteProperty(navigator, 'vibrate');
});

describe('SoundToggle', () => {
  it('starts unmuted and toggles the stored choice on each click', () => {
    render(<SoundToggle />);
    fireEvent.click(screen.getByRole('button', { name: 'Turn sound off' }));
    expect(screen.getByRole('button', { name: 'Turn sound on' })).toBeInTheDocument();
    expect(localStorage.getItem('gdscSoundMuted')).toBe('1');

    fireEvent.click(screen.getByRole('button', { name: 'Turn sound on' }));
    expect(screen.getByRole('button', { name: 'Turn sound off' })).toBeInTheDocument();
    expect(localStorage.getItem('gdscSoundMuted')).toBe('0');
  });

  it('confirms with a tap when the sound comes back on', () => {
    const vibrate = jest.fn();
    Object.defineProperty(navigator, 'vibrate', { value: vibrate, configurable: true });
    setSoundMuted(true);
    render(<SoundToggle />);

    fireEvent.click(screen.getByRole('button', { name: 'Turn sound on' }));
    expect(vibrate).toHaveBeenCalledWith([6]);
  });
});
