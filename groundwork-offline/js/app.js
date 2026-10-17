// Groundwork — app shell: start screen, editor UI (token bars + vellum sheet), tools, selection,
// sheets, walkthrough, export, persistence. The 3D work lives in builder.js / sky.js / fx.js.
import * as THREE from './vendor.js';
import * as C from './catalog.js';
import * as Model from './model.js';
import { snapPoint, snapAngle, snapOrtho, dist, wallVec, perp, bbox, pointInPolygon } from './geometry.js';
import { buildRoofs } from './roof.js';
import { computeEstimate, estimateToText, estimateToCsv } from './estimate.js';
import { SceneBuilder, floorElevation } from './builder.js';
import { Atmosphere, dayOfYearFor, weatherDef, sunTimes, formatHour, sunWindows } from './sky.js';
import { CameraRig, Gestures, Joystick } from './controls.js';
import { PostFX } from './fx.js';
import { renderPlanSheet, renderMaterialsSheet, renderNotesSheet } from './blueprint.js';
import * as Tex from './textures.js';
import * as M from './materials.js';

// ------------------------------------------------------------------ helpers
const $ = (id) => document.getElementById(id);
function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') el.className = v; else if (k === 'style') el.style.cssText = v; else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (k === 'html') el.innerHTML = v; else if (v === false || v == null) continue; else if (v === true) el.setAttribute(k, ''); else el.setAttribute(k, v);
  }
  for (const c of children.flat()) if (c != null && c !== false) el.append(c.nodeType ? c : document.createTextNode(String(c)));
  return el;
}
function ftIn(ft) { const neg = ft < 0; ft = Math.abs(ft); let f = Math.floor(ft); let i = Math.round((ft - f) * 12); if (i === 12) { f++; i = 0; } return `${neg ? '-' : ''}${f}′${i ? `${i}″` : ''}`; }
function money(v) { return `$${Math.round(v).toLocaleString()}`; }
function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
const store = { get(k) { try { return localStorage.getItem(k); } catch { return null; } }, set(k, v) { try { localStorage.setItem(k, v); return true; } catch { return false; } } };
let toastTimer = 0;
function toast(msg, ms = 1800) { const t = $('toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('show'), ms); }
async function copyText(text, label = 'Copied') {
  try { await navigator.clipboard.writeText(text); toast(label); return true; } catch {
    const ta = h('textarea', { class: 'code', style: 'position:fixed;left:-9999px' }); ta.value = text; document.body.append(ta); ta.select();
    try { document.execCommand('copy'); toast(label); } catch { toast('Select the text and copy it'); } ta.remove(); return false;
  }
}
const ICONS = {
  select: '<svg viewBox="0 0 24 24"><path d="M5 3l14 8-6 2-3 6z"/></svg>',
  wall: '<svg viewBox="0 0 24 24"><path d="M3 20V9l9-5 9 5v11"/><path d="M3 14h18M8 9v11M16 9v11M12 14v6"/></svg>',
  door: '<svg viewBox="0 0 24 24"><path d="M5 20V5a1 1 0 0 1 1-1h12a1 1 0 0 1 1 1v15M5 20h14"/><path d="M9 20V8l6-2v14"/><circle cx="13" cy="13" r=".8"/></svg>',
  window: '<svg viewBox="0 0 24 24"><rect x="4" y="4" width="16" height="16" rx="1"/><path d="M12 4v16M4 12h16"/></svg>',
  opening: '<svg viewBox="0 0 24 24"><path d="M4 20V9a8 8 0 0 1 16 0v11"/><path d="M8 20V10a4 4 0 0 1 8 0v10"/></svg>',
  place: '<svg viewBox="0 0 24 24"><path d="M4 10h16v3H4zM6 13v6M18 13v6M7 10V6h10v4"/></svg>',
  sun: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>',
  walk: '<svg viewBox="0 0 24 24"><circle cx="13" cy="4" r="1.6"/><path d="M10 21l2-7-3-2V9l3-2 3 1 2 3h2M8 12l-2 3M12 14l3 3v4"/></svg>',
  export: '<svg viewBox="0 0 24 24"><path d="M6 3h9l4 4v14H6z"/><path d="M15 3v4h4M9 12h7M9 16h7"/></svg>',
  exterior: '<svg viewBox="0 0 24 24"><path d="M3 11l9-7 9 7"/><path d="M5 10v10h14V10"/><path d="M5 14h14M5 18h14"/></svg>',
  menu: '<svg viewBox="0 0 24 24"><path d="M4 7h16M4 12h16M4 17h16"/></svg>',
  roof: '<svg viewBox="0 0 24 24"><path d="M3 12 12 4l9 8M6 10v9h12v-9"/></svg>',
  undo: '<svg viewBox="0 0 24 24"><path d="M9 14 4 9l5-5"/><path d="M4 9h9a6 6 0 0 1 0 12h-3"/></svg>',
  redo: '<svg viewBox="0 0 24 24"><path d="m15 14 5-5-5-5"/><path d="M20 9h-9a6 6 0 0 0 0 12h3"/></svg>',
  plan: '<svg viewBox="0 0 24 24"><rect x="4" y="4" width="16" height="16" rx="2"/><path d="M4 12h16M12 4v16"/></svg>',
  fit: '<svg viewBox="0 0 24 24"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/></svg>',
  foundation: '<svg viewBox="0 0 24 24"><path d="M3 17h18M5 17v3h14v-3M4 13h16v4H4z"/></svg>',
  framing: '<svg viewBox="0 0 24 24"><path d="M4 20V8l8-5 8 5v12M4 20h16M8 20V9M12 20V7M16 20V9M4 14h16"/></svg>',
  insulation: '<svg viewBox="0 0 24 24"><path d="M4 20V8l8-5 8 5v12M4 20h16"/><path d="M7 11c1.5-1.5 3 1.5 4.5 0s3 1.5 4.5 0M7 15c1.5-1.5 3 1.5 4.5 0s3 1.5 4.5 0"/></svg>',
  finished: '<svg viewBox="0 0 24 24"><path d="M3 11l9-8 9 8M5 10v10h14V10"/><path d="M10 20v-6h4v6"/></svg>',
  furnished: '<svg viewBox="0 0 24 24"><path d="M4 11v6h16v-6M6 11V7a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v4M4 11a2 2 0 0 1 2-2 2 2 0 0 1 2 2M16 11a2 2 0 0 1 2-2 2 2 0 0 1 2 2M6 17v2M18 17v2"/></svg>',
  stack: '<svg viewBox="0 0 24 24"><path d="M12 3l9 5-9 5-9-5z"/><path d="M3 13l9 5 9-5"/></svg>',
};
const VIEWS = [
  { id: 'foundation', name: 'Foundation', feature: 'foundation' }, { id: 'framing', name: 'Framing', feature: 'framing' }, { id: 'insulation', name: 'Insulation', feature: 'insulation' },
  { id: 'finished', name: 'Finished' }, { id: 'furnished', name: 'Furnished' },
];
const TOOLS = [
  { id: 'select', name: 'Select', hint: 'Tap anything to inspect it · drag to orbit · two fingers to pan and zoom' },
  { id: 'wall', name: 'Wall', hint: 'Drag on the ground to draw a wall · ends snap to walls and the grid', feature: 'walls' },
  { id: 'door', name: 'Door', hint: 'Tap a wall to put a door there', feature: 'openings' },
  { id: 'window', name: 'Window', hint: 'Tap a wall to put a window there', feature: 'openings' },
  { id: 'opening', name: 'Opening', hint: 'Tap a wall for a cased or arched opening', feature: 'openings' },
  { id: 'place', name: 'Place items', hint: 'Pick something, then tap where it goes', feature: 'furnish' },
  { id: 'sep' },
  { id: 'exterior', name: 'Materials', hint: '' },
  { id: 'sun', name: 'Sun & weather', hint: '' },
  { id: 'walk', name: 'Walk through', hint: '' },
  { id: 'export', name: 'Blueprint & list', hint: '' },
];

// -------------------------------------------------------------------- state
const S = {
  project: null, analysis: null, roofs: [], estimate: null,
  view: 'finished', floor: 0, roofVisible: true, tool: 'select', placing: null, selection: null,
  undo: [], redo: [], dirtyTimer: 0, needsRender: true, lastEnvKey: '', lastGroundKey: '', envTimer: 0,
  draw: null, lastHit: null, lightsOn: false, quality: store.get('gw.quality') || 'high', motion: store.get('gw.motion') !== 'off', systemsVisible: true,
  frameSkip: 0, lastRenderT: 0, walkAll: false, ghostsVisible: true, walkBase: 0, walkFloor: 0,
};
let renderer; let scene; let camera; let rig; let atmo; let builder; let gestures; let joystick; let raycaster; let fx;
const overlay = { highlight: null, handles: [], ghost: null };

function has(feature) { return C.MODES[S.project?.settings.mode || 'simple'].features.includes(feature); }
function region() { return Model.regionById(S.project.settings.regionId); }
function floorY(fi = S.floor) { return floorElevation(S.project, fi); }
function magnetFt(px = 18) { const hgt = renderer.domElement.clientHeight || 800; const d = rig.mode === 'orbit' ? rig.distance : 20; return Math.max(0.6, ((2 * Math.tan((camera.fov * Math.PI) / 360) * d) / hgt) * px); }
function isPortrait() { return window.innerHeight > window.innerWidth; }

// ------------------------------------------------------------- 3D bootstrap
function applyQuality() {
  const q = S.quality;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, q === 'low' ? 1.25 : q === 'high' ? 1.6 : 2));
  atmo.setShadowQuality(q === 'low' ? 'low' : 'medium');
  fx.enabled = q === 'high'; fx.ao = true; fx.bloom = true;
  resize(); S.needsRender = true;
}
function initThree() {
  const canvas = $('gl');
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.0;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(50, 1, 0.5, 3000);
  rig = new CameraRig(camera);
  atmo = new Atmosphere(renderer, scene);
  builder = new SceneBuilder(scene);
  fx = new PostFX(renderer, scene, camera);
  raycaster = new THREE.Raycaster();
  gestures = new Gestures(canvas, { pointerDown, dragStart, drag, dragEnd, tap, hover: onHover, pinch, wheel });
  joystick = new Joystick($('joy'), $('joyKnob'));
  window.addEventListener('resize', resize);
  applyQuality();
  requestAnimationFrame(loop);
}
function resize() {
  const el = $('editor'); const w = el.clientWidth || window.innerWidth; const hh = el.clientHeight || window.innerHeight;
  renderer.setSize(w, hh, false); camera.aspect = w / hh;
  camera.fov = rig.mode === 'walk' ? +$('fovR').value : (isPortrait() ? 58 : 50); camera.updateProjectionMatrix(); S.needsRender = true;
}
let lastT = performance.now();
// The loop renders on demand. Ambient motion (wind, fire, smoke, stars, weather) re-renders at a capped
// rate instead of every display frame, and only while the page is visible, so the phone stays cool.
function loop(t) {
  requestAnimationFrame(loop);
  const dt = Math.min(0.1, (t - lastT) / 1000); lastT = t;
  if (!S.project || $('editor').hidden || document.hidden) return;
  if (rig.mode === 'walk') { rig.moveInput.copy(joystick.vec); if (joystick.vec.lengthSq() > 0 || keys.size) { applyKeys(); S.needsRender = true; } }
  const moving = rig.mode === 'orbit' && (rig.target.distanceToSquared(rig.goalTarget) > 1e-4 || Math.abs(rig.distance - rig.goalDistance) > 1e-3 || Math.abs(rig.theta - rig.goalTheta) > 1e-4 || Math.abs(rig.phi - rig.goalPhi) > 1e-4);
  if (moving) S.needsRender = true;
  rig.update(dt);
  if (rig.mode === 'walk') followWalkSurface(dt);
  if (builder.animateDoors(dt)) S.needsRender = true;
  const night = atmo.cols ? atmo.cols.night : 0;
  const effects = builder.fires.length + builder.smokes.length > 0;
  const ambient = S.motion || !!atmo.particles || (night > 0.3 && S.motion) || effects;
  const fpsCap = S.quality === 'low' ? 20 : 30;
  // ambient redraws pause while a sheet slides in or out, so the slide starts on time even on older iPads
  if (ambient && t >= (S.quietUntil || 0) && t - S.lastRenderT >= 1000 / fpsCap) S.needsRender = true;
  if (ambient) { M.wind.uTime.value += dt; M.wind.uWind.value = S.motion ? (atmo.windStrength || 1) : 0; atmo.tick(dt, camera.position); builder.animateEffects(dt, t / 1000, atmo.windStrength || 1); }
  if (atmo.particles) { const inside = rig.mode === 'walk' && S.analysis.floors.some((fa) => fa.rooms.some((r) => pointInPolygon({ x: camera.position.x, z: camera.position.z }, r.polygon))); atmo.particles.visible = !inside; }
  if (S.needsRender) { S.needsRender = false; S.lastRenderT = t; if (fx.enabled) fx.render(); else renderer.render(scene, camera); updateLabels(); }
}
document.addEventListener('visibilitychange', () => { if (document.hidden) { if (S.dirtyTimer) saveNow(); } else { lastT = performance.now(); S.needsRender = true; } });
// Walking: the eye follows floors and stairs. Candidates are every floor whose rooms contain the point
// plus every stair ramp; the one nearest the current base height wins, so you walk up a stair naturally.
function walkSurfaceAt(x, z, currentBase) {
  const p = S.project; const cands = [{ y: 0, floor: 0 }];
  S.analysis.floors.forEach((fa, fi) => { if (fa.rooms.some((r) => pointInPolygon({ x, z }, r.polygon))) cands.push({ y: floorY(fi), floor: fi }); });
  for (const it of p.items) {
    const def = C.itemDef(it.type); if (!def?.stair) continue;
    const spec = Model.stairSpec(p, it); const ang = it.rot * Math.PI / 180; const c = Math.cos(ang); const sn = Math.sin(ang); const dx = x - it.x; const dz = z - it.z;
    const lx = dx * c - dz * sn; const lz = dx * sn + dz * c; const h = Model.stairHeightAt(spec, lx, lz);
    if (h != null) cands.push({ y: floorY(it.floor) + h, floor: h > spec.rise * 0.6 ? Math.min(it.floor + 1, p.structure.floors.length - 1) : it.floor, stair: true });
  }
  // inside a stair footprint the stair wins (you are on the steps); otherwise the nearest floor level
  const pool = cands.some((c) => c.stair) ? cands.filter((c) => c.stair) : cands;
  let best = pool[0]; for (const cnd of pool) if (Math.abs(cnd.y - currentBase) < Math.abs(best.y - currentBase)) best = cnd;
  return best;
}
function followWalkSurface(dt) {
  const target = walkSurfaceAt(rig.walkPos.x, rig.walkPos.z, S.walkBase);
  const k = 1 - Math.exp(-dt * 14); const prev = S.walkBase; S.walkBase += (target.y - S.walkBase) * k;
  if (Math.abs(S.walkBase - prev) > 1e-4) S.needsRender = true;
  rig.walkPos.y = S.walkBase + rig.eyeHeight;
  if (target.floor !== S.walkFloor) { S.walkFloor = target.floor; updateWalkFloorLabel(); }
  // crisper interior shadows: keep the shadow camera on the walker
  if (rig.walkPos.distanceToSquared(atmo.focus) > 15 * 15) atmo.setFocus(new THREE.Vector3(rig.walkPos.x, 0, rig.walkPos.z), 40);
}

// --------------------------------------------------------------- lifecycle
function startProject(p) {
  S.project = Model.migrate(p); S.undo = []; S.redo = []; S.selection = null; S.floor = 0; S.roofVisible = true; S.placing = null; S.lastGroundKey = ''; S.lastEnvKey = '';
  if (!VIEWS.find((v) => v.id === S.view) || (VIEWS.find((v) => v.id === S.view).feature && !has(VIEWS.find((v) => v.id === S.view).feature))) S.view = 'finished';
  $('setup').hidden = true; $('editor').hidden = false; resize();
  buildTopbar(); buildRail(); buildFab(); setTool('select');
  rebuildAll();
  const bb = S.analysis.floors[0].bbox;
  if (bb) { rig.frame(bb, 1.9); rig.goalTheta = Math.PI * 0.18; rig.goalPhi = Math.PI * 0.3; } else { rig.goalTarget.set(0, 0, 0); rig.goalDistance = 90; rig.goalPhi = Math.PI * 0.28; }
  rig.jumpToGoal(); closeSheet();
  toast(p.sample ? 'Sample project — change anything' : 'Drag on the blueprint to draw your first wall');
  scheduleSave();
}
function snapshot() { return JSON.stringify(S.project); }
function commit() { S.undo.push(snapshot()); if (S.undo.length > 60) S.undo.shift(); S.redo.length = 0; Model.touch(S.project); rebuildAll(); scheduleSave(); updateUndoButtons(); }
function undo() { if (!S.undo.length) return; S.redo.push(snapshot()); S.project = Model.migrate(JSON.parse(S.undo.pop())); S.selection = null; rebuildAll(); scheduleSave(); updateUndoButtons(); closeSheet(); }
function redo() { if (!S.redo.length) return; S.undo.push(snapshot()); S.project = Model.migrate(JSON.parse(S.redo.pop())); S.selection = null; rebuildAll(); scheduleSave(); updateUndoButtons(); closeSheet(); }
function updateUndoButtons() { document.querySelectorAll('[data-act=undo]').forEach((b) => { b.disabled = !S.undo.length; }); document.querySelectorAll('[data-act=redo]').forEach((b) => { b.disabled = !S.redo.length; }); }
function saveNow() { clearTimeout(S.dirtyTimer); S.dirtyTimer = 0; if (!S.project) return; store.set('gw.project', snapshot()); store.set('gw.recent', JSON.stringify({ name: S.project.name, updatedAt: S.project.updatedAt, mode: S.project.settings.mode })); }
function scheduleSave() { clearTimeout(S.dirtyTimer); S.dirtyTimer = setTimeout(saveNow, 400); }
// iPhone/iPad freeze timers the moment you switch apps or lock the screen, so a save still waiting on its
// short delay is written right away when the page is hidden.
window.addEventListener('pagehide', () => { if (S.dirtyTimer) saveNow(); });
function snowCover() { const p = S.project; return p.env.season === 'winter' ? region().winterSnow !== false : p.env.weather === 'snow'; }

// ------------------------------------------------------------------ rebuild
function rebuildAll() {
  const p = S.project;
  S.floor = clamp(S.floor, 0, p.structure.floors.length - 1);
  S.analysis = Model.analyzeProject(p);
  S.roofs = buildRoofs(p, S.analysis.floors, (i) => Model.floorElevation(p, i), (key) => Model.roofFor(p, key));
  const base = floorY(0) - Model.floorElevation(p, 0);
  for (const r of S.roofs) { for (const key of ['planes', 'fills', 'soffits']) for (const pl of r[key]) for (const q of pl.pts) q.y += base; for (const key of ['edges', 'rafters', 'hipRafters', 'joists']) for (const e of r[key]) { e.a.y += base; e.b.y += base; } if (r.ridge) { r.ridge.a.y += base; r.ridge.b.y += base; } r.yTop += base; r.eaveY += base; r.ridgeY += base; r.peakY += base; }
  S.estimate = null;
  updateEnvironment(true);
  rebuildScene();
  updateFloorButton();
}
function refreshGhosts() { if (S.ghostsVisible && S.tool !== 'wall' && !S.walkAll) builder.buildGhostWalls(S.project, S.analysis, S.floor); else builder.clear(['ghost']); }
function sceneMaxFloor() { return S.walkAll ? S.project.structure.floors.length - 1 : S.floor; }
function itemOpts() {
  const skeleton = S.view === 'framing' || S.view === 'foundation' || S.view === 'insulation';
  return { landscape: !skeleton, furniture: S.view === 'furnished', vehicles: S.view === 'furnished', lights: S.view === 'furnished' || S.view === 'finished', systems: (S.view === 'furnished' || S.view === 'insulation') && has('systems') && S.systemsVisible, vents: !skeleton, snowCover: snowCover(), season: S.project.env.season, roofs: S.roofs, smoke: S.motion, roofVisible: (S.roofVisible || S.walkAll) && sceneMaxFloor() === S.project.structure.floors.length - 1 };
}
function rebuildScene() {
  const p = S.project; const view = S.view; const maxFloor = sceneMaxFloor();
  const topFloor = p.structure.floors.length - 1;
  const showRoof = (S.roofVisible || S.walkAll) && maxFloor === topFloor;
  const skeleton = view === 'framing' || view === 'foundation' || view === 'insulation';
  builder.updateRevealMask(p, S.analysis, skeleton ? 'skeleton' : 'finished');
  builder.buildFoundation(p, S.analysis);
  if (view === 'framing' || view === 'insulation') builder.buildFraming(p, S.analysis, S.roofs, maxFloor); else builder.clear(['framing']);
  if (view === 'insulation') builder.buildInsulation(p, S.analysis, maxFloor); else builder.clear(['insulation']);
  if (view === 'finished' || view === 'furnished') {
    builder.buildWalls(p, S.analysis, maxFloor);
    builder.buildFloors(p, S.analysis, S.roofs, maxFloor, showRoof || S.walkAll);
    if (showRoof) builder.buildRoofs(p, S.roofs, maxFloor, { snowCover: snowCover() }); else builder.clear(['roof']);
  } else { builder.clear(['walls', 'floors', 'roof']); }
  builder.buildItems(p, S.analysis, maxFloor, itemOpts());
  builder.buildGrass(p, S.analysis, { terrain: region().terrain, snowCover: snowCover(), season: p.env.season, density: skeleton ? 0.35 : S.quality === 'low' ? 0.5 : 1 });
  refreshGhosts();
  rebuildShafts();
  buildPlanLines();
  const pts = p.structure.walls.flatMap((w) => [w.a, w.b]); const bb = bbox(pts);
  if (bb) atmo.setFocus(new THREE.Vector3(bb.cx, 0, bb.cz), Math.max(bb.w, bb.d) * 0.75 + 30); else atmo.setFocus(new THREE.Vector3(0, 0, 0), 60);
  refreshSelectionOverlay(); applyLights(); S.needsRender = true;
}
function applyLights() { const nightness = atmo.cols ? atmo.cols.night : 0; builder.applyLights(rig.focus, nightness, S.quality === 'low' ? 4 : 8, S.lightsOn); }
// Sun shafts through the windows, in the finished views only (they are the "ray traced" look on a phone budget).
function rebuildShafts() {
  const interior = S.view === 'finished' || S.view === 'furnished';
  if (!interior || !atmo.sunDir || S.quality === 'low') { builder.clear(['shafts']); return; }
  const strength = Math.max(0, Math.min(1, (atmo.sun.intensity / 3.2))) * (weatherDef(S.project.env.weather).sun ?? 1);
  builder.buildSunShafts(S.project, S.analysis, atmo.sunDir, strength, atmo.sun.color, sceneMaxFloor());
}
function buildPlanLines() {
  const g = builder.groups.overlay; const old = g.getObjectByName('plan'); if (old) { g.remove(old); old.geometry.dispose(); }
  const walls = Model.wallsOnFloor(S.project, S.floor); if (!walls.length) return;
  const show = S.view === 'foundation' || S.view === 'framing' || S.view === 'insulation' || S.tool === 'wall';
  if (!show) return;
  const y = floorY() + 0.03;
  const pts = walls.flatMap((w) => [new THREE.Vector3(w.a.x, y, w.a.z), new THREE.Vector3(w.b.x, y, w.b.z)]);
  const line = new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(pts), M.lineMaterial('#ffffff', 0.85)); line.name = 'plan'; g.add(line);
}

// --------------------------------------------------------------- environment
function updateEnvironment(force = false) {
  const p = S.project; const r = region(); const w = weatherDef(p.env.weather); const snow = snowCover();
  const lot = C.LOT_SIZES.find((l) => l.id === p.settings.lotId) || C.LOT_SIZES[2];
  const groundKey = [r.terrain, p.env.season, snow, lot.id].join('|');
  if (groundKey !== S.lastGroundKey) { S.lastGroundKey = groundKey; builder.buildGround(p, r.terrain, p.env.season, snow, lot.sideFt); }
  const key = [p.env.season, p.env.hour, p.env.weather, p.settings.northDeg, r.id, S.lightsOn].join('|');
  if (key === S.lastEnvKey && !force) return; S.lastEnvKey = key;
  atmo.update({ lat: p.settings.hazards.latitude ?? r.lat, day: dayOfYearFor(p.env.season), hour: p.env.hour, weather: w, northDeg: p.settings.northDeg, snowCover: snow });
  atmo.setParticles(w.particles || null, Tex);
  clearTimeout(S.envTimer); S.envTimer = setTimeout(() => { atmo.refreshEnvironment(); S.needsRender = true; }, 120);
  applyLights(); rebuildShafts(); S.needsRender = true;
}

// --------------------------------------------------------------- token bars
function tok(id, icon, label, onclick, extra = {}) {
  const b = h('button', { class: `tok ${extra.class || ''}`, 'data-act': id, 'aria-label': label, onclick: (e) => { e.stopPropagation(); onclick(e); }, html: `${icon}<span class="lbl">${label}</span>` });
  if (extra.disabled) b.disabled = true; return b;
}
function barExpand(bar) {
  bar.addEventListener('click', (e) => { if (e.target === bar) { bar.classList.toggle('open'); clearTimeout(bar._t); if (bar.classList.contains('open')) bar._t = setTimeout(() => bar.classList.remove('open'), 4000); } });
}
function buildTopbar() {
  const bar = $('topbar'); bar.innerHTML = '';
  bar.append(tok('menu', ICONS.menu, 'Menu', openMenuSheet));
  bar.append(h('span', { class: 'gap' }));
  for (const v of VIEWS) { if (v.feature && !has(v.feature)) continue; bar.append(tok(`view-${v.id}`, ICONS[v.id], v.name, () => setView(v.id), { class: v.id === S.view ? 'on' : '' })); }
  bar.append(h('span', { class: 'gap' }));
  if (has('floors')) bar.append(tok('floor', `<span>F${S.floor + 1}</span>`, 'Floor', cycleFloor, { class: 'mono' }));
  bar.append(tok('roof', ICONS.roof, 'Roof on / off', toggleRoof, { class: `narrow-hide ${S.roofVisible ? 'on' : ''}` }));
  bar.append(tok('undo', ICONS.undo, 'Undo', undo, { class: 'narrow-hide' }), tok('redo', ICONS.redo, 'Redo', redo, { class: 'narrow-hide' }));
  if (!bar._wired) { barExpand(bar); bar._wired = true; }
  updateUndoButtons();
}
function buildRail() {
  const rail = $('rail'); rail.innerHTML = '';
  for (const t of TOOLS) { if (t.id === 'sep') { rail.append(h('div', { class: 'sep' })); continue; } if (t.feature && !has(t.feature)) continue; rail.append(tok(`tool-${t.id}`, ICONS[t.id], t.name, () => setTool(t.id), { class: t.id === S.tool ? 'on' : '' })); }
  if (!rail._wired) { barExpand(rail); rail._wired = true; }
}
function buildFab() {
  const fab = $('fab'); fab.innerHTML = '';
  fab.append(tok('plan', ICONS.plan, 'Plan view', () => { if (rig.goalPhi < 0.1) rig.setTilt(Math.PI * 0.3); else rig.setTop(); S.needsRender = true; }));
  fab.append(tok('fit', ICONS.fit, 'Fit to house', () => { const bb = S.analysis.floors[S.floor].bbox || S.analysis.floors[0].bbox; if (bb) rig.frame(bb, 1.9); else { rig.goalTarget.set(0, 0, 0); rig.goalDistance = 90; } S.needsRender = true; }));
  if (window.innerWidth <= 640) { fab.append(tok('roof', ICONS.roof, 'Roof on / off', toggleRoof, { class: S.roofVisible ? 'on' : '' }), tok('undo', ICONS.undo, 'Undo', undo), tok('redo', ICONS.redo, 'Redo', redo)); }
  if (!fab._wired) { barExpand(fab); fab._wired = true; }
  updateUndoButtons();
}
function setView(id) { S.view = id; buildTopbar(); rebuildScene(); closeSheetIf(['inspector']); setHint(); }
function updateFloorButton() { document.querySelectorAll('[data-act=floor] span').forEach((s) => { s.textContent = `F${S.floor + 1}`; }); document.querySelectorAll('[data-act=roof]').forEach((b) => b.classList.toggle('on', S.roofVisible)); }
function setFloor(i) { S.floor = clamp(i, 0, S.project.structure.floors.length - 1); S.selection = null; rebuildScene(); updateFloorButton(); closeSheetIf(['inspector']); }
function cycleFloor() { const n = S.project.structure.floors.length; if (n === 1) { openSettingsSheet('floors'); return; } setFloor((S.floor + 1) % n); toast(`${S.project.structure.floors[S.floor].name}${S.floor > 0 ? ' · tap a blue ghost wall to build on top of the floor below' : ''}`, 2600); }
function toggleRoof() { S.roofVisible = !S.roofVisible; rebuildScene(); updateFloorButton(); toast(S.roofVisible ? 'Roof shown' : 'Roof hidden'); }

// ------------------------------------------------------------------- tools
function setTool(id) {
  const t = TOOLS.find((x) => x.id === id); if (!t) return;
  if (id === 'sun') { openSunSheet(); return; }
  if (id === 'export') { openExportSheet(); return; }
  if (id === 'exterior') { openExteriorSheet(); return; }
  if (id === 'walk') { enterWalk(); return; }
  if (id === 'place') { openItemsSheet(); }
  S.tool = id; S.draw = null; if (id !== 'place') S.placing = null;
  if (['wall', 'door', 'window', 'opening'].includes(id)) hideRoofForEditing();
  if (id !== 'select') { S.selection = null; refreshSelectionOverlay(); if (id !== 'place') closeSheet(); }
  document.querySelectorAll('#rail .tok').forEach((b) => b.classList.toggle('on', b.dataset.act === `tool-${id}`));
  $('rail').classList.remove('open');
  buildPlanLines(); clearGhost(); refreshGhosts(); setHint(); S.needsRender = true;
}
function hideRoofForEditing() {
  if (!S.roofVisible || S.view === 'foundation' || S.view === 'framing' || S.view === 'insulation') return;
  S.roofVisible = false; rebuildScene(); updateFloorButton();
  if (!S.roofToastShown) { S.roofToastShown = true; toast('Roof hidden while you edit · tap the roof button to show it', 2600); }
}
function setHint(text) {
  const t = TOOLS.find((x) => x.id === S.tool);
  let msg = text || t?.hint || '';
  if (S.tool === 'place' && S.placing) msg = `Tap to place <b>${C.itemDef(S.placing).name}</b> · pick Select when done`;
  if (S.tool === 'wall' && S.draw) msg = 'Release to finish the wall · it snaps to 45° and the grid';
  $('hint').innerHTML = msg; $('hint').hidden = !msg || rig.mode === 'walk';
}

// --------------------------------------------------------------- picking
function ndcRay(pt) { raycaster.setFromCamera(new THREE.Vector2(pt.nx, pt.ny), camera); return raycaster; }
function groundPoint(pt, y = floorY()) { const ray = ndcRay(pt).ray; const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -y); const out = new THREE.Vector3(); return ray.intersectPlane(plane, out) ? { x: out.x, z: out.z } : null; }
function pick(pt, filter) { const rc = ndcRay(pt); const list = builder.pickables.filter((o) => o.visible !== false && (!filter || filter(o))); const hits = rc.intersectObjects(list, false); return hits.length ? hits[0] : null; }
function pickHandles(pt) { if (!overlay.handles.length) return null; const hits = ndcRay(pt).intersectObjects(overlay.handles, false); return hits.length ? hits[0].object : null; }

function pointerDown() {}
// Free-angle drawing snaps to 45° steps; the default "right angles only" keeps every wall square to the grid.
function snapWallEnd(a, b) { const step = S.project.settings.gridStep; return S.project.settings.orthoSnap !== false ? snapOrtho(a, b, step) : snapAngle(a, b, step); }
function dragStart(pt, p) {
  if (rig.mode === 'walk') return 'look';
  if (p.button === 2 || p.shift || p.button === 1) return 'pan';
  if (S.tool === 'wall') { const g = groundPoint(pt); if (!g) return 'camera'; const sp = snapPoint(g, Model.wallsOnFloor(S.project, S.floor), S.project.settings.gridStep, { magnet: magnetFt() }); S.draw = { a: sp, b: sp }; setHint(); return 'draw'; }
  if (S.tool === 'select') {
    const hnd = pickHandles(pt); if (hnd) { S.dragHandle = hnd.userData; return 'handle'; }
    if (S.selection?.type === 'item') { const hit = pick(pt, (o) => o.userData.type === 'item'); if (hit && hit.object.userData.itemId === S.selection.itemId) { S.dragItem = Model.getItem(S.project, S.selection.itemId); S.dragStartState = snapshot(); return 'move-item'; } }
  }
  return 'camera';
}
function drag(kind, pt, dx, dy) {
  if (kind === 'look') { rig.look(dx, dy); S.needsRender = true; return; }
  if (kind === 'camera') { rig.orbit(dx, dy); return; }
  if (kind === 'pan') { rig.pan(dx, dy, renderer.domElement.clientHeight); return; }
  if (kind === 'draw' && S.draw) { const g = groundPoint(pt); if (!g) return; const walls = Model.wallsOnFloor(S.project, S.floor); let b = snapPoint(g, walls, S.project.settings.gridStep, { magnet: magnetFt() }); if (b.kind === 'grid') b = snapWallEnd(S.draw.a, b); S.draw.b = b; updateGhost(); return; }
  if (kind === 'handle' && S.dragHandle) { const g = groundPoint(pt); if (!g) return; const walls = Model.wallsOnFloor(S.project, S.floor).filter((w) => w.id !== S.dragHandle.wallId); const sp = snapPoint(g, walls, S.project.settings.gridStep, { magnet: magnetFt() }); if (!S.handleStart) S.handleStart = snapshot(); Model.moveWallEnd(S.project, S.dragHandle.wallId, S.dragHandle.end, sp); S.analysis = Model.analyzeProject(S.project); refreshSelectionOverlay(); buildPlanLines(); S.needsRender = true; return; }
  if (kind === 'move-item' && S.dragItem) { const def = C.itemDef(S.dragItem.type); const g = groundPoint(pt, def.outdoor ? 0 : floorY(S.dragItem.floor)); if (!g) return; placeItemAt(S.dragItem, g, def); builder.buildItems(S.project, S.analysis, S.floor, itemOpts()); applyLights(); refreshSelectionOverlay(); S.needsRender = true; }
}
function dragEnd(kind, pt, cancelled) {
  if (kind === 'draw' && S.draw) { const { a, b } = S.draw; S.draw = null; clearGhost(); if (!cancelled && dist(a, b) >= 1) { Model.addWall(S.project, S.floor, a, b); commit(); } setHint(); return; }
  if (kind === 'handle') { if (S.handleStart) { S.undo.push(S.handleStart); S.redo.length = 0; S.handleStart = null; } S.dragHandle = null; Model.touch(S.project); rebuildAll(); scheduleSave(); updateUndoButtons(); return; }
  if (kind === 'move-item') { if (S.dragStartState) { S.undo.push(S.dragStartState); S.redo.length = 0; S.dragStartState = null; } S.dragItem = null; Model.touch(S.project); rebuildScene(); scheduleSave(); updateUndoButtons(); }
}
function pinch(g) { if (rig.mode === 'walk') return; rig.zoom(1 / g.scale); rig.pan(g.dx, g.dy, renderer.domElement.clientHeight); rig.goalTheta += g.rot; S.needsRender = true; }
function wheel(e) { if (rig.mode === 'walk') return; rig.zoom(Math.exp(e.deltaY * 0.0015)); S.needsRender = true; }
function onHover(pt) { if (S.tool === 'wall' && S.draw && S.draw.clickMode) drag('draw', pt, 0, 0); }

function tap(pt) {
  if (rig.mode === 'walk') {
    const hit = pick(pt, (o) => o.userData.type === 'opening' && o.userData.kind === 'door');
    if (hit) { toggleDoor(hit.object.userData.openingId); }
    return;
  }
  if (S.tool === 'wall') {
    const g = groundPoint(pt); if (!g) return;
    const walls = Model.wallsOnFloor(S.project, S.floor); const sp = snapPoint(g, walls, S.project.settings.gridStep, { magnet: magnetFt() });
    if (!S.draw) { S.draw = { a: sp, b: sp, clickMode: true }; updateGhost(); setHint('Tap where the wall ends'); }
    else { let b = sp; if (b.kind === 'grid') b = snapWallEnd(S.draw.a, b); const a = S.draw.a; S.draw = null; clearGhost(); if (dist(a, b) >= 1) { Model.addWall(S.project, S.floor, a, b); commit(); S.draw = { a: b, b, clickMode: true }; updateGhost(); setHint('Tap for the next corner · pick Select to stop'); } else setHint(); }
    return;
  }
  if (S.tool === 'door' || S.tool === 'window' || S.tool === 'opening') {
    const hit = pick(pt, (o) => o.userData.type === 'wallface'); if (!hit) { toast('Tap on a wall'); return; }
    const w = Model.getWall(S.project, hit.object.userData.wallId); const { dir } = wallVec(w);
    const along = (hit.point.x - w.a.x) * dir.x + (hit.point.z - w.a.z) * dir.z;
    const o = Model.addOpening(S.project, w.id, along, S.tool, null);
    if (!o) { toast('Wall too short for that'); return; }
    commit(); select({ type: 'opening', wallId: w.id, openingId: o.id, floor: S.floor }, hit.point);
    return;
  }
  if (S.tool === 'place') {
    if (!S.placing) { openItemsSheet(); return; }
    const def = C.itemDef(S.placing); const g = groundPoint(pt, def.outdoor ? 0 : floorY()); if (!g) return;
    const it = Model.addItem(S.project, S.placing, S.floor, g.x, g.z, 0);
    placeItemAt(it, g, def); commit(); return;
  }
  const hit = pick(pt);
  if (!hit || hit.object.userData.type === 'ground') { S.selection = null; refreshSelectionOverlay(); closeSheetIf(['inspector']); return; }
  const u = hit.object.userData;
  if (u.type === 'ghostwall') { Model.stackWall(S.project, u.wallId, S.floor); commit(); toast('Wall stacked on this floor'); return; }
  select({ ...u }, hit.point);
}
function toggleDoor(openingId) { const f = Model.findOpening(S.project, openingId); if (!f) return; f.opening.open = !f.opening.open; builder.setDoorOpen(openingId, f.opening.open); scheduleSave(); S.needsRender = true; }
function placeItemAt(it, g, def) {
  const step = 0.25; it.x = Math.round(g.x / step) * step; it.z = Math.round(g.z / step) * step;
  if (def.stair) { const spec = Model.stairSpec(S.project, it); it.d = Math.round(spec.d * 4) / 4; }
  if (def.wall) {
    const near = Model.nearestWall(Model.wallsOnFloor(S.project, it.floor), g, 2.5);
    if (near) {
      const { dir } = wallVec(near.wall); const left = perp(dir); const info = S.analysis.floors[it.floor].wallInfo.get(near.wall.id);
      const dims = Model.wallDims(info.kind); const side = near.side; const n = side === 'left' ? left : { x: -left.x, z: -left.z };
      const off = (info.outward === side || info.outward === 'both') ? dims.offsetOut + dims.studD / 2 + 0.02 : dims.offsetIn + dims.studD / 2 + 0.02;
      const depth = (it.d || def.d) / 2;
      it.x = near.point.x + n.x * (off + depth); it.z = near.point.z + n.z * (off + depth);
      it.rot = Math.round((Math.atan2(n.x, n.z) * 180) / Math.PI); it.wallMount = true;
    }
  }
}

// ---------------------------------------------------------- ghost + labels
function updateGhost() {
  clearGhost(); if (!S.draw) return;
  const { a, b } = S.draw; const L = dist(a, b); if (L < 0.1) return;
  const H = Model.floorHeight(S.project, S.floor); const y = floorY();
  const m = new THREE.Mesh(new THREE.BoxGeometry(L, H, 0.5), M.ghostMaterial('#f3a83c'));
  m.position.set((a.x + b.x) / 2, y + H / 2, (a.z + b.z) / 2); m.rotation.y = Math.atan2(-(b.z - a.z), b.x - a.x);
  builder.groups.overlay.add(m); overlay.ghost = m; S.needsRender = true;
}
function clearGhost() { if (overlay.ghost) { builder.groups.overlay.remove(overlay.ghost); overlay.ghost.geometry.dispose(); overlay.ghost = null; S.needsRender = true; } }
const labelPool = [];
function updateLabels() {
  const host = $('labels'); const items = []; const y = floorY(); const vp = new THREE.Vector3();
  const project3 = (x, yy, z) => { vp.set(x, yy, z).project(camera); if (vp.z > 1) return null; return { x: (vp.x + 1) / 2 * host.clientWidth, y: (1 - vp.y) / 2 * host.clientHeight }; };
  if (S.draw) { const { a, b } = S.draw; const L = dist(a, b); if (L > 0.1) { const p = project3((a.x + b.x) / 2, y + Model.floorHeight(S.project, S.floor) + 1, (a.z + b.z) / 2); if (p) items.push({ p, text: ftIn(L), cls: 'ghost' }); } }
  const skeleton = S.view === 'foundation' || S.view === 'framing' || S.view === 'insulation';
  const showDims = S.tool === 'wall' || S.selection?.type === 'wallface' || skeleton;
  if (showDims && rig.mode !== 'walk') for (const w of Model.wallsOnFloor(S.project, S.floor)) { const L = dist(w.a, w.b); const p = project3((w.a.x + w.b.x) / 2, y + 0.3, (w.a.z + w.b.z) / 2); if (p) items.push({ p, text: ftIn(L), cls: S.selection?.wallId === w.id ? 'ghost' : '' }); }
  if (!skeleton && rig.mode !== 'walk' && rig.distance < 260) for (const r of S.analysis.floors[S.floor].rooms) { const p = project3(r.centroid.x, y + 0.5, r.centroid.z); if (p) items.push({ p, text: `${r.name} · ${Math.round(r.area)} sq ft`, cls: 'room' }); }
  // the selected item shows its own measurements along its edges
  if (S.selection?.type === 'item' && rig.mode !== 'walk') {
    const it = Model.getItem(S.project, S.selection.itemId); const def = it && C.itemDef(it.type);
    if (def) {
      const w = it.w || def.w; const d = it.d || def.d; const hgt = (it.h || def.h) * (it.scale || 1); const ang = it.rot * Math.PI / 180; const c = Math.cos(ang); const sn = Math.sin(ang);
      const yy = def.outdoor ? 0.3 : floorY(it.floor) + 0.3; const toW = (lx, lz) => ({ x: it.x + lx * c + lz * sn, z: it.z - lx * sn + lz * c });
      const f = toW(0, d / 2 + 0.6); const sd = toW(w / 2 + 0.6, 0); const pf = project3(f.x, yy, f.z); const ps = project3(sd.x, yy, sd.z); const ph = project3(it.x, yy + hgt + 0.6, it.z);
      if (pf) items.push({ p: pf, text: `${ftIn(w)} wide`, cls: 'ghost' }); if (ps) items.push({ p: ps, text: `${ftIn(d)} deep`, cls: 'ghost' }); if (ph && hgt > 0.3) items.push({ p: ph, text: `${ftIn(hgt)} tall`, cls: 'ghost' });
    }
  }
  if (S.selection?.type === 'opening' && rig.mode !== 'walk') { const f = Model.findOpening(S.project, S.selection.openingId); if (f) { const c = Model.openingWorldCenter(f.wall, f.opening); const p = project3(c.x, floorY(f.wall.floor) + f.opening.sill + f.opening.height + 0.8, c.z); if (p) items.push({ p, text: `${ftIn(f.opening.width)} × ${ftIn(f.opening.height)}${f.opening.sill ? ` · sill ${ftIn(f.opening.sill)}` : ''}`, cls: 'ghost' }); } }
  // nudge overlapping labels apart (rooms + dims), so small rooms don't pile their names on top of each other
  const placed = [];
  for (const it of items.sort((a, b) => a.p.y - b.p.y)) {
    const w = it.text.length * 6.6 + 18, hh = 24; let tries = 0;
    while (tries++ < 8) {
      const hit = placed.find((o) => Math.abs(o.p.x - it.p.x) < (o.w + w) / 2 && Math.abs(o.p.y - it.p.y) < hh);
      if (!hit) break; it.p.y = hit.p.y + hh + 2;
    }
    placed.push({ p: it.p, w });
  }
  while (labelPool.length < items.length) { const d = h('div', { class: 'dim' }); host.append(d); labelPool.push(d); }
  labelPool.forEach((d, i) => { const it = items[i]; if (!it) { d.hidden = true; return; } d.hidden = false; d.className = `dim ${it.cls}`; d.textContent = it.text; d.style.left = `${it.p.x}px`; d.style.top = `${it.p.y}px`; });
}

// ---------------------------------------------------------------- selection
function select(sel, point) { S.selection = sel; S.lastHit = point ? { x: point.x, y: point.y, z: point.z } : null; refreshSelectionOverlay(); openInspector(); }
function refreshSelectionOverlay() {
  const g = builder.groups.overlay;
  if (overlay.highlight) { g.remove(overlay.highlight); overlay.highlight = null; }
  for (const hd of overlay.handles) g.remove(hd); overlay.handles = [];
  const sel = S.selection; S.needsRender = true; if (!sel) return;
  const match = (o) => { const u = o.userData; if (sel.type === 'wallface') return u.type === 'wallface' && u.wallId === sel.wallId && u.side === sel.side; if (sel.type === 'item') return u.type === 'item' && u.itemId === sel.itemId; if (sel.type === 'opening') return u.type === 'opening' && u.openingId === sel.openingId; if (sel.type === 'room') return u.type === 'room' && u.roomKey === sel.roomKey; if (sel.type === 'roof' || sel.type === 'gable') return (u.type === 'roof' || u.type === 'gable') && u.key === sel.key; if (sel.type === 'foundation') return u.type === 'foundation'; return false; };
  const targets = builder.pickables.filter(match);
  if (!targets.length) { S.selection = null; return; }
  if (sel.type === 'item' || sel.type === 'opening') { const b = new THREE.Box3(); for (const t of targets) b.expandByObject(t); overlay.highlight = new THREE.Box3Helper(b, 0xf3a83c); g.add(overlay.highlight); }
  else { const grp = new THREE.Group(); for (const t of targets) { const m = new THREE.Mesh(t.geometry, M.highlightMaterial()); m.position.copy(t.position); m.rotation.copy(t.rotation); m.scale.copy(t.scale); grp.add(m); } overlay.highlight = grp; g.add(grp); }
  if (sel.type === 'wallface' && S.tool === 'select') {
    const w = Model.getWall(S.project, sel.wallId); if (!w) return; const y = floorY() + Model.floorHeight(S.project, S.floor) + 0.2;
    for (const end of ['a', 'b']) { const s = new THREE.Mesh(new THREE.SphereGeometry(0.75, 12, 10), M.ghostMaterial('#f3a83c')); s.material = s.material.clone(); s.material.opacity = 0.95; s.position.set(w[end].x, y, w[end].z); s.userData = { wallId: w.id, end }; g.add(s); overlay.handles.push(s); }
  }
}

// --------------------------------------------------------------------- sheet
const SHEET_DETENTS = { inspector: 'half', items: 'half', roof: 'half', exterior: 'half', sun: 'half', foundation: 'half', export: 'full', menu: 'full', settings: 'full' };
function openSheet(kind, title, bodyNodes, detent) {
  const sh = $('sheet'); const wasKind = sh.dataset.kind; sh.dataset.kind = kind; $('sheetTitle').textContent = title;
  const body = $('sheetBody'); const keepScroll = wasKind === kind && sh.classList.contains('open') ? body.scrollTop : 0;
  body.innerHTML = ''; body.append(...bodyNodes.filter(Boolean)); body.scrollTop = keepScroll;
  // a re-render of the same sheet keeps the height you dragged it to; a new sheet starts at its usual height
  if (!(wasKind === kind && sh.classList.contains('open'))) { setSheetDetent(detent || SHEET_DETENTS[kind] || 'half'); S.quietUntil = performance.now() + 320; }
  sh.classList.add('open');
}
function closeSheet() { if ($('sheet').classList.contains('open')) S.quietUntil = performance.now() + 320; $('sheet').classList.remove('open'); $('sheet').dataset.kind = ''; $('sheet').style.height = ''; }
function setSheetDetent(d) { const sh = $('sheet'); sh.dataset.detent = d; sh.style.height = ''; S.quietUntil = performance.now() + 320; }
function detentHeights() { const H = window.innerHeight; return { mini: 92, half: H * 0.46, full: Math.min(H * 0.86, H - 70) }; }
// Drag the grip or title bar to resize the sheet; it rests at mini / half / full. A tap on the grip cycles them.
(function wireSheetDrag() {
  const grip = $('sheetGrip'); const sh = $('sheet'); let drag = null;
  grip.addEventListener('pointerdown', (e) => { if (e.target.closest('#sheetClose') || window.innerWidth >= 900) return; drag = { y0: e.clientY, h0: sh.getBoundingClientRect().height, t0: performance.now(), moved: false }; grip.setPointerCapture(e.pointerId); sh.classList.add('dragging'); });
  grip.addEventListener('pointermove', (e) => { if (!drag) return; const dy = e.clientY - drag.y0; if (Math.abs(dy) > 4) drag.moved = true; const hts = detentHeights(); sh.style.height = `${clamp(drag.h0 - dy, hts.mini, hts.full)}px`; });
  const end = (e) => {
    if (!drag) return; sh.classList.remove('dragging'); const hts = detentHeights(); const order = ['mini', 'half', 'full'];
    if (!drag.moved) { const i = order.indexOf(sh.dataset.detent || 'half'); setSheetDetent(order[(i + 1) % 3]); drag = null; return; }
    const h = sh.getBoundingClientRect().height; const v = (drag.y0 - e.clientY) / Math.max(1, performance.now() - drag.t0); // px/ms, up is positive
    let best = order.reduce((a, b) => (Math.abs(hts[b] - h) < Math.abs(hts[a] - h) ? b : a), 'half');
    if (Math.abs(v) > 0.6) { const i = order.indexOf(best); best = order[clamp(i + (v > 0 ? 1 : -1), 0, 2)]; }
    setSheetDetent(best); drag = null;
  };
  grip.addEventListener('pointerup', end); grip.addEventListener('pointercancel', end);
})();
function closeSheetIf(kinds) { if (kinds.includes($('sheet').dataset.kind)) closeSheet(); }
$('sheetClose').addEventListener('click', () => { const k = $('sheet').dataset.kind; closeSheet(); if (k === 'inspector') { S.selection = null; refreshSelectionOverlay(); } });
function swatchRow(palette, current, onPick) { return h('div', { class: 'swatches' }, palette.map((c) => h('button', { class: `sw ${current && current.toLowerCase() === c.hex.toLowerCase() ? 'on' : ''}`, style: `background:${c.hex}`, title: c.name, 'aria-label': c.name, onclick: () => onPick(c.hex) }))); }
function chipRow(options, current, onPick) { return h('div', { class: 'chips' }, options.map((o) => h('button', { class: `chip ${o.id === current ? 'on' : ''}`, onclick: () => onPick(o.id) }, o.name))); }
function sliderRow(label, value, min, max, step, fmt, onInput, onChange) {
  const val = h('b', { class: 'mono' }, fmt(value));
  const input = h('input', { type: 'range', class: 'slider', min, max, step, value, oninput: (e) => { val.textContent = fmt(+e.target.value); onInput?.(+e.target.value); }, onchange: (e) => onChange?.(+e.target.value) });
  return h('div', { class: 'field' }, h('div', { class: 'row' }, h('span', { class: 'grow' }, label), val), input);
}
function section(title, ...nodes) { return h('div', { class: 'field' }, h('div', { class: 'eyebrow' }, title), ...nodes); }
function checkRow(label, checked, onchange) { return h('label', { class: 'check' }, h('input', { type: 'checkbox', checked, onchange: (e) => onchange(e.target.checked) }), label); }

// ---------------------------------------------------------------- inspector
function openInspector() {
  const sel = S.selection; if (!sel) return;
  if (sel.type === 'wallface') return inspectWall(sel);
  if (sel.type === 'opening') return inspectOpening(sel);
  if (sel.type === 'item') return inspectItem(sel);
  if (sel.type === 'room') return inspectRoom(sel);
  if (sel.type === 'roof' || sel.type === 'gable') return openRoofSheet(sel.key);
  if (sel.type === 'foundation') return openFoundationSheet();
}
function inspectWall(sel) {
  const p = S.project; const w = Model.getWall(p, sel.wallId); if (!w) return;
  const fa = S.analysis.floors[w.floor]; const info = fa.wallInfo.get(w.id); const L = Model.wallLength(w);
  const isExtFace = sel.exterior; const sidingDef = C.SIDING.find((s) => s.id === (w.faces?.ext?.type || p.exterior.sidingType)) || C.SIDING[0];
  const nodes = [];
  nodes.push(h('div', { class: 'stats' }, h('div', { class: 'stat' }, h('b', {}, ftIn(L)), h('span', {}, 'length')), h('div', { class: 'stat' }, h('b', {}, ftIn(Model.floorHeight(p, w.floor))), h('span', {}, 'height')), h('div', { class: 'stat' }, h('b', {}, info.kind === 'exterior' ? `2×6 @ ${p.structure.studSpacing}″` : `2×4 @ ${p.structure.studSpacing}″`), h('span', {}, `${info.kind} framing`))));
  nodes.push(section('Add here', h('div', { class: 'row' }, ...['door', 'window', 'opening'].map((k) => h('button', { class: 'btn', onclick: () => { const along = S.lastHit ? (S.lastHit.x - w.a.x) * wallVec(w).dir.x + (S.lastHit.z - w.a.z) * wallVec(w).dir.z : L / 2; const o = Model.addOpening(p, w.id, along, k, null); if (!o) { toast('Wall too short'); return; } commit(); select({ type: 'opening', wallId: w.id, openingId: o.id, floor: w.floor }); } }, k === 'door' ? 'Door' : k === 'window' ? 'Window' : 'Opening')))));
  nodes.push(section('Wall type', chipRow([{ id: 'auto', name: `Auto (${info.exterior ? 'exterior' : 'interior'})` }, { id: 'exterior', name: 'Exterior' }, { id: 'interior', name: 'Interior' }], w.kind, (v) => { w.kind = v; commit(); openInspector(); })));
  if (isExtFace && has('materials') && !sel.stone) {
    const same = !w.faces?.ext;
    nodes.push(section('Siding on this face', checkRow('Same as the rest of the house', same, (on) => { if (on) delete w.faces.ext; else w.faces.ext = { type: p.exterior.sidingType, color: sidingDef.stained ? p.exterior.stainColor : p.exterior.sidingColor }; commit(); openInspector(); }),
      !same && chipRow(C.SIDING, w.faces.ext.type, (id) => { w.faces.ext.type = id; const d = C.SIDING.find((s) => s.id === id); w.faces.ext.color = d.stained ? p.exterior.stainColor : (w.faces.ext.color || p.exterior.sidingColor); commit(); openInspector(); }),
      !same && swatchRow(C.SIDING.find((s) => s.id === w.faces.ext.type)?.stained ? C.STAIN_COLORS : C.SIDING_COLORS, w.faces.ext.color, (hex) => { w.faces.ext.color = hex; commit(); openInspector(); })));
  } else if (sel.stone) {
    nodes.push(section('Stone wainscot', chipRow(C.STONE_VENEER, p.exterior.stone.type, (id) => { p.exterior.stone.type = id; commit(); openInspector(); }), sliderRow('Height', p.exterior.stone.heightFt, 1, 6, 0.25, ftIn, null, (v) => { p.exterior.stone.heightFt = v; commit(); }), h('button', { class: 'btn', onclick: () => { p.exterior.stone.enabled = false; commit(); closeSheet(); } }, 'Remove stone')));
  } else if (has('materials')) {
    const roomIdx = sel.side === 'left' ? info.leftRoom : info.rightRoom; const room = roomIdx != null ? fa.rooms[roomIdx] : null;
    const same = !w.faces?.int;
    nodes.push(section(room ? `Paint · ${room.name}` : 'Paint on this face', checkRow(room ? 'Same as the room' : 'Same as the house', same, (on) => { if (on) delete w.faces.int; else w.faces.int = { color: p.interior.paintColor }; commit(); openInspector(); }),
      !same && swatchRow(C.PAINT_COLORS, w.faces.int.color, (hex) => { w.faces.int.color = hex; commit(); openInspector(); }),
      same && room && swatchRow(C.PAINT_COLORS, room.paint || p.interior.paintColor, (hex) => { p.rooms[room.key] = { ...(p.rooms[room.key] || {}), paint: hex }; commit(); openInspector(); })));
  }
  if (isExtFace && has('sun')) {
    const { dir } = wallVec(w); const left = perp(dir); const n = sel.side === 'left' ? left : { x: -left.x, z: -left.z };
    const win = sunWindows(p.settings.hazards.latitude ?? region().lat, dayOfYearFor(p.env.season), p.settings.northDeg, n);
    nodes.push(section(`Direct sun on this face · ${C.SEASONS.find((s) => s.id === p.env.season).name.toLowerCase()}`, h('div', { class: 'kv' }, win.length ? win.flatMap((wn) => [h('span', {}, 'sunlit'), h('b', {}, `${formatHour(wn[0])} – ${formatHour(wn[1])}`)]) : [h('span', {}, 'sunlit'), h('b', {}, 'never (faces away or polar night)')])));
  }
  if (S.floor < p.structure.floors.length - 1 && has('floors')) nodes.push(h('button', { class: 'btn', onclick: () => { Model.stackWall(p, w.id, S.floor + 1); commit(); toast(`Copied to ${p.structure.floors[S.floor + 1].name}`); } }, `Copy this wall to ${p.structure.floors[S.floor + 1].name}`));
  nodes.push(h('div', { class: 'row' }, h('button', { class: 'btn danger', onclick: () => { Model.removeWall(p, w.id); S.selection = null; commit(); closeSheet(); } }, 'Delete wall'), h('span', { class: 'note grow' }, 'Drag the amber handles to move the ends.')));
  openSheet('inspector', `${info.kind === 'exterior' ? 'Exterior' : 'Interior'} wall · ${sel.stone ? 'stone' : sel.exterior ? 'outside face' : 'inside face'}`, nodes);
}
function inspectOpening(sel) {
  const p = S.project; const f = Model.findOpening(p, sel.openingId); if (!f) return; const { wall: w, opening: o } = f; const L = Model.wallLength(w);
  const nodes = [];
  if (o.kind === 'door') nodes.push(h('div', { class: 'row' }, h('button', { class: 'btn primary', onclick: () => { toggleDoor(o.id); openInspector(); } }, o.open ? 'Close door' : 'Open door'), h('span', { class: 'note grow' }, 'Doors also open with a tap during a walkthrough.')));
  nodes.push(section('Type', chipRow([{ id: 'door', name: 'Door' }, { id: 'window', name: 'Window' }, { id: 'opening', name: 'Opening' }], o.kind, (k) => { Model.setOpeningStyle(o, k, null); Model.clampOpenings(w, o.id); commit(); openInspector(); })));
  nodes.push(section('Style', chipRow(C.OPENING_STYLES[o.kind], o.style, (id) => { Model.setOpeningStyle(o, o.kind, id); Model.clampOpenings(w, o.id); commit(); openInspector(); }),
    o.kind === 'door' && !Model.openingStyle('door', o.style).fixedLeaves && checkRow('Double (two leaves)', Model.doorLeaves(o) === 2, (v) => { Model.setDoorLeaves(o, v ? 2 : 1); Model.clampOpenings(w, o.id); commit(); openInspector(); })));
  nodes.push(h('div', { class: 'stats' }, h('div', { class: 'stat' }, h('b', {}, ftIn(o.width)), h('span', {}, 'width')), h('div', { class: 'stat' }, h('b', {}, ftIn(o.height)), h('span', {}, 'height')), o.sill > 0 && h('div', { class: 'stat' }, h('b', {}, ftIn(o.sill)), h('span', {}, 'sill'))));
  nodes.push(sliderRow('Width', o.width, 1.5, Math.max(1.6, L - 0.5), 0.25, ftIn, null, (v) => { const c = o.along + o.width / 2; o.width = v; o.along = c - v / 2; Model.clampOpenings(w, o.id); commit(); }));
  nodes.push(sliderRow('Position along wall', o.along, 0.25, Math.max(0.3, L - 0.25 - o.width), 0.25, ftIn, (v) => { o.along = v; Model.clampOpenings(w, o.id); builder.buildWalls(p, S.analysis, S.floor); refreshSelectionOverlay(); S.needsRender = true; }, () => commit()));
  if (o.kind === 'window') nodes.push(sliderRow('Sill height', o.sill, 0.5, 7, 0.25, ftIn, (v) => { o.sill = v; builder.buildWalls(p, S.analysis, S.floor); refreshSelectionOverlay(); S.needsRender = true; }, () => commit()));
  if (o.kind === 'door') nodes.push(checkRow('Hinge on the other side', !!o.flip, (v) => { o.flip = v; commit(); }));
  nodes.push(h('div', { class: 'row' }, h('button', { class: 'btn danger', onclick: () => { Model.removeOpening(p, o.id); S.selection = null; commit(); closeSheet(); } }, 'Remove')));
  openSheet('inspector', Model.openingDisplayName(o), nodes);
}
function inspectItem(sel) {
  const p = S.project; const it = Model.getItem(p, sel.itemId); if (!it) return; const def = C.itemDef(it.type);
  const nodes = [];
  const rebuildItems = () => { builder.buildItems(p, S.analysis, S.floor, itemOpts()); applyLights(); refreshSelectionOverlay(); S.needsRender = true; };
  nodes.push(h('div', { class: 'row' }, h('button', { class: 'btn', onclick: () => { it.rot = (it.rot - 15 + 360) % 360; commit(); } }, '↺ 15°'), h('button', { class: 'btn', onclick: () => { it.rot = (it.rot + 15) % 360; commit(); } }, '↻ 15°'), h('button', { class: 'btn', onclick: () => { it.rot = (it.rot + 90) % 360; commit(); } }, '↻ 90°'), h('span', { class: 'note grow' }, 'Drag the item to move it.')));
  nodes.push(h('div', { class: 'stats' }, h('div', { class: 'stat' }, h('b', {}, `${ftIn(it.w || def.w)} × ${ftIn(it.d || def.d)}`), h('span', {}, 'footprint')), h('div', { class: 'stat' }, h('b', {}, ftIn((it.h || def.h) * (it.scale || 1))), h('span', {}, 'height'))));
  if (def.light) {
    nodes.push(section('Light', sliderRow('Color temperature', it.kelvin ?? def.light.kelvin ?? 2700, 1800, 6500, 50, (v) => `${v} K · ${v < 2400 ? 'candle' : v < 3100 ? 'warm' : v < 4200 ? 'neutral' : 'daylight'}`, (v) => { it.kelvin = v; rebuildItems(); }, () => commit()),
      sliderRow('Brightness', Math.round((it.intensity ?? 1) * 100), 10, 250, 5, (v) => `${v}%`, (v) => { it.intensity = v / 100; rebuildItems(); }, () => commit()),
      h('p', { class: 'note' }, 'Lights come on at dusk; force them on from Sun & weather.')));
  }
  if (def.palette) {
    const pal = Model.PALETTES[def.palette] || Model.PALETTES.any;
    nodes.push(section(def.palette === 'cabinet' ? 'Cabinet finish' : 'Color', def.palette === 'cabinet' && chipRow(C.CABINET_FINISHES, it.finish || def.finish || 'wood', (id) => { it.finish = id; commit(); openInspector(); }), swatchRow(pal, it.color || def.color, (hex) => { it.color = hex; commit(); openInspector(); })));
  }
  if (def.sizable) {
    const sz = def.sizable;
    nodes.push(section('Size', sz.w && sliderRow('Width', it.w || def.w, sz.w[0], sz.w[1], 0.25, ftIn, (v) => { it.w = v; rebuildItems(); }, () => commit()), sz.d && sliderRow('Depth', it.d || def.d, sz.d[0], sz.d[1], 0.25, ftIn, (v) => { it.d = v; rebuildItems(); }, () => commit()), sz.h && sliderRow('Height', it.h || def.h, sz.h[0], sz.h[1], 0.25, ftIn, (v) => { it.h = v; rebuildItems(); }, () => commit())));
  }
  if (def.build === 'spruce' || def.build === 'birch' || def.build === 'aspen' || def.build === 'shrub' || def.build === 'boulder') nodes.push(sliderRow('Size', it.scale || 1, 0.4, 1.8, 0.05, (v) => `${Math.round(v * 100)}%`, (v) => { it.scale = v; rebuildItems(); }, () => commit()));
  if (def.resizable) { nodes.push(sliderRow('Width', it.w || def.w, 4, 160, 1, ftIn, (v) => { it.w = v; rebuildItems(); }, () => commit())); nodes.push(sliderRow('Depth', it.d || def.d, 4, 160, 1, ftIn, (v) => { it.d = v; rebuildItems(); }, () => commit())); }
  if (def.wall || def.build === 'tablelamp') nodes.push(sliderRow(def.build === 'tablelamp' ? 'Table height' : 'Height on wall', it.mountY ?? def.mountHeight ?? 5, 0.5, 9, 0.25, ftIn, (v) => { it.mountY = v; rebuildItems(); }, () => commit()));
  if (def.fire) nodes.push(section('Fire', checkRow('Fire lit (flicker, glow and chimney smoke)', it.lit !== false, (v) => { it.lit = v; commit(); openInspector(); }),
    def.vent?.kind === 'chimney' && checkRow('Box in the chimney inside (drywall chase; stack shows above the roof only)', !!it.boxed, (v) => { it.boxed = v; commit(); openInspector(); }),
    def.vent?.kind === 'chimney' && p.items.some((t) => t.type === 'tvwall' && t.floor === it.floor && Math.hypot(t.x - it.x, t.z - it.z) < Math.max(3, (it.w || def.w) / 2 + 1)) && h('p', { class: 'note' }, 'A TV hangs above this fireplace, so the chimney is boxed in automatically.')));
  if (def.stair) { const spec = Model.stairSpec(p, it); nodes.push(section('Stair', h('div', { class: 'stats' }, h('div', { class: 'stat' }, h('b', {}, String(spec.risers)), h('span', {}, 'risers')), h('div', { class: 'stat' }, h('b', {}, `${Math.round(spec.riserH * 12 * 10) / 10}″`), h('span', {}, 'riser')), h('div', { class: 'stat' }, h('b', {}, ftIn(spec.kind === 'L' ? spec.run1 + spec.land : spec.run)), h('span', {}, 'run')), h('div', { class: 'stat' }, h('b', {}, ftIn(spec.rise)), h('span', {}, 'rise'))), h('p', { class: 'note' }, p.structure.floors[it.floor + 1] ? `Lands on ${p.structure.floors[it.floor + 1].name}; the floor above is cut around it. Walk up it in the walkthrough.` : 'There is no floor above yet — add one in Project settings and the stair will cut its opening.'))); }
  if (def.vent) nodes.push(h('p', { class: 'note' }, def.vent.to === 'roof' ? `Vents straight up through the roof (${def.vent.kind === 'chimney' ? 'masonry chimney' : def.vent.kind === 'stovepipe' ? 'double-wall stove pipe with storm collar' : 'pipe with flashing'}).` : 'Ducts to the nearest exterior wall with a hood outside; move it closer to an outside wall for a short run.'));
  if (def.note) nodes.push(h('p', { class: 'note' }, def.note));
  if (def.vehicle) nodes.push(h('p', { class: 'note' }, `Allow about 3 ft on each side to open doors and walk around. ${ftIn((it.d || def.d) + 6)} of garage depth keeps 3 ft in front and behind.`));
  if (def.structural) nodes.push(h('p', { class: 'note' }, def.structural === 'laundry' ? 'Noted for the engineer: blocking or doubled joists under the washer and dryer, plus a drain pan.' : def.structural === 'heavy' ? 'Heavy when full; the materials list flags the floor framing under it.' : 'Needs clearances and a hearth; see the notes in the materials list.'));
  nodes.push(h('div', { class: 'row' }, h('button', { class: 'btn', onclick: () => { const c = Model.addItem(p, it.type, it.floor, it.x + 3, it.z + 3, it.rot, { scale: it.scale, w: it.w, d: it.d, h: it.h, mountY: it.mountY, color: it.color, finish: it.finish, kelvin: it.kelvin, intensity: it.intensity, lit: it.lit, boxed: it.boxed, wallMount: it.wallMount }); commit(); select({ type: 'item', itemId: c.id, floor: c.floor }); } }, 'Duplicate'), h('button', { class: 'btn danger', onclick: () => { Model.removeItem(p, it.id); S.selection = null; commit(); closeSheet(); } }, 'Remove')));
  openSheet('inspector', def.name, nodes);
}
function inspectRoom(sel) {
  const p = S.project; const fa = S.analysis.floors[sel.floor]; const r = fa.rooms.find((x) => x.key === sel.roomKey); if (!r) return;
  const meta = p.rooms[r.key] || {}; const nodes = [];
  nodes.push(h('div', { class: 'stats' }, h('div', { class: 'stat' }, h('b', {}, `${Math.round(r.area)} sq ft`), h('span', {}, 'floor area')), h('div', { class: 'stat' }, h('b', {}, `${ftIn(r.bbox.w)} × ${ftIn(r.bbox.d)}`), h('span', {}, 'overall'))));
  nodes.push(section('Name', h('input', { type: 'text', value: r.name, maxlength: 40, onchange: (e) => { p.rooms[r.key] = { ...meta, name: e.target.value.trim() || r.name }; commit(); } })));
  if (has('materials')) {
    nodes.push(section('Flooring', chipRow(C.FLOORING, r.flooring, (id) => { p.rooms[r.key] = { ...(p.rooms[r.key] || {}), flooring: id }; commit(); openInspector(); })));
    nodes.push(section('Wall paint', swatchRow(C.PAINT_COLORS, meta.paint || p.interior.paintColor, (hex) => { p.rooms[r.key] = { ...(p.rooms[r.key] || {}), paint: hex }; commit(); openInspector(); })));
  }
  openSheet('inspector', r.name, nodes);
}

// ------------------------------------------------------------------ sheets
function openItemsSheet() {
  const groups = C.ITEM_GROUPS.filter((g) => (g.id !== 'systems' || has('systems')) && (g.id !== 'lights' || has('lights')) && (g.id !== 'landscape' && g.id !== 'site' || has('landscape')));
  let group = S.itemsGroup || 'living';
  const body = h('div', { class: 'items' });
  const fill = () => { body.innerHTML = ''; for (const it of C.ITEMS.filter((i) => i.group === group)) body.append(h('button', { class: `item ${S.placing === it.id ? 'on' : ''}`, onclick: () => { S.placing = it.id; S.tool = 'place'; document.querySelectorAll('#rail .tok').forEach((b) => b.classList.toggle('on', b.dataset.act === 'tool-place')); fill(); setHint(); if (S.view !== 'furnished' && !it.outdoor) setView('furnished'); if (!it.outdoor) hideRoofForEditing(); if (window.innerWidth < 900) closeSheet(); } }, h('b', {}, it.name), h('small', {}, `${ftIn(it.w)} × ${ftIn(it.d)}`))); };
  fill();
  const tabsHolder = h('div', {}); const renderTabs = () => { tabsHolder.innerHTML = ''; tabsHolder.append(chipRow(groups, group, (id) => { group = id; S.itemsGroup = id; renderTabs(); fill(); })); }; renderTabs();
  openSheet('items', 'Place items', [tabsHolder, body, h('p', { class: 'note' }, 'Furniture and vehicles show in the Furnished view. Lights, trees, decks and pads show in Finished too. Tap a placed item to change its color, size and finish.')]);
}
function openSunSheet() {
  const p = S.project; const lat = p.settings.hazards.latitude ?? region().lat;
  const times = () => { const t = sunTimes(lat, dayOfYearFor(p.env.season)); return t.polar === 'day' ? 'sun never sets' : t.polar === 'night' ? 'sun never rises' : `sunrise ${formatHour(t.rise)} · sunset ${formatHour(t.set)}`; };
  const timesEl = h('p', { class: 'note' }, times());
  const nodes = [
    sliderRow('Time of day', p.env.hour, 0, 24, 0.25, formatHour, (v) => { p.env.hour = v; updateEnvironment(); }, () => scheduleSave()),
    timesEl,
    section('Season', chipRow(C.SEASONS, p.env.season, (id) => { p.env.season = id; rebuildAll(); scheduleSave(); openSunSheet(); })),
    section('Weather', chipRow(C.WEATHER, p.env.weather, (id) => { p.env.weather = id; rebuildAll(); scheduleSave(); openSunSheet(); })),
    sliderRow('Which way is north (rotate the compass)', p.settings.northDeg, -180, 180, 5, (v) => `${v}°`, (v) => { p.settings.northDeg = v; updateEnvironment(); }, () => scheduleSave()),
    checkRow('Interior lights always on', S.lightsOn, (v) => { S.lightsOn = v; updateEnvironment(true); }),
    section('All lights at once', (() => { const lights = p.items.filter((it) => C.itemDef(it.type)?.light); if (!lights.length) return h('p', { class: 'note' }, 'No lights placed yet. Place items → Lights.'); const k0 = Math.round(lights.reduce((a, it) => a + (it.kelvin ?? C.itemDef(it.type).light.kelvin ?? 2700), 0) / lights.length / 50) * 50; const i0 = Math.round(lights.reduce((a, it) => a + (it.intensity ?? 1), 0) / lights.length * 100); const rebuild = () => { builder.buildItems(p, S.analysis, sceneMaxFloor(), itemOpts()); applyLights(); S.needsRender = true; }; return h('div', { class: 'field' }, sliderRow(`Color temperature · ${lights.length} lights`, k0, 1800, 6500, 50, (v) => `${v} K · ${v < 2400 ? 'candle' : v < 3100 ? 'warm' : v < 4200 ? 'neutral' : 'daylight'}`, (v) => { Model.setAllLights(p, { kelvin: v }); rebuild(); }, () => commit()), sliderRow('Brightness', i0, 10, 250, 5, (v) => `${v}%`, (v) => { Model.setAllLights(p, { intensity: v / 100 }); rebuild(); }, () => commit()), h('button', { class: 'btn', onclick: () => { Model.setAllLights(p, { reset: true }); commit(); openSunSheet(); } }, 'Back to each fixture’s own default')); })()),
    checkRow('Wind, swaying trees and twinkling stars', S.motion, (v) => { S.motion = v; store.set('gw.motion', v ? 'on' : 'off'); S.needsRender = true; }),
    h('p', { class: 'note' }, `Sun path for latitude ${lat.toFixed(1)}° (${region().name.split(' (')[0]}). Select an outside wall face to see when it gets direct sun.`),
  ];
  openSheet('sun', 'Sun, seasons & weather', nodes);
}
function openExteriorSheet() {
  const p = S.project; const ex = p.exterior; const sidingDef = C.SIDING.find((s) => s.id === ex.sidingType) || C.SIDING[0];
  const nodes = [
    section('Siding', chipRow(C.SIDING, ex.sidingType, (id) => { ex.sidingType = id; commit(); openExteriorSheet(); }),
      sidingDef.stained ? swatchRow(C.STAIN_COLORS, ex.stainColor, (hex) => { ex.stainColor = hex; commit(); openExteriorSheet(); }) : swatchRow(C.SIDING_COLORS, ex.sidingColor, (hex) => { ex.sidingColor = hex; commit(); openExteriorSheet(); }),
      checkRow('Same siding on every wall', !p.structure.walls.some((w) => w.faces?.ext), (on) => { if (on) { for (const w of p.structure.walls) delete w.faces.ext; commit(); } else toast('Select a wall face and untick "Same as the rest" to change just that side'); openExteriorSheet(); })),
    section('Stone veneer footing', checkRow('Stone wainscot around the base', !!ex.stone?.enabled, (on) => { ex.stone.enabled = on; commit(); openExteriorSheet(); }),
      ex.stone?.enabled && chipRow(C.STONE_VENEER, ex.stone.type, (id) => { ex.stone.type = id; commit(); openExteriorSheet(); }),
      ex.stone?.enabled && sliderRow('Height', ex.stone.heightFt, 1, 6, 0.25, ftIn, null, (v) => { ex.stone.heightFt = v; commit(); })),
    section('Trim, fascia & corner boards', swatchRow(C.TRIM_COLORS, ex.trimColor, (hex) => { ex.trimColor = hex; commit(); openExteriorSheet(); })),
    section('Entry doors', swatchRow(C.DOOR_COLORS.map((c) => c.hex ? c : { ...c, hex: ex.trimColor }), ex.doorColor || ex.trimColor, (hex) => { ex.doorColor = hex === ex.trimColor ? '' : hex; commit(); openExteriorSheet(); })),
    section('Roof', chipRow(C.ROOFING, p.structure.roof.material, (id) => { p.structure.roof.material = id; for (const k of Object.keys(p.structure.roofByBuilding)) delete p.structure.roofByBuilding[k].material; commit(); openExteriorSheet(); }), swatchRow(C.ROOF_COLORS, p.structure.roof.color, (hex) => { p.structure.roof.color = hex; for (const k of Object.keys(p.structure.roofByBuilding)) delete p.structure.roofByBuilding[k].color; commit(); openExteriorSheet(); }), has('roof') && h('button', { class: 'btn', onclick: () => openRoofSheet(null) }, 'Roof shapes, pitch & overhang…')),
    section('Interior defaults', h('div', { class: 'eyebrow' }, 'Wall paint'), swatchRow(C.PAINT_COLORS, p.interior.paintColor, (hex) => { p.interior.paintColor = hex; commit(); openExteriorSheet(); }), h('div', { class: 'eyebrow' }, 'Flooring'), chipRow(C.FLOORING, p.interior.flooring, (id) => { p.interior.flooring = id; commit(); openExteriorSheet(); })),
    section('Interior trim', checkRow('Baseboards on every wall', p.interior.trim.baseboards !== false, (v) => { p.interior.trim.baseboards = v; commit(); }), p.interior.trim.baseboards !== false && sliderRow('Baseboard height', p.interior.trim.baseboardIn, 2.5, 9, 0.5, (v) => `${v}″`, null, (v) => { p.interior.trim.baseboardIn = v; commit(); }),
      checkRow('Crown molding at the ceiling', !!p.interior.trim.crown, (v) => { p.interior.trim.crown = v; commit(); openExteriorSheet(); }), p.interior.trim.crown && sliderRow('Crown size', p.interior.trim.crownIn, 2, 6, 0.5, (v) => `${v}″`, null, (v) => { p.interior.trim.crownIn = v; commit(); }),
      h('div', { class: 'eyebrow' }, 'Trim color'), swatchRow(C.INTERIOR_TRIM_COLORS, p.interior.trim.color, (hex) => { p.interior.trim.color = hex; commit(); openExteriorSheet(); })),
  ];
  if (has('trim')) nodes.push(section('Weather details', checkRow('House wrap under siding', ex.houseWrap !== false, (v) => { ex.houseWrap = v; commit(); }), checkRow('Flashing tape at every opening', ex.flashing !== false, (v) => { ex.flashing = v; commit(); }), checkRow('Vented soffit', p.structure.roof.soffit, (v) => { p.structure.roof.soffit = v; commit(); }), checkRow('Fascia boards', p.structure.roof.fascia, (v) => { p.structure.roof.fascia = v; commit(); })));
  openSheet('exterior', 'Materials & colors', nodes);
}
function roofIcon(style) { const def = C.ROOF_STYLES.find((s) => s.id === style); return `<svg viewBox="0 0 24 24"><path d="${def.icon}"/></svg>`; }
function openRoofSheet(key) {
  const p = S.project;
  const buildings = S.roofs.map((r, i) => ({ key: r.key, name: `Building ${i + 1} · ${Math.round(r.bbox.w)}×${Math.round(r.bbox.d)} ft`, roof: r }));
  if (key === undefined) key = null;
  if (key === null && buildings.length === 1) key = buildings[0].key;
  const r = key ? Model.roofFor(p, key) : p.structure.roof;
  const set = (patch) => { Model.setRoofFor(p, key, patch); commit(); openRoofSheet(key); };
  const nodes = [];
  if (buildings.length > 1) nodes.push(section('Which roof', chipRow([{ id: '__all', name: 'All buildings' }, ...buildings.map((b) => ({ id: b.key, name: b.name }))], key || '__all', (id) => openRoofSheet(id === '__all' ? null : id))));
  nodes.push(section('Shape', h('div', { class: 'roofs' }, C.ROOF_STYLES.map((s) => h('button', { class: `roofcard ${r.style === s.id ? 'on' : ''}`, onclick: () => set({ style: s.id }) }, h('div', { html: roofIcon(s.id) }), h('b', {}, s.name), h('span', {}, s.desc))))));
  if (r.style !== 'flat') nodes.push(sliderRow('Pitch (rise per 12)', r.pitch, 1, 14, 0.5, (v) => `${v}:12 · ${Math.round(Math.atan(v / 12) * 180 / Math.PI)}°`, null, (v) => set({ pitch: v })));
  nodes.push(sliderRow('Overhang', r.overhang, 0, 4, 0.25, ftIn, null, (v) => set({ overhang: v })));
  nodes.push(section('Ridge direction', chipRow([{ id: 'auto', name: 'Auto (long side)' }, { id: 'x', name: 'East–west' }, { id: 'z', name: 'North–south' }], r.ridgeAxis || 'auto', (id) => set({ ridgeAxis: id }))));
  nodes.push(section('Covering', chipRow(C.ROOFING, r.material, (id) => set({ material: id })), swatchRow(C.ROOF_COLORS, r.color, (hex) => set({ color: hex }))));
  if (key && Object.keys(p.structure.roofByBuilding[key] || {}).length) nodes.push(h('button', { class: 'btn', onclick: () => { delete p.structure.roofByBuilding[key]; commit(); openRoofSheet(key); } }, 'Use the house default for this building'));
  const def = C.ROOFING.find((m) => m.id === r.material); const snow = C.SNOW_LEVELS.find((s) => s.id === p.settings.hazards.snow);
  nodes.push(h('p', { class: 'note' }, `${def.name} wants at least ${def.minPitch}:12. Your snow zone is ${snow?.name.toLowerCase() || 'moderate'}; under 4:12 holds snow. Tap any roof in the scene to edit just that building.`));
  openSheet('roof', key ? (buildings.find((b) => b.key === key)?.name || 'Roof') : 'Roof (all buildings)', nodes);
}
function openFoundationSheet() {
  const p = S.project; const fd = p.structure.foundation; const hz = p.settings.hazards;
  const nodes = [
    section('Type', chipRow(C.FOUNDATIONS, fd.type, (id) => { fd.type = id; commit(); openFoundationSheet(); })),
    h('p', { class: 'note' }, C.FOUNDATIONS.find((f) => f.id === fd.type).desc),
    fd.type !== 'slab' && sliderRow('Footing depth below grade', fd.depthIn, 12, 96, 6, (v) => `${v} in`, null, (v) => { fd.depthIn = v; commit(); }),
    (fd.type === 'stem' || fd.type === 'slab') && sliderRow('Slab thickness', fd.slabIn, 4, 8, 1, (v) => `${v} in`, null, (v) => { fd.slabIn = v; commit(); }),
    fd.type === 'piers' && sliderRow('Pier spacing', fd.pierSpacingFt, 4, 12, 1, ftIn, null, (v) => { fd.pierSpacingFt = v; commit(); }),
    checkRow('Build for a second story later (bigger footings, stair space, floor-rated ceiling joists)', !!p.structure.futureSecondStory, (v) => { p.structure.futureSecondStory = v; commit(); }),
    h('p', { class: 'note' }, `Local frost depth is about ${hz.frostDepthIn} in. ${fd.depthIn < hz.frostDepthIn && fd.type !== 'slab' ? 'Your footings are shallower than that; the materials list will flag it.' : ''}`),
  ];
  openSheet('foundation', 'Foundation', nodes);
}
function openExportSheet() {
  const p = S.project;
  if (!S.estimate) S.estimate = computeEstimate(p, S.analysis, S.roofs);
  const est = S.estimate; const st = est.stats;
  const imgs = h('div', { class: 'field' }, h('p', { class: 'note' }, 'Rendering blueprint sheets…'));
  setTimeout(() => {
    try {
      const pages = p.structure.floors.length + 2; const nodes = [];
      p.structure.floors.forEach((f, i) => { const c = renderPlanSheet(p, S.analysis, S.roofs, i, i + 1, pages); const img = h('img', { class: 'sheetimg', alt: `${f.name} plan`, src: c.toDataURL('image/png') }); nodes.push(img); });
      const mc = renderMaterialsSheet(p, est, pages - 1, pages); nodes.push(h('img', { class: 'sheetimg', alt: 'Materials list sheet', src: mc.toDataURL('image/png') }));
      const nc = renderNotesSheet(p, est, pages, pages); nodes.push(h('img', { class: 'sheetimg', alt: 'Engineer notes sheet', src: nc.toDataURL('image/png') }));
      imgs.innerHTML = ''; imgs.append(h('p', { class: 'note' }, 'Press and hold a sheet to save it to Photos, or use Copy image.'), ...nodes.flatMap((img) => [img, h('div', { class: 'row' }, h('button', { class: 'btn', onclick: async () => { try { const blob = await (await fetch(img.src)).blob(); await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]); toast('Sheet copied as an image'); } catch { toast('Press and hold the sheet to save it'); } } }, 'Copy image'))]));
    } catch (err) { imgs.innerHTML = ''; imgs.append(h('p', { class: 'note' }, `Could not draw the sheets: ${err.message}`)); }
  }, 30);
  const table = h('table', { class: 'est' }, h('thead', {}, h('tr', {}, h('th', {}, 'Item'), h('th', { class: 'n' }, 'Qty'), h('th', { class: 'n' }, 'Each'), h('th', { class: 'n' }, 'Total'))));
  const tb = h('tbody'); table.append(tb);
  for (const ph of est.phases) {
    const cats = ph.categories.filter((c) => est.lines.some((l) => l.category === c)); if (!cats.length) continue;
    tb.append(h('tr', { class: 'phase' }, h('td', { colspan: 3 }, ph.name), h('td', { class: 'n' }, money(est.byPhase[ph.id] || 0))));
    for (const cat of cats) {
      tb.append(h('tr', { class: 'cat' }, h('td', { colspan: 3 }, est.categories[cat]), h('td', { class: 'n' }, money(est.byCategory[cat] || 0))));
      for (const l of est.lines.filter((x) => x.category === cat)) tb.append(h('tr', {}, h('td', {}, l.item, l.note && h('small', {}, l.note)), h('td', { class: 'n' }, `${l.qty % 1 ? l.qty.toFixed(1) : l.qty} ${l.unit}`), h('td', { class: 'n' }, money(l.unitPrice)), h('td', { class: 'n' }, money(l.total))));
    }
  }
  const nodes = [
    h('div', { class: 'disclaimer' }, est.disclaimer),
    h('div', { class: 'stats' }, h('div', { class: 'stat' }, h('b', {}, money(est.grand)), h('span', {}, 'materials total')), h('div', { class: 'stat' }, h('b', {}, `${Math.round(st.floorArea).toLocaleString()} sq ft`), h('span', {}, 'floor area')), h('div', { class: 'stat' }, h('b', {}, `${Math.round(st.roofArea).toLocaleString()} sq ft`), h('span', {}, 'roof')), h('div', { class: 'stat' }, h('b', {}, `${money(est.grand / Math.max(1, st.floorArea))}/sq ft`), h('span', {}, 'materials only'))),
    h('p', { class: 'note' }, `${region().name} · ${C.PRICING_TIERS.find((t) => t.id === p.settings.pricingTier).name.toLowerCase()} pricing · labor, site work, well/septic, electrical, plumbing and heating equipment are not included.`),
    h('div', { class: 'row' }, h('button', { class: 'btn primary', onclick: () => copyText(estimateToText(est, p), 'Materials list copied as text') }, 'Copy as text'), h('button', { class: 'btn', onclick: () => copyText(estimateToCsv(est), 'Copied as CSV for a spreadsheet') }, 'Copy CSV')),
    section('Blueprint sheets', imgs),
    section('By build phase', h('div', { class: 'kv' }, est.phases.flatMap((ph) => (est.byPhase[ph.id] > 0 ? [h('span', {}, ph.name), h('b', {}, money(est.byPhase[ph.id]))] : [])))),
    section('Notes for your engineer', h('div', { class: 'notes' }, est.notes.map((n) => h('div', { class: `noteline ${n.level}` }, h('i'), h('span', {}, n.text))))),
    h('div', { class: 'tablewrap' }, table),
  ];
  openSheet('export', 'Blueprint & materials list', nodes);
}
function openSettingsSheet(focus) {
  const p = S.project; const st = p.settings; const hz = st.hazards;
  const nodes = [
    section('Project name', h('input', { type: 'text', value: p.name, maxlength: 60, onchange: (e) => { p.name = e.target.value.trim() || p.name; scheduleSave(); } })),
    section('Mode', chipRow(Object.values(C.MODES), st.mode, (id) => { st.mode = id; buildTopbar(); buildRail(); if (VIEWS.find((v) => v.id === S.view)?.feature && !has(VIEWS.find((v) => v.id === S.view).feature)) S.view = 'finished'; commit(); openSettingsSheet(); })),
    section('Region', h('select', { onchange: (e) => { st.regionId = e.target.value; const r = region(); hz.latitude = r.lat; hz.seismic = r.seismic; hz.snow = C.snowLevelForPsf(r.snowPsf); hz.frostDepthIn = r.frostDepthIn; S.lastEnvKey = ''; S.lastGroundKey = ''; commit(); openSettingsSheet(); } }, C.REGIONS.map((r) => h('option', { value: r.id, selected: r.id === st.regionId }, r.name)))),
    section('Material pricing in your area', chipRow(C.PRICING_TIERS, st.pricingTier, (id) => { st.pricingTier = id; S.estimate = null; scheduleSave(); openSettingsSheet(); })),
    section('Property size', chipRow(C.LOT_SIZES, st.lotId, (id) => { st.lotId = id; S.lastGroundKey = ''; commit(); openSettingsSheet(); })),
    section('Drawing', checkRow('Walls snap to right angles only (off: 45° steps too)', st.orthoSnap !== false, (v) => { st.orthoSnap = v; scheduleSave(); }), checkRow('Show blue ghost walls from the floor below (tap one to copy it up)', S.ghostsVisible, (v) => { S.ghostsVisible = v; refreshGhosts(); S.needsRender = true; })),
  ];
  if (has('floors')) {
    nodes.push(section('Floors', h('div', { class: 'chips' }, p.structure.floors.map((f, i) => h('button', { class: `chip ${i === S.floor ? 'on' : ''}`, onclick: () => { setFloor(i); openSettingsSheet(); } }, `${f.name} · ${ftIn(f.height)}`))),
      h('div', { class: 'row' }, h('button', { class: 'btn', onclick: () => { const i = Model.addFloor(p); setFloor(i); commit(); openSettingsSheet(); toast('Tap the blue ghost walls to build on top of the floor below, or copy them all below.'); } }, 'Add a floor'), p.structure.floors.length > 1 && h('button', { class: 'btn danger', onclick: () => { Model.removeFloor(p, S.floor); setFloor(S.floor - 1); commit(); openSettingsSheet(); } }, `Remove ${p.structure.floors[S.floor].name}`)),
      S.floor > 0 && h('button', { class: 'btn', onclick: () => { const n = Model.stackAllWalls(p, S.floor - 1, S.floor); commit(); toast(`${n} walls copied from ${p.structure.floors[S.floor - 1].name}`); openSettingsSheet(); } }, `Copy all walls from ${p.structure.floors[S.floor - 1].name}`),
      sliderRow(`${p.structure.floors[S.floor].name} wall height`, p.structure.floors[S.floor].height, 7, 12, 0.5, ftIn, null, (v) => { p.structure.floors[S.floor].height = v; commit(); })));
  }
  if (has('structure') || has('insulation')) {
    nodes.push(section('Structure', has('structure') && h('div', { class: 'field' }, h('label', {}, 'Stud spacing'), chipRow(C.STUD_SPACINGS, p.structure.studSpacing, (id) => { p.structure.studSpacing = id; commit(); openSettingsSheet(); }), h('p', { class: 'note' }, C.STUD_SPACINGS.find((s) => s.id === p.structure.studSpacing)?.note)),
      h('div', { class: 'field' }, h('label', {}, 'Wall insulation'), chipRow(C.INSULATION, p.structure.insulation, (id) => { p.structure.insulation = id; commit(); openSettingsSheet(); }), h('p', { class: 'note' }, (() => { const i = C.INSULATION.find((x) => x.id === p.structure.insulation); return `R-${Math.round(i.rPerIn * 5.5)} in a 2×6 wall · ${i.note}`; })())),
      checkRow('Build for a second story later', !!p.structure.futureSecondStory, (v) => { p.structure.futureSecondStory = v; commit(); })));
  }
  if (has('hazards')) {
    nodes.push(section('Hazard zones', h('div', { class: 'two' }, h('div', { class: 'field' }, h('label', {}, 'Earthquake'), h('select', { onchange: (e) => { hz.seismic = e.target.value; S.estimate = null; scheduleSave(); } }, C.SEISMIC_LEVELS.map((s) => h('option', { value: s.id, selected: s.id === hz.seismic }, s.name)))), h('div', { class: 'field' }, h('label', {}, 'Snow load'), h('select', { onchange: (e) => { hz.snow = e.target.value; S.estimate = null; scheduleSave(); } }, C.SNOW_LEVELS.map((s) => h('option', { value: s.id, selected: s.id === hz.snow }, s.name)))), h('div', { class: 'field' }, h('label', {}, 'Frost depth (in)'), h('input', { type: 'number', value: hz.frostDepthIn, min: 0, max: 120, step: 6, onchange: (e) => { hz.frostDepthIn = +e.target.value || 0; S.estimate = null; scheduleSave(); } })), checkRow('Flood zone', hz.flood, (v) => { hz.flood = v; S.estimate = null; scheduleSave(); }))));
  }
  if (has('pricing')) nodes.push(section('Manual pricing (blank = region × tier)', h('div', { class: 'prices' }, C.MANUAL_PRICE_KEYS.map((k) => h('label', {}, `${C.PRICES[k].name} ($/${C.PRICES[k].unit})`, h('input', { type: 'number', step: '0.01', min: 0, placeholder: (C.PRICES[k].price * region().priceMult * (C.PRICING_TIERS.find((t) => t.id === st.pricingTier)?.mult || 1)).toFixed(2), value: st.priceOverrides[k] ?? '', onchange: (e) => { if (e.target.value === '') delete st.priceOverrides[k]; else st.priceOverrides[k] = +e.target.value; S.estimate = null; scheduleSave(); } }))))));
  nodes.push(section('Graphics', chipRow([{ id: 'low', name: 'Battery saver' }, { id: 'medium', name: 'Balanced' }, { id: 'high', name: 'Cinematic' }], S.quality, (id) => { S.quality = id; store.set('gw.quality', id); applyQuality(); rebuildScene(); openSettingsSheet(); }), h('p', { class: 'note' }, 'Cinematic adds ambient occlusion (soft contact shadows in corners), glow on lights and a filmic look. Turn it off if the phone gets warm.'), checkRow('Wind, swaying trees and twinkling stars', S.motion, (v) => { S.motion = v; store.set('gw.motion', v ? 'on' : 'off'); S.needsRender = true; })));
  if (has('systems')) nodes.push(checkRow('Show electrical, plumbing & HVAC markers', S.systemsVisible, (v) => { S.systemsVisible = v; rebuildScene(); }));
  openSheet('settings', 'Project settings', nodes);
}
function openMenuSheet() {
  const p = S.project;
  const nodes = [
    h('div', { class: 'kv' }, h('span', {}, 'Project'), h('b', {}, p.name), h('span', {}, 'Mode'), h('b', {}, C.MODES[p.settings.mode].name), h('span', {}, 'Saved'), h('b', {}, new Date(p.updatedAt).toLocaleString())),
    h('div', { class: 'row' }, h('button', { class: 'btn', onclick: openSettingsSheet }, 'Project settings…'), h('button', { class: 'btn', onclick: openExteriorSheet }, 'Materials…'), has('roof') && h('button', { class: 'btn', onclick: () => openRoofSheet(null) }, 'Roof…'), has('foundation') && h('button', { class: 'btn', onclick: openFoundationSheet }, 'Foundation…')),
    section('Backup', h('p', { class: 'note' }, 'Projects save on this device automatically. Copy the project text to keep a backup or move it to another device, then paste it below to restore. Pasted text is checked field by field before it is used.'), h('div', { class: 'row' }, h('button', { class: 'btn', onclick: () => copyText(Model.serialize(p), 'Project copied — paste it somewhere safe') }, 'Copy project text')), h('textarea', { class: 'code', id: 'restoreTa', placeholder: 'Paste project text here' }), h('button', { class: 'btn', onclick: () => { try { const q = Model.deserialize($('restoreTa').value); startProject(q); toast('Project restored'); } catch (err) { toast(`Could not read that: ${err.message}`); } } }, 'Restore from text')),
    section('Start over', h('div', { class: 'row' }, h('button', { class: 'btn', onclick: () => { store.set('gw.project', snapshot()); showSetup(); } }, 'Start screen'), h('button', { class: 'btn', onclick: () => startProject(Model.sampleProject()) }, 'Open the sample cabin'))),
    section('How it works', h('div', { class: 'notes' }, [
      'Wall tool: drag on the blueprint. Ends snap to other walls, so close the loop to make a room. Rooms get a floor, a ceiling, a roof and a name you can edit.',
      'Walls that enclose a room become exterior walls (2×6, siding outside, paint inside) on their own. Tap a wall face to override its type, its siding or its paint.',
      'Door, Window, Opening: tap a wall. Tap the result to change its style, width, position or hinge. Doors open with a tap in the walkthrough.',
      'Tap a roof to pick its shape per building. Tap the empty space beside the round buttons to see what they do.',
      'Foundation, Framing and Insulation views show what is under the finishes; the blueprint stays visible between the walls. The materials list is built from exactly what you see there.',
      'Walk through starts at your front door and shows the whole house. Drag to look, joystick to move, walk up the stairs or use ▲▼ to jump floors; set the eye height to the inch and widen the field of view if it feels zoomed in.',
      'Sheets: drag the grip (or tap it) to park a sheet at a third, half or most of the screen so you can keep moving the thing you are editing.',
      'Stairs (Place items → Living) run up to the next floor and cut the opening in it. Fireplaces and stoves burn with a flickering glow and smoke; hang a wall TV above a fireplace and the chimney is boxed in inside.',
      'Sun & weather has one slider for every light at once. Materials → Interior trim adds baseboards and crown molding to every room.',
    ].map((t) => h('div', { class: 'noteline' }, h('i'), h('span', {}, t))))),
    h('p', { class: 'note' }, 'Groundwork v0.3 · a planning sandbox, not a design tool. Quantities and loads are rough; confirm everything with an engineer and your local building department.'),
  ];
  openSheet('menu', 'Groundwork', nodes);
}

// ------------------------------------------------------------- walkthrough
const keys = new Set();
window.addEventListener('keydown', (e) => { if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return; keys.add(e.key.toLowerCase()); if (e.key === 'Escape') { if (rig.mode === 'walk') exitWalk(); else { S.draw = null; clearGhost(); S.selection = null; refreshSelectionOverlay(); closeSheet(); setHint(); } } if ((e.metaKey || e.ctrlKey) && e.key === 'z') { e.preventDefault(); if (e.shiftKey) redo(); else undo(); } });
window.addEventListener('keyup', (e) => keys.delete(e.key.toLowerCase()));
function applyKeys() { if (rig.mode !== 'walk') return; const v = rig.moveInput; if (keys.has('w') || keys.has('arrowup')) v.y = 1; if (keys.has('s') || keys.has('arrowdown')) v.y = -1; if (keys.has('a') || keys.has('arrowleft')) v.x = -1; if (keys.has('d') || keys.has('arrowright')) v.x = 1; }
// Walkthrough shows the whole house (every floor, every ceiling, the roof) and starts inside the front door
// of the floor you were editing. Stairs are walkable; the ▲▼ buttons jump between floors.
function enterWalk() {
  const p = S.project; closeSheet(); S.selection = null; refreshSelectionOverlay();
  S.viewBeforeWalk = S.view; if (S.view !== 'furnished') { S.view = 'furnished'; buildTopbar(); }
  S.walkAll = true; S.walkFloor = S.floor; rebuildScene();
  const fa = S.analysis.floors[S.floor]; let pos = null; let yaw = 0;
  for (const w of fa.walls) { const info = fa.wallInfo.get(w.id); if (info.kind !== 'exterior') continue; const door = w.openings.find((o) => o.kind === 'door' && !Model.openingStyle('door', o.style).garage); if (!door) continue; const { dir } = wallVec(w); const left = perp(dir); const inward = info.outward === 'left' ? { x: -left.x, z: -left.z } : { x: left.x, z: left.z }; const c = Model.openingWorldCenter(w, door); pos = { x: c.x + inward.x * 4, y: floorY(), z: c.z + inward.z * 4 }; yaw = Math.atan2(-inward.x, -inward.z); break; }
  if (!pos) { const bb = fa.bbox; pos = bb ? { x: bb.cx, y: floorY(), z: bb.cz } : { x: 0, y: floorY(), z: 20 }; }
  S.walkBase = pos.y; rig.eyeHeight = +$('eyeH').value; rig.enterWalk(pos, yaw);
  $('fovR').value = isPortrait() ? 80 : 68; $('fovVal').textContent = `${$('fovR').value}°`;
  $('walkUI').hidden = false; $('rail').hidden = true; $('topbar').hidden = true; $('fab').hidden = true; $('hint').hidden = true;
  $('walkFloors').hidden = p.structure.floors.length < 2; updateWalkFloorLabel();
  atmo.setFocus(new THREE.Vector3(pos.x, 0, pos.z), 40);
  resize(); S.needsRender = true;
}
function exitWalk() { rig.exitWalk(); S.walkAll = false; if (S.viewBeforeWalk && S.viewBeforeWalk !== S.view) { S.view = S.viewBeforeWalk; buildTopbar(); } $('walkUI').hidden = true; $('rail').hidden = false; $('topbar').hidden = false; $('fab').hidden = false; resize(); setTool('select'); rebuildScene(); S.needsRender = true; }
function updateWalkFloorLabel() { const f = S.project.structure.floors[S.walkFloor]; if (f) $('walkFloorLbl').textContent = f.name; $('walkDown').disabled = S.walkFloor <= 0; $('walkUp').disabled = S.walkFloor >= S.project.structure.floors.length - 1; }
// Jump a floor: land at the top/bottom of a stair when there is one, otherwise straight up or down.
function walkToFloor(fi) {
  const p = S.project; if (!p.structure.floors[fi]) return; const goingUp = fi > S.walkFloor;
  const stair = p.items.map((it) => ({ it, def: C.itemDef(it.type) })).find(({ it, def }) => def?.stair && it.floor === (goingUp ? fi - 1 : fi));
  if (stair) {
    const spec = Model.stairSpec(p, stair.it); const ang = stair.it.rot * Math.PI / 180; const c = Math.cos(ang); const sn = Math.sin(ang);
    const toW = (lx, lz) => ({ x: stair.it.x + lx * c + lz * sn, z: stair.it.z - lx * sn + lz * c });
    const top = spec.kind === 'L' ? toW(spec.run2 + 1.8, -spec.d / 2 + spec.run1 + spec.land / 2) : toW(0, spec.d / 2 + 1.8);
    const bottom = spec.kind === 'L' ? toW(-spec.flightW / 2, -spec.d / 2 - 1.8) : toW(0, -spec.d / 2 - 1.8);
    const at = goingUp ? top : bottom; rig.walkPos.x = at.x; rig.walkPos.z = at.z;
    rig.walkYaw = goingUp ? Math.atan2(-(top.x - bottom.x), -(top.z - bottom.z)) + Math.PI : Math.atan2(-(bottom.x - top.x), -(bottom.z - top.z)) + Math.PI;
  }
  S.walkFloor = fi; S.walkBase = floorY(fi); rig.walkPos.y = S.walkBase + rig.eyeHeight; updateWalkFloorLabel(); S.needsRender = true;
}
$('walkExit').addEventListener('click', exitWalk);
$('walkUp').addEventListener('click', () => walkToFloor(S.walkFloor + 1)); $('walkDown').addEventListener('click', () => walkToFloor(S.walkFloor - 1));
$('eyeH').addEventListener('input', (e) => { const v = +e.target.value; $('eyeHVal').textContent = ftIn(v); rig.eyeHeight = v; rig.walkPos.y = S.walkBase + v; S.needsRender = true; });
$('fovR').addEventListener('input', (e) => { $('fovVal').textContent = `${e.target.value}°`; resize(); });

// --------------------------------------------------------------- setup UI
let setupStep = 1;
function showSetup() {
  $('editor').hidden = true; $('setup').hidden = false; closeSheet();
  $('newForm').hidden = true; $('startStep').hidden = false;
  const tiles = $('tiles'); tiles.innerHTML = '';
  const saved = store.get('gw.project'); let meta = null; try { meta = JSON.parse(store.get('gw.recent') || 'null'); } catch { meta = null; }
  if (saved && meta) tiles.append(h('button', { class: 'tile primary', onclick: () => { try { startProject(Model.deserialize(saved)); } catch { toast('Saved project could not be opened'); } } }, h('div', { class: 'glyph', html: ICONS.finished }), h('b', {}, `Continue “${meta.name}”`), h('span', {}, `${C.MODES[meta.mode]?.name || ''} · saved ${new Date(meta.updatedAt).toLocaleDateString()}`)));
  tiles.append(h('button', { class: `tile ${saved ? '' : 'primary'}`, onclick: () => { $('startStep').hidden = true; $('newForm').hidden = false; setStep(1); } }, h('div', { class: 'glyph', html: ICONS.wall }), h('b', {}, 'Create new'), h('span', {}, 'Name it, pick how deep you want to go, choose your region and pricing.')));
  tiles.append(h('button', { class: 'tile', onclick: () => startProject(Model.sampleProject()) }, h('div', { class: 'glyph', html: ICONS.furnished }), h('b', {}, 'Open the sample cabin'), h('span', {}, '24×32 one-story cabin, detached 30×40 garage with the vehicles inside, Southcentral Alaska.')));
  if (!$('modes').children.length) {
    $('modes').append(...Object.values(C.MODES).map((m, i) => h('label', { class: 'mode' }, h('input', { type: 'radio', name: 'mode', value: m.id, checked: i === 0 }), h('b', {}, m.name), h('span', {}, m.tagline))));
    $('pRegion').append(...C.REGIONS.map((r) => h('option', { value: r.id }, r.name)));
    $('pLot').append(...C.LOT_SIZES.map((l) => h('option', { value: l.id, selected: l.id === 'one' }, l.name)));
    $('pTier').append(...C.PRICING_TIERS.map((t) => h('label', {}, h('input', { type: 'radio', name: 'tier', value: t.id, checked: t.id === 'medium' }), t.name)));
    $('pSeismic').append(...C.SEISMIC_LEVELS.map((s) => h('option', { value: s.id }, s.name)));
    $('pSnow').append(...C.SNOW_LEVELS.map((s) => h('option', { value: s.id }, s.name)));
    $('pPrices').append(...C.MANUAL_PRICE_KEYS.map((k) => h('label', {}, `${C.PRICES[k].name} ($/${C.PRICES[k].unit})`, h('input', { type: 'number', step: '0.01', min: 0, 'data-key': k, placeholder: C.PRICES[k].price.toFixed(2) }))));
    const syncRegion = () => { const r = C.REGIONS.find((x) => x.id === $('pRegion').value); $('pSeismic').value = r.seismic; $('pSnow').value = C.snowLevelForPsf(r.snowPsf); $('pFrost').value = r.frostDepthIn; $('pPrices').querySelectorAll('input').forEach((inp) => { inp.placeholder = (C.PRICES[inp.dataset.key].price * r.priceMult).toFixed(2); }); };
    $('pRegion').addEventListener('change', syncRegion); syncRegion();
    $('backBtn').addEventListener('click', () => { if (setupStep === 1) { $('newForm').hidden = true; $('startStep').hidden = false; } else setStep(setupStep - 1); });
    $('nextBtn').addEventListener('click', () => { const advanced = $('newForm').mode.value === 'advanced'; const last = advanced ? 3 : 2; if (setupStep < last) setStep(setupStep + 1); else createProject(); });
    $('newForm').addEventListener('submit', (e) => { e.preventDefault(); $('nextBtn').click(); });
  }
}
function setStep(n) {
  setupStep = n; const advanced = $('newForm').mode.value === 'advanced'; const last = advanced ? 3 : 2;
  for (let i = 1; i <= 3; i++) $(`step${i}`).hidden = i !== n;
  $('nextBtn').textContent = n === last ? 'Start building' : 'Next';
  const dots = $('stepDots'); dots.innerHTML = ''; for (let i = 1; i <= last; i++) { dots.append(h('b', { class: i === n ? 'on' : '' }, String(i))); if (i < last) dots.append(h('i')); }
  dots.append(h('span', { class: 'note', style: 'margin-left:8px' }, ['', 'Name & depth', 'Where & prices', 'Hazards & lumber'][n]));
}
function createProject() {
  const mode = $('newForm').mode.value; const tier = $('newForm').tier.value;
  const p = Model.newProject({ name: $('pName').value.trim() || 'My build', mode, regionId: $('pRegion').value, pricingTier: tier, lotId: $('pLot').value, seismic: $('pSeismic').value, snow: $('pSnow').value, frostDepthIn: +$('pFrost').value || 0, flood: $('pFlood').checked });
  $('pPrices').querySelectorAll('input').forEach((inp) => { if (inp.value !== '') p.settings.priceOverrides[inp.dataset.key] = +inp.value; });
  startProject(p);
}

// --------------------------------------------------------------------- boot
function boot(hot) {
  initThree();
  window.__gw = { S, builder, rig, atmo, scene, Model, commit, rebuildAll, fx, groundPoint, camera };
  $('loading').hidden = true;
  window.claude?.hot?.snapshot?.(() => ({ project: S.project ? snapshot() : null, view: S.view, floor: S.floor }));
  if (hot?.project) { try { startProject(Model.deserialize(hot.project)); if (hot.view) setView(hot.view); return; } catch { /* fall through */ } }
  showSetup();
}
try { window.claude?.hot?.ready ? window.claude.hot.ready(boot) : boot(window.claude?.hot?.data ?? {}); }
catch (err) { $('loading').textContent = `Could not start: ${err.message}`; console.error(err); }
