'use client';

import { useEffect, useRef, useState } from 'react';
import styles from './marketing.module.css';

/**
 * Background music for the booth loop, made with Web Audio (no audio files). Browsers only play
 * sound after a tap, so it starts from a button, or from the first click or key press on the page.
 * The tune: a driving vi–IV–I–V loop in C at 128 BPM with a bright arpeggio and a hook every
 * second phrase.
 */
const BPM = 128;
const S16 = 60 / BPM / 4;
const CHORDS = [[57, 60, 64], [53, 57, 60], [60, 64, 67], [55, 59, 62]];
const ROOTS = [33, 29, 36, 31];
const _ = 0;
const HOOK = [
  76, _, 76, _, 81, _, 79, _, 76, _, _, _, 72, _, 74, _,
  76, _, _, _, 77, _, 76, _, 72, _, _, _, 69, _, _, _,
  67, _, 72, _, 76, _, 79, _, 81, _, 79, _, 76, _, 72, _,
  74, _, _, _, 71, _, 74, _, 79, _, _, _, _, _, _, _,
];
const ARP = [0, 1, 2, 1, 2, 0, 1, 2];
const mf = (m: number) => 440 * Math.pow(2, (m - 69) / 12);

class Music {
  private ac: AudioContext;
  private out: GainNode;
  private noise: AudioBuffer;
  private next = 0;
  private step = 0;
  private timer: number;

  constructor() {
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    this.ac = new Ctx();
    const comp = this.ac.createDynamicsCompressor();
    comp.threshold.value = -16;
    comp.ratio.value = 4;
    comp.connect(this.ac.destination);
    this.out = this.ac.createGain();
    this.out.gain.value = 0.28;
    this.out.connect(comp);
    this.noise = this.ac.createBuffer(1, this.ac.sampleRate, this.ac.sampleRate);
    const data = this.noise.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    this.next = this.ac.currentTime + 0.1;
    this.timer = window.setInterval(() => this.schedule(), 25);
  }

  set on(value: boolean) {
    this.out.gain.setTargetAtTime(value ? 0.28 : 0, this.ac.currentTime, 0.05);
    if (value) void this.ac.resume();
  }

  stop() {
    window.clearInterval(this.timer);
    void this.ac.close();
  }

  private tone(f: number, t: number, dur: number, type: OscillatorType, vol: number, slide?: number) {
    const o = this.ac.createOscillator();
    const g = this.ac.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(slide, t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g);
    g.connect(this.out);
    o.start(t);
    o.stop(t + dur + 0.03);
  }

  private hiss(t: number, dur: number, vol: number, freq: number) {
    const s = this.ac.createBufferSource();
    s.buffer = this.noise;
    const f = this.ac.createBiquadFilter();
    f.type = 'highpass';
    f.frequency.value = freq;
    const g = this.ac.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f);
    f.connect(g);
    g.connect(this.out);
    s.start(t);
    s.stop(t + dur + 0.03);
  }

  private play(i: number, t: number) {
    const bar = Math.floor(i / 16) % 4;
    const s = i % 16;
    if (s % 4 === 0) this.tone(150, t, 0.28, 'sine', 0.9, 42);
    if (s === 4 || s === 12) {
      this.hiss(t, 0.16, 0.45, 1400);
      this.tone(210, t, 0.08, 'triangle', 0.25, 120);
    }
    if (s % 4 === 2) this.hiss(t, 0.09, 0.2, 7000);
    else if (s % 2 === 1) this.hiss(t, 0.03, 0.07, 9000);
    if (s % 2 === 0) {
      const root = ROOTS[bar] + (s % 4 === 2 ? 12 : 0);
      this.tone(mf(root), t, S16 * 1.8, 'sawtooth', 0.15);
      this.tone(mf(root), t, S16 * 1.8, 'triangle', 0.22);
    }
    this.tone(mf(CHORDS[bar][ARP[s % 8]] + 12 + (s >= 8 ? 12 : 0)), t, S16 * 0.9, 'square', 0.035);
    if (Math.floor(i / 64) % 2 === 1) {
      const m = HOOK[i % 64];
      if (m) this.tone(mf(m), t, S16 * 1.9, 'square', 0.07);
    }
  }

  private schedule() {
    const now = this.ac.currentTime;
    if (this.next < now - 0.2) this.next = now + 0.05;
    while (this.next < now + 0.12) {
      this.play(this.step, this.next);
      this.next += S16;
      this.step++;
    }
  }
}

export default function BoothSound() {
  const musicRef = useRef<Music | null>(null);
  const [on, setOn] = useState(false);

  function toggle() {
    if (!musicRef.current) {
      try {
        musicRef.current = new Music();
      } catch {
        return; // No Web Audio here: the loop simply stays silent.
      }
    }
    const next = !on;
    musicRef.current.on = next;
    setOn(next);
  }

  // The first click or key press anywhere on the screen starts the music once.
  const toggleRef = useRef(toggle);
  useEffect(() => {
    toggleRef.current = toggle;
  });
  useEffect(() => {
    const start = (event: Event) => {
      if ((event.target as HTMLElement | null)?.closest?.('[data-sound]')) return;
      if (!musicRef.current) toggleRef.current();
      window.removeEventListener('pointerdown', start);
      window.removeEventListener('keydown', start);
    };
    window.addEventListener('pointerdown', start);
    window.addEventListener('keydown', start);
    return () => {
      window.removeEventListener('pointerdown', start);
      window.removeEventListener('keydown', start);
      musicRef.current?.stop();
    };
  }, []);

  return (
    <button type="button" data-sound data-on={on} onClick={toggle} className={styles.sound}>
      <span aria-hidden="true">{on ? '🔊' : '🔈'}</span>
      {on ? 'Sound on' : 'Tap for sound'}
    </button>
  );
}
