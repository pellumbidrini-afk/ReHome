// Groundwork — roof generator. Each building (a connected set of walls) gets its own roof over its
// bounding rectangle. Profile roofs (gable, gambrel, saltbox, shed, flat) are a cross-section in the
// (s, y) plane extruded along the long axis u; the hip roof is built from four planes directly.
// Output is plain data (planes / fills / edges / rafters) so the renderer and the estimate share it.
import { IN } from './catalog.js';

const RAFTER_SPACING = 2.0; // ft (24 in OC)
const JOIST_SPACING = 16 * IN;
export const ROOF_T = 0.6;  // rafter + sheathing + roofing, measured perpendicular to the slope

function v(x, y, z) { return { x, y, z }; }
function polyArea3(pts) {
  let nx = 0; let ny = 0; let nz = 0;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i]; const q = pts[(i + 1) % pts.length];
    nx += (p.y - q.y) * (p.z + q.z); ny += (p.z - q.z) * (p.x + q.x); nz += (p.x - q.x) * (p.y + q.y);
  }
  return Math.hypot(nx, ny, nz) / 2;
}
const len3 = (a, b) => Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z);

/**
 * Build the roof for one building footprint.
 * @param bb  {minX,maxX,minZ,maxZ,w,d}
 * @param yTop top of the top-floor wall plates (ft)
 * @param roof merged roof settings {style, pitch, overhang, ridgeAxis}
 */
export function buildRoofForBox(bb, yTop, roof) {
  const style = roof.style || 'gable';
  const pitch = style === 'flat' ? 0.25 : Math.max(0.5, roof.pitch || 6);
  const p = pitch / 12;
  const O = Math.max(0, roof.overhang ?? 1.5);
  const axisAuto = bb.w >= bb.d ? 'x' : 'z';
  const axis = roof.ridgeAxis && roof.ridgeAxis !== 'auto' ? roof.ridgeAxis : axisAuto;
  const long = axis === 'x' ? { min: bb.minX, max: bb.maxX } : { min: bb.minZ, max: bb.maxZ };
  const short = axis === 'x' ? { min: bb.minZ, max: bb.maxZ } : { min: bb.minX, max: bb.maxX };
  const span = short.max - short.min; const run = span / 2; const c = (short.min + short.max) / 2;
  const lift = ROOF_T * Math.sqrt(1 + p * p);
  const P = (u, y, s) => (axis === 'x' ? v(u, y, s) : v(s, y, u));
  const out = { style, pitch, axis, planes: [], fills: [], edges: [], soffits: [], rafters: [], joists: [], ridge: null, hipRafters: [], yTop, bbox: bb, span, run, long, short, O, lift };
  const u0 = long.min - O; const u1 = long.max + O;
  const s0 = short.min - O; const s1 = short.max + O;

  if (style === 'hip') {
    const eaveY = yTop + lift - O * p; const ridgeY = yTop + lift + run * p;
    const rl0 = Math.min(long.min + run, long.max - run); const rl1 = Math.max(long.min + run, long.max - run);
    out.planes.push({ pts: [P(u0, eaveY, s0), P(u1, eaveY, s0), P(rl1, ridgeY, c), P(rl0, ridgeY, c)] });
    out.planes.push({ pts: [P(u1, eaveY, s1), P(u0, eaveY, s1), P(rl0, ridgeY, c), P(rl1, ridgeY, c)] });
    out.planes.push({ pts: [P(u0, eaveY, s1), P(u0, eaveY, s0), P(rl0, ridgeY, c)] });
    out.planes.push({ pts: [P(u1, eaveY, s0), P(u1, eaveY, s1), P(rl1, ridgeY, c)] });
    out.ridge = rl1 - rl0 > 0.01 ? { a: P(rl0, ridgeY, c), b: P(rl1, ridgeY, c) } : null;
    out.edges.push({ a: P(u0, eaveY, s0), b: P(u1, eaveY, s0), kind: 'eave', out: -1 });
    out.edges.push({ a: P(u0, eaveY, s1), b: P(u1, eaveY, s1), kind: 'eave', out: 1 });
    out.edges.push({ a: P(u0, eaveY, s0), b: P(u0, eaveY, s1), kind: 'eave', out: -1, end: true });
    out.edges.push({ a: P(u1, eaveY, s0), b: P(u1, eaveY, s1), kind: 'eave', out: 1, end: true });
    out.soffits.push({ pts: [P(u0, eaveY, s0), P(u1, eaveY, s0), P(u1, eaveY, short.min), P(u0, eaveY, short.min)] });
    out.soffits.push({ pts: [P(u0, eaveY, short.max), P(u1, eaveY, short.max), P(u1, eaveY, s1), P(u0, eaveY, s1)] });
    out.soffits.push({ pts: [P(u0, eaveY, s0), P(long.min, eaveY, s0), P(long.min, eaveY, s1), P(u0, eaveY, s1)] });
    out.soffits.push({ pts: [P(long.max, eaveY, s0), P(u1, eaveY, s0), P(u1, eaveY, s1), P(long.max, eaveY, s1)] });
    for (let u = rl0; u <= rl1 + 1e-6; u += RAFTER_SPACING) { out.rafters.push({ a: P(u, eaveY, s0), b: P(u, ridgeY, c) }); out.rafters.push({ a: P(u, eaveY, s1), b: P(u, ridgeY, c) }); }
    out.hipRafters.push({ a: P(u0, eaveY, s0), b: P(rl0, ridgeY, c) }, { a: P(u0, eaveY, s1), b: P(rl0, ridgeY, c) }, { a: P(u1, eaveY, s0), b: P(rl1, ridgeY, c) }, { a: P(u1, eaveY, s1), b: P(rl1, ridgeY, c) });
    for (let u = long.min + JOIST_SPACING; u < long.max; u += JOIST_SPACING) out.joists.push({ a: P(u, yTop, short.min), b: P(u, yTop, short.max) });
    out.eaveY = eaveY; out.ridgeY = ridgeY; out.peakY = ridgeY;
  } else {
    // ---- profile roofs: list of {s, y} from s0 to s1, plus which segment pairs are "ridge" peaks
    let profile = [];
    if (style === 'gable') {
      const eaveY = yTop + lift - O * p; const ridgeY = yTop + lift + run * p;
      profile = [{ s: s0, y: eaveY }, { s: c, y: ridgeY, ridge: true }, { s: s1, y: eaveY }];
    } else if (style === 'gambrel') {
      const pl = Math.max(p * 2.4, 1.4); // steep lower slope
      const half = run * 0.5;
      const breakY = yTop + lift + half * pl; const ridgeY = breakY + half * p;
      const eaveY = yTop + lift - O * pl;
      profile = [{ s: s0, y: eaveY }, { s: c - half, y: breakY }, { s: c, y: ridgeY, ridge: true }, { s: c + half, y: breakY }, { s: s1, y: eaveY }];
      out.lift = ROOF_T * Math.sqrt(1 + pl * pl);
    } else if (style === 'saltbox') {
      const sr = c + span * 0.2; const runS = short.max - sr; const runL = sr - short.min;
      const ridgeY = yTop + lift + runS * p; const pL = (runS * p) / runL;
      profile = [{ s: s0, y: yTop + lift - O * pL }, { s: sr, y: ridgeY, ridge: true }, { s: s1, y: yTop + lift - O * p }];
    } else if (style === 'shed') {
      const highY = yTop + lift + span * p;
      profile = [{ s: s0, y: yTop + lift - O * p }, { s: s1, y: highY + O * p }];
    } else { // flat (very low slope for drainage)
      const y = yTop + lift;
      profile = [{ s: s0, y }, { s: s1, y: y + span * p }];
    }
    out.profile = profile;
    const yAt = (s) => {
      for (let i = 0; i < profile.length - 1; i++) { const a = profile[i]; const b = profile[i + 1]; if (s >= a.s - 1e-6 && s <= b.s + 1e-6) { const t = (s - a.s) / Math.max(1e-6, b.s - a.s); return a.y + (b.y - a.y) * t; } }
      return profile[profile.length - 1].y;
    };
    out.yAtS = yAt;
    for (let i = 0; i < profile.length - 1; i++) {
      const a = profile[i]; const b = profile[i + 1];
      out.planes.push({ pts: [P(u0, a.y, a.s), P(u1, a.y, a.s), P(u1, b.y, b.s), P(u0, b.y, b.s)] });
      // rakes along this segment at both ends
      out.edges.push({ a: P(u0, a.y, a.s), b: P(u0, b.y, b.s), kind: 'rake', out: -1 });
      out.edges.push({ a: P(u1, a.y, a.s), b: P(u1, b.y, b.s), kind: 'rake', out: 1 });
      for (let u = u0; u <= u1 + 1e-6; u += RAFTER_SPACING) out.rafters.push({ a: P(u, a.y, a.s), b: P(u, b.y, b.s) });
      if (Math.abs(u1 - (u0 + Math.floor((u1 - u0) / RAFTER_SPACING) * RAFTER_SPACING)) > 1e-6) out.rafters.push({ a: P(u1, a.y, a.s), b: P(u1, b.y, b.s) });
    }
    // eaves at both profile ends
    const first = profile[0]; const last = profile[profile.length - 1];
    out.edges.push({ a: P(u0, first.y, first.s), b: P(u1, first.y, first.s), kind: 'eave', out: -1 });
    out.edges.push({ a: P(u0, last.y, last.s), b: P(u1, last.y, last.s), kind: 'eave', out: 1 });
    // soffits under the eave overhangs (and under rake overhangs as a thin strip)
    const sofY0 = Math.min(first.y, yAt(short.min)); const sofY1 = Math.min(last.y, yAt(short.max));
    out.soffits.push({ pts: [P(u0, sofY0, s0), P(u1, sofY0, s0), P(u1, sofY0, short.min), P(u0, sofY0, short.min)] });
    out.soffits.push({ pts: [P(u0, sofY1, short.max), P(u1, sofY1, short.max), P(u1, sofY1, s1), P(u0, sofY1, s1)] });
    // ridge
    const ridgePt = profile.find((q) => q.ridge);
    if (ridgePt) out.ridge = { a: P(u0, ridgePt.y, ridgePt.s), b: P(u1, ridgePt.y, ridgePt.s) };
    // gable-end fills at the wall lines (the wall below stops at yTop)
    const sInner = []; for (let i = 0; i < profile.length; i++) { const s = Math.max(short.min, Math.min(short.max, profile[i].s)); if (!sInner.length || Math.abs(sInner[sInner.length - 1] - s) > 1e-6) sInner.push(s); }
    for (const u of [long.min, long.max]) {
      const pts = [P(u, yTop, short.min), P(u, yTop, short.max)];
      for (let i = sInner.length - 1; i >= 0; i--) { const s = sInner[i]; const y = yAt(s); if (y > yTop + 0.01) pts.push(P(u, y, s)); }
      if (pts.length >= 3) out.fills.push({ pts, normalDir: u === long.min ? 1 : -1 });
    }
    // ceiling joists on the plates
    for (let u = long.min + JOIST_SPACING; u < long.max; u += JOIST_SPACING) out.joists.push({ a: P(u, yTop, short.min), b: P(u, yTop, short.max) });
    out.eaveY = Math.min(first.y, last.y); out.ridgeY = Math.max(...profile.map((q) => q.y)); out.peakY = out.ridgeY;
  }
  out.area = out.planes.reduce((s, pl) => s + polyArea3(pl.pts), 0);
  out.eaveFt = out.edges.filter((e) => e.kind === 'eave').reduce((s, e) => s + Math.hypot(e.b.x - e.a.x, e.b.z - e.a.z), 0);
  out.rakeFt = out.edges.filter((e) => e.kind === 'rake').reduce((s, e) => s + len3(e.a, e.b), 0);
  out.ridgeFt = out.ridge ? Math.hypot(out.ridge.b.x - out.ridge.a.x, out.ridge.b.z - out.ridge.a.z) : 0;
  out.rafterCount = out.rafters.length + out.hipRafters.length;
  out.rafterLen = out.rafters.length ? Math.max(...out.rafters.map((r) => len3(r.a, r.b))) : 0;
  out.slopeLen = out.rafterLen;
  return out;
}

// Height of the roof's top surface at plan point (x, z), or null when the point is not under this roof.
export function roofHeightAt(roof, x, z) {
  for (const pl of roof.planes) {
    const pts = pl.pts; let inside = false;
    for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
      const pi = pts[i]; const pj = pts[j];
      if ((pi.z > z) !== (pj.z > z) && x < ((pj.x - pi.x) * (z - pi.z)) / (pj.z - pi.z) + pi.x) inside = !inside;
    }
    if (!inside) continue;
    // plane through three non-collinear points: y = a x + b z + c
    const [p0, p1, p2] = [pts[0], pts[1], pts[2]];
    const ux = p1.x - p0.x; const uy = p1.y - p0.y; const uz = p1.z - p0.z; const vx = p2.x - p0.x; const vy = p2.y - p0.y; const vz = p2.z - p0.z;
    const nx = uy * vz - uz * vy; const ny = uz * vx - ux * vz; const nz = ux * vy - uy * vx;
    if (Math.abs(ny) < 1e-9) continue;
    return p0.y - (nx * (x - p0.x) + nz * (z - p0.z)) / ny;
  }
  return null;
}

export function bboxOfWalls(walls) {
  const b = { minX: Infinity, maxX: -Infinity, minZ: Infinity, maxZ: -Infinity };
  for (const w of walls) for (const q of [w.a, w.b]) { b.minX = Math.min(b.minX, q.x); b.maxX = Math.max(b.maxX, q.x); b.minZ = Math.min(b.minZ, q.z); b.maxZ = Math.max(b.maxZ, q.z); }
  b.w = b.maxX - b.minX; b.d = b.maxZ - b.minZ; return b;
}

// Decide which building components get a roof and build them.
export function buildRoofs(project, floorsAnalysis, floorElev, roofForKey) {
  const roofs = [];
  const overlap = (a, b) => {
    const w = Math.max(0, Math.min(a.maxX, b.maxX) - Math.max(a.minX, b.minX));
    const d = Math.max(0, Math.min(a.maxZ, b.maxZ) - Math.max(a.minZ, b.minZ));
    return (w * d) / Math.max(1e-6, a.w * a.d);
  };
  floorsAnalysis.forEach((fa, fi) => {
    const above = floorsAnalysis[fi + 1];
    const compBoxes = fa.components.map((c) => (c.length ? bboxOfWalls(c) : null));
    fa.components.forEach((comp, ci) => {
      if (comp.length < 2) return;
      const bb = compBoxes[ci];
      if (bb.w < 1 || bb.d < 1) return;
      const inside = compBoxes.some((o, oi) => oi !== ci && o && o.w * o.d > bb.w * bb.d && bb.minX >= o.minX - 0.1 && bb.maxX <= o.maxX + 0.1 && bb.minZ >= o.minZ - 0.1 && bb.maxZ <= o.maxZ + 0.1);
      if (inside) return;
      if (above && above.components.some((c2) => c2.length >= 2 && overlap(bb, bboxOfWalls(c2)) > 0.5)) return;
      const yTop = floorElev(fi) + project.structure.floors[fi].height;
      const key = fa.componentKeys ? fa.componentKeys[ci] : null;
      const settings = roofForKey ? roofForKey(key) : project.structure.roof;
      const r = buildRoofForBox(bb, yTop, settings);
      r.floor = fi; r.key = key; r.settings = settings;
      roofs.push(r);
    });
  });
  return roofs;
}
