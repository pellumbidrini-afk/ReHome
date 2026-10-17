// Groundwork — sun position, sky dome, lighting rig and weather. Latitude + day of year + hour give
// the sun's elevation/azimuth; the sky dome shader and the lights are driven from that so a
// house in Anchorage in December looks like Anchorage in December.
import * as THREE from './vendor.js';
import { SEASONS, WEATHER } from './catalog.js';

const DEG = Math.PI / 180;

export function solarPosition(latDeg, dayOfYear, hour) {
  const lat = latDeg * DEG;
  const decl = 23.44 * DEG * Math.sin((360 / 365) * (dayOfYear - 81) * DEG);
  const H = 15 * (hour - 12) * DEG;
  const sinEl = Math.sin(lat) * Math.sin(decl) + Math.cos(lat) * Math.cos(decl) * Math.cos(H);
  const el = Math.asin(Math.max(-1, Math.min(1, sinEl)));
  let cosAz = (Math.sin(decl) - sinEl * Math.sin(lat)) / (Math.cos(el) * Math.cos(lat) || 1e-6);
  cosAz = Math.max(-1, Math.min(1, cosAz));
  let az = Math.acos(cosAz);
  if (H > 0) az = 2 * Math.PI - az;
  return { elevation: el, azimuth: az, declination: decl };
}

// Hours of sunrise/sunset in solar time; null for polar day (always) / night (never).
export function sunTimes(latDeg, dayOfYear) {
  const lat = latDeg * DEG;
  const decl = 23.44 * DEG * Math.sin((360 / 365) * (dayOfYear - 81) * DEG);
  const x = -Math.tan(lat) * Math.tan(decl);
  if (x <= -1) return { rise: 0, set: 24, polar: 'day' };
  if (x >= 1) return { rise: null, set: null, polar: 'night' };
  const H0 = Math.acos(x) / DEG / 15;
  return { rise: 12 - H0, set: 12 + H0, polar: null };
}

// World-space unit vector toward the sun. North is -z, east is +x, rotated by the project's north offset.
export function sunDirection(latDeg, dayOfYear, hour, northDeg = 0) {
  const { elevation: el, azimuth: az } = solarPosition(latDeg, dayOfYear, hour);
  const rot = (az + northDeg * DEG);
  const v = new THREE.Vector3(Math.sin(rot) * Math.cos(el), Math.sin(el), -Math.cos(rot) * Math.cos(el));
  return { dir: v, elevation: el, azimuth: az };
}

export function dayOfYearFor(seasonId) { return (SEASONS.find((s) => s.id === seasonId) || SEASONS[1]).dayOfYear; }
export function weatherDef(id) { return WEATHER.find((w) => w.id === id) || WEATHER[0]; }

export function formatHour(h) {
  const total = Math.round((((h % 24) + 24) % 24) * 60) % 1440;
  const hh = Math.floor(total / 60); const mm = total % 60;
  const ap = hh >= 12 ? 'pm' : 'am'; const h12 = ((hh + 11) % 12) + 1;
  return `${h12}:${String(mm).padStart(2, '0')} ${ap}`;
}

// ---------------------------------------------------------------------------
// Sky dome
// ---------------------------------------------------------------------------
const skyVert = /* glsl */`
  varying vec3 vDir;
  void main() {
    vDir = normalize(position);
    vec4 wp = modelMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * viewMatrix * wp;
  }`;
const skyFrag = /* glsl */`
  precision highp float;
  varying vec3 vDir;
  uniform vec3 uSunDir; uniform float uSunEl; uniform float uHaze; uniform float uSky; uniform float uNight; uniform float uTime;
  uniform vec3 uZenith; uniform vec3 uHorizon; uniform vec3 uGround; uniform vec3 uSunColor;
  float hash(vec3 p) { return fract(sin(dot(p, vec3(12.9898, 78.233, 37.719))) * 43758.5453); }
  void main() {
    vec3 d = normalize(vDir);
    float y = d.y;
    float t = clamp(y, 0.0, 1.0);
    // gradient: horizon → zenith, flattened by haze
    float g = pow(t, 0.45 + uHaze * 0.5);
    vec3 col = mix(uHorizon, uZenith, g);
    // sun glow and disc
    float cosA = dot(d, uSunDir);
    float glow = pow(max(cosA, 0.0), 8.0) * (0.25 + 0.6 * (1.0 - uHaze)) * smoothstep(-0.05, 0.15, uSunEl);
    float disc = smoothstep(0.9993, 0.9997, cosA) * (1.0 - uHaze * 0.9) * smoothstep(-0.02, 0.02, uSunEl);
    col += uSunColor * (glow * 0.8 + disc * 4.0);
    // low-sun warm band near the horizon
    float warm = smoothstep(0.25, -0.05, uSunEl) * smoothstep(0.0, 0.08, uSunEl + 0.1) * pow(max(cosA, 0.0), 3.0) * (1.0 - t);
    col += vec3(0.55, 0.25, 0.08) * warm * (1.0 - uHaze * 0.8);
    // stars at night: round pricks with a soft falloff, each twinkling on its own timer
    if (uNight > 0.0 && y > 0.0) {
      float density = 190.0;
      vec3 cell = floor(d * density);
      float s = hash(cell);
      if (s > 0.9935) {
        vec3 jitter = vec3(hash(cell + 7.0), hash(cell + 13.0), hash(cell + 29.0)) - 0.5;
        vec3 center = (cell + 0.5 + jitter * 0.6) / density;
        float dist = length(d - normalize(center)) * density;
        float size = 0.045 + 0.08 * hash(cell + 3.0);
        float prick = smoothstep(size, 0.0, dist);
        float tw = 0.65 + 0.35 * sin(uTime * (1.2 + 2.5 * hash(cell + 5.0)) + hash(cell + 11.0) * 6.283);
        float bright = 0.35 + 0.65 * hash(cell + 1.0);
        vec3 tint = mix(vec3(0.85, 0.9, 1.0), vec3(1.0, 0.92, 0.75), hash(cell + 17.0));
        col += tint * prick * bright * tw * uNight * smoothstep(0.0, 0.25, y) * (1.0 - uHaze);
      }
    }
    if (y < 0.0) { col = mix(uHorizon, uGround, clamp(-y * 6.0, 0.0, 1.0)); }
    gl_FragColor = vec4(col, 1.0);
  }`;

export function makeSkyMaterial() {
  return new THREE.ShaderMaterial({
    vertexShader: skyVert, fragmentShader: skyFrag, side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: {
      uSunDir: { value: new THREE.Vector3(0, 1, 0) }, uSunEl: { value: 0.5 }, uHaze: { value: 0.1 }, uSky: { value: 1 }, uNight: { value: 0 }, uTime: { value: 0 },
      uZenith: { value: new THREE.Color(0.18, 0.4, 0.85) }, uHorizon: { value: new THREE.Color(0.75, 0.85, 0.98) }, uGround: { value: new THREE.Color(0.25, 0.28, 0.3) }, uSunColor: { value: new THREE.Color(1, 0.95, 0.85) },
    },
  });
}

// Palette for a given sun elevation (radians) and weather.
export function skyColors(el, weather) {
  const t = THREE.MathUtils.smoothstep(el, -0.12, 0.35); // 0 night → 1 day
  const dusk = Math.exp(-Math.pow((el - 0.02) / 0.09, 2));   // peak at the horizon
  const haze = weather.haze;
  const zenithDay = new THREE.Color(0.2, 0.42, 0.86).lerp(new THREE.Color(0.55, 0.6, 0.68), haze);
  const horizonDay = new THREE.Color(0.62, 0.78, 0.97).lerp(new THREE.Color(0.7, 0.72, 0.74), haze);
  const zenithNight = new THREE.Color(0.01, 0.015, 0.04); const horizonNight = new THREE.Color(0.04, 0.05, 0.09);
  const zenith = zenithNight.clone().lerp(zenithDay, t);
  const horizon = horizonNight.clone().lerp(horizonDay, t);
  horizon.lerp(new THREE.Color(0.95, 0.55, 0.3), dusk * (1 - haze) * 0.8);
  zenith.lerp(new THREE.Color(0.3, 0.3, 0.55), dusk * (1 - haze) * 0.35);
  const sunColor = new THREE.Color(1, 0.97, 0.9).lerp(new THREE.Color(1, 0.6, 0.3), dusk);
  const ground = new THREE.Color(0.22, 0.26, 0.28).multiplyScalar(0.3 + 0.7 * t);
  return { zenith, horizon, sunColor, ground, day: t, dusk, night: 1 - t };
}

// Everything that changes when the sun or weather does. Owns the lights, sky dome, fog and env map.
export class Atmosphere {
  constructor(renderer, scene) {
    this.renderer = renderer; this.scene = scene;
    this.skyMat = makeSkyMaterial();
    this.dome = new THREE.Mesh(new THREE.SphereGeometry(1800, 32, 16), this.skyMat);
    this.dome.frustumCulled = false; this.dome.renderOrder = -10;
    scene.add(this.dome);
    this.sun = new THREE.DirectionalLight(0xffffff, 2.5);
    this.sun.castShadow = true;
    const sc = this.sun.shadow.camera; sc.near = 1; sc.far = 600; sc.left = -120; sc.right = 120; sc.top = 120; sc.bottom = -120;
    this.sun.shadow.mapSize.set(2048, 2048); this.sun.shadow.bias = -0.0006; this.sun.shadow.normalBias = 0.05; this.sun.shadow.radius = 3;
    this.sunTarget = new THREE.Object3D(); scene.add(this.sunTarget); this.sun.target = this.sunTarget;
    scene.add(this.sun);
    this.hemi = new THREE.HemisphereLight(0xbfd8ff, 0x55604a, 0.6); scene.add(this.hemi);
    this.fill = new THREE.AmbientLight(0xffffff, 0.08); scene.add(this.fill);
    scene.fog = new THREE.Fog(0xc8d8ea, 400, 1600);
    this.pmrem = new THREE.PMREMGenerator(renderer);
    // the environment map uses its own copy of the sky so the "ground" half can be a warm bounce color
    // (what ceilings and undersides are lit by) instead of the dark below-horizon band of the visible dome
    this.envMat = this.skyMat.clone(); this.envScene = new THREE.Scene(); this.envDome = new THREE.Mesh(this.dome.geometry, this.envMat); this.envScene.add(this.envDome);
    this.envTarget = null; this._envDirty = true;
    this.state = { lat: 61, day: 196, hour: 14, weather: WEATHER[0], northDeg: 0, snowCover: false };
    this.particles = null; this.particleKind = null;
    this.focus = new THREE.Vector3(); this.focusRadius = 80;
  }

  setShadowQuality(level) {
    const size = level === 'low' ? 1024 : level === 'high' ? 4096 : 2048;
    this.sun.shadow.mapSize.set(size, size);
    if (this.sun.shadow.map) { this.sun.shadow.map.dispose(); this.sun.shadow.map = null; }
  }

  // Keep the shadow camera tight around what matters (the buildings), not the whole lot.
  setFocus(center, radius) {
    this.focus.copy(center); this.focusRadius = Math.max(30, Math.min(220, radius));
    const sc = this.sun.shadow.camera; const r = this.focusRadius;
    sc.left = -r; sc.right = r; sc.top = r; sc.bottom = -r; sc.updateProjectionMatrix();
    this._place();
  }

  update({ lat, day, hour, weather, northDeg, snowCover }) {
    Object.assign(this.state, { lat, day, hour, weather, northDeg, snowCover });
    const { dir, elevation } = sunDirection(lat, day, hour, northDeg);
    this.sunDir = dir; this.elevation = elevation;
    const cols = skyColors(elevation, weather);
    const u = this.skyMat.uniforms;
    u.uSunDir.value.copy(dir); u.uSunEl.value = elevation; u.uHaze.value = weather.haze; u.uSky.value = weather.sky; u.uNight.value = cols.night;
    u.uZenith.value.copy(cols.zenith); u.uHorizon.value.copy(cols.horizon); u.uGround.value.copy(cols.ground); u.uSunColor.value.copy(cols.sunColor);
    const e = this.envMat.uniforms; for (const k of ['uSunDir', 'uZenith', 'uHorizon', 'uSunColor']) e[k].value.copy(u[k].value); for (const k of ['uSunEl', 'uHaze', 'uSky', 'uNight']) e[k].value = u[k].value;
    e.uGround.value.copy(snowCover ? new THREE.Color(0.62, 0.66, 0.72) : new THREE.Color(0.5, 0.47, 0.4)).multiplyScalar(0.25 + 0.75 * cols.day);
    // sun light
    const up = Math.max(0, Math.sin(elevation));
    const sunStrength = THREE.MathUtils.smoothstep(elevation, -0.02, 0.18) * weather.sun;
    this.sun.intensity = 3.2 * sunStrength;
    this.sun.color.copy(cols.sunColor);
    this.sun.visible = sunStrength > 0.01;
    this._place();
    // ambient
    this.hemi.color.copy(cols.zenith).lerp(new THREE.Color(0.95, 0.96, 1), 0.55);
    this.hemi.groundColor.set(snowCover ? 0xc3ccd6 : 0xb1afa5);
    // at night the floor keeps interiors readable (stand-in for light bouncing off walls)
    this.hemi.intensity = 0.42 + 1.3 * cols.day * weather.sky;
    this.fill.intensity = 0.2 + 0.22 * (1 - cols.day);
    this.fill.color.set(cols.day > 0.5 ? 0xfff6ea : 0xffe6c4);
    // fog
    this.scene.fog.color.copy(cols.horizon);
    const fogNear = 300 - weather.fog * 220; const fogFar = 1500 - weather.fog * 1100;
    this.scene.fog.near = fogNear; this.scene.fog.far = fogFar;
    this.renderer.toneMappingExposure = 0.95 + 0.35 * (1 - cols.day) * weather.sky;
    this._envDirty = true;
    this.cols = cols;
    this.windStrength = weather.wind ?? 1;
  }

  _place() {
    if (!this.sunDir) return;
    const d = this.focusRadius * 2.2;
    this.sun.position.copy(this.focus).addScaledVector(this.sunDir, d);
    this.sunTarget.position.copy(this.focus);
    this.sun.target.updateMatrixWorld();
  }

  // Regenerate the environment map from the sky (cheap enough to do on every sun change, debounced by the caller).
  refreshEnvironment() {
    if (!this._envDirty) return;
    this._envDirty = false;
    const old = this.envTarget;
    this.envTarget = this.pmrem.fromScene(this.envScene, 0.04);
    this.scene.environment = this.envTarget.texture;
    if (old) old.dispose();
  }

  // Precipitation particles inside a box that follows the camera.
  setParticles(kind, textures) {
    if (kind === this.particleKind) return;
    if (this.particles) { this.scene.remove(this.particles); this.particles.geometry.dispose(); this.particles.material.dispose(); this.particles = null; }
    this.particleKind = kind;
    if (!kind) return;
    const N = kind === 'rain' ? 2500 : 1800; const box = 90;
    const pos = new Float32Array(N * 3); const vel = new Float32Array(N);
    for (let i = 0; i < N; i++) { pos[i * 3] = (Math.random() - 0.5) * box; pos[i * 3 + 1] = Math.random() * 60; pos[i * 3 + 2] = (Math.random() - 0.5) * box; vel[i] = kind === 'rain' ? 45 + Math.random() * 25 : 4 + Math.random() * 4; }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('vel', new THREE.BufferAttribute(vel, 1));
    const tex = new THREE.CanvasTexture(textures.getTexture(kind === 'rain' ? 'rain' : 'snowflake').map);
    const m = new THREE.PointsMaterial({ size: kind === 'rain' ? 1.6 : 0.9, map: tex, transparent: true, opacity: kind === 'rain' ? 0.55 : 0.9, depthWrite: false, sizeAttenuation: true, color: kind === 'rain' ? 0xdfe8ff : 0xffffff });
    this.particles = new THREE.Points(g, m); this.particles.frustumCulled = false; this.particles.userData.box = box;
    this.scene.add(this.particles);
  }

  tick(dt, cameraPos) {
    this.skyMat.uniforms.uTime.value += dt;
    if (!this.particles) return;
    const p = this.particles.geometry.attributes.position; const v = this.particles.geometry.attributes.vel; const box = this.particles.userData.box;
    const drift = this.particleKind === 'snow' ? Math.sin(performance.now() / 900) * 1.5 : 2;
    for (let i = 0; i < p.count; i++) {
      let y = p.getY(i) - v.getX(i) * dt; let x = p.getX(i) + drift * dt;
      if (y < 0) { y = 60; x = (Math.random() - 0.5) * box; p.setZ(i, (Math.random() - 0.5) * box); }
      if (x > box / 2) x -= box;
      p.setX(i, x); p.setY(i, y);
    }
    p.needsUpdate = true;
    this.particles.position.set(cameraPos.x, 0, cameraPos.z);
  }
}

// When does direct sun hit a wall face with outward normal n (xz plane), over the day? Ignores shading by
// neighbours. Returns array of [startHour, endHour] windows.
export function sunWindows(lat, day, northDeg, normalXZ) {
  const n = new THREE.Vector3(normalXZ.x, 0, normalXZ.z).normalize();
  const windows = []; let open = null;
  for (let h = 0; h <= 24; h += 0.25) {
    const { dir, elevation } = sunDirection(lat, day, h, northDeg);
    const lit = elevation > 0.03 && dir.dot(n) > 0.08;
    if (lit && open == null) open = h;
    if (!lit && open != null) { windows.push([open, h]); open = null; }
  }
  if (open != null) windows.push([open, 24]);
  return windows;
}
