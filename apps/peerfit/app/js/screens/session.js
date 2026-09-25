// E0 pre-check → E1–E4 coach (intro / demo / countdown / counting / rest / exercise done / pause) → E5 done card.
import { Catalog } from '../catalog.js';
import { Copy, Plan, Item, Schedule, ProgressionRules, fmtMD } from '../engine.js';
import { DB, Settings, Tempos, Checkpoint, newSessionLog, activeSessions } from '../store.js';
import { Nav, scaffold, topBar, bigBtn, quietBtn, softCard, voiceBubble, hairlineList, hrow, sectionLabel, chip, weekStrip, esc, nl, confirmSheet } from '../ui.js';
import { figureHTML, Figures } from '../anim.js';
import { Voice, Sound, WakeLock } from '../voice.js';
import { Coach } from '../coach.js';
import { redFlagScreen } from './home.js';
import { shareDoneCard } from '../share.js';

const fig = (id, h, sync = null) => `<div class="figbox" style="max-height:${h}px">${figureHTML(id, sync ? { sync } : {})}</div>`;

export function startSession(person, kind, opts = {}) { const s = sessionScreen(person, kind, opts); if (opts.replace) Nav.replace(s); else Nav.push(s); return s; }

export function sessionScreen(person, kind, { onTeachDone = null } = {}) {
  const isTeach = kind === 'teach';
  let step = 'precheck', coach = null, log = null, progressNote = null, showPause = false, rated = null, layoutKey = '', teachDone = false, unsubVoice = null;
  const checkpoint = kind === 'wheel' ? Checkpoint.load(person.id) : null;
  const week = () => person.programStart ? Schedule.week(new Date(person.programStart), new Date()) : 1;
  const tempo = () => Settings.tempoObj;

  function buildPlan() {
    let plan = Plan.build(person, kind, week());
    if (plan && person.level) plan.nextDay = Schedule.dayKind(person.level, person.plus, Schedule.addDays(new Date(), 1));
    if (plan && (kind === 'wheel' || kind === 'walk')) plan = Plan.capped(plan, Settings.sessionSets);
    return plan;
  }
  function start(resume) {
    const p = (resume && checkpoint ? checkpoint.plan : null) || buildPlan();
    if (!p) { Nav.pop(); return; }
    Voice.prefetch(p.items.filter(it => it.hasEnter).map(it => 'enter/' + it.id));
    coach = new Coach({ plan: p, personID: person.id, repSeconds: tempo().repSeconds, stepSeconds: tempo().stepSeconds, voice: Voice, beep: () => Sound.play('beep'), onCheckpoint: cp => { if (kind === 'wheel') Checkpoint.save(cp); }, onChange: onCoachChange });
    step = 'running'; layoutKey = '';
    WakeLock.acquire();
    if (!unsubVoice) unsubVoice = Voice.onChange(() => { if (step === 'running' && Nav.top() === s) { Nav.patch('cap', esc(Voice.caption || ' ')); Nav.patch('vb', nl(Voice.caption || (coach.item ? coach.item.instruction : ''))); Nav.patch('vbrest', nl(Voice.caption)); } });
    if (resume && checkpoint) coach.restore(checkpoint); else coach.begin();
  }
  function onCoachChange(c) {
    Figures.coachSync = c.figure; Figures.coachPaused = c.paused;
    if (c.isFinished) { if (step === 'running') finished(); return; }
    if (Nav.top() !== s || step !== 'running') return;
    const key = [c.phase, c.index, c.set, c.paused, c.item && c.item.id, c.animationID, c.phase === 'ready' ? c.readyText : '', showPause].join('|');
    if (key !== layoutKey) { layoutKey = key; Nav.refresh(); return; }
    Nav.patch('big', esc(counterMain())); Nav.patch('sub', esc(counterSub())); Nav.patch('setline', esc(setLine()));
    Nav.patch('secs', String(c.secondsLeft)); Nav.patch('cdn', String(c.countdownN));
    Nav.patch('restsub', esc(restSub()));
  }
  function finished() {
    const sm = coach.summary, w = coach.plan.week;
    const entry = newSessionLog(kind, sm.done, sm.total, sm.minutes, sm.partial, w);
    person.sessions.push(entry);
    if (kind === 'wheel' || kind === 'walk') person.lastActivityDate = new Date().toISOString();
    log = entry;
    if (!isTeach) applyAdjustments(w);
    DB.save(); Checkpoint.clear();
    if (!isTeach) { const n = activeSessions(person).length; if (n === 20) progressNote = (progressNote || '') + '做滿 20 次了，習慣養成了。'; if (n === 60) progressNote = (progressNote || '') + '12 週做完了！請朋友再幫你量一次，看看進步多少。'; }
    step = 'done'; WakeLock.release(); Nav.refresh();
  }
  function applyAdjustments(w) {
    const adj = person.adjustments || {};
    for (const pid in coach.hardPressed) adj[pid] = ProgressionRules.registerHard(adj[pid] || {}, coach.hardPressed[pid]);
    for (const pid of coach.easyPressed) {
      const [a, progress] = ProgressionRules.registerEasy(adj[pid] || {}, new Date());
      const x = a;
      if (progress) {
        const ex = Catalog.exercise(pid), name = ex ? ex.name : '';
        const cur = Catalog.exercise(x.variant || pid);
        if (cur && cur.harder) { x.variant = cur.harder; progressNote = `「${name}」下次換難一點的做法。`; }
        else if (ex && ex.harderNote) progressNote = `「${name}」：${ex.harderNote}。`;
      }
      adj[pid] = x;
    }
    person.adjustments = adj;
    if (ProgressionRules.isReloadWeek(w) && !person.sessions.some(x => x.week === w && x.id !== (log && log.id))) progressNote = (progressNote || '') + '做了 6 週了，重新調一下水瓶的水量：大約做 30 下會有點吃力。';
  }

  // ---- E0 pre-check ----
  function precheckView() {
    const full = Plan.build(person, kind, week());
    const mins = p => p ? Plan.estimatedMinutes(p, tempo().repSeconds, tempo().stepSeconds) : 0;
    const fullMin = mins(full), maxSets = full ? Math.max(1, ...full.items.map(i => i.sets)) : 1;
    let summary = '';
    if (kind === 'warmup') summary = `暖身 3 個動作，大約 ${fullMin} 分鐘。`;
    else if (kind === 'teach') summary = `你拿手機，${person.nickname}跟著做。每個動作做一組，走路類在家自己做，大約 ${fullMin} 分鐘。`;
    else if (kind === 'walk') { const w = person.level ? Catalog.walk(person.level, week()) : null; summary = w ? `今天走路：${w.laps} 趟，每趟 ${w.minutes} 分鐘。穿好鞋、帶手機。` : '今天走路。'; }
    else if (person.level && full) summary = `${Copy.levelName(person.level)}，${full.items.length} 個動作。旁邊要有穩固的桌子。做不完沒關係，做多少算多少。`;
    let chips = '';
    if (kind === 'wheel' && maxSets > 1) {
      const ss = Settings.sessionSets;
      chips = sectionLabel('今天做多少？') + `<div class="row3">${chip('一組', `約 ${mins(Plan.capped(full, 1))} 分`, ss === 1, 'sets', 'data-n="1"')}${maxSets > 2 ? chip('兩組', `約 ${mins(Plan.capped(full, 2))} 分`, ss === 2, 'sets', 'data-n="2"') : ''}${chip('全部', `約 ${fullMin} 分`, ss === 0 || ss >= maxSets, 'sets', 'data-n="0"')}</div>`;
    }
    return scaffold({
      top: topBar({ back: isTeach ? '取消' : '離開', act: 'leave' }), title: isTeach ? `${person.nickname}今天狀況可以嗎？` : '今天狀況可以嗎？',
      content: sectionLabel(isTeach ? `如果${person.nickname}有下面任何一項，今天先不做` : '有下面任何一項，今天先休息')
        + hairlineList(['胸口痛或胸悶', '頭暈、快昏倒', '發燒或生病', '醫生說血壓沒控制好'].map(t => hrow({ label: t, act: 'redflag' })))
        + chips + `<p class="callout mt">${esc(summary)}</p>`,
      bottom: (checkpoint ? bigBtn('從剛才中斷的地方繼續', 'resume', { huge: true, subtitle: `第 ${checkpoint.index + 1} 個動作` }) + bigBtn('重新開始', 'begin', { kind: 'secondary' })
        : bigBtn(isTeach ? `${person.nickname}狀況可以，開始` : '我今天狀況可以', 'begin', { huge: true }))
        + bigBtn(isTeach ? `${person.nickname}今天不舒服，先不做` : '今天不舒服，休息', 'leave', { kind: 'secondary' }),
    });
  }

  // ---- coach view helpers ----
  const it = () => coach.item;
  const header = () => topBar({ back: '離開', title: coach.plan.kind === 'walk' ? `第 ${coach.set} 趟，共 ${coach.totalSets} 趟` : `第 ${coach.index + 1} 個動作，共 ${coach.plan.items.length} 個`, act: 'hdr' });
  const teachBanner = () => isTeach ? '<div class="banner">教學：你拿手機，朋友跟著做</div>' : '';
  const safetyLine = () => isTeach ? `<p class="safety">${esc(Copy.visitorSafety)}</p>` : '';
  function specText(x) {
    const es = Item.effectiveSets(x);
    switch (x.mode) {
      case 'hold': return `${es} 組，每組 ${x.reps} 次，每次撐 ${x.hold} 秒`;
      case 'duration': return es === 1 ? `走 ${Math.max(1, Math.floor(x.secs / 60))} 分鐘` : `${es} 趟，每趟 ${Math.max(1, Math.floor(x.secs / 60))} 分鐘`;
      default: return `${es} 組，每組 ${x.reps} ${x.unit}` + (x.perSide ? '（左右輪流）' : '');
    }
  }
  function counterMain() {
    const x = it(); if (!x) return '';
    switch (coach.phase) {
      case 'ready': return coach.readyText; case 'entering': return '慢慢做';
      case 'counting': return String(Math.min(coach.rep + 1, x.reps)); case 'holding': return String(coach.secondsLeft);
      case 'relaxing': return '休息'; case 'timed': { const s = coach.secondsLeft; return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; }
      case 'free': return String(x.reps); default: return '';
    }
  }
  function counterSub() {
    const x = it(); if (!x) return '';
    switch (coach.phase) {
      case 'ready': return x.mode === 'hold' ? `第 ${Math.min(coach.rep + 1, x.reps)} 次` : `第 ${Math.min(coach.rep + 1, x.reps)} ${x.unit}起`;
      case 'entering': return '等我說「撐住」'; case 'counting': return `第 ${Math.min(coach.rep + 1, x.reps)} ${x.unit}，共 ${x.reps} ${x.unit}`;
      case 'holding': return `再撐 ${coach.secondsLeft} 秒`; case 'relaxing': return `休息 ${coach.secondsLeft} 秒`; case 'timed': return '還剩'; case 'free': return x.unit; default: return '';
    }
  }
  function setLine() {
    const x = it(); if (!x) return '';
    const side = coach.sideLabel;
    switch (x.mode) {
      case 'hold': return `第 ${Math.min(coach.rep + 1, x.reps)} 次，共 ${x.reps} 次` + (side ? `・現在${side}腳` : '');
      case 'duration': return Item.effectiveSets(x) === 1 ? '' : `第 ${coach.set} 趟，共 ${Item.effectiveSets(x)} 趟`;
      default: return `第 ${coach.set} 組，共 ${Item.effectiveSets(x)} 組` + (side ? `・現在${side}腳` : '');
    }
  }
  const restSub = () => coach.plan.kind === 'walk' ? `秒後走第 ${coach.set + 1} 趟` : `秒後做第 ${coach.set + 1} 組（共 ${coach.totalSets} 組）`;

  function introView() {
    const x = it();
    return scaffold({
      top: teachBanner() + header(), fill: true,
      content: fig(x.animationID, 320) + `<div class="pagetitle"><h1>${esc(x.name)}</h1><p class="lead">${esc(specText(x))}</p></div>` + voiceBubble(x.instruction) + (coach.plan.captions.length ? `<p class="callout">${esc(coach.plan.captions[0])}</p>` : ''),
      bottom: bigBtn('開始', 'start', { huge: true }) + `<div class="row2">${bigBtn('放大示範', 'demo', { kind: 'secondary' })}${bigBtn('跳過', 'skip', { kind: 'secondary' })}</div>` + safetyLine(),
    });
  }
  function countdownView() {
    return `<div class="screen">${header()}<div class="fillbody centered"><div class="col"><div class="flex"></div><div class="t1 center" style="font-size:calc(44px*var(--scale));font-weight:900">準備好了嗎？</div><div class="bignum count" id="cdn">${coach.countdownN}</div><div class="flex"></div></div></div></div>`;
  }
  function countingView() {
    const x = it(), ph = coach.phase, words = ph === 'ready' || ph === 'entering', stepCount = Item.countsSteps(x) && ph === 'counting';
    let mid;
    if (ph === 'free') mid = `<div class="t3 soft center" id="setline">${esc(setLine())}</div><div class="pagetitle" style="text-align:center;padding-top:8px"><h1>${esc(x.name)}</h1></div><p class="t3 soft center"><span id="big">${esc(counterMain())}</span> ${esc(x.unit)}，做完按「做完了」</p>`;
    else mid = `<div class="t3 soft center" id="setline">${esc(setLine())}</div><div class="bignum ${words ? 'words' : ''}" id="big" style="min-height:1em">${esc(counterMain())}</div><div class="t3 soft center" id="sub">${esc(counterSub())}</div>`
      + (!words && ph !== 'timed' && !stepCount ? `<div class="cuecap" id="cap">${esc(Voice.caption || ' ')}</div>` : '')
      + (ph === 'timed' ? voiceBubble(Voice.caption || x.instruction, 'vb') : '');
    const buttons = ph === 'free' ? bigBtn('做完了', 'freeDone', { huge: true }) + `<div class="row2">${bigBtn('暫停', 'pause', { kind: 'secondary' })}${!isTeach ? bigBtn('太難了', 'easier', { kind: 'secondary' }) : ''}</div>` + quietBtn('再聽一次說明', 'listen')
      : ph === 'timed' ? `<div class="row2">${bigBtn('暫停', 'pause', { kind: 'secondary' })}${!isTeach ? bigBtn('太難了', 'easier', { kind: 'secondary' }) : ''}</div>` + quietBtn('再聽一次說明', 'listen')
      : bigBtn('暫停', 'pause', { kind: 'secondary', huge: true }) + `<div class="row2">${!isTeach ? quietBtn('太難了', 'easier') : ''}${quietBtn('再聽一次說明', 'listen')}</div>`;
    return `<div class="screen">${teachBanner()}${header()}<div class="fillbody"><div class="col"><div class="flex"></div>${fig(coach.animationID || x.animationID, ph === 'free' ? 300 : 230, 'coach')}<div class="flex"></div>${mid}<div class="flex"></div></div></div><div class="bottom"><div class="col">${buttons}${safetyLine()}</div></div></div>`;
  }
  function restView() {
    return scaffold({
      top: header(), title: `第 ${coach.set} 組做完了`, fill: true, centered: true,
      content: `<div class="bignum" id="secs">${coach.secondsLeft}</div><p class="t3 soft center" id="restsub">${esc(restSub())}</p>` + voiceBubble(Voice.caption, 'vbrest'),
      bottom: bigBtn(`我好了，做第 ${coach.set + 1} 組`, 'restEnd', { huge: true }) + bigBtn('再休息一分鐘', 'restExtend', { kind: 'secondary' }),
    });
  }
  function exerciseDoneView() {
    const x = it(), isLast = coach.index + 1 >= coach.plan.items.length;
    const rb = (t, r) => bigBtn(t, 'rate', { kind: rated === r ? 'primary' : 'secondary', extra: `data-r="${r}"` });
    return scaffold({
      top: header(), fill: true,
      content: fig(x.animationID, 240) + `<div class="pagetitle"><h1>${esc(x.name)}<br>做完了</h1><p class="lead">${coach.totalSets} 組都做完了 ✓</p></div>` + (!isTeach ? voiceBubble(Catalog.text('cue/ex_done')) + `<div class="row3">${rb('太難了', 'harder')}${rb('剛剛好', 'ok')}${rb('太輕鬆', 'easier')}</div>` : ''),
      bottom: bigBtn(isLast ? '全部做完了' : `下一個動作：${coach.plan.items[coach.index + 1].name}`, 'next', { huge: true }),
    });
  }
  function pauseOverlay() {
    return `<div class="overlay">${scaffold({
      title: '暫停中', lead: `第 ${coach.index + 1} 個動作・第 ${coach.set} 組`,
      content: bigBtn('繼續', 'unpause', { huge: true }) + sectionLabel('速度') + `<div class="row3" style="gap:6px">${Tempos.map(t => bigBtn(t.label, 'tempo', { kind: Settings.tempo === t.id ? 'primary' : 'secondary', extra: `data-id="${t.id}"` })).join('')}</div>` + `<div class="mt">${bigBtn('再看一次示範', 'demo', { kind: 'secondary' })}</div>` + bigBtn('跳過這個動作', 'skipNow', { kind: 'secondary' }),
      bottom: bigBtn(isTeach ? '結束教學' : '今天到這裡，結束', 'finishNow', { kind: 'danger' }),
    })}</div>`;
  }
  function runningView() {
    let v;
    switch (coach.phase) {
      case 'intro': v = introView(); break;
      case 'countdown': v = countdownView(); break;
      case 'rest': v = restView(); break;
      case 'exerciseDone': v = exerciseDoneView(); break;
      case 'finished': v = '<div class="screen"></div>'; break;
      default: v = countingView();
    }
    return `<div class="screen rel">${v}${showPause ? pauseOverlay() : ''}</div>`;
  }
  function doneView() {
    const l = log;
    const weekDays = Schedule.weekdays(new Date()).filter(d => person.sessions.some(x => Schedule.isSameDay(new Date(x.date), d) && (x.kind === 'wheel' || x.kind === 'walk'))).length;
    return scaffold({
      title: isTeach ? '教完了！' : (kind === 'warmup' ? '暖身做完了！' : '做完了！'), lead: (isTeach ? person.nickname : fmtMD(new Date())) + (person.level && kind !== 'warmup' ? '・' + Copy.levelName(person.level) : ''), fill: true,
      content: fig('reach_overhead', 240)
        + (l ? softCard(`<p class="t2 center">${kind === 'walk' ? `走了 ${l.exercisesDone === 0 ? l.exercisesTotal : l.exercisesDone} 趟，${l.minutes} 分鐘` : isTeach ? `一起做了 ${l.exercisesDone} 個動作，${l.minutes} 分鐘` : `做了 ${l.exercisesDone} 個動作，${l.minutes} 分鐘`}</p>`, 'tint') : '')
        + (isTeach ? `<p class="t3">接下來幫${esc(person.nickname)}打開網頁、設定他的手機，之後每天打開就能自己做。</p>` : kind !== 'warmup' ? weekStrip(person, new Date()) + `<p class="callout">這週已做 ${weekDays} 天</p>` : '')
        + (progressNote ? softCard(`<p>${esc(progressNote)}</p>`, 'tint') : '')
        + voiceBubble(Catalog.text(isTeach ? 'cue/teach_done' : 'cue/session_done')),
      bottom: isTeach ? bigBtn(`下一步：幫${person.nickname}打開網頁`, 'close', { huge: true })
        : bigBtn('傳給朋友看', 'share', { icon: '↗' }) + bigBtn('好，回首頁', 'close', { kind: 'secondary' }) + (kind !== 'warmup' ? quietBtn('今天運動時有跌倒', 'fell') : ''),
    });
  }

  function pause() { coach.pause(); showPause = true; layoutKey = ''; Nav.refresh(); }
  function pushDemo(listen = false) {
    const x = it();
    Nav.push({
      view: () => scaffold({
        title: listen ? x.name : null, fill: true,
        content: fig(x.animationID, listen ? 320 : 460) + (listen ? '' : `<h1 class="t1">${esc(x.name)}</h1>`) + voiceBubble(x.instruction),
        bottom: listen ? bigBtn('再聽一次', 'again', { kind: 'secondary' }) + bigBtn('知道了', 'back', { huge: true }) : `<div class="row2">${bigBtn('再聽一次', 'again', { kind: 'secondary' })}${bigBtn('回上一頁', 'back', { huge: true })}</div>`,
      }),
      mount() { if (!this._said) { this._said = true; Voice.say(['ex/' + x.id]); } },
      act: { again: () => Voice.say(['ex/' + x.id]), back: () => Nav.pop() },
      unmount() { Voice.stop(); if (coach && coach.paused) { showPause = true; layoutKey = ''; } },
    });
  }
  const vis = () => { if (document.visibilityState !== 'visible' && step === 'running' && coach && !coach.isFinished && coach.phase !== 'intro' && coach.phase !== 'exerciseDone' && !coach.paused) pause(); };
  document.addEventListener('visibilitychange', vis);

  const s = {
    view() { return step === 'precheck' ? precheckView() : step === 'running' ? runningView() : doneView(); },
    mount() { if (step === 'running' && coach) { Figures.coachSync = coach.figure; Figures.coachPaused = coach.paused; } },
    unmount() { document.removeEventListener('visibilitychange', vis); if (unsubVoice) unsubVoice(); if (coach) coach.cancel(); Voice.stop(); WakeLock.release(); Figures.coachSync = { kind: 'free' }; Figures.coachPaused = false; if (teachDone && onTeachDone) onTeachDone(); },
    act: {
      leave: () => Nav.pop(),
      redflag: () => Nav.push(redFlagScreen({ mode: 'selfCheck', onClose: () => history.go(-2) })),
      sets: t => { Settings.set('sessionSets', parseInt(t.dataset.n, 10)); Nav.refresh(); },
      begin: () => start(false), resume: () => start(true),
      hdr: () => { if (coach.phase === 'intro' || coach.phase === 'exerciseDone') Nav.pop(); else pause(); },
      start: () => coach.start(),
      demo: () => { Voice.stop(); showPause = false; pushDemo(false); },
      listen: () => { pause(); showPause = false; pushDemo(true); },
      skip: () => coach.skipExercise(),
      pause: () => pause(),
      easier: () => coach.makeEasierNow(),
      freeDone: () => coach.freeDone(),
      restEnd: () => coach.endRestNow(), restExtend: () => coach.extendRest(),
      rate: t => { rated = t.dataset.r; coach.rate(rated); Nav.refresh(); },
      next: () => { rated = null; coach.nextExercise(); },
      unpause: () => { showPause = false; layoutKey = ''; coach.resume(); Nav.refresh(); },
      tempo: t => { Settings.set('tempo', t.dataset.id); const tp = tempo(); coach.repSeconds = tp.repSeconds; coach.stepSeconds = tp.stepSeconds; Nav.refresh(); },
      skipNow: () => { showPause = false; coach.skipExercise(); },
      finishNow: () => { showPause = false; coach.finishNow(); },
      share: () => shareDoneCard(person, log),
      close: () => { if (isTeach) teachDone = true; Nav.pop(); },
      fell: () => confirmSheet({ title: '你今天運動時跌倒了嗎？', message: '有跌倒的話，會先停掉運動，請朋友再幫你量一次；有受傷請先看醫生。', confirmTitle: '是，有跌倒', danger: true, cancelTitle: '沒有', onConfirm: () => { if (log) log.fell = true; person.status = 'needsRetest'; DB.save(); Nav.push(redFlagScreen({ mode: 'selfCheck', onClose: () => history.go(-2) })); } }),
    },
  };
  // the precheck 「resume」 and 「begin」 both start; a checkpoint from a different plan kind is ignored
  return s;
}
