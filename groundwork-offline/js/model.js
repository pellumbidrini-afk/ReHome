// Groundwork — project model. The project is plain JSON (see newProject) so it can be saved,
// exported, diffed and later consumed by a native port. All mutations live here.
import { SCHEMA_VERSION, REGIONS, OPENING_STYLES, LEGACY_DOOR_STYLES, INTERIOR_TRIM_COLORS, SIDING_COLORS, TRIM_COLORS, ROOF_COLORS, STAIN_COLORS, PAINT_COLORS, FABRIC_COLORS, METAL_COLORS, STONE_VENEER, ITEMS, itemDef, snowLevelForPsf, IN, ROOF_STYLES, FOUNDATIONS, INSULATION, SIDING, ROOFING, FLOORING, STUD_SPACINGS, MODES, PRICING_TIERS, LOT_SIZES, SEISMIC_LEVELS, SNOW_LEVELS, SEASONS, WEATHER, PRICES } from './catalog.js';
import { analyzeWalls, wallVec, dist, roomKey, bbox, pointInPolygon, closestOnSegment, projectParam } from './geometry.js';

let idCounter = 0;
export function uid(prefix = 'id') { idCounter = (idCounter + 1) % 1e6; return `${prefix}_${Date.now().toString(36)}${idCounter.toString(36)}`; }

export function regionById(id) { return REGIONS.find((r) => r.id === id) || REGIONS[0]; }

export function newProject(opts = {}) {
  const region = regionById(opts.regionId || 'ak-southcentral');
  const now = new Date().toISOString();
  return {
    schemaVersion: SCHEMA_VERSION,
    id: uid('proj'),
    name: opts.name || 'Untitled build',
    createdAt: now, updatedAt: now,
    settings: {
      mode: opts.mode || 'simple',
      regionId: region.id,
      pricingTier: opts.pricingTier || 'medium',
      lotId: opts.lotId || 'one',
      gridStep: 0.5,
      units: 'ft',
      hazards: {
        seismic: opts.seismic || region.seismic,
        snow: opts.snow || snowLevelForPsf(region.snowPsf),
        flood: !!opts.flood,
        frostDepthIn: opts.frostDepthIn ?? region.frostDepthIn,
        latitude: region.lat,
      },
      priceOverrides: {},
      northDeg: 0,
      orthoSnap: true,
    },
    env: { season: 'summer', hour: 14, weather: 'clear' },
    structure: {
      floors: [{ id: uid('fl'), name: 'Floor 1', height: 9 }],
      walls: [],
      foundation: { type: 'stem', depthIn: region.frostDepthIn, slabIn: 4, stemIn: 8, footingWIn: 16, footingHIn: 8, pierSpacingFt: 8 },
      roof: { style: 'gable', pitch: 8, overhang: 1.5, material: 'asphalt', color: '#3a3b3e', soffit: true, fascia: true, ridgeAxis: 'auto' },
      roofByBuilding: {},
      studSpacing: 16,
      insulation: 'fiberglass',
      futureSecondStory: false,
    },
    exterior: { sidingType: 'lap', sidingColor: '#4a5e4a', sameSiding: true, trimColor: '#f1efe8', doorColor: '', stainColor: '#a86a3c', houseWrap: true, flashing: true, stone: { enabled: false, type: 'ledge-gray', heightFt: 3 } },
    interior: { paintColor: '#f3efe6', flooring: 'hardwood', ceilingColor: '#f7f5ef', trim: { baseboards: true, crown: false, color: '#f4f2ec', baseboardIn: 5.5, crownIn: 3.5 } },
    rooms: {},
    items: [],
  };
}

export function migrate(p) {
  if (!p || typeof p !== 'object') return null;
  if (!p.schemaVersion) p.schemaVersion = 1;
  p.items ||= []; p.rooms ||= {}; p.settings.priceOverrides ||= {};
  p.settings.northDeg ??= 0;
  for (const w of p.structure.walls) { w.openings ||= []; w.faces ||= {}; for (const o of w.openings) o.open ??= false; }
  if (p.schemaVersion < 2) {
    p.structure.roofByBuilding ||= {}; p.structure.studSpacing ||= 16; p.structure.insulation ||= 'fiberglass'; p.structure.futureSecondStory ??= false;
    p.exterior.stone ||= { enabled: false, type: 'ledge-gray', heightFt: 3 };
    p.schemaVersion = 2;
  }
  if (p.schemaVersion < 3) {
    for (const w of p.structure.walls) for (const o of w.openings) normalizeDoor(o);
    p.schemaVersion = 3;
  }
  p.structure.roofByBuilding ||= {}; p.exterior.stone ||= { enabled: false, type: 'ledge-gray', heightFt: 3 };
  p.exterior.doorColor ??= ''; p.settings.orthoSnap ??= true;
  p.interior.trim ||= { baseboards: true, crown: false, color: '#f4f2ec', baseboardIn: 5.5, crownIn: 3.5 };
  return p;
}
// Door style ids from older saves ('double', 'french') become a style plus a leaf count.
export function normalizeDoor(o) {
  if (o.kind !== 'door') return o;
  const legacy = LEGACY_DOOR_STYLES[o.style];
  if (legacy) { o.style = legacy.style; o.leaves = legacy.leaves; }
  const st = openingStyle('door', o.style);
  o.leaves = st.fixedLeaves || (o.leaves === 2 ? 2 : 1);
  return o;
}
export function doorLeaves(o) { const st = openingStyle('door', o.style); return st.fixedLeaves || (o.leaves === 2 ? 2 : 1); }
export function setDoorLeaves(o, leaves) {
  const st = openingStyle('door', o.style); if (st.fixedLeaves) return;
  const center = o.along + o.width / 2; o.leaves = leaves === 2 ? 2 : 1;
  o.width = o.leaves === 2 ? Math.max(o.width, st.w2 || 5) : Math.min(o.width, st.w);
  o.along = center - o.width / 2;
}
export function openingDisplayName(o) {
  const st = openingStyle(o.kind, o.style);
  if (o.kind === 'door' && doorLeaves(o) === 2 && !st.fixedLeaves) return st.doubleName || `Double ${st.name.toLowerCase()}`;
  return st.name;
}

export function touch(p) { p.updatedAt = new Date().toISOString(); }

// --- floors ---------------------------------------------------------------
export function floorElevation(p, floorIndex) {
  let y = 0;
  for (let i = 0; i < floorIndex; i++) y += p.structure.floors[i].height + 1.0; // 1 ft floor system between stories
  return y;
}
export function floorHeight(p, floorIndex) { return p.structure.floors[floorIndex]?.height ?? 9; }
export function addFloor(p) {
  const n = p.structure.floors.length;
  p.structure.floors.push({ id: uid('fl'), name: `Floor ${n + 1}`, height: n === 0 ? 9 : 8 });
  touch(p); return n;
}
export function removeFloor(p, index) {
  if (p.structure.floors.length <= 1) return false;
  p.structure.floors.splice(index, 1);
  p.structure.walls = p.structure.walls.filter((w) => w.floor !== index).map((w) => (w.floor > index ? { ...w, floor: w.floor - 1 } : w));
  p.items = p.items.filter((it) => it.floor !== index).map((it) => (it.floor > index ? { ...it, floor: it.floor - 1 } : it));
  touch(p); return true;
}

// --- walls ----------------------------------------------------------------
export function wallsOnFloor(p, floorIndex) { return p.structure.walls.filter((w) => w.floor === floorIndex); }
export function getWall(p, id) { return p.structure.walls.find((w) => w.id === id); }

export function addWall(p, floorIndex, a, b, extra = {}) {
  if (dist(a, b) < 0.5) return null;
  const w = { id: uid('w'), floor: floorIndex, a: { x: a.x, z: a.z }, b: { x: b.x, z: b.z }, kind: 'auto', openings: [], faces: {}, ...extra };
  p.structure.walls.push(w); touch(p); return w;
}
export function removeWall(p, id) {
  const i = p.structure.walls.findIndex((w) => w.id === id);
  if (i >= 0) { p.structure.walls.splice(i, 1); touch(p); return true; }
  return false;
}
export function moveWallEnd(p, id, end, pt) {
  const w = getWall(p, id); if (!w) return;
  const other = end === 'a' ? w.b : w.a;
  if (dist(other, pt) < 0.5) return;
  w[end] = { x: pt.x, z: pt.z };
  clampOpenings(w); touch(p);
}
export function wallLength(w) { return dist(w.a, w.b); }

// Copy a wall from the floor below onto `floorIndex` (same plan position), without its openings.
export function stackWall(p, wallId, floorIndex) {
  const src = getWall(p, wallId); if (!src) return null;
  const exists = wallsOnFloor(p, floorIndex).find((w) => dist(w.a, src.a) < 0.1 && dist(w.b, src.b) < 0.1);
  if (exists) return exists;
  return addWall(p, floorIndex, src.a, src.b, { kind: src.kind });
}
export function stackAllWalls(p, fromFloor, toFloor) {
  let n = 0; for (const w of wallsOnFloor(p, fromFloor)) if (stackWall(p, w.id, toFloor)) n++;
  return n;
}

// Analysis is derived data; callers cache it per commit (see app.js).
export function analyzeFloor(p, floorIndex) {
  const walls = wallsOnFloor(p, floorIndex);
  const a = analyzeWalls(walls);
  for (const r of a.rooms) {
    r.key = roomKey(floorIndex, r.centroid);
    const meta = p.rooms[r.key] || {};
    r.name = meta.name || `Room ${r.index + 1}`;
    r.flooring = meta.flooring || p.interior.flooring;
    r.paint = meta.paint || null;
  }
  for (const w of walls) {
    const info = a.wallInfo.get(w.id);
    info.kind = w.kind === 'auto' ? (info.exterior ? 'exterior' : 'interior') : w.kind;
    if (w.kind === 'exterior' && !info.outward) info.outward = 'both';
    if (w.kind === 'interior') info.outward = null;
  }
  a.bbox = bbox(walls.flatMap((w) => [w.a, w.b]));
  a.floorIndex = floorIndex;
  a.walls = walls;
  // stable key per building (component): the lexically smallest wall id in it
  a.componentKeys = a.components.map((c) => buildingKey(c));
  return a;
}
export function buildingKey(componentWalls) { return componentWalls.map((w) => w.id).sort()[0] || 'none'; }

export function analyzeProject(p) {
  const floors = p.structure.floors.map((_, i) => analyzeFloor(p, i));
  return { floors, byWall: new Map(floors.flatMap((f) => [...f.wallInfo.entries()])) };
}

// Roof settings for a building: project default merged with that building's overrides.
export function roofFor(p, key) { return { ...p.structure.roof, ...(p.structure.roofByBuilding[key] || {}) }; }
export function setRoofFor(p, key, patch) {
  if (!key) { Object.assign(p.structure.roof, patch); }
  else p.structure.roofByBuilding[key] = { ...(p.structure.roofByBuilding[key] || {}), ...patch };
  touch(p);
}

// Thickness of the finished wall and of its framing, in feet.
export function wallDims(kind) {
  if (kind === 'exterior') {
    const studD = 5.5 * IN; const sheathing = 0.5 * IN; const siding = 0.75 * IN; const drywall = 0.5 * IN;
    return { stud: '2x6', studD, finished: studD + sheathing + siding + drywall, offsetOut: sheathing + siding, offsetIn: drywall };
  }
  const studD = 3.5 * IN; const drywall = 0.5 * IN;
  return { stud: '2x4', studD, finished: studD + 2 * drywall, offsetOut: drywall, offsetIn: drywall };
}

// --- openings -------------------------------------------------------------
export function openingStyle(kind, styleId) {
  const list = OPENING_STYLES[kind] || OPENING_STYLES.door;
  return list.find((s) => s.id === styleId) || list[0];
}
export function addOpening(p, wallId, along, kind = 'door', styleId = null) {
  const w = getWall(p, wallId); if (!w) return null;
  const st = openingStyle(kind, styleId);
  const L = wallLength(w);
  const width = Math.min(st.w, L - 0.5);
  if (width < 1.5) return null;
  const o = { id: uid('o'), kind, style: st.id, along: along - width / 2, width, height: st.h, sill: st.sill || 0, flip: false, open: false };
  if (kind === 'door') o.leaves = st.fixedLeaves || 1;
  w.openings.push(o);
  clampOpenings(w, o.id);
  touch(p); return o;
}
export function setOpeningStyle(o, kind, styleId) {
  const st = openingStyle(kind, styleId);
  const center = o.along + o.width / 2;
  const dbl = kind === 'door' && !st.fixedLeaves && o.leaves === 2;
  o.kind = kind; o.style = st.id; o.width = dbl ? (st.w2 || st.w) : st.w; o.height = st.h; o.sill = st.sill || 0;
  if (kind === 'door') o.leaves = st.fixedLeaves || (dbl ? 2 : 1); else delete o.leaves;
  o.along = center - o.width / 2;
}
// Every light at once (kelvin and/or brightness multiplier); null leaves that property alone.
export function setAllLights(p, { kelvin = null, intensity = null, reset = false } = {}) {
  let n = 0;
  for (const it of p.items) { const def = itemDef(it.type); if (!def?.light) continue; n++; if (reset) { delete it.kelvin; delete it.intensity; continue; } if (kelvin != null) it.kelvin = kelvin; if (intensity != null) it.intensity = intensity; }
  touch(p); return n;
}
// Stair geometry from the floor it starts on: riser count, run length, landing.
export function stairSpec(p, it) {
  const def = itemDef(it.type); const fi = it.floor; const nextH = p.structure.floors[fi + 1] ? floorHeight(p, fi) + 1.0 : floorHeight(p, fi) + 1.0; // 1 ft floor system
  const rise = nextH; const risers = Math.max(2, Math.ceil(rise / (7.5 * IN))); const riserH = rise / risers; const tread = 10 * IN;
  const w = it.w || def.w;
  if (def.stair === 'L') {
    const n1 = Math.ceil(risers / 2); const n2 = risers - n1; const land = w / 2; // square landing the width of one flight
    const run1 = (n1 - 1) * tread; const run2 = (n2 - 1) * tread;
    return { kind: 'L', rise, risers, riserH, tread, w, flightW: w / 2, n1, n2, run1, run2, land, d: run1 + land + 0.3, totalW: Math.max(w, w / 2 + run2 + 0.3) };
  }
  const run = (risers - 1) * tread;
  return { kind: 'straight', rise, risers, riserH, tread, w, run, d: run + 0.3 };
}
// Height of the walking surface for a point in the stair's local frame (x across, z along, bottom at -d/2).
export function stairHeightAt(spec, lx, lz) {
  if (spec.kind === 'straight') { const t = (lz + spec.d / 2) / Math.max(0.01, spec.run); if (Math.abs(lx) > spec.w / 2 + 0.3 || t < -0.15 || t > 1.4) return null; return spec.rise * Math.max(0, Math.min(1, t)); }
  // L: first flight along +z in the x<0 half, landing at the far end, second flight runs along +x from the landing
  const half = spec.flightW; const z0 = -spec.d / 2;
  if (lx <= 0 + 0.3 && lx >= -half - 0.3 && lz >= z0 - 0.5 && lz <= z0 + spec.run1 + spec.land + 0.3) { const t = (lz - z0) / Math.max(0.01, spec.run1); return spec.rise * (spec.n1 / spec.risers) * Math.max(0, Math.min(1, t)); }
  const landZ0 = z0 + spec.run1; if (lz >= landZ0 - 0.2 && lz <= landZ0 + spec.land + 0.3 && lx >= -half - 0.3 && lx <= spec.run2 + 0.5) { const t = lx / Math.max(0.01, spec.run2); const base = spec.rise * (spec.n1 / spec.risers); return base + (spec.rise - base) * Math.max(0, Math.min(1, t)); }
  return null;
}
// Footprint polygon (world xz) that the floor above must leave open.
export function stairOpening(p, it) {
  const spec = stairSpec(p, it); const ang = it.rot * Math.PI / 180; const c = Math.cos(ang); const sn = Math.sin(ang);
  const toW = (x, z) => ({ x: it.x + x * c + z * sn, z: it.z - x * sn + z * c });
  const pts = [];
  if (spec.kind === 'straight') { const hw = spec.w / 2 + 0.1; const z0 = -spec.d / 2 + 2.5; const z1 = spec.d / 2 + 0.2; pts.push(toW(-hw, z0), toW(hw, z0), toW(hw, z1), toW(-hw, z1)); }
  else { const half = spec.flightW; const z0 = -spec.d / 2 + 2.0; const z1 = spec.d / 2 + 0.2; const x1 = spec.run2 + 0.4; pts.push(toW(-half - 0.1, z0), toW(0.1, z0), toW(0.1, z0 + spec.run1), toW(x1, z0 + spec.run1), toW(x1, z1), toW(-half - 0.1, z1)); }
  return pts;
}
export function clampOpenings(w, movingId = null) {
  const L = wallLength(w);
  const list = w.openings.sort((a, b) => a.along - b.along);
  for (const o of list) {
    o.width = Math.min(o.width, Math.max(1, L - 0.5));
    o.along = Math.max(0.25, Math.min(L - 0.25 - o.width, o.along));
  }
  for (let i = 1; i < list.length; i++) {
    const prev = list[i - 1]; const cur = list[i];
    const minStart = prev.along + prev.width + 0.25;
    if (cur.along < minStart) {
      if (cur.id === movingId) prev.along = Math.max(0.25, cur.along - 0.25 - prev.width);
      else cur.along = Math.min(L - 0.25 - cur.width, minStart);
    }
  }
}
export function findOpening(p, openingId) {
  for (const w of p.structure.walls) { const o = w.openings.find((x) => x.id === openingId); if (o) return { wall: w, opening: o }; }
  return null;
}
export function removeOpening(p, openingId) {
  const f = findOpening(p, openingId); if (!f) return false;
  f.wall.openings = f.wall.openings.filter((o) => o.id !== openingId); touch(p); return true;
}
export function openingWorldCenter(w, o) {
  const { dir } = wallVec(w);
  return { x: w.a.x + dir.x * (o.along + o.width / 2), z: w.a.z + dir.z * (o.along + o.width / 2) };
}

// --- items ----------------------------------------------------------------
export function addItem(p, typeId, floorIndex, x, z, rot = 0, extra = {}) {
  const def = itemDef(typeId); if (!def) return null;
  const it = { id: uid('it'), type: typeId, floor: floorIndex, x, z, rot, w: def.w, d: def.d, ...extra };
  p.items.push(it); touch(p); return it;
}
export function removeItem(p, id) { const i = p.items.findIndex((it) => it.id === id); if (i >= 0) { p.items.splice(i, 1); touch(p); return true; } return false; }
export function getItem(p, id) { return p.items.find((it) => it.id === id); }

export function roomAt(analysisFloor, pt) {
  for (const r of analysisFloor.rooms) if (pointInPolygon(pt, r.polygon)) return r;
  return null;
}

export function nearestWall(walls, pt, tol = 1.5) {
  let best = null;
  for (const w of walls) {
    const q = closestOnSegment(pt, w.a, w.b); const d = dist(pt, q);
    if (d < tol && (!best || d < best.dist)) {
      const { dir, length } = wallVec(w);
      const along = projectParam(pt, w.a, w.b) * length;
      const cross = dir.x * (pt.z - w.a.z) - dir.z * (pt.x - w.a.x);
      best = { wall: w, point: q, along, dist: d, side: cross > 0 ? 'left' : 'right' };
    }
  }
  return best;
}

// --- colors ---------------------------------------------------------------
export const PALETTES = { siding: SIDING_COLORS, trim: TRIM_COLORS, roof: ROOF_COLORS, stain: STAIN_COLORS, paint: PAINT_COLORS, fabric: FABRIC_COLORS, metal: METAL_COLORS, wood: STAIN_COLORS, cabinet: [...STAIN_COLORS, ...PAINT_COLORS], stone: STONE_VENEER.map((s) => ({ id: s.id, name: s.name, hex: s.hex })), any: [...PAINT_COLORS, ...FABRIC_COLORS, ...METAL_COLORS] };

// Kelvin → sRGB hex (Tanner Helland's approximation), for interior lights.
export function kelvinToHex(k) {
  const t = Math.max(1000, Math.min(12000, k)) / 100;
  let r; let g; let b;
  if (t <= 66) { r = 255; g = 99.4708025861 * Math.log(t) - 161.1195681661; b = t <= 19 ? 0 : 138.5177312231 * Math.log(t - 10) - 305.0447927307; }
  else { r = 329.698727446 * Math.pow(t - 60, -0.1332047592); g = 288.1221695283 * Math.pow(t - 60, -0.0755148492); b = 255; }
  const c = (v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0');
  return `#${c(r)}${c(g)}${c(b)}`;
}

// --- validation (untrusted JSON from paste / storage) -----------------------
const num = (v, lo, hi, dflt) => (typeof v === 'number' && Number.isFinite(v) ? Math.max(lo, Math.min(hi, v)) : dflt);
const coord = (v) => (typeof v === 'number' && Number.isFinite(v) && Math.abs(v) <= 2000 ? v : null);
const str = (v, max, dflt = '') => (typeof v === 'string' ? v.slice(0, max) : dflt);
const bool = (v, dflt = false) => (typeof v === 'boolean' ? v : dflt);
const oneOf = (v, list, dflt) => (list.includes(v) ? v : dflt);
const hex = (v, dflt) => (typeof v === 'string' && /^#[0-9a-fA-F]{6}$/.test(v) ? v.toLowerCase() : dflt);
const idStr = (v) => (typeof v === 'string' && /^[A-Za-z0-9_:-]{1,40}$/.test(v) ? v : uid('x'));

// Rebuild a project from untrusted input, keeping only known fields in known ranges.
export function sanitizeProject(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw) || !raw.structure || typeof raw.structure !== 'object' || !raw.settings || typeof raw.settings !== 'object') throw new Error('Not a Groundwork project');
  const s = raw.settings || {}; const st = raw.structure || {}; const ex = raw.exterior || {}; const inte = raw.interior || {}; const env = raw.env || {};
  const region = regionById(oneOf(s.regionId, REGIONS.map((r) => r.id), 'ak-southcentral'));
  const out = newProject({ regionId: region.id });
  out.id = idStr(raw.id); out.name = str(raw.name, 60, 'Untitled build') || 'Untitled build';
  out.createdAt = str(raw.createdAt, 40, out.createdAt); out.updatedAt = str(raw.updatedAt, 40, out.updatedAt);
  out.settings.mode = oneOf(s.mode, Object.keys(MODES), 'simple');
  out.settings.pricingTier = oneOf(s.pricingTier, PRICING_TIERS.map((t) => t.id), 'medium');
  out.settings.lotId = oneOf(s.lotId, LOT_SIZES.map((l) => l.id), 'one');
  out.settings.gridStep = num(s.gridStep, 0.25, 2, 0.5);
  out.settings.northDeg = num(s.northDeg, -180, 180, 0);
  out.settings.orthoSnap = bool(s.orthoSnap, true);
  const hz = s.hazards || {};
  out.settings.hazards = { seismic: oneOf(hz.seismic, SEISMIC_LEVELS.map((x) => x.id), region.seismic), snow: oneOf(hz.snow, SNOW_LEVELS.map((x) => x.id), snowLevelForPsf(region.snowPsf)), flood: bool(hz.flood), frostDepthIn: num(hz.frostDepthIn, 0, 120, region.frostDepthIn), latitude: num(hz.latitude, -70, 72, region.lat) };
  out.settings.priceOverrides = {};
  if (s.priceOverrides && typeof s.priceOverrides === 'object') for (const [k, v] of Object.entries(s.priceOverrides)) if (PRICES[k]) { const n = num(v, 0, 1e6, null); if (n != null) out.settings.priceOverrides[k] = n; }
  out.env = { season: oneOf(env.season, SEASONS.map((x) => x.id), 'summer'), hour: num(env.hour, 0, 24, 14), weather: oneOf(env.weather, WEATHER.map((x) => x.id), 'clear') };
  const floors = Array.isArray(st.floors) ? st.floors.slice(0, 4) : [];
  out.structure.floors = floors.length ? floors.map((f, i) => ({ id: idStr(f?.id), name: str(f?.name, 30, `Floor ${i + 1}`) || `Floor ${i + 1}`, height: num(f?.height, 7, 14, 9) })) : out.structure.floors;
  const nf = out.structure.floors.length;
  const fd = st.foundation || {};
  out.structure.foundation = { type: oneOf(fd.type, FOUNDATIONS.map((x) => x.id), 'stem'), depthIn: num(fd.depthIn, 0, 120, region.frostDepthIn), slabIn: num(fd.slabIn, 3, 12, 4), stemIn: num(fd.stemIn, 6, 12, 8), footingWIn: num(fd.footingWIn, 12, 36, 16), footingHIn: num(fd.footingHIn, 6, 18, 8), pierSpacingFt: num(fd.pierSpacingFt, 4, 16, 8) };
  const roofOk = (r, base) => ({ style: oneOf(r?.style, ROOF_STYLES.map((x) => x.id), base.style), pitch: num(r?.pitch, 0.5, 18, base.pitch), overhang: num(r?.overhang, 0, 5, base.overhang), material: oneOf(r?.material, ROOFING.map((x) => x.id), base.material), color: hex(r?.color, base.color), soffit: bool(r?.soffit, base.soffit), fascia: bool(r?.fascia, base.fascia), ridgeAxis: oneOf(r?.ridgeAxis, ['auto', 'x', 'z'], 'auto') });
  out.structure.roof = roofOk(st.roof, out.structure.roof);
  out.structure.roofByBuilding = {};
  if (st.roofByBuilding && typeof st.roofByBuilding === 'object') for (const [k, v] of Object.entries(st.roofByBuilding).slice(0, 20)) { if (!/^[A-Za-z0-9_:-]{1,40}$/.test(k) || !v || typeof v !== 'object') continue; const o = {}; if (v.style != null) o.style = oneOf(v.style, ROOF_STYLES.map((x) => x.id), 'gable'); if (v.pitch != null) o.pitch = num(v.pitch, 0.5, 18, 8); if (v.overhang != null) o.overhang = num(v.overhang, 0, 5, 1.5); if (v.ridgeAxis != null) o.ridgeAxis = oneOf(v.ridgeAxis, ['auto', 'x', 'z'], 'auto'); if (v.material != null) o.material = oneOf(v.material, ROOFING.map((x) => x.id), 'asphalt'); if (v.color != null) o.color = hex(v.color, '#3a3b3e'); out.structure.roofByBuilding[k] = o; }
  out.structure.studSpacing = oneOf(st.studSpacing, STUD_SPACINGS.map((x) => x.id), 16);
  out.structure.insulation = oneOf(st.insulation, INSULATION.map((x) => x.id), 'fiberglass');
  out.structure.futureSecondStory = bool(st.futureSecondStory);
  const walls = Array.isArray(st.walls) ? st.walls.slice(0, 600) : [];
  out.structure.walls = [];
  for (const w of walls) {
    if (!w || typeof w !== 'object' || !w.a || !w.b) continue;
    const a = { x: coord(w.a.x), z: coord(w.a.z) }; const b = { x: coord(w.b.x), z: coord(w.b.z) };
    if (a.x == null || a.z == null || b.x == null || b.z == null || dist(a, b) < 0.5) continue;
    const wall = { id: idStr(w.id), floor: Math.min(nf - 1, Math.max(0, Math.round(num(w.floor, 0, 3, 0)))), a, b, kind: oneOf(w.kind, ['auto', 'exterior', 'interior'], 'auto'), openings: [], faces: {} };
    const L = dist(a, b);
    for (const o of (Array.isArray(w.openings) ? w.openings.slice(0, 30) : [])) {
      if (!o || typeof o !== 'object') continue;
      const kind = oneOf(o.kind, ['door', 'window', 'opening'], 'door');
      const legacy = kind === 'door' ? LEGACY_DOOR_STYLES[o.style] : null; const style = legacy ? openingStyle(kind, legacy.style) : openingStyle(kind, o.style);
      const so = { id: idStr(o.id), kind, style: style.id, along: num(o.along, 0, L, 1), width: num(o.width, 1, L, style.w), height: num(o.height, 1, 12, style.h), sill: num(o.sill, 0, 10, style.sill || 0), flip: bool(o.flip), open: bool(o.open) };
      if (kind === 'door') so.leaves = style.fixedLeaves || ((legacy ? legacy.leaves : o.leaves) === 2 ? 2 : 1);
      wall.openings.push(so);
    }
    if (w.faces && typeof w.faces === 'object') {
      if (w.faces.ext && typeof w.faces.ext === 'object') wall.faces.ext = { type: oneOf(w.faces.ext.type, SIDING.map((x) => x.id), 'lap'), color: hex(w.faces.ext.color, '#4a5e4a') };
      if (w.faces.int && typeof w.faces.int === 'object') wall.faces.int = { color: hex(w.faces.int.color, '#f3efe6') };
    }
    clampOpenings(wall);
    out.structure.walls.push(wall);
  }
  const stone = ex.stone || {};
  out.exterior = { sidingType: oneOf(ex.sidingType, SIDING.map((x) => x.id), 'lap'), sidingColor: hex(ex.sidingColor, '#4a5e4a'), sameSiding: bool(ex.sameSiding, true), trimColor: hex(ex.trimColor, '#f1efe8'), doorColor: ex.doorColor ? hex(ex.doorColor, '') : '', stainColor: hex(ex.stainColor, '#a86a3c'), houseWrap: bool(ex.houseWrap, true), flashing: bool(ex.flashing, true), stone: { enabled: bool(stone.enabled), type: oneOf(stone.type, STONE_VENEER.map((x) => x.id), 'ledge-gray'), heightFt: num(stone.heightFt, 1, 8, 3) } };
  const tr = inte.trim || {};
  out.interior = { paintColor: hex(inte.paintColor, '#f3efe6'), flooring: oneOf(inte.flooring, FLOORING.map((x) => x.id), 'hardwood'), ceilingColor: hex(inte.ceilingColor, '#f7f5ef'), trim: { baseboards: bool(tr.baseboards, true), crown: bool(tr.crown, false), color: hex(tr.color, '#f4f2ec'), baseboardIn: num(tr.baseboardIn, 2, 12, 5.5), crownIn: num(tr.crownIn, 1.5, 8, 3.5) } };
  out.rooms = {};
  if (raw.rooms && typeof raw.rooms === 'object') for (const [k, v] of Object.entries(raw.rooms).slice(0, 200)) { if (!/^\d:-?\d+,-?\d+$/.test(k) || !v || typeof v !== 'object') continue; const r = {}; if (v.name != null) r.name = str(v.name, 40); if (v.flooring != null) r.flooring = oneOf(v.flooring, FLOORING.map((x) => x.id), 'hardwood'); if (v.paint != null) r.paint = hex(v.paint, '#f3efe6'); out.rooms[k] = r; }
  out.items = [];
  for (const it of (Array.isArray(raw.items) ? raw.items.slice(0, 1500) : [])) {
    if (!it || typeof it !== 'object') continue; const def = itemDef(it.type); if (!def) continue;
    const o = { id: idStr(it.id), type: def.id, floor: Math.min(nf - 1, Math.max(0, Math.round(num(it.floor, 0, 3, 0)))), x: num(it.x, -2000, 2000, 0), z: num(it.z, -2000, 2000, 0), rot: num(it.rot, -360, 360, 0), w: num(it.w, 0.2, 400, def.w), d: num(it.d, 0.2, 400, def.d) };
    if (it.h != null) o.h = num(it.h, 0.1, 40, def.h);
    if (it.scale != null) o.scale = num(it.scale, 0.2, 3, 1);
    if (it.color != null) { const c = hex(it.color, null); if (c) o.color = c; }
    if (it.finish != null) o.finish = oneOf(it.finish, ['wood', 'painted', 'laminate'], 'wood');
    if (it.kelvin != null) o.kelvin = num(it.kelvin, 1800, 6500, 2700);
    if (it.intensity != null) o.intensity = num(it.intensity, 0.1, 3, 1);
    if (it.mountY != null) o.mountY = num(it.mountY, 0, 14, 4);
    if (it.wallMount) o.wallMount = true;
    if (it.lit != null) o.lit = bool(it.lit, true);
    if (it.boxed != null) o.boxed = bool(it.boxed, false);
    out.items.push(o);
  }
  out.sample = bool(raw.sample);
  return out;
}

// --- sample project -------------------------------------------------------
// A 24×32 one-story cabin (1 bed / 1 bath, kitchen-living, bath+laundry) with a detached 30×40 garage,
// in Southcentral Alaska. Sized so two vehicles, a snowmachine, a four-wheeler and a long truck fit.
export function sampleProject() {
  const p = newProject({ name: 'Sample · 24×32 cabin + garage', mode: 'advanced', regionId: 'ak-southcentral', pricingTier: 'medium', lotId: 'one' });
  const F = 0;
  const addRect = (x0, z0, x1, z1) => {
    addWall(p, F, { x: x0, z: z0 }, { x: x1, z: z0 }); addWall(p, F, { x: x1, z: z0 }, { x: x1, z: z1 });
    addWall(p, F, { x: x1, z: z1 }, { x: x0, z: z1 }); addWall(p, F, { x: x0, z: z1 }, { x: x0, z: z0 });
  };
  addRect(-16, -12, 16, 12);
  addWall(p, F, { x: -4, z: -12 }, { x: -4, z: 12 });
  addWall(p, F, { x: -16, z: 0 }, { x: -4, z: 0 });
  const walls = p.structure.walls;
  const find = (ax, az, bx, bz) => walls.find((w) => w.a.x === ax && w.a.z === az && w.b.x === bx && w.b.z === bz);
  const south = find(16, 12, -16, 12); const north = find(-16, -12, 16, -12); const east = find(16, -12, 16, 12); const west = find(-16, 12, -16, -12);
  const bedWall = find(-4, -12, -4, 12); const bathWall = find(-16, 0, -4, 0);
  if (south) { addOpening(p, south.id, 22, 'door', 'single'); addOpening(p, south.id, 12, 'window', 'picture'); addOpening(p, south.id, 28, 'window', 'double'); }
  if (north) { addOpening(p, north.id, 6, 'window', 'single'); addOpening(p, north.id, 22, 'window', 'double'); }
  if (east) { addOpening(p, east.id, 12, 'window', 'slider'); }
  if (west) { addOpening(p, west.id, 18, 'window', 'small'); addOpening(p, west.id, 6, 'window', 'single'); }
  if (bedWall) { addOpening(p, bedWall.id, 6, 'door', 'single'); addOpening(p, bedWall.id, 18, 'door', 'single'); }
  if (bathWall) { addOpening(p, bathWall.id, 6, 'door', 'single'); }
  // garage 30×40 to the east
  addRect(38, -20, 68, 20);
  const gEast = walls.find((w) => w.a.x === 68 && w.a.z === -20 && w.b.x === 68);
  const gWest = walls.find((w) => w.a.x === 38 && w.a.z === 20 && w.b.x === 38);
  const gSouth = walls.find((w) => w.a.x === 68 && w.a.z === 20 && w.b.x === 38);
  if (gEast) { addOpening(p, gEast.id, 11, 'door', 'garage18'); addOpening(p, gEast.id, 31, 'door', 'garage10'); }
  if (gWest) { addOpening(p, gWest.id, 10, 'door', 'single'); addOpening(p, gWest.id, 28, 'window', 'single'); }
  if (gSouth) { addOpening(p, gSouth.id, 15, 'window', 'single'); }
  const an = analyzeFloor(p, 0);
  for (const r of an.rooms) {
    const c = r.centroid;
    let name = 'Kitchen / Living';
    if (c.x < -4 && c.z < 0) name = 'Bedroom'; else if (c.x < -4 && c.z > 0) name = 'Bath + Laundry'; else if (c.x > 30) name = 'Garage';
    p.rooms[r.key] = { name, flooring: name === 'Garage' ? 'epoxy' : name === 'Bath + Laundry' ? 'tile' : 'hardwood' };
  }
  // per-building roofs: house gable, garage gable with a lower pitch
  const garageKey = buildingKey(an.components.find((c) => c.some((w) => w.a.x >= 38)) || []);
  p.structure.roofByBuilding[garageKey] = { pitch: 6, ridgeAxis: 'z' };
  // furniture
  addItem(p, 'bed-queen', F, -10, -6, 0); addItem(p, 'nightstand', F, -14.5, -8.5, 0); addItem(p, 'dresser', F, -7, -10.8, 0);
  addItem(p, 'toilet', F, -14.5, 3.5, 90); addItem(p, 'vanity', F, -14, 8, 90); addItem(p, 'tubshower', F, -8, 10.5, 0);
  addItem(p, 'washer', F, -6, 2.5, 0); addItem(p, 'dryer', F, -6, 5, 0);
  addItem(p, 'counter', F, 11.5, -10.8, 0); addItem(p, 'uppercab', F, 11.5, -11.3, 0, { wallMount: true }); addItem(p, 'fridge', F, 14.3, -8, 90); addItem(p, 'range', F, 5, -10.8, 0); addItem(p, 'rangehood', F, 5, -11.3, 0, { wallMount: true });
  addItem(p, 'island', F, 8, -5, 0); addItem(p, 'barstool', F, 6.5, -2.8, 0); addItem(p, 'barstool', F, 9.5, -2.8, 0); addItem(p, 'dining', F, 9, 5, 0); addItem(p, 'chair', F, 7, 3, 0); addItem(p, 'chair', F, 11, 3, 180); addItem(p, 'chair', F, 7, 7, 0); addItem(p, 'chair', F, 11, 7, 180);
  addItem(p, 'sofa', F, -1.3, 6, 90, { color: '#3f5a46' }); addItem(p, 'coffee', F, 2.5, 6, 90); addItem(p, 'rug', F, 1.5, 6, 0, { w: 7, d: 10, color: '#a3553a' }); addItem(p, 'woodstove', F, 1, -10.5, 0);
  // wall-mounted things sit against a wall: position = wall point + inward normal × (wall thickness/2 + item depth/2)
  const mount = (typeId, wall, along, extra = {}) => {
    if (!wall) return null; const info = an.wallInfo.get(wall.id); const { dir } = wallVec(wall); const left = { x: -dir.z, z: dir.x };
    const n = info.outward === 'left' ? { x: -left.x, z: -left.z } : { x: left.x, z: left.z }; const def = itemDef(typeId); const dims = wallDims(info.kind);
    const off = dims.offsetIn + dims.studD / 2 + 0.02 + (extra.d || def.d) / 2; const px = wall.a.x + dir.x * along + n.x * off; const pz = wall.a.z + dir.z * along + n.z * off;
    return addItem(p, typeId, F, Math.round(px * 4) / 4, Math.round(pz * 4) / 4, Math.round((Math.atan2(n.x, n.z) * 180) / Math.PI), { wallMount: true, ...extra });
  };
  mount('fireplace', east, 17.5, { color: '#7d7a72' }); mount('tvwall', east, 17.5, { mountY: 5.4 });
  if (south) { const win = south.openings.find((o) => o.style === 'picture'); if (win) mount('curtains', south, win.along + win.width / 2, { w: win.width + 1.5, mountY: win.sill + win.height + 0.6, color: '#9aa58c' }); }
  mount('coatrack', south, 19.5, { mountY: 5.5 }); mount('bench', south, 19.5, { w: 3.5 }); mount('wallart', north, 14, { mountY: 5, color: '#4b5f4b' }); mount('mirror', bathWall, 10, { mountY: 4.5 });
  addItem(p, 'plant', F, 14.2, 10, 0);
  addItem(p, 'ceilinglight', F, -10, -6, 0); addItem(p, 'ceilinglight', F, -10, 6, 0); addItem(p, 'pendant', F, 8, -5, 0, { kelvin: 2400 }); addItem(p, 'ceilinglight', F, 4, 4, 0); addItem(p, 'floorlamp', F, -2.8, 9.8, 0);
  addItem(p, 'shoplight', F, 53, 0, 0); addItem(p, 'shoplight', F, 53, -12, 0); addItem(p, 'shoplight', F, 53, 12, 0);
  addItem(p, 'porchlight', F, 21.5, 12.45, 180, { wallMount: true, mountY: 7 });
  // garage contents: the point of the garage size
  addItem(p, 'truck-long', F, 55, -8, 90, { color: '#4f6b84' }); addItem(p, 'car', F, 56, 7, 90, { color: '#9a2d2a' });
  addItem(p, 'snowmachine', F, 44, 14, 0); addItem(p, 'atv', F, 42, 4, 0); addItem(p, 'workbench', F, 53, -18.5, 0); addItem(p, 'shelving', F, 39.5, -8, 90); addItem(p, 'toolchest', F, 42, -18.5, 0);
  // landscape & site
  addItem(p, 'gravelpad', F, 22, 2, 0, { w: 116, d: 56 });
  addItem(p, 'driveway', F, 88, 0, 90, { w: 44, d: 40 });
  addItem(p, 'deck', F, 0, 17, 0, { w: 16, d: 8 });
  for (const [x, z, s] of [[-40, -30, 1], [-48, -10, 0.8], [-30, -42, 1.1], [30, -40, 0.9], [-50, 20, 1], [-36, 36, 0.85], [84, -30, 1], [88, 10, 0.9], [-20, -48, 0.7], [10, -46, 1], [-58, 38, 1.05], [76, 36, 0.9]]) addItem(p, 'spruce', F, x, z, 0, { scale: s });
  for (const [x, z] of [[-42, 40], [44, -42], [86, 30]]) addItem(p, 'birch', F, x, z, 0);
  addItem(p, 'aspen', F, -62, 2, 0);
  for (const [x, z] of [[-20, 16], [-22, 20], [20, 16]]) addItem(p, 'shrub', F, x, z, 0);
  addItem(p, 'boulder', F, -24, -20, 30);
  addItem(p, 'fueltank', F, 20, -16, 0); addItem(p, 'firepit', F, -10, 30, 0); addItem(p, 'picnic', F, -18, 32, 20); addItem(p, 'woodpile', F, -24, -14, 90);
  addItem(p, 'wellhead', F, -44, -4, 0); addItem(p, 'septic', F, 10, 36, 0);
  p.structure.roof.pitch = 8; p.structure.roof.material = 'standing'; p.structure.roof.color = '#2f4a38';
  p.exterior.sidingType = 'batten'; p.exterior.sidingColor = '#8f877a'; p.exterior.trimColor = '#1e1f21'; p.exterior.doorColor = '#a8452f';
  p.exterior.stone = { enabled: true, type: 'ledge-gray', heightFt: 3 };
  p.structure.insulation = 'rockwool'; p.structure.futureSecondStory = true;
  p.env.hour = 16; p.env.season = 'summer';
  p.sample = true;
  return p;
}

// Backup / restore ---------------------------------------------------------
export function serialize(p) { return JSON.stringify(p); }
export function deserialize(text) {
  if (typeof text !== 'string' || text.length > 4_000_000) throw new Error('Project text is too large');
  const obj = JSON.parse(text);
  return migrate(sanitizeProject(obj));
}
