// Groundwork — stick-framing generator. Lays out plates, studs, kings, jacks, headers, sills and
// cripples for one wall from its openings, plus the open bays between members (where insulation goes).
// Local coordinates: x along the wall from end `a`, y up from the floor, d = depth through the wall.
import { IN } from './catalog.js';

export const STUD_T = 1.5 * IN;      // 1½ in actual thickness
const PLATE = STUD_T;

export function headerForSpan(span) {
  if (span <= 3.5) return { size: '2x6', h: 5.5 * IN };
  if (span <= 5) return { size: '2x8', h: 7.25 * IN };
  if (span <= 6.5) return { size: '2x10', h: 9.25 * IN };
  if (span <= 8) return { size: '2x12', h: 11.25 * IN };
  return { size: 'LVL', h: 11.875 * IN, lvl: true };
}

/**
 * @param wall     model wall ({openings})
 * @param length   wall length in ft
 * @param height   stud-wall height (floor to top of double plate)
 * @param studD    stud depth (3.5 or 5.5 in, in ft)
 * @param spacingIn stud spacing on center, inches (12 / 16 / 24)
 */
export function frameWall(wall, length, height, studD, spacingIn = 16) {
  const SPACING = spacingIn * IN;
  const members = [];
  const counts = { studs: 0, cripples: 0, plateFt: 0, headers: [], lvlFt: 0 };
  const L = length; const H = height;
  const topOfStuds = H - 2 * PLATE;
  const studH = topOfStuds - PLATE;
  const push = (kind, x, y, w, h) => members.push({ kind, x, y, w, h, d: studD });
  push('plate', 0, 0, L, PLATE);
  push('plate', 0, topOfStuds, L, PLATE);
  push('plate', 0, topOfStuds + PLATE, L, PLATE);
  counts.plateFt += 3 * L;

  const ops = (wall.openings || []).slice().sort((p, q) => p.along - q.along);
  const reserved = ops.map((o) => ({ o, x0: o.along - STUD_T * 2, x1: o.along + o.width + STUD_T * 2 }));
  const xs = [];
  for (let x = 0; x < L - STUD_T; x += SPACING) xs.push(x);
  xs.push(L - STUD_T);
  const blocked = (x) => reserved.find((r) => x + STUD_T > r.x0 && x < r.x1);
  const verticals = []; // x positions of full-height members (for bay computation)
  for (const x of xs) { if (!blocked(x)) { push('stud', x, PLATE, STUD_T, studH); counts.studs++; verticals.push(x); } }
  const openZones = [];
  for (const { o, x0, x1 } of reserved) {
    const kingL = Math.max(0, x0); const kingR = Math.min(L - STUD_T, x1 - STUD_T);
    const jackL = o.along - STUD_T; const jackR = o.along + o.width;
    const hdr = headerForSpan(o.width);
    const openTop = o.sill + o.height;
    const hdrY = Math.min(openTop + 0.5 * IN, topOfStuds - hdr.h);
    const hdrTop = hdrY + hdr.h;
    push('king', kingL, PLATE, STUD_T, studH); push('king', kingR, PLATE, STUD_T, studH); counts.studs += 2; verticals.push(kingL, kingR);
    push('jack', jackL, PLATE, STUD_T, hdrY - PLATE); push('jack', jackR, PLATE, STUD_T, hdrY - PLATE); counts.studs += 2;
    const hdrW = jackR + STUD_T - jackL;
    push('header', jackL, hdrY, hdrW, hdr.h);
    counts.headers.push({ size: hdr.size, length: hdrW, lvl: !!hdr.lvl });
    if (hdr.lvl) counts.lvlFt += hdrW * 2;
    const cripH = topOfStuds - hdrTop;
    if (cripH > 0.1) for (const x of xs) if (x > jackL + STUD_T && x + STUD_T < jackR) { push('cripple', x, hdrTop, STUD_T, cripH); counts.cripples++; }
    let sillY = null;
    if (o.kind !== 'door' && o.sill > PLATE + 0.1) {
      sillY = o.sill - STUD_T;
      push('sill', jackL + STUD_T, sillY, o.width, STUD_T);
      for (const x of xs) if (x > jackL + STUD_T && x + STUD_T < jackR) { push('cripple', x, PLATE, STUD_T, sillY - PLATE); counts.cripples++; }
    }
    openZones.push({ x0: jackL, x1: jackR + STUD_T, hdrTop, topOfStuds, sillY, kingL, kingR });
  }
  // bays: between consecutive verticals, full height unless an opening zone crosses them
  const bays = [];
  const vs = Array.from(new Set(verticals.map((x) => Math.round(x * 1e4) / 1e4))).sort((a, b) => a - b);
  for (let i = 0; i < vs.length - 1; i++) {
    const x0 = vs[i] + STUD_T; const x1 = vs[i + 1];
    if (x1 - x0 < 0.08) continue;
    const zone = openZones.find((z) => x0 < z.x1 - 1e-6 && x1 > z.x0 + 1e-6);
    if (!zone) { bays.push({ x0, x1, y0: PLATE, y1: topOfStuds }); continue; }
    if (zone.topOfStuds - zone.hdrTop > 0.15) bays.push({ x0, x1, y0: zone.hdrTop, y1: zone.topOfStuds });
    if (zone.sillY != null && zone.sillY - PLATE > 0.15) bays.push({ x0, x1, y0: PLATE, y1: zone.sillY });
  }
  return { members, counts, bays };
}

export function rafterForSpan(span, snowPsf) {
  const heavy = snowPsf >= 50;
  if (span <= 8) return { size: heavy ? '2x10' : '2x8', h: (heavy ? 9.25 : 7.25) * IN };
  if (span <= 12) return { size: heavy ? '2x12' : '2x10', h: (heavy ? 11.25 : 9.25) * IN };
  if (span <= 16) return { size: '2x12', h: 11.25 * IN, note: heavy ? 'Consider engineered trusses at this span and snow load.' : null };
  return { size: 'truss', h: 11.25 * IN, note: 'Span calls for engineered trusses or a structural ridge beam.' };
}
