// The "幫朋友量" straight line F1–F10: name → prepare → 6 safety questions → 4 questions → 五次坐站 → 平衡 → 起走 → (4 m) → result
// → conditions → teach? → 幫他打開網頁 → 幫他設定 → done. Every step speaks its line on entry; timed tests use a wall-clock stopwatch.
import { Catalog, Scr } from '../catalog.js';
import { Copy, ScreeningEngine, ProgressionRules, Schedule, newInput, Timed, effectiveLevel, setLevel, fmtMD, Plan, Levels } from '../engine.js';
import { DB, newPerson, newMeasurement, Settings } from '../store.js';
import { Nav, scaffold, topBar, bigBtn, quietBtn, softCard, voiceBubble, hairlineList, hrow, sectionLabel, pill, textField, esc, nl, confirmSheet } from '../ui.js';
import { figureHTML } from '../anim.js';
import { Voice, Sound, WakeLock } from '../voice.js';
import { installHtml, installActs, setupGuideHtml, markSetupDone, cardDoneHtml } from './setup.js';
import { redFlagScreen } from './home.js';
import { startSession } from './session.js';
import { sourcesScreen } from './settings.js';

const fig = (id, h = '') => `<div class="figbox" ${h ? `style="max-height:${h}px"` : ''}>${figureHTML(id)}</div>`;

/// Wall-clock stopwatch with 0.01 s precision. Invalidated when the page leaves the foreground.
class Stopwatch {
  constructor() { this.reset(); }
  get isRunning() { return this.startedAt != null && this.stoppedAt == null; }
  elapsed(now = Date.now()) { if (this.startedAt == null) return 0; return Math.round(((this.stoppedAt ?? now) - this.startedAt) / 10) / 100; }
  start() { this.startedAt = Date.now(); this.stoppedAt = null; this.invalidated = false; this.count = 0; this.lastPress = null; }
  stop() { if (this.isRunning) this.stoppedAt = Date.now(); }
  reset() { this.startedAt = null; this.stoppedAt = null; this.invalidated = false; this.count = 0; this.lastPress = null; }
  invalidate() { if (this.isRunning) { this.invalidated = true; this.stoppedAt = Date.now(); } }
  press() { if (!this.isRunning) return false; const n = Date.now(); if (this.lastPress && n - this.lastPress < 300) return false; this.lastPress = n; this.count += 1; return true; }
}

export function startScreening({ person = null, newFriend = false, onDone = null } = {}) {
  const input = newInput();
  let step = newFriend ? 'name' : 'prepare';
  const history = [];
  let result = null, subject = person, saved = false, redFlagIndex = null;
  let nameVal = '', yearVal = '';
  let sub = {};                 // per-step state (timed tests)
  let watch = new Stopwatch();
  let timer = null, lastSpoken = null, afterUnmount = null;

  const name = () => subject ? subject.nickname : '';
  const stepLabel = () => {
    const k = step.split(':')[0];
    return { name: '第 1 步，共 6 步', prepare: '第 2 步，共 6 步', safety: '第 3 步，共 6 步', question: '第 3 步，共 6 步', sts: '第 4 步，共 6 步', balance: '第 5 步，共 6 步', tug: '第 6 步，共 6 步', gaitAsk: '第 6 步，共 6 步', gait: '第 6 步，共 6 步', result: '量好了', conditions: '快好了', teachPrompt: '快好了', install: '幫他打開網頁', setup: '幫他設定' }[k] || '';
  };
  const yearInt = () => { const y = parseInt(yearVal, 10); return y >= 1900 && y <= new Date().getFullYear() ? y : null; };
  const nameValid = () => nameVal.trim().length > 0 && nameVal.trim().length <= 10 && (yearVal === '' || yearInt() != null);

  function go(next) { Voice.stop(); history.push(step); step = next; sub = {}; watch = new Stopwatch(); Nav.subPush(); Nav.refresh(); }
  function exit(then = null) { afterUnmount = then; Nav.pop(); }
  function finishTests() { result = ScreeningEngine.evaluate(input); go('result'); }
  function persist() {
    if (saved || !result) return;
    const p = subject; saved = true;
    const m = newMeasurement(input, result);
    p.measurements.push(m);
    const prev = p.measurements.filter(x => x.id !== m.id).sort((a, b) => new Date(b.date) - new Date(a.date))[0];
    const prevTotal = prev && prev.result ? prev.result.total : null;
    const lvl = ProgressionRules.levelAfterRetest(p.level, prevTotal, result) || effectiveLevel(result);
    setLevel(p, lvl, result.plus && lvl !== 'A', 'measured', new Date(), result);
    DB.save();
  }
  function speak(key, ids) { if (lastSpoken === key) return; lastSpoken = key; Voice.say(ids); }
  const vis = () => { if (document.visibilityState !== 'visible') { watch.invalidate(); Voice.stop(); Nav.refresh(); } };

  // ---- generic pieces ----
  const topbar = () => (step === 'done' || step === 'redFlag' || step === 'result') ? '' : topBar({ back: history.length ? '上一步' : '離開', title: stepLabel() });
  const introCard = ({ title, clipID, voiceID, helperNote, extraNote = null, startTitle, startAct, skipAct = null, secondary = null }) => scaffold({
    top: topbar(), title, fill: true,
    content: fig(clipID, 240) + voiceBubble(Catalog.text(voiceID)) + softCard(`<p><b>你要做的：</b>${esc(helperNote)}</p>`, 'tint') + (extraNote ? `<p class="callout">${esc(extraNote)}</p>` : ''),
    bottom: (secondary ? bigBtn(secondary[0], secondary[1], { kind: 'secondary' }) : '') + bigBtn(startTitle, startAct, { huge: true }) + (skipAct ? quietBtn('跳過這個測驗', skipAct) : ''),
  });
  const resultCard = ({ title, value, voiceID, nextTitle, nextAct, redoAct = null }) => scaffold({
    top: topbar(), title, fill: true, centered: true,
    content: `<div class="bignum timer">${esc(value)}</div>` + voiceBubble(Catalog.text(voiceID)),
    bottom: bigBtn(nextTitle, nextAct, { huge: true }) + (redoAct ? quietBtn('重做這一個', redoAct) : ''),
  });
  const timerPage = ({ label, safety, content, bottom }) => `<div class="screen">${topbar()}<div class="timerlabel">${esc(label)}</div><div class="fillbody"><div class="col" style="gap:14px">${content}</div></div><div class="bottom"><div class="col">${bottom}<p class="safety">${esc(safety)}</p></div></div></div>`;
  const interrupted = redoAct => softCard(`<p class="bodystrong">${esc(Catalog.text(Scr.interrupted))}</p><div class="mt">${bigBtn('重新來', redoAct, { kind: 'secondary' })}</div>`, 'tint-danger');
  const tapBtn = (title, act) => `<button class="tap" data-act="${act}">${esc(title)}</button>`;
  const elapsedHtml = () => watch.isRunning ? `<span class="bignum" id="elapsed">${watch.elapsed().toFixed(1)}</span><span class="t2 soft">秒</span>` : `<span class="t1 soft">預備……</span>`;
  async function readyGo(guard) { await Voice.say([Scr.readyLine]); if (guard()) watch.start(); Nav.refresh(); await Voice.say([Scr.startLine]); }

  // ---- views per step ----
  function view() {
    const [k, iS] = step.split(':'); const i = iS != null ? parseInt(iS, 10) : 0;
    switch (k) {
      case 'name': return scaffold({
        top: topbar(), title: '朋友怎麼稱呼？',
        content: sectionLabel('稱呼') + textField('nameF', nameVal, '例如：阿花') + sectionLabel('出生年（可以不填，只用來顯示歲數）') + `<div class="row2" style="align-items:center">${textField('yearF', yearVal, '例如：1948', { inputmode: 'numeric' })}<span id="ageHint" class="soft" style="flex:0 0 auto">${yearInt() ? `→ ${new Date().getFullYear() - yearInt()} 歲` : ''}</span></div><p class="callout mt">資料只存在你的手機，不會上傳；朋友可以隨時請你刪掉。</p>`,
        bottom: bigBtn('下一步', 'nameNext', { huge: true, disabled: !nameValid(), id: 'nameBtn' }),
      });
      case 'prepare': return scaffold({
        top: topbar(), title: '先準備這些',
        content: hairlineList([['🪑', '一張', '靠牆、不會滑', '的椅子（一般餐椅）'], ['📏', '椅子前面大約 ', '3 公尺', ' 的空間（大約四大步），在那裡放個東西當記號。用尺量或抓大概都可以'], ['🪵', '旁邊有', '穩固的桌子', '可以扶'], ['👟', '他穿', '包鞋', '，不穿拖鞋']].map(x => `<div class="hrow" style="align-items:flex-start"><span class="t2">${x[0]}</span><p class="t3" style="flex:1">${esc(x[1])}<b>${esc(x[2])}</b>${esc(x[3])}</p></div>`)) + '<p class="callout mt">等一下會唸每一句，你照做就好。大約 10 分鐘。</p>',
        bottom: bigBtn('準備好了，開始問問題', 'prepNext', { huge: true }),
      });
      case 'safety': { const id = Scr.safety[i]; return scaffold({
        top: topbar(), fill: true, centered: true,
        content: sectionLabel(`問題 ${i + 1}，共 10 題`) + `<h1 class="pagetitle" style="font-size:var(--fs-large);font-weight:900;text-align:left">${esc(Catalog.text(id))}</h1>` + voiceBubble(Catalog.text(id)) + quietBtn('再說一次', 'repeat'),
        bottom: `<div class="row2">${bigBtn('沒有', 'safeNo', { huge: true })}${bigBtn('有', 'safeYes', { kind: 'secondary', huge: true })}</div><p class="safety">${esc(Copy.visitorSafety)}</p>`,
      }); }
      case 'question': { const p = questionPage(i); return scaffold({
        top: topbar(), fill: true, centered: true,
        content: sectionLabel(`問題 ${p.shown}，共 10 題`) + `<h1 class="pagetitle" style="font-size:var(--fs-large);font-weight:900;text-align:left">${esc(Catalog.text(p.id))}</h1>` + voiceBubble(Catalog.text(p.id)) + quietBtn('再說一次', 'repeat'),
        bottom: p.wide ? bigBtn(p.options[0][0], 'q', { huge: true, extra: 'data-i="0"' }) + `<div class="row2">${p.options.slice(1).map((o, j) => bigBtn(o[0], 'q', { kind: 'secondary', extra: `data-i="${j + 1}"` })).join('')}</div>`
          : `<div class="row2">${p.options.map((o, j) => bigBtn(o[0], 'q', { kind: j === 0 ? 'primary' : 'secondary', huge: true, extra: `data-i="${j}"` })).join('')}</div>`,
      }); }
      case 'sts': return stsView();
      case 'balance': return balanceView();
      case 'tug': return tugView();
      case 'gaitAsk': return scaffold({
        top: topbar(), title: '有沒有 4 公尺的\n直線可以走？', fill: true, centered: true,
        content: fig('test_tug', 260) + softCard('<p class="t2 center">大約五大步。有的話多量一項「走路速度」，等級會更準；沒有就跳過。</p>', 'tint'),
        bottom: bigBtn('有，量走路速度', 'gaitYes', { huge: true }) + bigBtn('沒有，跳過', 'gaitNo', { kind: 'secondary', huge: true }),
      });
      case 'gait': return gaitView();
      case 'result': return resultView();
      case 'conditions': return conditionsHtml();
      case 'teachPrompt': { const tp = Plan.wheel(subject, 1, true); const min = tp ? Plan.estimatedMinutes(tp, Settings.tempoObj.repSeconds, Settings.tempoObj.stepSeconds) : 15; return scaffold({
        top: topbar(), title: `現在帶${name()}\n做一遍？`, fill: true, centered: true,
        content: fig('knee_ext_seated', 280) + softCard(`<p class="t2 center">每個動作做一組、走路類在家自己做，大約 ${min} 分鐘。你拿手機，${esc(name())}跟著做。</p>`, 'tint'),
        bottom: bigBtn('好，現在做一遍', 'teach', { huge: true }) + bigBtn('先不用，直接幫他打開網頁', 'teachSkip', { kind: 'secondary' }),
      }); }
      case 'install': return installHtml(subject, { top: topbar() });
      case 'setup': return setupGuideHtml(subject, { skippable: true, top: topbar() });
      case 'done': return cardDoneHtml(subject);
      default: return '';
    }
  }

  // F3 questions — pages computed from the current answers (QuestionView.swift)
  function questionPage(i) {
    const f = input.falls;
    switch (i) {
      case 0: return { id: Scr.fall, shown: 7, wide: true, options: [['沒有', () => { input.falls = { count: 0, injured: false }; }], ['1 次', () => { input.falls = { count: 1, injured: false }; }], ['2 次以上', () => { input.falls = { count: 2, injured: false }; }]] };
      case 1: return { id: Scr.fallHurt, shown: 7, wide: false, options: [['沒有', () => { f.injured = false; }], ['有', () => { f.injured = true; }]] };
      case 2: return { id: Scr.fallCount, shown: 7, wide: false, options: [['2、3 次', () => { f.count = 2; }], ['4 次以上', () => { f.count = 4; }]] };
      case 3: return { id: Scr.unsteady, shown: 8, wide: false, options: [['不會', () => { input.unsteady = false; }], ['會', () => { input.unsteady = true; }]] };
      case 4: return { id: Scr.fear, shown: 9, wide: false, options: [['不會', () => { input.fearOfFalling = false; }], ['會', () => { input.fearOfFalling = true; }]] };
      default: return { id: Scr.memory, shown: 10, wide: true, options: [['沒有', () => { input.memoryProblemDiagnosed = false; }], ['有', () => { input.memoryProblemDiagnosed = true; }], ['不知道', () => { input.memoryProblemDiagnosed = false; }]] };
    }
  }
  const questionSkipped = i => i === 1 ? input.falls.count === 0 : i === 2 ? input.falls.count < 2 : false;
  function advanceQuestion(i) {
    let n = i + 1;
    while (n < 6 && questionSkipped(n)) n++;
    if (n < 6) go('question:' + n); else go('sts');
  }

  // ---- 五次坐站 ----
  function stsView() {
    const m = sub.mode || 'intro';
    if (m === 'intro') return introCard({ title: '測驗一：五次坐站', clipID: 'test_sts', voiceID: Scr.stsIntro, helperNote: '站在他側前方，手準備扶，不要拉他。他每次站直時，按一下大鍵。', startTitle: '他準備好了，開始', startAct: 'stsBegin', skipAct: 'stsSkip' });
    if (m === 'result') return resultCard({ title: '五次坐站做完了', value: `${(sub.final || 0).toFixed(1)} 秒`, voiceID: Scr.stsDone, nextTitle: '下一個測驗：平衡', nextAct: 'stsNext', redoAct: 'stsRedo' });
    return timerPage({
      label: '計時中・五次坐站', safety: Copy.visitorSafety,
      content: watch.invalidated ? interrupted('stsRedo') : `<div class="center">${elapsedHtml()}</div><div class="center"><span class="bignum" id="count" style="font-size:calc(100px*min(var(--scale),1.15))">${watch.count}</span><span class="t1 soft">／ 5</span></div>${tapBtn('他站直了，按', 'stsTap')}`,
      bottom: watch.invalidated ? '' : bigBtn('他用手撐了／做不下去', 'stsUnable', { kind: 'danger' }),
    });
  }
  // ---- 三站平衡 ----
  function balanceView() {
    const m = sub.mode || 'overview', st = sub.stand || 0;
    if (m === 'overview') return scaffold({
      top: topbar(), title: '測驗二：平衡', lead: '有三站：並腳站、半前後站、前後站。每站站 10 秒。做不到的那一站就停，不用勉強。', fill: true,
      content: fig('stand_tandem', 260) + voiceBubble(Catalog.text(Scr.balIntro)),
      bottom: bigBtn('好，開始第一站', 'balFirst', { huge: true }) + quietBtn('跳過這個測驗', 'balSkip'),
    });
    if (m === 'intro') return introCard({ title: `第 ${st + 1} 站：${Scr.balNames[st]}`, clipID: Scr.balClips[st], voiceID: Scr.bal[st], helperNote: '站在他旁邊，兩手張開準備扶。他旁邊要有桌子或牆。他站好、手放開了，再按開始。', extraNote: st > 0 ? '哪隻腳在前都可以，他覺得穩的那隻。' : null, startTitle: '他站好了，開始計時', startAct: 'balBegin' });
    if (m === 'standResult') { const passed = sub.last >= 10; return resultCard({ title: passed ? `第 ${st + 1} 站完成` : `第 ${st + 1} 站到這裡`, value: `${Math.min(10, sub.last).toFixed(0)} 秒`, voiceID: passed ? Scr.balPass : Scr.balFail, nextTitle: (passed && st < 2) ? `下一站：${Scr.balNames[st + 1]}` : '下一個測驗：三公尺起走', nextAct: 'balAdvance' }); }
    return timerPage({
      label: `計時中・第 ${st + 1} 站：${Scr.balNames[st]}`, safety: '站在他旁邊，兩手張開準備扶。',
      content: watch.invalidated ? interrupted('balRedo') : `<div class="figfixed">${figureHTML(Scr.balClips[st], { still: 2 })}</div><div class="bignum center" id="count" style="font-size:calc(170px*min(var(--scale),1.15))">${Math.min(10, Math.floor(watch.elapsed()))}</div><p class="t3 soft center">秒（到 10 秒會嗶一聲）</p>`,
      bottom: watch.invalidated ? '' : bigBtn('腳動了／扶東西了', 'balStop', { kind: 'secondary', huge: true }),
    });
  }
  // ---- 三公尺起走 ----
  function tugView() {
    const m = sub.mode || 'intro';
    if (m === 'intro') return introCard({ title: '測驗三：三公尺起走', clipID: 'test_tug', voiceID: Scr.tugIntro, helperNote: '在椅子前面大約 3 公尺（四大步）放個東西當記號。他坐下的那一刻按停。第一次先練習，不計時。', startTitle: '他準備好了，開始計時', startAct: 'tugStart', skipAct: 'tugSkip', secondary: ['先練一次（不計時）', 'tugPractice'] });
    if (m === 'practice') return scaffold({
      top: topbar(), title: '練習（不計時）', lead: '看他走一趟。坐下之後按下面的鍵。', fill: true,
      content: fig('test_tug', 280) + voiceBubble(Catalog.text(Scr.tugPractice)),
      bottom: bigBtn('他坐下了', 'tugPracticeDone', { huge: true }),
    });
    if (m === 'result') return resultCard({ title: '三公尺起走做完了', value: `${(sub.final || 0).toFixed(1)} 秒`, voiceID: Scr.tugDone, nextTitle: '看結果', nextAct: 'tugNext', redoAct: 'tugRedo' });
    return timerPage({
      label: '計時中・三公尺起走', safety: '站在他旁邊走，手準備扶，不要拉他。',
      content: watch.invalidated ? interrupted('tugRedo') : `<div class="flex"></div><div class="center">${elapsedHtml()}</div><div class="flex"></div>${tapBtn('他坐下了，停', 'tugStop')}<div class="flex"></div>`,
      bottom: watch.invalidated ? '' : bigBtn('做不下去', 'tugUnable', { kind: 'danger' }),
    });
  }
  // ---- 四公尺步速（選配）----
  function gaitView() {
    const trial = sub.trial || 1, times = sub.times || [];
    if (!sub.timing) return scaffold({
      top: topbar(), title: '走 4 公尺', fill: true,
      content: fig('test_tug', 220) + voiceBubble(Catalog.text(Scr.gaitIntro)) + softCard('<p><b>你要做的：</b>起點和終點各放個東西當記號。他<b>第一隻腳越過終點</b>時按停。</p>', 'tint') + (times.length ? `<p class="soft">第 1 次：${times[0].toFixed(2)} 秒</p>` : ''),
      bottom: bigBtn(`預備、開始（第 ${trial} 次）`, 'gaitStart', { huge: true }) + quietBtn(trial === 1 ? '客廳太小，跳過' : '只做一次就好', 'gaitFinish'),
    });
    return timerPage({
      label: `計時中・走 4 公尺（第 ${trial} 次）`, safety: '站在他旁邊走，手準備扶，不要拉他。',
      content: watch.invalidated ? interrupted('gaitRedo') : `<div class="flex"></div><div class="center">${elapsedHtml()}</div><div class="flex"></div>${tapBtn('過線了，停', 'gaitStop')}<div class="flex"></div>`,
      bottom: watch.invalidated ? '' : bigBtn('做不下去', 'gaitUnable', { kind: 'danger' }),
    });
  }
  // ---- result ----
  function resultView() {
    const r = result, level = effectiveLevel(r), plus = r.plus && level !== 'A';
    const isRetest = !!(person && person.level);
    const flags = r.flags.map(f => Copy.flagText(f)).filter(Boolean).sort();
    let retestLine = '';
    if (isRetest) { const a = Levels.indexOf(person.level), b = Levels.indexOf(level); retestLine = b > a ? `比上次進步了！等級變成「${Copy.levelName(level)}」。` : b < a ? `這次退步了一點，先從「${Copy.levelName(level)}」慢慢來。` : '和上次差不多，繼續保持。'; }
    return scaffold({
      content: sectionLabel(`${name()}・${fmtMD(new Date())}`) + `<h1 style="font-size:var(--fs-large);font-weight:900">${esc(Copy.levelName(level))} ${plus ? pill(Copy.plusLabel) : ''}</h1><p class="t3">${esc(Copy.levelBlurb(level, plus))}</p>`
        + (r.level == null ? softCard('<p>有項目沒量，等級先算「坐著練」最安全；補量後會更新。</p>', 'tint') : '')
        + hairlineList([...flags.map(f => { const j = f.indexOf('可以'); return hrow({ label: j > 0 ? f.slice(0, j) : f, value: j > 0 ? f.slice(j) : '' }); }), hrow({ label: '下次重測', value: fmtMD(Schedule.retestDate(new Date())) + '（12 週後）' })])
        + (r.referral.length ? softCard(`<p class="bodystrong">${esc(Copy.referralText)}</p><p class="callout mt">${esc(Copy.referralScript)}</p>`, 'tint-danger') : '')
        + (retestLine ? `<p class="moss">${esc(retestLine)}</p>` : '')
        + (r.approximate && r.level != null ? '<p class="caption">＊這次沒量步速，等級是用其他兩項估的。</p>' : '')
        + (r.flags.includes('incomplete') ? '<p class="caption">＊有項目沒量，下次重測時補做。</p>' : ''),
      bottom: bigBtn('下一步', 'resultNext', { huge: true }) + `<p class="caption center">${esc(Copy.disclaimer)} <a data-act="sources" style="color:var(--ink);text-decoration:underline">資料來源 ›</a></p>`,
    });
  }
  function conditionsHtml() {
    return scaffold({
      top: topbar(), title: `${name()}有這些狀況嗎？`, lead: '有的勾起來，運動時會多提醒。沒有就直接下一步。',
      content: hairlineList(['osteoporosis', 'kneePain', 'hipReplacement', 'hypertension', 'dementia'].map(id => `<button class="crow" data-act="condToggle" data-id="${id}"><span class="box ${subject.conditions.includes(id) ? 'on' : ''}">${subject.conditions.includes(id) ? '✓' : ''}</span><span>${esc(Catalog.conditions[id].name)}</span></button>`)),
      bottom: bigBtn('下一步', 'condNext', { huge: true }),
    });
  }

  // ---- speech on entry + timers ----
  function mount() {
    clearInterval(timer); timer = null;
    const [k, iS] = step.split(':'); const i = iS != null ? parseInt(iS, 10) : 0;
    const m = sub.mode;
    if (k === 'safety') speak(step, [Scr.safety[i]]);
    else if (k === 'question') speak(step, [questionPage(i).id]);
    else if (k === 'sts' && (m || 'intro') === 'intro') speak('sts-intro-' + (sub.redo || 0), [Scr.stsIntro]);
    else if (k === 'sts' && m === 'result') speak('sts-result', [Scr.stsDone]);
    else if (k === 'balance' && (m || 'overview') === 'overview') speak('bal-overview', [Scr.balIntro]);
    else if (k === 'balance' && m === 'intro') speak('bal-intro-' + (sub.stand || 0) + '-' + (sub.redo || 0), [Scr.bal[sub.stand || 0]]);
    else if (k === 'balance' && m === 'standResult') speak('bal-res-' + (sub.stand || 0), [Scr.balDone, sub.last >= 10 ? Scr.balPass : Scr.balFail]);
    else if (k === 'tug' && (m || 'intro') === 'intro') speak('tug-intro-' + (sub.redo || 0), [Scr.tugIntro]);
    else if (k === 'tug' && m === 'practice') speak('tug-practice', [Scr.tugPractice, Scr.go]);
    else if (k === 'tug' && m === 'result') speak('tug-result', [Scr.tugDone]);
    else if (k === 'gait' && !sub.timing) speak('gait-intro-' + (sub.trial || 1), [Scr.gaitIntro]);
    else if (k === 'result') speak('result', [Scr.resultIntro, Scr.level(effectiveLevel(result), result.plus && effectiveLevel(result) !== 'A')]);
    if (watch.invalidated) speak('interrupted-' + step + (sub.redo || 0), [Scr.interrupted]);
    const timed = (k === 'sts' && m === 'running') || (k === 'balance' && m === 'running') || (k === 'tug' && m === 'timing') || (k === 'gait' && sub.timing);
    if (timed) {
      WakeLock.acquire();
      timer = setInterval(() => {
        if (watch.invalidated) return;
        const el = document.getElementById('elapsed'); if (el) el.textContent = watch.elapsed().toFixed(1);
        if (k === 'sts' && watch.isRunning && watch.elapsed() > 60) { watch.stop(); input.sitToStand = Timed.unable; go('balance'); }
        if (k === 'balance') { const c = document.getElementById('count'); if (c) c.textContent = String(Math.min(10, Math.floor(watch.elapsed()))); if (watch.isRunning && watch.elapsed() >= 10) balComplete(10); }
      }, 50);
    }
  }
  function balComplete(seconds) {
    if (sub.mode !== 'running') return;
    watch.stop(); Sound.play('beep');
    sub.results = sub.results || [null, null, null]; sub.results[sub.stand || 0] = seconds; sub.last = seconds; sub.mode = 'standResult'; Nav.refresh();
  }

  const s = {
    view, mount,
    onHistoryBack() { Voice.stop(); const prev = history.pop(); if (prev != null) { step = prev; sub = {}; watch = new Stopwatch(); lastSpoken = null; Nav.refresh(); } },
    unmount() { clearInterval(timer); Voice.stop(); WakeLock.release(); document.removeEventListener('visibilitychange', vis); if (afterUnmount) afterUnmount(); },
    act: {
      back: () => Nav.back(),
      repeat: () => { const [k, iS] = step.split(':'); const i = parseInt(iS || '0', 10); Voice.say([k === 'safety' ? Scr.safety[i] : questionPage(i).id]); },
      nameF: t => { nameVal = t.value; document.getElementById('nameBtn').disabled = !nameValid(); },
      yearF: t => { yearVal = t.value; document.getElementById('nameBtn').disabled = !nameValid(); const y = yearInt(); document.getElementById('ageHint').textContent = y ? `→ ${new Date().getFullYear() - y} 歲` : ''; },
      nameNext: () => { if (!nameValid()) return; subject = DB.insert(newPerson(nameVal.trim(), yearInt())); go('prepare'); },
      prepNext: () => go('safety:0'),
      safeNo: () => { const i = parseInt(step.split(':')[1], 10); input.safety[i] = false; if (i < 5) go('safety:' + (i + 1)); else go('question:0'); },
      safeYes: () => { const i = parseInt(step.split(':')[1], 10); input.safety[i] = true; redFlagIndex = i; Voice.stop(); showRedFlag(); },
      q: t => { const i = parseInt(step.split(':')[1], 10); const p = questionPage(i); p.options[parseInt(t.dataset.i, 10)][1](); advanceQuestion(i); },
      // sts
      stsBegin: () => { sub.mode = 'running'; Nav.refresh(); readyGo(() => !watch.isRunning && sub.final == null && !watch.invalidated); },
      stsSkip: () => { input.sitToStand = Timed.skipped; go('balance'); },
      stsTap: () => { if (!watch.press()) return; Sound.play('tap'); const c = document.getElementById('count'); if (c) c.textContent = String(watch.count); if (watch.count >= 5) { watch.stop(); sub.final = watch.elapsed(); sub.mode = 'result'; Nav.refresh(); } },
      stsUnable: () => confirmSheet({ title: '記為「無法」？', message: '他用手撐了或做不下去，這一項就記為「無法」，等級會算最安全的。', confirmTitle: '記為「無法」', danger: true, onConfirm: () => { watch.stop(); input.sitToStand = Timed.unable; go('balance'); } }),
      stsRedo: () => { watch.reset(); sub = { mode: 'intro', redo: (sub.redo || 0) + 1 }; Nav.refresh(); },
      stsNext: () => { input.sitToStand = Timed.seconds(sub.final || 0); go('balance'); },
      // balance
      balFirst: () => { Voice.stop(); sub.mode = 'intro'; sub.stand = 0; Nav.refresh(); },
      balSkip: () => { input.balance = { sideBySide: null, semiTandem: null, tandem: null, skipped: true }; go('tug'); },
      balBegin: () => { sub.mode = 'running'; if (!watch.isRunning && !watch.invalidated) watch.start(); Nav.refresh(); Voice.say([Scr.balStart]); },
      balStop: () => { watch.stop(); const t = watch.elapsed(); balComplete(t >= 9.95 ? 10 : t); },
      balRedo: () => { watch.reset(); sub.mode = 'intro'; sub.redo = (sub.redo || 0) + 1; Nav.refresh(); },
      balAdvance: () => {
        const passed = sub.last >= 10, st = sub.stand || 0;
        if (passed && st < 2) { sub.stand = st + 1; watch.reset(); sub.mode = 'intro'; Nav.refresh(); }
        else { const r = sub.results || [null, null, null]; input.balance = { sideBySide: r[0], semiTandem: r[1], tandem: r[2], skipped: false }; go('tug'); }
      },
      // tug
      tugPractice: () => { sub.mode = 'practice'; Nav.refresh(); },
      tugPracticeDone: () => { Voice.stop(); sub.mode = 'intro'; sub.redo = (sub.redo || 0) + 1; Nav.refresh(); },
      tugStart: () => { sub.mode = 'timing'; Nav.refresh(); readyGo(() => !watch.isRunning && sub.final == null && !watch.invalidated); },
      tugSkip: () => { input.timedUpAndGo = Timed.skipped; go('gaitAsk'); },
      tugStop: () => { if (!watch.isRunning) return; watch.stop(); Sound.play('tap'); sub.final = watch.elapsed(); sub.mode = 'result'; Nav.refresh(); },
      tugUnable: () => { watch.stop(); input.timedUpAndGo = Timed.unable; go('gaitAsk'); },
      tugRedo: () => { watch.reset(); sub = { mode: 'intro', redo: (sub.redo || 0) + 1 }; Nav.refresh(); },
      tugNext: () => { input.timedUpAndGo = Timed.seconds(sub.final || 0); go('gaitAsk'); },
      gaitYes: () => go('gait'), gaitNo: () => finishTests(),
      // gait
      gaitStart: () => { sub.timing = true; Nav.refresh(); readyGo(() => !watch.isRunning); },
      gaitStop: () => { if (!watch.isRunning) return; watch.stop(); const t = watch.elapsed(); sub.times = (sub.times || []).concat([t]); watch.reset(); sub.timing = false; if ((sub.trial || 1) === 1) { sub.trial = 2; Nav.refresh(); } else gaitFinish(); },
      gaitUnable: () => { watch.stop(); input.gait = Timed.unable; finishTests(); },
      gaitRedo: () => { watch.reset(); sub.timing = false; Nav.refresh(); },
      gaitFinish: () => gaitFinish(),
      // result → conditions → teach → install → setup → done
      resultNext: () => { Voice.stop(); persist(); go('conditions'); },
      sources: () => Nav.push(sourcesScreen()),
      condToggle: t => { const id = t.dataset.id; const set = new Set(subject.conditions); if (set.has(id)) set.delete(id); else set.add(id); subject.conditions = [...set].sort(); DB.save(); Nav.refresh(); },
      condNext: () => go('teachPrompt'),
      teach: () => startSession(subject, 'teach', { onTeachDone: () => go('install') }),
      teachSkip: () => go('install'),
      installNext: () => go('setup'), installSkip: () => go('done'), ...installActs,
      setupDone: () => { markSetupDone(subject); go('done'); }, setupSkip: () => go('done'),
      cardClose: () => exit(onDone),
    },
  };
  function gaitFinish() { const ts = sub.times || []; input.gait = ts.length ? Timed.seconds(Math.min(...ts)) : Timed.skipped; finishTests(); }
  function showRedFlag() {
    const temporary = redFlagIndex === 4;
    Nav.push(redFlagScreen({
      mode: 'visitor', safetyIndex: redFlagIndex,
      onSave: () => { if (subject) { subject.status = 'pendingDoctor'; subject.measuredAt = new Date().toISOString(); DB.save(); } leaveAll(); },
      onDiscard: () => leaveAll(),
    }));
    function leaveAll() { history.go(-(2 + (s.subDepth || 0))); }   // red-flag page + the whole flow
  }
  document.addEventListener('visibilitychange', vis);
  WakeLock.acquire();
  Nav.push(s);
  return s;
}
