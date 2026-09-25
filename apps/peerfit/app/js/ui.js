// Navigation (screen stack + tab bar, wired to browser history) and the HTML building blocks (Components.swift).
import { Schedule } from './engine.js';

export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const nl = s => esc(s).replace(/\n/g, '<br>');

// ---- Nav -----------------------------------------------------------------------------------
// A screen is { view() → html, mount(el)?, unmount()?, act: {name: fn}?, tab?: 'home'|'friends'|'settings' }.
export const Nav = {
  root: null, stack: [], tabs: {}, currentTab: 'home', tabBarEl: null, suppress: false,
  init(root, tabs, tabBarEl) {
    this.root = root; this.tabs = tabs; this.tabBarEl = tabBarEl;
    root.addEventListener('click', e => {
      const t = e.target.closest('[data-act]'); if (!t || t.disabled) return;
      const s = this.top(); if (!s || !s.act) return;
      const fn = s.act[t.dataset.act]; if (fn) { e.preventDefault(); fn(t, e); }
    });
    root.addEventListener('change', e => {
      const t = e.target.closest('[data-change]'); if (!t) return;
      const s = this.top(); const fn = s && s.act && s.act[t.dataset.change]; if (fn) fn(t, e);
    });
    root.addEventListener('input', e => {
      const t = e.target.closest('[data-input]'); if (!t) return;
      const s = this.top(); const fn = s && s.act && s.act[t.dataset.input]; if (fn) fn(t, e);
    });
    window.addEventListener('popstate', e => {
      const d = (e.state && e.state.d) || 1, sub = (e.state && e.state.s) || 0;
      if (d < this.stack.length) { while (this.stack.length > d) this.realPop(); this.render(); }
      else if (d > this.stack.length) history.replaceState({ d: this.stack.length, s: this.top().subDepth || 0 }, '');
      else { // same screen: a step inside a flow (screening / setup) went back
        const t = this.top(); if (!t) return;
        if (sub < (t.subDepth || 0)) { t.subDepth = sub; if (t.onHistoryBack) t.onHistoryBack(); }
        else history.replaceState({ d, s: t.subDepth || 0 }, '');
      }
    });
    history.replaceState({ d: 1, s: 0 }, '');
  },
  top() { return this.stack[this.stack.length - 1]; },
  showTab(tab) {
    this.currentTab = tab;
    while (this.stack.length) this.realPop();
    const s = this.tabs[tab](); s.tab = tab;
    this.stack.push(s); history.replaceState({ d: 1, s: 0 }, ''); this.render();
  },
  push(screen) { this.stack.push(screen); history.pushState({ d: this.stack.length, s: 0 }, ''); this.render(); },
  /// A step inside the top screen (so the browser/Android back button goes one step back, not out of the flow).
  subPush() { const t = this.top(); t.subDepth = (t.subDepth || 0) + 1; history.pushState({ d: this.stack.length, s: t.subDepth }, ''); },
  /// Replace the top screen (no history entry).
  replace(screen) { this.realPop(); this.stack.push(screen); this.render(); },
  /// Leave the top screen, including any steps it pushed.
  pop() { if (this.stack.length > 1) history.go(-(1 + (this.top().subDepth || 0))); },
  /// Go back one step inside a flow, or leave it when there is no step left.
  back() { history.back(); },
  realPop() { const s = this.stack.pop(); if (s && s.unmount) { try { s.unmount(); } catch (e) { console.error(e); } } },
  refresh() { this.render(); },
  render() {
    const s = this.top(); if (!s) return;
    this.root.innerHTML = s.view();
    this.root.scrollTop = 0;
    const sc = this.root.querySelector('.scroll'); if (sc) sc.scrollTop = 0;
    if (s.mount) s.mount(this.root);
    document.body.classList.toggle('has-tabbar', !!s.tab);
    if (this.tabBarEl) { this.tabBarEl.hidden = !s.tab; for (const b of this.tabBarEl.querySelectorAll('button')) b.classList.toggle('on', b.dataset.tab === s.tab); }
  },
  /// Patch by id without a full re-render (frequently changing text).
  patch(id, html) { const el = document.getElementById(id); if (el && el.innerHTML !== html) el.innerHTML = html; },
};

// ---- Components ------------------------------------------------------------------------------
export function topBar({ back = '離開', title = '', trailing = '', act = 'back' } = {}) {
  const chevron = back !== '取消' && back !== '關閉';
  return `<div class="topbar"><button class="tb-back ${chevron ? '' : 'accent'}" data-act="${act}">${chevron ? '<span class="chev">‹</span>' : ''}${esc(back)}</button><div class="tb-title">${esc(title)}</div><div class="tb-trail">${esc(trailing)}</div></div>`;
}
export function pageTitle(title, lead) {
  if (!title && !lead) return '';
  return `<div class="pagetitle">${title ? `<h1>${nl(title)}</h1>` : ''}${lead ? `<p class="lead">${nl(lead)}</p>` : ''}</div>`;
}
/// Screen scaffold: [topbar] + scrolling content + pinned bottom actions. `fill` = content does not scroll, a .flex spacer absorbs space.
export function scaffold({ top = '', title = null, lead = null, content = '', bottom = '', fill = false, centered = false, cls = '' } = {}) {
  return `<div class="screen ${cls}">${top}<div class="${fill ? 'fillbody' : 'scroll'} ${centered ? 'centered' : ''}"><div class="col">${pageTitle(title, lead)}${fill && centered ? '<div class="flex"></div>' : ''}${content}${fill ? '<div class="flex"></div>' : ''}</div></div>${bottom ? `<div class="bottom"><div class="col">${bottom}</div></div>` : ''}</div>`;
}
export function bigBtn(title, act, { kind = 'primary', huge = false, subtitle = null, icon = null, disabled = false, id = '', extra = '' } = {}) {
  return `<button class="big ${kind} ${huge ? 'huge' : ''}" data-act="${act}" ${disabled ? 'disabled' : ''} ${id ? `id="${id}"` : ''} ${extra}><span class="bt">${icon ? `<span class="ic">${icon}</span>` : ''}${esc(title)}</span>${subtitle ? `<span class="bs">${esc(subtitle)}</span>` : ''}</button>`;
}
export const quietBtn = (title, act, extra = '') => `<button class="quiet" data-act="${act}" ${extra}>${esc(title)}</button>`;
export const row2 = (a, b) => `<div class="row2">${a}${b}</div>`;
export const softCard = (html, tint = '') => `<div class="card ${tint}">${html}</div>`;
export const voiceBubble = (text, id = '') => `<div class="voice" ${id ? `id="${id}"` : ''}><span class="spk">🔊</span><span class="vt">${nl(text)}</span></div>`;
export const pill = (text, tint = '') => `<span class="pill ${tint}">${esc(text)}</span>`;
export const sectionLabel = text => `<div class="seclabel">${esc(text)}</div>`;
export const hairlineList = rows => `<div class="hl">${rows.filter(Boolean).join('')}</div>`;
export function hrow({ label, value = null, chevron = false, danger = false, act = null, html = null }) {
  const inner = html ?? `<span class="lbl ${danger ? 'danger' : ''}">${esc(label)}</span>${value != null ? `<span class="val">${esc(value)}</span>` : ''}${chevron ? '<span class="chevr">›</span>' : ''}`;
  return act ? `<button class="hrow" data-act="${act}">${inner}</button>` : `<div class="hrow">${inner}</div>`;
}
export const numberedRow = (n, text) => `<div class="nrow"><span class="n">${n}</span><span>${esc(text)}</span></div>`;
export const stepRow = (n, text) => `<div class="srow"><span class="dot">${n}</span><span>${esc(text)}</span></div>`;
export function optionCard({ title, subtitle = null, selected = false, chevron = false, leading = '', act, data = '' }) {
  return `<button class="opt ${selected ? 'sel' : ''}" data-act="${act}" ${data}>${leading}<span class="ot"><span class="t">${esc(title)}</span>${subtitle ? `<span class="s">${esc(subtitle)}</span>` : ''}</span>${selected ? '<span class="chk">✓</span>' : chevron ? '<span class="chevr accent">›</span>' : ''}</button>`;
}
export const checkRow = (text, on, act, data = '') => `<button class="crow" data-act="${act}" ${data} aria-pressed="${on}"><span class="box ${on ? 'on' : ''}">${on ? '✓' : ''}</span><span>${esc(text)}</span></button>`;
export const textField = (id, value, placeholder, { type = 'text', inputmode = '' } = {}) => `<input class="tf" id="${id}" data-input="${id}" type="${type}" ${inputmode ? `inputmode="${inputmode}"` : ''} value="${esc(value)}" placeholder="${esc(placeholder)}" autocomplete="off">`;
export const toggleRow = (label, on, act) => `<div class="hrow"><span class="lbl">${esc(label)}</span><button class="switch ${on ? 'on' : ''}" role="switch" aria-checked="${on}" data-act="${act}" aria-label="${esc(label)}"><span class="knob"></span></button></div>`;
export const chip = (title, subtitle, selected, act, data = '') => `<button class="chip ${selected ? 'sel' : ''}" data-act="${act}" ${data}><span class="t">${esc(title)}</span><span class="s">${esc(subtitle)}</span></button>`;

/// Mon–Sun boxes; done = filled, rest days grey, today outlined.
export function weekStrip(person, today) {
  const names = ['一', '二', '三', '四', '五', '六', '日'];
  const monday = Schedule.mondayOfWeek(today);
  let s = '<div class="week">';
  for (let i = 0; i < 7; i++) {
    const day = Schedule.addDays(monday, i);
    const done = person.sessions.some(x => Schedule.isSameDay(new Date(x.date), day) && (x.kind === 'wheel' || x.kind === 'walk'));
    const isToday = Schedule.isSameDay(day, today);
    const rest = person.level ? Schedule.dayKind(person.level, person.plus, day) === 'rest' : i >= 5;
    s += `<span class="wd ${done ? 'done' : rest ? 'rest' : ''} ${isToday ? 'today' : ''}">${rest && !done ? '休' : names[i]}</span>`;
  }
  return s + '</div>';
}

// ---- Card sheets (full pages, replacing system menus / dialogs) ----------------------------------------------
export function choiceSheet({ title, message = null, options, selected = null, cancelTitle = '取消', onPreview = null, onDemo = null, onCancel = null, onPick }) {
  let current = selected, confirmed = false;
  const s = {
    view: () => scaffold({
      top: topBar({ back: '關閉', act: 'close' }), title, lead: message,
      content: options.map(o => optionCard({ title: o.title, subtitle: o.subtitle, selected: current === o.id, act: 'pick', data: `data-id="${o.id}"` })).join(''),
      bottom: (onDemo ? bigBtn('試聽看看', 'demo', { kind: 'secondary', icon: '🔊' }) : '') + bigBtn('確定', 'ok', { huge: true, disabled: current == null }) + quietBtn(cancelTitle, 'close'),
    }),
    act: {
      pick: t => { current = t.dataset.id; if (onPreview) onPreview(current); Nav.refresh(); },
      demo: () => { if (current != null && onDemo) onDemo(current); },
      ok: () => { if (current != null) { confirmed = true; onPick(current); } Nav.pop(); },
      close: () => Nav.pop(),
    },
    unmount: () => { if (!confirmed && onCancel) onCancel(); },
  };
  Nav.push(s);
}
export function confirmSheet({ title, message = null, confirmTitle, danger = false, cancelTitle = '取消', onConfirm }) {
  Nav.push({
    view: () => scaffold({
      title, fill: true,
      content: message ? softCard(`<p class="${danger ? 'danger' : ''}">${nl(message)}</p>`, danger ? 'tint-danger' : '') : '',
      bottom: bigBtn(confirmTitle, 'ok', { kind: danger ? 'danger' : 'primary', huge: true }) + bigBtn(cancelTitle, 'close', { kind: 'secondary' }),
    }),
    act: { ok: () => { Nav.pop(); setTimeout(onConfirm, 0); }, close: () => Nav.pop() },
  });
}

// ---- share ----------------------------------------------------------------------------------------
export async function shareText(text, url = null) {
  try {
    if (navigator.share) { await navigator.share(url ? { text, url } : { text }); return true; }
  } catch (e) { if (e && e.name === 'AbortError') return false; }
  try { await navigator.clipboard.writeText(url ? text + '\n' + url : text); toast('已複製，貼到 LINE 就可以傳給朋友。'); return true; } catch { toast('這個瀏覽器不能分享，請手動複製網址。'); return false; }
}
export function toast(msg, ms = 2600) {
  let t = document.getElementById('toast');
  if (!t) { t = document.createElement('div'); t.id = 'toast'; document.body.appendChild(t); }
  t.textContent = msg; t.classList.add('show');
  clearTimeout(t._h); t._h = setTimeout(() => t.classList.remove('show'), ms);
}
