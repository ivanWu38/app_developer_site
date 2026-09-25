// P1 friend list, P2 person detail, P3 history, conditions, rename.
import { Catalog } from '../catalog.js';
import { Copy, ProgressionRules, Schedule, conditionOrder, fmtMD, fmtYMD, weekCount } from '../engine.js';
import { DB, newPerson, age, activeSessions } from '../store.js';
import { Nav, scaffold, topBar, bigBtn, quietBtn, softCard, hairlineList, hrow, sectionLabel, pill, weekStrip, checkRow, textField, esc, confirmSheet } from '../ui.js';
import { startScreening } from './screening.js';
import { startSession } from './session.js';
import { setupGuideSheet } from './setup.js';

const sortedFriends = () => {
  const today = new Date();
  return DB.friends().sort((a, b) => {
    const ad = ProgressionRules.retestDue(a.nextRetestAt, today), bd = ProgressionRules.retestDue(b.nextRetestAt, today);
    if (ad !== bd) return ad ? -1 : 1;
    return new Date(b.measuredAt || b.createdAt) - new Date(a.measuredAt || a.createdAt);
  });
};
function statusLine(p) {
  if (p.status === 'needsRetest') return '需重測';
  if (!p.level) return p.status === 'pendingDoctor' ? '測量時有一項要先看醫生' : '點一下開始幫他量';
  const parts = [p.sentAt ? '手機已設定' : '手機還沒設定'];
  if (ProgressionRules.retestDue(p.nextRetestAt, new Date())) parts.push('重測到期');
  else if (p.nextRetestAt) parts.push(fmtMD(p.nextRetestAt) + ' 重測');
  return parts.join('・');
}
function personRow(p) {
  const tag = p.level ? `<span class="soft bodystrong">・${esc(Copy.levelName(p.level))}</span>` : p.status === 'pendingDoctor' ? pill('待就醫', 'danger') : '<span class="soft bodystrong">・還沒量</span>';
  return `<button class="hrow" data-act="open" data-id="${p.id}" style="align-items:center"><span style="flex:1;display:flex;flex-direction:column;gap:6px"><span class="t2">${esc(p.nickname)} ${tag}</span><span class="callout">${esc(statusLine(p))}</span></span><span class="chevr">›</span></button>`;
}

export function friendsScreen() {
  return {
    tab: 'friends',
    view() {
      const friends = sortedFriends();
      const add = bigBtn('幫新朋友量體能', 'add', { huge: true });
      if (!friends.length) return scaffold({ title: '朋友', content: '<p class="t3 soft">還沒有朋友的運動卡。按下面「幫新朋友量體能」開始。</p>', bottom: add });
      return scaffold({ title: '朋友', content: hairlineList(friends.map(personRow)), bottom: add });
    },
    act: {
      add: () => startScreening({ newFriend: true }),
      open: t => { const p = DB.find(t.dataset.id); if (!p) return; if (!p.level && p.status !== 'pendingDoctor') startScreening({ person: p }); else Nav.push(personDetailScreen(p)); },
    },
  };
}

export function personDetailScreen(person) {
  const primary = () => {
    if (!person.level || person.status !== 'ok' || ProgressionRules.retestDue(person.nextRetestAt, new Date())) return 'measure';
    if (!person.sentAt) return 'setup';
    return 'teach';
  };
  return {
    view() {
      const p = person, a = age(p);
      const condNames = p.conditions.length ? p.conditions.map(c => Catalog.conditions[c] && Catalog.conditions[c].name).filter(Boolean).join('、') : '無';
      const flags = Copy.flagsOf(p);
      let content = `<div class="pagetitle"><h1>${esc(p.nickname)} ${a != null ? `<span class="t3 soft" style="font-weight:500">${a} 歲</span>` : ''}</h1></div>`;
      let bottom;
      if (p.status === 'pendingDoctor') {
        content += pill('待就醫', 'danger') + softCard(`<p class="t3">${p.measuredAt ? fmtMD(p.measuredAt) : ''} 測量時，有一項最好先給醫生看。</p>`) + softCard(`<p>可以這樣跟他說：<br>${esc(Copy.redFlagScript)}</p>`, 'tint')
          + hairlineList([hrow({ label: '歷史紀錄', chevron: true, act: 'history' }), hrow({ label: '改名', chevron: true, act: 'rename' }), hrow({ label: `刪除${p.nickname}的運動卡`, danger: true, act: 'delete' })]);
        bottom = bigBtn('看過醫生了，重新量', 'measure', { huge: true });
      } else {
        content += `<p class="t3 soft">${p.level ? esc(Copy.levelName(p.level)) + (p.plus ? ' ' + pill(Copy.plusLabel) : '') : '還沒量'} ${p.status === 'needsRetest' ? pill('需重測', 'danger') : ''}</p>`
          + hairlineList([
            p.measuredAt && hrow({ label: '量的日期', value: fmtMD(p.measuredAt) + (p.levelSource === 'manual' ? '（手動）' : '') }),
            p.level && hrow({ label: '他的手機', value: p.sentAt ? '已設定' : '還沒設定' }),
            p.nextRetestAt && hrow({ label: '下次重測', value: fmtMD(p.nextRetestAt) }),
            flags.length ? hrow({ label: '注意', value: flags.join('、') }) : '',
            p.incomplete ? hrow({ label: '有項目沒量', value: '下次重測時補做' }) : '',
            hrow({ label: '歷史紀錄', chevron: true, act: 'history' }),
            hrow({ label: '注意事項', value: condNames, chevron: true, act: 'conditions' }),
            hrow({ label: '改名', chevron: true, act: 'rename' }),
            hrow({ label: `刪除${p.nickname}的運動卡`, danger: true, act: 'delete' }),
          ]);
        if (!p.level || p.status !== 'ok') bottom = bigBtn(!p.level ? '幫他量體能' : '再幫他量一次', 'measure', { huge: true });
        else {
          const pr = primary();
          bottom = bigBtn('一起做一次', 'teach', { kind: pr === 'teach' ? 'primary' : 'secondary', huge: pr === 'teach' });
          if (pr === 'setup') bottom += bigBtn('幫他設定手機', 'setup', { huge: true });
          else bottom += bigBtn('再幫他量一次', 'measure', { kind: pr === 'measure' ? 'primary' : 'secondary', huge: pr === 'measure' }) + quietBtn('再看一次怎麼設定他的手機', 'setup');
        }
      }
      return scaffold({ top: topBar({ back: '朋友' }), content, bottom });
    },
    act: {
      back: () => Nav.pop(),
      measure: () => startScreening({ person }),
      teach: () => startSession(person, 'teach', { onTeachDone: () => setupGuideSheet(person) }),
      setup: () => setupGuideSheet(person),
      history: () => Nav.push(historyScreen(person)),
      conditions: () => Nav.push(conditionsScreen(person)),
      rename: () => Nav.push(renameScreen(person)),
      delete: () => confirmSheet({ title: `要刪除${person.nickname}的運動卡嗎？`, message: '刪了就找不回來，測量和運動紀錄都會不見。', confirmTitle: '確定刪除', danger: true, onConfirm: () => { DB.remove(person.id); Nav.pop(); } }),
    },
  };
}

export function conditionsScreen(person, onNext = null) {
  return {
    view: () => scaffold({
      top: onNext ? '' : topBar({ back: '上一頁' }), title: `${person.nickname}有這些狀況嗎？`, lead: '有的勾起來，運動時會多提醒。沒有就直接下一步。',
      content: hairlineList(conditionOrder.map(id => checkRow(Catalog.conditions[id].name, person.conditions.includes(id), 'toggle', `data-id="${id}"`))),
      bottom: bigBtn(onNext ? '下一步' : '好了', 'next', { huge: true }),
    }),
    act: {
      back: () => Nav.pop(),
      toggle: t => { const id = t.dataset.id; const s = new Set(person.conditions); if (s.has(id)) s.delete(id); else s.add(id); person.conditions = [...s].sort(); DB.save(); Nav.refresh(); },
      next: () => { if (onNext) onNext(); else Nav.pop(); },
    },
  };
}

function measurementDetail(m) {
  const i = m.input, r = m.result; if (!i || !r) return '';
  const parts = [];
  const sts = i.sitToStand; parts.push(sts.kind === 'seconds' ? `坐站 ${sts.seconds.toFixed(1)} 秒` : sts.kind === 'unable' ? '坐站 無法' : '坐站 沒量');
  if (i.balance.skipped) parts.push('平衡 沒量'); else {
    const stands = [i.balance.sideBySide, i.balance.semiTandem, i.balance.tandem].filter(x => x != null && x >= 10).length;
    let s = `平衡 ${stands} 站`; if (i.balance.tandem != null) s += `（前後站 ${Math.min(10, i.balance.tandem).toFixed(0)} 秒）`; parts.push(s);
  }
  const tug = i.timedUpAndGo; if (tug.kind === 'seconds') parts.push(`起走 ${tug.seconds.toFixed(1)} 秒`); else if (tug.kind === 'unable') parts.push('起走 無法');
  if (i.gait.kind === 'seconds') parts.push(`走 4 公尺 ${i.gait.seconds.toFixed(1)} 秒`);
  if (r.approximate && !i.balance.skipped && sts.kind !== 'skipped') parts.push('（沒量步速）');
  return parts.join('・');
}
export function historyScreen(person) {
  return {
    view() {
      const ms = person.measurements.filter(m => !m.isPractice).sort((a, b) => new Date(b.date) - new Date(a.date));
      const weeks = [0, 1, 2, 3].map(w => { const ref = Schedule.addDays(new Date(), -7 * w); return `<div style="padding:12px 0;display:flex;flex-direction:column;gap:8px"><div style="display:flex;justify-content:space-between"><span>${w === 0 ? '這週' : w === 1 ? '上週' : w + ' 週前'}</span><span class="soft">${weekCount(person, ref)} 天</span></div>${weekStrip(person, ref)}</div>`; });
      return scaffold({
        top: topBar({ back: '上一頁' }), title: `${person.nickname}的紀錄`,
        content: sectionLabel('運動') + hairlineList([...weeks, hrow({ label: '累計', value: `${activeSessions(person).length} 天` })])
          + sectionLabel('測量') + (ms.length ? '' : '<p class="soft">還沒有測量紀錄。</p>')
          + hairlineList(ms.map(m => `<div style="padding:14px 0;display:flex;flex-direction:column;gap:4px"><span class="bodystrong">${fmtYMD(m.date)}${m.level ? '・' + esc(Copy.levelName(m.level)) : ''}</span><span class="callout">${esc(measurementDetail(m))}</span></div>`)),
      });
    },
    act: { back: () => Nav.pop() },
  };
}

export function renameScreen(person) {
  let name = person.nickname, year = person.birthYear ? String(person.birthYear) : '';
  const yearInt = () => { const y = parseInt(year, 10); return y >= 1900 && y <= new Date().getFullYear() ? y : null; };
  const valid = () => name.trim().length > 0 && name.trim().length <= 10 && (year === '' || yearInt() != null);
  return {
    view: () => scaffold({
      top: topBar({ back: '取消' }), title: '改名',
      content: sectionLabel(person.isMe ? '你的暱稱' : '稱呼') + textField('name', name, '例如：阿花') + sectionLabel('出生年（可以不填）') + textField('year', year, '例如：1948', { inputmode: 'numeric' }),
      bottom: bigBtn('存好了', 'save', { huge: true, disabled: !valid(), id: 'saveBtn' }),
    }),
    act: {
      back: () => Nav.pop(),
      name: t => { name = t.value; document.getElementById('saveBtn').disabled = !valid(); },
      year: t => { year = t.value; document.getElementById('saveBtn').disabled = !valid(); },
      save: () => { person.nickname = name.trim(); person.birthYear = yearInt(); DB.save(); Nav.pop(); },
    },
  };
}
