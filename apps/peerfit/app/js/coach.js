// Exercise-session engine (port of Coach.swift): every step waits for speech to finish; key transitions wait for a tap.
// Cancellation: each background sequence captures `gen`; any user action bumps it and every await re-checks.
import { Catalog } from './catalog.js';
import { Item, makeItem } from './engine.js';

export class Coach {
  constructor({ plan, personID, repSeconds = 4.0, stepSeconds = 1.5, voice, beep = () => {}, onCheckpoint = () => {}, onChange = () => {} }) {
    this.plan = plan; this.personID = personID; this.rules = Catalog.rules;
    this.repSeconds = repSeconds; this.stepSeconds = stepSeconds;
    this.voice = voice; this.beep = beep; this.onCheckpoint = onCheckpoint; this.onChange = onChange;
    this.phase = 'intro'; this.countdownN = 3; this.index = 0; this.set = 1; this.rep = 0; this.secondsLeft = 0; this.paused = false;
    this.doneCount = 0; this.elapsed = 0; this.overrides = {}; this.figure = { kind: 'free' }; this.readyText = '';
    this.hardPressed = {}; this.easyPressed = new Set();
    this.gen = 0; this.sleepers = new Set(); this.freeResolve = null; this.freeDoneRequested = false;
    this.restSkip = false; this.restExtend = false; this.startedAt = 0;
  }
  now() { return Date.now() / 1000; }
  emit() { this.onChange(this); }
  get item() { return this.index < this.plan.items.length ? (this.overrides[this.index] || this.plan.items[this.index]) : null; }
  get totalSets() { return this.item ? Item.effectiveSets(this.item) : 0; }
  get isFinished() { return this.phase === 'finished'; }
  get sideLabel() {
    const it = this.item; if (!it) return null;
    if (it.perSide) return this.set % 2 === 1 ? '左' : '右';
    if (it.sideSplit) return this.rep < Math.floor(it.reps / 2) ? '左' : '右';
    return null;
  }
  get animationID() {
    const it = this.item; if (!it) return null;
    if (it.sideSplit && it.animationRight && this.phase !== 'intro' && this.phase !== 'exerciseDone' && this.rep >= Math.floor(it.reps / 2)) return it.animationRight;
    return it.animationID;
  }
  get summary() { return { done: this.doneCount, total: this.plan.items.length, minutes: Math.max(1, Math.round(this.elapsed / 60)), partial: this.doneCount < this.plan.items.length }; }

  // ---- cancellation helpers ----
  cancel() { this.gen += 1; for (const r of this.sleepers) r(); this.sleepers.clear(); this.voice.stop(); const f = this.freeResolve; this.freeResolve = null; if (f) f(); }
  alive(g) { return g === this.gen; }
  sleep(sec, g) {
    return new Promise(res => {
      if (!this.alive(g) || sec <= 0) { res(); return; }
      const done = () => { this.sleepers.delete(done); clearTimeout(t); res(); };
      const t = setTimeout(done, sec * 1000);
      this.sleepers.add(done);
    });
  }
  async sleepUntil(t, g) { const d = t - this.now(); if (d > 0) await this.sleep(d, g); }
  async say(ids, g) { if (!this.alive(g)) return; await this.voice.say(ids); }
  setFigure(f) { this.figure = f; this.emit(); }

  // ---- lifecycle ----
  begin() {
    this.startedAt = this.now();
    if (!this.plan.items.length) { this.finish(); return; }
    this.showIntro();
  }
  restore(c) {
    this.index = Math.min(c.index, this.plan.items.length - 1); this.set = c.set; this.rep = 0; this.doneCount = c.doneCount; this.elapsed = c.elapsed;
    this.startedAt = this.now() - this.elapsed;
    this.showIntro();
  }
  showIntro() {
    const it = this.item; if (!it) { this.finish(); return; }
    this.phase = 'intro'; this.rep = 0; this.restSkip = false; this.restExtend = false; this.figure = { kind: 'free' };
    this.checkpoint(); this.emit();
    this.cancel(); const g = this.gen;
    this.introTask = this.say(this.introClips(it), g);
  }
  introClips(it) {
    const c = [];
    if (this.plan.kind !== 'walk') c.push('nth/' + Math.min(12, this.index + 1));
    c.push('name/' + (it.prescribedID === 'walk_warmup' ? 'walk_warmup' : it.id));
    if (it.mode === 'duration' && it.secs < 60) c.push(`spec/${it.id}_s10`);
    else if (it.mode === 'duration') { if (Item.effectiveSets(it) > 1) c.push(`spec/${it.id}_l${Math.min(5, Item.effectiveSets(it))}`); c.push(`spec/${it.id}_m${Math.max(1, Math.min(45, Math.floor(it.secs / 60)))}`); }
    else c.push(`spec/${it.id}_s${Math.max(1, Math.min(5, it.sets))}`);
    c.push('ex/' + it.id);
    if (it.perSide && this.set === 1) c.push('cue/left_first');
    return c;
  }
  /// 開始 (from intro / demo) or resume after pause.
  start() {
    if (!(this.phase === 'intro' || this.paused)) return;
    this.paused = false;
    this.cancel(); const g = this.gen;
    this.runSet(g);
  }
  async ready(text, ids, pause, g, beep = false) {
    this.phase = 'ready'; this.readyText = text; this.figure = { kind: 'still' }; this.emit();
    if (beep) this.beep();
    await this.say(ids, g);
    await this.sleep(pause, g);
  }
  motionPeriod(it) { return it.mode === 'reps' ? this.repSeconds : this.stepSeconds; }
  startMotion(it) {
    const start = Date.now();
    if (Item.cueA(it)) this.figure = { kind: 'reps', period: this.motionPeriod(it), start };
    else if (Item.countsSteps(it)) this.figure = { kind: 'steps', index: this.rep, period: this.stepSeconds, start };
    else this.figure = { kind: 'free' };
    this.emit();
  }

  // ---- the set loop ----
  async runSet(g) {
    const it = this.item; if (!it) { this.finish(); return; }
    await this.countdown(g);
    if (!this.alive(g)) return;
    switch (it.mode) {
      case 'reps': case 'steps': await this.runReps(it, g); break;
      case 'hold': await this.runHolds(it, g); break;
      case 'duration': await this.runTimed(it, g); break;
      case 'free': await this.runFree(it, g); break;
    }
    if (!this.alive(g)) return;
    await this.setFinished(it, g);
  }
  /// 「準備好了嗎？」 then one natural clip 「三、二、一、開始。」 with the digits shown ~0.9 s apart.
  async countdown(g) {
    this.phase = 'countdown'; this.countdownN = 3; this.figure = { kind: 'still' }; this.emit();
    await this.say(['cue/ready'], g);
    if (!this.alive(g)) return;
    const t = this.now();
    const clip = this.say(['cue/countdown'], g);
    for (let n = 3; n >= 1; n--) {
      if (!this.alive(g)) return;
      this.countdownN = n; this.emit();
      await this.sleepUntil(t + (3 - n) * 0.9 + 0.9, g);
    }
    await clip;
  }
  async runReps(it, g) {
    this.phase = 'counting'; this.figure = { kind: 'still' }; this.emit();
    if (it.sideSplit && this.rep === 0) await this.ready('先做左腳', ['cue/left_leg'], 0.8, g);
    else if (it.alternate && this.rep === 0) await this.ready('左腳右腳輪流', ['cue/alternate_legs'], 0.5, g);
    if (!this.alive(g)) return;
    this.phase = 'counting';
    let r = this.rep;
    this.startMotion(it);
    while (r < it.reps) {
      if (!this.alive(g)) return;
      if (it.sideSplit && r === Math.floor(it.reps / 2)) {
        await this.ready('換右腳', ['cue/switch_leg'], 1.0, g, true);
        if (!this.alive(g)) return;
        this.phase = 'counting'; this.startMotion(it);
      }
      const period = this.motionPeriod(it);
      const t = this.now();
      const a = Item.cueA(it), b = Item.cueB(it);
      if (a && b) {
        await this.say(['cue/w_' + a], g); await this.sleepUntil(t + period / 2, g);
        await this.say(['cue/w_' + b], g); await this.sleepUntil(t + period, g);
      } else {
        if (Item.countsSteps(it)) { this.figure = { kind: 'steps', index: r, period, start: Date.now() }; this.emit(); }
        await this.say(['num/' + Math.min(20, r + 1)], g); await this.sleepUntil(t + period, g);
      }
      if (!this.alive(g)) return;
      r += 1; this.rep = r; this.emit();
    }
  }
  async runHolds(it, g) {
    let h = this.rep;
    while (h < it.reps) {
      if (!this.alive(g)) return;
      this.secondsLeft = it.hold;
      if (h > 0) await this.ready('再來一次', ['cue/again'], 0.3, g);
      else { this.phase = 'ready'; this.readyText = '準備'; this.figure = { kind: 'still' }; this.emit(); }
      if (it.sideSplit && h === 0) await this.ready('先做左腳', ['cue/left_leg'], 0.8, g);
      if (it.sideSplit && h === Math.floor(it.reps / 2)) await this.ready('換右腳', ['cue/switch_leg'], 1.5, g, true);
      if (!this.alive(g)) return;
      if (it.hasEnter) {
        this.phase = 'entering';
        this.figure = { kind: 'enter', start: Date.now(), seconds: this.voice.duration('enter/' + it.id) + 1.5 }; this.emit();
        await this.say(['enter/' + it.id], g); await this.sleep(1.5, g);
        if (!this.alive(g)) return;
      }
      this.phase = 'holding'; this.figure = { kind: 'hold' }; this.secondsLeft = it.hold; this.emit();
      await this.say(['cue/hold'], g);
      let s = it.hold;
      while (s > 0) {
        if (!this.alive(g)) return;
        this.secondsLeft = s; this.emit();
        const t = this.now();
        if (s === 5) await this.say(['cue/five_left'], g);
        else if (s <= 3) await this.say(['cue/' + s], g);
        await this.sleepUntil(t + 1.0, g);
        s -= 1;
      }
      this.secondsLeft = 0;
      h += 1; this.rep = h;
      this.phase = 'relaxing'; this.figure = { kind: 'release', start: Date.now(), seconds: 2.5 }; this.emit();
      await this.say([it.hasRelease ? 'release/' + it.id : 'cue/lower'], g);
      if (h < it.reps) {
        for (let k = 3; k >= 1; k--) { if (!this.alive(g)) return; this.secondsLeft = k; this.emit(); await this.sleep(1.0, g); }
      }
    }
  }
  async runTimed(it, g) {
    this.phase = 'timed'; this.figure = { kind: 'free' }; this.emit();
    if (it.secs < 60) {
      await this.say(['cue/walk_go'], g);
      let s = it.secs;
      while (s > 0) { if (!this.alive(g)) return; this.secondsLeft = s; this.emit(); const t = this.now(); await this.sleepUntil(t + 1.0, g); s -= 1; }
      this.secondsLeft = 0; this.emit();
      return;
    }
    let s = it.secs - this.rep;
    let lastMinuteSaid = Math.floor((s + 59) / 60);
    while (s > 0) {
      if (!this.alive(g)) return;
      this.secondsLeft = s; this.emit();
      const t = this.now();
      const minutesLeft = Math.floor((s + 59) / 60);
      if (s % 60 === 0 && minutesLeft < lastMinuteSaid && minutesLeft >= 1) { lastMinuteSaid = minutesLeft; await this.say(['min/' + Math.min(45, minutesLeft)], g); }
      if (s === 10) await this.say(['cue/walk_last10'], g);
      await this.sleepUntil(t + 1.0, g);
      s -= 1; this.rep = it.secs - s;
    }
    this.secondsLeft = 0; this.emit();
  }
  async runFree(it, g) {
    this.phase = 'free'; this.figure = { kind: 'free' }; this.freeDoneRequested = false; this.emit();
    await this.say(['cue/free_done_prompt'], g);
    if (this.freeDoneRequested) return;
    await new Promise(res => { if (this.freeDoneRequested) res(); else this.freeResolve = res; });
  }
  async setFinished(it, g) {
    this.beep();
    this.figure = { kind: 'still' };
    if (this.set < Item.effectiveSets(it)) {
      this.phase = 'rest'; this.restSkip = false; this.restExtend = false;
      let s = it.restSecs ?? this.rules.restSeconds;
      this.secondsLeft = s; this.emit();
      const interval = it.mode === 'duration' && it.secs < 60;
      await this.say([interval ? 'cue/walk_stop' : (this.plan.kind === 'walk' ? 'cue/walk_lap_done' : 'cue/set_done')], g);
      while (s > 0 && !this.restSkip) {
        if (!this.alive(g)) return;
        this.secondsLeft = s;
        if (this.restExtend) { s = this.rules.restSeconds; this.restExtend = false; this.secondsLeft = s; }
        this.emit();
        for (let k = 0; k < 5; k++) { if (this.restSkip || !this.alive(g)) break; await this.sleep(0.2, g); }
        if (this.restSkip) break;
        s -= 1;
      }
      this.secondsLeft = 0;
      if (!this.alive(g)) return;
      this.set += 1; this.rep = 0;
      this.checkpoint(); this.emit();
      if (it.perSide && this.set % 2 === 0) await this.say(['cue/right_now'], g);
      else if (it.mode === 'duration' && it.secs < 60) await this.say(['cue/walk_again'], g);
      else await this.say(['cue/rest_over'], g);
      await this.runSet(g);
    } else {
      this.doneCount += 1;
      this.phase = 'exerciseDone';
      this.checkpoint(); this.emit();
      await this.say([this.plan.kind === 'teach' ? 'cue/set_done_last' : 'cue/ex_done'], g);
    }
  }

  // ---- user actions ----
  pause() {
    if (this.isFinished || this.phase === 'intro') return;
    this.paused = true; this.figure = { kind: 'still' };
    this.cancel(); this.emit();
  }
  resume() { this.start(); }
  nextExercise() {
    this.cancel(); this.paused = false;
    if (this.phase !== 'exerciseDone' && this.phase !== 'intro') this.doneCount += 1;
    this.index += 1; this.set = 1; this.rep = 0;
    if (this.index >= this.plan.items.length) this.finish(); else this.showIntro();
  }
  skipExercise() {
    this.cancel(); this.paused = false;
    this.index += 1; this.set = 1; this.rep = 0;
    if (this.index >= this.plan.items.length) this.finish(); else this.showIntro();
  }
  finishNow() {
    this.cancel();
    if (this.phase !== 'intro' && this.phase !== 'exerciseDone') this.doneCount += 1;
    this.finish();
  }
  freeDone() {
    if (this.phase !== 'free') return;
    this.freeDoneRequested = true;
    const f = this.freeResolve; this.freeResolve = null; if (f) f();
  }
  endRestNow() { if (this.phase === 'rest') { this.restSkip = true; this.voice.stop(); } }
  extendRest() { if (this.phase === 'rest') this.restExtend = true; }
  rate(r) {
    const it = this.item; if (!it) return;
    if (r === 'harder') this.hardPressed[it.prescribedID] = it.easier || null;
    else if (r === 'easier') this.easyPressed.add(it.prescribedID);
  }
  /// 太難了 during the exercise: switch to the easier variant right now (restarts this set from rep 0).
  makeEasierNow() {
    const it = this.item; if (!it) return;
    this.cancel();
    this.hardPressed[it.prescribedID] = it.easier || null;
    if (it.easier) { const v = makeItem(it.easier, it.prescribedID, null); if (v) { v.sets = it.sets; this.overrides[this.index] = v; } }
    else { const w = { ...it, sets: Math.max(1, it.sets - 1) }; this.overrides[this.index] = w; }
    this.rep = 0; this.paused = false;
    // 「好，換簡單一點的做法。」 then the new intro
    const it2 = this.item;
    this.phase = 'intro'; this.restSkip = false; this.restExtend = false; this.figure = { kind: 'free' };
    this.checkpoint(); this.emit();
    const g = this.gen;
    (async () => { await this.say(['cue/harder'], g); await this.say(this.introClips(it2), g); })();
  }
  finish() {
    this.cancel();
    this.elapsed = this.now() - this.startedAt;
    this.phase = 'finished';
    this.onCheckpoint(null);
    const tomorrow = { walk: 'cue/tomorrow_walk', wheel: 'cue/tomorrow_wheel', rest: 'cue/tomorrow_rest' }[this.plan.nextDay] || '';
    const clips = [this.plan.kind === 'teach' ? 'cue/teach_done' : 'cue/session_done'];
    if (this.plan.kind !== 'teach' && tomorrow) clips.push(tomorrow);
    this.emit();
    this.voice.say(clips);
  }
  checkpoint() {
    this.elapsed = this.now() - this.startedAt;
    this.onCheckpoint({ personID: this.personID, plan: this.plan, index: this.index, set: this.set, rep: this.rep, doneCount: this.doneCount, elapsed: this.elapsed, savedAt: new Date().toISOString() });
  }
}
