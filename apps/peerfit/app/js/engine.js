// Pure logic ported 1:1 from the iOS app: Schedule, ProgressionRules, ScreeningEngine, SessionPlan, Copy, TodayState.
import { Catalog } from './catalog.js';

const DAY = 86400000;
export const Levels = ['A', 'B', 'C', 'D'];

// ---- Schedule (Monday-first weeks) ---------------------------------------------------------
export const Schedule = {
  startOfDay(d) { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; },
  weekdayIndex(d) { return (new Date(d).getDay() + 6) % 7; },   // 0 = Monday … 6 = Sunday
  mondayOfWeek(d) { const s = this.startOfDay(d); s.setDate(s.getDate() - this.weekdayIndex(s)); return s; },
  addDays(d, n) { const x = new Date(d); x.setDate(x.getDate() + n); return x; },
  daysBetween(a, b) { return Math.round((this.startOfDay(b) - this.startOfDay(a)) / DAY); },
  isSameDay(a, b) { return this.startOfDay(a).getTime() === this.startOfDay(b).getTime(); },
  week(start, date) { const w = Math.round((this.mondayOfWeek(date) - this.mondayOfWeek(start)) / (7 * DAY)); return Math.max(1, w + 1); },
  dayKind(level, plus, date) { return Catalog.week(level, plus)[this.weekdayIndex(date)]; },
  retestDate(measured) { return this.addDays(measured, 84); },
  weekdays(date) { const m = this.mondayOfWeek(date); return [0, 1, 2, 3, 4].map(i => this.addDays(m, i)); },
};

export function fmtMD(d) { d = new Date(d); return `${d.getMonth() + 1}月${d.getDate()}日`; }
export function fmtYMD(d) { d = new Date(d); return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`; }
export function fmtWeekday(d) { return '星期' + ['日', '一', '二', '三', '四', '五', '六'][new Date(d).getDay()]; }

// ---- Copy ------------------------------------------------------------------------------
export const Copy = {
  disclaimer: '這不是醫療診斷，有不舒服請停止並找醫生。',
  visitorSafety: '不要拉他、抱他、扶他站起來。他站不起來就按「無法」。',
  plusLabel: '多練平衡',
  hotline: '1966',
  levelName(l) { return { A: '坐著練', B: '扶著練', C: '站著練', D: '進階練' }[l] || ''; },
  levelBlurb(l, plus) {
    switch (l) {
      case 'A': return '坐著做，重點是腿力和手的力氣。每天做，一次大約二十分鐘。';
      case 'B': return plus ? '扶著桌子做，重點是腿力和平衡。每週四天做動作、一天走路，一次大約二十五分鐘。' : '扶著桌子做，重點是腿力和平衡。每週三天做動作、兩天走路，一次大約二十五分鐘。';
      case 'C': return plus ? '站著做，重點是平衡和走路。每週四天做動作、一天走路，一次大約三十分鐘。' : '站著做，重點是平衡和走路。每週三天做動作、兩天走路，一次大約三十分鐘。';
      default: return plus ? '有爬樓梯和走八字，重點是全身的力氣和平衡。每週三天做動作、兩天走路，一次大約三十五分鐘。平衡的動作扶著做。' : '有爬樓梯和走八字，重點是全身的力氣和平衡。每週三天做動作、兩天走路，一次大約三十五分鐘。';
    }
  },
  flagText(f) { return { mobility: '行動力可以加強', balance: '平衡可以加強', gaitSlow: '起走可以加強', strength: '肌力可以加強' }[f] || null; },
  referralText: '建議也請衛生所，或撥 1966 長照專線，做進一步評估。',
  referralScript: '可以這樣說：「app 建議你去衛生所看看有沒有適合的課，我陪你去。」',
  redFlagScript: '「app 說你最近的狀況最好先給醫生看一下，我陪你去。」',
  flagsOf(p) { return (p.flags || []).map(f => Copy.flagText(f)).filter(Boolean).sort(); },
};

// ---- ProgressionRules ----------------------------------------------------------------------
export const ProgressionRules = {
  needsBreakCheck(lastActivity, today) {
    if (!lastActivity) return false;
    return Schedule.daysBetween(new Date(lastActivity), today) >= Catalog.rules.breakDays;
  },
  resetStart(today) { return Schedule.mondayOfWeek(today); },
  registerEasy(a, today) {
    const x = { variant: null, setsDelta: 0, easyStreak: 0, lastEasyDate: null, ...a };
    if (x.lastEasyDate && Schedule.isSameDay(new Date(x.lastEasyDate), today)) return [x, false];
    x.easyStreak = (x.lastEasyDate && Schedule.daysBetween(new Date(x.lastEasyDate), today) <= 4) ? x.easyStreak + 1 : 1;
    x.lastEasyDate = today.toISOString();
    if (x.easyStreak >= Catalog.rules.harderAfterConsecutiveWheelDays) { x.easyStreak = 0; return [x, true]; }
    return [x, false];
  },
  registerHard(a, easier) {
    const x = { variant: null, setsDelta: 0, easyStreak: 0, lastEasyDate: null, ...a };
    x.easyStreak = 0;
    if (easier) x.variant = easier; else x.setsDelta = Math.max(-1, x.setsDelta - 1);
    return x;
  },
  isReloadWeek(w) { return w === Catalog.rules.reloadWeek; },
  retestDue(nextRetestAt, today) { return !!nextRetestAt && Schedule.startOfDay(new Date(nextRetestAt)) <= Schedule.startOfDay(today); },
  levelAfterRetest(previous, previousTotal, result) {
    const lvl = result.level; if (!lvl) return previous;
    if (!previous || previousTotal == null) return lvl;
    const up = Levels.indexOf(lvl) > Levels.indexOf(previous);
    if (up && result.total - previousTotal < 1) return previous;
    return lvl;
  },
};

// ---- ScreeningEngine ----------------------------------------------------------------------
// input: { safety:[6 bool], falls:{count:0|1|2|4, injured}, unsteady, fearOfFalling, sarcfLift..Stairs, memoryProblemDiagnosed,
//          sitToStand:{kind:'seconds'|'unable'|'skipped', seconds}, balance:{sideBySide, semiTandem, tandem, skipped}, timedUpAndGo, gait }
export function newInput() {
  return { safety: [false, false, false, false, false, false], falls: { count: 0, injured: false }, unsteady: false, fearOfFalling: false,
    sarcfLift: 0, sarcfWalk: 0, sarcfRise: 0, sarcfStairs: 0, memoryProblemDiagnosed: false, calf: null,
    sitToStand: { kind: 'skipped' }, balance: { sideBySide: null, semiTandem: null, tandem: null, skipped: false }, timedUpAndGo: { kind: 'skipped' }, gait: { kind: 'skipped' } };
}
export const Timed = { seconds: s => ({ kind: 'seconds', seconds: s }), unable: { kind: 'unable' }, skipped: { kind: 'skipped' } };
const secondsOf = r => r && r.kind === 'seconds' ? r.seconds : null;
const sarcfPoints = f => f.count === 0 ? 0 : f.count >= 4 ? 2 : 1;

export const ScreeningEngine = {
  stsCut4: 11.19, stsCut3: 13.69, stsCut2: 16.69, stsMax: 60.0, stsMobilityFlag: 12.0,
  gaitCut4: 4.82, gaitCut3: 6.20, gaitCut2: 8.70, gaitPlus: 5.0, tugFlag: 12.0, tugPlus: 20.0,
  standPass: 10.0, tandemPartial: 3.0, sarcfPositive: 4, calfMale: 34.0, calfFemale: 33.0,
  r2(x) { return Math.round(x * 100) / 100; },
  sitToStandScore(r) {
    if (r.kind === 'skipped') return null; if (r.kind === 'unable') return 0;
    const s = this.r2(r.seconds);
    if (s <= this.stsCut4) return 4; if (s <= this.stsCut3) return 3; if (s <= this.stsCut2) return 2; if (s <= this.stsMax) return 1; return 0;
  },
  balanceScore(b) {
    if (b.skipped) return null;
    let score = 0;
    if (b.sideBySide == null || this.r2(b.sideBySide) < this.standPass) return score; score += 1;
    if (b.semiTandem == null || this.r2(b.semiTandem) < this.standPass) return score; score += 1;
    if (b.tandem == null) return score;
    const t = this.r2(b.tandem);
    if (t >= this.standPass) score += 2; else if (t >= this.tandemPartial) score += 1;
    return score;
  },
  gaitScore(r) {
    if (r.kind === 'skipped') return null; if (r.kind === 'unable') return 0;
    const s = this.r2(r.seconds);
    if (s < this.gaitCut4) return 4; if (s <= this.gaitCut3) return 3; if (s <= this.gaitCut2) return 2; return 1;
  },
  level(total, approximate) {
    if (approximate) return total <= 3 ? 'A' : total <= 5 ? 'B' : total <= 7 ? 'C' : 'D';
    return total <= 3 ? 'A' : total <= 6 ? 'B' : total <= 9 ? 'C' : 'D';
  },
  evaluate(i) {
    const flags = new Set(), referral = new Set();
    const sarcf = i.sarcfLift + i.sarcfWalk + i.sarcfRise + i.sarcfStairs + sarcfPoints(i.falls);
    if (i.safety.some(Boolean)) {
      referral.add('safetyGate');
      return { stoppedAtSafetyGate: true, balanceScore: 0, sitToStandScore: 0, gaitScore: null, total: 0, approximate: true, level: null, plus: false, flags: [], referral: [...referral], sarcfTotal: sarcf };
    }
    const sts = this.sitToStandScore(i.sitToStand), bal = this.balanceScore(i.balance), gait = this.gaitScore(i.gait);
    if (sts == null || bal == null) flags.add('incomplete');
    const stsS = secondsOf(i.sitToStand);
    if (stsS != null && this.r2(stsS) >= this.stsMobilityFlag) flags.add('mobility');
    if (i.sitToStand.kind === 'unable') { flags.add('mobility'); referral.add('sitToStandUnable'); }
    if (!i.balance.skipped) {
      const tandemOK = i.balance.tandem != null && this.r2(i.balance.tandem) >= this.standPass;
      if (!tandemOK) flags.add('balance');
    }
    const tug = secondsOf(i.timedUpAndGo);
    if (tug != null && this.r2(tug) >= this.tugFlag) flags.add('gaitSlow');
    if (i.timedUpAndGo.kind === 'unable') flags.add('gaitSlow');
    if (sarcf >= this.sarcfPositive) flags.add('strength');
    if (i.calf && i.calf.centimeters < (i.calf.sex === 'male' ? this.calfMale : this.calfFemale)) flags.add('strength');

    let plus = false;
    if (i.falls.count >= 2 || (i.falls.count === 1 && i.falls.injured)) plus = true;
    if (tug != null && this.r2(tug) > this.tugPlus) plus = true;
    if (i.timedUpAndGo.kind === 'unable') plus = true;
    const g = secondsOf(i.gait);
    if (g != null && this.r2(g) > this.gaitPlus) plus = true;
    if (i.gait.kind === 'unable') plus = true;
    if (i.memoryProblemDiagnosed) plus = true;
    if (i.falls.count >= 2 || i.falls.injured) referral.add('fallsTwoOrInjured');

    let total = 0, approximate = gait == null, lvl = null;
    if (sts != null && bal != null) {
      total = sts + bal + (gait || 0);
      lvl = this.level(total, approximate);
      if (lvl === 'A' || lvl === 'B') referral.add('lowFunction');
    } else approximate = true;
    if (lvl === 'A') plus = false;
    return { stoppedAtSafetyGate: false, balanceScore: bal || 0, sitToStandScore: sts || 0, gaitScore: gait, total, approximate, level: lvl, plus, flags: [...flags], referral: [...referral], sarcfTotal: sarcf };
  },
};
export const effectiveLevel = r => r.level || 'A';

// ---- Session plan ----------------------------------------------------------------------------
export function makeItem(eid, prescribed, adjust, overrideSets = null, overrideSecs = null) {
  const e = Catalog.exercise(eid); if (!e) return null;
  const sets = Math.max(1, (overrideSets ?? e.sets) + ((adjust && adjust.setsDelta) || 0));
  return {
    id: eid, prescribedID: prescribed, name: e.name, instruction: e.instruction, mode: e.mode, sets, reps: e.reps, unit: e.unit,
    secs: overrideSecs ?? e.secs ?? 0, hold: e.hold || 0, perSide: !!e.perSide, animationID: Catalog.animationID(eid),
    easier: e.easier || null, harder: e.harder || null, harderNote: e.harderNote || null, easierNote: e.easierNote || null,
    cue: e.cue || [], hasEnter: !!e.enter, hasRelease: !!e.release, restSecs: e.restSecs ?? null,
    sideSplit: !!e.sideSplit, animationRight: e.animationRight || null, alternate: !!e.alternate,
  };
}
export const Item = {
  effectiveSets: it => it.perSide ? it.sets * 2 : it.sets,
  cueA: it => it.cue.length === 2 ? it.cue[0] : null,
  cueB: it => it.cue.length === 2 ? it.cue[1] : null,
  countsSteps: it => it.cue.length === 1 && it.cue[0] === 'count',
};

export const Plan = {
  estimatedMinutes(plan, repSeconds = Catalog.rules.repSeconds, stepSeconds = Catalog.rules.stepSeconds) {
    const rules = Catalog.rules; let s = 0;
    for (const it of plan.items) {
      const sets = Item.effectiveSets(it);
      switch (it.mode) {
        case 'reps': s += sets * it.reps * repSeconds; break;
        case 'steps': s += sets * it.reps * stepSeconds; break;
        case 'hold': s += sets * it.reps * (it.hold + 5); break;
        case 'duration': s += sets * it.secs; break;
        case 'free': s += sets * 45; break;
      }
      s += Math.max(0, sets - 1) * (it.restSecs ?? rules.restSeconds) + 25;
    }
    return Math.max(1, Math.round(s / 60));
  },
  capped(plan, sets) {
    if (!(sets > 0)) return plan;
    const p = structuredClone(plan);
    for (const it of p.items) if (it.mode !== 'duration') it.sets = Math.min(it.sets, sets);
    return p;
  },
  wheel(person, week, teach = false) {
    const lvl = person.level; if (!lvl) return null;
    const ids = Catalog.wheel(lvl, person.plus, person.conditions);
    const adj = person.adjustments || {};
    const items = [];
    for (const pid of ids) {
      const a = adj[pid];
      const actual = (a && a.variant) || pid;
      let it = makeItem(actual, pid, a) || makeItem(pid, pid, a);
      if (!it) continue;
      if (teach) { if (it.mode === 'duration') continue; it.sets = 1; it.perSide = false; }
      items.push(it);
    }
    const caps = Catalog.rules.safety.concat(Catalog.captions(person.conditions));
    if (lvl === 'D' && person.plus) caps.push('平衡的動作扶著做');
    return { kind: teach ? 'teach' : 'wheel', level: lvl, week, items, captions: caps, nextDay: null };
  },
  walk(person, week) {
    const lvl = person.level; if (!lvl) return null;
    const w = Catalog.walk(lvl, week); if (!w) return null;
    const it = makeItem('walk_continuous', 'walk_continuous', null, w.laps, w.minutes * 60); if (!it) return null;
    it.mode = 'duration';
    return { kind: 'walk', level: lvl, week, items: [it], captions: ['能說話、不能唱歌，就是剛好的速度', '帶著手機，穿好鞋，扶著東西走'], nextDay: null };
  },
  warmup() {
    const items = Catalog.rules.warmupOnly.map(id => makeItem(id, id, null)).filter(Boolean);
    return { kind: 'warmup', level: null, week: 0, items, captions: Catalog.rules.safety, nextDay: null };
  },
  build(person, kind, week) {
    switch (kind) { case 'wheel': return this.wheel(person, week); case 'walk': return this.walk(person, week); case 'teach': return this.wheel(person, week, true); default: return this.warmup(); }
  },
};

// ---- TodayState ---------------------------------------------------------------------------
export function todayState(p, today = new Date()) {
  const st = { kind: 'notMeasured', week: 1, locked: false, retestDue: false, doneToday: false, weekDone: 0, todayLog: null, estimatedMinutes: 0, walkSubtitle: null, plan: null, tomorrow: null };
  st.week = p.programStart ? Schedule.week(new Date(p.programStart), today) : 1;
  st.locked = p.status === 'needsRetest' || p.status === 'pendingDoctor';
  st.retestDue = ProgressionRules.retestDue(p.nextRetestAt, today);
  const logs = p.sessions.filter(s => Schedule.isSameDay(new Date(s.date), today) && (s.kind === 'wheel' || s.kind === 'walk'));
  st.todayLog = logs[logs.length - 1] || null; st.doneToday = logs.length > 0;
  st.weekDone = Schedule.weekdays(today).filter(d => p.sessions.some(s => Schedule.isSameDay(new Date(s.date), d) && (s.kind === 'wheel' || s.kind === 'walk'))).length;
  if (!p.level) return st;
  const dk = Schedule.dayKind(p.level, p.plus, today);
  st.tomorrow = Schedule.dayKind(p.level, p.plus, Schedule.addDays(today, 1));
  if (dk === 'wheel') { st.kind = 'wheel'; st.plan = Plan.wheel(p, st.week); st.estimatedMinutes = st.plan ? Plan.estimatedMinutes(st.plan) : Catalog.level(p.level).minutes; }
  else if (dk === 'walk') { st.kind = 'walk'; st.plan = Plan.walk(p, st.week); const w = Catalog.walk(p.level, st.week); if (w) st.walkSubtitle = w.laps === 1 ? `走 ${w.minutes} 分鐘` : `走 ${w.laps} 趟，每趟 ${w.minutes} 分鐘`; }
  else st.kind = 'rest';
  return st;
}
export const tomorrowText = k => ({ wheel: '做動作', walk: '走路', rest: '休息' })[k] || '';
export function weekCount(p, ref) {
  const m = Schedule.mondayOfWeek(ref);
  return [0, 1, 2, 3, 4, 5, 6].filter(i => { const d = Schedule.addDays(m, i); return p.sessions.some(s => Schedule.isSameDay(new Date(s.date), d) && (s.kind === 'wheel' || s.kind === 'walk')); }).length;
}

// ---- Friend setup (what to tap on the friend's phone) ---------------------------------------------
export const conditionOrder = ['osteoporosis', 'kneePain', 'hipReplacement', 'hypertension', 'dementia'];
export function friendSetupSteps(person, appName) {
  const level = person.level || 'A', plus = person.plus && level !== 'A';
  const s = [`在${person.nickname}的手機打開「${appName}」（主畫面的圖示，或用瀏覽器打開網址）`, '按「朋友幫我量過了」', `選「${Copy.levelName(level)}」`];
  if (level !== 'A') s.push(plus ? '多練平衡：按「要」' : '多練平衡：按「不用」');
  const names = conditionOrder.filter(c => person.conditions.includes(c)).map(c => Catalog.conditions[c].name);
  s.push(names.length ? `身體狀況：勾「${names.join('」「')}」` : '身體狀況：都沒有');
  s.push('按「好了」');
  return s;
}

export function setLevel(p, level, plus, source, measuredAt, result) {
  p.level = level; p.plus = plus; p.levelSource = source;
  p.measuredAt = measuredAt.toISOString();
  p.nextRetestAt = Schedule.retestDate(measuredAt).toISOString();
  p.programStart = Schedule.mondayOfWeek(new Date()).toISOString();
  p.approximate = result ? !!result.approximate : false;
  p.incomplete = result ? result.flags.includes('incomplete') : false;
  p.referral = result ? result.referral.length > 0 : false;
  p.flags = result ? result.flags.filter(f => f !== 'incomplete') : [];
  p.status = 'ok';
  p.adjustments = {};
}
