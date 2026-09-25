// Rounded, filled "little person" (style B) rendered as SVG. Mirrors Swift SkeletonPainter / SkeletonFigureView.
// Model space: 160 wide (−80…80) × 130 tall (−20…110), floor at model y = 0; viewBox "-80 -20 160 130".
import { Catalog } from './catalog.js';

const SEG = { torso: 30, neck: 4, head: 7, upper: 15, fore: 14, thigh: 22, shank: 22, foot: 9, heel: 2.5 }, HIP_W = 5, SH_W = 7;
const d = a => { const r = a * Math.PI / 180; return [Math.sin(r), -Math.cos(r)]; };

function fkSide(j, rx, ry) {
  const tl = j.torso * Math.PI / 180; const N = [rx + SEG.torso * Math.sin(tl), ry + SEG.torso * Math.cos(tl)];
  const hl = (j.torso + j.neck) * Math.PI / 180; const H = [N[0] + (SEG.neck + SEG.head) * Math.sin(hl), N[1] + (SEG.neck + SEG.head) * Math.cos(hl)];
  const p = { pelvis: [rx, ry], neck: N, head: H, hipL: [rx, ry], hipR: [rx, ry] };
  for (const s of ['L', 'R']) {
    const sa = j['sh' + s] + j.torso; let v = d(sa); const E = [N[0] + SEG.upper * v[0], N[1] + SEG.upper * v[1]];
    v = d(sa + j['el' + s]); const W = [E[0] + SEG.fore * v[0], E[1] + SEG.fore * v[1]];
    v = d(j['hip' + s]); const K = [rx + SEG.thigh * v[0], ry + SEG.thigh * v[1]]; const sh = j['hip' + s] - j['knee' + s]; v = d(sh); const A = [K[0] + SEG.shank * v[0], K[1] + SEG.shank * v[1]];
    const fa = sh + 90 + j['ank' + s]; v = d(fa); const T = [A[0] + SEG.foot * v[0], A[1] + SEG.foot * v[1]]; v = d(fa + 180); const HE = [A[0] + SEG.heel * v[0], A[1] + SEG.heel * v[1]];
    p['shoulder' + s] = N; p['elbow' + s] = E; p['wrist' + s] = W; p['knee' + s] = K; p['ankle' + s] = A; p['toe' + s] = T; p['heel' + s] = HE;
  }
  return p;
}
function fkFront(j, rx, ry, feet) {
  const N = [rx, ry + SEG.torso], H = [rx, N[1] + SEG.neck + SEG.head]; const p = { pelvis: [rx, ry], neck: N, head: H };
  for (const [s, g] of [['L', -1], ['R', 1]]) {
    const S = [N[0] + g * SH_W, N[1] - 2]; const fo = (feet && feet[s]) || { dx: 0, dz: 0 }; const a = j['sh' + s] * Math.PI / 180; const E = [S[0] + g * SEG.upper * Math.sin(a), S[1] - SEG.upper * Math.cos(a)];
    const b = (j['sh' + s] + j['el' + s]) * Math.PI / 180; const W = [E[0] + g * SEG.fore * Math.sin(b), E[1] - SEG.fore * Math.cos(b)];
    const Hp = [rx + g * HIP_W, ry]; const h = j['hip' + s] * Math.PI / 180; const K = [Hp[0] + g * SEG.thigh * Math.sin(h), Hp[1] - SEG.thigh * Math.cos(h)];
    const sh = SEG.shank * Math.cos(j['knee' + s] * Math.PI / 180 * 0.5); const A = [K[0] + g * sh * Math.sin(h) + g * fo.dx, K[1] - sh * Math.cos(h) - fo.dz * 0.35];
    p['shoulder' + s] = S; p['elbow' + s] = E; p['wrist' + s] = W; p['hip' + s] = Hp; p['knee' + s] = [K[0] + g * fo.dx * 0.5, K[1] - fo.dz * 0.15]; p['ankle' + s] = A; p['toe' + s] = [A[0] + g * 3.5, A[1] - 1.5]; p['heel' + s] = [A[0] - g * 3.5, A[1] + 1.5];
  }
  return p;
}
const smooth = u => u * u * (3 - 2 * u);
export function sample(a, t) {
  const F = a.frames; if (a.loop && a.duration > 0) { t = t % a.duration; if (t < 0) t += a.duration; }
  let i = 0; while (i < F.length - 2 && F[i + 1].t <= t) i++; const f0 = F[i], f1 = F[Math.min(i + 1, F.length - 1)];
  let u = f1.t > f0.t ? (t - f0.t) / (f1.t - f0.t) : 0; u = Math.max(0, Math.min(1, u)); if (f0.ease === 'smooth') u = smooth(u);
  const L = (x, y) => x + (y - x) * u; const j = {}; for (const k in f0.joints) j[k] = L(f0.joints[k], f1.joints[k] ?? f0.joints[k]);
  const dyn = {}; if (f0.dyn) for (const k in f0.dyn) { const w = (f1.dyn && f1.dyn[k]) || f0.dyn[k]; dyn[k] = { x: L(f0.dyn[k].x, w.x), y: L(f0.dyn[k].y, w.y) }; }
  const feet = f0.feet || f1.feet || null;
  const o0 = f0.propOffset || { x: 0, y: 0 }, o1 = f1.propOffset || o0;
  return { j, root: { x: L(f0.root.x, f1.root.x), y: L(f0.root.y, f1.root.y) }, facing: u < 0.5 ? f0.facing : f1.facing, scale: L(f0.scale, f1.scale), floor: L(f0.floor || 0, f1.floor || 0), dyn, feet, off: { x: L(o0.x, o1.x), y: L(o0.y, o1.y) } };
}
const SX = x => x, SY = y => 100 - y;
const Ln = (x1, y1, x2, y2, st) => `<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" ${st}/>`;
const WOOD = 'stroke="#8a6a4a" stroke-width="3" stroke-linecap="round" fill="none"';
function propsSVG(props, S) {
  let s = ''; const ox = S.off.x, oy = S.off.y;
  for (const p of props) {
    if (p.type === 'chair') { const x = p.x + ox, y = SY(p.y + oy); s += `<g ${WOOD}>` + Ln(x, y, x + p.w, y, '') + Ln(x, y, x, y - p.back, '') + Ln(x + 2, y, x + 2, SY(oy), '') + Ln(x + p.w - 2, y, x + p.w - 2, SY(oy), ''); if (p.arms) { const ay = SY(p.armY + oy); s += Ln(x, ay, x + p.w * 0.72, ay, '') + Ln(x + p.w * 0.72, ay, x + p.w * 0.72, y, ''); } s += '</g>'; }
    if (p.type === 'table') { const y = SY(p.y + oy), x = p.x + ox; s += `<g ${WOOD}>` + Ln(x, y, x + p.w, y, '') + Ln(x + 3, y, x + 3, 100, '') + Ln(x + p.w - 3, y, x + p.w - 3, 100, '') + '</g>'; }
    if (p.type === 'counter') { const y = SY(p.y + oy), x = p.x + ox; s += `<g stroke="#c8b59a" stroke-width="3" stroke-linecap="round">` + Ln(x, y, x + p.w, y, '') + Ln(x + 6, y, x + 6, 100, '') + Ln(x + p.w / 2, y, x + p.w / 2, 100, '') + Ln(x + p.w - 6, y, x + p.w - 6, 100, '') + '</g>'; }
    if (p.type === 'bar') { const y = SY(p.y); s += `<g ${WOOD}>` + Ln(-p.w / 2, y, p.w / 2, y, '') + Ln(-p.w / 2 + 3, y, -p.w / 2 + 3, 100, '') + Ln(p.w / 2 - 3, y, p.w / 2 - 3, 100, '') + '</g>'; }
    if (p.type === 'path8') { const pts = []; for (let k = 0; k <= 80; k++) { const th = 2 * Math.PI * k / 80; pts.push(`${(p.a * Math.sin(th)).toFixed(1)},${(100 + p.z * Math.sin(th) * Math.cos(th) * 0.9).toFixed(1)}`); } s += `<polyline points="${pts.join(' ')}" fill="none" stroke="#bbb" stroke-width="1.2" stroke-dasharray="3 3"/>`; }
    if (p.type === 'wall') s += Ln(p.x + ox, 100, p.x + ox, 10, 'stroke="#c9bfae" stroke-width="4"');
    if (p.type === 'line') s += Ln(p.x + ox, 97, p.x + ox, 103, 'stroke="#e36b5c" stroke-width="2.5"') + Ln(p.x + ox - 5, 100, p.x + ox + 5, 100, 'stroke="#e36b5c" stroke-width="1"');
    if (p.type === 'tape') s += `<rect x="${p.x + ox - 6}" y="98.8" width="12" height="2.4" rx="1.2" fill="#e36b5c" opacity="0.85"/>`;
    if (p.type === 'roll') s += `<ellipse cx="${p.x + ox}" cy="${SY(p.y + oy) - 3}" rx="5" ry="3" fill="#d9c9b0" stroke="#a08a68" stroke-width="1"/>`;
    if (p.type === 'stairs') { s += '<g ' + WOOD.replace('#8a6a4a', '#999') + '>'; let x = p.x + ox, y = SY(p.y + oy); for (let k = 0; k < p.n; k++) { s += Ln(x, y, x + p.run, y, '') + Ln(x + p.run, y, x + p.run, y - p.rise, ''); x += p.run; y -= p.rise; } s += '</g>'; }
    if (p.type === 'rail') { const x0 = p.x + ox, y0 = SY(p.y + oy); const x1 = x0 + p.n * p.run, y1 = y0 - p.n * p.rise; s += `<g ${WOOD}>` + Ln(x0, y0 - p.h, x1, y1 - p.h, '') + Ln(x0 + p.run * 2, y0 - p.rise * 2, x0 + p.run * 2, y0 - p.rise * 2 - p.h, '') + Ln(x0 + p.run * 5, y0 - p.rise * 5, x0 + p.run * 5, y0 - p.rise * 5 - p.h, '') + '</g>'; }
  }
  return s;
}
function anchoredSVG(a, S, W) {
  let s = '';
  for (const p of a.props) {
    if (p.type === 'ball') { const w = W(p.at); s += `<circle cx="${w[0]}" cy="${w[1]}" r="4.2" fill="#e36b5c"/>`; }
    if (p.type === 'bottle_hand') { const w = W(p.at); s += `<rect x="${w[0] - 2.5}" y="${w[1] - 7}" width="5" height="11" rx="1.5" fill="#6ab0d8" stroke="#2a6a90" stroke-width="1"/>`; }
    if (p.type === 'towel') { const a1 = W(p.between[0]), a2 = W(p.between[1]); s += Ln(a1[0], a1[1], a2[0], a2[1], 'stroke="#d9c9b0" stroke-width="5" stroke-linecap="round"'); }
    if (p.type === 'balloon') { const b = S.dyn[p.dyn]; if (b) s += `<circle cx="${b.x}" cy="${SY(b.y)}" r="7" fill="#f2c94c" stroke="#c9a227" stroke-width="1"/>`; }
  }
  return s;
}
const bottleSVG = p => { const x = p.x, y = 100 - p.z * 0.9; return `<rect x="${x - 2.5}" y="${y - 11}" width="5" height="11" rx="1.5" fill="#6ab0d8" stroke="#2a6a90" stroke-width="1"/><rect x="${x - 1.2}" y="${y - 13.5}" width="2.4" height="3" fill="#2a6a90"/>`; };
function shade(hex, amt) { const n = parseInt(hex.slice(1), 16); const c = v => Math.max(0, Math.min(255, v)); const r = (n >> 16) + amt, g = ((n >> 8) & 255) + amt, b = (n & 255) + amt; return '#' + ((1 << 24) + (c(r) << 16) + (c(g) << 8) + c(b)).toString(16).slice(1); }
function figureSVG(a, S, W) {
  const front = a.view === 'front'; const col = { torso: '#2f8f83', upper: '#2f8f83', fore: '#e8b892', thigh: '#3b4a6b', shank: '#3b4a6b', foot: '#5a3e2b' };
  const segs = [['shoulderL', 'elbowL', 'upperL'], ['elbowL', 'wristL', 'foreL'], ['hipL', 'kneeL', 'thighL'], ['kneeL', 'ankleL', 'shankL'], ['heelL', 'toeL', 'footL'],
    ['neck', 'pelvis', 'torso'], ['hipR', 'kneeR', 'thighR'], ['kneeR', 'ankleR', 'shankR'], ['heelR', 'toeR', 'footR'], ['shoulderR', 'elbowR', 'upperR'], ['elbowR', 'wristR', 'foreR']];
  let s = ''; const sc = S.scale;
  if (front) s += Ln(...W('hipL'), ...W('hipR'), `stroke="${col.thigh}" stroke-width="${9 * sc}" stroke-linecap="round"`);
  for (const [a1, b1, nm] of segs) {
    const base = nm.replace(/[LR]$/, ''); const isFar = !front && nm.endsWith('L'); let c = col[base]; if (isFar) c = shade(c, -18);
    const w = (base === 'torso' ? 12 : base === 'thigh' || base === 'shank' ? 7.5 : base === 'foot' ? 5 : 5.5) * sc; const A = W(a1), B = W(b1);
    if (front && base === 'torso') s += Ln(...W('shoulderL'), ...W('shoulderR'), `stroke="${c}" stroke-width="${10 * sc}" stroke-linecap="round"`);
    s += Ln(A[0], A[1], B[0], B[1], `stroke="${c}" stroke-width="${w}" stroke-linecap="round"`);
  }
  const h = W('head'), r = (SEG.head + 1) * sc; s += `<circle cx="${h[0]}" cy="${h[1]}" r="${r}" fill="#e8b892"/><path d="M ${h[0] - r} ${h[1] - 1} A ${r} ${r} 0 0 1 ${h[0] + r} ${h[1] - 1} Z" fill="#8a8a8a"/>`;
  if (!front) { const wr = W('wristR'), el = W('elbowR'), sh = W('shoulderR'); if (wr[1] < sh[1]) s += Ln(sh[0], sh[1], el[0], el[1], `stroke="${col.upper}" stroke-width="${5.5 * sc}" stroke-linecap="round"`) + Ln(el[0], el[1], wr[0], wr[1], `stroke="${col.fore}" stroke-width="${5.5 * sc}" stroke-linecap="round"`); }
  if (front) s += `<circle cx="${h[0] - r * 0.35}" cy="${h[1]}" r="${1.1 * sc}" fill="#222"/><circle cx="${h[0] + r * 0.35}" cy="${h[1]}" r="${1.1 * sc}" fill="#222"/>`;
  else s += `<circle cx="${h[0] + S.facing * r * 0.45}" cy="${h[1] - r * 0.05}" r="${1.1 * sc}" fill="#222"/>`;
  return s;
}
export function render(svg, a, t) {
  const S = sample(a, t); const front = a.view === 'front'; const p = front ? fkFront(S.j, 0, 0, S.feet) : fkSide(S.j, 0, 0);
  const W = n => { const q = p[n] || [0, 0]; return [SX(S.root.x + (front ? 1 : S.facing) * q[0] * S.scale), SY(S.root.y + q[1] * S.scale)]; };
  let s = `<line x1="-80" y1="100" x2="80" y2="100" stroke="var(--floor,#ddd)" stroke-width="1"/>`;
  const bars = a.props.filter(p => p.type === 'bar'); const figZ = -(S.floor || 0) / 0.9; const bs = a.props.filter(p => p.type === 'bottle');
  s += propsSVG(a.props.filter(p => p.type !== 'bar'), S); for (const b of bs) if (b.z > figZ) s += bottleSVG(b);
  if (front && S.feet) {
    s += `<rect x="36" y="50" width="44" height="56" rx="4" fill="rgba(255,255,255,.7)" stroke="#ddd" stroke-width=".6"/><text x="58" y="57" font-size="5.5" fill="#666" text-anchor="middle" font-weight="700">從上面看</text>`;
    for (const [sd, g] of [['L', -1], ['R', 1]]) {
      const fo = S.feet[sd] || { dx: 0, dz: 0 }; const cx = 58 + g * (5 + fo.dx * 1.2), cy = 88 - fo.dz * 1.6;
      s += `<path d="M ${cx - 2.2} ${cy + 9} Q ${cx} ${cy + 12} ${cx + 2.2} ${cy + 9} Q ${cx + 3.6} ${cy + 4} ${cx + 4} ${cy - 3} Q ${cx} ${cy - 8} ${cx - 4} ${cy - 3} Q ${cx - 3.2} ${cy + 4} ${cx - 2.2} ${cy + 9} Z" fill="rgba(90,62,43,.6)" stroke="#5a3e2b" stroke-width=".6"/>`;
      [-3, -1.5, 0, 1.5, 3].forEach((tx, i) => { const big = (g < 0 ? i === 4 : i === 0); s += `<circle cx="${cx + tx}" cy="${cy - 6.5 + (i === 0 || i === 4 ? 0.8 : 0)}" r="${big ? 1.5 : 1}" fill="rgba(90,62,43,.75)"/>`; });
    }
  }
  s += figureSVG(a, S, W); s += anchoredSVG(a, S, W); for (const b of bs) if (b.z <= figZ) s += bottleSVG(b);
  s += propsSVG(bars, S);
  svg.innerHTML = s;
}

// ---- How the on-screen figure follows the coach (FigureSync) ----------------------------------------
// sync: {kind:'free'|'still'} | {kind:'reps',period,start} | {kind:'steps',index,period,start} | {kind:'enter',start,seconds} | {kind:'hold'} | {kind:'release',start,seconds}
export function clipTime(clip, sync, nowMs, freeStart) {
  const since = t => Math.max(0, (nowMs - t) / 1000);
  switch (sync && sync.kind) {
    case 'still': return 0;
    case 'reps': { const cycles = clip.cyclesPerLoop || 1; return since(sync.start) * (clip.duration / cycles) / sync.period; }
    case 'steps': { const st = clip.steps; if (!st || st.length < 2) return (nowMs - freeStart) / 1000; const i = Math.min(Math.max(0, sync.index), st.length - 2); const u = Math.min(1, since(sync.start) / Math.max(0.1, sync.period)); return st[i] + (st[i + 1] - st[i]) * u; }
    case 'enter': { const h = clip.holdAt ?? clip.duration / 2; return Math.min(h, since(sync.start) / Math.max(0.1, sync.seconds) * h); }
    case 'hold': return clip.holdAt ?? clip.duration / 2;
    case 'release': { const r = clip.releaseAt ?? clip.duration * 0.7; const u = since(sync.start) / Math.max(0.1, sync.seconds); return u >= 1 ? 0 : r + (clip.duration - r) * u; }
    default: return (nowMs - freeStart) / 1000;
  }
}

// One requestAnimationFrame loop drives every `<svg data-clip>` on the page.
//   data-clip="id"            which animation
//   data-still="t"            static pose at clip time t (thumbnails)
//   data-sync="coach"         follow Figures.coachSync (set by the session screen)
//   data-paused="1"           freeze
export const Figures = {
  coachSync: { kind: 'free' }, coachPaused: false,
  starts: new WeakMap(), running: false,
  start() {
    if (this.running) return; this.running = true;
    const loop = now => {
      if (document.visibilityState !== 'hidden') {
        for (const svg of document.querySelectorAll('svg[data-clip]')) {
          const clip = Catalog.clip(svg.dataset.clip); if (!clip) continue;
          let st = this.starts.get(svg); if (st == null) { st = now; this.starts.set(svg, now); }
          let t;
          if (svg.dataset.still != null) { if (svg.dataset.rendered === '1') continue; t = parseFloat(svg.dataset.still) || 0; }
          else if (svg.dataset.sync === 'coach') t = this.coachPaused ? 0 : clipTime(clip, this.coachSync, now, st);
          else t = (now - st) / 1000;
          render(svg, clip, t); svg.dataset.rendered = '1';
        }
      }
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  },
};

export function figureHTML(clipID, opts = {}) {
  const attrs = [`data-clip="${clipID}"`];
  if (opts.still != null) attrs.push(`data-still="${opts.still}"`);
  if (opts.sync) attrs.push(`data-sync="${opts.sync}"`);
  return `<svg class="fig ${opts.cls || ''}" viewBox="-80 -20 160 130" ${attrs.join(' ')} aria-hidden="true" style="${opts.style || ''}"></svg>`;
}
