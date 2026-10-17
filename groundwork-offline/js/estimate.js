// Groundwork — materials takeoff and engineer prompts. Everything is a rough quantity from the
// model, priced from the catalog × region × tier (× your overrides). The disclaimer is part of
// the output on purpose: this is a planning aid, not a bill of materials.
import { PRICES, PRICE_CATEGORIES, PRICING_TIERS, SIDING, ROOFING, FLOORING, INSULATION, STONE_VENEER, PHASES, DISCLAIMER, IN, itemDef, SNOW_LEVELS } from './catalog.js';
import { regionById, wallDims, wallLength, floorHeight } from './model.js';
import { frameWall, rafterForSpan } from './framing.js';
import { wallJunctions, wallVec, cross } from './geometry.js';

export function unitPrice(project, key) {
  const base = PRICES[key]; if (!base) return 0;
  const ov = project.settings.priceOverrides?.[key];
  if (ov != null && ov !== '' && !Number.isNaN(+ov)) return +ov;
  const region = regionById(project.settings.regionId);
  const tier = PRICING_TIERS.find((t) => t.id === project.settings.pricingTier) || PRICING_TIERS[2];
  return base.price * region.priceMult * tier.mult;
}
function regionTier(project) {
  const region = regionById(project.settings.regionId);
  const tier = PRICING_TIERS.find((t) => t.id === project.settings.pricingTier) || PRICING_TIERS[2];
  return region.priceMult * tier.mult;
}

export function computeEstimate(project, analysis, roofs) {
  const region = regionById(project.settings.regionId);
  const hz = project.settings.hazards;
  const snowPsf = (SNOW_LEVELS.find((s) => s.id === hz.snow) || SNOW_LEVELS[1]).psf;
  const cold = hz.frostDepthIn >= 24;
  const rt = regionTier(project);
  const spacing = project.structure.studSpacing || 16;
  const lines = [];
  const add = (category, key, qty, note = '', nameOverride = null, priceOverride = null) => {
    if (!(qty > 0)) return;
    const def = PRICES[key] || { name: nameOverride || key, unit: 'ea' };
    const up = priceOverride ?? unitPrice(project, key);
    const q = Math.round(qty * 100) / 100;
    lines.push({ category, key, item: nameOverride || def.name, qty: q, unit: def.unit, unitPrice: up, total: q * up, note });
  };
  const stats = { extWallArea: 0, extNetArea: 0, intWallArea: 0, drywallArea: 0, floorArea: 0, perimeter: 0, openings: [], longWalls: [], bigOpenings: [], corners: 0, stories: project.structure.floors.length, rooms: 0, roofArea: 0, extWallFt: 0 };
  const studs = { '2x4': 0, '2x6': 0 }; const plateFt = { '2x4': 0, '2x6': 0 }; const headers = []; let lvlFt = 0;
  const openingCounts = {}; let casings = 0; let trimFt = 0;
  const flooringArea = {};

  analysis.floors.forEach((fa, fi) => {
    const H = floorHeight(project, fi);
    for (const w of fa.walls) {
      const info = fa.wallInfo.get(w.id); const kind = info.kind;
      const dims = wallDims(kind);
      const L = wallLength(w);
      const fr = frameWall(w, L, H, dims.studD, spacing);
      studs[dims.stud] += fr.counts.studs + Math.ceil(fr.counts.cripples / 2);
      plateFt[dims.stud] += fr.counts.plateFt;
      headers.push(...fr.counts.headers); lvlFt += fr.counts.lvlFt;
      const area = L * H; const openArea = w.openings.reduce((s, o) => s + o.width * o.height, 0);
      if (kind === 'exterior') { stats.extWallArea += area; stats.extNetArea += area - openArea; stats.drywallArea += area - openArea; if (fi === 0) { stats.perimeter += L; stats.extWallFt += L; } }
      else { stats.intWallArea += area; stats.drywallArea += 2 * (area - openArea); }
      if (L > 20 && !fa.walls.some((o) => o.id !== w.id && nearMid(o, w))) stats.longWalls.push({ wall: w, L, floor: fi });
      for (const o of w.openings) {
        stats.openings.push({ ...o, exterior: kind === 'exterior', floor: fi });
        const key = openingKey(o, kind === 'exterior');
        openingCounts[key] = (openingCounts[key] || 0) + 1;
        casings++; trimFt += 2 * o.height + o.width;
        if (o.width > 6) stats.bigOpenings.push({ o, wall: w, floor: fi });
      }
    }
    for (const r of fa.rooms) {
      stats.floorArea += r.area; stats.rooms++;
      const fl = FLOORING.find((f) => f.id === r.flooring) || FLOORING[0];
      flooringArea[fl.id] = (flooringArea[fl.id] || 0) + r.area;
    }
    for (const j of wallJunctions(fa.walls)) {
      const ext = j.walls.filter((e) => fa.wallInfo.get(e.wall.id).kind === 'exterior');
      if (ext.length === 2) { const d1 = wallVec(ext[0].wall).dir; const d2 = wallVec(ext[1].wall).dir; if (Math.abs(cross(d1, d2)) > 0.3) stats.corners++; }
    }
  });

  // --- site ---
  let gravelTons = 0; let padArea = 0;
  for (const it of project.items) {
    const def = itemDef(it.type); if (!def) continue;
    if (def.gravel) { const a = (it.w || def.w) * (it.d || def.d); padArea += a; gravelTons += (a * 0.5) / 20; } // 6 in compacted, ≈20 cu ft/ton
  }
  if (padArea) { add('site', 'gravel', gravelTons, `${Math.round(padArea).toLocaleString()} sq ft of pad and driveway, 6 in compacted`); add('site', 'geotextile', padArea, 'Fabric under the pad keeps gravel out of the mud'); }

  // --- framing lumber ---
  const H0 = floorHeight(project, 0);
  add('framing', H0 > 8.5 ? 'stud-2x6-10' : 'stud-2x6-8', Math.ceil(studs['2x6'] * 1.05), `Exterior walls, ${spacing} in OC, incl. kings/jacks/cripples`);
  add('framing', 'stud-2x4-8', Math.ceil(studs['2x4'] * 1.05), `Interior walls, ${spacing} in OC`);
  add('framing', 'plate-2x6-16', Math.ceil(plateFt['2x6'] / 16 * 1.05), 'Bottom + double top plates');
  add('framing', 'plate-2x4-16', Math.ceil(plateFt['2x4'] / 16 * 1.05));
  const hdr2x10 = headers.filter((h) => !h.lvl && (h.size === '2x6' || h.size === '2x8' || h.size === '2x10'));
  const hdr2x12 = headers.filter((h) => !h.lvl && h.size === '2x12');
  add('framing', 'header-2x10-8', Math.ceil(hdr2x10.reduce((s, h) => s + h.length * 2, 0) / 8), 'Doubled 2× headers over openings ≤ 6.5 ft');
  add('framing', 'header-2x12-10', Math.ceil(hdr2x12.reduce((s, h) => s + h.length * 2, 0) / 10), 'Doubled 2×12 headers over 6.5–8 ft openings');
  add('framing', 'lvl-header-ft', Math.ceil(lvlFt), 'Engineered headers over openings wider than 8 ft');

  // --- roof (per building) ---
  let roofArea = 0; let eaveFt = 0; let rakeFt = 0; let ridgeFt = 0; let rafters = 0; let rafterNote = null; let rafterSize = '2x10'; let maxSpan = 0; let metalEaveFt = 0;
  const roofingAreas = {};
  for (const r of roofs) {
    roofArea += r.area; eaveFt += r.eaveFt; rakeFt += r.rakeFt; ridgeFt += r.ridgeFt; rafters += r.rafterCount;
    const rs = rafterForSpan(r.run, snowPsf); if (rs.note) rafterNote = rs.note; if (r.run > maxSpan) { maxSpan = r.run; rafterSize = rs.size; }
    const matId = r.settings?.material || project.structure.roof.material; roofingAreas[matId] = (roofingAreas[matId] || 0) + r.area;
    if (matId === 'standing' || matId === 'corrugated') metalEaveFt += r.eaveFt;
    if (r.joists.length) add('framing', 'joist-2x10-16', Math.ceil(r.joists.length * Math.ceil(r.span / 14)), 'Ceiling joists / collar ties');
  }
  stats.roofArea = roofArea;
  if (rafters) {
    const key = rafterSize === '2x12' || rafterSize === 'truss' ? 'rafter-2x12-16' : 'rafter-2x10-16';
    const perRafter = Math.ceil((roofs[0]?.rafterLen || 12) / 16);
    add('framing', key, Math.ceil(rafters * perRafter * 1.05), rafterSize === 'truss' ? 'Stick framing shown; engineered trusses likely at this span' : `${rafterSize} rafters at 24 in OC`);
    add('framing', 'ridge-2x12-16', Math.ceil(ridgeFt / 16), 'Ridge board');
  }
  add('sheathing', 'osb-roof', Math.ceil((roofArea / 32) * 1.1), 'Roof deck, 10% waste');
  for (const [matId, area] of Object.entries(roofingAreas)) {
    const roofing = ROOFING.find((m) => m.id === matId) || ROOFING[0];
    add('roof', 'roofing', (area / 100) * 1.12, '12% waste', `${roofing.name} (per square)`, roofing.costSquare * rt);
  }
  add('roof', 'underlayment', Math.ceil((roofArea / 1000) * 1.1));
  if (cold) add('roof', 'icewater', Math.ceil((eaveFt * 6) / 200), 'Ice & water shield 6 ft up from eaves (valleys extra)');
  add('roof', 'drip-edge', Math.ceil((eaveFt + rakeFt) / 10));
  add('roof', 'ridge-cap', Math.ceil(ridgeFt * 1.05));
  if (ridgeFt) add('roof', 'ridge-vent', Math.ceil(ridgeFt));
  if (metalEaveFt && (hz.snow === 'heavy' || hz.snow === 'extreme')) add('roof', 'snow-guards', Math.ceil(metalEaveFt * 0.6), 'Above doors, decks and the fuel tank');
  if (project.structure.roof.fascia) add('roof', 'fascia', Math.ceil((eaveFt + rakeFt) * 1.05));
  if (project.structure.roof.soffit) add('roof', 'soffit', Math.ceil(eaveFt * 1.05), `${project.structure.roof.overhang} ft overhang`);
  add('roof', 'flashing-roll', Math.ceil(ridgeFt / 50) + roofs.length, 'Roof-to-wall, ridge and penetrations');

  // --- sheathing & wrap ---
  add('sheathing', 'osb-wall', Math.ceil((stats.extWallArea / 32) * 1.1), 'Exterior wall sheathing, 10% waste');
  if (project.exterior.houseWrap !== false) add('sheathing', 'housewrap', Math.ceil(stats.extWallArea / 850));
  const extOpenings = stats.openings.filter((o) => o.exterior).length;
  if (project.exterior.flashing !== false) add('sheathing', 'window-flashing', Math.ceil(extOpenings / 4), 'Flashing tape at every exterior opening');

  // --- exterior finish ---
  const siding = SIDING.find((s) => s.id === project.exterior.sidingType) || SIDING[0];
  const stone = project.exterior.stone?.enabled ? project.exterior.stone : null;
  const stoneArea = stone ? stats.extWallFt * Math.min(stone.heightFt, H0) : 0;
  add('exterior', 'siding', Math.max(0, stats.extNetArea - stoneArea) * 1.12, `${siding.name}, 12% waste`, `${siding.name} (per sq ft)`, siding.costSqft * rt);
  if (stone) add('exterior', 'stone-veneer', stoneArea * 1.1, `${STONE_VENEER.find((s) => s.id === stone.type)?.name || 'Stone'} wainscot, ${stone.heightFt} ft high, incl. sill cap`);
  add('exterior', 'corner-board', stats.corners * 2 * Math.ceil(H0 / 10), 'Two boards per exterior corner');
  add('exterior', 'trim-board', Math.ceil(trimFt / 16 * 1.1), 'Window & door exterior trim');

  // --- openings ---
  for (const [key, n] of Object.entries(openingCounts)) add('openings', key, n);
  add('openings', 'casing-set', casings);

  // --- foundation ---
  const fd = project.structure.foundation;
  const A = analysis.floors[0]?.rooms.reduce((s, r) => s + r.area, 0) || 0;
  const P = stats.perimeter;
  const depthFt = (fd.depthIn || 42) / 12;
  const yd3 = (ft3) => ft3 / 27;
  const future = project.structure.futureSecondStory ? 1.15 : 1;
  if (fd.type === 'slab') {
    const vol = A * (fd.slabIn || 4) * IN + P * 1.0 * 1.0;
    add('foundation', 'concrete', yd3(vol) * 1.08 * future, `Slab + thickened edge, 8% waste${future > 1 ? ', edge upsized for a future second story' : ''}`);
    add('foundation', 'rebar', Math.ceil((A / 16 + P * 2) / 20));
    add('foundation', 'gravel', (A * 0.5) / 20, '6 in compacted base (≈20 cu ft per ton)');
    add('foundation', 'vapor-barrier', Math.ceil(A / 950));
    if (cold) add('insulation', 'insul-slab', A, 'Under-slab and edge foam');
    add('foundation', 'anchor-bolt', Math.ceil(P / 4));
  } else if (fd.type === 'stem' || fd.type === 'crawl') {
    const footing = P * (fd.footingWIn || 16) * IN * (fd.footingHIn || 8) * IN;
    const stem = P * (fd.stemIn || 8) * IN * depthFt;
    const slab = fd.type === 'stem' ? A * (fd.slabIn || 4) * IN : 0;
    add('foundation', 'concrete', yd3(footing * future + stem + slab) * 1.08, `Footings ${fd.footingWIn}×${fd.footingHIn} in, stem walls to ${fd.depthIn} in, ${fd.type === 'stem' ? 'slab' : 'no slab'}${future > 1 ? '; footings widened for a future second story' : ''}`);
    add('foundation', 'rebar', Math.ceil((P * 4 + (fd.type === 'stem' ? A / 16 : 0)) / 20));
    add('foundation', 'anchor-bolt', Math.ceil(P / 4));
    add('foundation', 'gravel', (A * 0.4 + P * 1.5) / 20, 'Base and footing drain');
    if (fd.type === 'stem') { add('foundation', 'vapor-barrier', Math.ceil(A / 950)); if (cold) add('insulation', 'insul-slab', A); }
    if (fd.type === 'crawl') { add('framing', 'joist-2x10-16', Math.ceil(A / 16 / 1.33 * 1.05), 'Floor joists 16 in OC incl. rim'); add('sheathing', 'subfloor', Math.ceil((A / 32) * 1.1)); }
  } else {
    const spacingP = fd.pierSpacingFt || 8;
    const piers = Math.ceil(P / spacingP) + Math.ceil(A / (spacingP * spacingP * 2));
    add('foundation', 'sonotube', piers, `${piers} piers at ≈${spacingP} ft, below frost (${fd.depthIn} in)`);
    add('foundation', 'concrete', yd3(piers * Math.PI * 0.5 * 0.5 * (depthFt + 1)) * 1.1 * future);
    add('foundation', 'post-6x6-10', piers);
    add('framing', 'beam-glulam-ft', Math.ceil(P + A / spacingP), 'Beams under walls and at interior pier lines');
    add('framing', 'joist-2x10-16', Math.ceil(A / 16 / 1.33 * 1.05), 'Floor joists 16 in OC incl. rim');
    add('sheathing', 'subfloor', Math.ceil((A / 32) * 1.1));
    add('insulation', 'insul-ceiling', A, 'Floor insulation over open piers');
    add('foundation', 'gravel', (A * 0.3) / 20, 'Pad under building');
  }
  for (let fi = 1; fi < analysis.floors.length; fi++) {
    const Af = analysis.floors[fi].rooms.reduce((s, r) => s + r.area, 0);
    add('framing', 'joist-2x10-16', Math.ceil(Af / 16 / 1.33 * 1.05), `Floor ${fi + 1} joists incl. rim`);
    add('sheathing', 'subfloor', Math.ceil((Af / 32) * 1.1), `Floor ${fi + 1} subfloor`);
  }

  // --- insulation ---
  const ins = INSULATION.find((i) => i.id === project.structure.insulation) || INSULATION[0];
  const wallR = Math.round(ins.rPerIn * 5.5);
  add('insulation', 'insul-wall', stats.extNetArea, `${ins.name} in 2×6 walls ≈ R-${wallR}`, `${ins.name} (per sq ft of wall)`, ins.costSqft * rt);
  const topArea = analysis.floors[analysis.floors.length - 1]?.rooms.reduce((s, r) => s + r.area, 0) || 0;
  add('insulation', 'insul-ceiling', topArea, 'Ceiling / attic');
  if (ins.id !== 'sprayfoam') add('insulation', 'poly-sheeting', Math.ceil(stats.extNetArea / 900), 'Interior vapor retarder, taped seams');

  // --- interior ---
  const ceilingArea = analysis.floors.reduce((s, f) => s + f.rooms.reduce((t, r) => t + r.area, 0), 0);
  add('interior', 'drywall', Math.ceil(((stats.drywallArea + ceilingArea) / 32) * 1.1), 'Walls and ceilings, 10% waste');
  add('interior', 'paint', Math.ceil(((stats.drywallArea + ceilingArea) * 2) / 350), 'Two coats');
  for (const [id, area] of Object.entries(flooringArea)) {
    const fl = FLOORING.find((f) => f.id === id);
    add('interior', 'flooring', area * 1.08, '8% waste', `${fl.name} flooring (per sq ft)`, fl.costSqft * rt);
  }
  // baseboard and crown run around every room perimeter (doors excluded from baseboard)
  const roomPerim = analysis.floors.reduce((s, f) => s + f.rooms.reduce((t, r) => { let per = 0; for (let i = 0; i < r.polygon.length; i++) { const a = r.polygon[i]; const b = r.polygon[(i + 1) % r.polygon.length]; per += Math.hypot(b.x - a.x, b.z - a.z); } return t + per; }, 0), 0);
  const doorWidths = project.structure.walls.reduce((s, w) => s + w.openings.filter((o) => o.kind !== 'window').reduce((t, o) => t + o.width * 2, 0), 0);
  const trim = project.interior.trim || {};
  if (trim.baseboards !== false) add('interior', 'baseboard-ft', Math.ceil(Math.max(0, roomPerim - doorWidths) * 1.1), 'Every room, 10% waste');
  if (trim.crown) add('interior', 'crown-ft', Math.ceil(roomPerim * 1.12), 'Every room, 12% waste for miters');
  for (const it of project.items) { const def = itemDef(it.type); if (def?.stair) add('framing', def.stair === 'L' ? 'stair-l' : 'stair-straight', 1, `${def.name} to ${project.structure.floors[it.floor + 1]?.name || 'the next floor'}`); }

  // --- outdoor structures & systems from items ---
  let laundry = []; let vents = 0; let chimneyFt = 0; let stovepipes = 0; let solarPanels = 0;
  for (const it of project.items) {
    const def = itemDef(it.type); if (!def) continue;
    const w = it.w || def.w; const d = it.d || def.d;
    if (def.structural === 'laundry') laundry.push(it);
    if (def.deck && def.build === 'deck') { add('outdoor', 'deck-sqft', w * d, `${Math.round(w)}×${Math.round(d)} ft deck`); if (def.railing) add('outdoor', 'railing-ft', w + 2 * d, 'Railing on three sides'); }
    if (def.build === 'porch') add('outdoor', 'porch-sqft', w * d, `${Math.round(w)}×${Math.round(d)} ft covered porch`);
    if (def.build === 'fence') add('outdoor', 'fence-ft', w);
    if (def.vent) { if (def.vent.kind === 'stovepipe') stovepipes++; else if (def.vent.kind === 'chimney') chimneyFt += (floorHeight(project, it.floor) + 6); else vents++; }
    if (def.solar) solarPanels += Math.max(1, Math.round((w * d) / 20));
  }
  if (stovepipes) add('systems', 'stovepipe-kit', stovepipes, 'Double-wall pipe, roof flashing, storm collar, cap');
  if (chimneyFt) add('systems', 'chimney-ft', Math.ceil(chimneyFt), 'Masonry chimney through the roof, 3 ft above the ridge line');
  if (vents) add('systems', 'vent-kit', vents, 'Dryer, range hood, bath fan, HRV and plumbing vents');
  if (solarPanels) { add('systems', 'solar-panel', solarPanels, `${solarPanels} × 400 W ≈ ${(solarPanels * 0.4).toFixed(1)} kW`); add('systems', 'solar-bos', solarPanels, 'Inverter, racking, wiring allowance'); }

  // --- hardware ---
  add('hardware', 'fasteners', stats.floorArea, 'Nails, screws, hangers, adhesive');
  if (rafters) add('hardware', 'hurricane-tie', rafters, 'One per rafter at the plate');
  const seismicHigh = hz.seismic === 'high' || hz.seismic === 'very-high';
  if (seismicHigh) {
    add('structural', 'holddown', Math.max(4, stats.corners * 2), 'Hold-downs at shear-wall ends (high seismic)');
    add('structural', 'strap', Math.ceil(stats.perimeter / 25), 'Straps at upper-floor and roof-to-wall connections');
    add('structural', 'anchor-bolt', Math.ceil(P / 4), 'Extra anchor bolts: 4 ft OC max in high seismic');
  }
  if (hz.snow === 'heavy' || hz.snow === 'extreme') add('structural', 'blocking-2x10-8', Math.ceil(rafters / 2), 'Blocking between rafters at bearing (heavy snow)', '2×10 × 8 ft blocking (rafter bearing, snow)');
  if (region.wind === 'hurricane') add('structural', 'strap', Math.ceil(P / 10), 'Continuous load path straps (hurricane wind zone)');
  if (laundry.length) add('structural', 'blocking-2x10-8', 4, 'Doubled joists / blocking under washer and dryer', '2×10 × 8 ft blocking (under washer/dryer)');
  add('other', 'permit-allowance', 1);

  const byCategory = {};
  for (const l of lines) byCategory[l.category] = (byCategory[l.category] || 0) + l.total;
  const byPhase = {};
  for (const ph of PHASES) byPhase[ph.id] = lines.filter((l) => ph.categories.includes(l.category)).reduce((s, l) => s + l.total, 0);
  const grand = lines.reduce((s, l) => s + l.total, 0);
  const notes = engineerNotes(project, analysis, roofs, stats, { snowPsf, region, rafterNote, maxSpan, laundry, ins, wallR });
  return { lines: lines.filter((l) => l.qty > 0), byCategory, byPhase, grand, notes, stats, disclaimer: DISCLAIMER, categories: PRICE_CATEGORIES, phases: PHASES };
}

function nearMid(o, w) {
  const { dir, length } = wallVec(w);
  for (const q of [o.a, o.b]) {
    const t = ((q.x - w.a.x) * dir.x + (q.z - w.a.z) * dir.z);
    const d = Math.abs((q.x - w.a.x) * dir.z - (q.z - w.a.z) * dir.x);
    if (d < 0.1 && t > 2 && t < length - 2) return true;
  }
  return false;
}

function openingKey(o, exterior) {
  if (o.kind === 'window') return `window-${['single', 'double', 'picture', 'slider', 'awning', 'small', 'tall', 'clerestory'].includes(o.style) ? o.style : 'single'}`;
  if (o.kind === 'opening') return 'casing-set';
  const dbl = (o.leaves || 1) === 2;
  switch (o.style) {
    case 'double': return exterior ? 'door-double-ext' : 'door-double-int';
    case 'french': return 'door-french';
    case 'glass': return dbl ? 'door-french' : 'door-glass-int';
    case 'dutch': return 'door-dutch';
    case 'sliding': return 'door-sliding';
    case 'barn': return 'door-barn';
    case 'garage9': return 'door-garage9';
    case 'garage10': return 'door-garage10';
    case 'garage16': return 'door-garage16';
    case 'garage18': return 'door-garage18';
    default: return dbl ? (exterior ? 'door-double-ext' : 'door-double-int') : (exterior ? 'door-ext' : 'door-int');
  }
}

export function engineerNotes(project, analysis, roofs, stats, ctx) {
  const notes = [];
  const hz = project.settings.hazards; const fd = project.structure.foundation; const roof = project.structure.roof;
  const region = ctx.region;
  if (fd.type !== 'piers' && (fd.depthIn || 0) < hz.frostDepthIn - 1) notes.push({ level: 'warn', text: `Footings are set at ${fd.depthIn} in but local frost depth is about ${hz.frostDepthIn} in. Footings normally bear below frost (or use a frost-protected shallow foundation design).` });
  if (region.permafrost) notes.push({ level: 'warn', text: 'Permafrost region: keep building heat off the ground. Piers with an air gap, or an engineered thermosyphon / insulated pad, are the usual answers.' });
  if (project.structure.futureSecondStory) notes.push({ level: 'info', text: 'Planned second story: size footings and stem walls for two floors now, use a full-height stair location in the plan, run a ridge beam or trusses that can be removed, and make the first-floor ceiling joists floor-rated (2×10 at 16 in or better).' });
  if (hz.snow === 'heavy' || hz.snow === 'extreme') {
    notes.push({ level: 'info', text: `Design for roughly ${ctx.snowPsf} psf ground snow. ${ctx.rafterNote || `Rafter sizing shown assumes a ${ctx.maxSpan.toFixed(0)} ft horizontal span; confirm with span tables or trusses.`}` });
    for (const r of roofs) if (r.style !== 'flat' && r.pitch < 4) { notes.push({ level: 'warn', text: `A ${r.pitch}:12 roof holds snow. A steeper pitch or a metal roof sheds it; plan where slides land (not over doors or the fuel tank).` }); break; }
    if (roofs.some((r) => ['standing', 'corrugated'].includes(r.settings?.material || roof.material))) notes.push({ level: 'info', text: 'Metal roof in snow country: snow guards above entries and decks are in the list, or expect roof avalanches.' });
  }
  if (project.structure.studSpacing === 24) notes.push({ level: 'info', text: '24 in stud spacing (advanced framing) needs single top plates with aligned rafters or trusses, 5/8 in drywall or horizontal strapping, and a sheathing nailing schedule the engineer signs off on.' });
  if (project.structure.studSpacing === 12) notes.push({ level: 'info', text: '12 in stud spacing is stiff and heavy; it cuts insulation area by about 15%. Usually only worth it for tall walls or heavy cladding.' });
  if (hz.seismic === 'high' || hz.seismic === 'very-high') notes.push({ level: 'info', text: 'High seismic zone: hold-downs at shear-wall ends, anchor bolts at 4 ft OC (max), blocked panel edges, straps for a continuous load path, and a strapped water heater.' });
  if (hz.flood) notes.push({ level: 'warn', text: 'Flood zone: the lowest floor usually has to sit above the base flood elevation, crawlspaces need flood vents, and slab-on-grade is often not allowed.' });
  if (region.wind === 'hurricane') notes.push({ level: 'info', text: 'Hurricane wind zone: ties on every rafter or truss, rated sheathing nailing, and impact-rated or shuttered openings.' });
  for (const b of stats.bigOpenings) notes.push({ level: 'info', text: `${b.o.width.toFixed(0)} ft opening (${b.o.style}) needs an engineered header; the jacks under it need a solid path to the foundation.` });
  for (const lw of stats.longWalls) notes.push({ level: 'info', text: `A ${lw.L.toFixed(0)} ft wall on floor ${lw.floor + 1} has no intersecting wall. Long unbraced walls want blocking, a partition, or a beam line.` });
  if (roofs.some((r) => r.run > 16)) notes.push({ level: 'warn', text: 'Roof span over 32 ft: stick framing is unlikely; plan on trusses or a structural ridge with posts to the foundation.' });
  if (roofs.some((r) => r.style === 'gambrel')) notes.push({ level: 'info', text: 'Gambrel: the break between slopes needs a purlin or a knee wall carried to the floor; the loft floor becomes a structural tie.' });
  if (project.structure.floors.length > 1) notes.push({ level: 'info', text: 'Upper-floor bearing walls should stack over lower walls or beams; where they don\'t, a beam and posts carry the load down.' });
  if (ctx.laundry.length) notes.push({ level: 'info', text: 'Laundry: double the joists or add blocking under the washer, add a drain pan, and the dryer vents straight out through the nearest exterior wall (shown in the model).' });
  if (project.items.some((it) => itemDef(it.type)?.structural === 'heavy')) notes.push({ level: 'info', text: 'A filled tub, a piano or a water heater is roughly 800–1,000 lb on a small footprint; check the floor framing under it.' });
  if (project.items.some((it) => it.type === 'woodstove')) notes.push({ level: 'info', text: 'Wood stove: keep listed clearances to walls, build a non-combustible hearth, use listed double-wall pipe through the roof with a storm collar (modeled), and add CO + smoke alarms.' });
  if (project.items.some((it) => itemDef(it.type)?.solar)) notes.push({ level: 'info', text: `Solar at latitude ${(hz.latitude ?? region.lat).toFixed(0)}°: panels want a tilt near the latitude and a south face; snow slides off steep arrays. Size the battery for December, not June.` });
  if (project.items.some((it) => it.type === 'septic') && project.items.some((it) => it.type === 'wellhead')) {
    const s = project.items.find((it) => it.type === 'septic'); const w = project.items.find((it) => it.type === 'wellhead'); const d = Math.hypot(s.x - w.x, s.z - w.z);
    notes.push({ level: d < 100 ? 'warn' : 'info', text: `Well to septic tank is about ${Math.round(d)} ft; most codes want 100 ft from the drain field and 50 ft from the tank, well uphill.` });
  }
  if (fd.type === 'piers' && hz.seismic !== 'low') notes.push({ level: 'info', text: 'Piers in a seismic zone need diagonal bracing between posts and solid post-to-beam connectors.' });
  notes.push({ level: 'info', text: `${ctx.ins.name}: 2×6 walls come out near R-${ctx.wallR}. ${ctx.ins.note}` });
  if (region.barge) notes.push({ level: 'info', text: 'Barge / freight region: order full material lists early; sheet goods and lumber lengths over 16 ft may be hard to get.' });
  notes.push({ level: 'always', text: DISCLAIMER });
  return notes;
}

export function estimateToText(est, project) {
  const money = (v) => `$${Math.round(v).toLocaleString()}`;
  const out = [];
  out.push(`${project.name} — rough materials list`);
  out.push(`Region: ${regionById(project.settings.regionId).name} · Pricing: ${project.settings.pricingTier} · Mode: ${project.settings.mode}`);
  out.push(`Floor area: ${Math.round(est.stats.floorArea).toLocaleString()} sq ft · Roof: ${Math.round(est.stats.roofArea).toLocaleString()} sq ft · Exterior wall: ${Math.round(est.stats.extWallArea).toLocaleString()} sq ft`);
  out.push('');
  for (const ph of est.phases) {
    const cats = ph.categories.filter((c) => est.lines.some((l) => l.category === c)); if (!cats.length) continue;
    out.push(`${ph.name.toUpperCase()} — ${money(est.byPhase[ph.id] || 0)}`);
    for (const cat of cats) {
      out.push(`  ${est.categories[cat]} — ${money(est.byCategory[cat] || 0)}`);
      for (const l of est.lines.filter((x) => x.category === cat)) out.push(`    ${l.qty % 1 ? l.qty.toFixed(1) : l.qty} ${l.unit}  ${l.item}  @ ${money(l.unitPrice)}  = ${money(l.total)}${l.note ? `  (${l.note})` : ''}`);
    }
    out.push('');
  }
  out.push(`ESTIMATED MATERIALS TOTAL: ${money(est.grand)}  (labor, site work, utilities, mechanical, electrical and plumbing not included)`);
  out.push('');
  out.push('NOTES FOR YOUR ENGINEER');
  for (const n of est.notes) out.push(`  • ${n.text}`);
  return out.join('\n');
}

export function estimateToCsv(est) {
  const esc = (s) => `"${String(s).replace(/"/g, '""')}"`;
  const phaseOf = (cat) => est.phases.find((p) => p.categories.includes(cat))?.name || '';
  const rows = [['Phase', 'Category', 'Item', 'Qty', 'Unit', 'Unit price', 'Total', 'Note']];
  for (const l of est.lines) rows.push([phaseOf(l.category), est.categories[l.category], l.item, l.qty, l.unit, l.unitPrice.toFixed(2), l.total.toFixed(2), l.note]);
  rows.push([], ['', '', 'TOTAL', '', '', '', est.grand.toFixed(2), DISCLAIMER]);
  return rows.map((r) => r.map(esc).join(',')).join('\n');
}
