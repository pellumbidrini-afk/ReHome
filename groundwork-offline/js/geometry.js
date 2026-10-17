// Groundwork — 2D plan geometry. Pure functions, no DOM, no three.js. Runs in Node for tests.
// Plan coordinates are {x, z} in feet (y is up in the 3D scene).

export const EPS = 1e-6;
const NODE_TOL = 0.06; // ft — endpoints closer than this are the same node

export function snapTo(v, step) { return Math.round(v / step) * step; }
export function dist(a, b) { return Math.hypot(a.x - b.x, a.z - b.z); }
export function sub(a, b) { return { x: a.x - b.x, z: a.z - b.z }; }
export function add(a, b) { return { x: a.x + b.x, z: a.z + b.z }; }
export function scale(a, s) { return { x: a.x * s, z: a.z * s }; }
export function len(v) { return Math.hypot(v.x, v.z); }
export function norm(v) { const l = len(v) || 1; return { x: v.x / l, z: v.z / l }; }
export function dot(a, b) { return a.x * b.x + a.z * b.z; }
export function cross(a, b) { return a.x * b.z - a.z * b.x; }
export function perp(v) { return { x: -v.z, z: v.x }; } // left-hand perpendicular (CCW rotation in x→z plane terms)
export function lerp(a, b, t) { return { x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t }; }
export function samePoint(a, b, tol = NODE_TOL) { return dist(a, b) <= tol; }

// Parameter t of the projection of p onto segment ab, clamped to [0, 1].
export function projectParam(p, a, b) {
  const ab = sub(b, a); const l2 = dot(ab, ab);
  if (l2 < EPS) return 0;
  return Math.max(0, Math.min(1, dot(sub(p, a), ab) / l2));
}
export function closestOnSegment(p, a, b) { return lerp(a, b, projectParam(p, a, b)); }
export function distToSegment(p, a, b) { return dist(p, closestOnSegment(p, a, b)); }

// Proper or touching intersection of segments ab and cd. Returns {x,z,t,u} or null.
// Parallel/collinear segments return null (collinear overlaps are handled by node merging).
export function segIntersect(a, b, c, d, tol = 1e-4) {
  const r = sub(b, a); const s = sub(d, c);
  const denom = cross(r, s);
  if (Math.abs(denom) < EPS) return null;
  const qp = sub(c, a);
  const t = cross(qp, s) / denom;
  const u = cross(qp, r) / denom;
  if (t < -tol || t > 1 + tol || u < -tol || u > 1 + tol) return null;
  const tc = Math.max(0, Math.min(1, t)); const uc = Math.max(0, Math.min(1, u));
  return { x: a.x + r.x * tc, z: a.z + r.z * tc, t: tc, u: uc };
}

// Snap a candidate point to the "magnets" of a plan: existing endpoints first, then points on wall
// lines (so new walls can start from the middle of an existing wall), then the grid.
export function snapPoint(p, walls, gridStep, opts = {}) {
  const magnet = opts.magnet ?? 0.9;
  let best = null; let bestD = magnet;
  for (const w of walls) {
    for (const q of [w.a, w.b]) {
      const d = dist(p, q);
      if (d < bestD) { bestD = d; best = { x: q.x, z: q.z, kind: 'endpoint', wallId: w.id }; }
    }
  }
  if (best) return best;
  bestD = magnet * 0.6;
  for (const w of walls) {
    const q = closestOnSegment(p, w.a, w.b);
    const d = dist(p, q);
    if (d < bestD) {
      // keep the position along the wall on the grid for tidy T-junctions
      const t = projectParam(p, w.a, w.b); const L = dist(w.a, w.b);
      const along = snapTo(t * L, gridStep);
      const dir = norm(sub(w.b, w.a));
      const sp = add(w.a, scale(dir, Math.max(0, Math.min(L, along))));
      bestD = d; best = { x: sp.x, z: sp.z, kind: 'onwall', wallId: w.id };
    }
  }
  if (best) return best;
  return { x: snapTo(p.x, gridStep), z: snapTo(p.z, gridStep), kind: 'grid' };
}

// Constrain the end of a wall being drawn to 0/45/90° from its start when close to those angles.
// Right angles only: the wall runs along whichever axis dominates the drag.
export function snapOrtho(a, p, gridStep) {
  const dx = p.x - a.x; const dz = p.z - a.z;
  if (Math.abs(dx) >= Math.abs(dz)) return { x: a.x + snapTo(dx, gridStep), z: a.z };
  return { x: a.x, z: a.z + snapTo(dz, gridStep) };
}
export function snapAngle(a, p, gridStep) {
  const v = sub(p, a); const L = len(v);
  if (L < gridStep) return p;
  const ang = Math.atan2(v.z, v.x);
  const step = Math.PI / 4;
  const k = Math.round(ang / step) * step;
  if (Math.abs(ang - k) < 0.12) {
    const Ls = snapTo(L, gridStep / 2);
    return { x: a.x + Math.cos(k) * Ls, z: a.z + Math.sin(k) * Ls };
  }
  return p;
}

// ---------------------------------------------------------------------------
// Planar graph of walls on one floor: split walls where they cross or T into each other,
// merge coincident endpoints into nodes.
// ---------------------------------------------------------------------------
export function buildPlanarGraph(walls) {
  const nodes = []; // {x, z}
  const nodeIndex = (p) => {
    for (let i = 0; i < nodes.length; i++) if (samePoint(nodes[i], p)) return i;
    nodes.push({ x: p.x, z: p.z }); return nodes.length - 1;
  };
  // split points per wall (parameter t along a→b)
  const splits = walls.map(() => [0, 1]);
  for (let i = 0; i < walls.length; i++) {
    for (let j = i + 1; j < walls.length; j++) {
      const A = walls[i]; const B = walls[j];
      const hit = segIntersect(A.a, A.b, B.a, B.b);
      if (hit) { splits[i].push(hit.t); splits[j].push(hit.u); }
      // endpoints lying on the other segment (T-junctions that the strict test may miss when parallel-ish)
      for (const q of [B.a, B.b]) {
        if (distToSegment(q, A.a, A.b) < NODE_TOL) splits[i].push(projectParam(q, A.a, A.b));
      }
      for (const q of [A.a, A.b]) {
        if (distToSegment(q, B.a, B.b) < NODE_TOL) splits[j].push(projectParam(q, B.a, B.b));
      }
    }
  }
  const edges = []; // {i, j, wallId, t0, t1}
  walls.forEach((w, wi) => {
    const ts = Array.from(new Set(splits[wi].map((t) => Math.round(t * 1e4) / 1e4))).sort((p, q) => p - q);
    for (let k = 0; k < ts.length - 1; k++) {
      const p0 = lerp(w.a, w.b, ts[k]); const p1 = lerp(w.a, w.b, ts[k + 1]);
      if (dist(p0, p1) < NODE_TOL) continue;
      const i = nodeIndex(p0); const j = nodeIndex(p1);
      if (i === j) continue;
      edges.push({ i, j, wallId: w.id, t0: ts[k], t1: ts[k + 1] });
    }
  });
  // adjacency
  const adj = nodes.map(() => []);
  edges.forEach((e, ei) => { adj[e.i].push({ to: e.j, edge: ei, dir: 1 }); adj[e.j].push({ to: e.i, edge: ei, dir: -1 }); });
  for (let n = 0; n < nodes.length; n++) {
    adj[n].forEach((h) => { const q = nodes[h.to]; h.angle = Math.atan2(q.z - nodes[n].z, q.x - nodes[n].x); });
    adj[n].sort((p, q) => p.angle - q.angle);
  }
  return { nodes, edges, adj };
}

// Connected components of the wall graph → arrays of wall ids. Detached garages get their own roof.
export function components(graph, walls) {
  const seen = new Array(graph.nodes.length).fill(-1);
  let comp = 0;
  for (let s = 0; s < graph.nodes.length; s++) {
    if (seen[s] >= 0) continue;
    const stack = [s]; seen[s] = comp;
    while (stack.length) {
      const n = stack.pop();
      for (const h of graph.adj[n]) if (seen[h.to] < 0) { seen[h.to] = comp; stack.push(h.to); }
    }
    comp++;
  }
  const byComp = Array.from({ length: comp }, () => new Set());
  for (const e of graph.edges) byComp[seen[e.i]].add(e.wallId);
  return byComp.map((set) => walls.filter((w) => set.has(w.id)));
}

// Enumerate faces of the planar graph. Each face is traced with its interior on the left of travel,
// so bounded faces (rooms) come out counter-clockwise with positive signed area; the unbounded
// outer face has negative area. Dangling walls are walked out and back and cancel out.
export function findFaces(graph) {
  const { nodes, edges, adj } = graph;
  const visited = new Set(); // key: edgeIndex*2 + (dir===1?0:1)
  const faces = [];
  const keyOf = (ei, dir) => ei * 2 + (dir === 1 ? 0 : 1);
  for (let ei = 0; ei < edges.length; ei++) {
    for (const dir of [1, -1]) {
      if (visited.has(keyOf(ei, dir))) continue;
      const face = { halfEdges: [], nodeIds: [] };
      let curEdge = ei; let curDir = dir;
      let guard = 0;
      while (guard++ < 10000) {
        const k = keyOf(curEdge, curDir);
        if (visited.has(k)) break;
        visited.add(k);
        const e = edges[curEdge];
        const from = curDir === 1 ? e.i : e.j; const to = curDir === 1 ? e.j : e.i;
        face.halfEdges.push({ edge: curEdge, dir: curDir, from, to });
        face.nodeIds.push(from);
        // at `to`, find the reverse half-edge and take the previous one in CCW order
        const list = adj[to];
        let idx = list.findIndex((h) => h.edge === curEdge && h.to === from);
        if (idx < 0) break;
        const next = list[(idx - 1 + list.length) % list.length];
        curEdge = next.edge; curDir = next.dir;
        if (curEdge === ei && curDir === dir) break;
      }
      let area = 0;
      for (let k = 0; k < face.nodeIds.length; k++) {
        const p = nodes[face.nodeIds[k]]; const q = nodes[face.nodeIds[(k + 1) % face.nodeIds.length]];
        area += p.x * q.z - q.x * p.z;
      }
      face.area = area / 2;
      faces.push(face);
    }
  }
  return faces;
}

// Remove out-and-back spikes (dangling walls) from a traced polygon.
export function cleanPolygon(pts) {
  let out = pts.slice();
  let changed = true;
  while (changed && out.length > 2) {
    changed = false;
    for (let i = 0; i < out.length; i++) {
      const a = out[i]; const c = out[(i + 2) % out.length];
      if (samePoint(a, c)) {
        // [a, b, a] → [a]: drop b and the return to a (higher index first so indices stay valid)
        const rm = [(i + 1) % out.length, (i + 2) % out.length].sort((p, q) => q - p);
        out.splice(rm[0], 1); out.splice(rm[1], 1);
        changed = true; break;
      }
    }
  }
  // drop consecutive duplicates
  const res = [];
  for (const p of out) if (!res.length || !samePoint(res[res.length - 1], p)) res.push(p);
  if (res.length > 1 && samePoint(res[0], res[res.length - 1])) res.pop();
  return res;
}

export function polygonArea(pts) {
  let a = 0;
  for (let i = 0; i < pts.length; i++) { const p = pts[i]; const q = pts[(i + 1) % pts.length]; a += p.x * q.z - q.x * p.z; }
  return a / 2;
}
export function polygonCentroid(pts) {
  let cx = 0; let cz = 0; let a = 0;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i]; const q = pts[(i + 1) % pts.length]; const f = p.x * q.z - q.x * p.z;
    cx += (p.x + q.x) * f; cz += (p.z + q.z) * f; a += f;
  }
  if (Math.abs(a) < EPS) { const n = pts.length; return { x: pts.reduce((s, p) => s + p.x, 0) / n, z: pts.reduce((s, p) => s + p.z, 0) / n }; }
  return { x: cx / (3 * a), z: cz / (3 * a) };
}
export function pointInPolygon(p, pts) {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const pi = pts[i]; const pj = pts[j];
    if ((pi.z > p.z) !== (pj.z > p.z) && p.x < ((pj.x - pi.x) * (p.z - pi.z)) / (pj.z - pi.z) + pi.x) inside = !inside;
  }
  return inside;
}
export function bbox(points) {
  const b = { minX: Infinity, minZ: Infinity, maxX: -Infinity, maxZ: -Infinity };
  for (const p of points) { b.minX = Math.min(b.minX, p.x); b.maxX = Math.max(b.maxX, p.x); b.minZ = Math.min(b.minZ, p.z); b.maxZ = Math.max(b.maxZ, p.z); }
  if (!isFinite(b.minX)) return null;
  b.w = b.maxX - b.minX; b.d = b.maxZ - b.minZ; b.cx = (b.minX + b.maxX) / 2; b.cz = (b.minZ + b.maxZ) / 2;
  return b;
}

// ---------------------------------------------------------------------------
// Rooms + exterior classification for one floor's walls.
// Returns { rooms, wallInfo: Map(wallId → {exterior, outward:'left'|'right'|'both'|null, leftRoom, rightRoom}), components }
// `outward` is relative to the wall's a→b direction; 'left' means the outside is on the left of a→b.
// ---------------------------------------------------------------------------
export function analyzeWalls(walls) {
  const graph = buildPlanarGraph(walls);
  const faces = findFaces(graph);
  const rooms = [];
  const faceRoom = new Map();
  faces.forEach((f, fi) => {
    if (f.area > 4) { // bounded, at least a closet
      const poly = cleanPolygon(f.nodeIds.map((n) => graph.nodes[n]));
      if (poly.length < 3) return;
      const area = Math.abs(polygonArea(poly));
      if (area < 4) return;
      const c = polygonCentroid(poly);
      rooms.push({ index: rooms.length, polygon: poly, area, centroid: c, bbox: bbox(poly), wallIds: new Set(f.halfEdges.map((h) => graph.edges[h.edge].wallId)), faceIndex: fi });
      faceRoom.set(fi, rooms.length - 1);
    }
  });
  // side classification: for each half-edge, the face on its left
  const leftFaceOfHalf = new Map(); // key edge*2+dirbit → face index
  faces.forEach((f, fi) => { for (const h of f.halfEdges) leftFaceOfHalf.set(h.edge * 2 + (h.dir === 1 ? 0 : 1), fi); });
  const outerFaces = new Set(faces.map((f, i) => (f.area <= 4 ? i : -1)).filter((i) => i >= 0));
  const wallInfo = new Map();
  for (const w of walls) wallInfo.set(w.id, { exterior: false, outward: null, leftRoom: null, rightRoom: null, subEdges: 0 });
  graph.edges.forEach((e, ei) => {
    const info = wallInfo.get(e.wallId); info.subEdges++;
    const fL = leftFaceOfHalf.get(ei * 2 + 0); // travelling a→b, face on left
    const fR = leftFaceOfHalf.get(ei * 2 + 1); // travelling b→a, face on left == right of a→b
    const lOuter = fL === undefined || outerFaces.has(fL);
    const rOuter = fR === undefined || outerFaces.has(fR);
    if (lOuter && rOuter) { info.exterior = true; info.outward = 'both'; }
    else if (lOuter) { info.exterior = true; info.outward = info.outward === 'right' ? 'both' : 'left'; }
    else if (rOuter) { info.exterior = true; info.outward = info.outward === 'left' ? 'both' : 'right'; }
    if (!lOuter && faceRoom.has(fL)) info.leftRoom = faceRoom.get(fL);
    if (!rOuter && faceRoom.has(fR)) info.rightRoom = faceRoom.get(fR);
  });
  // A wall that is its own little component (not joined to the room walls) but sits inside a room
  // is an interior wall, not a lone exterior one.
  for (const w of walls) {
    const info = wallInfo.get(w.id);
    if (info.outward === 'both') {
      const mid = { x: (w.a.x + w.b.x) / 2, z: (w.a.z + w.b.z) / 2 };
      const r = rooms.findIndex((rm) => pointInPolygon(mid, rm.polygon));
      if (r >= 0) { info.exterior = false; info.outward = null; info.leftRoom = r; info.rightRoom = r; }
    }
  }
  const comps = components(graph, walls);
  return { rooms, wallInfo, components: comps, graph };
}

// Nodes where walls meet, with the walls at each (used for corner trim and plate extension).
export function wallJunctions(walls) {
  const junctions = []; // {x,z, walls:[{wall, end:'a'|'b'}]}
  for (const w of walls) {
    for (const end of ['a', 'b']) {
      const p = w[end];
      let j = junctions.find((q) => samePoint(q, p));
      if (!j) { j = { x: p.x, z: p.z, walls: [] }; junctions.push(j); }
      j.walls.push({ wall: w, end });
    }
  }
  return junctions;
}

// Direction unit vector and length for a wall.
export function wallVec(w) { const v = sub(w.b, w.a); const L = len(v); return { dir: L > EPS ? { x: v.x / L, z: v.z / L } : { x: 1, z: 0 }, length: L }; }

// Does the end of this wall meet another wall that is not collinear with it?
export function endHasCorner(wall, end, walls) {
  const p = wall[end]; const { dir } = wallVec(wall);
  for (const o of walls) {
    if (o.id === wall.id) continue;
    const touchesA = samePoint(o.a, p); const touchesB = samePoint(o.b, p);
    if (!touchesA && !touchesB) continue;
    const od = wallVec(o).dir;
    if (Math.abs(cross(dir, od)) > 0.05) return true;
  }
  return false;
}

// Simple deterministic id for rooms so names stick across edits: floor + rounded centroid.
export function roomKey(floorIndex, centroid) { return `${floorIndex}:${Math.round(centroid.x * 2)},${Math.round(centroid.z * 2)}`; }
