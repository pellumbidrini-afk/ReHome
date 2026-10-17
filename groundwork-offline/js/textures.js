// Groundwork — procedural textures. Every surface in the app is generated on a canvas at load,
// so the page ships no image files and every material can be re-tinted without re-rendering.
// The look aims for "painted but believable": soft tonal variation, no harsh pixel noise.
// Tintable textures (siding, roofing, stone, wood) are drawn in near-white grayscale and multiplied
// by the chosen color in the material; "colored" textures (floors, ground) carry their own color.
// Each generator returns { map, bump?, size } where `size` is the tile size in feet.

const cache = new Map();
export function clearTextureCache() { cache.clear(); }

function rng(seed) {
  let s = seed >>> 0 || 1;
  return () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return (s % 100000) / 100000; };
}
function makeNoise(seed) {
  const r = rng(seed); const N = 256; const grid = new Float32Array(N * N);
  for (let i = 0; i < N * N; i++) grid[i] = r();
  const at = (x, y) => grid[((y & (N - 1)) * N) + (x & (N - 1))];
  const fade = (t) => t * t * (3 - 2 * t);
  return (x, y) => {
    const xi = Math.floor(x); const yi = Math.floor(y); const xf = fade(x - xi); const yf = fade(y - yi);
    const a = at(xi, yi); const b = at(xi + 1, yi); const c = at(xi, yi + 1); const d = at(xi + 1, yi + 1);
    return a + (b - a) * xf + (c - a) * yf + (a - b - c + d) * xf * yf;
  };
}
function fbm(noise, x, y, oct = 4) {
  let v = 0; let a = 0.5; let f = 1; let norm = 0;
  for (let i = 0; i < oct; i++) { v += noise(x * f, y * f) * a; norm += a; a *= 0.5; f *= 2; }
  return v / norm;
}
function canvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
function gray(v) { const g = Math.max(0, Math.min(255, Math.round(v * 255))); return `rgb(${g},${g},${g})`; }
function rgb(r, g, b) { return `rgb(${Math.round(r)},${Math.round(g)},${Math.round(b)})`; }
function rgba(r, g, b, a) { return `rgba(${Math.round(r)},${Math.round(g)},${Math.round(b)},${a})`; }
function mix(a, b, t) { return a.map((v, i) => v + (b[i] - v) * t); }
function perPixel(c, f) {
  const ctx = c.getContext('2d'); const img = ctx.createImageData(c.width, c.height); const d = img.data;
  for (let y = 0; y < c.height; y++) for (let x = 0; x < c.width; x++) {
    const i = (y * c.width + x) * 4; const [r, g, b] = f(x, y); d[i] = r; d[i + 1] = g; d[i + 2] = b; d[i + 3] = 255;
  }
  ctx.putImageData(img, 0, 0); return c;
}
// Multiply the canvas by a soft tonal field (low frequency) and a faint grain (high frequency).
function tonal(c, seed, { low = 0.08, lowScale = 120, grain = 0.03, grainScale = 6, stretchX = 1 } = {}) {
  const noise = makeNoise(seed); const ctx = c.getContext('2d');
  const img = ctx.getImageData(0, 0, c.width, c.height); const d = img.data;
  for (let y = 0; y < c.height; y++) for (let x = 0; x < c.width; x++) {
    const n1 = (fbm(noise, x / (lowScale * stretchX), y / lowScale, 3) - 0.5) * 2 * low;
    const n2 = (noise(x / grainScale, y / grainScale) - 0.5) * 2 * grain;
    const k = 1 + n1 + n2; const i = (y * c.width + x) * 4;
    d[i] = Math.max(0, Math.min(255, d[i] * k)); d[i + 1] = Math.max(0, Math.min(255, d[i + 1] * k)); d[i + 2] = Math.max(0, Math.min(255, d[i + 2] * k));
  }
  ctx.putImageData(img, 0, 0);
}
function woodGrain(c, seed, { strength = 0.08, along = 'x', scale = 70, rings = 14 } = {}) {
  const noise = makeNoise(seed); const ctx = c.getContext('2d');
  const img = ctx.getImageData(0, 0, c.width, c.height); const d = img.data;
  for (let y = 0; y < c.height; y++) for (let x = 0; x < c.width; x++) {
    const u = along === 'x' ? x : y; const v = along === 'x' ? y : x;
    const g = fbm(noise, u / (scale * 3), v / 9, 3); const r = 0.5 + 0.5 * Math.sin(g * rings + u / scale);
    const k = 1 - strength * r; const i = (y * c.width + x) * 4;
    d[i] *= k; d[i + 1] *= k; d[i + 2] *= k;
  }
  ctx.putImageData(img, 0, 0);
}

// ---------------------------------------------------------------------------
// Siding (tintable). Tile = 4 ft × 4 ft, 512 px.
// ---------------------------------------------------------------------------
function lapSiding() {
  const S = 512; const ft = S / 4; const c = canvas(S, S); const b = canvas(S, S); const ctx = c.getContext('2d'); const bx = b.getContext('2d'); const r = rng(11);
  const exposure = 0.5 * ft;
  for (let y = 0; y < S; y += exposure) {
    const v = 0.9 + r() * 0.06;
    const g = ctx.createLinearGradient(0, y, 0, y + exposure);
    g.addColorStop(0, gray(v * 0.66)); g.addColorStop(0.14, gray(v * 0.96)); g.addColorStop(0.9, gray(v)); g.addColorStop(1, gray(v * 0.92));
    ctx.fillStyle = g; ctx.fillRect(0, y, S, exposure);
    const gb = bx.createLinearGradient(0, y, 0, y + exposure); gb.addColorStop(0, gray(0.15)); gb.addColorStop(0.12, gray(0.5)); gb.addColorStop(1, gray(0.66));
    bx.fillStyle = gb; bx.fillRect(0, y, S, exposure);
  }
  woodGrain(c, 12, { strength: 0.05, scale: 90 }); tonal(c, 13, { low: 0.04, grain: 0.015 });
  return { map: c, bump: b, size: 4 };
}
function battenSiding() {
  const S = 512; const ft = S / 4; const c = canvas(S, S); const b = canvas(S, S); const ctx = c.getContext('2d'); const bx = b.getContext('2d'); const r = rng(21);
  ctx.fillStyle = gray(0.92); ctx.fillRect(0, 0, S, S); bx.fillStyle = gray(0.5); bx.fillRect(0, 0, S, S);
  const board = ft; const batten = 0.2 * ft;
  for (let x = 0; x < S; x += board) {
    const v = 0.88 + r() * 0.08;
    const g = ctx.createLinearGradient(x, 0, x + board, 0); g.addColorStop(0, gray(v * 0.8)); g.addColorStop(0.1, gray(v)); g.addColorStop(0.9, gray(v)); g.addColorStop(1, gray(v * 0.8));
    ctx.fillStyle = g; ctx.fillRect(x, 0, board, S);
    const bxp = x + board / 2 - batten / 2;
    const gb2 = ctx.createLinearGradient(bxp, 0, bxp + batten, 0); gb2.addColorStop(0, gray(0.98)); gb2.addColorStop(1, gray(0.9));
    ctx.fillStyle = gb2; ctx.fillRect(bxp, 0, batten, S);
    ctx.fillStyle = gray(0.52); ctx.fillRect(bxp - 3, 0, 3, S); ctx.fillStyle = gray(0.7); ctx.fillRect(bxp + batten, 0, 3, S);
    bx.fillStyle = gray(0.8); bx.fillRect(bxp, 0, batten, S);
  }
  woodGrain(c, 22, { strength: 0.06, along: 'y', scale: 80 }); tonal(c, 23, { low: 0.04, grain: 0.012 });
  return { map: c, bump: b, size: 4 };
}
function shiplap() {
  const S = 512; const ft = S / 4; const c = canvas(S, S); const b = canvas(S, S); const ctx = c.getContext('2d'); const bx = b.getContext('2d'); const r = rng(31);
  const board = 0.5 * ft;
  for (let y = 0; y < S; y += board) {
    const v = 0.9 + r() * 0.08; ctx.fillStyle = gray(v); ctx.fillRect(0, y, S, board);
    ctx.fillStyle = gray(0.45); ctx.fillRect(0, y, S, 3); ctx.fillStyle = gray(0.98); ctx.fillRect(0, y + 3, S, 2);
    bx.fillStyle = gray(0.55); bx.fillRect(0, y, S, board); bx.fillStyle = gray(0.1); bx.fillRect(0, y, S, 3);
  }
  woodGrain(c, 32, { strength: 0.1, scale: 110, rings: 10 }); tonal(c, 33, { low: 0.05, grain: 0.015 });
  return { map: c, bump: b, size: 4 };
}
function shingleSiding(rough = false) {
  const S = 512; const ft = S / 4; const c = canvas(S, S); const b = canvas(S, S); const ctx = c.getContext('2d'); const bx = b.getContext('2d'); const r = rng(rough ? 41 : 42);
  ctx.fillStyle = gray(0.55); ctx.fillRect(0, 0, S, S); bx.fillStyle = gray(0.3); bx.fillRect(0, 0, S, S);
  const exposure = (rough ? 0.8 : 0.42) * ft; const rows = Math.ceil(S / exposure) + 1;
  for (let row = rows; row >= 0; row--) {
    const y = row * exposure; let x = -r() * ft;
    while (x < S) {
      const w = (0.25 + r() * 0.4) * ft; const v = 0.8 + r() * 0.18;
      const g = ctx.createLinearGradient(0, y - exposure * 1.2, 0, y + exposure * 0.2);
      g.addColorStop(0, gray(v)); g.addColorStop(0.85, gray(v * 0.94)); g.addColorStop(1, gray(v * 0.5));
      ctx.fillStyle = g; ctx.fillRect(x, y - exposure * 1.2, w - 2, exposure * 1.4);
      bx.fillStyle = gray(0.45 + r() * 0.25); bx.fillRect(x, y - exposure * 1.2, w - 2, exposure * 1.4); bx.fillStyle = gray(0.12); bx.fillRect(x, y + exposure * 0.1, w - 2, 3);
      x += w;
    }
  }
  woodGrain(c, 43, { strength: rough ? 0.12 : 0.06, along: 'y', scale: 40 }); tonal(c, 44, { low: 0.06, grain: 0.02 });
  return { map: c, bump: b, size: 4 };
}
function metalWall() {
  const S = 512; const ft = S / 4; const c = canvas(S, S); const b = canvas(S, S); const ctx = c.getContext('2d'); const bx = b.getContext('2d');
  ctx.fillStyle = gray(0.94); ctx.fillRect(0, 0, S, S); bx.fillStyle = gray(0.5); bx.fillRect(0, 0, S, S);
  const rib = ft; const ribW = 0.12 * ft;
  for (let x = 0; x < S; x += rib) {
    const g = ctx.createLinearGradient(x, 0, x + ribW, 0); g.addColorStop(0, gray(0.7)); g.addColorStop(0.3, gray(1)); g.addColorStop(0.7, gray(0.95)); g.addColorStop(1, gray(0.65));
    ctx.fillStyle = g; ctx.fillRect(x, 0, ribW, S);
    const gb = bx.createLinearGradient(x, 0, x + ribW, 0); gb.addColorStop(0, gray(0.5)); gb.addColorStop(0.5, gray(0.95)); gb.addColorStop(1, gray(0.5));
    bx.fillStyle = gb; bx.fillRect(x, 0, ribW, S); ctx.fillStyle = gray(0.88); ctx.fillRect(x + rib / 2, 0, 2, S);
  }
  tonal(c, 45, { low: 0.03, grain: 0.005 });
  return { map: c, bump: b, size: 4 };
}
function logSiding() {
  const S = 512; const ft = S / 4; const c = canvas(S, S); const b = canvas(S, S); const ctx = c.getContext('2d'); const bx = b.getContext('2d');
  const log = 0.83 * ft;
  for (let y = 0; y < S; y += log) {
    const g = ctx.createLinearGradient(0, y, 0, y + log); g.addColorStop(0, gray(0.42)); g.addColorStop(0.25, gray(0.85)); g.addColorStop(0.5, gray(1)); g.addColorStop(0.8, gray(0.8)); g.addColorStop(1, gray(0.4));
    ctx.fillStyle = g; ctx.fillRect(0, y, S, log);
    const gb = bx.createLinearGradient(0, y, 0, y + log); gb.addColorStop(0, gray(0.1)); gb.addColorStop(0.5, gray(0.95)); gb.addColorStop(1, gray(0.1));
    bx.fillStyle = gb; bx.fillRect(0, y, S, log);
  }
  woodGrain(c, 51, { strength: 0.12, scale: 60, rings: 18 }); tonal(c, 52, { low: 0.05, grain: 0.02 });
  return { map: c, bump: b, size: 4 };
}
function t111() {
  const S = 512; const ft = S / 4; const c = canvas(S, S); const b = canvas(S, S); const ctx = c.getContext('2d'); const bx = b.getContext('2d');
  ctx.fillStyle = gray(0.9); ctx.fillRect(0, 0, S, S); bx.fillStyle = gray(0.5); bx.fillRect(0, 0, S, S);
  for (let x = 0; x < S; x += ft * 0.667) { ctx.fillStyle = gray(0.5); ctx.fillRect(x, 0, 0.04 * ft, S); bx.fillStyle = gray(0.12); bx.fillRect(x, 0, 0.04 * ft, S); }
  woodGrain(c, 61, { strength: 0.1, along: 'y', scale: 50 }); tonal(c, 62, { low: 0.05, grain: 0.02 });
  return { map: c, bump: b, size: 4 };
}

// ---------------------------------------------------------------------------
// Stone veneer (tintable). Tile 4 ft.
// ---------------------------------------------------------------------------
function ledgestone() {
  const S = 512; const ft = S / 4; const c = canvas(S, S); const b = canvas(S, S); const ctx = c.getContext('2d'); const bx = b.getContext('2d'); const r = rng(71);
  ctx.fillStyle = gray(0.42); ctx.fillRect(0, 0, S, S); bx.fillStyle = gray(0.2); bx.fillRect(0, 0, S, S);
  let y = 0;
  while (y < S) {
    const h = (0.17 + r() * 0.3) * ft; let x = -r() * ft;
    while (x < S) {
      const w = (0.35 + r() * 1.1) * ft; const v = 0.72 + r() * 0.26; const m = 3;
      const g = ctx.createLinearGradient(x, y, x, y + h); g.addColorStop(0, gray(v)); g.addColorStop(0.7, gray(v * 0.93)); g.addColorStop(1, gray(v * 0.72));
      ctx.fillStyle = g; ctx.fillRect(x + m, y + m, w - 2 * m, h - 2 * m);
      bx.fillStyle = gray(0.5 + r() * 0.4); bx.fillRect(x + m, y + m, w - 2 * m, h - 2 * m);
      x += w;
    }
    y += h;
  }
  tonal(c, 72, { low: 0.06, grain: 0.03, grainScale: 3 });
  return { map: c, bump: b, size: 4 };
}
function riverrock() {
  const S = 512; const ft = S / 4; const c = canvas(S, S); const b = canvas(S, S); const ctx = c.getContext('2d'); const bx = b.getContext('2d'); const r = rng(81);
  ctx.fillStyle = gray(0.4); ctx.fillRect(0, 0, S, S); bx.fillStyle = gray(0.15); bx.fillRect(0, 0, S, S);
  const stones = [];
  for (let i = 0; i < 900 && stones.length < 150; i++) {
    const rx = (0.18 + r() * 0.3) * ft; const ry = rx * (0.6 + r() * 0.5); const x = r() * S; const y = r() * S; const a = r() * Math.PI;
    if (stones.some((s) => Math.hypot(s.x - x, s.y - y) < (s.rx + rx) * 0.9)) continue;
    stones.push({ x, y, rx, ry, a, v: 0.68 + r() * 0.3 });
  }
  const drawAt = (s, ox, oy) => {
    ctx.save(); ctx.translate(s.x + ox, s.y + oy); ctx.rotate(s.a);
    const g = ctx.createRadialGradient(-s.rx * 0.3, -s.ry * 0.35, 0, 0, 0, s.rx); g.addColorStop(0, gray(Math.min(1, s.v * 1.12))); g.addColorStop(0.8, gray(s.v)); g.addColorStop(1, gray(s.v * 0.6));
    ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(0, 0, s.rx, s.ry, 0, 0, Math.PI * 2); ctx.fill(); ctx.restore();
    bx.save(); bx.translate(s.x + ox, s.y + oy); bx.rotate(s.a); const gb = bx.createRadialGradient(0, 0, 0, 0, 0, s.rx); gb.addColorStop(0, gray(0.95)); gb.addColorStop(1, gray(0.25)); bx.fillStyle = gb; bx.beginPath(); bx.ellipse(0, 0, s.rx, s.ry, 0, 0, Math.PI * 2); bx.fill(); bx.restore();
  };
  for (const s of stones) for (const ox of [-S, 0, S]) for (const oy of [-S, 0, S]) drawAt(s, ox, oy);
  tonal(c, 82, { low: 0.05, grain: 0.03, grainScale: 3 });
  return { map: c, bump: b, size: 4 };
}
function fieldstone() {
  const S = 512; const ft = S / 4; const c = canvas(S, S); const b = canvas(S, S); const ctx = c.getContext('2d'); const bx = b.getContext('2d'); const r = rng(91);
  ctx.fillStyle = gray(0.38); ctx.fillRect(0, 0, S, S); bx.fillStyle = gray(0.15); bx.fillRect(0, 0, S, S);
  const cell = 0.55 * ft;
  for (let gy = -1; gy < S / cell + 1; gy++) for (let gx = -1; gx < S / cell + 1; gx++) {
    const cx = gx * cell + cell / 2 + (r() - 0.5) * cell * 0.5; const cy = gy * cell + cell / 2 + (r() - 0.5) * cell * 0.5;
    const n = 5 + Math.floor(r() * 3); const rad = cell * (0.42 + r() * 0.12); const v = 0.66 + r() * 0.3;
    const pts = []; for (let k = 0; k < n; k++) { const a = (k / n) * Math.PI * 2 + r() * 0.5; const rr = rad * (0.75 + r() * 0.3); pts.push([cx + Math.cos(a) * rr, cy + Math.sin(a) * rr]); }
    const draw = (cv, fill) => { cv.beginPath(); pts.forEach((p, i) => (i ? cv.lineTo(p[0], p[1]) : cv.moveTo(p[0], p[1]))); cv.closePath(); cv.fillStyle = fill; cv.fill(); };
    const g = ctx.createRadialGradient(cx - rad * 0.3, cy - rad * 0.3, 0, cx, cy, rad); g.addColorStop(0, gray(Math.min(1, v * 1.1))); g.addColorStop(1, gray(v * 0.7));
    draw(ctx, g); draw(bx, gray(0.4 + r() * 0.5));
  }
  tonal(c, 92, { low: 0.06, grain: 0.035, grainScale: 3 });
  return { map: c, bump: b, size: 4 };
}

// ---------------------------------------------------------------------------
// Roofing (tintable). Tile = 4 ft, 512 px.
// ---------------------------------------------------------------------------
function asphaltShingle() {
  const S = 512; const ft = S / 4; const c = canvas(S, S); const b = canvas(S, S); const ctx = c.getContext('2d'); const bx = b.getContext('2d'); const r = rng(101);
  ctx.fillStyle = gray(0.85); ctx.fillRect(0, 0, S, S); bx.fillStyle = gray(0.5); bx.fillRect(0, 0, S, S);
  const exposure = (5 / 12) * ft; const tab = ft; let row = 0;
  for (let y = 0; y < S; y += exposure, row++) {
    ctx.fillStyle = gray(0.3); ctx.fillRect(0, y, S, 3); bx.fillStyle = gray(0.15); bx.fillRect(0, y, S, 3);
    const off = (row % 2) * tab * 0.5 + r() * 4;
    for (let x = -tab; x < S + tab; x += tab) {
      const v = 0.78 + r() * 0.2; const g = ctx.createLinearGradient(0, y, 0, y + exposure); g.addColorStop(0, gray(v * 0.9)); g.addColorStop(0.3, gray(v)); g.addColorStop(1, gray(v * 0.96));
      ctx.fillStyle = g; ctx.fillRect(x + off + 2, y + 3, tab - 4, exposure - 3);
      bx.fillStyle = gray(0.45 + r() * 0.2); bx.fillRect(x + off + 2, y + 3, tab - 4, exposure - 3);
    }
  }
  tonal(c, 102, { low: 0.06, grain: 0.09, grainScale: 2 });
  return { map: c, bump: b, size: 4 };
}
function standingSeam() {
  const S = 512; const ft = S / 4; const c = canvas(S, S); const b = canvas(S, S); const ctx = c.getContext('2d'); const bx = b.getContext('2d');
  ctx.fillStyle = gray(0.95); ctx.fillRect(0, 0, S, S); bx.fillStyle = gray(0.5); bx.fillRect(0, 0, S, S);
  const panel = 1.333 * ft; const seam = 0.07 * ft;
  for (let x = 0; x < S; x += panel) {
    const g = ctx.createLinearGradient(x, 0, x + panel, 0); g.addColorStop(0, gray(0.88)); g.addColorStop(0.5, gray(0.97)); g.addColorStop(1, gray(0.9));
    ctx.fillStyle = g; ctx.fillRect(x, 0, panel, S);
    ctx.fillStyle = gray(0.6); ctx.fillRect(x, 0, 2, S); ctx.fillStyle = gray(1); ctx.fillRect(x + 2, 0, seam, S); ctx.fillStyle = gray(0.72); ctx.fillRect(x + 2 + seam, 0, 2, S);
    bx.fillStyle = gray(0.98); bx.fillRect(x, 0, seam + 3, S);
  }
  tonal(c, 103, { low: 0.025, grain: 0.004 });
  return { map: c, bump: b, size: 4 };
}
function corrugated() {
  const S = 512; const ft = S / 4; const c = canvas(S, S); const b = canvas(S, S); const period = (2.67 / 12) * ft;
  perPixel(c, (x) => { const v = 0.78 + 0.2 * (0.5 + 0.5 * Math.sin((x / period) * Math.PI * 2)); const g = v * 255; return [g, g, g]; });
  perPixel(b, (x) => { const v = 0.5 + 0.45 * Math.sin((x / period) * Math.PI * 2); const g = v * 255; return [g, g, g]; });
  tonal(c, 104, { low: 0.03, grain: 0.005 });
  return { map: c, bump: b, size: 4 };
}
function membrane() {
  const S = 256; const c = canvas(S, S); const ctx = c.getContext('2d');
  ctx.fillStyle = gray(0.9); ctx.fillRect(0, 0, S, S); ctx.fillStyle = gray(0.8); ctx.fillRect(0, 0, S, 3);
  tonal(c, 105, { low: 0.04, grain: 0.01 });
  return { map: c, size: 6 };
}

// ---------------------------------------------------------------------------
// Flooring (colored). Tile sizes vary.
// ---------------------------------------------------------------------------
function planks(seed, base, dark, light, plankWft, lenMin, lenMax, gap = 1.5) {
  const S = 512; const ft = S / 4; const c = canvas(S, S); const ctx = c.getContext('2d'); const r = rng(seed);
  const plankW = plankWft * ft;
  ctx.fillStyle = rgb(...dark.map((v) => v * 0.6)); ctx.fillRect(0, 0, S, S);
  for (let y = 0; y < S; y += plankW) {
    let x = -r() * ft * 2;
    while (x < S) {
      const L = (lenMin + r() * (lenMax - lenMin)) * ft; const t = r();
      const col = mix(mix(base, dark, t * 0.6), light, r() * 0.3);
      const g = ctx.createLinearGradient(x, y, x, y + plankW); g.addColorStop(0, rgb(...col.map((v) => v * 1.04))); g.addColorStop(1, rgb(...col.map((v) => v * 0.96)));
      ctx.fillStyle = g; ctx.fillRect(x, y, L - gap, plankW - gap);
      x += L;
    }
  }
  return c;
}
function hardwood() { const c = planks(201, [168, 118, 72], [120, 78, 44], [205, 160, 105], 3.25 / 12, 1.5, 4); woodGrain(c, 202, { strength: 0.1, scale: 70 }); tonal(c, 203, { low: 0.04, grain: 0.015 }); return { map: c, size: 4, colored: true, rough: 0.5 }; }
function laminate() { const c = planks(211, [196, 170, 132], [160, 134, 100], [222, 202, 168], 7 / 12, 3, 4.5); woodGrain(c, 212, { strength: 0.06, scale: 120 }); tonal(c, 213, { low: 0.03, grain: 0.01 }); return { map: c, size: 4, colored: true, rough: 0.35 }; }
function lvp() { const c = planks(221, [150, 136, 118], [108, 96, 84], [178, 166, 150], 7 / 12, 3, 5); woodGrain(c, 222, { strength: 0.07, scale: 90 }); tonal(c, 223, { low: 0.03, grain: 0.01 }); return { map: c, size: 4, colored: true, rough: 0.45 }; }
function tile() {
  const S = 512; const ft = S / 4; const c = canvas(S, S); const ctx = c.getContext('2d'); const r = rng(231);
  ctx.fillStyle = rgb(190, 186, 178); ctx.fillRect(0, 0, S, S);
  const t = ft; const g = 4;
  for (let y = 0; y < S; y += t) for (let x = 0; x < S; x += t) { const v = 215 + r() * 25; const gr = ctx.createLinearGradient(x, y, x + t, y + t); gr.addColorStop(0, rgb(v, v - 4, v - 10)); gr.addColorStop(1, rgb(v - 8, v - 12, v - 16)); ctx.fillStyle = gr; ctx.fillRect(x + g / 2, y + g / 2, t - g, t - g); }
  tonal(c, 232, { low: 0.03, grain: 0.012 });
  return { map: c, size: 4, colored: true, rough: 0.25 };
}
function slate() {
  const S = 512; const ft = S / 4; const c = canvas(S, S); const ctx = c.getContext('2d'); const r = rng(241);
  ctx.fillStyle = rgb(70, 72, 76); ctx.fillRect(0, 0, S, S);
  const t = ft; const g = 5;
  for (let y = 0; y < S; y += t) for (let x = 0; x < S; x += t) { const base = [88 + r() * 30, 92 + r() * 28, 96 + r() * 26]; const gr = ctx.createLinearGradient(x, y, x + t, y + t); gr.addColorStop(0, rgb(...base.map((v) => v * 1.1))); gr.addColorStop(1, rgb(...base.map((v) => v * 0.85))); ctx.fillStyle = gr; ctx.fillRect(x + g / 2, y + g / 2, t - g, t - g); }
  tonal(c, 242, { low: 0.08, grain: 0.05, grainScale: 3 });
  return { map: c, size: 4, colored: true, rough: 0.7 };
}
function cork() {
  const S = 256; const c = canvas(S, S); const noise = makeNoise(251);
  perPixel(c, (x, y) => { const n = fbm(noise, x / 5, y / 5, 3); const m = noise(x / 2, y / 2); const v = 150 + n * 60 + (m > 0.7 ? 25 : 0); return [v + 20, v - 4, v - 50]; });
  return { map: c, size: 3, colored: true, rough: 0.8 };
}
function carpet() {
  const S = 256; const c = canvas(S, S); const noise = makeNoise(261);
  perPixel(c, (x, y) => { const n = fbm(noise, x / 7, y / 7, 3); const v = 150 + n * 40; return [v, v - 6, v - 16]; });
  return { map: c, size: 3, colored: true, rough: 0.95 };
}
function concreteFloor() {
  const S = 512; const c = canvas(S, S); const noise = makeNoise(271);
  perPixel(c, (x, y) => { const n = fbm(noise, x / 60, y / 60, 4) * 0.7 + fbm(noise, x / 4, y / 4, 2) * 0.3; const v = 140 + n * 55; return [v, v, v - 4]; });
  return { map: c, size: 8, colored: true, rough: 0.7 };
}
function epoxy() {
  const S = 512; const c = canvas(S, S); const ctx = c.getContext('2d'); const noise = makeNoise(281); const r = rng(282);
  perPixel(c, (x, y) => { const n = fbm(noise, x / 90, y / 90, 3); const v = 128 + n * 30; return [v, v + 2, v + 6]; });
  for (let i = 0; i < 2600; i++) { const cols = [[200, 200, 205], [60, 60, 64], [170, 120, 60], [90, 110, 150]]; ctx.fillStyle = rgb(...cols[Math.floor(r() * 4)]); ctx.fillRect(r() * S, r() * S, 2 + r() * 2, 2 + r() * 2); }
  return { map: c, size: 8, colored: true, rough: 0.2 };
}
function concrete() {
  const S = 512; const c = canvas(S, S); const noise = makeNoise(291);
  perPixel(c, (x, y) => { const n = fbm(noise, x / 50, y / 50, 4) * 0.7 + fbm(noise, x / 4, y / 4, 2) * 0.3; const v = 150 + n * 50; return [v, v, v - 6]; });
  const ctx = c.getContext('2d'); ctx.fillStyle = 'rgba(0,0,0,0.12)'; for (let x = 0; x < S; x += S / 2) ctx.fillRect(x, 0, 2, S);
  return { map: c, size: 8, colored: true, rough: 0.85 };
}
function lumber() {
  const S = 512; const c = canvas(S, S); const noise = makeNoise(301);
  perPixel(c, (x, y) => {
    const g = fbm(noise, x / 90, y / 6, 4); const rings = 0.5 + 0.5 * Math.sin(g * 18 + x / 40);
    const base = [224, 194, 146]; const dark = [178, 140, 92]; return mix(base, dark, rings * 0.55 + (fbm(noise, x / 3, y / 3, 2) - 0.5) * 0.2);
  });
  return { map: c, size: 8, colored: true, rough: 0.8 };
}
function deckboards() {
  const S = 512; const ft = S / 4; const c = canvas(S, S); const b = canvas(S, S); const ctx = c.getContext('2d'); const bx = b.getContext('2d'); const r = rng(311);
  ctx.fillStyle = gray(0.3); ctx.fillRect(0, 0, S, S); bx.fillStyle = gray(0.2); bx.fillRect(0, 0, S, S);
  const bw = (5.5 / 12) * ft; const gap = 4;
  for (let y = 0; y < S; y += bw + gap) { const v = 0.86 + r() * 0.12; ctx.fillStyle = gray(v); ctx.fillRect(0, y, S, bw); bx.fillStyle = gray(0.6); bx.fillRect(0, y, S, bw); }
  woodGrain(c, 312, { strength: 0.12, scale: 80 }); tonal(c, 313, { low: 0.05, grain: 0.02 });
  return { map: c, bump: b, size: 4 };
}
function gravel() {
  const S = 512; const c = canvas(S, S); const noise = makeNoise(321); const r = rng(322);
  perPixel(c, (x, y) => { const n = fbm(noise, x / 5, y / 5, 3); const v = 124 + n * 60; return [v, v - 2, v - 8]; });
  const ctx = c.getContext('2d');
  for (let i = 0; i < 2600; i++) { const v = 100 + r() * 110; ctx.fillStyle = rgb(v, v - 2, v - 8); const s = 2 + r() * 5; ctx.beginPath(); ctx.ellipse(r() * S, r() * S, s, s * 0.7, r() * 3, 0, 7); ctx.fill(); }
  return { map: c, size: 6, colored: true, rough: 0.95 };
}

// ---------------------------------------------------------------------------
// Insulation (colored), tile 4 ft.
// ---------------------------------------------------------------------------
function fibrous(seed, base, streak, scaleX, scaleY, fluff = 0.3) {
  const S = 256; const c = canvas(S, S); const noise = makeNoise(seed); const n2 = makeNoise(seed + 1);
  perPixel(c, (x, y) => { const n = fbm(noise, x / scaleX, y / scaleY, 3); const f = fbm(n2, x / 14, y / 14, 2); return mix(base, streak, n * 0.8 + (f - 0.5) * fluff); });
  return c;
}
function fiberglass() { return { map: fibrous(401, [236, 164, 190], [250, 214, 226], 40, 4), size: 4, colored: true, rough: 1 }; }
function rockwool() { return { map: fibrous(411, [104, 110, 86], [160, 164, 132], 30, 5), size: 4, colored: true, rough: 1 }; }
function wool() { return { map: fibrous(421, [226, 214, 190], [246, 240, 224], 12, 12, 0.5), size: 4, colored: true, rough: 1 }; }
function cellulose() { const S = 256; const c = canvas(S, S); const noise = makeNoise(431); perPixel(c, (x, y) => { const n = noise(x / 2, y / 2); const m = fbm(noise, x / 30, y / 30, 2); const v = 150 + n * 45 + m * 20; return [v + 10, v - 4, v - 40]; }); return { map: c, size: 4, colored: true, rough: 1 }; }
function foam() { const S = 256; const c = canvas(S, S); const noise = makeNoise(441); perPixel(c, (x, y) => { const n = fbm(noise, x / 18, y / 18, 3); const v = 200 + n * 50; return [v + 20, v - 10, v - 90]; }); return { map: c, size: 4, colored: true, rough: 0.9 }; }

// ---------------------------------------------------------------------------
// Terrain (colored). Painterly: large soft blotches, gentle highlights, sparse flecks.
// ---------------------------------------------------------------------------
const TERRAIN_BASE = {
  grass: { spring: [[104, 142, 62], [140, 160, 80]], summer: [[80, 120, 54], [118, 146, 70]], fall: [[138, 120, 62], [168, 140, 80]] },
  spruce: { spring: [[88, 118, 58], [118, 128, 76]], summer: [[70, 106, 52], [104, 126, 66]], fall: [[120, 108, 60], [150, 122, 74]] },
  tundra: { spring: [[108, 112, 72], [134, 126, 86]], summer: [[96, 118, 66], [130, 124, 80]], fall: [[150, 110, 60], [170, 130, 78]] },
  rainforest: { spring: [[66, 110, 56], [96, 130, 70]], summer: [[56, 100, 48], [88, 122, 62]], fall: [[88, 106, 52], [120, 118, 66]] },
  alpine: { spring: [[110, 128, 76], [150, 146, 110]], summer: [[94, 122, 66], [140, 136, 104]], fall: [[150, 128, 76], [168, 150, 112]] },
  prairie: { spring: [[128, 150, 70], [160, 164, 86]], summer: [[150, 150, 80], [176, 164, 96]], fall: [[176, 150, 86], [196, 170, 104]] },
  desert: { spring: [[190, 160, 112], [210, 184, 140]], summer: [[200, 170, 120], [216, 190, 146]], fall: [[194, 162, 114], [212, 186, 140]] },
  tropical: { spring: [[72, 140, 60], [110, 160, 76]], summer: [[64, 130, 54], [100, 154, 70]], fall: [[76, 136, 60], [112, 156, 78]] },
};
function terrain(type, season) {
  const S = 512; const c = canvas(S, S); const noise = makeNoise(500 + type.length); const noise2 = makeNoise(99); const r = rng(77);
  if (season === 'winter') {
    perPixel(c, (x, y) => { const n = fbm(noise, x / 40, y / 40, 3); const d = fbm(noise2, x / 8, y / 8, 2); const v = 228 + n * 22 + (d - 0.5) * 6; return [v, v + 2, v + 9]; });
    return { map: c, size: 20, colored: true, rough: 0.9 };
  }
  const [a, b] = (TERRAIN_BASE[type] || TERRAIN_BASE.grass)[season] || TERRAIN_BASE.grass.summer;
  perPixel(c, (x, y) => {
    const n = fbm(noise, x / 48, y / 48, 3); const m = fbm(noise2, x / 9, y / 9, 2);
    let col = mix(a, b, n); col = col.map((v) => v * (0.93 + m * 0.14));
    if (type === 'alpine' || type === 'tundra') { const rock = fbm(noise2, x / 70, y / 70, 2); if (rock > 0.68) col = mix(col, [128, 124, 118], (rock - 0.68) * 3); }
    if (type === 'desert') { const dry = fbm(noise2, x / 20, y / 20, 2); if (dry > 0.7) col = mix(col, [120, 130, 80], (dry - 0.7) * 1.5); }
    return col;
  });
  // painterly highlight strokes
  const ctx = c.getContext('2d'); ctx.lineCap = 'round';
  const hi = mix(b, [235, 230, 150], 0.35);
  for (let i = 0; i < 900; i++) { ctx.strokeStyle = rgba(...hi, 0.18 + r() * 0.2); ctx.lineWidth = 1 + r() * 2; const x = r() * S; const y = r() * S; const L = 3 + r() * 8; const ang = -Math.PI / 2 + (r() - 0.5) * 0.8; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + Math.cos(ang) * L, y + Math.sin(ang) * L); ctx.stroke(); }
  if (season === 'spring' || season === 'summer') for (let i = 0; i < 70; i++) { ctx.fillStyle = r() > 0.5 ? 'rgba(250,240,120,0.8)' : 'rgba(240,240,250,0.8)'; ctx.beginPath(); ctx.arc(r() * S, r() * S, 1.2 + r() * 1.2, 0, 7); ctx.fill(); }
  if (season === 'fall') for (let i = 0; i < 160; i++) { ctx.fillStyle = rgba(190 + r() * 40, 110 + r() * 40, 40, 0.75); ctx.beginPath(); ctx.ellipse(r() * S, r() * S, 2 + r() * 2, 1.3 + r(), r() * 3, 0, 7); ctx.fill(); }
  return { map: c, size: 20, colored: true, rough: 0.95 };
}
function snow() {
  const S = 256; const c = canvas(S, S); const noise = makeNoise(601);
  perPixel(c, (x, y) => { const n = fbm(noise, x / 24, y / 24, 3); const v = 234 + n * 18; return [v, v + 2, v + 7]; });
  return { map: c, size: 10, colored: true, rough: 0.9 };
}

// Blueprint ground tile: 10 ft × 10 ft. Fine 1 ft lines, a medium 5 ft line and a double line at the
// tile edge, all translucent white over slightly uneven blue paper. Ruler ticks along the edge.
function blueprint() {
  const S = 1024; const c = canvas(S, S); const ctx = c.getContext('2d'); const ft = S / 10;
  ctx.fillStyle = '#1b4aa0'; ctx.fillRect(0, 0, S, S);
  const noise = makeNoise(700); const img = ctx.getImageData(0, 0, S, S); const d = img.data;
  for (let y = 0; y < S; y += 2) for (let x = 0; x < S; x += 2) { const n = (fbm(noise, x / 110, y / 110, 3) - 0.5) * 16 + (noise(x / 3, y / 3) - 0.5) * 5; for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 2; dx++) { const i = ((y + dy) * S + (x + dx)) * 4; d[i] += n * 0.7; d[i + 1] += n * 0.85; d[i + 2] += n; } }
  ctx.putImageData(img, 0, 0);
  ctx.strokeStyle = 'rgba(255,255,255,0.16)'; ctx.lineWidth = 1.2;
  for (let i = 1; i < 10; i++) { const p = i * ft; ctx.beginPath(); ctx.moveTo(p, 0); ctx.lineTo(p, S); ctx.moveTo(0, p); ctx.lineTo(S, p); ctx.stroke(); }
  ctx.strokeStyle = 'rgba(255,255,255,0.3)'; ctx.lineWidth = 1.6; ctx.beginPath(); ctx.moveTo(5 * ft, 0); ctx.lineTo(5 * ft, S); ctx.moveTo(0, 5 * ft); ctx.lineTo(S, 5 * ft); ctx.stroke();
  // double line at the tile boundary
  ctx.strokeStyle = 'rgba(255,255,255,0.5)'; ctx.lineWidth = 2.2;
  ctx.beginPath(); ctx.moveTo(1.5, 0); ctx.lineTo(1.5, S); ctx.moveTo(0, S - 1.5); ctx.lineTo(S, S - 1.5); ctx.stroke();
  ctx.lineWidth = 1.4; ctx.strokeStyle = 'rgba(255,255,255,0.42)';
  ctx.beginPath(); ctx.moveTo(7, 0); ctx.lineTo(7, S); ctx.moveTo(0, S - 7); ctx.lineTo(S, S - 7); ctx.stroke();
  // ruler ticks inside the boundary (every foot, longer every 5)
  ctx.strokeStyle = 'rgba(255,255,255,0.45)'; ctx.lineWidth = 1.4;
  for (let i = 1; i < 10; i++) { const p = i * ft; const L = i % 5 === 0 ? 18 : 10; ctx.beginPath(); ctx.moveTo(p, S - 7); ctx.lineTo(p, S - 7 - L); ctx.moveTo(7, S - p); ctx.lineTo(7 + L, S - p); ctx.stroke(); }
  ctx.fillStyle = 'rgba(255,255,255,0.5)'; ctx.font = `${Math.round(ft * 0.2)}px ui-monospace, Menlo, monospace`; ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
  ctx.fillText('5', 5 * ft, S - 30); ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; ctx.fillText('5', 30, S - 5 * ft);
  ctx.font = `${Math.round(ft * 0.15)}px ui-monospace, Menlo, monospace`; ctx.fillStyle = 'rgba(255,255,255,0.3)'; ctx.textAlign = 'left'; ctx.textBaseline = 'top'; ctx.fillText('10 ft', 14, 10);
  return { map: c, size: 10, colored: true, rough: 1 };
}

function rainSprite() {
  const c = canvas(16, 64); const ctx = c.getContext('2d'); const g = ctx.createLinearGradient(0, 0, 0, 64);
  g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(0.5, 'rgba(220,230,255,0.9)'); g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g; ctx.fillRect(6, 0, 3, 64); return { map: c };
}
function snowSprite() {
  const c = canvas(32, 32); const ctx = c.getContext('2d'); const g = ctx.createRadialGradient(16, 16, 0, 16, 16, 16);
  g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.5, 'rgba(255,255,255,0.8)'); g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, 32, 32); return { map: c };
}
// Grass tuft sprite with alpha: three blades fanning up from the base; tinted per instance.
function bladeSprite() {
  const W = 64; const H = 128; const c = canvas(W, H); const ctx = c.getContext('2d');
  ctx.clearRect(0, 0, W, H);
  const blade = (x0, lean, h, w) => {
    const g = ctx.createLinearGradient(0, H, 0, H - h); g.addColorStop(0, 'rgba(150,180,90,1)'); g.addColorStop(0.6, 'rgba(195,222,110,1)'); g.addColorStop(1, 'rgba(230,240,150,1)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(x0 - w, H); ctx.quadraticCurveTo(x0 + lean * 0.3, H - h * 0.55, x0 + lean, H - h); ctx.quadraticCurveTo(x0 + lean * 0.35, H - h * 0.5, x0 + w, H); ctx.closePath(); ctx.fill();
  };
  blade(32, -14, 118, 5); blade(30, 10, 100, 4.5); blade(34, 26, 84, 4); blade(28, -26, 78, 3.5); blade(36, 2, 60, 3);
  return { map: c, size: 1, colored: true, alpha: true };
}

// ---------------------------------------------------------------- foliage cards
// A spruce "branch fan": a drooping triangle built from many short needle strokes, drawn in
// near-white greens so the material color sets the species/season. Alpha outside the needles.
function spruceCard() {
  const W = 256; const H = 256; const c = canvas(W, H); const ctx = c.getContext('2d'); const r = rng(7331);
  ctx.clearRect(0, 0, W, H);
  // soft body first so the silhouette reads as a mass, then needle strokes for the edge
  const body = ctx.createLinearGradient(0, 0, 0, H); body.addColorStop(0, 'rgba(150,170,140,0.0)'); body.addColorStop(0.25, 'rgba(165,185,150,0.85)'); body.addColorStop(1, 'rgba(120,140,110,0.95)');
  ctx.fillStyle = body; ctx.beginPath(); ctx.moveTo(W / 2, 4); ctx.quadraticCurveTo(W * 0.78, H * 0.55, W * 0.97, H * 0.93); ctx.quadraticCurveTo(W / 2, H * 0.8, W * 0.03, H * 0.93); ctx.quadraticCurveTo(W * 0.22, H * 0.55, W / 2, 4); ctx.closePath(); ctx.fill();
  ctx.lineCap = 'round';
  for (let i = 0; i < 900; i++) {
    const t = Math.pow(r(), 0.7); const y = 10 + t * (H - 24); const half = 6 + t * (W / 2 - 10);
    const x = W / 2 + (r() * 2 - 1) * half; const side = x < W / 2 ? -1 : 1; const len = 6 + r() * 16;
    const shade = 150 + r() * 90; ctx.strokeStyle = `rgba(${shade * 0.78},${shade},${shade * 0.72},${0.55 + r() * 0.45})`; ctx.lineWidth = 1 + r() * 1.6;
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + side * len * 0.9, y + len * 0.55 + r() * 4); ctx.stroke();
  }
  // a few bright tips
  for (let i = 0; i < 120; i++) { const t = Math.pow(r(), 0.6); const y = 20 + t * (H - 40); const half = 6 + t * (W / 2 - 12); const x = W / 2 + (r() * 2 - 1) * half; ctx.fillStyle = `rgba(235,245,215,${0.5 + r() * 0.5})`; ctx.beginPath(); ctx.arc(x, y, 1.2 + r() * 1.4, 0, Math.PI * 2); ctx.fill(); }
  return { map: c, size: 1, colored: true, alpha: true };
}
// Leaf cluster: a cloud of overlapping small leaves, lighter toward the top-right (sun side).
function leafCard() {
  const W = 256; const H = 256; const c = canvas(W, H); const ctx = c.getContext('2d'); const r = rng(9173);
  ctx.clearRect(0, 0, W, H);
  for (let i = 0; i < 520; i++) {
    const a = r() * Math.PI * 2; const rad = Math.pow(r(), 0.55) * 108; const x = W / 2 + Math.cos(a) * rad * (0.9 + r() * 0.2); const y = H / 2 + Math.sin(a) * rad * 0.92;
    const sunny = 0.5 + 0.5 * ((x - W / 2) / 110 + (H / 2 - y) / 110) / 1.4; const v = 140 + sunny * 95 + (r() - 0.5) * 30;
    ctx.fillStyle = `rgba(${v * 0.82},${v},${v * 0.6},${0.75 + r() * 0.25})`;
    ctx.save(); ctx.translate(x, y); ctx.rotate(r() * Math.PI); ctx.beginPath(); ctx.ellipse(0, 0, 7 + r() * 9, 4 + r() * 5, 0, 0, Math.PI * 2); ctx.fill(); ctx.restore();
  }
  return { map: c, size: 1, colored: true, alpha: true };
}
// Flame: tall teardrop with a bright core; animated by the material (scale/wobble), tinted per fire.
function flameSprite() {
  const W = 128; const H = 256; const c = canvas(W, H); const ctx = c.getContext('2d');
  ctx.clearRect(0, 0, W, H);
  const tongue = (cx, w, h, inner, outer, alpha) => { const g = ctx.createRadialGradient(cx, H - h * 0.35, 2, cx, H - h * 0.4, h * 0.6); g.addColorStop(0, inner); g.addColorStop(0.55, outer); g.addColorStop(1, 'rgba(255,120,20,0)'); ctx.globalAlpha = alpha; ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(cx, H - h); ctx.bezierCurveTo(cx + w * 0.9, H - h * 0.55, cx + w, H - h * 0.15, cx, H - 2); ctx.bezierCurveTo(cx - w, H - h * 0.15, cx - w * 0.9, H - h * 0.55, cx, H - h); ctx.closePath(); ctx.fill(); };
  tongue(W / 2, 46, 236, 'rgba(255,230,140,1)', 'rgba(255,140,30,0.9)', 0.95);
  tongue(W / 2 - 18, 24, 150, 'rgba(255,240,180,1)', 'rgba(255,160,40,0.9)', 0.8);
  tongue(W / 2 + 16, 22, 170, 'rgba(255,240,180,1)', 'rgba(255,150,40,0.9)', 0.8);
  tongue(W / 2, 20, 110, 'rgba(255,255,230,1)', 'rgba(255,220,120,0.95)', 1);
  ctx.globalAlpha = 1;
  return { map: c, size: 1, colored: true, alpha: true };
}
// Smoke puff: soft blurred disc with a little internal structure.
function smokeSprite() {
  const S = 128; const c = canvas(S, S); const ctx = c.getContext('2d'); const r = rng(4421);
  ctx.clearRect(0, 0, S, S);
  for (let i = 0; i < 14; i++) { const x = S / 2 + (r() - 0.5) * 50; const y = S / 2 + (r() - 0.5) * 50; const rad = 22 + r() * 26; const g = ctx.createRadialGradient(x, y, 0, x, y, rad); g.addColorStop(0, 'rgba(235,235,235,0.32)'); g.addColorStop(1, 'rgba(235,235,235,0)'); ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, rad, 0, Math.PI * 2); ctx.fill(); }
  return { map: c, size: 1, colored: true, alpha: true };
}
// Dust motes in a sun shaft: faint sparkles, mostly transparent.
function shaftSprite() {
  const W = 64; const H = 256; const c = canvas(W, H); const ctx = c.getContext('2d'); const r = rng(8891);
  const g = ctx.createLinearGradient(0, 0, 0, H); g.addColorStop(0, 'rgba(255,255,255,0.9)'); g.addColorStop(1, 'rgba(255,255,255,0)'); ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  for (let i = 0; i < 60; i++) { ctx.fillStyle = `rgba(255,255,255,${0.3 + r() * 0.7})`; ctx.beginPath(); ctx.arc(r() * W, r() * H, 0.6 + r() * 1.2, 0, Math.PI * 2); ctx.fill(); }
  return { map: c, size: 1, colored: true, alpha: true };
}

const GENERATORS = {
  lap: lapSiding, batten: battenSiding, shiplap, shingle: () => shingleSiding(false), metalwall: metalWall, log: logSiding, t111,
  ledgestone, riverrock, fieldstone,
  shingleroof: asphaltShingle, standingseam: standingSeam, corrugated, shake: () => shingleSiding(true), membrane,
  hardwood, laminate, lvp, tile, slate, cork, carpet, concretefloor: concreteFloor, epoxy, concrete, lumber, deckboards, gravel, snow, blueprint,
  fiberglass, rockwool, wool, cellulose, foam,
  rain: rainSprite, snowflake: snowSprite, blade: bladeSprite,
  sprucecard: spruceCard, leafcard: leafCard, flame: flameSprite, smoke: smokeSprite, shaft: shaftSprite,
};

export function getTexture(name, ...args) {
  const key = [name, ...args].join('|');
  if (cache.has(key)) return cache.get(key);
  let result;
  if (name === 'terrain') result = terrain(args[0] || 'grass', args[1] || 'summer');
  else { const gen = GENERATORS[name]; if (!gen) throw new Error(`unknown texture ${name}`); result = gen(); }
  cache.set(key, result);
  return result;
}
