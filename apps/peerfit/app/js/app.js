// Boot: load data, restore settings, register the service worker, show consent or the tabs.
import { Catalog } from './catalog.js';
import { DB, Settings, Streak, FontSizes } from './store.js';
import { Nav } from './ui.js';
import { Voice, WakeLock } from './voice.js';
import { Figures } from './anim.js';

export function applyFontSize(id) { const f = FontSizes.find(x => x.id === id) || FontSizes[0]; document.documentElement.style.setProperty('--scale', String(f.scale)); }
export function applyAppearance(id) { if (id === 'system') document.documentElement.removeAttribute('data-theme'); else document.documentElement.setAttribute('data-theme', id); }

let homeMod, friendsMod, settingsMod;
export function restart() {
  Settings.load(); applyFontSize(Settings.fontSize); applyAppearance(Settings.appearance);
  if (!Settings.consentAccepted) {
    Nav.stack.length = 0;
    Nav.stack.push(homeMod.consentScreen(() => Nav.showTab('home')));
    history.replaceState({ d: 1, s: 0 }, ''); Nav.render();
  } else Nav.showTab('home');
}

async function boot() {
  const bar = document.querySelector('#boot .bar i');
  const prog = p => { if (bar) bar.style.width = p + '%'; };
  prog(10);
  await Catalog.load(); prog(45);
  [homeMod, friendsMod, settingsMod] = await Promise.all([import('./screens/home.js'), import('./screens/friends.js'), import('./screens/settings.js')]);
  prog(80);
  DB.load(); Settings.load(); Streak.recordOpen();
  applyFontSize(Settings.fontSize); applyAppearance(Settings.appearance);
  Voice.init(); WakeLock.init(); Figures.start();
  try { if (navigator.storage && navigator.storage.persist) navigator.storage.persist(); } catch {}
  const tabBar = document.getElementById('tabbar');
  Nav.init(document.getElementById('app'), { home: () => homeMod.homeScreen(), friends: () => friendsMod.friendsScreen(), settings: () => settingsMod.settingsScreen() }, tabBar);
  tabBar.addEventListener('click', e => { const b = e.target.closest('button[data-tab]'); if (b) Nav.showTab(b.dataset.tab); });
  restart();
  prog(100);
  const bootEl = document.getElementById('boot'); if (bootEl) bootEl.remove();
  if ('serviceWorker' in navigator) { try { await navigator.serviceWorker.register('sw.js'); } catch (e) { console.warn('sw', e); } }
  // returning to the tab on a new day: refresh the home page
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') { Streak.recordOpen(); const t = Nav.top(); if (t && t.tab === 'home') Nav.refresh(); } });
}
boot().catch(e => { console.error(e); const b = document.getElementById('boot'); if (b) b.innerHTML = `<div class="logo"><i>串門</i>運動</div><p>載入失敗，請檢查網路後重新整理。</p><p style="font-size:14px">${String(e)}</p>`; });
