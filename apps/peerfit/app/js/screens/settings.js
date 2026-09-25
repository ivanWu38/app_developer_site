// 設定 (sound / tempo / font / appearance / share / rate / feedback / delete all), 動作總表, 資料來源.
import { APP_NAME, APP_VERSION, APP_STORE_ID, FEEDBACK_EMAIL, PRIVACY_URL } from '../config.js';
import { Catalog } from '../catalog.js';
import { Copy, Levels } from '../engine.js';
import { Settings, FontSizes, Tempos, Appearances, wipeAll } from '../store.js';
import { Nav, scaffold, topBar, bigBtn, quietBtn, hairlineList, hrow, sectionLabel, toggleRow, voiceBubble, esc, choiceSheet, confirmSheet } from '../ui.js';
import { figureHTML } from '../anim.js';
import { Voice, TempoDemo } from '../voice.js';
import { shareApp } from '../share.js';
import { applyFontSize, applyAppearance, restart } from '../app.js';

export function settingsScreen() {
  const choiceRow = (label, value, act) => `<button class="hrow" data-act="${act}"><span class="lbl">${esc(label)}</span><span class="val accent">${esc(value)}</span><span class="chevr">›</span></button>`;
  return {
    tab: 'settings',
    view: () => scaffold({
      title: '設定',
      content: hairlineList([toggleRow('聲音（語音和嗶聲）', Settings.soundEnabled, 'sound')])
        + sectionLabel('顯示與節奏') + hairlineList([
          choiceRow('運動節奏', Settings.tempoObj.label, 'tempo'),
          choiceRow('字體大小', Settings.fontObj.label, 'font'),
          choiceRow('外觀', Appearances.find(a => a.id === Settings.appearance).label, 'appearance'),
        ])
        + sectionLabel('其他') + hairlineList([
          hrow({ label: '我的運動等級', chevron: true, act: 'profile' }),
          hrow({ label: '動作總表', chevron: true, act: 'moves' }),
          hrow({ label: '加到主畫面', chevron: true, act: 'addHome' }),
          hrow({ label: '資料來源與免責', chevron: true, act: 'sources' }),
          hrow({ label: '分享這個 app', chevron: true, act: 'share' }),
          `<a class="hrow" href="https://apps.apple.com/app/id${APP_STORE_ID}?action=write-review" target="_blank" rel="noopener" style="text-decoration:none;color:inherit"><span class="lbl">給我們評分</span><span class="chevr">›</span></a>`,
          `<a class="hrow" href="mailto:${FEEDBACK_EMAIL}?subject=${encodeURIComponent(APP_NAME + ' 意見回饋')}" style="text-decoration:none;color:inherit"><span class="lbl">意見回饋</span><span class="chevr">›</span></a>`,
        ])
        + `<p class="caption mt">版本 ${APP_VERSION}</p>`,
      bottom: quietBtn('刪除所有資料', 'wipe'),
    }),
    act: {
      sound: () => { Settings.set('soundEnabled', !Settings.soundEnabled); Nav.refresh(); },
      tempo: () => choiceSheet({
        title: '運動節奏', message: '每一下口令之間隔多久。按「試聽看看」聽聽看。',
        options: Tempos.map(t => ({ id: t.id, title: t.label, subtitle: `每下約 ${t.repSeconds} 秒` })), selected: Settings.tempo,
        onDemo: id => TempoDemo.play(Tempos.find(t => t.id === id)), onCancel: () => TempoDemo.stop(),
        onPick: id => { TempoDemo.stop(); Settings.set('tempo', id); },
      }),
      font: () => choiceSheet({
        title: '字體大小', message: '點一下先看看，確定了再按「確定」。',
        options: FontSizes.map(f => ({ id: f.id, title: f.label })), selected: Settings.fontSize,
        onPreview: id => applyFontSize(id), onCancel: () => applyFontSize(Settings.fontSize),
        onPick: id => { Settings.set('fontSize', id); applyFontSize(id); },
      }),
      appearance: () => choiceSheet({
        title: '外觀', options: Appearances.map(a => ({ id: a.id, title: a.label })), selected: Settings.appearance,
        onPick: id => { Settings.set('appearance', id); applyAppearance(id); },
      }),
      profile: async () => { const m = await import('./home.js'); Nav.push(m.myProfileScreen()); },
      moves: () => Nav.push(movesScreen()),
      addHome: async () => { const m = await import('./home.js'); Nav.push(m.addToHomeScreen()); },
      sources: () => Nav.push(sourcesScreen()),
      share: () => shareApp(),
      wipe: () => confirmSheet({ title: '要刪除所有資料嗎？', message: '包括你和朋友的所有運動卡、測量和運動紀錄。刪了就找不回來。', confirmTitle: '確定全部刪除', danger: true, onConfirm: () => { wipeAll(); restart(); } }),
    },
  };
}

export function spec(e) {
  switch (e.mode) {
    case 'hold': return `${e.sets} 組，每組 ${e.reps} 次，每次撐 ${e.hold || 10} 秒`;
    case 'duration': return (e.secs || 0) < 60 ? `走 ${e.secs || 10} 秒，休息，再走，共 ${e.sets} 次` : `走 ${Math.max(1, Math.floor((e.secs || 60) / 60))} 分鐘`;
    default: return `${e.sets} 組，每組 ${e.reps} ${e.unit}`;
  }
}

export function movesScreen() {
  const unique = new Set(Levels.flatMap(lv => Catalog.level(lv).wheel));
  return {
    view: () => scaffold({
      top: topBar({ back: '設定' }), title: '動作總表', lead: `四個等級一共 ${unique.size} 個動作。點一個看示範、聽說明。`,
      content: Levels.map(lv => sectionLabel(`${Copy.levelName(lv)}・${Catalog.level(lv).wheel.length} 個`) + hairlineList(Catalog.level(lv).wheel.map(eid => {
        const e = Catalog.exercise(eid); if (!e) return '';
        return `<button class="hrow" data-act="open" data-id="${eid}" style="align-items:center;gap:14px;padding:10px 0"><span class="thumb" style="flex:none;width:72px;height:72px;border-radius:12px;background:var(--card);overflow:hidden">${figureHTML(Catalog.animationID(eid), { still: 1.0 })}</span><span style="flex:1;display:flex;flex-direction:column;gap:3px"><span class="bodystrong">${esc(e.name)}</span><span class="callout">${esc(spec(e))}</span></span><span class="chevr">›</span></button>`;
      }).filter(Boolean))).join('') + '<p class="callout mt">動作、組數與次數的出處，見設定裡的「資料來源」。</p>',
    }),
    act: { back: () => Nav.pop(), open: t => Nav.push(moveDetailScreen(t.dataset.id)) },
  };
}

export function moveDetailScreen(id) {
  const e = Catalog.exercise(id), clip = Catalog.clip(Catalog.animationID(id));
  return {
    view: () => scaffold({
      top: topBar({ back: '動作總表' }), title: e ? e.name : '', lead: e ? spec(e) : '',
      content: `<div class="figfixed" style="height:260px">${figureHTML(Catalog.animationID(id))}</div>` + voiceBubble(e ? e.instruction : '') + (clip && clip.safety && clip.safety.length ? hairlineList(clip.safety.map(t => hrow({ label: t }))) : ''),
      bottom: bigBtn('聽一次說明', 'listen', { huge: true }),
    }),
    act: { back: () => Nav.pop(), listen: () => Voice.say(['ex/' + id]) },
    unmount: () => Voice.stop(),
  };
}

export function sourcesScreen() {
  const sources = [
    ['美國 CDC STEADI（起走測驗、平衡測驗、三個問句）', 'https://www.cdc.gov/steadi/'],
    ['SPPB 簡易身體功能量表（坐站、平衡、步速）', 'https://www.sralab.org/rehabilitation-measures/short-physical-performance-battery'],
    ['國健署「長者量六力」（坐站 12 秒）', 'https://www.hpa.gov.tw/'],
    ['AWGS 2019（SARC-F、小腿圍）', 'https://doi.org/10.1016/j.jamda.2019.12.012'],
    ['Vivifrail 多元運動計畫（等級與運動內容；Izquierdo 等 2017；Casas-Herrero 等 2022）', 'https://vivifrail.com/'],
    ['Otago 運動計畫（進退階）', 'https://www.livestronger.org.nz/'],
    ['WHO 2020 身體活動指引', 'https://www.who.int/publications/i/item/9789240015128'],
  ];
  return {
    view: () => scaffold({
      top: topBar({ back: '上一頁' }), title: '資料來源與免責',
      content: `<p class="t3"><b>這不是醫療診斷。</b>這個網頁用公開的標準測驗把體能分成四個等級，並照國際長者運動指引安排運動。有任何不舒服，請停止並找醫生。</p>`
        + sectionLabel('測量方法與分數線來自') + hairlineList(sources.map(([t, u]) => `<a class="hrow" href="${u}" target="_blank" rel="noopener" style="text-decoration:none;color:inherit"><span class="lbl">${esc(t)}</span><span class="chevr">›</span></a>`))
        + `<p class="callout mt">資料只存在你的手機，不上傳、沒有帳號、沒有廣告。</p><p class="callout"><a href="${PRIVACY_URL}" target="_blank" rel="noopener" style="color:var(--ink)">隱私權政策 ›</a></p><p class="caption">版本 ${APP_VERSION}</p>`,
    }),
    act: { back: () => Nav.pop() },
  };
}
