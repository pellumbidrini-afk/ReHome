// Groundwork — blueprint sheet renderer. Draws a floor plan (walls, doors with swings, windows,
// dimensions, room labels, north arrow, title block) and a materials sheet onto canvases that the
// phone can save as images. Pure canvas 2D; no DOM beyond createElement('canvas').
import { wallVec, perp } from './geometry.js';
import { regionById, openingStyle, wallDims, roofFor, stairSpec, stairOpening } from './model.js';
import { ROOF_STYLES, FOUNDATIONS, INSULATION, SIDING, ROOFING, STONE_VENEER, MODES, itemDef } from './catalog.js';

const W = 2400; const H = 1700;
const PAPER = '#1b4aa0'; const INK = 'rgba(255,255,255,0.92)'; const INK2 = 'rgba(255,255,255,0.55)'; const INK3 = 'rgba(255,255,255,0.28)';
const FONT = (px, w = 400) => `${w} ${px}px "IBM Plex Mono", ui-monospace, Menlo, Consolas, monospace`;
const SANS = (px, w = 400) => `${w} ${px}px "IBM Plex Sans", -apple-system, Helvetica, Arial, sans-serif`;

function ftIn(ft) { ft = Math.abs(ft); let f = Math.floor(ft); let i = Math.round((ft - f) * 12); if (i === 12) { f++; i = 0; } return `${f}'${i ? `-${i}"` : ''}`; }
function money(v) { return `$${Math.round(v).toLocaleString()}`; }

function sheet(title, subtitle, project, pageNo, pageCount) {
  const c = document.createElement('canvas'); c.width = W; c.height = H; const ctx = c.getContext('2d');
  // paper
  ctx.fillStyle = PAPER; ctx.fillRect(0, 0, W, H);
  const img = ctx.getImageData(0, 0, W, H); const d = img.data;
  for (let i = 0; i < d.length; i += 4) { const n = (Math.random() - 0.5) * 9; d[i] += n * 0.6; d[i + 1] += n * 0.8; d[i + 2] += n; }
  ctx.putImageData(img, 0, 0);
  // fine grid
  ctx.strokeStyle = 'rgba(255,255,255,0.07)'; ctx.lineWidth = 1;
  for (let x = 60; x < W; x += 20) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke(); }
  for (let y = 60; y < H; y += 20) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }
  // border: double frame with ruler ticks
  ctx.strokeStyle = INK; ctx.lineWidth = 4; ctx.strokeRect(60, 60, W - 120, H - 120);
  ctx.lineWidth = 1.5; ctx.strokeRect(74, 74, W - 148, H - 148);
  ctx.strokeStyle = INK2; ctx.lineWidth = 2;
  for (let x = 60; x <= W - 60; x += 20) { const L = (x - 60) % 100 === 0 ? 22 : 11; ctx.beginPath(); ctx.moveTo(x, 60); ctx.lineTo(x, 60 - L); ctx.moveTo(x, H - 60); ctx.lineTo(x, H - 60 + L); ctx.stroke(); }
  for (let y = 60; y <= H - 60; y += 20) { const L = (y - 60) % 100 === 0 ? 22 : 11; ctx.beginPath(); ctx.moveTo(60, y); ctx.lineTo(60 - L, y); ctx.moveTo(W - 60, y); ctx.lineTo(W - 60 + L, y); ctx.stroke(); }
  // title block (bottom right)
  const tb = { x: W - 74 - 720, y: H - 74 - 230, w: 720, h: 230 };
  ctx.strokeStyle = INK; ctx.lineWidth = 2.5; ctx.strokeRect(tb.x, tb.y, tb.w, tb.h);
  ctx.beginPath(); ctx.moveTo(tb.x, tb.y + 70); ctx.lineTo(tb.x + tb.w, tb.y + 70); ctx.moveTo(tb.x, tb.y + 150); ctx.lineTo(tb.x + tb.w, tb.y + 150); ctx.moveTo(tb.x + 420, tb.y + 70); ctx.lineTo(tb.x + 420, tb.y + tb.h); ctx.stroke();
  ctx.fillStyle = INK; ctx.font = FONT(30, 500); ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
  ctx.fillText(project.name.toUpperCase().slice(0, 34), tb.x + 20, tb.y + 36);
  ctx.font = FONT(16); ctx.fillStyle = INK2; ctx.fillText('GROUNDWORK · PLANNING SKETCH', tb.x + 20, tb.y + 60);
  ctx.fillStyle = INK; ctx.font = SANS(22, 500); ctx.fillText(title, tb.x + 20, tb.y + 100); ctx.font = SANS(17); ctx.fillStyle = INK2; ctx.fillText(subtitle, tb.x + 20, tb.y + 128);
  ctx.font = FONT(16); ctx.fillStyle = INK2;
  ctx.fillText(`SHEET ${pageNo} OF ${pageCount}`, tb.x + 440, tb.y + 100); ctx.fillText(new Date().toLocaleDateString(), tb.x + 440, tb.y + 128);
  ctx.fillText(`${regionById(project.settings.regionId).name.split(' (')[0]}`, tb.x + 20, tb.y + 175); ctx.fillText(`MODE ${MODES[project.settings.mode].name.toUpperCase()}`, tb.x + 20, tb.y + 205);
  ctx.fillText('NOT FOR CONSTRUCTION', tb.x + 440, tb.y + 175); ctx.fillText('CONFIRM WITH AN ENGINEER', tb.x + 440, tb.y + 205);
  return { canvas: c, ctx, titleBlock: tb };
}

function arrowDim(ctx, x1, y1, x2, y2, text, offset) {
  // dimension line offset perpendicular from the measured segment
  const dx = x2 - x1; const dy = y2 - y1; const L = Math.hypot(dx, dy) || 1; const nx = -dy / L; const ny = dx / L;
  const ox = nx * offset; const oy = ny * offset;
  ctx.strokeStyle = INK2; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x1 + ox * 1.15, y1 + oy * 1.15); ctx.moveTo(x2, y2); ctx.lineTo(x2 + ox * 1.15, y2 + oy * 1.15); ctx.stroke();
  ctx.strokeStyle = INK; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(x1 + ox, y1 + oy); ctx.lineTo(x2 + ox, y2 + oy); ctx.stroke();
  // tick marks (architectural)
  const tx = (dx / L + nx) * 7; const ty = (dy / L + ny) * 7;
  for (const [px, py] of [[x1 + ox, y1 + oy], [x2 + ox, y2 + oy]]) { ctx.beginPath(); ctx.moveTo(px - tx, py - ty); ctx.lineTo(px + tx, py + ty); ctx.stroke(); }
  ctx.save(); ctx.translate((x1 + x2) / 2 + ox, (y1 + y2) / 2 + oy); let ang = Math.atan2(dy, dx); if (ang > Math.PI / 2 || ang < -Math.PI / 2) ang += Math.PI; ctx.rotate(ang);
  ctx.fillStyle = PAPER; ctx.font = FONT(20, 500); const tw = ctx.measureText(text).width; ctx.fillRect(-tw / 2 - 6, -14, tw + 12, 28); ctx.fillStyle = INK; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(text, 0, 0); ctx.restore();
}

export function renderPlanSheet(project, analysis, roofs, floorIndex, pageNo, pageCount) {
  const fa = analysis.floors[floorIndex];
  const floorName = project.structure.floors[floorIndex]?.name || `Floor ${floorIndex + 1}`;
  const { canvas, ctx, titleBlock } = sheet(`${floorName} plan`, `${fa.rooms.length} rooms · ${Math.round(fa.rooms.reduce((s, r) => s + r.area, 0)).toLocaleString()} sq ft`, project, pageNo, pageCount);
  const area = { x: 130, y: 130, w: W - 130 - 560, h: H - 130 - 120 };
  const bb = fa.bbox;
  if (!bb) { ctx.fillStyle = INK2; ctx.font = SANS(32); ctx.textAlign = 'center'; ctx.fillText('No walls on this floor yet', area.x + area.w / 2, area.y + area.h / 2); return canvas; }
  const pad = 14; const sx = area.w / (bb.w + 2 * pad); const sz = area.h / (bb.d + 2 * pad); const scale = Math.min(sx, sz, 40);
  const ox = area.x + (area.w - bb.w * scale) / 2; const oz = area.y + (area.h - bb.d * scale) / 2;
  const X = (x) => ox + (x - bb.minX) * scale; const Z = (z) => oz + (z - bb.minZ) * scale;
  // rooms
  ctx.font = SANS(22, 500); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  for (const r of fa.rooms) {
    ctx.fillStyle = 'rgba(255,255,255,0.045)'; ctx.beginPath(); r.polygon.forEach((p, i) => (i ? ctx.lineTo(X(p.x), Z(p.z)) : ctx.moveTo(X(p.x), Z(p.z)))); ctx.closePath(); ctx.fill();
  }
  // walls: thick white with a paper core (double line)
  for (const w of fa.walls) {
    const info = fa.wallInfo.get(w.id); const dims = wallDims(info.kind); const t = dims.finished * scale;
    ctx.lineCap = 'butt';
    ctx.strokeStyle = INK; ctx.lineWidth = t + 3; ctx.beginPath(); ctx.moveTo(X(w.a.x), Z(w.a.z)); ctx.lineTo(X(w.b.x), Z(w.b.z)); ctx.stroke();
    ctx.strokeStyle = info.kind === 'exterior' ? 'rgba(255,255,255,0.35)' : PAPER; ctx.lineWidth = Math.max(1, t - 3); ctx.beginPath(); ctx.moveTo(X(w.a.x), Z(w.a.z)); ctx.lineTo(X(w.b.x), Z(w.b.z)); ctx.stroke();
  }
  // openings
  for (const w of fa.walls) {
    const info = fa.wallInfo.get(w.id); const dims = wallDims(info.kind); const t = dims.finished * scale; const { dir } = wallVec(w); const left = perp(dir);
    for (const o of w.openings) {
      const st = openingStyle(o.kind, o.style);
      const ax = w.a.x + dir.x * o.along; const az = w.a.z + dir.z * o.along; const bx = ax + dir.x * o.width; const bz = az + dir.z * o.width;
      // clear the wall
      ctx.strokeStyle = PAPER; ctx.lineWidth = t + 5; ctx.beginPath(); ctx.moveTo(X(ax), Z(az)); ctx.lineTo(X(bx), Z(bz)); ctx.stroke();
      ctx.strokeStyle = INK; ctx.lineWidth = 2;
      if (o.kind === 'window') {
        for (const k of [-0.35, 0, 0.35]) { const off = k * t; ctx.beginPath(); ctx.moveTo(X(ax) + left.x * off, Z(az) + left.z * off); ctx.lineTo(X(bx) + left.x * off, Z(bz) + left.z * off); ctx.stroke(); }
        ctx.beginPath(); ctx.moveTo(X(ax) - left.x * t / 2, Z(az) - left.z * t / 2); ctx.lineTo(X(ax) + left.x * t / 2, Z(az) + left.z * t / 2); ctx.moveTo(X(bx) - left.x * t / 2, Z(bz) - left.z * t / 2); ctx.lineTo(X(bx) + left.x * t / 2, Z(bz) + left.z * t / 2); ctx.stroke();
      } else if (o.kind === 'opening') {
        ctx.setLineDash([8, 8]); ctx.beginPath(); ctx.moveTo(X(ax), Z(az)); ctx.lineTo(X(bx), Z(bz)); ctx.stroke(); ctx.setLineDash([]);
      } else if (st.garage || st.slides) {
        ctx.setLineDash([14, 8]); ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(X(ax), Z(az)); ctx.lineTo(X(bx), Z(bz)); ctx.stroke(); ctx.setLineDash([]);
      } else {
        // swing into the room: hinge at a (or b when flipped), arc of radius = leaf width
        const inward = info.outward === 'left' ? { x: -left.x, z: -left.z } : { x: left.x, z: left.z };
        const leaves = st.fixedLeaves || (o.leaves === 2 ? 2 : 1); const lw = o.width / leaves;
        for (let i = 0; i < leaves; i++) {
          const hingeAtA = leaves === 2 ? i === 0 : !o.flip;
          const hx = hingeAtA ? ax : bx; const hz = hingeAtA ? az : bz; const sgn = hingeAtA ? 1 : -1;
          const lx = hx + inward.x * lw; const lz = hz + inward.z * lw;
          ctx.lineWidth = 2.5; ctx.beginPath(); ctx.moveTo(X(hx), Z(hz)); ctx.lineTo(X(lx), Z(lz)); ctx.stroke();
          const a0 = Math.atan2(Z(lz) - Z(hz), X(lx) - X(hx)); const a1 = Math.atan2(Z(hz + dir.z * sgn * lw) - Z(hz), X(hx + dir.x * sgn * lw) - X(hx));
          ctx.lineWidth = 1.5; ctx.setLineDash([3, 5]); ctx.beginPath(); ctx.arc(X(hx), Z(hz), lw * scale, a0, a1, (a1 - a0 + Math.PI * 2) % (Math.PI * 2) > Math.PI); ctx.stroke(); ctx.setLineDash([]);
        }
      }
    }
  }
  // stairs: treads with an UP arrow on this floor; a dashed opening outline on the floor above
  for (const it of project.items) {
    const def = itemDef(it.type); if (!def?.stair) continue;
    if (it.floor === floorIndex) {
      const spec = stairSpec(project, it); const ang = it.rot * Math.PI / 180; const c = Math.cos(ang); const sn = Math.sin(ang);
      const toW = (lx, lz) => ({ x: it.x + lx * c + lz * sn, z: it.z - lx * sn + lz * c });
      ctx.strokeStyle = INK; ctx.lineWidth = 2; ctx.fillStyle = INK;
      const drawFlight = (x0, z0, dirX, dirZ, width, n) => { const sx2 = -dirZ; const sz2 = dirX; for (let i = 0; i <= n; i++) { const a = toW(x0 + dirX * i * spec.tread + sx2 * width / 2, z0 + dirZ * i * spec.tread + sz2 * width / 2); const b2 = toW(x0 + dirX * i * spec.tread - sx2 * width / 2, z0 + dirZ * i * spec.tread - sz2 * width / 2); ctx.beginPath(); ctx.moveTo(X(a.x), Z(a.z)); ctx.lineTo(X(b2.x), Z(b2.z)); ctx.stroke(); } const e1 = toW(x0 + sx2 * width / 2, z0 + sz2 * width / 2); const e2 = toW(x0 + dirX * n * spec.tread + sx2 * width / 2, z0 + dirZ * n * spec.tread + sz2 * width / 2); const e3 = toW(x0 - sx2 * width / 2, z0 - sz2 * width / 2); const e4 = toW(x0 + dirX * n * spec.tread - sx2 * width / 2, z0 + dirZ * n * spec.tread - sz2 * width / 2); ctx.beginPath(); ctx.moveTo(X(e1.x), Z(e1.z)); ctx.lineTo(X(e2.x), Z(e2.z)); ctx.moveTo(X(e3.x), Z(e3.z)); ctx.lineTo(X(e4.x), Z(e4.z)); ctx.stroke(); };
      if (spec.kind === 'straight') drawFlight(0, -spec.d / 2, 0, 1, spec.w, spec.risers); else { drawFlight(-spec.flightW / 2, -spec.d / 2, 0, 1, spec.flightW, spec.n1); drawFlight(0.05, -spec.d / 2 + spec.run1 + spec.land / 2, 1, 0, spec.land, spec.n2); }
      const a0 = toW(spec.kind === 'L' ? -spec.flightW / 2 : 0, -spec.d / 2 + 0.6); const a1 = spec.kind === 'L' ? toW(-spec.flightW / 2, -spec.d / 2 + spec.run1 + spec.land / 2) : toW(0, spec.d / 2 - 1.2);
      ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(X(a0.x), Z(a0.z)); ctx.lineTo(X(a1.x), Z(a1.z)); ctx.stroke();
      const hd = Math.atan2(Z(a1.z) - Z(a0.z), X(a1.x) - X(a0.x)); ctx.beginPath(); ctx.moveTo(X(a1.x), Z(a1.z)); ctx.lineTo(X(a1.x) - 14 * Math.cos(hd - 0.5), Z(a1.z) - 14 * Math.sin(hd - 0.5)); ctx.lineTo(X(a1.x) - 14 * Math.cos(hd + 0.5), Z(a1.z) - 14 * Math.sin(hd + 0.5)); ctx.closePath(); ctx.fill();
      ctx.font = FONT(14, 500); ctx.textAlign = 'center'; ctx.fillText('UP', X(a0.x) + 10 * Math.cos(hd + Math.PI / 2), Z(a0.z) + 10 * Math.sin(hd + Math.PI / 2) + 5);
    } else if (it.floor === floorIndex - 1) {
      const pts = stairOpening(project, it); ctx.save(); ctx.setLineDash([10, 8]); ctx.strokeStyle = INK2; ctx.lineWidth = 2; ctx.beginPath(); pts.forEach((q, i) => (i ? ctx.lineTo(X(q.x), Z(q.z)) : ctx.moveTo(X(q.x), Z(q.z)))); ctx.closePath(); ctx.stroke(); ctx.restore();
      const cx = pts.reduce((a, q) => a + q.x, 0) / pts.length; const cz = pts.reduce((a, q) => a + q.z, 0) / pts.length; ctx.fillStyle = INK2; ctx.font = FONT(13); ctx.textAlign = 'center'; ctx.fillText('OPEN TO BELOW', X(cx), Z(cz) + 4);
    }
  }
  // room labels
  ctx.textAlign = 'center';
  for (const r of fa.rooms) {
    const px = Math.min(r.bbox.w, r.bbox.d) * scale; const wpx = r.bbox.w * scale - 16; // usable width inside the room
    let big = Math.max(13, Math.min(24, px / 7)); let small = Math.max(10, Math.min(18, px / 10));
    const name = r.name.toUpperCase();
    // shrink the name until it fits the room; small rooms get a two-line fallback
    ctx.font = SANS(big, 500); while (big > 9 && ctx.measureText(name).width > wpx) { big -= 1; ctx.font = SANS(big, 500); }
    const fits = ctx.measureText(name).width <= wpx;
    const lines = fits ? [name] : name.split(/[\s/+]+/).filter(Boolean);
    let detail = `${Math.round(r.area)} SQ FT · ${ftIn(r.bbox.w)} × ${ftIn(r.bbox.d)}`;
    ctx.font = FONT(small); while (small > 8 && ctx.measureText(detail).width > wpx) { small -= 1; ctx.font = FONT(small); }
    if (ctx.measureText(detail).width > wpx) { detail = `${Math.round(r.area)} SF`; small = Math.max(small, 9); }
    const totalH = lines.length * big * 1.1 + small * 1.2; let y = Z(r.centroid.z) - totalH / 2 + big * 0.9;
    ctx.fillStyle = INK; ctx.font = SANS(big, 500); for (const ln of lines) { ctx.fillText(ln, X(r.centroid.x), y); y += big * 1.1; }
    ctx.fillStyle = INK2; ctx.font = FONT(small); ctx.fillText(detail, X(r.centroid.x), y + small * 0.2);
  }
  // dimensions: per exterior wall length (outside) and overall
  const ext = fa.walls.filter((w) => fa.wallInfo.get(w.id).kind === 'exterior');
  for (const w of ext) {
    const info = fa.wallInfo.get(w.id); if (info.outward === 'both') continue;
    const { dir, length } = wallVec(w); const left = perp(dir); const out = info.outward === 'left' ? left : { x: -left.x, z: -left.z };
    const sgn = (left.x * out.x + left.z * out.z) > 0 ? 1 : -1; // screen-space offset sign (z down on screen matches plan z)
    arrowDim(ctx, X(w.a.x), Z(w.a.z), X(w.b.x), Z(w.b.z), ftIn(length), sgn * 34);
  }
  if (fa.components.filter((c) => c.length >= 2).length > 1) {
    arrowDim(ctx, X(bb.minX), Z(bb.minZ), X(bb.maxX), Z(bb.minZ), ftIn(bb.w), -78);
    arrowDim(ctx, X(bb.minX), Z(bb.maxZ), X(bb.minX), Z(bb.minZ), ftIn(bb.d), -78);
  }
  // north arrow (plan z+ is screen down; north is -z rotated by northDeg)
  const nx = area.x + 70; const ny = area.y + 80; const ang = (-Math.PI / 2) + (project.settings.northDeg * Math.PI) / 180;
  ctx.save(); ctx.translate(nx, ny); ctx.rotate(ang + Math.PI / 2); ctx.strokeStyle = INK; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(0, 0, 40, 0, Math.PI * 2); ctx.stroke(); ctx.fillStyle = INK; ctx.beginPath(); ctx.moveTo(0, -36); ctx.lineTo(12, 10); ctx.lineTo(0, 2); ctx.lineTo(-12, 10); ctx.closePath(); ctx.fill(); ctx.font = FONT(22, 500); ctx.textAlign = 'center'; ctx.fillText('N', 0, -52); ctx.restore();
  // scale bar
  const sbx = area.x + 20; const sby = area.y + area.h - 30; ctx.strokeStyle = INK; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(sbx, sby); ctx.lineTo(sbx + 10 * scale, sby); ctx.stroke();
  for (let i = 0; i <= 10; i += 5) { ctx.beginPath(); ctx.moveTo(sbx + i * scale, sby - 8); ctx.lineTo(sbx + i * scale, sby + 8); ctx.stroke(); }
  ctx.fillStyle = INK2; ctx.font = FONT(16); ctx.textAlign = 'left'; ctx.fillText(`0        5        10 FT`, sbx, sby - 18);
  // notes column
  const nxC = W - 74 - 440; let ny2 = 140; ctx.textAlign = 'left'; ctx.textBaseline = 'top';
  const line = (t, big = false) => { ctx.fillStyle = big ? INK : INK2; ctx.font = big ? FONT(20, 500) : SANS(18); const words = String(t).split(' '); let cur = ''; for (const wd of words) { const test = cur ? `${cur} ${wd}` : wd; if (ctx.measureText(test).width > 420) { ctx.fillText(cur, nxC, ny2); ny2 += 26; cur = wd; } else cur = test; } ctx.fillText(cur, nxC, ny2); ny2 += big ? 34 : 26; };
  line('GENERAL NOTES', true);
  const fd = project.structure.foundation; line(`Foundation: ${FOUNDATIONS.find((f) => f.id === fd.type)?.name}, footings ${fd.depthIn} in below grade.`);
  const comps = fa.components.filter((c) => c.length >= 2);
  comps.forEach((c, i) => { const key = fa.componentKeys[i]; const r = roofFor(project, key); line(`Building ${i + 1}: ${ROOF_STYLES.find((s) => s.id === r.style)?.name} roof, ${r.pitch}:12, ${r.overhang} ft overhang, ${ROOFING.find((m) => m.id === r.material)?.name}.`); });
  line(`Walls: exterior 2×6 at ${project.structure.studSpacing} in OC, interior 2×4. ${INSULATION.find((i) => i.id === project.structure.insulation)?.name} insulation.`);
  line(`Exterior: ${SIDING.find((s) => s.id === project.exterior.sidingType)?.name}${project.exterior.stone?.enabled ? `, ${STONE_VENEER.find((s) => s.id === project.exterior.stone.type)?.name} wainscot ${project.exterior.stone.heightFt} ft` : ''}.`);
  if (project.structure.futureSecondStory) line('Foundation and headers sized for a future second story.');
  ny2 += 10; line('LEGEND', true);
  const lx = nxC; const legend = (draw, label) => { ctx.save(); ctx.translate(lx, ny2 + 10); draw(); ctx.restore(); ctx.fillStyle = INK2; ctx.font = SANS(18); ctx.fillText(label, lx + 70, ny2); ny2 += 30; };
  legend(() => { ctx.strokeStyle = INK; ctx.lineWidth = 9; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(56, 0); ctx.stroke(); ctx.strokeStyle = 'rgba(255,255,255,0.35)'; ctx.lineWidth = 5; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(56, 0); ctx.stroke(); }, 'Exterior wall (2×6)');
  legend(() => { ctx.strokeStyle = INK; ctx.lineWidth = 7; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(56, 0); ctx.stroke(); ctx.strokeStyle = PAPER; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(56, 0); ctx.stroke(); }, 'Interior wall (2×4)');
  legend(() => { ctx.strokeStyle = INK; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, -26); ctx.stroke(); ctx.setLineDash([3, 5]); ctx.beginPath(); ctx.arc(0, 0, 26, -Math.PI / 2, 0); ctx.stroke(); ctx.setLineDash([]); }, 'Door and swing');
  legend(() => { ctx.strokeStyle = INK; ctx.lineWidth = 2; for (const k of [-4, 0, 4]) { ctx.beginPath(); ctx.moveTo(0, k); ctx.lineTo(56, k); ctx.stroke(); } }, 'Window');
  legend(() => { ctx.strokeStyle = INK; ctx.lineWidth = 3; ctx.setLineDash([14, 8]); ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(56, 0); ctx.stroke(); ctx.setLineDash([]); }, 'Garage / sliding door');
  return canvas;
}

export function renderMaterialsSheet(project, estimate, pageNo, pageCount) {
  const { canvas, ctx } = sheet('Rough materials list', `${money(estimate.grand)} materials · ${Math.round(estimate.stats.floorArea).toLocaleString()} sq ft`, project, pageNo, pageCount);
  const colX = [130, 1240]; const colW = 1060; let col = 0; let y = 130; const top = 130; const bottoms = [H - 100, H - 74 - 250];
  ctx.textBaseline = 'top'; ctx.textAlign = 'left';
  const next = (hgt) => { if (col < 2 && y + hgt > bottoms[col]) { col++; y = top; } return col < 2; };
  const text = (t, font, color, x, yy, maxW) => { ctx.font = font; ctx.fillStyle = color; let s = t; while (ctx.measureText(s).width > maxW && s.length > 3) s = `${s.slice(0, -2)}…`; ctx.fillText(s, x, yy); };
  const money2 = (v) => { ctx.textAlign = 'right'; ctx.fillText(money(v), colX[col] + colW, y); ctx.textAlign = 'left'; };
  for (const ph of estimate.phases) {
    const cats = ph.categories.filter((c) => estimate.lines.some((l) => l.category === c)); if (!cats.length) continue;
    if (!next(60)) break;
    ctx.fillStyle = 'rgba(255,255,255,0.1)'; ctx.fillRect(colX[col], y - 4, colW, 36);
    text(ph.name.toUpperCase(), FONT(20, 500), INK, colX[col] + 10, y + 4, colW - 200); ctx.font = FONT(20, 500); ctx.fillStyle = INK; ctx.textAlign = 'right'; ctx.fillText(money(estimate.byPhase[ph.id] || 0), colX[col] + colW - 10, y + 4); ctx.textAlign = 'left'; y += 44;
    for (const cat of cats) {
      if (!next(30)) break;
      text(estimate.categories[cat], SANS(19, 500), INK, colX[col] + 10, y, colW - 200); ctx.font = FONT(18); ctx.fillStyle = INK2; money2(estimate.byCategory[cat] || 0); y += 28;
      for (const l of estimate.lines.filter((x) => x.category === cat)) {
        if (!next(26)) break;
        const qty = `${l.qty % 1 ? l.qty.toFixed(1) : l.qty} ${l.unit}`;
        text(qty, FONT(16), INK2, colX[col] + 24, y + 2, 130); text(l.item, SANS(17), INK2, colX[col] + 160, y + 1, colW - 330); ctx.font = FONT(16); ctx.fillStyle = INK2; money2(l.total); y += 25;
      }
      y += 6;
    }
    y += 10;
  }
  if (next(50)) { ctx.fillStyle = 'rgba(255,255,255,0.14)'; ctx.fillRect(colX[col], y, colW, 46); ctx.font = FONT(22, 500); ctx.fillStyle = INK; ctx.fillText('ESTIMATED MATERIALS TOTAL', colX[col] + 12, y + 10); ctx.textAlign = 'right'; ctx.fillText(money(estimate.grand), colX[col] + colW - 12, y + 10); ctx.textAlign = 'left'; }
  return canvas;
}

export function renderNotesSheet(project, estimate, pageNo, pageCount) {
  const { canvas, ctx } = sheet('Engineer notes & phases', `${estimate.notes.length} notes · ${estimate.phases.filter((p) => estimate.byPhase[p.id] > 0).length} build phases`, project, pageNo, pageCount);
  ctx.textBaseline = 'top'; ctx.textAlign = 'left';
  // phases table (left)
  let y = 130; const x0 = 130; const w0 = 980;
  ctx.font = FONT(22, 500); ctx.fillStyle = INK; ctx.fillText('BUILD PHASES', x0, y); y += 44;
  for (const ph of estimate.phases) {
    if (!(estimate.byPhase[ph.id] > 0)) continue;
    ctx.fillStyle = 'rgba(255,255,255,0.08)'; ctx.fillRect(x0, y - 6, w0, 40);
    ctx.font = SANS(20, 500); ctx.fillStyle = INK; ctx.fillText(ph.name, x0 + 12, y + 2); ctx.font = FONT(20, 500); ctx.textAlign = 'right'; ctx.fillText(money(estimate.byPhase[ph.id]), x0 + w0 - 12, y + 2); ctx.textAlign = 'left'; y += 44;
    ctx.font = SANS(16); ctx.fillStyle = INK2; const cats = ph.categories.filter((c) => estimate.byCategory[c] > 0).map((c) => `${estimate.categories[c]} ${money(estimate.byCategory[c])}`).join('  ·  ');
    const words = cats.split(' '); let cur = ''; for (const wd of words) { const t = cur ? `${cur} ${wd}` : wd; if (ctx.measureText(t).width > w0 - 24) { ctx.fillText(cur, x0 + 12, y); y += 22; cur = wd; } else cur = t; } ctx.fillText(cur, x0 + 12, y); y += 34;
  }
  ctx.fillStyle = 'rgba(255,255,255,0.14)'; ctx.fillRect(x0, y, w0, 48); ctx.font = FONT(24, 500); ctx.fillStyle = INK; ctx.fillText('ESTIMATED MATERIALS TOTAL', x0 + 12, y + 11); ctx.textAlign = 'right'; ctx.fillText(money(estimate.grand), x0 + w0 - 12, y + 11); ctx.textAlign = 'left'; y += 62;
  ctx.font = SANS(16); ctx.fillStyle = INK2; ctx.fillText('Labor, site work, well/septic, electrical, plumbing and heating equipment are not included.', x0 + 12, y); y += 26;
  ctx.fillText(`${Math.round(estimate.stats.floorArea).toLocaleString()} sq ft of floor · ${Math.round(estimate.stats.roofArea).toLocaleString()} sq ft of roof · ${Math.round(estimate.stats.extWallArea).toLocaleString()} sq ft of exterior wall · ${money(estimate.grand / Math.max(1, estimate.stats.floorArea))} per sq ft in materials.`, x0 + 12, y);
  // notes (right)
  let ny = 130; const nx = 1180; const nw = 1140;
  ctx.font = FONT(22, 500); ctx.fillStyle = INK; ctx.fillText('NOTES FOR YOUR ENGINEER', nx, ny); ny += 44;
  ctx.font = SANS(17);
  for (const n of estimate.notes) {
    const words = n.text.split(' '); let cur = ''; const lines = [];
    for (const wd of words) { const t = cur ? `${cur} ${wd}` : wd; if (ctx.measureText(t).width > nw - 40) { lines.push(cur); cur = wd; } else cur = t; } lines.push(cur);
    if (ny + lines.length * 24 > H - 74 - 250) break;
    ctx.fillStyle = n.level === 'warn' || n.level === 'always' ? '#ffd9a0' : INK2; ctx.fillText('•', nx, ny);
    for (const ln of lines) { ctx.fillText(ln, nx + 24, ny); ny += 24; } ny += 10;
  }
  return canvas;
}
