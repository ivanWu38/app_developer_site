// 幫他開網頁 / 幫他設定 (visit steps 3–4), 朋友幫我量過了 (friend's own phone, 3 taps), 運動卡建好了.
import { APP_NAME, SHORT_URL, APP_URL } from '../config.js';
import { Catalog } from '../catalog.js';
import { Copy, conditionOrder, friendSetupSteps, setLevel, fmtMD, Levels } from '../engine.js';
import { DB } from '../store.js';
import { Nav, scaffold, topBar, bigBtn, quietBtn, softCard, hairlineList, hrow, stepRow, optionCard, checkRow, esc, pill } from '../ui.js';
import { figureHTML } from '../anim.js';
import { shareInvite } from '../share.js';

// Step 3 of a visit — get the web app onto the friend's phone. Acts: installNext, installShare, installSkip.
export function installHtml(person, { top = '' } = {}) {
  const n = person.nickname;
  return scaffold({
    top, title: `幫${n}打開網頁`, fill: true,
    content: `<p class="t3">拿${esc(n)}的手機，打開瀏覽器（Safari 或 Chrome），輸入這個網址：</p>
      <div class="card tint center" style="padding:22px"><div style="font-size:calc(34px*var(--scale));font-weight:900;word-break:break-all">${SHORT_URL}</div></div>
      <p class="t3">打開後看到第一頁按「我知道了，開始」，然後<b>加到主畫面</b>（設定裡有教學）。</p>
      <p class="callout">不方便打字的話，用 LINE 把連結傳給他，點一下就開。</p>`,
    bottom: bigBtn('打開了，下一步：幫他設定', 'installNext', { huge: true }) + bigBtn('用 LINE 傳連結給他', 'installShare', { kind: 'secondary', icon: '↗' }) + quietBtn('先跳過，下次再弄', 'installSkip'),
  });
}
export const installActs = { installShare: () => shareInvite(true) };

// Step 4 — read these taps out loud. Acts: setupDone, setupSkip.
export function setupGuideHtml(person, { skippable = false, top = '' } = {}) {
  const n = person.nickname;
  return scaffold({
    top, title: `幫${n}設定`, lead: `在${n}的手機上，照下面一步一步按：`,
    content: `<div class="steps">${friendSetupSteps(person, APP_NAME).map((t, i) => stepRow(i + 1, t)).join('')}</div><p class="callout mt">設定好之後，${esc(n)}每天打開就有「開始今天的運動」。12 週後記得再來幫他量。</p>`,
    bottom: bigBtn('設定好了', 'setupDone', { huge: true }) + (skippable ? quietBtn('先跳過，下次再設定', 'setupSkip') : ''),
  });
}
export function markSetupDone(person) { person.sentAt = new Date().toISOString(); DB.save(); }

/// Sheet wrapper for the friend list (「幫他設定手機」 later).
export function setupGuideSheet(person) {
  Nav.push({
    view: () => setupGuideHtml(person, { top: topBar({ back: '關閉' }) }),
    act: { back: () => Nav.pop(), setupDone: () => { markSetupDone(person); Nav.pop(); } },
  });
}

// F10 — 運動卡建好了. Act: cardClose.
export function cardDoneHtml(person) {
  const clip = person.level ? Catalog.level(person.level).wheel[0] : 'march_seated';
  return scaffold({
    title: `${person.nickname}的運動卡\n建好了`, fill: true, centered: true,
    content: `<div class="figbox">${figureHTML(Catalog.animationID(clip))}</div>` + hairlineList([
      person.level && hrow({ label: '等級', value: Copy.levelName(person.level) + (person.plus ? '・' + Copy.plusLabel : '') }),
      hrow({ label: '他的手機', value: person.sentAt ? '設定好了 ✓' : '還沒設定' }),
      person.nextRetestAt && hrow({ label: '再來幫他重測', value: fmtMD(person.nextRetestAt) }),
    ]) + (person.sentAt ? '' : '<p class="callout">之後可以在「朋友」裡按「幫他設定手機」。</p>'),
    bottom: bigBtn('回到朋友清單', 'cardClose', { huge: true }),
  });
}

// 「朋友幫我量過了」 on the friend's own phone: level → plus → conditions, no typing. Also the manual fallback.
export function friendMeasuredSetup() {
  let step = 0, level = null, plus = false; const conditions = new Set();
  const levelHint = lv => ({ A: '坐著做，重點是腿力和手的力氣', B: '扶著桌子做，重點是腿力和平衡', C: '站著做，重點是平衡和走路', D: '有爬樓梯和走八字' })[lv];
  const s = {
    view() {
      const top = topBar({ back: step === 0 ? '取消' : '上一步', title: `設定 ${step + 1}／3`, act: 'back' });
      if (step === 0) return scaffold({
        top, title: '你是哪一級？', lead: '朋友的手機上會顯示。沒有人幫你量過就選「坐著練」最安全。',
        content: Levels.map(lv => optionCard({ title: Copy.levelName(lv), subtitle: levelHint(lv), chevron: true, leading: `<span class="thumb">${figureHTML(Catalog.animationID(Catalog.level(lv).wheel[0]), { still: 0.6 })}</span>`, act: 'level', data: `data-lv="${lv}"` })).join(''),
      });
      if (step === 1) return scaffold({
        top, title: '要多練平衡嗎？', fill: true, centered: true,
        content: `<div class="figbox">${figureHTML('stand_tandem')}</div>` + softCard(`<p class="t2 center">朋友的手機上如果寫「${Copy.plusLabel}」就按「要」。多練平衡是一週四天做動作、一天走路。</p>`, 'tint'),
        bottom: bigBtn('要', 'plusYes', { huge: true }) + bigBtn('不用', 'plusNo', { kind: 'secondary', huge: true }),
      });
      return scaffold({
        top, title: '有這些狀況嗎？', lead: '有的勾起來，運動時會多提醒。',
        content: hairlineList(conditionOrder.map(id => checkRow(Catalog.conditions[id].name, conditions.has(id), 'toggle', `data-id="${id}"`))),
        bottom: bigBtn('好了', 'done', { huge: true, disabled: level == null }),
      });
    },
    onHistoryBack() { step = step === 2 && level === 'A' ? 0 : Math.max(0, step - 1); Nav.refresh(); },
    act: {
      back: () => Nav.back(),
      level: t => { level = t.dataset.lv; step = level === 'A' ? 2 : 1; Nav.subPush(); Nav.refresh(); },
      plusYes: () => { plus = true; step = 2; Nav.subPush(); Nav.refresh(); },
      plusNo: () => { plus = false; step = 2; Nav.subPush(); Nav.refresh(); },
      toggle: t => { const id = t.dataset.id; if (conditions.has(id)) conditions.delete(id); else conditions.add(id); Nav.refresh(); },
      done: () => {
        const me = DB.me();
        setLevel(me, level || 'A', plus && level !== 'A', 'manual', new Date(), null);
        me.conditions = [...conditions].sort(); DB.save();
        Nav.pop();
      },
    },
  };
  Nav.push(s);
}
