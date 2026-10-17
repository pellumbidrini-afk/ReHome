// Groundwork — turns the project model into three.js geometry: ground + reveal mask + grass,
// foundation, framing, insulation, finished walls with openings and trim, stone wainscot, roofs,
// floors/ceilings, items, lights, vents and chimneys, and ghost walls from the floor below.
// Everything built here is tagged in userData so the picker can map a hit back to the model.
import * as THREE from './vendor.js';
import * as M from './materials.js';
import { wallVec, endHasCorner, perp, pointInPolygon } from './geometry.js';
import { wallDims, floorHeight, openingStyle, floorElevation as modelFloorElevation, nearestWall, kelvinToHex, wallsOnFloor, stairSpec, stairOpening } from './model.js';
import { frameWall, STUD_T } from './framing.js';
import { SIDING, itemDef, IN, FOUNDATIONS } from './catalog.js';
import { ROOF_T, roofHeightAt } from './roof.js';

const UP = new THREE.Vector3(0, 1, 0);
const BOX = new THREE.BoxGeometry(1, 1, 1);
const CYL = new THREE.CylinderGeometry(0.5, 0.5, 1, 16);
const CYL8 = new THREE.CylinderGeometry(0.5, 0.5, 1, 8);
const SPHERE = new THREE.SphereGeometry(0.5, 14, 10);
const CONE = new THREE.ConeGeometry(0.5, 1, 10, 1);
const TORUS = new THREE.TorusGeometry(0.5, 0.12, 8, 18);
const SHARED = new Set([BOX, CYL, CYL8, SPHERE, CONE, TORUS]);

export function floorBase(fd) { return { slab: 0.33, stem: 0.67, crawl: 2.5, piers: 3.0 }[fd.type] ?? 0.67; }
export function floorElevation(project, floorIndex) { return floorBase(project.structure.foundation) + modelFloorElevation(project, floorIndex); }

function v3(x, y, z) { return new THREE.Vector3(x, y, z); }
function box(w, h, d, material, x, y, z) { const m = new THREE.Mesh(BOX, material); m.scale.set(w, h, d); m.position.set(x, y, z); return m; }
function cyl(r, h, material, x, y, z, segs = 16) { const m = new THREE.Mesh(segs === 8 ? CYL8 : CYL, material); m.scale.set(r * 2, h, r * 2); m.position.set(x, y, z); return m; }
function yawFromDir(dir) { return Math.atan2(-dir.z, dir.x); }
function orientY(pts, up = true) { let ny = 0; for (let i = 0; i < pts.length; i++) { const p = pts[i]; const q = pts[(i + 1) % pts.length]; ny += (p.z - q.z) * (p.x + q.x); } return (ny > 0) === up ? pts : pts.slice().reverse(); }
const hashf = (x, z) => { const s = Math.sin(x * 12.9898 + z * 78.233) * 43758.5453; return s - Math.floor(s); };

// Planar polygon (3D points, any orientation) → geometry with UVs in feet along in-plane axes.
export function polyGeometry(pts, opts = {}) {
  const n = pts.length; if (n < 3) return null;
  let nx = 0; let ny = 0; let nz = 0;
  for (let i = 0; i < n; i++) { const p = pts[i]; const q = pts[(i + 1) % n]; nx += (p.y - q.y) * (p.z + q.z); ny += (p.z - q.z) * (p.x + q.x); nz += (p.x - q.x) * (p.y + q.y); }
  const normal = v3(nx, ny, nz).normalize();
  if (opts.flip) normal.negate();
  const u = opts.uAxis ? opts.uAxis.clone().normalize() : (Math.abs(normal.y) > 0.9 ? v3(1, 0, 0) : v3(pts[1].x - pts[0].x, pts[1].y - pts[0].y, pts[1].z - pts[0].z).normalize());
  const w = new THREE.Vector3().crossVectors(normal, u).normalize();
  const origin = pts[0];
  const flat = pts.map((p) => { const d = v3(p.x - origin.x, p.y - origin.y, p.z - origin.z); return new THREE.Vector2(d.dot(u), d.dot(w)); });
  const holes = (opts.holes || []).map((h) => h.map((p) => { const d = v3(p.x - origin.x, p.y - origin.y, p.z - origin.z); return new THREE.Vector2(d.dot(u), d.dot(w)); }));
  const tris = THREE.ShapeUtils.triangulateShape(flat, holes);
  const all = [...pts, ...(opts.holes || []).flat()]; const allFlat = [...flat, ...holes.flat()];
  const pos = new Float32Array(all.length * 3); const nor = new Float32Array(all.length * 3); const uv = new Float32Array(all.length * 2);
  all.forEach((p, i) => { pos[i * 3] = p.x; pos[i * 3 + 1] = p.y; pos[i * 3 + 2] = p.z; nor[i * 3] = normal.x; nor[i * 3 + 1] = normal.y; nor[i * 3 + 2] = normal.z; uv[i * 2] = allFlat[i].x; uv[i * 2 + 1] = allFlat[i].y; });
  const idx = []; for (const t of tris) idx.push(t[0], t[1], t[2]);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.BufferAttribute(nor, 3)); g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.setIndex(idx);
  if (tris.length) {
    const a = all[tris[0][0]]; const b = all[tris[0][1]]; const c = all[tris[0][2]];
    const fn = new THREE.Vector3().subVectors(b, a).cross(new THREE.Vector3().subVectors(c, a));
    if (fn.dot(normal) < 0) { const rev = []; for (let i = 0; i < idx.length; i += 3) rev.push(idx[i], idx[i + 2], idx[i + 1]); g.setIndex(rev); }
  }
  return g;
}

function wallFaceGeometry(x0, x1, H, holes, yBase = 0) {
  const shape = new THREE.Shape([new THREE.Vector2(x0, yBase), new THREE.Vector2(x1, yBase), new THREE.Vector2(x1, H), new THREE.Vector2(x0, H)]);
  for (const h of holes) {
    const hy0 = Math.max(yBase, h.y0); const hy1 = Math.min(H, h.y1); if (hy1 - hy0 < 0.05) continue;
    const path = new THREE.Path();
    if (h.arch && hy1 === h.y1) { const r = h.w / 2; const top = h.y1 - r; path.moveTo(h.x0, hy0); path.lineTo(h.x1, hy0); path.lineTo(h.x1, top); path.absarc(h.x0 + r, top, r, 0, Math.PI, false); path.lineTo(h.x0, hy0); }
    else { path.moveTo(h.x0, hy0); path.lineTo(h.x1, hy0); path.lineTo(h.x1, hy1); path.lineTo(h.x0, hy1); path.lineTo(h.x0, hy0); }
    shape.holes.push(path);
  }
  return new THREE.ShapeGeometry(shape, 8);
}

// Text sprite for lot dimension labels.
function textSprite(text, color = 'rgba(255,255,255,0.75)', px = 64) {
  const c = document.createElement('canvas'); c.width = 256; c.height = 64; const ctx = c.getContext('2d');
  ctx.font = `${px * 0.6}px ui-monospace, Menlo, monospace`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = color; ctx.fillText(text, 128, 32);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, transparent: true, depthWrite: false })); s.scale.set(8, 2, 1); s.userData.ownTexture = true; return s;
}

export class SceneBuilder {
  constructor(scene) {
    this.scene = scene;
    this.groups = {};
    for (const k of ['ground', 'grass', 'foundation', 'framing', 'insulation', 'walls', 'roof', 'floors', 'items', 'lights', 'landscape', 'systems', 'shafts', 'ghost', 'overlay']) { const g = new THREE.Group(); g.name = k; scene.add(g); this.groups[k] = g; }
    this.pickables = [];
    this.lightPoints = [];
    this.doors = new Map(); // openingId → animation record
    this.fires = []; this.smokes = []; // animated effects (flicker / drifting puffs)
    this.maskCanvas = document.createElement('canvas'); this.maskCanvas.width = 1024; this.maskCanvas.height = 1024;
    this.maskCtx = this.maskCanvas.getContext('2d', { willReadFrequently: true }); // read back for grass placement, so keep it CPU-side
    this.maskTex = new THREE.CanvasTexture(this.maskCanvas); this.maskTex.minFilter = THREE.LinearFilter;
    this.lotRect = { x: -150, z: -150, w: 300, d: 300 };
    this.ground = null; this.swayers = [];
  }

  clear(names) {
    for (const n of names) {
      const g = this.groups[n];
      g.traverse((o) => { if (o.geometry && !SHARED.has(o.geometry)) o.geometry.dispose(); if (o.isSprite && o.userData.ownTexture && o.material.map) { o.material.map.dispose(); o.material.dispose(); } else if (o.isSprite && o.userData.group === 'systems') o.material.dispose(); });
      while (g.children.length) g.remove(g.children[0]);
    }
    this.pickables = this.pickables.filter((o) => !names.includes(o.userData.group));
    if (names.includes('lights')) this.lightPoints = [];
    if (names.includes('walls')) this.doors.clear();
    if (names.includes('items')) { this.fires = []; }
    if (names.includes('systems') || names.includes('items')) { this.smokes = this.smokes.filter((sm) => !names.includes(sm.group)); }
  }

  // ------------------------------------------------------------------ ground
  buildGround(project, terrainType, season, snowCover, lotSide) {
    this.clear(['ground']);
    const size = Math.max(400, lotSide * 2.2);
    const geo = new THREE.PlaneGeometry(size, size, 1, 1); geo.rotateX(-Math.PI / 2);
    const mat = M.groundMaterial(terrainType, season, snowCover);
    this.lotRect = { x: -size / 2, z: -size / 2, w: size, d: size };
    mat.userData.uniforms.uMask.value = this.maskTex;
    mat.userData.uniforms.uMaskRect.value.set(this.lotRect.x, this.lotRect.z, this.lotRect.w, this.lotRect.d);
    const m = new THREE.Mesh(geo, mat); m.receiveShadow = true; m.userData = { type: 'ground', group: 'ground' };
    this.groups.ground.add(m); this.ground = m; this.pickables.push(m);
    // property boundary drawn like a blueprint sheet border: double line + ruler ticks + dimensions
    const half = lotSide / 2; const y = 0.06; const pts = [];
    const sq = (h) => [v3(-h, y, -h), v3(h, y, -h), v3(h, y, h), v3(-h, y, h), v3(-h, y, -h)];
    for (const h of [half, half + 1.2]) { const s = sq(h); for (let i = 0; i < 4; i++) pts.push(s[i], s[i + 1]); }
    for (let f = 0; f <= lotSide; f += 1) {
      const L = f % 10 === 0 ? 2.6 : f % 5 === 0 ? 1.7 : 0.9; const p = -half + f;
      pts.push(v3(p, y, -half), v3(p, y, -half + L), v3(p, y, half), v3(p, y, half - L), v3(-half, y, p), v3(-half + L, y, p), v3(half, y, p), v3(half - L, y, p));
    }
    const lines = new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(pts), M.lineMaterial('#ffffff', 0.55)); lines.userData.group = 'ground'; this.groups.ground.add(lines);
    const label = `${Math.round(lotSide)} ft`;
    for (const [x, z] of [[0, -half - 4], [0, half + 4], [-half - 4, 0], [half + 4, 0]]) { const s = textSprite(label); s.position.set(x, 0.5, z); s.userData.group = 'ground'; this.groups.ground.add(s); }
    return m;
  }

  // Soft reveal around everything built so the terrain shows through the blueprint.
  // mode 'finished': rooms fully revealed; 'skeleton': only a band along the walls, interiors stay blue.
  updateRevealMask(project, analysis, mode = 'finished') {
    this._maskMode = mode;
    const c = this.maskCanvas; const ctx = this.maskCtx; const R = this.lotRect;
    ctx.clearRect(0, 0, c.width, c.height);
    const sx = c.width / R.w; const sz = c.height / R.d;
    const X = (x) => (x - R.x) * sx; const Z = (z) => (z - R.z) * sz;
    const feather = (draw, maxW, steps = 14) => { for (let k = steps; k >= 1; k--) { const t = k / steps; ctx.globalAlpha = 0.09 + 0.06 * (1 - t) * (1 - t); draw(maxW * t); } ctx.globalAlpha = 1; };
    ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.strokeStyle = '#fff'; ctx.fillStyle = '#fff';
    const walls = project.structure.walls.filter((w) => w.floor === 0);
    feather((w) => { ctx.lineWidth = w * sx; ctx.beginPath(); for (const wl of walls) { ctx.moveTo(X(wl.a.x), Z(wl.a.z)); ctx.lineTo(X(wl.b.x), Z(wl.b.z)); } ctx.stroke(); }, mode === 'skeleton' ? 22 : 34);
    for (const it of project.items) {
      const def = itemDef(it.type); if (!def || !def.outdoor) continue;
      const w = it.w || def.w; const d = it.d || def.d; const s = it.scale || 1;
      if (def.build === 'pad' || def.build === 'deck' || def.build === 'porch' || def.build === 'path' || def.build === 'shed') feather((f) => { ctx.save(); ctx.translate(X(it.x), Z(it.z)); ctx.rotate(-it.rot * Math.PI / 180); ctx.fillRect(-(w / 2 + f / 2) * sx, -(d / 2 + f / 2) * sz, (w + f) * sx, (d + f) * sz); ctx.restore(); }, 12);
      else if (def.reveal) { ctx.save(); ctx.translate(X(it.x), Z(it.z)); ctx.rotate(-it.rot * Math.PI / 180); feather((f) => { ctx.fillRect(-(w / 2 + f / 2) * sx, -(d / 2 + f / 2) * sz, (w + f) * sx, (d + f) * sz); }, 10); ctx.globalAlpha = 1; ctx.fillRect(-(w / 2) * sx, -(d / 2) * sz, w * sx, d * sz); ctx.restore(); }
      else feather((f) => { ctx.beginPath(); ctx.ellipse(X(it.x), Z(it.z), (w * s / 2 + f) * sx, (d * s / 2 + f) * sz, 0, 0, Math.PI * 2); ctx.fill(); }, 10);
    }
    if (mode !== 'skeleton') {
      ctx.globalAlpha = 1;
      for (const fa of analysis.floors.slice(0, 1)) for (const r of fa.rooms) { ctx.beginPath(); r.polygon.forEach((p, i) => (i ? ctx.lineTo(X(p.x), Z(p.z)) : ctx.moveTo(X(p.x), Z(p.z)))); ctx.closePath(); ctx.fill(); }
    } else {
      // keep the room interiors blue so the blueprint shows between the walls
      ctx.globalCompositeOperation = 'destination-out'; ctx.globalAlpha = 1;
      for (const fa of analysis.floors.slice(0, 1)) for (const r of fa.rooms) {
        const cx = r.centroid.x; const cz = r.centroid.z;
        ctx.beginPath(); r.polygon.forEach((p, i) => { const q = { x: p.x + (cx - p.x) * 0.1, z: p.z + (cz - p.z) * 0.1 }; i ? ctx.lineTo(X(q.x), Z(q.z)) : ctx.moveTo(X(q.x), Z(q.z)); }); ctx.closePath(); ctx.fill();
      }
      ctx.globalCompositeOperation = 'source-over';
    }
    this.maskTex.needsUpdate = true;
    this.maskData = null;
  }

  // Grass tufts where the terrain shows and nothing is built on it. Seeded from the project id and
  // only rebuilt when something that moves grass changes, so placing a chair doesn't reshuffle the yard.
  buildGrass(project, analysis, { terrain, snowCover, season, density = 1 }) {
    const blockerKey = project.items.filter((it) => { const def = itemDef(it.type); return def && def.outdoor; }).map((it) => `${it.type}:${it.x}:${it.z}:${it.rot}:${it.w}:${it.d}`).join(';');
    const key = [terrain, snowCover, season, density, this._maskMode, project.id, project.structure.walls.filter((w) => w.floor === 0).map((w) => `${w.a.x},${w.a.z},${w.b.x},${w.b.z}`).join(';'), blockerKey].join('|');
    if (key === this._grassKey && this.groups.grass.children.length) return;
    this._grassKey = key;
    this.clear(['grass']);
    if (snowCover || season === 'winter' || density <= 0) return;
    let seed = 2166136261; for (let i = 0; i < project.id.length; i++) { seed ^= project.id.charCodeAt(i); seed = Math.imul(seed, 16777619) >>> 0; }
    const rand = () => { seed ^= seed << 13; seed >>>= 0; seed ^= seed >>> 17; seed ^= seed << 5; seed >>>= 0; return (seed % 1000003) / 1000003; };
    const typeDensity = { desert: 0.25, tundra: 0.7, alpine: 0.8, prairie: 1.2, rainforest: 0.9 }[terrain] ?? 1;
    const target = Math.round(2600 * density * typeDensity);
    const c = this.maskCanvas; const ctx = this.maskCtx; const data = ctx.getImageData(0, 0, c.width, c.height).data;
    const R = this.lotRect; const rooms = analysis.floors[0]?.rooms || [];
    const blockers = project.items.map((it) => ({ it, def: itemDef(it.type) })).filter(({ def }) => def && (def.build === 'pad' || def.build === 'deck' || def.build === 'porch' || def.build === 'path' || def.build === 'shed' || def.build === 'gardenbed' || def.build === 'septic' || def.build === 'solar'));
    const blocked = (x, z) => {
      for (const { it, def } of blockers) { const ang = -it.rot * Math.PI / 180; const dx = x - it.x; const dz = z - it.z; const lx = dx * Math.cos(ang) - dz * Math.sin(ang); const lz = dx * Math.sin(ang) + dz * Math.cos(ang); if (Math.abs(lx) < (it.w || def.w) / 2 + 0.3 && Math.abs(lz) < (it.d || def.d) / 2 + 0.3) return true; }
      for (const r of rooms) if (pointInPolygon({ x, z }, r.polygon)) return true;
      return false;
    };
    const walls0 = wallsOnFloor(project, 0);
    const positions = [];
    let tries = 0;
    while (positions.length < target && tries++ < target * 12) {
      const u = rand(); const v = rand(); const x = R.x + u * R.w; const z = R.z + v * R.d;
      const px = Math.floor(u * c.width); const py = Math.floor(v * c.height); const m = data[(py * c.width + px) * 4] / 255;
      if (m < 0.5 || rand() > m) continue;
      if (blocked(x, z)) continue;
      if (nearestWall(walls0, { x, z }, 1.0)) continue;
      positions.push({ x, z, m });
    }
    if (!positions.length) return;
    // crossed-quad blade geometry anchored at the base (0..1 tall)
    const g = new THREE.BufferGeometry();
    const verts = []; const uvs = []; const idx = [];
    const quad = (ax, az) => { const base = verts.length / 3; verts.push(-ax, 0, -az, ax, 0, az, ax, 1, az, -ax, 1, -az); uvs.push(0, 0, 1, 0, 1, 1, 0, 1); idx.push(base, base + 1, base + 2, base, base + 2, base + 3); };
    quad(0.5, 0); quad(0, 0.5); quad(0.35, 0.35);
    g.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2)); g.setIndex(idx); g.computeVertexNormals();
    const mesh = new THREE.InstancedMesh(g, M.grassMaterial(), positions.length);
    const tmp = new THREE.Object3D(); const col = new THREE.Color();
    const tintA = new THREE.Color(season === 'fall' ? '#d9b84a' : season === 'spring' ? '#b4e07a' : '#9ccb5c'); const tintB = new THREE.Color(season === 'fall' ? '#b08a36' : '#6fa843');
    positions.forEach((p, i) => {
      tmp.position.set(p.x, 0, p.z); tmp.rotation.set(0, hashf(p.x, p.z) * Math.PI, 0);
      const s = 0.9 + hashf(p.z, p.x) * 1.0; tmp.scale.set(s * 1.5, s * (0.7 + 0.7 * p.m), s * 1.5); tmp.updateMatrix(); mesh.setMatrixAt(i, tmp.matrix);
      col.copy(tintA).lerp(tintB, hashf(p.x * 3, p.z * 7)); mesh.setColorAt(i, col);
    });
    mesh.instanceMatrix.needsUpdate = true; mesh.instanceColor.needsUpdate = true; mesh.castShadow = false; mesh.receiveShadow = true; mesh.frustumCulled = false;
    mesh.userData.group = 'grass'; this.groups.grass.add(mesh);
  }

  // -------------------------------------------------------------- foundation
  buildFoundation(project, analysis) {
    this.clear(['foundation']);
    const g = this.groups.foundation; const fd = project.structure.foundation; const base = floorBase(fd);
    const fa = analysis.floors[0]; if (!fa) return;
    const concrete = M.concreteMaterial(); const depth = (fd.depthIn || 42) / 12;
    const extWalls = fa.walls.filter((w) => fa.wallInfo.get(w.id).kind === 'exterior');
    const addPick = (m, data) => { m.userData = { ...data, group: 'foundation' }; this.pickables.push(m); };
    if (fd.type === 'stem' || fd.type === 'crawl') {
      for (const w of extWalls) {
        const { dir, length } = wallVec(w); const mid = { x: (w.a.x + w.b.x) / 2, z: (w.a.z + w.b.z) / 2 }; const yaw = yawFromDir(dir);
        const footing = box(length + 0.5, (fd.footingHIn || 8) / 12, (fd.footingWIn || 16) / 12, concrete, mid.x, -depth + (fd.footingHIn || 8) / 24, mid.z); footing.rotation.y = yaw; footing.receiveShadow = true; g.add(footing);
        const stemH = depth - (fd.footingHIn || 8) / 12 + base;
        const stem = box(length + 0.5, stemH, (fd.stemIn || 8) / 12, concrete, mid.x, -depth + (fd.footingHIn || 8) / 12 + stemH / 2, mid.z); stem.rotation.y = yaw; stem.castShadow = true; stem.receiveShadow = true; g.add(stem); addPick(stem, { type: 'foundation' });
      }
      if (fd.type === 'stem') for (const r of fa.rooms) { const geo = polyGeometry(orientY(r.polygon.map((p) => v3(p.x, base - 0.01, p.z)), true)); if (geo) { const m = new THREE.Mesh(geo, concrete); m.receiveShadow = true; g.add(m); addPick(m, { type: 'foundation' }); } }
      if (fd.type === 'crawl') for (const r of fa.rooms) { const geo = polyGeometry(orientY(r.polygon.map((p) => v3(p.x, 0.02, p.z)), true)); if (geo) { const m = new THREE.Mesh(geo, M.gravelMaterial()); m.receiveShadow = true; g.add(m); } }
    } else if (fd.type === 'slab') {
      for (const r of fa.rooms) { const geo = polyGeometry(orientY(r.polygon.map((p) => v3(p.x, base, p.z)), true)); if (!geo) continue; const m = new THREE.Mesh(geo, concrete); m.receiveShadow = true; g.add(m); addPick(m, { type: 'foundation' }); }
      for (const w of extWalls) { const { dir, length } = wallVec(w); const mid = { x: (w.a.x + w.b.x) / 2, z: (w.a.z + w.b.z) / 2 }; const edge = box(length + 1, 1.0 + base, 1.0, concrete, mid.x, (base - 1.0) / 2, mid.z); edge.rotation.y = yawFromDir(dir); edge.castShadow = true; edge.receiveShadow = true; g.add(edge); addPick(edge, { type: 'foundation' }); }
    } else {
      const spacing = fd.pierSpacingFt || 8; const beamY = base - 1.0;
      for (const w of extWalls) {
        const { dir, length } = wallVec(w); const n = Math.max(2, Math.ceil(length / spacing) + 1);
        for (let i = 0; i < n; i++) {
          const t = i / (n - 1); const x = w.a.x + dir.x * length * t; const z = w.a.z + dir.z * length * t;
          const pier = cyl(0.5, depth + beamY, concrete, x, (-depth + beamY) / 2, z); pier.castShadow = true; g.add(pier); addPick(pier, { type: 'foundation' });
          g.add(box(0.46, 0.6, 0.46, M.lumberMaterial(), x, beamY - 0.3, z));
        }
        const mid = { x: (w.a.x + w.b.x) / 2, z: (w.a.z + w.b.z) / 2 };
        const beam = box(length + 0.5, 1.0, 0.45, M.lumberMaterial(), mid.x, beamY, mid.z); beam.rotation.y = yawFromDir(dir); beam.castShadow = true; g.add(beam);
      }
      for (const r of fa.rooms) { const bb = r.bbox; for (let x = bb.minX + spacing; x < bb.maxX - 1; x += spacing) for (let z = bb.minZ + spacing; z < bb.maxZ - 1; z += spacing) { const pier = cyl(0.5, depth + beamY, concrete, x, (-depth + beamY) / 2, z); g.add(pier); } }
    }
    // stoops at exterior doors
    for (const w of extWalls) {
      const info = fa.wallInfo.get(w.id); const { dir } = wallVec(w); const left = perp(dir);
      for (const o of w.openings) {
        if (o.kind !== 'door') continue;
        const cx = w.a.x + dir.x * (o.along + o.width / 2); const cz = w.a.z + dir.z * (o.along + o.width / 2);
        const sides = info.outward === 'both' ? ['left', 'right'] : [info.outward];
        for (const side of sides) {
          const n = side === 'left' ? left : { x: -left.x, z: -left.z };
          const st = openingStyle('door', o.style); const depthS = st.garage ? 1.5 : 3.5; const wS = o.width + 1.5;
          const stoop = box(wS, Math.max(0.25, base - 0.08), depthS, concrete, cx + n.x * (depthS / 2 + 0.4), (base - 0.08) / 2, cz + n.z * (depthS / 2 + 0.4)); stoop.rotation.y = yawFromDir(dir); stoop.receiveShadow = true; stoop.castShadow = true; g.add(stoop);
          if (base > 1.2 && !st.garage) { const step = box(wS, Math.max(0.25, base * 0.5), 1.2, concrete, cx + n.x * (depthS + 1.0), base * 0.25, cz + n.z * (depthS + 1.0)); step.rotation.y = yawFromDir(dir); step.castShadow = true; g.add(step); }
          if (st.garage) { const apron = box(wS + 2, 0.2, 6, M.concreteMaterial(), cx + n.x * 3.5, 0.1, cz + n.z * 3.5); apron.rotation.y = yawFromDir(dir); apron.receiveShadow = true; g.add(apron); }
        }
      }
    }
  }

  // ----------------------------------------------------------------- framing
  buildFraming(project, analysis, roofs, maxFloor, opts = {}) {
    this.clear(['framing']);
    const g = this.groups.framing; const lumber = M.lumberMaterial();
    const instances = []; const tmp = new THREE.Object3D(); const spacing = project.structure.studSpacing || 16;
    const pushBox = (cx, cy, cz, w, h, d, yaw) => { tmp.position.set(cx, cy, cz); tmp.rotation.set(0, yaw, 0); tmp.scale.set(w, h, d); tmp.updateMatrix(); instances.push(tmp.matrix.clone()); };
    analysis.floors.forEach((fa, fi) => {
      if (fi > maxFloor) return;
      const H = floorHeight(project, fi); const y0 = floorElevation(project, fi);
      for (const w of fa.walls) {
        const info = fa.wallInfo.get(w.id); const dims = wallDims(info.kind);
        const { dir, length } = wallVec(w); const yaw = yawFromDir(dir);
        const fr = frameWall(w, length, H, dims.studD, spacing);
        for (const m of fr.members) { const cxl = m.x + m.w / 2; pushBox(w.a.x + dir.x * cxl, y0 + m.y + m.h / 2, w.a.z + dir.z * cxl, m.w, m.h, dims.studD, yaw); }
      }
      const onSlab = fi === 0 && (project.structure.foundation.type === 'slab' || project.structure.foundation.type === 'stem');
      if (!onSlab) {
        const jd = 9.25 * IN; const yJ = y0 - jd / 2 - 0.06;
        for (const comp of fa.components) {
          if (comp.length < 2) continue;
          const bb = bboxOfWalls(comp); const alongX = bb.w <= bb.d;
          const n0 = alongX ? bb.minX : bb.minZ; const n1 = alongX ? bb.maxX : bb.maxZ; const span = alongX ? bb.d : bb.w;
          for (let p = n0; p <= n1 + 1e-6; p += 16 * IN) { if (alongX) pushBox(p, yJ, (bb.minZ + bb.maxZ) / 2, STUD_T, jd, span, 0); else pushBox((bb.minX + bb.maxX) / 2, yJ, p, span, jd, STUD_T, 0); }
          pushBox((bb.minX + bb.maxX) / 2, yJ, bb.minZ, bb.w, jd, STUD_T, 0); pushBox((bb.minX + bb.maxX) / 2, yJ, bb.maxZ, bb.w, jd, STUD_T, 0);
          pushBox(bb.minX, yJ, (bb.minZ + bb.maxZ) / 2, STUD_T, jd, bb.d, 0); pushBox(bb.maxX, yJ, (bb.minZ + bb.maxZ) / 2, STUD_T, jd, bb.d, 0);
        }
      }
    });
    if (instances.length) {
      const im = new THREE.InstancedMesh(BOX, lumber, instances.length);
      instances.forEach((m, i) => im.setMatrixAt(i, m)); im.castShadow = true; im.receiveShadow = true; im.instanceMatrix.needsUpdate = true;
      im.userData = { type: 'framing', group: 'framing' }; g.add(im);
    }
    for (const r of roofs) {
      if (r.floor > maxFloor) continue;
      const rd = 9.25 * IN;
      const addMember = (a, b, h, t) => {
        const A = v3(a.x, a.y, a.z); const B = v3(b.x, b.y, b.z); const d = new THREE.Vector3().subVectors(B, A); const L = d.length(); if (L < 0.05) return; d.normalize();
        const m = new THREE.Mesh(BOX, lumber); m.scale.set(L, h, t);
        const z = new THREE.Vector3().crossVectors(UP, d).normalize(); if (z.lengthSq() < 1e-6) z.set(0, 0, 1); const y = new THREE.Vector3().crossVectors(z, d).normalize();
        m.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(d, y, z));
        m.position.copy(A).add(B).multiplyScalar(0.5).addScaledVector(y, -h / 2 - 0.02); m.castShadow = true; m.receiveShadow = true; m.userData.group = 'framing'; g.add(m);
      };
      for (const rf of r.rafters) addMember(rf.a, rf.b, rd, STUD_T);
      for (const rf of r.hipRafters) addMember(rf.a, rf.b, rd, STUD_T);
      if (r.ridge) addMember({ ...r.ridge.a, y: r.ridge.a.y + 0.1 }, { ...r.ridge.b, y: r.ridge.b.y + 0.1 }, 11.25 * IN, STUD_T);
      for (const j of r.joists) addMember({ ...j.a, y: j.a.y + rd + 0.02 }, { ...j.b, y: j.b.y + rd + 0.02 }, rd, STUD_T);
    }
  }

  // -------------------------------------------------------------- insulation
  // Skeleton with sheathing outside, batts in the bays, and poly sheeting inside exterior walls.
  buildInsulation(project, analysis, maxFloor) {
    this.clear(['insulation']);
    const g = this.groups.insulation; const spacing = project.structure.studSpacing || 16;
    const batt = M.insulationMaterial(project.structure.insulation); const osb = M.osbMaterial(); const poly = M.polyMaterial();
    const instances = []; const tmp = new THREE.Object3D();
    analysis.floors.forEach((fa, fi) => {
      if (fi > maxFloor) return;
      const H = floorHeight(project, fi); const y0 = floorElevation(project, fi);
      for (const w of fa.walls) {
        const info = fa.wallInfo.get(w.id); if (info.kind !== 'exterior') continue;
        const dims = wallDims('exterior'); const { dir, length: L } = wallVec(w); const left = perp(dir); const yaw = yawFromDir(dir);
        const dir3 = v3(dir.x, 0, dir.z); const left3 = v3(left.x, 0, left.z); const right3 = left3.clone().negate(); const a3 = v3(w.a.x, y0, w.a.z); const b3 = v3(w.b.x, y0, w.b.z);
        const outLeft = info.outward === 'left' || info.outward === 'both'; const outRight = info.outward === 'right' || info.outward === 'both';
        const holes = w.openings.map((o) => ({ x0: o.along, x1: o.along + o.width, y0: o.sill, y1: o.sill + o.height, w: o.width }));
        const fr = frameWall(w, L, H, dims.studD, spacing);
        for (const b of fr.bays) { const cxl = (b.x0 + b.x1) / 2; tmp.position.set(w.a.x + dir.x * cxl, y0 + (b.y0 + b.y1) / 2, w.a.z + dir.z * cxl); tmp.rotation.set(0, yaw, 0); tmp.scale.set(b.x1 - b.x0, b.y1 - b.y0, dims.studD * 0.9); tmp.updateMatrix(); instances.push(tmp.matrix.clone()); }
        // sheathing on the outside face(s), poly on the inside face(s)
        const faces = [['left', outLeft, left3, dir3, a3], ['right', outRight, right3, dir3.clone().negate(), b3]];
        for (const [side, isOut, n3, xAxis, origin] of faces) {
          const hsAll = side === 'left' ? holes : holes.map((h) => ({ ...h, x0: L - h.x1, x1: L - h.x0 }));
          const off = dims.studD / 2 + (isOut ? 0.5 * IN : 0.02);
          // Sheathing is shown "half hung" (whole 4 ft sheets from one end) so the batts stay visible from outside;
          // the poly sheeting inside is drawn full length.
          const cut = isOut && L > 7 ? Math.min(L, Math.max(4, Math.round((L * 0.5) / 4) * 4)) : L;
          const hs = hsAll.map((h) => ({ ...h, x0: Math.max(0, h.x0), x1: Math.min(cut, h.x1) })).filter((h) => h.x1 - h.x0 > 0.05);
          const geo = wallFaceGeometry(0, cut, H, hs); geo.applyMatrix4(new THREE.Matrix4().makeBasis(xAxis, UP, n3).setPosition(origin.clone().addScaledVector(n3, off)));
          const m = new THREE.Mesh(geo, isOut ? osb : poly); m.castShadow = isOut; m.receiveShadow = true; g.add(m);
          m.userData = { type: 'wallface', wallId: w.id, side, exterior: isOut, floor: fi, group: 'insulation' }; this.pickables.push(m);
        }
      }
    });
    if (instances.length) { const im = new THREE.InstancedMesh(BOX, batt, instances.length); instances.forEach((m, i) => im.setMatrixAt(i, m)); im.instanceMatrix.needsUpdate = true; im.receiveShadow = true; im.userData.group = 'insulation'; g.add(im); }
  }

  // ------------------------------------------------------------------- walls
  buildWalls(project, analysis, maxFloor, opts = {}) {
    this.clear(['walls']);
    const g = this.groups.walls; const ex = project.exterior; const stone = ex.stone?.enabled ? ex.stone : null;
    const addPick = (m, data) => { m.userData = { ...data, group: 'walls' }; this.pickables.push(m); };
    analysis.floors.forEach((fa, fi) => {
      if (fi > maxFloor) return;
      const H = floorHeight(project, fi); const y0 = floorElevation(project, fi);
      for (const w of fa.walls) {
        const info = fa.wallInfo.get(w.id); const kind = info.kind; const dims = wallDims(kind);
        const { dir, length: L } = wallVec(w); const left = perp(dir); const yaw = yawFromDir(dir);
        const dir3 = v3(dir.x, 0, dir.z); const left3 = v3(left.x, 0, left.z); const right3 = left3.clone().negate();
        const a3 = v3(w.a.x, y0, w.a.z); const b3 = v3(w.b.x, y0, w.b.z);
        const cornerA = endHasCorner(w, 'a', fa.walls); const cornerB = endHasCorner(w, 'b', fa.walls);
        const outLeft = info.outward === 'left' || info.outward === 'both'; const outRight = info.outward === 'right' || info.outward === 'both';
        const offL = (outLeft ? dims.offsetOut : dims.offsetIn) + dims.studD / 2; const offR = (outRight ? dims.offsetOut : dims.offsetIn) + dims.studD / 2;
        const sidingType = w.faces?.ext?.type || ex.sidingType; const sidingDef = SIDING.find((s) => s.id === sidingType) || SIDING[0];
        const sidingColor = w.faces?.ext?.color || (sidingDef.stained ? ex.stainColor : ex.sidingColor);
        const sidingMat = M.sidingMaterial(sidingType, sidingColor);
        const paintFor = (roomIdx) => { const r = roomIdx != null ? fa.rooms[roomIdx] : null; return M.paintMaterial(w.faces?.int?.color || (r && r.paint) || project.interior.paintColor); };
        const matL = outLeft ? sidingMat : paintFor(info.leftRoom); const matR = outRight ? sidingMat : paintFor(info.rightRoom);
        const holes = w.openings.map((o) => ({ o, x0: o.along, x1: o.along + o.width, y0: o.sill, y1: o.sill + o.height, w: o.width, arch: o.kind === 'opening' && openingStyle('opening', o.style).arch }));
        const holesR = holes.map((h) => ({ ...h, x0: L - h.x1, x1: L - h.x0 }));
        const extA = cornerA ? (kind === 'exterior' ? dims.offsetOut : dims.offsetIn) + dims.studD / 2 : 0;
        const extB = cornerB ? (kind === 'exterior' ? dims.offsetOut : dims.offsetIn) + dims.studD / 2 : 0;
        {
          const geo = wallFaceGeometry(-extA, L + extB, H, holes); geo.applyMatrix4(new THREE.Matrix4().makeBasis(dir3, UP, left3).setPosition(a3.clone().addScaledVector(left3, offL)));
          const m = new THREE.Mesh(geo, matL); m.castShadow = true; m.receiveShadow = true; g.add(m); addPick(m, { type: 'wallface', wallId: w.id, side: 'left', exterior: outLeft, floor: fi });
        }
        {
          const geo = wallFaceGeometry(-extB, L + extA, H, holesR); geo.applyMatrix4(new THREE.Matrix4().makeBasis(dir3.clone().negate(), UP, right3).setPosition(b3.clone().addScaledVector(right3, offR)));
          const m = new THREE.Mesh(geo, matR); m.castShadow = true; m.receiveShadow = true; g.add(m); addPick(m, { type: 'wallface', wallId: w.id, side: 'right', exterior: outRight, floor: fi });
        }
        // stone veneer wainscot on exterior faces of ground-floor walls
        if (stone && fi === 0 && kind === 'exterior') {
          const hS = Math.min(stone.heightFt, H - 0.5); const sm = M.stoneMaterial(stone.type); const cap = M.trimMaterial(ex.trimColor);
          for (const [isOut, n3, xAxis, origin, off, hs] of [[outLeft, left3, dir3, a3, offL, holes], [outRight, right3, dir3.clone().negate(), b3, offR, holes.map((h) => ({ ...h, x0: L - h.x1, x1: L - h.x0 }))]]) {
            if (!isOut) continue;
            // door openings cut the stone right down to grade; the cap sill stops at each door too
            const stoneHoles = hs.filter((h) => h.y0 < hS).map((h) => (h.y0 <= 0.05 ? { ...h, y0: -0.35, y1: Math.max(h.y1, hS + 0.5), x0: h.x0 - 0.12, x1: h.x1 + 0.12 } : h));
            const geo = wallFaceGeometry(-extA - 0.1, L + extB + 0.1, hS, stoneHoles, -0.35); geo.applyMatrix4(new THREE.Matrix4().makeBasis(xAxis, UP, n3).setPosition(origin.clone().addScaledVector(n3, off + 0.14)));
            const m = new THREE.Mesh(geo, sm); m.castShadow = true; m.receiveShadow = true; g.add(m); addPick(m, { type: 'wallface', wallId: w.id, side: isOut === outLeft && n3 === left3 ? 'left' : 'right', exterior: true, floor: fi, stone: true });
            const doorCuts = stoneHoles.filter((h) => h.y0 < 0).map((h) => [h.x0, h.x1]).sort((p, q) => p[0] - q[0]);
            let segStart = -0.15 - (xAxis === dir3 ? extA : extB);
            const segEnd = L + 0.15 + (xAxis === dir3 ? extB : extA);
            for (const [c0, c1] of [...doorCuts, [segEnd, segEnd]]) {
              const len = c0 - segStart; if (len > 0.1) { const sill = box(len, 0.14, 0.22, cap, 0, 0, 0); sill.position.copy(origin).addScaledVector(xAxis, segStart + len / 2).addScaledVector(n3, off + 0.14).setY(y0 + hS + 0.05); sill.rotation.y = yaw; sill.castShadow = true; g.add(sill); }
              segStart = c1;
            }
          }
        }
        // baseboards and crown molding on every painted (inside) face, broken at doors and cased openings
        const trimCfg = project.interior.trim || {};
        if (trimCfg.baseboards !== false || trimCfg.crown) {
          const trimMat = M.trimMaterial(trimCfg.color || '#f4f2ec'); const bbH = (trimCfg.baseboardIn || 5.5) * IN; const crH = (trimCfg.crownIn || 3.5) * IN;
          const faces = [[!outLeft, left3, dir3, a3, offL, holes, -extA, L + extB], [!outRight, right3, dir3.clone().negate(), b3, offR, holesR, -extB, L + extA]];
          const runs = (x0, x1, cuts) => { const out = []; let start = x0; for (const [c0, c1] of cuts.sort((p, q) => p[0] - q[0])) { if (c0 - start > 0.08) out.push([start, Math.min(c0, x1)]); start = Math.max(start, c1); } if (x1 - start > 0.08) out.push([start, x1]); return out; };
          for (const [isIn, n3, xAxis, origin, off, hs, x0, x1] of faces) {
            if (!isIn) continue;
            if (trimCfg.baseboards !== false) for (const [s0, s1] of runs(x0, x1, hs.filter((h) => h.y0 < 0.1).map((h) => [h.x0 - 0.02, h.x1 + 0.02]))) { const m = box(s1 - s0, bbH, 0.07, trimMat, 0, 0, 0); m.position.copy(origin).addScaledVector(xAxis, (s0 + s1) / 2).addScaledVector(n3, off + 0.035).setY(y0 + bbH / 2); m.rotation.y = yaw; m.receiveShadow = true; g.add(m); }
            if (trimCfg.crown) for (const [s0, s1] of runs(x0, x1, hs.filter((h) => h.y1 > H - crH - 0.05).map((h) => [h.x0, h.x1]))) { const m = box(s1 - s0, crH, crH * 0.9, trimMat, 0, 0, 0); m.position.copy(origin).addScaledVector(xAxis, (s0 + s1) / 2).addScaledVector(n3, off + crH * 0.45).setY(y0 + H - crH / 2); m.rotation.y = yaw; g.add(m); }
          }
        }
        const T = offL + offR; const centerOff = (offL - offR) / 2;
        const mid = a3.clone().add(b3).multiplyScalar(0.5).addScaledVector(left3, centerOff);
        const top = box(L + extA + extB, 0.08, T, M.lumberMaterial(), 0, 0, 0); top.position.copy(mid).addScaledVector(dir3, (extB - extA) / 2).setY(y0 + H - 0.04); top.rotation.y = yaw; g.add(top);
        if (!cornerA) { const cap = box(0.06, H, T, kind === 'exterior' ? M.trimMaterial(ex.trimColor) : matL, 0, 0, 0); cap.position.copy(a3).addScaledVector(left3, centerOff).setY(y0 + H / 2); cap.rotation.y = yaw; g.add(cap); }
        if (!cornerB) { const cap = box(0.06, H, T, kind === 'exterior' ? M.trimMaterial(ex.trimColor) : matR, 0, 0, 0); cap.position.copy(b3).addScaledVector(left3, centerOff).setY(y0 + H / 2); cap.rotation.y = yaw; g.add(cap); }
        const trim = M.trimMaterial(ex.trimColor); const jambMat = M.trimMaterial('#f1efe8');
        for (const o of w.openings) {
          const st = openingStyle(o.kind, o.style);
          const c = a3.clone().addScaledVector(dir3, o.along + o.width / 2).addScaledVector(left3, centerOff);
          const yc = y0 + o.sill + o.height / 2;
          const place = (m, along, y, lat) => { m.position.copy(a3).addScaledVector(dir3, along).addScaledVector(left3, centerOff + lat).setY(y); m.rotation.y = yaw; };
          const jambL = box(0.05, o.height, T - 0.02, jambMat, 0, 0, 0); place(jambL, o.along + 0.025, yc, 0); g.add(jambL);
          const jambR = box(0.05, o.height, T - 0.02, jambMat, 0, 0, 0); place(jambR, o.along + o.width - 0.025, yc, 0); g.add(jambR);
          if (!(o.kind === 'opening' && st.arch)) { const head = box(o.width, 0.05, T - 0.02, jambMat, 0, 0, 0); place(head, o.along + o.width / 2, y0 + o.sill + o.height - 0.025, 0); g.add(head); }
          if (o.kind === 'window' || (o.kind === 'opening' && o.sill > 0.5)) { const sill = box(o.width + 0.3, 0.12, T + 0.25, trim, 0, 0, 0); place(sill, o.along + o.width / 2, y0 + o.sill - 0.06, 0); sill.castShadow = true; g.add(sill); }
          const fill = new THREE.Group(); fill.position.copy(c).setY(yc); fill.rotation.y = yaw;
          const inwardZ = info.outward === 'left' ? -1 : 1;
          if (o.kind === 'window') this._windowFill(fill, o, st, T);
          else if (o.kind === 'door') this._doorFill(fill, o, st, T, inwardZ, info, ex);
          g.add(fill);
          const pickBox = box(o.width, o.height, T + 0.1, M.ghostMaterial('#000000'), 0, 0, 0); pickBox.material = pickBox.material.clone(); pickBox.material.visible = false; place(pickBox, o.along + o.width / 2, yc, 0); g.add(pickBox);
          addPick(pickBox, { type: 'opening', wallId: w.id, openingId: o.id, floor: fi, kind: o.kind });
          for (const [side, isOut, off] of [['left', outLeft, offL], ['right', outRight, offR]]) {
            if (o.kind === 'opening' && st.arch) continue;
            const mat = isOut ? trim : jambMat; const cw = 0.3; const ct = 0.07; const lat = (side === 'left' ? 1 : -1) * (off + ct / 2) - centerOff;
            const yTop = y0 + o.sill + o.height; const yBot = y0 + o.sill;
            const below = o.kind === 'window' ? cw * 0.8 : 0; const sideLen = o.height + cw + below; const sideMid = (yTop + cw + yBot - below) / 2;
            const l = box(cw, sideLen, ct, mat, 0, 0, 0); place(l, o.along - cw / 2, sideMid, lat); g.add(l);
            const r = box(cw, sideLen, ct, mat, 0, 0, 0); place(r, o.along + o.width + cw / 2, sideMid, lat); g.add(r);
            const hd = box(o.width + 2 * cw, cw, ct, mat, 0, 0, 0); place(hd, o.along + o.width / 2, yTop + cw / 2, lat); g.add(hd);
            if (o.kind === 'window') { const bt = box(o.width + 2 * cw, cw * 0.8, ct, mat, 0, 0, 0); place(bt, o.along + o.width / 2, yBot - cw * 0.4, lat); g.add(bt); }
            l.castShadow = r.castShadow = hd.castShadow = true;
          }
        }
        if (kind === 'exterior') {
          for (const [has, pt] of [[cornerA, a3], [cornerB, b3]]) {
            if (!has) continue;
            const other = fa.walls.find((o) => o.id !== w.id && (Math.hypot(o.a.x - pt.x, o.a.z - pt.z) < 0.06 || Math.hypot(o.b.x - pt.x, o.b.z - pt.z) < 0.06) && fa.wallInfo.get(o.id).kind === 'exterior');
            if (!other || w.id > other.id) continue;
            const oInfo = fa.wallInfo.get(other.id); if (oInfo.outward === 'both' || info.outward === 'both') continue;
            const outN = outLeft ? left3 : right3; const od = wallVec(other).dir; const oLeft = perp(od); const oOut = oInfo.outward === 'left' ? v3(oLeft.x, 0, oLeft.z) : v3(-oLeft.x, 0, -oLeft.z);
            const cornerPt = pt.clone().addScaledVector(outN, dims.offsetOut + dims.studD / 2 - 0.2).addScaledVector(oOut, dims.offsetOut + dims.studD / 2 - 0.2);
            const cb = box(0.48, H + 0.02, 0.48, trim, cornerPt.x, y0 + H / 2, cornerPt.z); cb.castShadow = true; g.add(cb);
          }
        }
      }
    });
  }

  _windowFill(group, o, st, T) {
    const glass = M.glassMaterial(); const frame = 0.12;
    const pane = new THREE.Mesh(new THREE.PlaneGeometry(o.width - 0.1, o.height - 0.1), glass); group.add(pane); // faces across the wall (group is yawed with the wall)
    const fw = M.trimMaterial('#f4f2ec');
    group.add(box(frame, o.height, 0.12, fw, -o.width / 2 + frame / 2, 0, 0), box(frame, o.height, 0.12, fw, o.width / 2 - frame / 2, 0, 0), box(o.width, frame, 0.12, fw, 0, o.height / 2 - frame / 2, 0), box(o.width, frame, 0.12, fw, 0, -o.height / 2 + frame / 2, 0));
    if (o.style === 'single' || o.style === 'double' || o.style === 'tall') group.add(box(o.width, 0.1, 0.14, fw, 0, 0, 0));
    if (o.style === 'double' || o.style === 'slider') group.add(box(0.1, o.height, 0.14, fw, 0, 0, 0));
    if (o.style === 'clerestory') for (let i = 1; i < Math.floor(o.width / 2); i++) group.add(box(0.08, o.height, 0.14, fw, -o.width / 2 + i * 2, 0, 0));
  }

  // Doors hang on pivots so they can open. Swing doors rotate at the hinge, sliders translate, garage doors lift.
  _doorFill(group, o, st, T, inwardZ, info, ex) {
    const t = 0.15;
    const rec = { kind: 'swing', parts: [], target: o.open ? 1 : 0, t: o.open ? 1 : 0, width: o.width, height: o.height };
    this.doors.set(o.id, rec);
    if (st.garage) {
      const mat = M.trimMaterial(ex.trimColor); const lift = new THREE.Group(); group.add(lift);
      const panel = box(o.width - 0.1, o.height - 0.05, t, mat, 0, 0, 0); panel.castShadow = true; lift.add(panel);
      const n = 4; const line = M.paintMaterial('#55565a');
      for (let i = 1; i < n; i++) lift.add(box(o.width - 0.1, 0.05, t + 0.02, line, 0, -o.height / 2 + (o.height / n) * i, 0));
      const nw = o.width > 12 ? 4 : 2; for (let i = 0; i < nw; i++) lift.add(box(o.width / nw - 0.6, 0.4, t + 0.02, M.glassMaterial(), -o.width / 2 + (o.width / nw) * (i + 0.5), o.height / 2 - o.height / n / 2, 0));
      rec.kind = 'lift'; rec.parts.push({ obj: lift, lift: o.height - 0.4 }); return;
    }
    const doorHex = ex.doorColor || ex.trimColor; const slabMat = info.kind === 'exterior' ? M.trimMaterial(doorHex) : M.trimMaterial('#efece4');
    const leaves = st.fixedLeaves || (o.leaves === 2 ? 2 : 1);
    const lw = (o.width - 0.08) / leaves;
    for (let i = 0; i < leaves; i++) {
      const cx = -o.width / 2 + 0.04 + lw * (i + 0.5);
      // hinge side: single doors hinge left unless flipped; doubles hinge at the outer edges
      const hingeAtLeft = leaves === 2 ? i === 0 : !o.flip;
      const pivot = new THREE.Group(); pivot.position.set(hingeAtLeft ? cx - lw / 2 : cx + lw / 2, 0, 0); group.add(pivot);
      const leaf = new THREE.Group(); leaf.position.set(hingeAtLeft ? lw / 2 : -lw / 2, 0, 0); pivot.add(leaf);
      if (st.glass) {
        const fw = M.trimMaterial(info.kind === 'exterior' ? doorHex : '#f4f2ec'); const glass = M.glassMaterial(); const fr = 0.3; const ih = o.height - 0.05;
        leaf.add(box(fr, ih, t, fw, -lw / 2 + fr / 2, 0, 0), box(fr, ih, t, fw, lw / 2 - fr / 2, 0, 0), box(lw, fr, t, fw, 0, ih / 2 - fr / 2, 0), box(lw, fr * 1.6, t, fw, 0, -ih / 2 + fr * 0.8, 0));
        const pane = new THREE.Mesh(new THREE.PlaneGeometry(lw - 2 * fr, ih - fr * 2.6), glass); pane.position.set(0, (fr * 1.6 - fr) / 2, 0); leaf.add(pane);
      } else if (st.id === 'barn') {
        const wood = M.woodMaterial(ex.stainColor); leaf.add(box(lw, o.height - 0.05, t, wood, 0, 0, 0));
        const bar = M.woodMaterial('#3b2a1a'); leaf.add(box(lw, 0.3, 0.05, bar, 0, o.height * 0.3, t / 2 + 0.03), box(lw, 0.3, 0.05, bar, 0, -o.height * 0.3, t / 2 + 0.03), box(0.3, o.height - 0.2, 0.05, bar, lw * 0.3, 0, t / 2 + 0.03), box(0.3, o.height - 0.2, 0.05, bar, -lw * 0.3, 0, t / 2 + 0.03));
      } else {
        const slab = box(lw, o.height - 0.05, t, slabMat, 0, 0, 0); slab.castShadow = true; leaf.add(slab);
        const pm = M.trimMaterial(info.kind === 'exterior' ? doorHex : '#e4e0d6');
        for (const zs of [1, -1]) { leaf.add(box(lw * 0.6, o.height * 0.38, 0.03, pm, 0, o.height * 0.22, zs * (t / 2 + 0.01))); leaf.add(box(lw * 0.6, o.height * 0.3, 0.03, pm, 0, -o.height * 0.24, zs * (t / 2 + 0.01))); }
        if (st.dutch) { for (const zs of [1, -1]) leaf.add(box(lw + 0.02, 0.04, 0.02, M.paintMaterial('#3a3028'), 0, -o.height * 0.04, zs * (t / 2 + 0.015))); leaf.add(box(lw + 0.1, 0.06, t + 0.35, pm, 0, -o.height * 0.04 + 0.03, inwardZ * 0.12)); }
      }
      const handle = cyl(0.06, 0.5, M.metalMaterial('#8d8f93'), hingeAtLeft ? lw / 2 - 0.3 : -lw / 2 + 0.3, -0.2, t / 2 + 0.1, 8); handle.rotation.x = Math.PI / 2; leaf.add(handle);
      const handle2 = handle.clone(); handle2.position.z = -t / 2 - 0.1; leaf.add(handle2);
      if (st.slides) { rec.kind = 'slide'; rec.parts.push({ obj: pivot, slide: (hingeAtLeft ? -1 : 1) * lw * 0.92, base: pivot.position.x }); }
      else { const leafDir = hingeAtLeft ? 1 : -1; rec.parts.push({ obj: pivot, swing: -inwardZ * leafDir * 1.75 }); }
    }
    if (st.id === 'barn') { const track = box(o.width * 2, 0.15, 0.1, M.metalMaterial('#2a2a2a'), 0, o.height / 2 + 0.25, inwardZ * (T / 2 + 0.1)); group.add(track); for (const p of rec.parts) p.obj.position.z = inwardZ * (T / 2 + 0.12); }
  }

  // Animate doors toward their open/closed target. Returns true while anything is still moving.
  animateDoors(dt) {
    let moving = false;
    for (const rec of this.doors.values()) {
      if (Math.abs(rec.t - rec.target) < 0.002) { rec.t = rec.target; continue; }
      rec.t += (rec.target - rec.t) * Math.min(1, dt * 6); moving = true;
      const e = rec.t < 0.5 ? 2 * rec.t * rec.t : 1 - Math.pow(-2 * rec.t + 2, 2) / 2;
      for (const p of rec.parts) { if (p.swing != null) p.obj.rotation.y = p.swing * e; else if (p.slide != null) p.obj.position.x = p.base + p.slide * e; else if (p.lift != null) p.obj.position.y = p.lift * e; }
    }
    return moving;
  }
  setDoorOpen(openingId, open) { const rec = this.doors.get(openingId); if (rec) rec.target = open ? 1 : 0; }

  // -------------------------------------------------------------------- roof
  buildRoofs(project, roofs, maxFloor, opts = {}) {
    this.clear(['roof']);
    const g = this.groups.roof; const ex = project.exterior; const under = M.osbMaterial(); const trim = M.trimMaterial(ex.trimColor);
    const sidingDef = SIDING.find((s) => s.id === ex.sidingType) || SIDING[0];
    const siding = M.sidingMaterial(ex.sidingType, sidingDef.stained ? ex.stainColor : ex.sidingColor);
    const addPick = (m, data) => { m.userData = { ...data, group: 'roof' }; this.pickables.push(m); };
    for (const r of roofs) {
      if (r.floor > maxFloor) continue;
      const rs = r.settings || project.structure.roof; const roofMat = M.roofingMaterial(rs.material || project.structure.roof.material, rs.color || project.structure.roof.color);
      for (const pl of r.planes) {
        let pts = pl.pts.map((p) => v3(p.x, p.y, p.z)); let geo = polyGeometry(pts, { uAxis: r.axis === 'x' ? v3(1, 0, 0) : v3(0, 0, 1) });
        if (!geo) continue;
        if (geo.attributes.normal.getY(0) < 0) { geo.dispose(); pts = pts.reverse(); geo = polyGeometry(pts, { uAxis: r.axis === 'x' ? v3(1, 0, 0) : v3(0, 0, 1) }); if (!geo) continue; }
        const m = new THREE.Mesh(geo, roofMat); m.castShadow = true; m.receiveShadow = true; g.add(m); addPick(m, { type: 'roof', floor: r.floor, key: r.key });
        const lowered = pts.map((p) => v3(p.x, p.y - ROOF_T, p.z)).reverse();
        const geoU = polyGeometry(lowered); if (geoU) { const mu = new THREE.Mesh(geoU, under); mu.receiveShadow = true; g.add(mu); }
        for (let i = 0; i < pts.length; i++) {
          const a = pts[i]; const b = pts[(i + 1) % pts.length]; const strip = polyGeometry([a, b, v3(b.x, b.y - ROOF_T, b.z), v3(a.x, a.y - ROOF_T, a.z)]); if (!strip) continue;
          const ms = new THREE.Mesh(strip, under); ms.material = under.clone(); ms.material.side = THREE.DoubleSide; g.add(ms);
        }
      }
      const center = v3((r.bbox.minX + r.bbox.maxX) / 2, r.yTop, (r.bbox.minZ + r.bbox.maxZ) / 2);
      for (const f of r.fills) {
        let pts = f.pts.map((p) => v3(p.x, p.y, p.z)); let geo = polyGeometry(pts); if (!geo) continue;
        const n = new THREE.Vector3().fromBufferAttribute(geo.attributes.normal, 0); const c = pts.reduce((a, q) => a.add(q), v3(0, 0, 0)).multiplyScalar(1 / pts.length);
        if (n.dot(c.clone().sub(center)) < 0) { geo.dispose(); pts = pts.reverse(); geo = polyGeometry(pts); if (!geo) continue; }
        const m = new THREE.Mesh(geo, siding); m.castShadow = true; m.receiveShadow = true; g.add(m); addPick(m, { type: 'gable', floor: r.floor, key: r.key });
      }
      if (rs.soffit !== false) for (const s of r.soffits) { const pts = orientY(s.pts.map((p) => v3(p.x, p.y - ROOF_T + 0.02, p.z)), false); const geo = polyGeometry(pts); if (!geo) continue; const m = new THREE.Mesh(geo, M.trimMaterial(ex.trimColor)); m.receiveShadow = true; g.add(m); }
      if (rs.fascia !== false) for (const e of r.edges) {
        const A = v3(e.a.x, e.a.y, e.a.z); const B = v3(e.b.x, e.b.y, e.b.z); const d = new THREE.Vector3().subVectors(B, A); const L = d.length(); if (L < 0.05) continue; d.normalize();
        const m = new THREE.Mesh(BOX, trim); m.scale.set(L + 0.1, ROOF_T + 0.1, 0.12);
        const z = e.kind === 'eave' ? v3(r.axis === 'x' ? 0 : 1, 0, r.axis === 'x' ? 1 : 0).multiplyScalar(e.out) : v3(r.axis === 'x' ? 1 : 0, 0, r.axis === 'x' ? 0 : 1).multiplyScalar(e.out);
        if (e.end) z.set(r.axis === 'x' ? 1 : 0, 0, r.axis === 'x' ? 0 : 1).multiplyScalar(e.out);
        let y = new THREE.Vector3().crossVectors(z, d).normalize(); if (y.y < 0) { d.negate(); y = new THREE.Vector3().crossVectors(z, d).normalize(); }
        m.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(d, y, z));
        m.position.copy(A).add(B).multiplyScalar(0.5).addScaledVector(z, 0.06).addScaledVector(y, -ROOF_T / 2 + 0.05); m.castShadow = true; g.add(m);
      }
      if (r.ridge) { const A = v3(r.ridge.a.x, r.ridge.a.y, r.ridge.a.z); const B = v3(r.ridge.b.x, r.ridge.b.y, r.ridge.b.z); const L = A.distanceTo(B); const m = box(r.axis === 'x' ? L + 0.2 : 0.7, 0.18, r.axis === 'x' ? 0.7 : L + 0.2, roofMat, (A.x + B.x) / 2, A.y + 0.05, (A.z + B.z) / 2); g.add(m); }
      if (opts.snowCover && r.pitch <= 9) for (const pl of r.planes) {
        const pts = pl.pts.map((p) => v3(p.x, p.y + 0.28, p.z)); let geo = polyGeometry(pts); if (!geo) continue;
        if (geo.attributes.normal.getY(0) < 0) { geo.dispose(); geo = polyGeometry(pts.slice().reverse()); }
        const m = new THREE.Mesh(geo, M.snowMaterial()); m.castShadow = true; m.receiveShadow = true; g.add(m);
      }
    }
  }

  // ------------------------------------------------------------ floors/ceil
  buildFloors(project, analysis, roofs, maxFloor, showCeilings) {
    this.clear(['floors']);
    const g = this.groups.floors;
    const addPick = (m, data) => { m.userData = { ...data, group: 'floors' }; this.pickables.push(m); };
    // stair openings: the floor above a stair (and the ceiling under it) is cut around the stair footprint
    const stairs = project.items.filter((it) => itemDef(it.type)?.stair);
    const inset = (pts) => { const cx = pts.reduce((a, p) => a + p.x, 0) / pts.length; const cz = pts.reduce((a, p) => a + p.z, 0) / pts.length; return pts.map((p) => ({ x: p.x + (cx - p.x) * 0.03, z: p.z + (cz - p.z) * 0.03 })); };
    const holesFor = (floorAbove, polygon) => stairs.filter((st) => st.floor === floorAbove - 1).map((st) => inset(stairOpening(project, st))).filter((pts) => pts.every((p) => pointInPolygon(p, polygon)));
    analysis.floors.forEach((fa, fi) => {
      if (fi > maxFloor) return;
      const y0 = floorElevation(project, fi); const H = floorHeight(project, fi);
      for (const r of fa.rooms) {
        const slabHoles = fi > 0 ? holesFor(fi, r.polygon) : [];
        const geo = polyGeometry(orientY(r.polygon.map((p) => v3(p.x, y0 + 0.01, p.z)), true), { holes: slabHoles.map((hp) => hp.map((p) => v3(p.x, y0 + 0.01, p.z))) }); if (!geo) continue;
        const m = new THREE.Mesh(geo, M.floorMaterial(r.flooring)); m.receiveShadow = true; g.add(m); addPick(m, { type: 'room', roomKey: r.key, floor: fi, roomIndex: r.index });
        if (slabHoles.length) { const sub = M.lumberMaterial(); for (const hp of slabHoles) for (let i = 0; i < hp.length; i++) { const a = hp[i]; const bq = hp[(i + 1) % hp.length]; const geoS = polyGeometry([v3(a.x, y0 + 0.01, a.z), v3(bq.x, y0 + 0.01, bq.z), v3(bq.x, y0 - 1.0, bq.z), v3(a.x, y0 - 1.0, a.z)]); if (geoS) { const ms = new THREE.Mesh(geoS, sub); ms.material = sub.clone(); ms.material.side = THREE.DoubleSide; g.add(ms); } } }
        if (showCeilings) {
          const ceilHoles = holesFor(fi + 1, r.polygon);
          const cg = polyGeometry(orientY(r.polygon.map((p) => v3(p.x, y0 + H - 0.02, p.z)), false), { holes: ceilHoles.map((hp) => hp.map((p) => v3(p.x, y0 + H - 0.02, p.z))) });
          if (cg) { const cm = new THREE.Mesh(cg, M.paintMaterial(project.interior.ceilingColor || '#f7f5ef', { side: THREE.DoubleSide })); cm.receiveShadow = true; g.add(cm); }
        }
      }
    });
  }

  // Sun shafts: additive light prisms from every window the sun is shining through, fading into the room.
  buildSunShafts(project, analysis, sunDir, strength, sunColor, maxFloor) {
    this.clear(['shafts']);
    if (!sunDir || strength <= 0.05 || sunDir.y < 0.05) return;
    const g = this.groups.shafts; const mat = M.shaftMaterial();
    const pos = []; const col = []; const uv = []; const idx = [];
    const lightDir = sunDir.clone().negate(); // direction the light travels
    const c0 = new THREE.Color(sunColor).multiplyScalar(0.17 * strength); // additive: keep it faint, it adds up across the four faces
    analysis.floors.forEach((fa, fi) => {
      if (fi > maxFloor) return;
      const y0 = floorElevation(project, fi);
      for (const w of fa.walls) {
        const info = fa.wallInfo.get(w.id); if (info.kind !== 'exterior') continue;
        const { dir } = wallVec(w); const left = perp(dir);
        const outN = info.outward === 'left' ? left : { x: -left.x, z: -left.z }; if (info.outward === 'both') continue;
        const n3 = v3(outN.x, 0, outN.z); const facing = n3.dot(sunDir); if (facing < 0.12) continue;
        for (const o of w.openings) {
          const st = openingStyle(o.kind, o.style); if (!(o.kind === 'window' || (o.kind === 'door' && st.glass))) continue;
          const cx = w.a.x + dir.x * (o.along + o.width / 2); const cz = w.a.z + dir.z * (o.along + o.width / 2);
          const d3 = v3(dir.x, 0, dir.z); const base = v3(cx, y0 + o.sill, cz);
          // window corners (bottom-left, bottom-right, top-right, top-left) in the wall plane
          const corners = [base.clone().addScaledVector(d3, -o.width / 2), base.clone().addScaledVector(d3, o.width / 2), base.clone().addScaledVector(d3, o.width / 2).setY(y0 + o.sill + o.height), base.clone().addScaledVector(d3, -o.width / 2).setY(y0 + o.sill + o.height)].map((c) => c.addScaledVector(lightDir, 0.6));
          const len = Math.min(16, Math.max(4, (o.sill + o.height * 0.9) / Math.max(0.12, -lightDir.y)));
          const far = corners.map((c) => c.clone().addScaledVector(lightDir, len));
          const bright = c0.clone().multiplyScalar(0.5 + 0.5 * facing);
          for (let i = 0; i < 4; i++) {
            const a = corners[i]; const b = corners[(i + 1) % 4]; const fa2 = far[i]; const fb = far[(i + 1) % 4]; const base = pos.length / 3;
            for (const [pt, cc, v] of [[a, bright, 0], [b, bright, 0], [fb, null, 1], [fa2, null, 1]]) { pos.push(pt.x, pt.y, pt.z); col.push(cc ? cc.r : 0, cc ? cc.g : 0, cc ? cc.b : 0); uv.push(0.5, 1 - v); }
            idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
          }
          // a center sheet through the opening so the beam reads from the side too
          { const a = corners[0].clone().lerp(corners[1], 0.5); const b = corners[3].clone().lerp(corners[2], 0.5); const fa2 = far[0].clone().lerp(far[1], 0.5); const fb = far[3].clone().lerp(far[2], 0.5); const base = pos.length / 3; for (const [pt, cc, v] of [[a, bright, 0], [b, bright, 0], [fb, null, 1], [fa2, null, 1]]) { pos.push(pt.x, pt.y, pt.z); col.push(cc ? cc.r * 0.7 : 0, cc ? cc.g * 0.7 : 0, cc ? cc.b * 0.7 : 0); uv.push(0.5, 1 - v); } idx.push(base, base + 1, base + 2, base, base + 2, base + 3); }
        }
      }
    });
    if (!pos.length) return;
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); geo.setIndex(idx);
    const m = new THREE.Mesh(geo, mat); m.renderOrder = 6; m.frustumCulled = false; m.userData.group = 'shafts'; g.add(m);
  }

  // ------------------------------------------------------------- ghost walls
  // Translucent copies of the floor below, so a second floor can be stacked by tapping them.
  buildGhostWalls(project, analysis, floorIndex) {
    this.clear(['ghost']);
    if (floorIndex <= 0) return;
    const g = this.groups.ghost; const y0 = floorElevation(project, floorIndex); const H = floorHeight(project, floorIndex);
    const here = wallsOnFloor(project, floorIndex);
    for (const w of wallsOnFloor(project, floorIndex - 1)) {
      if (here.some((h) => Math.hypot(h.a.x - w.a.x, h.a.z - w.a.z) < 0.1 && Math.hypot(h.b.x - w.b.x, h.b.z - w.b.z) < 0.1)) continue;
      const { dir, length } = wallVec(w);
      const m = box(length, H, 0.45, M.ghostMaterial('#7fc8ff'), (w.a.x + w.b.x) / 2, y0 + H / 2, (w.a.z + w.b.z) / 2); m.rotation.y = yawFromDir(dir);
      m.userData = { type: 'ghostwall', wallId: w.id, group: 'ghost' }; g.add(m); this.pickables.push(m);
    }
  }

  // ------------------------------------------------------------------- items
  buildItems(project, analysis, maxFloor, opts = {}) {
    this.clear(['items', 'landscape', 'lights', 'systems']);
    const gi = this.groups.items; const gl = this.groups.landscape; const glt = this.groups.lights; const gs = this.groups.systems;
    const addPick = (m, data, group) => { m.userData = { ...data, group }; this.pickables.push(m); };
    const tvs = project.items.filter((t) => t.type === 'tvwall');
    const boxedFor = (it, def) => def.vent?.kind === 'chimney' && (it.boxed === true || tvs.some((t) => t.floor === it.floor && Math.hypot(t.x - it.x, t.z - it.z) < Math.max(3, (it.w || def.w) / 2 + 1)));
    for (const it of project.items) {
      const def = itemDef(it.type); if (!def) continue;
      if (!def.outdoor && it.floor > maxFloor) continue;
      if (def.outdoor && !opts.landscape) continue;
      if (!def.outdoor && !def.light && !def.vehicle && !opts.furniture) {
        if (def.vent && opts.vents && it.floor <= maxFloor) { const vg = new THREE.Group(); vg.position.set(it.x, floorElevation(project, it.floor), it.z); vg.rotation.y = it.rot * Math.PI / 180; const H0 = floorHeight(project, it.floor); this._buildVent(vg, def, it, { w: it.w || def.w, d: it.d || def.d, h: (it.h || def.h) * (it.scale || 1), H: H0, floorY: floorElevation(project, it.floor), roofs: opts.roofs || [], project, analysis, color: it.color || def.color, boxed: boxedFor(it, def), lit: it.lit !== false, smoke: opts.smoke !== false, opts }, gs); vg.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } }); gs.add(vg); }
        continue;
      }
      if (def.vehicle && !opts.furniture && !opts.vehicles) continue;
      if (def.light && !opts.lights && !def.exterior && !def.outdoor) continue;
      if (def.system && !opts.systems) continue;
      const grp = new THREE.Group();
      const y0 = def.outdoor ? 0 : floorElevation(project, it.floor);
      grp.position.set(it.x, y0, it.z); grp.rotation.y = it.rot * Math.PI / 180;
      const s = it.scale || 1; const w = (it.w || def.w) * (def.resizable || def.sizable ? 1 : s); const d = (it.d || def.d) * (def.resizable || def.sizable ? 1 : s); const h = (it.h || def.h) * (def.sizable ? 1 : s);
      const H = floorHeight(project, it.floor);
      const ctx = { w, d, h, H, floorY: y0, opts, color: it.color || def.color, finish: it.finish || def.finish, roofs: opts.roofs || [], project, analysis, boxed: boxedFor(it, def), lit: it.lit !== false, smoke: opts.smoke !== false };
      this._buildItem(grp, def, it, ctx);
      grp.traverse((o) => { if (o.isMesh && !o.userData.noShadow) { o.castShadow = !def.light; o.receiveShadow = true; } });
      const target = def.outdoor ? gl : def.light ? glt : def.system ? gs : gi; target.add(grp);
      const pv = grp.userData.proxy; const pw = pv ? pv.w : w; const pd = pv ? pv.d : d;
      const ph = pv ? pv.h : def.ceiling ? 0.6 : h; const py = def.ceiling ? H - 0.3 : (def.wall ? (it.mountY ?? def.mountHeight ?? 5) : ph / 2);
      const proxy = box(pw + 0.1, ph + 0.1, pd + 0.1, M.ghostMaterial('#000'), pv ? pv.cx : 0, py, 0); proxy.material = proxy.material.clone(); proxy.material.visible = false; grp.add(proxy);
      addPick(proxy, { type: 'item', itemId: it.id, floor: it.floor }, def.outdoor ? 'landscape' : def.light ? 'lights' : def.system ? 'systems' : 'items');
      if (def.light && (opts.lights || def.outdoor)) {
        const ly = def.ceiling ? H - (def.build === 'pendant' ? 2.3 : def.build === 'chandelier' ? 2.0 : 1.1) : def.wall ? (it.mountY ?? def.mountHeight ?? 6) : def.build === 'firepit' ? 1.5 : def.build === 'lantern' ? h - 0.8 : def.build === 'tablelamp' ? (it.mountY ?? 2) + 1.4 : h - 0.6;
        const pos = new THREE.Vector3(it.x, y0 + ly, it.z);
        this.lightPoints.push({ pos, def, item: it, group: grp, kelvin: it.kelvin ?? def.light.kelvin ?? 2700, mult: it.intensity ?? 1 });
      }
      // vents, chimneys and ducts
      if (def.vent && opts.vents !== false && !def.outdoor) this._buildVent(grp, def, it, ctx, gs);
    }
  }

  applyLights(focus, nightness, maxLights = 8, forceOn = false) {
    const on = forceOn || nightness > 0.05;
    const strength = forceOn ? 1 : Math.min(1, nightness * 1.6);
    const sorted = this.lightPoints.slice().sort((a, b) => a.pos.distanceToSquared(focus) - b.pos.distanceToSquared(focus));
    sorted.forEach((lp, i) => {
      const colorHex = kelvinToHex(lp.kelvin);
      if (!lp.light) { lp.light = new THREE.PointLight(colorHex, 0, lp.def.light.distance, 1.6); lp.light.position.copy(lp.pos); this.groups.lights.add(lp.light); }
      lp.light.color.set(colorHex);
      lp.light.visible = on && i < maxLights;
      lp.light.intensity = lp.def.light.intensity * strength * 3.5 * lp.mult;
      lp.group.traverse((o) => { if (o.isMesh && o.userData.emissive) { o.material.emissive.set(colorHex); o.material.emissiveIntensity = on ? 2.4 * strength * Math.min(1.5, lp.mult) : 0.0; } });
    });
  }

  // Pipe straight up through the roof, or a duct to the nearest exterior wall with a hood outside.
  _buildVent(grp, def, it, ctx, target) {
    const { w, d, h, H, floorY, roofs, project, analysis } = ctx; const vent = def.vent;
    const world = new THREE.Vector3(it.x, 0, it.z);
    if (vent.to === 'roof') {
      const ry = roofs.length ? roofs.map((r) => roofHeightAt(r, it.x, it.z)).find((y) => y != null) : null;
      const topY = ry != null ? ry + (vent.kind === 'chimney' ? 3.5 : 2.5) : floorY + H + 2.5;
      // a boxed-in chimney (drywall chase inside, e.g. with a TV above the fireplace) only shows above the roof
      if (ctx.boxed && ctx.opts?.roofVisible === false) return; // boxed chimney only exists above the roof; nothing to show with the roof off
      const startY = ctx.boxed ? (ry != null ? ry - 0.6 : floorY + H + 0.5) : def.ceiling ? floorY + H - 0.2 : floorY + h;
      const len = topY - startY; if (len <= 0.2) return;
      const chimneyTopWorld = new THREE.Vector3(it.x, topY + 0.6, it.z);
      const smokeOn = ctx.smoke && ctx.lit && def.fire && (vent.kind === 'chimney' || vent.kind === 'stovepipe');
      if (vent.kind === 'chimney') {
        const stone = M.stoneTinted(ctx.color || '#8a8580');
        const stack = box(vent.dia, len, vent.dia, stone, 0, startY - floorY + len / 2, 0); stack.castShadow = true; grp.add(stack);
        grp.add(box(vent.dia + 0.4, 0.25, vent.dia + 0.4, M.concreteMaterial(), 0, startY - floorY + len, 0));
        grp.add(box(vent.dia * 0.5, 0.5, vent.dia * 0.5, M.plasticMaterial('#3a3a3a'), 0, startY - floorY + len + 0.35, 0));
        if (ctx.boxed && ry != null) { const chase = box(vent.dia + 0.3, 0.3, vent.dia + 0.3, M.roofingMaterial(project.structure.roof.material, project.structure.roof.color), 0, ry - floorY + 0.15, 0); grp.add(chase); }
        if (smokeOn) this._addSmoke(target, chimneyTopWorld, vent.dia, 'systems');
      } else {
        if (smokeOn) this._addSmoke(target, chimneyTopWorld.clone().setY(topY + 0.9), vent.dia * 1.5, 'systems');
        const mat = vent.kind === 'stovepipe' ? M.metalMaterial('#2b2b2b') : vent.kind === 'pvc' ? M.plasticMaterial('#e7e7e3') : M.metalMaterial('#9aa0a6');
        const pipe = cyl(vent.dia / 2, len, mat, 0, startY - floorY + len / 2, 0); pipe.castShadow = true; grp.add(pipe);
        if (ry != null) { const collar = new THREE.Mesh(CONE, M.metalMaterial('#6d7378')); collar.scale.set(vent.dia * 2.4, 0.5, vent.dia * 2.4); collar.position.set(0, ry - floorY + 0.25, 0); grp.add(collar); }
        if (vent.kind === 'stovepipe') { const cap = cyl(vent.dia * 0.9, 0.5, mat, 0, startY - floorY + len + 0.25, 0); grp.add(cap); const hat = new THREE.Mesh(CONE, mat); hat.scale.set(vent.dia * 2.2, 0.5, vent.dia * 2.2); hat.position.set(0, startY - floorY + len + 0.75, 0); grp.add(hat); }
        else if (vent.kind !== 'pvc') { const hood = box(vent.dia * 1.6, 0.3, vent.dia * 1.6, mat, 0, startY - floorY + len + 0.15, 0); grp.add(hood); }
      }
    } else {
      const fa = analysis.floors[it.floor]; if (!fa) return;
      const ext = fa.walls.filter((wl) => fa.wallInfo.get(wl.id).kind === 'exterior');
      const near = nearestWall(ext, { x: it.x, z: it.z }, 12); if (!near) return;
      const info = fa.wallInfo.get(near.wall.id); const { dir } = wallVec(near.wall); const left = perp(dir);
      const outN = info.outward === 'left' ? left : { x: -left.x, z: -left.z };
      const dims = wallDims('exterior');
      const y = def.ceiling ? H - 0.3 : Math.min(H - 0.6, (it.mountY ?? def.mountHeight ?? 0) + h * (def.wall ? 0.5 : 0.85));
      const dx = near.point.x - it.x; const dz = near.point.z - it.z; const L = Math.hypot(dx, dz);
      // duct in world space (the group is rotated, so compute in local by inverse-rotating)
      const ang = -it.rot * Math.PI / 180; const lx = dx * Math.cos(ang) - dz * Math.sin(ang); const lz = dx * Math.sin(ang) + dz * Math.cos(ang);
      const duct = cyl(vent.dia / 2, Math.max(0.3, L + dims.studD), M.metalMaterial('#b9bcc0'), lx / 2, y, lz / 2, 8); duct.rotation.z = Math.PI / 2; duct.rotation.y = -Math.atan2(lz, lx); grp.add(duct);
      // hood outside: build in world space under the systems group
      const hx = near.point.x + outN.x * (dims.offsetOut + dims.studD / 2 + 0.2); const hz = near.point.z + outN.z * (dims.offsetOut + dims.studD / 2 + 0.2);
      const hood = box(vent.dia + 0.3, vent.dia + 0.3, 0.35, M.metalMaterial('#9aa0a6'), hx, floorY + y, hz); hood.rotation.y = yawFromDir(dir); hood.castShadow = true; hood.userData.group = 'systems'; target.add(hood);
      const louver = M.plasticMaterial('#6d7378'); for (let i = 0; i < 3; i++) { const l = box(vent.dia + 0.2, 0.04, 0.2, louver, hx, floorY + y - vent.dia / 2 + (vent.dia / 3) * (i + 0.5), hz); l.rotation.y = yawFromDir(dir); l.position.addScaledVector(v3(outN.x, 0, outN.z), 0.1); l.userData.group = 'systems'; target.add(l); }
    }
  }

  // Flames are crossed additive cards wobbled by the flame shader; a point light flickers with them.
  _addFire(grp, def, it, f, emberMesh) {
    if (it.lit === false) { if (emberMesh) { emberMesh.material = emberMesh.material.clone(); emberMesh.material.emissiveIntensity = 0; emberMesh.material.color.set('#2a2422'); } return; }
    const mat = M.flameMaterial(); const flames = [];
    for (let i = 0; i < 3; i++) { const m = new THREE.Mesh(new THREE.PlaneGeometry(f.size, f.size * 1.7), mat); m.position.set(f.x, f.y + f.size * 0.8, f.z); m.rotation.y = i * Math.PI / 3; m.userData.noShadow = true; m.castShadow = false; m.renderOrder = 5; grp.add(m); flames.push(m); }
    if (emberMesh) { emberMesh.material = emberMesh.material.clone(); emberMesh.material.emissive.set('#ff6a1a'); emberMesh.material.emissiveIntensity = 1.6; emberMesh.userData.emissive = false; }
    let light = null;
    if (f.light > 0) { light = new THREE.PointLight(0xff9a3a, f.light, f.distance, 1.7); light.position.set(f.x, f.y + f.size * 0.6, f.z + 0.4); grp.add(light); }
    this.fires.push({ light, flames, base: f.light, phase: hashf(it.x, it.z) * 10, ember: emberMesh });
  }
  // Chimney / stovepipe smoke: a handful of sprites cycling up from the cap.
  _addSmoke(target, topWorld, dia, group) {
    const base = M.smokeMaterial(); const sprites = [];
    for (let i = 0; i < 7; i++) { const sp = new THREE.Sprite(base.clone()); sp.position.copy(topWorld); sp.userData.noShadow = true; sp.userData.group = group; target.add(sp); sprites.push({ sp, phase: i / 7, drift: hashf(i, topWorld.x) - 0.5 }); }
    this.smokes.push({ sprites, top: topWorld.clone(), dia, group });
  }
  animateEffects(dt, time, windStrength = 1) {
    let any = false;
    for (const f of this.fires) {
      any = true; const t = time * 1.0 + f.phase;
      const n = 0.72 + 0.16 * Math.sin(t * 11.3) + 0.08 * Math.sin(t * 17.9 + 1.3) + 0.06 * Math.sin(t * 4.7 + 0.4);
      if (f.light) f.light.intensity = f.base * 2.2 * n;
      if (f.ember) f.ember.material.emissiveIntensity = 1.2 + 0.8 * n;
    }
    for (const sm of this.smokes) {
      any = true;
      for (const { sp, phase, drift } of sm.sprites) {
        const t = ((time * 0.1 + phase) % 1 + 1) % 1; const rise = t * 11; const wob = Math.sin(time * 0.8 + phase * 9) * 0.4;
        sp.position.set(sm.top.x + rise * 0.28 * windStrength + wob + drift, sm.top.y + rise, sm.top.z + drift * 0.6 + rise * 0.1);
        const sc = sm.dia * 1.2 + t * 7; sp.scale.set(sc, sc, 1); sp.material.opacity = 0.32 * Math.min(1, t * 6) * (1 - t) * (1 - t);
      }
    }
    return any;
  }
  // Stairs: stringers, treads, risers, a handrail on the open side; L stairs add a landing and turn.
  _buildStairs(grp, def, it, ctx) {
    const { project } = ctx; const spec = stairSpec(project, it); const wood = M.woodMaterial(ctx.color || '#8a5a3a'); const tread = M.woodMaterial(ctx.color ? new THREE.Color(ctx.color).lerp(new THREE.Color('#ffffff'), 0.15).getStyle() : '#a07048'); const rail = M.metalMaterial('#2a2a2c');
    const b = (bw, bh, bd, mat, x, y, z) => { const m = box(bw, bh, bd, mat, x, y, z); m.castShadow = true; m.receiveShadow = true; grp.add(m); return m; };
    const beam = (A, B, hgt, thick, mat) => { const dv = new THREE.Vector3().subVectors(B, A); const L = dv.length(); if (L < 0.05) return; dv.normalize(); const m = new THREE.Mesh(BOX, mat); m.scale.set(L, hgt, thick); const zAxis = new THREE.Vector3().crossVectors(UP, dv).normalize(); if (zAxis.lengthSq() < 1e-6) zAxis.set(0, 0, 1); const yAxis = new THREE.Vector3().crossVectors(zAxis, dv).normalize(); m.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(dv, yAxis, zAxis)); m.position.copy(A).add(B).multiplyScalar(0.5); m.castShadow = true; grp.add(m); };
    const flight = (x0, z0, dirX, dirZ, width, n, riserH, startY) => {
      // steps run from (x0,z0) along (dirX,dirZ); width is across; returns the top position
      const run = (n - 1) * spec.tread; const yaw = Math.atan2(dirX, dirZ);
      for (let i = 0; i < n; i++) {
        const y = startY + riserH * (i + 1); const along = i * spec.tread; const cx = x0 + dirX * (along + spec.tread / 2); const cz = z0 + dirZ * (along + spec.tread / 2);
        const t = b(width, 0.1, spec.tread + 0.1, tread, 0, y, 0); t.position.set(cx, y - 0.05, cz); t.rotation.y = yaw;
        const r = b(width - 0.06, riserH, 0.08, wood, 0, 0, 0); r.position.set(x0 + dirX * (along - 0.02), y - riserH / 2 - 0.05, z0 + dirZ * (along - 0.02)); r.rotation.y = yaw;
      }
      // stringers under each side, and a handrail on the right-hand side going up
      const sx = -dirZ; const sz = dirX; const endX = x0 + dirX * (run + spec.tread); const endZ = z0 + dirZ * (run + spec.tread); const topY = startY + riserH * n;
      for (const side of [-1, 1]) beam(v3(x0 + sx * side * (width / 2 - 0.08), startY - 0.45, z0 + sz * side * (width / 2 - 0.08)), v3(endX + sx * side * (width / 2 - 0.08), topY - 0.45, endZ + sz * side * (width / 2 - 0.08)), 0.95, 0.14, wood);
      const px = x0 + sx * (width / 2 - 0.1); const pz = z0 + sz * (width / 2 - 0.1);
      for (let i = 0; i <= n; i += 2) { const y = startY + riserH * i; const post = cyl(0.05, 2.9, rail, px + dirX * i * spec.tread, y + 1.45, pz + dirZ * i * spec.tread, 8); grp.add(post); }
      beam(v3(px, startY + 2.9, pz), v3(px + dirX * (run + spec.tread), topY + 2.9, pz + dirZ * (run + spec.tread)), 0.12, 0.12, rail);
      return { x: x0 + dirX * (run + spec.tread), z: z0 + dirZ * (run + spec.tread), y: startY + riserH * n };
    };
    if (spec.kind === 'straight') { flight(0, -spec.d / 2, 0, 1, spec.w, spec.risers, spec.riserH, 0); }
    else {
      const half = spec.flightW; const z0 = -spec.d / 2;
      const top1 = flight(-half / 2, z0, 0, 1, half, spec.n1, spec.riserH, 0);
      // landing
      b(half + 0.1, 0.25, spec.land + 0.1, tread, -half / 2, top1.y - 0.12, top1.z + spec.land / 2);
      for (const [x, z] of [[-half, top1.z + spec.land], [-half, top1.z]]) b(0.35, top1.y, 0.35, wood, x, top1.y / 2, z);
      flight(0.05, top1.z + spec.land / 2, 1, 0, spec.land, spec.n2, spec.riserH, top1.y);
    }
    grp.userData.stair = spec;
    grp.userData.proxy = spec.kind === 'L' ? { w: spec.flightW + spec.run2 + 0.4, d: spec.d, cx: (spec.run2 + 0.4 - spec.flightW) / 2, h: spec.rise + 3 } : { w: spec.w, d: spec.d, cx: 0, h: spec.rise + 3 };
  }

  _buildItem(grp, def, it, ctx) {
    const { w, d, h, H, opts, color, finish } = ctx;
    const b = (bw, bh, bd, mat, x, y, z) => { const m = box(bw, bh, bd, mat, x, y, z); grp.add(m); return m; };
    const wheel = (x, y, z, r, wd) => { const m = cyl(r, wd, M.plasticMaterial('#1f1f21'), x, y, z); m.rotation.z = Math.PI / 2; grp.add(m); const hub = cyl(r * 0.55, wd + 0.05, M.metalMaterial('#a9adb1'), x, y, z, 8); hub.rotation.z = Math.PI / 2; grp.add(hub); };
    switch (def.build) {
      case 'bed': { const frame = M.woodMaterial('#7b5236'); b(w, 0.9, d, frame, 0, 0.45, 0); b(w - 0.2, 0.7, d - 0.2, M.fabricMaterial('#e9e4da'), 0, 1.25, 0); b(w * 0.42, 0.35, 1.3, M.fabricMaterial('#f6f3ee'), -w * 0.24, 1.75, -d / 2 + 0.9); b(w * 0.42, 0.35, 1.3, M.fabricMaterial('#f6f3ee'), w * 0.24, 1.75, -d / 2 + 0.9); b(w - 0.3, 0.3, d * 0.55, M.fabricMaterial(color || '#6b7d8c'), 0, 1.75, d * 0.2); b(w, 1.6, 0.15, frame, 0, h * 0.7, -d / 2 + 0.07); break; }
      case 'bunk': { const wood = M.woodMaterial(color || '#8a5a3a'); for (const y of [0.6, 3.9]) { b(w, 0.4, d, wood, 0, y, 0); b(w - 0.2, 0.5, d - 0.2, M.fabricMaterial('#dfe3ea'), 0, y + 0.45, 0); b(w - 0.3, 0.25, d * 0.5, M.fabricMaterial(y > 2 ? '#a3553a' : '#3f5a46'), 0, y + 0.75, d * 0.2); } for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) b(0.2, h, 0.2, wood, x * (w / 2 - 0.1), h / 2, z * (d / 2 - 0.1)); for (let i = 0; i < 4; i++) b(0.1, 0.1, 1.2, wood, w / 2 + 0.1, 1.2 + i * 0.9, d / 2 - 0.7); break; }
      case 'crib': { const wood = M.woodMaterial(color || '#d9c7a8'); b(w, 0.3, d, wood, 0, 1.4, 0); b(w - 0.2, 0.4, d - 0.2, M.fabricMaterial('#f2f0ea'), 0, 1.7, 0); for (let i = 0; i <= 8; i++) { const x = -w / 2 + (w / 8) * i; b(0.08, h, 0.08, wood, x, h / 2, -d / 2); b(0.08, h, 0.08, wood, x, h / 2, d / 2); } for (let i = 0; i <= 12; i++) { const z = -d / 2 + (d / 12) * i; b(0.08, h, 0.08, wood, -w / 2, h / 2, z); b(0.08, h, 0.08, wood, w / 2, h / 2, z); } break; }
      case 'drawers': { const mat = def.palette === 'metal' ? M.metalMaterial(color || '#9a2d2a') : M.woodMaterial(color || '#8a5a3a'); b(w, h, d, mat, 0, h / 2, 0); const n = Math.max(2, Math.round(h / 0.9)); for (let i = 0; i < n; i++) { b(w - 0.2, 0.03, 0.02, M.paintMaterial('#3a3028'), 0, (h / n) * (i + 1) - 0.02, d / 2 + 0.01); b(Math.min(1.2, w * 0.4), 0.08, 0.1, M.metalMaterial('#b9bcc0'), 0, (h / n) * (i + 0.5), d / 2 + 0.06); } break; }
      case 'shelves': { const mat = def.palette === 'metal' ? M.metalMaterial(color || '#6d7378') : M.woodMaterial(color || '#6f4a30'); b(0.1, h, d, mat, -w / 2 + 0.05, h / 2, 0); b(0.1, h, d, mat, w / 2 - 0.05, h / 2, 0); b(w, 0.1, 0.05, mat, 0, h - 0.05, -d / 2 + 0.03); const n = Math.max(2, Math.round(h / 1.4)); for (let i = 0; i <= n; i++) b(w, 0.08, d, mat, 0, (h / n) * i + 0.04, 0); if (def.palette !== 'metal') for (let i = 0; i < n; i++) for (let k = 0; k < 6; k++) b(0.25, 0.9, d * 0.6, M.paintMaterial(['#8a3a3a', '#3a5a8a', '#c9a23a', '#3f5a46', '#e4e0d6', '#5e3f2b'][k]), -w / 2 + 0.4 + k * (w - 0.8) / 6, (h / n) * i + 0.55, 0); break; }
      case 'sofa': { const f = M.fabricMaterial(color || '#8a8275'); b(w, 1.3, d, f, 0, 0.65, 0); b(w, 1.3, 0.55, f, 0, 1.95, -d / 2 + 0.27); b(0.5, 2.0, d, f, -w / 2 + 0.25, 1.0, 0); b(0.5, 2.0, d, f, w / 2 - 0.25, 1.0, 0); b(w - 1.1, 0.35, d - 0.7, M.fabricMaterial(new THREE.Color(color || '#8a8275').lerp(new THREE.Color('#ffffff'), 0.18).getStyle()), 0, 1.45, 0.1); break; }
      case 'sectional': { const f = M.fabricMaterial(color || '#8d8f93'); b(w, 1.3, 3, f, 0, 0.65, -d / 2 + 1.5); b(w, 1.3, 0.55, f, 0, 1.95, -d / 2 + 0.27); b(3, 1.3, d - 3, f, w / 2 - 1.5, 0.65, 1.5); b(0.55, 1.3, d - 3, f, w / 2 - 0.27, 1.95, 1.5); b(0.5, 2.0, 3, f, -w / 2 + 0.25, 1.0, -d / 2 + 1.5); break; }
      case 'table': { const wood = M.woodMaterial(color || '#8a5a3a'); b(w, 0.15, d, wood, 0, h - 0.07, 0); for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) b(0.2, h - 0.15, 0.2, wood, x * (w / 2 - 0.25), (h - 0.15) / 2, z * (d / 2 - 0.25)); break; }
      case 'picnic': { const wood = M.woodMaterial(color || '#9a6a3c'); b(w, 0.15, 2.5, wood, 0, 2.4, 0); b(w, 0.12, 0.9, wood, 0, 1.4, -1.8); b(w, 0.12, 0.9, wood, 0, 1.4, 1.8); for (const x of [-1, 1]) { const leg = b(0.2, 2.7, 0.2, wood, x * (w / 2 - 0.5), 1.3, -0.9); leg.rotation.x = 0.5; const leg2 = b(0.2, 2.7, 0.2, wood, x * (w / 2 - 0.5), 1.3, 0.9); leg2.rotation.x = -0.5; } break; }
      case 'chair': { const wood = def.palette === 'fabric' ? M.fabricMaterial(color || '#2a2b2d') : M.woodMaterial(color || '#6b4a30'); b(w, 0.15, d, wood, 0, 1.5, 0); b(w, 1.5, 0.15, wood, 0, 2.25, -d / 2 + 0.07); if (def.palette === 'fabric') { const post = cyl(0.1, 1.4, M.metalMaterial(), 0, 0.75, 0); grp.add(post); for (let i = 0; i < 5; i++) { const a = (i / 5) * Math.PI * 2; b(0.9, 0.08, 0.12, M.metalMaterial(), Math.cos(a) * 0.45, 0.08, Math.sin(a) * 0.45).rotation.y = -a; } } else for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) b(0.12, 1.5, 0.12, wood, x * (w / 2 - 0.1), 0.75, z * (d / 2 - 0.1)); break; }
      case 'stool': { const wood = M.woodMaterial(color || '#6b4a30'); const seat = cyl(w / 2, 0.15, wood, 0, h, 0); grp.add(seat); for (let i = 0; i < 4; i++) { const a = (i / 4) * Math.PI * 2 + Math.PI / 4; b(0.12, h, 0.12, wood, Math.cos(a) * w * 0.35, h / 2, Math.sin(a) * w * 0.35); } break; }
      case 'tv': { b(w, 1.6, d, M.woodMaterial(color || '#4a3828'), 0, 0.8, 0); b(w * 0.9, 2.2, 0.1, M.plasticMaterial('#121214'), 0, 2.9, 0); b(w * 0.86, 2.05, 0.02, M.glossMaterial('#1d2a36'), 0, 2.9, 0.06); break; }
      case 'tvwall': { const y = it.mountY ?? def.mountHeight ?? 3.6; b(0.4, 0.6, 0.15, M.metalMaterial('#4a4d50'), 0, y + h / 2, -d / 2 + 0.08); b(w, h, 0.12, M.plasticMaterial('#121214'), 0, y + h / 2, 0); const scr = b(w - 0.12, h - 0.12, 0.02, M.screenMaterial(), 0, y + h / 2, d / 2 - 0.05); scr.userData.noShadow = true; break; }
      case 'curtains': { const y = it.mountY ?? def.mountHeight ?? 7; const rod = cyl(0.06, w + 0.6, M.metalMaterial('#3a3a3c'), 0, y, 0.05, 8); rod.rotation.z = Math.PI / 2; grp.add(rod); for (const x of [-1, 1]) { const fin = new THREE.Mesh(SPHERE, M.metalMaterial('#3a3a3c')); fin.scale.set(0.22, 0.22, 0.22); fin.position.set(x * (w / 2 + 0.3), y, 0.05); grp.add(fin); } const fab = M.fabricMaterial(color || '#cfc4b2'); const dark = M.fabricMaterial(new THREE.Color(color || '#cfc4b2').multiplyScalar(0.82).getStyle()); const panelW = w * 0.22; const drop = Math.min(h, y - 0.1); for (const side of [-1, 1]) { const x0 = side * (w / 2 - panelW / 2); const folds = Math.max(3, Math.round(panelW / 0.3)); for (let i = 0; i < folds; i++) { const fx = x0 - panelW / 2 + (panelW / folds) * (i + 0.5); const fold = cyl(panelW / folds * 0.62, drop, i % 2 ? dark : fab, fx, y - drop / 2 - 0.05, (i % 2 ? -0.06 : 0.06), 8); grp.add(fold); } } break; }
      case 'coatrack': { const y = it.mountY ?? def.mountHeight ?? 5.5; const wood = M.woodMaterial(color || '#8a5a3a'); b(w, 0.45, 0.3, wood, 0, y, -d / 2 + 0.15); const n = Math.max(2, Math.round(w / 0.8)); for (let i = 0; i < n; i++) { const x = -w / 2 + (w / n) * (i + 0.5); const hook = cyl(0.04, 0.35, M.metalMaterial('#2a2a2c'), x, y - 0.1, -d / 2 + 0.45, 8); hook.rotation.x = Math.PI / 2; grp.add(hook); const tip = new THREE.Mesh(SPHERE, M.metalMaterial('#2a2a2c')); tip.scale.set(0.12, 0.12, 0.12); tip.position.set(x, y - 0.05, -d / 2 + 0.62); grp.add(tip); } b(0.6, 1.9, 0.35, M.fabricMaterial('#3f4a5a'), -w / 2 + (w / n) * 0.5, y - 1.0, -d / 2 + 0.5); b(0.6, 1.7, 0.3, M.fabricMaterial('#7a3a30'), -w / 2 + (w / n) * (n - 0.5), y - 0.9, -d / 2 + 0.5); break; }
      case 'wallshelf': { const y = it.mountY ?? def.mountHeight ?? 5; const wood = M.woodMaterial(color || '#8a5a3a'); b(w, 0.15, d, wood, 0, y, 0); for (const x of [-w / 2 + 0.3, w / 2 - 0.3]) b(0.1, 0.45, d * 0.8, M.metalMaterial('#2a2a2c'), x, y - 0.3, 0); b(0.3, 0.9, 0.5, M.paintMaterial('#8a3a3a'), -w * 0.3, y + 0.52, 0); b(0.25, 0.7, 0.4, M.paintMaterial('#3a5a8a'), -w * 0.3 + 0.3, y + 0.42, 0); const pot = cyl(0.25, 0.4, M.plasticMaterial('#c9a070'), w * 0.3, y + 0.27, 0, 8); grp.add(pot); const leaf = new THREE.Mesh(SPHERE, M.leafMaterial('#4f8a3a', 4)); leaf.scale.set(0.7, 0.5, 0.7); leaf.position.set(w * 0.3, y + 0.6, 0); grp.add(leaf); break; }
      case 'mirror': { const y = it.mountY ?? def.mountHeight ?? 4; b(w, h, 0.08, M.woodMaterial(color || '#5e3f2b'), 0, y, 0); const gl = b(w - 0.25, h - 0.25, 0.02, M.mirrorMaterial(), 0, y, 0.05); gl.userData.noShadow = true; break; }
      case 'wallart': { const y = it.mountY ?? def.mountHeight ?? 4.5; b(w, h, 0.1, M.woodMaterial('#2a2420'), 0, y, 0); const c1 = new THREE.Color(color || '#6f7d88'); b(w - 0.2, h - 0.2, 0.02, M.paintMaterial(c1.getStyle()), 0, y, 0.06); b((w - 0.2) * 0.6, (h - 0.2) * 0.35, 0.02, M.paintMaterial(c1.clone().lerp(new THREE.Color('#ffffff'), 0.45).getStyle()), -w * 0.1, y + h * 0.12, 0.07); b((w - 0.2) * 0.8, (h - 0.2) * 0.2, 0.02, M.paintMaterial(c1.clone().multiplyScalar(0.6).getStyle()), 0, y - h * 0.25, 0.07); break; }
      case 'plant': { const pot = cyl(w * 0.35, h * 0.28, M.plasticMaterial(color || '#cbbfae'), 0, h * 0.14, 0); grp.add(pot); grp.add(cyl(0.08, h * 0.5, M.barkMaterial('#6b5035'), 0, h * 0.5, 0, 8)); const leaf = M.foliageCardMaterial('leafcard', '#5f9a3c', 6); for (let i = 0; i < 6; i++) { const a = i * 1.047; const m = new THREE.Mesh(new THREE.PlaneGeometry(w * 0.9, h * 0.55), leaf); m.position.set(Math.cos(a) * w * 0.1, h * 0.72, Math.sin(a) * w * 0.1); m.rotation.y = a; m.rotation.x = 0.15; grp.add(m); } break; }
      case 'bench': { const wood = M.woodMaterial(color || '#8a5a3a'); b(w, 0.15, d, wood, 0, h, 0); for (const x of [-w / 2 + 0.25, w / 2 - 0.25]) b(0.15, h, d - 0.3, wood, x, h / 2, 0); b(w - 0.6, 0.12, 0.8, wood, 0, h * 0.35, 0); for (let i = 0; i < 2; i++) b(w / 2 - 0.5, 0.25, d - 0.5, M.fabricMaterial(i ? '#3f5a46' : '#a3553a'), (i ? 1 : -1) * w / 4, h + 0.2, 0); break; }
      case 'stairs': { this._buildStairs(grp, def, it, ctx); break; }
      case 'woodstove': { const iron = M.plasticMaterial('#26282a'); b(w, 2.0, d, iron, 0, 1.3, 0); b(w + 0.2, 0.08, d + 0.2, iron, 0, 2.34, 0); for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) b(0.2, 0.3, 0.2, iron, x * (w / 2 - 0.2), 0.15, z * (d / 2 - 0.2)); const glass = b(w * 0.55, 0.8, 0.05, M.lampMaterial('#ff7a1a'), 0, 1.3, d / 2 + 0.02); glass.userData.emissive = true; b(w + 1.5, 0.1, d + 1.5, M.rockMaterial(), 0, 0.05, 0.3); this._addFire(grp, def, it, { x: 0, y: 0.95, z: d / 2 - 0.15, size: 0.75, light: 16, distance: 14 }, glass); break; }
      case 'fireplace': { const stone = M.stoneTinted(color || '#8a8580'); b(w, h, d, stone, 0, h / 2, 0); b(w * 0.5, h * 0.45, 0.3, M.plasticMaterial('#1a1a1a'), 0, h * 0.28, d / 2 + 0.05); const fire = b(w * 0.4, h * 0.12, 0.1, M.lampMaterial('#ff7a1a'), 0, h * 0.12, d / 2 + 0.12); fire.userData.emissive = true; b(w + 0.4, 0.25, d * 0.6, M.woodMaterial('#5e3f2b'), 0, h * 0.72, d / 2 + 0.1); b(w + 0.6, 0.12, d + 1.2, M.rockMaterial(), 0, 0.06, 0.5); for (let i = 0; i < 3; i++) { const log = cyl(0.17, w * 0.32, M.barkMaterial('#4a3524'), 0, h * 0.1 + i * 0.16, d / 2 + 0.05 - i * 0.12, 8); log.rotation.z = Math.PI / 2; log.rotation.y = (i - 1) * 0.3; grp.add(log); } this._addFire(grp, def, it, { x: 0, y: h * 0.14, z: d / 2 - 0.02, size: Math.min(1.5, w * 0.3), light: 30, distance: 22 }, fire); break; }
      case 'counter': {
        const cab = M.cabinetMaterial(color || '#5f4a38', finish || 'wood'); const top = M.glossMaterial(def.island ? '#dad6cf' : '#d9d4cc');
        b(w, 2.8, d, cab, 0, 1.4, 0); b(w + 0.1, 0.15, d + 0.1, top, 0, 2.9, 0);
        const doors = Math.max(1, Math.round(w / 1.5)); for (let i = 0; i < doors; i++) { const x = -w / 2 + (w / doors) * (i + 0.5); b(w / doors - 0.08, 2.3, 0.03, cab, x, 1.3, d / 2 + 0.02); b(0.08, 0.5, 0.1, M.metalMaterial('#b9bcc0'), x + (w / doors) * 0.35, 1.5, d / 2 + 0.07); }
        b(w, 0.35, 0.03, M.paintMaterial('#2a2420'), 0, 0.18, d / 2 - 0.3);
        if (def.sink) { b(Math.min(2.4, w - 0.4), 0.2, d - 0.5, M.metalMaterial('#c3c6c9'), 0, 2.95, 0); const tap = cyl(0.05, 0.9, M.metalMaterial('#b8bcc0'), 0, 3.4, -d / 2 + 0.35, 8); grp.add(tap); const spout = b(0.08, 0.08, 0.6, M.metalMaterial('#b8bcc0'), 0, 3.8, -d / 2 + 0.6); }
        if (def.island) b(w, 0.1, 0.8, top, 0, 2.92, d / 2 + 0.4);
        break;
      }
      case 'uppercab': { const y = it.mountY ?? def.mountHeight ?? 4.5; const cab = M.cabinetMaterial(color || '#5f4a38', finish || 'wood'); b(w, h, d, cab, 0, y + h / 2, 0); const doors = Math.max(1, Math.round(w / 1.4)); for (let i = 0; i < doors; i++) { const x = -w / 2 + (w / doors) * (i + 0.5); b(w / doors - 0.08, h - 0.1, 0.03, cab, x, y + h / 2, d / 2 + 0.02); b(0.08, 0.4, 0.1, M.metalMaterial('#b9bcc0'), x + (w / doors) * 0.35, y + 0.5, d / 2 + 0.07); } break; }
      case 'hood': { const y = it.mountY ?? def.mountHeight ?? 5.5; const m = M.metalMaterial(color || '#c5c8cc'); b(w, 0.3, d, m, 0, y, 0); b(w * 0.5, 1.0, d * 0.5, m, 0, y + 0.65, -d * 0.2); break; }
      case 'appliance': { const m = def.palette === 'metal' ? M.metalMaterial(color || '#cfd2d5') : M.plasticMaterial(color || '#cfd2d5'); b(w, h, d, m, 0, h / 2, 0); b(w * 0.8, 0.06, 0.06, M.metalMaterial('#8c9094'), 0, h * 0.75, d / 2 + 0.03); if (def.range) { b(w, 0.05, d, M.plasticMaterial('#1a1b1c'), 0, h + 0.02, 0); for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) grp.add(cyl(0.3, 0.04, M.plasticMaterial('#333'), x * w * 0.25, h + 0.06, z * d * 0.25)); b(w, 0.6, 0.1, M.plasticMaterial('#1a1b1c'), 0, h + 0.3, -d / 2 + 0.05); } if (def.id === 'washer' || def.id === 'dryer' || def.id === 'stackedwd') { grp.add(cyl(0.7, 0.05, M.glassMaterial(), 0, h * 0.45, d / 2 + 0.03)).rotation.x = Math.PI / 2; } if (def.id === 'fridge') b(w, 0.03, d, M.plasticMaterial('#5b5f63'), 0, h * 0.62, 0); if (def.id === 'dishwasher') b(w * 0.9, 0.3, 0.05, M.plasticMaterial('#2a2b2d'), 0, h - 0.3, d / 2 + 0.03); break; }
      case 'toilet': { const white = M.plasticMaterial('#f2f2f0'); b(w, 1.4, 0.6, white, 0, 1.9, -d / 2 + 0.3); const bowl = cyl(w / 2, 1.3, white, 0, 0.65, d * 0.15); bowl.scale.z = d * 0.7; grp.add(bowl); b(w, 0.1, d * 0.7, white, 0, 1.35, d * 0.15); break; }
      case 'pedestal': { const white = M.plasticMaterial('#f2f2f0'); grp.add(cyl(0.35, h - 0.5, white, 0, (h - 0.5) / 2, 0)); const basin = cyl(w / 2, 0.5, white, 0, h - 0.25, 0); basin.scale.z = d; grp.add(basin); grp.add(cyl(0.05, 0.6, M.metalMaterial('#b8bcc0'), 0, h + 0.3, -d / 2 + 0.3, 8)); break; }
      case 'tub': { const white = M.plasticMaterial('#f4f4f2'); b(w, h, d, white, 0, h / 2, 0); b(w - 0.5, 0.1, d - 0.5, M.plasticMaterial('#dfe8ee'), 0, h - 0.3, 0); break; }
      case 'tubshower': { const white = M.plasticMaterial('#f4f4f2'); b(w, 1.8, d, white, 0, 0.9, 0); b(w - 0.5, 0.1, d - 0.5, M.plasticMaterial('#dfe8ee'), 0, 1.5, 0); b(w, h - 1.8, 0.1, M.plasticMaterial('#e8ecee'), 0, 1.8 + (h - 1.8) / 2, -d / 2 + 0.05); b(0.1, h - 1.8, d, M.plasticMaterial('#e8ecee'), -w / 2 + 0.05, 1.8 + (h - 1.8) / 2, 0); b(0.1, h - 1.8, d, M.plasticMaterial('#e8ecee'), w / 2 - 0.05, 1.8 + (h - 1.8) / 2, 0); grp.add(cyl(0.04, 1.2, M.metalMaterial('#b8bcc0'), -w / 2 + 0.6, 6.0, -d / 2 + 0.1, 8)); const head = cyl(0.3, 0.1, M.metalMaterial('#b8bcc0'), -w / 2 + 0.9, 6.5, -d / 2 + 0.5); head.rotation.x = 0.4; grp.add(head); const rod = cyl(0.05, w, M.metalMaterial('#b8bcc0'), 0, 6.4, d / 2, 8); rod.rotation.z = Math.PI / 2; grp.add(rod); break; }
      case 'shower': { b(w, 0.3, d, M.plasticMaterial('#e8e8e6'), 0, 0.15, 0); const g1 = new THREE.Mesh(new THREE.PlaneGeometry(w, h - 0.3), M.glassMaterial()); g1.position.set(0, (h + 0.3) / 2, d / 2); grp.add(g1); const g2 = g1.clone(); g2.rotation.y = Math.PI / 2; g2.position.set(w / 2, (h + 0.3) / 2, 0); grp.add(g2); b(0.1, h, 0.1, M.metalMaterial(), w / 2, h / 2, d / 2); grp.add(cyl(0.04, 1.0, M.metalMaterial('#b8bcc0'), -w / 2 + 0.3, 6.0, -d / 2 + 0.1, 8)); break; }
      case 'utilitysink': { const basin = b(w, 1.0, d, M.plasticMaterial('#e3e6e8'), 0, h - 0.5, 0); b(w - 0.3, 0.1, d - 0.3, M.plasticMaterial('#c9cfd3'), 0, h - 0.2, 0); for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) b(0.1, h - 1, 0.1, M.metalMaterial('#9aa0a6'), x * (w / 2 - 0.1), (h - 1) / 2, z * (d / 2 - 0.1)); grp.add(cyl(0.05, 0.7, M.metalMaterial('#b8bcc0'), 0, h + 0.3, -d / 2 + 0.2, 8)); break; }
      case 'cylinder': { grp.add(cyl(w / 2, h, M.plasticMaterial(color || '#d0d0d0'), 0, h / 2, 0)); break; }
      case 'rug': { const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), M.fabricMaterial(color || '#9aa58c')); m.rotation.x = -Math.PI / 2; m.position.y = 0.03; m.userData.noShadow = true; grp.add(m); const border = new THREE.Mesh(new THREE.PlaneGeometry(w - 0.6, d - 0.6), M.fabricMaterial('#e8e1d0')); border.rotation.x = -Math.PI / 2; border.position.y = 0.035; border.userData.noShadow = true; grp.add(border); break; }
      case 'ceilinglight': { const disc = cyl(w / 2, 0.25, M.lampMaterial('#fff1d6'), 0, H - 0.14, 0); disc.userData.emissive = true; grp.add(disc); break; }
      case 'recessed': { const ring = cyl(w / 2 + 0.1, 0.03, M.trimMaterial('#f4f2ec'), 0, H - 0.02, 0); grp.add(ring); const disc = cyl(w / 2, 0.03, M.lampMaterial('#fff1d6'), 0, H - 0.03, 0); disc.userData.emissive = true; grp.add(disc); break; }
      case 'shoplight': { b(w, 0.25, d, M.metalMaterial('#dfe3e6'), 0, H - 0.3, 0); const tube = b(w - 0.2, 0.08, d - 0.15, M.lampMaterial('#f4f8ff'), 0, H - 0.44, 0); tube.userData.emissive = true; break; }
      case 'pendant': { grp.add(cyl(0.02, 1.6, M.metalMaterial('#2a2a2a'), 0, H - 0.8, 0, 8)); const shade = new THREE.Mesh(CONE, M.metalMaterial(color || '#2b2b2b')); shade.scale.set(w, 0.9, d); shade.position.y = H - 2.0; grp.add(shade); const bulb = new THREE.Mesh(SPHERE, M.lampMaterial('#fff0c8')); bulb.scale.set(0.35, 0.35, 0.35); bulb.position.y = H - 2.25; bulb.userData.emissive = true; grp.add(bulb); break; }
      case 'chandelier': { grp.add(cyl(0.03, 1.2, M.metalMaterial(color || '#3b3025'), 0, H - 0.6, 0, 8)); const ring = new THREE.Mesh(TORUS, M.metalMaterial(color || '#3b3025')); ring.scale.set(w, d, 1); ring.rotation.x = Math.PI / 2; ring.position.y = H - 1.7; grp.add(ring); for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2; const bulb = new THREE.Mesh(SPHERE, M.lampMaterial('#fff0c8')); bulb.scale.set(0.3, 0.4, 0.3); bulb.position.set(Math.cos(a) * w / 2, H - 1.45, Math.sin(a) * d / 2); bulb.userData.emissive = true; grp.add(bulb); } break; }
      case 'floorlamp': { grp.add(cyl(0.04, h - 1, M.metalMaterial('#3a3a3a'), 0, (h - 1) / 2, 0, 8)); grp.add(cyl(0.5, 0.08, M.metalMaterial('#3a3a3a'), 0, 0.04, 0)); const shade = cyl(0.65, 1.0, M.lampMaterial('#f6e7c8'), 0, h - 0.5, 0); shade.userData.emissive = true; grp.add(shade); break; }
      case 'tablelamp': { const y = it.mountY ?? 2.0; grp.add(cyl(0.18, 1.0, M.plasticMaterial(color || '#3b4a4d'), 0, y + 0.5, 0)); const shade = new THREE.Mesh(CONE, M.lampMaterial('#f6e7c8')); shade.scale.set(1.0, 0.8, 1.0); shade.position.y = y + 1.4; shade.rotation.x = Math.PI; shade.userData.emissive = true; grp.add(shade); break; }
      case 'sconce': { const y = it.mountY ?? def.mountHeight ?? 6; b(0.5, 0.3, 0.3, M.metalMaterial('#2d2d2d'), 0, y, 0.15); const lamp = cyl(0.17, 0.6, M.lampMaterial('#fff0c8'), 0, y + 0.4, 0.2); lamp.userData.emissive = true; grp.add(lamp); break; }
      case 'lantern': { grp.add(cyl(0.12, h - 1, M.metalMaterial('#2a2a2a'), 0, (h - 1) / 2, 0, 8)); const lamp = b(0.8, 0.9, 0.8, M.lampMaterial('#fff0c8'), 0, h - 0.55, 0); lamp.userData.emissive = true; const cap = new THREE.Mesh(CONE, M.metalMaterial('#2a2a2a')); cap.scale.set(1.1, 0.4, 1.1); cap.position.y = h - 0.1 + 0.2; grp.add(cap); break; }
      case 'firepit': { const ring = new THREE.Mesh(TORUS, M.rockMaterial()); ring.rotation.x = Math.PI / 2; ring.scale.set(w, d, 1); ring.position.y = 0.5; grp.add(ring); grp.add(cyl(w * 0.4, 0.3, M.plasticMaterial('#3a3632'), 0, 0.2, 0)); for (let i = 0; i < 4; i++) { const log = cyl(0.18, w * 0.4, M.barkMaterial('#4a3524'), 0, 0.45, 0, 8); log.rotation.z = Math.PI / 2; log.rotation.y = i * 0.8; grp.add(log); } this._addFire(grp, def, it, { x: 0, y: 0.5, z: 0, size: 1.6, light: 0, distance: 0 }, null); break; }
      case 'spruce': {
        const trunk = cyl(0.6 * (it.scale || 1), h * 0.35, M.barkMaterial(), 0, h * 0.175, 0, 8); grp.add(trunk);
        const snowy = opts.snowCover; const coreTint = snowy ? '#4f6a55' : '#2c4631'; const cardTint = snowy ? '#8fa894' : '#3f6243';
        const core = M.leafMaterial(coreTint, Math.max(12, h)); const card = M.foliageCardMaterial('sprucecard', cardTint, Math.max(12, h));
        // solid cones keep the tree a mass from above; branch-fan cards soften the silhouette from the side
        for (let i = 0; i < 3; i++) { const t = i / 3; const cone = new THREE.Mesh(CONE, core); const r = w * (0.62 - t * 0.4); const ch = h * 0.4; cone.scale.set(r, ch, r); cone.position.y = h * 0.2 + t * h * 0.42 + ch / 2; grp.add(cone); }
        const tiers = 4; const seed = hashf(it.x, it.z);
        for (let i = 0; i < tiers; i++) {
          const t = i / tiers; const rt = w * (0.55 - t * 0.12) * (0.92 + hashf(it.x + i, it.z) * 0.16); const cw = rt * 1.7; const ch = h * (0.46 - t * 0.06); const yb = h * (0.1 + t * 0.19);
          const n = i === tiers - 1 ? 4 : 6;
          for (let k = 0; k < n; k++) {
            const a = (k / n) * Math.PI * 2 + seed * 2 + i * 0.5; const m = new THREE.Mesh(new THREE.PlaneGeometry(cw, ch), card);
            m.position.set(Math.cos(a) * rt * 0.22, yb + ch / 2, -Math.sin(a) * rt * 0.22); m.rotation.y = a; m.rotation.x = 0.08; m.castShadow = true; m.receiveShadow = true; grp.add(m);
          }
        }
        if (snowy) for (let i = 0; i < 3; i++) { const t = i / 3; const cap = new THREE.Mesh(CONE, M.snowMaterial()); const r = w * (0.6 - t * 0.4); cap.scale.set(r, h * 0.12, r); cap.position.y = h * 0.2 + t * h * 0.42 + h * 0.4 * 0.78; grp.add(cap); }
        break;
      }
      case 'birch': case 'aspen': {
        const bark = def.build === 'birch' ? M.plasticMaterial('#e6e2d8') : M.barkMaterial('#9a9a8a'); grp.add(cyl(0.5, h * 0.55, bark, 0, h * 0.275, 0, 8));
        if (def.build === 'birch') for (let i = 0; i < 7; i++) b(0.55, 0.12, 0.3, M.plasticMaterial('#2a2a2a'), (i % 2 ? 0.2 : -0.2), h * 0.08 + i * h * 0.065, 0.15);
        const bare = opts.season === 'winter' || opts.snowCover; const fall = opts.season === 'fall';
        const coreTint = fall ? (def.build === 'aspen' ? '#d9a53a' : '#c9962f') : bare ? '#6b5a4a' : (def.build === 'aspen' ? '#5f9a3c' : '#4f8234');
        const cardTint = fall ? (def.build === 'aspen' ? '#e8b848' : '#d7a63a') : opts.season === 'spring' ? '#9fd060' : (def.build === 'aspen' ? '#7fb050' : '#6ea244');
        const core = M.leafMaterial(coreTint, Math.max(12, h)); const card = M.foliageCardMaterial('leafcard', cardTint, Math.max(12, h));
        const blobs = [[0, 0.72, 0, 0.9], [0.3, 0.58, 0.22, 0.56], [-0.32, 0.62, -0.2, 0.54], [0.1, 0.88, -0.25, 0.46], [-0.15, 0.5, 0.3, 0.42]];
        for (const [x, y, z, r] of blobs) { if (bare) { b(0.15, h * 0.35, 0.15, bark, x * w * 0.5, h * y, z * w * 0.5).rotation.z = x; continue; } const sp = new THREE.Mesh(SPHERE, core); sp.scale.set(w * r * 0.85, w * r * 0.72, w * r * 0.85); sp.position.set(x * w, h * y, z * w); grp.add(sp); }
        if (!bare) { const seed = hashf(it.x, it.z); for (let i = 0; i < 12; i++) { const a = seed * 6 + i * 2.39996; const rr = 0.18 + hashf(i, it.x) * 0.3; const cx = Math.cos(a) * rr * w; const cz = Math.sin(a) * rr * w; const cy = h * (0.5 + hashf(i * 3, it.z) * 0.42); const sz = w * (0.42 + hashf(i * 5, it.x + it.z) * 0.22); const m = new THREE.Mesh(new THREE.PlaneGeometry(sz, sz * 0.9), card); m.position.set(cx, cy, cz); m.rotation.set((hashf(i, 9) - 0.5) * 0.6, a + 1.2, 0); m.castShadow = true; m.receiveShadow = true; grp.add(m); } }
        break;
      }
      case 'shrub': { const leaf = M.leafMaterial(opts.snowCover ? '#5f6f60' : '#3a6336', 6); const card = M.foliageCardMaterial('leafcard', opts.snowCover ? '#9eb3a0' : opts.season === 'fall' ? '#c8903a' : '#6aa048', 6); for (const [x, z, r] of [[0, 0, 1], [0.35, 0.2, 0.7], [-0.3, -0.25, 0.65], [0.1, -0.35, 0.5]]) { const sp = new THREE.Mesh(SPHERE, leaf); sp.scale.set(w * r * 0.85, h * r * 0.85, d * r * 0.85); sp.position.set(x * w, h * r * 0.45, z * d); grp.add(sp); } for (let i = 0; i < 5; i++) { const a = i * 1.26 + hashf(it.x, it.z) * 3; const m = new THREE.Mesh(new THREE.PlaneGeometry(w * 0.9, h * 1.0), card); m.position.set(Math.cos(a) * w * 0.15, h * 0.5, Math.sin(a) * d * 0.15); m.rotation.y = a; m.castShadow = true; grp.add(m); } break; }
      case 'boulder': { const m = new THREE.Mesh(new THREE.DodecahedronGeometry(0.5, 1), M.rockMaterial()); const pos = m.geometry.attributes.position; for (let i = 0; i < pos.count; i++) { const k = 0.85 + ((i * 7919) % 13) / 40; pos.setXYZ(i, pos.getX(i) * k, pos.getY(i) * k, pos.getZ(i) * k); } m.geometry.computeVertexNormals(); m.scale.set(w, h, d); m.position.y = h * 0.35; grp.add(m); break; }
      case 'pad': { const m = b(w, h, d, M.gravelMaterial(), 0, h / 2 - 0.05, 0); m.material = m.material.clone(); m.material.map = m.material.map.clone(); m.material.map.needsUpdate = true; m.material.map.repeat.set(w / 6, d / 6); m.receiveShadow = true; break; }
      case 'lawn': { break; }
      case 'path': { const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), M.stoneTinted('#9a9589', 'fieldstone')); m.rotation.x = -Math.PI / 2; m.position.y = 0.08; m.material = m.material.clone(); m.material.map = m.material.map.clone(); m.material.map.needsUpdate = true; m.material.map.repeat.set(w / 4, d / 4); grp.add(m); break; }
      case 'gardenbed': { const wood = M.woodMaterial(color || '#8a6a44'); b(w, h, 0.2, wood, 0, h / 2, -d / 2 + 0.1); b(w, h, 0.2, wood, 0, h / 2, d / 2 - 0.1); b(0.2, h, d, wood, -w / 2 + 0.1, h / 2, 0); b(0.2, h, d, wood, w / 2 - 0.1, h / 2, 0); b(w - 0.4, 0.2, d - 0.4, M.plasticMaterial('#3e2e20'), 0, h - 0.25, 0); const leaf = M.leafMaterial('#4f8a3a', 4); for (let i = 0; i < Math.floor(w * d / 3); i++) { const s = new THREE.Mesh(SPHERE, leaf); s.scale.set(0.9, 0.7, 0.9); s.position.set(-w / 2 + 0.6 + hashf(i, w) * (w - 1.2), h + 0.2, -d / 2 + 0.6 + hashf(i * 3, d) * (d - 1.2)); grp.add(s); } break; }
      case 'woodpile': { const log = M.barkMaterial('#6b5035'); const rows = Math.floor(h / 0.8); for (let r = 0; r < rows; r++) for (let i = 0; i < Math.floor(w / 0.85); i++) { const l = cyl(0.38, d, log, -w / 2 + 0.45 + i * 0.85 + (r % 2) * 0.4, 0.4 + r * 0.78, 0, 8); l.rotation.x = Math.PI / 2; grp.add(l); } break; }
      case 'deck': { const wood = M.deckMaterial(color || '#9a6a3c'); const top = b(w, 0.15, d, wood, 0, h, 0); top.material = wood; const post = M.woodMaterial(color || '#8a5a3a'); for (let x = -w / 2 + 0.3; x <= w / 2 - 0.29; x += Math.max(2, (w - 0.6) / Math.max(1, Math.round((w - 0.6) / 6)))) for (let z = -d / 2 + 0.3; z <= d / 2 - 0.29; z += Math.max(2, (d - 0.6) / Math.max(1, Math.round((d - 0.6) / 6)))) b(0.46, h, 0.46, post, x, h / 2, z); b(w, 0.8, 0.15, post, 0, h - 0.5, -d / 2 + 0.07); b(w, 0.8, 0.15, post, 0, h - 0.5, d / 2 - 0.07); b(0.15, 0.8, d, post, -w / 2 + 0.07, h - 0.5, 0); b(0.15, 0.8, d, post, w / 2 - 0.07, h - 0.5, 0); if (def.railing) { const rail = M.woodMaterial(color || '#8a5a3a'); const sides = [[-w / 2, 0, 0.15, d], [w / 2, 0, 0.15, d], [0, d / 2, w, 0.15]]; for (const [x, z, sw, sd] of sides) { b(sw + 0.1, 0.2, sd + 0.1, rail, x, h + 3.0, z); b(sw, 0.12, sd, rail, x, h + 1.6, z); const n = Math.floor(Math.max(sw, sd) / 0.42); for (let i = 0; i <= n; i++) { const t = n ? i / n : 0.5; const px = sw > sd ? x - sw / 2 + sw * t : x; const pz = sd > sw ? z - sd / 2 + sd * t : z; b(0.1, 2.9, 0.1, rail, px, h + 1.55, pz); } } for (const [x, z] of [[-w / 2, -d / 2], [w / 2, -d / 2], [-w / 2, d / 2], [w / 2, d / 2]]) b(0.3, 3.2, 0.3, post, x, h + 1.6, z); } break; }
      case 'porch': { const wood = M.deckMaterial(color || '#9a6a3c'); const post = M.woodMaterial(color || '#8a5a3a'); b(w, 0.15, d, wood, 0, 2.5, 0); for (const [x, z] of [[-w / 2 + 0.3, -d / 2 + 0.3], [w / 2 - 0.3, -d / 2 + 0.3], [-w / 2 + 0.3, d / 2 - 0.3], [w / 2 - 0.3, d / 2 - 0.3]]) { b(0.5, 2.5, 0.5, post, x, 1.25, z); b(0.5, h - 2.5, 0.5, post, x, 2.5 + (h - 2.5) / 2, z); } const roofM = M.roofingMaterial(ctx.project.structure.roof.material, ctx.project.structure.roof.color); const rf = b(w + 1, 0.4, d + 1, roofM, 0, h + 0.2, 0); rf.rotation.x = 0.18; b(w, 0.4, 0.3, post, 0, h - 0.2, -d / 2 + 0.15); b(w, 0.4, 0.3, post, 0, h - 0.2, d / 2 - 0.15); break; }
      case 'fence': { const wood = M.woodMaterial(color || '#9a7a4c'); b(0.3, h, 0.3, wood, -w / 2, h / 2, 0); b(0.3, h, 0.3, wood, w / 2, h / 2, 0); b(w, 0.25, 0.1, wood, 0, h * 0.3, 0); b(w, 0.25, 0.1, wood, 0, h * 0.8, 0); const n = Math.floor(w / 0.5); for (let i = 0; i < n; i++) b(0.3, h - 0.3, 0.07, wood, -w / 2 + 0.3 + i * (w - 0.6) / Math.max(1, n - 1), (h - 0.3) / 2 + 0.15, 0.1); break; }
      case 'shed': { const side = M.sidingMaterial('t111', color || '#8f877a'); b(w, h * 0.72, d, side, 0, h * 0.36, 0); const roofM = M.roofingMaterial('corrugated', '#9aa0a6'); const r1 = b(w + 0.8, 0.3, d * 0.56 + 0.4, roofM, 0, h * 0.86, -d * 0.26); r1.rotation.x = -0.6; const r2 = b(w + 0.8, 0.3, d * 0.56 + 0.4, roofM, 0, h * 0.86, d * 0.26); r2.rotation.x = 0.6; b(2.5, 5.5, 0.2, M.trimMaterial('#e8e1d2'), 0, 2.75, d / 2 + 0.05); break; }
      case 'tank': { const m = cyl(d / 2, w, M.metalMaterial('#9aa0a4'), 0, h - d / 2, 0); m.rotation.z = Math.PI / 2; grp.add(m); for (const x of [-1, 1]) for (const z of [-1, 1]) b(0.2, h - d / 2, 0.2, M.metalMaterial('#4a4e52'), x * (w / 2 - 0.6), (h - d / 2) / 2, z * (d / 2 - 0.5)); break; }
      case 'propane': { const m = cyl(d / 2, w - d, M.metalMaterial('#e6e9ea'), 0, h - d / 2, 0); m.rotation.z = Math.PI / 2; grp.add(m); for (const x of [-1, 1]) { const cap = new THREE.Mesh(SPHERE, M.metalMaterial('#e6e9ea')); cap.scale.set(d, d, d); cap.position.set(x * (w - d) / 2, h - d / 2, 0); grp.add(cap); b(0.3, h - d / 2, 1.2, M.metalMaterial('#9aa0a6'), x * (w / 2 - 1.5), (h - d / 2) / 2, 0); } b(0.8, 0.5, 0.8, M.metalMaterial('#4a4e52'), 0, h + 0.2, 0); break; }
      case 'septic': { const green = M.plasticMaterial('#4e7a4a'); grp.add(cyl(0.9, 0.3, green, -w / 2 + 1.5, 0.15, 0)); grp.add(cyl(0.9, 0.3, green, w / 2 - 1.5, 0.15, 0)); const ghost = b(w, 1.2, d, M.ghostMaterial('#7fc8ff'), 0, -0.7, 0); ghost.userData.noShadow = true; break; }
      case 'solar': { const post = M.metalMaterial('#6d7378'); for (const x of [-w / 2 + 1, w / 2 - 1]) { b(0.3, h * 0.5, 0.3, post, x, h * 0.25, 0); } const panel = b(w, 0.2, d, M.glossMaterial('#1b2a44'), 0, h * 0.7, 0); panel.rotation.x = -0.6; const grid = b(w - 0.2, 0.02, d - 0.2, M.plasticMaterial('#2f4a7a'), 0, h * 0.7 + 0.12, 0); grid.rotation.x = -0.6; break; }
      case 'solarroof': { const roof = ctx.roofs.map((r) => ({ r, y: roofHeightAt(r, it.x, it.z) })).find((q) => q.y != null); if (!roof) { b(w, 0.2, d, M.glossMaterial('#1b2a44'), 0, 0.5, 0); break; } const y = roof.y; const r = roof.r; const yx = roofHeightAt(r, it.x + 1, it.z); const yz = roofHeightAt(r, it.x, it.z + 1); const sx = yx != null ? yx - y : 0; const sz = yz != null ? yz - y : 0; grp.rotation.y = 0; const n = new THREE.Vector3(-sx, 1, -sz).normalize(); const panel = new THREE.Mesh(BOX, M.glossMaterial('#1b2a44')); panel.scale.set(w, 0.25, d); panel.position.set(0, y + 0.35, 0); panel.quaternion.setFromUnitVectors(UP, n); grp.add(panel); const frame = panel.clone(); frame.material = M.metalMaterial('#b9bcc0'); frame.scale.set(w + 0.1, 0.2, d + 0.1); frame.position.y = y + 0.3; grp.add(frame); break; }
      case 'heatpump': { b(w, h, d, M.metalMaterial(color || '#d9dcdf'), 0, h / 2, 0); const fan = cyl(Math.min(w, h) * 0.38, 0.1, M.plasticMaterial('#2a2b2d'), 0, h * 0.55, d / 2 + 0.03); fan.rotation.x = Math.PI / 2; grp.add(fan); break; }
      case 'truck': case 'suv': case 'car': {
        const paint = M.carPaint(color || '#4f6b84'); const glass = M.tintedGlass(); const isTruck = def.build === 'truck';
        const bodyH = def.build === 'car' ? 1.9 : 2.4; const wheelR = def.build === 'car' ? 1.1 : 1.45; const clearance = def.build === 'car' ? 0.5 : 0.9;
        b(w, bodyH, d, paint, 0, clearance + bodyH / 2, 0);
        const cabLen = isTruck ? d * 0.33 : d * 0.55; const cabZ = isTruck ? -d / 2 + d * 0.22 + cabLen / 2 : 0.2;
        b(w - 0.3, h - clearance - bodyH, cabLen, paint, 0, clearance + bodyH + (h - clearance - bodyH) / 2, cabZ);
        b(w - 0.35, h - clearance - bodyH - 0.3, cabLen - 0.4, glass, 0, clearance + bodyH + (h - clearance - bodyH) / 2 + 0.05, cabZ);
        if (isTruck) { b(w - 0.4, 0.8, d * 0.44, M.plasticMaterial('#2a2b2d'), 0, clearance + bodyH - 0.1, d / 2 - d * 0.23); b(w - 0.3, 1.2, 0.1, paint, 0, clearance + bodyH - 0.6 + 0.6, cabZ + cabLen / 2 + 0.05); }
        if (!isTruck) b(w - 0.3, 0.3, d * 0.3, paint, 0, clearance + bodyH + 0.15, -d / 2 + d * 0.15);
        for (const x of [-1, 1]) for (const z of [-d / 2 + d * 0.18, d / 2 - d * 0.18]) wheel(x * (w / 2 - 0.3), wheelR, z, wheelR, 0.8);
        b(w - 0.6, 0.35, 0.1, M.plasticMaterial('#fff6d8'), 0, clearance + bodyH * 0.6, -d / 2 - 0.03); b(w - 0.6, 0.3, 0.1, M.plasticMaterial('#c22'), 0, clearance + bodyH * 0.6, d / 2 + 0.03); break;
      }
      case 'sled': { const paint = M.carPaint(color || '#2f6fb3'); b(w * 0.55, 1.1, d * 0.6, paint, 0, 1.8, -d * 0.1); b(w * 0.3, 1.0, d * 0.35, M.plasticMaterial('#1f1f21'), 0, 2.5, d * 0.1); b(w * 0.5, 0.9, 0.1, M.tintedGlass(), 0, 3.1, -d * 0.35).rotation.x = -0.5; b(w * 0.75, 0.5, d * 0.5, M.plasticMaterial('#1f1f21'), 0, 0.7, d * 0.15); for (const x of [-1, 1]) { b(0.5, 0.2, d * 0.35, M.metalMaterial('#3a3d40'), x * w * 0.4, 0.3, -d * 0.3); b(0.15, 0.8, 0.15, M.metalMaterial('#3a3d40'), x * w * 0.4, 0.8, -d * 0.3); } b(w * 0.55, 0.4, 0.1, M.metalMaterial('#b9bcc0'), 0, 3.3, -d * 0.2); break; }
      case 'atv': { const paint = M.carPaint(color || '#3f5a46'); b(w * 0.55, 1.0, d * 0.75, paint, 0, 1.7, 0); b(w * 0.45, 0.6, d * 0.4, M.plasticMaterial('#1f1f21'), 0, 2.5, d * 0.05); b(w * 0.9, 0.3, d * 0.35, M.plasticMaterial('#2a2b2d'), 0, 2.0, -d * 0.3); b(w * 0.9, 0.3, d * 0.3, M.plasticMaterial('#2a2b2d'), 0, 2.0, d * 0.33); for (const x of [-1, 1]) for (const z of [-d * 0.32, d * 0.32]) wheel(x * (w / 2 - 0.4), 1.1, z, 1.1, 0.8); b(w * 0.6, 0.1, 0.1, M.metalMaterial('#3a3d40'), 0, 3.3, -d * 0.15); b(0.1, 0.9, 0.1, M.metalMaterial('#3a3d40'), 0, 2.9, -d * 0.15); break; }
      case 'trailer': { const steel = M.metalMaterial(color || '#5b5f63'); b(w, 0.3, d * 0.8, steel, 0, 1.3, d * 0.1); b(w, 0.15, d * 0.8, M.woodMaterial('#9a7a4c'), 0, 1.5, d * 0.1); b(0.3, 0.3, d * 0.25, steel, 0, 1.3, -d / 2 + d * 0.12); for (const x of [-1, 1]) wheel(x * (w / 2 - 0.1), 0.95, d * 0.2, 0.95, 0.6); for (const x of [-1, 1]) b(0.15, 1.2, d * 0.8, steel, x * (w / 2), 2.0, d * 0.1); break; }
      case 'chimneybase': { b(w, h, d, M.stoneTinted(color || '#8a8580'), 0, h / 2, 0); break; }
      case 'marker': { const y = def.wall ? (it.mountY ?? def.mountHeight ?? 1.2) : def.ceiling ? H - 0.15 : h / 2; const m = b(w, def.h, Math.max(d, 0.15), M.emissiveMaterial(color || '#ffb547', 0.6), 0, y, 0); m.userData.noShadow = true; m.castShadow = false; break; }
      default: { const y = def.wall ? (it.mountY ?? def.mountHeight ?? 4) : h / 2; const mat = def.palette === 'cabinet' ? M.cabinetMaterial(color || '#5f4a38', finish || 'wood') : def.palette === 'metal' ? M.metalMaterial(color || '#9aa0a6') : color ? M.plasticMaterial(color) : M.woodMaterial('#8a5a3a'); b(w, h, d, mat, 0, y, 0); }
    }
  }
}

function bboxOfWalls(walls) {
  const b = { minX: Infinity, maxX: -Infinity, minZ: Infinity, maxZ: -Infinity };
  for (const w of walls) for (const q of [w.a, w.b]) { b.minX = Math.min(b.minX, q.x); b.maxX = Math.max(b.maxX, q.x); b.minZ = Math.min(b.minZ, q.z); b.maxZ = Math.max(b.maxZ, q.z); }
  b.w = b.maxX - b.minX; b.d = b.maxZ - b.minZ; return b;
}
export { bboxOfWalls };
