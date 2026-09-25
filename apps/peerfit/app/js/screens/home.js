// Consent, Home (H0/H1), MyProfile, DayChoice, HowToGetMeasured, BreakCheck, RedFlag (self / after-break).
import { APP_NAME, isStandalone } from '../config.js';
import { Catalog, Scr } from '../catalog.js';
import { Copy, Plan, ProgressionRules, Schedule, fmtMD, fmtWeekday, todayState, tomorrowText } from '../engine.js';
import { DB, Settings } from '../store.js';
import { Nav, scaffold, topBar, bigBtn, quietBtn, softCard, hairlineList, hrow, numberedRow, stepRow, sectionLabel, pill, weekStrip, optionCard, esc, nl, confirmSheet } from '../ui.js';
import { figureHTML } from '../anim.js';
import { Voice } from '../voice.js';
import { startSession, sessionScreen } from './session.js';
import { startScreening } from './screening.js';
import { friendMeasuredSetup } from './setup.js';
import { sourcesScreen } from './settings.js';
import { shareInvite, shareDoneCard } from '../share.js';

const fig = (id, cls = 'figbox') => `<div class="${cls}">${figureHTML(id)}</div>`;

// ---- S00 consent --------------------------------------------------------------------------------
export function consentScreen(onDone) {
  const bullet = (h, s, t) => `<div class="hrow"><p class="t3">${esc(h)}<b>${esc(s)}</b>${esc(t)}</p></div>`;
  return {
    view: () => scaffold({
      title: APP_NAME, lead: '幫朋友量體能、一起做適合的運動。', fill: true,
      content: hairlineList([
        bullet('這個網頁會帶你做運動。', '運動有風險', '，做的時候旁邊要有穩固的桌子可以扶。'),
        bullet('這', '不是醫療診斷', '。有不舒服請停止並找醫生。'),
        bullet('你和朋友的資料', '只存在這支手機', '，不會上傳，也沒有帳號。'),
      ]),
      bottom: bigBtn('我知道了，開始', 'ok', { huge: true }) + quietBtn('看資料來源與免責', 'sources'),
    }),
    act: { ok: () => { DB.me(); Settings.set('consentAccepted', true); onDone(); }, sources: () => Nav.push(sourcesScreen()) },
  };
}

// ---- H0 / H1 home ---------------------------------------------------------------------------------
export function homeScreen() {
  let today = new Date();
  const s = {
    tab: 'home',
    view() {
      today = new Date();
      const me = DB.me();
      return me.level ? exerciseHome(me) : noLevelHome(me);
    },
    mount() {
      const me = DB.me();
      if (me.level && me.status === 'ok' && ProgressionRules.needsBreakCheck(me.lastActivityDate, today) && !s._breakShown) { s._breakShown = true; Nav.push(breakCheckScreen(me)); }
    },
    act: {
      manual: () => friendMeasuredSetup(),
      howto: () => Nav.push(howToScreen()),
      newFriend: () => startScreening({ newFriend: true, onDone: () => Nav.showTab('friends') }),
      profile: () => Nav.push(myProfileScreen()),
      startWheel: () => startSession(DB.me(), 'wheel'),
      startWalk: () => startSession(DB.me(), 'walk'),
      again: () => { const st = todayState(DB.me(), today); startSession(DB.me(), st.kind === 'walk' ? 'walk' : 'wheel'); },
      restChoice: () => Nav.push(dayChoiceScreen(DB.me(), todayState(DB.me(), today).week)),
      share: () => { const st = todayState(DB.me(), today); shareDoneCard(DB.me(), st.todayLog); },
      dismissHint: () => { Settings.set('homeHintDismissed', true); Nav.refresh(); },
      addHome: () => Nav.push(addToHomeScreen()),
    },
  };
  return s;

  function hint() {
    if (isStandalone() || Settings.homeHintDismissed) return '';
    return `<div class="hint"><b>把這個網頁加到主畫面</b>之後每天像 app 一樣點開就好，資料也不會被瀏覽器清掉。<div class="row2 mt">${bigBtn('怎麼加？', 'addHome', { kind: 'secondary' })}${quietBtn('先不用', 'dismissHint')}</div></div>`;
  }
  function noLevelHome(me) {
    return scaffold({
      title: '你想做什麼？', fill: true,
      content: `<div>${sectionLabel('我要運動')}<p class="t3 mt">要先有「運動等級」。請一位朋友用他的手機幫你量一次，大約 10 分鐘。</p><div class="mt2">${bigBtn('朋友幫我量過了', 'manual')}</div>${quietBtn('怎麼請朋友幫我量？', 'howto')}</div>
        <div class="mt2">${sectionLabel('我要幫朋友量')}<p class="t3 mt">去不常出門的朋友家，用這支手機幫他量、帶他做一遍，再幫他設定他的手機。</p><div class="mt2">${bigBtn('幫朋友量體能', 'newFriend', { kind: 'secondary', subtitle: '大約需要 10 分鐘' })}</div></div>${hint()}`,
    });
  }
  function header(me, week) {
    return `<div class="topbar"><div class="tb-title" style="text-align:left;flex:1;font-weight:500;color:var(--soft)">${fmtMD(today)} ${fmtWeekday(today)}・第 ${week} 週</div><button class="tb-back accent" data-act="profile" style="color:var(--ember)">${esc(Copy.levelName(me.level))}<span class="chev" style="margin-left:2px">›</span></button></div>`;
  }
  function retestCard() { return softCard(`<div class="row2" style="align-items:center"><p class="bodystrong">12 週到了，請朋友再幫你量一次。</p>${quietBtn('怎麼做？', 'howto', 'style="flex:0 0 auto;width:auto"')}</div>`, 'tint'); }
  function exerciseHome(me) {
    const st = todayState(me, today);
    if (!st.locked && !st.doneToday && st.kind === 'wheel' && st.plan) {
      return scaffold({
        top: header(me, st.week), title: '今天做動作', lead: `${st.plan.items.length} 個動作・大約 ${Plan.estimatedMinutes(st.plan)} 分鐘`,
        content: hairlineList(st.plan.items.map((it, i) => numberedRow(i + 1, it.name))) + hint(),
        bottom: (st.retestDue ? retestCard() : '') + weekStrip(me, today) + bigBtn('開始今天的運動', 'startWheel', { huge: true }),
      });
    }
    let content = '', bottom = '';
    if (st.locked) {
      content = `<div class="pagetitle"><h1>請先重測</h1><p class="lead">請朋友再幫你量一次再繼續。</p></div>${fig('march_seated')}<p class="t3">量完之後，每天打開就有今天的運動。</p>`;
      bottom = bigBtn('怎麼請朋友幫我量？', 'howto', { kind: 'secondary' });
    } else if (st.doneToday) {
      const l = st.todayLog;
      content = `<div class="pagetitle"><h1>${st.kind === 'walk' ? '今天走完了 ✓' : '今天做完了 ✓'}</h1>${l ? `<p class="lead">${l.kind === 'walk' ? `走了 ${l.exercisesTotal} 趟，${l.minutes} 分鐘` : `做了 ${l.exercisesDone} 個動作，${l.minutes} 分鐘`}</p>` : ''}</div>${fig('reach_overhead')}${softCard(`<p class="t2 center">明天：${tomorrowText(st.tomorrow)}。這週已做 ${st.weekDone} 天。</p>`, 'tint')}${weekStrip(me, today)}`;
      bottom = bigBtn('傳給朋友看', 'share', { kind: 'secondary', icon: '↗' }) + quietBtn('再做一次也可以', 'again');
    } else if (st.kind === 'rest') {
      content = `<div class="pagetitle"><h1>今天休息</h1><p class="lead">明天：${tomorrowText(st.tomorrow)}</p></div>${fig('march_seated')}${softCard(`<p class="t2 center">休息日不用做運動。這週已做 ${st.weekDone} 天。</p>`, 'tint')}${weekStrip(me, today)}`;
      bottom = bigBtn('今天想做也可以', 'restChoice', { kind: 'secondary' });
    } else if (st.kind === 'walk') {
      content = `<div class="pagetitle"><h1>今天走路</h1><p class="lead">${esc(st.walkSubtitle || '')}</p></div>${fig('walk_continuous')}${hairlineList([hrow({ label: '穿好鞋、帶著手機' }), hrow({ label: '在走廊、客廳或樓下平地來回走' }), hrow({ label: '用說話不會喘的速度' })])}${weekStrip(me, today)}`;
      bottom = bigBtn('開始走路', 'startWalk', { huge: true });
    }
    if (st.retestDue && !st.locked) content += retestCard();
    content += hint();
    return scaffold({ top: header(me, st.week), fill: true, content, bottom });
  }
}

// ---- 我的運動等級 ----------------------------------------------------------------------------------
export function myProfileScreen() {
  return {
    view() {
      const me = DB.me();
      const flags = Copy.flagsOf(me);
      return scaffold({
        top: topBar({ back: '首頁' }), title: '我的運動等級',
        content: `<p class="t3 soft">${esc(me.level ? Copy.levelName(me.level) : '還沒有等級')} ${me.plus ? pill(Copy.plusLabel) : ''}</p>` + hairlineList([
          me.measuredAt && hrow({ label: '量的日期', value: fmtMD(me.measuredAt) + (me.levelSource === 'manual' ? '（自己設定）' : '') }),
          me.nextRetestAt && hrow({ label: '下次請朋友重測', value: fmtMD(me.nextRetestAt) }),
          flags.length ? hrow({ label: '注意', value: flags.join('、') }) : '',
          hrow({ label: '我的紀錄', chevron: true, act: 'history' }),
        ]),
        bottom: bigBtn('朋友又幫我量了，改等級', 'manual', { kind: 'secondary' }) + quietBtn('怎麼請朋友幫我量？', 'howto'),
      });
    },
    act: { back: () => Nav.pop(), manual: () => friendMeasuredSetup(), howto: () => Nav.push(howToScreen()), history: async () => { const m = await import('./friends.js'); Nav.push(m.historyScreen(DB.me())); } },
  };
}

// ---- Rest day 「今天想做也可以」 -----------------------------------------------------------------------
export function dayChoiceScreen(person, week) {
  const wheel = Plan.wheel(person, week);
  const walk = person.level ? Catalog.walk(person.level, week) : null;
  const thumb = id => `<span class="thumb">${figureHTML(id, { still: 0.6 })}</span>`;
  return {
    view: () => scaffold({
      top: topBar({ back: '關閉', act: 'back' }), title: '今天想做什麼？', fill: true,
      content: (wheel ? optionCard({ title: '做運動', subtitle: `${wheel.items.length} 個動作・大約 ${Plan.estimatedMinutes(wheel)} 分鐘`, chevron: true, leading: thumb(wheel.items[0] ? wheel.items[0].animationID : 'march_seated'), act: 'wheel' }) : '')
        + (person.level !== 'A' && walk ? optionCard({ title: '走路', subtitle: walk.laps === 1 ? `走 ${walk.minutes} 分鐘` : `${walk.laps} 趟，每趟 ${walk.minutes} 分鐘`, chevron: true, leading: thumb('walk_continuous'), act: 'walk' }) : ''),
      bottom: quietBtn('今天還是休息', 'back'),
    }),
    act: { back: () => Nav.pop(), wheel: () => Nav.replace(sessionScreen(person, 'wheel')), walk: () => Nav.replace(sessionScreen(person, 'walk')) },
  };
}

// ---- 怎麼請朋友幫我量 ------------------------------------------------------------------------------
export function howToScreen() {
  return {
    view: () => scaffold({
      top: topBar({ back: '關閉' }), title: '怎麼請朋友幫我量？', fill: true,
      content: `<div class="steps">${stepRow(1, `請一位手機上有「${APP_NAME}」的朋友來家裡。`)}${stepRow(2, '他用他的手機按「幫朋友量體能」，照著做大約 10 分鐘。')}${stepRow(3, '量完他會念給你聽，你在這支手機按「朋友幫我量過了」，選他念的那幾項就好。')}</div><p class="callout mt">需要一張靠牆的椅子和 3 公尺的空間。</p>`,
      bottom: bigBtn('傳邀請給朋友', 'invite', { huge: true, icon: '↗' }),
    }),
    act: { back: () => Nav.pop(), invite: () => shareInvite(false) },
  };
}

// ---- 加到主畫面 ---------------------------------------------------------------------------------------
export function addToHomeScreen() {
  const ios = /iPhone|iPad|iPod/.test(navigator.userAgent);
  const steps = ios
    ? ['用 Safari 打開這個網頁（現在就是）。', '按畫面下面中間的「分享」按鈕（一個方框加向上箭頭）。', '往下找「加入主畫面」，按它。', '右上角按「加入」。之後主畫面就有「串門運動」的圖示。']
    : ['用 Chrome 打開這個網頁（現在就是）。', '按右上角的三個點「⋮」。', '按「加到主畫面」或「安裝應用程式」。', '按「安裝」。之後主畫面就有「串門運動」的圖示。'];
  return {
    view: () => scaffold({
      top: topBar({ back: '關閉' }), title: '加到主畫面', lead: '加了之後，每天像 app 一樣點圖示就能用，離線也可以。',
      content: `<div class="steps">${steps.map((t, i) => stepRow(i + 1, t)).join('')}</div>${softCard('<p class="callout">為什麼要加？瀏覽器對很久沒開的網頁，可能會清掉存在手機裡的資料。加到主畫面之後就不會。</p>', 'tint')}`,
      bottom: bigBtn('知道了', 'back', { huge: true }),
    }),
    act: { back: () => Nav.pop() },
  };
}

// ---- S08 after ≥ 14 days away --------------------------------------------------------------------------
export function breakCheckScreen(person) {
  const days = person.lastActivityDate ? Schedule.daysBetween(new Date(person.lastActivityDate), new Date()) : 0;
  return {
    view: () => scaffold({
      title: '好久不見', fill: true, centered: true,
      content: fig('march_seated') + softCard(`<p class="t2 center">有 ${days} 天沒做運動了。<br>這段時間有沒有<u>跌倒</u>或<u>住院</u>？</p>`, 'tint'),
      bottom: bigBtn('沒有，我很好', 'fine', { huge: true }) + bigBtn('有', 'yes', { kind: 'secondary', huge: true }),
    }),
    act: {
      fine: () => { person.programStart = ProgressionRules.resetStart(new Date()).toISOString(); person.lastActivityDate = new Date().toISOString(); DB.save(); Nav.pop(); },
      yes: () => { person.status = 'needsRetest'; person.lastActivityDate = new Date().toISOString(); DB.save(); Nav.replace(redFlagScreen({ mode: 'afterBreak' })); },
    },
  };
}

// ---- S34 red-flag page ------------------------------------------------------------------------------------
// mode: 'visitor' | 'selfCheck' | 'afterBreak'; safetyIndex = the safety question answered 「有」 (visitor).
export function redFlagScreen({ mode, safetyIndex = null, onSave = null, onDiscard = null, onClose = null }) {
  const isVisitor = mode === 'visitor', temporary = safetyIndex === 4;
  const reason = safetyIndex != null ? Catalog.text(Scr.safety[safetyIndex]) : null;
  const close = () => { if (onClose) onClose(); else Nav.pop(); };
  return {
    view: () => scaffold({
      title: isVisitor ? (temporary ? '今天先不測，\n好了再來' : '今天先不測，\n也先不運動') : '今天先不運動', fill: true, centered: true,
      content: (isVisitor && reason ? softCard(`<p class="caption">剛才回答「有」的是：</p><p class="t2 mt">${esc(reason)}</p>`, 'tint') : '')
        + softCard(`<p class="t2 center">${esc(isVisitor ? (temporary ? '生病或發燒的時候不要測、也不要運動。等好了，再幫他量一次就可以。' : '有這種狀況，最好先給醫生看一下，再開始運動。') : (mode === 'afterBreak' ? '建議先找醫生看一下，好了以後請朋友再幫你量一次。' : '有這種狀況，建議先找醫生看一下。'))}</p>`, 'tint')
        + (isVisitor && !temporary ? softCard(`<p>可以這樣跟他說：<br>${esc(Copy.redFlagScript)}</p>`) : '')
        + (!temporary ? softCard(`<p>不知道找誰：可以到衛生所，或撥 <b>${Copy.hotline}</b> 長照專線。</p>`) : ''),
      bottom: (isVisitor
        ? (temporary ? bigBtn('好，改天再量', 'discard', { huge: true }) : bigBtn('好，存起來標「待就醫」', 'save', { huge: true }) + quietBtn('不存，回到朋友清單', 'discard'))
        : bigBtn('好，我知道了', 'close', { huge: true })) + `<p class="caption center">${esc(Copy.disclaimer)}</p>`,
    }),
    act: { save: () => { if (onSave) onSave(); }, discard: () => { if (onDiscard) onDiscard(); }, close },
  };
}
