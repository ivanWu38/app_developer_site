// program.json / voice_lines.json / animations.json — data only, loaded once at boot (mirrors ProgramCatalog + VoiceLines + ClipCache).
export const Catalog = {
  program: null, lines: null, clips: null,

  async load() {
    const [p, l, a] = await Promise.all([
      fetch('assets/program.json').then(r => r.json()),
      fetch('assets/voice_lines.json').then(r => r.json()),
      fetch('assets/animations.json').then(r => r.json()),
    ]);
    this.program = p; this.lines = l; this.clips = a;
  },

  exercise(id) { return this.program.exercises[id] || null; },
  animationID(eid) { const e = this.exercise(eid); return (e && e.animation) || eid; },
  clip(id) { return this.clips[id] || null; },
  level(lv) { return this.program.levels[lv]; },
  get rules() { return this.program.rules; },
  get conditions() { return this.program.conditions; },

  week(lv, plus) {
    if (plus && this.program.plus[lv + 'p']) return this.program.plus[lv + 'p'].week;
    return this.level(lv).week;
  },
  wheel(lv, plus, conditions) {
    let ids = this.level(lv).wheel.slice();
    if (plus && this.program.plus[lv + 'p']) {
      for (const e of this.program.plus[lv + 'p'].extra) if (!ids.includes(e)) ids.splice(Math.min(2, ids.length), 0, e);
    }
    for (const c of conditions || []) {
      const cond = this.conditions[c]; if (!cond) continue;
      ids = ids.map(x => cond.swaps[x] || x);
    }
    return ids;
  },
  walk(lv, week) {
    const t = this.level(lv).walk; if (!t) return null;
    const i = Math.max(0, Math.min(t.laps.length - 1, week - 1));
    return { laps: t.laps[i], minutes: t.minutes[i] };
  },
  captions(conditions) {
    return (conditions || []).map(c => this.conditions[c] && this.conditions[c].caption).filter(Boolean).sort();
  },

  // voice lines
  text(ids) { return (Array.isArray(ids) ? ids : [ids]).map(i => this.lines[i] || '').join(''); },
  voiceURL(id) { return 'assets/voice/' + encodeURIComponent(id.replace(/\//g, '__')) + '.m4a'; },
};

// Screening voice ids (Scripts.swift)
export const Scr = {
  safety: [1, 2, 3, 4, 5, 6].map(i => 'scr/safety_' + i),
  fall: 'scr/fall', fallHurt: 'scr/fall_hurt', fallCount: 'scr/fall_count',
  unsteady: 'scr/unsteady', fear: 'scr/fear', memory: 'scr/memory',
  stsIntro: 'scr/sts_intro', go: 'scr/go', stsDone: 'scr/sts_done',
  readyLine: 'scr/ready', startLine: 'scr/start',
  balIntro: 'scr/bal_intro', bal: ['scr/bal_1', 'scr/bal_2', 'scr/bal_3'],
  balNames: ['並腳站', '半前後站', '前後站'], balClips: ['stand_side', 'stand_semi', 'stand_tandem'],
  balStart: 'scr/bal_start', balDone: 'scr/bal_done', balPass: 'scr/bal_pass', balFail: 'scr/bal_fail',
  tugIntro: 'scr/tug_intro', tugPractice: 'scr/tug_practice', tugDone: 'scr/tug_done',
  gaitIntro: 'scr/gait_intro', resultIntro: 'scr/result_intro', interrupted: 'scr/interrupted',
  level(l, plus) { return 'scr/level_' + l + (plus && l !== 'A' ? 'p' : ''); },
};
