// Pre-recorded voice lines + sound effects (HTMLAudioElement). `say` resolves when the last clip finished
// or `stop()` was called, so callers sequence speech and motion by completion — never by guessed timers.
import { Catalog } from './catalog.js';
import { Settings } from './store.js';

// 0.05 s of silence (16-bit mono WAV, built at runtime) — unlocks the audio elements inside the first user gesture on iOS.
const SILENCE = (() => {
  const rate = 8000, n = 400, buf = new ArrayBuffer(44 + n * 2), v = new DataView(buf);
  const str = (o, s) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
  str(0, 'RIFF'); v.setUint32(4, 36 + n * 2, true); str(8, 'WAVE'); str(12, 'fmt '); v.setUint32(16, 16, true);
  v.setUint16(20, 1, true); v.setUint16(22, 1, true); v.setUint32(24, rate, true); v.setUint32(28, rate * 2, true);
  v.setUint16(32, 2, true); v.setUint16(34, 16, true); str(36, 'data'); v.setUint32(40, n * 2, true);
  let b = ''; const bytes = new Uint8Array(buf); for (let i = 0; i < bytes.length; i++) b += String.fromCharCode(bytes[i]);
  return 'data:audio/wav;base64,' + btoa(b);
})();

function makeAudio() { const a = new Audio(); a.preload = 'auto'; a.setAttribute('playsinline', ''); return a; }

export const Voice = {
  el: makeAudio(),
  caption: '', isSpeaking: false,
  generation: 0, serial: 0, resolveCurrent: null, durations: {}, unlocked: false, listeners: new Set(),

  init() {
    try { if (navigator.audioSession) navigator.audioSession.type = 'playback'; } catch {}
    const unlock = () => {
      if (this.unlocked) return;
      this.unlocked = true;
      for (const a of [this.el, Sound.el]) { try { a.src = SILENCE; a.play().catch(() => {}); } catch {} }
      document.removeEventListener('touchend', unlock, true); document.removeEventListener('click', unlock, true);
    };
    document.addEventListener('touchend', unlock, true);
    document.addEventListener('click', unlock, true);
    this.el.addEventListener('loadedmetadata', () => { if (this.el.dataset.id && isFinite(this.el.duration)) this.durations[this.el.dataset.id] = this.el.duration; });
    this.el.addEventListener('ended', () => this.finish(this.el.dataset.serial));
    this.el.addEventListener('error', () => this.finish(this.el.dataset.serial));
  },
  onChange(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); },
  emit() { for (const l of this.listeners) l(this); },
  get isEnabled() { return Settings.soundEnabled; },

  async say(ids) {
    if (!Array.isArray(ids)) ids = [ids];
    this.generation += 1;
    const gen = this.generation;
    this.stopPlayer();
    this.caption = Catalog.text(ids); this.emit();
    for (let i = 0; i < ids.length; i++) {
      if (gen !== this.generation) return;
      if (i > 0) { await wait(350); if (gen !== this.generation) return; }
      await this.playOne(ids[i]);
    }
    if (gen === this.generation) { this.isSpeaking = false; this.emit(); }
  },

  duration(id) { return this.durations[id] || 2.5; },
  /// Fetch durations ahead of time (hold exercises pace the figure by the enter line's length).
  prefetch(ids) {
    for (const id of ids) {
      if (this.durations[id]) continue;
      const a = new Audio(); a.preload = 'metadata';
      a.addEventListener('loadedmetadata', () => { if (isFinite(a.duration)) this.durations[id] = a.duration; });
      a.src = Catalog.voiceURL(id);
    }
  },

  playOne(id) {
    return new Promise(resolve => {
      if (!this.isEnabled) { setTimeout(resolve, Math.max(300, Catalog.text(id).length * 220)); return; }
      this.serial += 1;
      const serial = String(this.serial);
      this.resolveCurrent = resolve;
      const el = this.el;
      el.dataset.id = id; el.dataset.serial = serial;
      el.src = Catalog.voiceURL(id);
      this.isSpeaking = true; this.emit();
      const p = el.play();
      if (p && p.catch) p.catch(() => this.finish(serial));
      // safety net: never hang if 'ended' is not fired (route change, background)
      const limit = ((this.durations[id] || 6) + 3) * 1000;
      setTimeout(() => this.finish(serial), limit);
    });
  },
  finish(serial) {
    if (this.el.dataset.serial !== serial) return;   // a stale clip must not release the current one
    const r = this.resolveCurrent; this.resolveCurrent = null; if (r) r();
  },
  stop() { this.generation += 1; this.stopPlayer(); this.isSpeaking = false; this.emit(); },
  stopPlayer() {
    try { this.el.pause(); } catch {}
    this.el.dataset.serial = '';
    const r = this.resolveCurrent; this.resolveCurrent = null; if (r) r();
  },
};

export const Sound = {
  el: makeAudio(),
  play(effect) {
    if (!Settings.soundEnabled) return;
    try { this.el.src = 'assets/sounds/' + effect + '.m4a'; this.el.currentTime = 0; const p = this.el.play(); if (p && p.catch) p.catch(() => {}); } catch {}
  },
};

export const wait = ms => new Promise(r => setTimeout(r, ms));

// 「試聽看看」 for the tempo sheet: two reps of 「抬起來／放下」 at that tempo, with the beat beep.
export const TempoDemo = {
  gen: 0,
  async play(t) {
    this.gen += 1; const g = this.gen; Voice.stop();
    for (let i = 0; i < 2; i++) {
      if (g !== this.gen) return;
      Sound.play('beep');
      const start = Date.now();
      await Voice.say(['cue/w_抬起來']);
      await wait(Math.max(0, t.repSeconds / 2 * 1000 - (Date.now() - start)));
      if (g !== this.gen) return;
      await Voice.say(['cue/w_放下']);
      await wait(Math.max(0, t.repSeconds * 1000 - (Date.now() - start)));
    }
  },
  stop() { this.gen += 1; Voice.stop(); },
};

// Keep the screen on during a session / timed test (iOS 16.4+, Android). Silently ignored elsewhere.
export const WakeLock = {
  lock: null, wanted: false,
  async acquire() {
    this.wanted = true;
    try { if ('wakeLock' in navigator && !this.lock) { this.lock = await navigator.wakeLock.request('screen'); this.lock.addEventListener('release', () => { this.lock = null; }); } } catch {}
  },
  release() { this.wanted = false; try { if (this.lock) this.lock.release(); } catch {} this.lock = null; },
  init() { document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && this.wanted) this.acquire(); }); },
};
