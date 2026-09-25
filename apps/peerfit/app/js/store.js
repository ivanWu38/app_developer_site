// Local persistence (localStorage). Everything stays in this browser — no server, no account.
// Mirrors DataStore (people / measurements / sessions), SettingsStore, StreakTracker, SessionCheckpointStore.
import { Schedule } from './engine.js';

const K = n => 'peerfit_' + n;
function read(key, fallback) { try { const s = localStorage.getItem(key); return s ? JSON.parse(s) : fallback; } catch { return fallback; } }
function write(key, v) { try { localStorage.setItem(key, JSON.stringify(v)); } catch (e) { console.warn('save failed', e); } }

export function uuid() {
  if (crypto.randomUUID) return crypto.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => { const r = Math.random() * 16 | 0; return (c === 'x' ? r : (r & 3 | 8)).toString(16); });
}
const now = () => new Date().toISOString();

// ---- Person ----------------------------------------------------------------
export function newPerson(nickname, birthYear = null, isMe = false) {
  return {
    id: uuid(), nickname, birthYear, isMe, createdAt: now(),
    level: null, plus: false, levelSource: 'measured', measuredAt: null, nextRetestAt: null, programStart: null,
    approximate: false, incomplete: false, referral: false, flags: [],
    status: 'ok', sentAt: null, conditions: [], lastActivityDate: null, adjustments: {},
    measurements: [], sessions: [],
  };
}
export function age(p) { return p.birthYear ? new Date().getFullYear() - p.birthYear : null; }
export function displayName(p) { return p.isMe ? '我' : p.nickname; }
export function activeSessions(p) { return p.sessions.filter(s => s.kind === 'wheel' || s.kind === 'walk'); }

// ---- DB ---------------------------------------------------------------------
export const DB = {
  people: [],
  load() {
    const d = read(K('db'), null);
    this.people = d && Array.isArray(d.people) ? d.people : [];
    for (const p of this.people) { p.measurements ||= []; p.sessions ||= []; p.adjustments ||= {}; p.flags ||= []; p.conditions ||= []; }
  },
  save() { write(K('db'), { people: this.people }); },
  me() {
    let m = this.people.find(p => p.isMe);
    if (!m) { m = newPerson('我', null, true); this.people.unshift(m); this.save(); }
    return m;
  },
  friends() { return this.people.filter(p => !p.isMe); },
  find(id) { return this.people.find(p => p.id === id) || null; },
  insert(p) { this.people.push(p); this.save(); return p; },
  remove(id) { this.people = this.people.filter(p => p.id !== id); this.save(); },
  wipe() { this.people = []; this.save(); },
};

export function newMeasurement(input, result) {
  return { id: uuid(), date: now(), level: result.level, plus: result.plus, input, result, isPractice: false };
}
export function newSessionLog(kind, done, total, minutes, partial, week) {
  return { id: uuid(), date: now(), kind, exercisesDone: done, exercisesTotal: total, minutes, partial, rpe: null, fell: false, week };
}

// ---- Settings ---------------------------------------------------------------
export const FontSizes = [
  { id: 'large', label: '大', scale: 1 },
  { id: 'larger', label: '更大', scale: 1.18 },
  { id: 'largest', label: '最大', scale: 1.4 },
];
export const Tempos = [
  { id: 'slowest', label: '很慢', repSeconds: 7.0, stepSeconds: 2.6 },
  { id: 'slow', label: '慢', repSeconds: 5.0, stepSeconds: 2.0 },
  { id: 'medium', label: '中', repSeconds: 4.0, stepSeconds: 1.5 },
  { id: 'fast', label: '快', repSeconds: 3.0, stepSeconds: 1.2 },
];
export const Appearances = [
  { id: 'system', label: '跟隨系統' }, { id: 'light', label: '淺色' }, { id: 'dark', label: '深色' },
];

const defaults = { fontSize: 'large', tempo: 'medium', sessionSets: 0, consentAccepted: false, soundEnabled: true, appearance: 'system', homeHintDismissed: false };
export const Settings = {
  ...defaults,
  load() { Object.assign(this, defaults, read(K('settings'), {})); },
  set(k, v) { this[k] = v; const o = {}; for (const key of Object.keys(defaults)) o[key] = this[key]; write(K('settings'), o); },
  get tempoObj() { return Tempos.find(t => t.id === this.tempo) || Tempos[2]; },
  get fontObj() { return FontSizes.find(f => f.id === this.fontSize) || FontSizes[0]; },
  reset() { Object.assign(this, defaults); localStorage.removeItem(K('settings')); },
};

// ---- Streak ("連續 N 天有打開") --------------------------------------------------
export const Streak = {
  get count() { return read(K('streak'), { count: 0 }).count || 0; },
  recordOpen(today = new Date()) {
    const s = read(K('streak'), { count: 0, last: null });
    if (s.last && Schedule.isSameDay(new Date(s.last), today)) return;
    s.count = (s.last && Schedule.daysBetween(new Date(s.last), today) === 1) ? s.count + 1 : 1;
    s.last = today.toISOString(); write(K('streak'), s);
  },
  reset() { localStorage.removeItem(K('streak')); },
};

// ---- Interrupted-session checkpoint (valid 12 h) ------------------------------------
export const Checkpoint = {
  validity: 12 * 3600 * 1000,
  save(c) { if (c) write(K('checkpoint'), c); else localStorage.removeItem(K('checkpoint')); },
  load(personID) {
    const c = read(K('checkpoint'), null);
    if (!c || c.personID !== personID || Date.now() - new Date(c.savedAt).getTime() >= this.validity) return null;
    return c;
  },
  clear() { localStorage.removeItem(K('checkpoint')); },
};

export function wipeAll() {
  DB.wipe(); Checkpoint.clear(); Streak.reset(); Settings.reset();
}
