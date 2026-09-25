// Completion card image (nickname, what was done, streak — never a score) → system share (LINE). Falls back to text.
import { APP_NAME, APP_URL } from './config.js';
import { Copy, fmtMD } from './engine.js';
import { Streak } from './store.js';
import { shareText } from './ui.js';

function drawCard({ name, line1, level, streak, date }) {
  const W = 1200, pad = 72, c = document.createElement('canvas'); c.width = W; c.height = 760;
  const g = c.getContext('2d');
  g.fillStyle = '#F6F1E7'; g.fillRect(0, 0, W, c.height);
  const font = (px, w = 800) => `${w} ${px}px ui-rounded, -apple-system, "PingFang TC", "Noto Sans TC", sans-serif`;
  let y = pad + 44;
  g.fillStyle = '#D9662B'; g.font = font(44, 900); g.fillText(APP_NAME, pad, y); y += 62;
  g.fillStyle = '#5A5248'; g.font = font(44, 600); g.fillText(fmtMD(date), pad, y); y += 108;
  g.fillStyle = '#1F1B16'; g.font = font(80, 900); g.fillText(`${name} 今天做完了！`, pad, y); y += 96;
  g.font = font(60, 600); g.fillText(line1, pad, y); y += 84;
  if (level) { g.fillStyle = '#D9662B'; g.font = font(48, 700); g.fillText(level, pad, y); y += 78; }
  g.fillStyle = '#3F7D5A'; g.font = font(56, 700); g.fillText(`連續第 ${streak} 天`, pad, y);
  return c;
}

export async function shareDoneCard(person, log) {
  const line1 = log ? (log.kind === 'walk' ? `走了 ${log.exercisesTotal} 趟，${log.minutes} 分鐘` : `做了 ${log.exercisesDone} 個動作，${log.minutes} 分鐘`) : '這週五天都做到了';
  const data = { name: person.nickname, line1, level: person.level ? Copy.levelName(person.level) : '', streak: Streak.count, date: new Date() };
  const text = `${data.name} 今天做完了！${line1}${data.level ? '・' + data.level : ''}・連續第 ${data.streak} 天 —${APP_NAME}`;
  try {
    if (navigator.share && navigator.canShare) {
      const blob = await new Promise(r => drawCard(data).toBlob(r, 'image/png'));
      const file = new File([blob], 'peerfit.png', { type: 'image/png' });
      if (navigator.canShare({ files: [file] })) { await navigator.share({ files: [file], text }); return; }
    }
  } catch (e) { if (e && e.name === 'AbortError') return; }
  await shareText(text, APP_URL);
}

export function shareInvite(install = false) {
  const text = install ? `點這個連結打開「${APP_NAME}」，打開後加到主畫面，我幫你設定，之後每天打開就能做運動：` : `打開這個網頁，來我家幫我量一次體能，之後我就能自己在家做運動：`;
  return shareText(text, APP_URL);
}
export function shareApp() {
  return shareText(`「${APP_NAME}」可以幫朋友量體能、一起做適合的運動，免費沒廣告，用手機打開就能用：`, APP_URL);
}
