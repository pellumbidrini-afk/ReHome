// Groundwork — material cache. UVs across the app are in feet, so each texture's repeat is
// 1 / tileSize and the same texture object can be shared by every mesh that uses it.
// Leaf and grass materials carry a wind shader patch driven by `wind.uTime` / `wind.uWind`.
import * as THREE from './vendor.js';
import { getTexture } from './textures.js';
import { SIDING, ROOFING, FLOORING, STONE_VENEER, INSULATION } from './catalog.js';

const texCache = new Map();
const matCache = new Map();
export const wind = { uTime: { value: 0 }, uWind: { value: 1 } };

export function tex(name, ...args) {
  const key = [name, ...args].join('|');
  if (texCache.has(key)) return texCache.get(key);
  const src = getTexture(name, ...args);
  const t = new THREE.CanvasTexture(src.map);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  const size = src.size || 1; t.repeat.set(1 / size, 1 / size);
  let bump = null;
  if (src.bump) { bump = new THREE.CanvasTexture(src.bump); bump.wrapS = bump.wrapT = THREE.RepeatWrapping; bump.repeat.set(1 / size, 1 / size); bump.anisotropy = 4; }
  const out = { map: t, bump, size, colored: !!src.colored, rough: src.rough, alpha: !!src.alpha };
  texCache.set(key, out); return out;
}
function cached(key, make) { if (matCache.has(key)) return matCache.get(key); const m = make(); matCache.set(key, m); return m; }

// Vertex-shader wind for foliage. Amplitude grows with height above the ground.
function patchWind(material, { mode = 'tree', amp = 0.35, height = 25 } = {}) {
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = wind.uTime; shader.uniforms.uWind = wind.uWind;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uTime; uniform float uWind;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        {
          #ifdef USE_INSTANCING
            vec4 gwW = modelMatrix * instanceMatrix * vec4(position, 1.0);
          #else
            vec4 gwW = modelMatrix * vec4(position, 1.0);
          #endif
          float gwPhase = gwW.x * 0.23 + gwW.z * 0.19;
          float gwGust = 0.65 + 0.35 * sin(uTime * 0.37 + gwPhase * 0.15) * sin(uTime * 0.21 + 1.7);
          float gwS = (sin(uTime * 1.15 + gwPhase) * 0.6 + sin(uTime * 2.6 + gwPhase * 1.9) * 0.4) * gwGust;
          float gwC = cos(uTime * 0.95 + gwPhase * 1.3) * gwGust;
          ${mode === 'tree'
            ? `float gwH = clamp(gwW.y / ${height.toFixed(1)}, 0.0, 1.0); gwH = gwH * gwH;
               float gwSx = max(0.001, length(modelMatrix[0].xyz)); float gwSz = max(0.001, length(modelMatrix[2].xyz));
               transformed.x += gwS * gwH * uWind * ${amp.toFixed(3)} / gwSx; transformed.z += gwC * gwH * uWind * ${amp.toFixed(3)} * 0.5 / gwSz;`
            : `float gwH = clamp(position.y, 0.0, 1.0); gwH = gwH * gwH;
               transformed.x += gwS * gwH * uWind * ${amp.toFixed(3)}; transformed.z += gwC * gwH * uWind * ${amp.toFixed(3)} * 0.6;`}
        }`);
  };
  material.customProgramCacheKey = () => `wind|${mode}|${amp}|${height}`;
  return material;
}

export function sidingMaterial(typeId, colorHex) {
  const def = SIDING.find((s) => s.id === typeId) || SIDING[0];
  return cached(`siding|${def.id}|${colorHex}`, () => {
    const t = tex(def.tex); const metal = def.id === 'metal';
    return new THREE.MeshStandardMaterial({ map: t.map, bumpMap: t.bump, bumpScale: metal ? 0.03 : 0.08, color: new THREE.Color(colorHex), roughness: metal ? 0.45 : 0.8, metalness: metal ? 0.55 : 0 });
  });
}
export function stoneMaterial(typeId) {
  const def = STONE_VENEER.find((s) => s.id === typeId) || STONE_VENEER[0];
  return cached(`stone|${def.id}`, () => { const t = tex(def.tex); return new THREE.MeshStandardMaterial({ map: t.map, bumpMap: t.bump, bumpScale: 0.14, color: new THREE.Color(def.hex).multiplyScalar(1.15), roughness: 0.92 }); });
}
export function stoneTinted(colorHex, texName = 'fieldstone') { return cached(`stonet|${texName}|${colorHex}`, () => { const t = tex(texName); return new THREE.MeshStandardMaterial({ map: t.map, bumpMap: t.bump, bumpScale: 0.1, color: new THREE.Color(colorHex).multiplyScalar(1.15), roughness: 0.92 }); }); }
export function roofingMaterial(typeId, colorHex) {
  const def = ROOFING.find((r) => r.id === typeId) || ROOFING[0];
  return cached(`roof|${def.id}|${colorHex}`, () => {
    const t = tex(def.tex); const metal = def.id === 'standing' || def.id === 'corrugated';
    return new THREE.MeshStandardMaterial({ map: t.map, bumpMap: t.bump || null, bumpScale: metal ? 0.05 : 0.1, color: new THREE.Color(colorHex), roughness: metal ? 0.5 : 0.9, metalness: metal ? 0.3 : 0, side: THREE.DoubleSide });
  });
}
export function floorMaterial(typeId) {
  const def = FLOORING.find((f) => f.id === typeId) || FLOORING[0];
  return cached(`floor|${def.id}`, () => { const t = tex(def.tex); return new THREE.MeshStandardMaterial({ map: t.map, roughness: t.rough ?? 0.6, metalness: 0 }); });
}
export function insulationMaterial(typeId) {
  const def = INSULATION.find((i) => i.id === typeId) || INSULATION[0];
  return cached(`insul|${def.id}`, () => { const t = tex(def.tex); return new THREE.MeshStandardMaterial({ map: t.map, roughness: 1, metalness: 0 }); });
}
export function polyMaterial() { return cached('poly', () => new THREE.MeshPhysicalMaterial({ color: 0xdfe9f2, transparent: true, opacity: 0.32, roughness: 0.12, metalness: 0, side: THREE.DoubleSide, depthWrite: false, clearcoat: 0.6 })); }
export function paintMaterial(colorHex, opts = {}) { return cached(`paint|${colorHex}|${opts.side || 0}`, () => new THREE.MeshStandardMaterial({ color: new THREE.Color(colorHex), roughness: 0.92, metalness: 0, side: opts.side || THREE.FrontSide })); }
export function trimMaterial(colorHex) { return cached(`trim|${colorHex}`, () => new THREE.MeshStandardMaterial({ color: new THREE.Color(colorHex), roughness: 0.6, metalness: 0 })); }
export function lumberMaterial() { return cached('lumber', () => { const t = tex('lumber'); return new THREE.MeshStandardMaterial({ map: t.map, roughness: 0.85 }); }); }
export function osbMaterial() { return cached('osb', () => new THREE.MeshStandardMaterial({ color: 0xc9a46a, roughness: 0.9 })); }
export function concreteMaterial() { return cached('concrete', () => { const t = tex('concrete'); return new THREE.MeshStandardMaterial({ map: t.map, roughness: 0.88 }); }); }
export function gravelMaterial() { return cached('gravel', () => { const t = tex('gravel'); return new THREE.MeshStandardMaterial({ map: t.map, roughness: 0.95 }); }); }
export function deckMaterial(colorHex) { return cached(`deck|${colorHex}`, () => { const t = tex('deckboards'); return new THREE.MeshStandardMaterial({ map: t.map, bumpMap: t.bump, bumpScale: 0.05, color: new THREE.Color(colorHex), roughness: 0.75 }); }); }
export function glassMaterial() { return cached('glass', () => new THREE.MeshPhysicalMaterial({ color: 0xcfe3f5, roughness: 0.05, metalness: 0, transparent: true, opacity: 0.32, side: THREE.DoubleSide, depthWrite: false, envMapIntensity: 1.2, reflectivity: 0.9 })); }
export function tintedGlass() { return cached('tglass', () => new THREE.MeshPhysicalMaterial({ color: 0x2b3a4a, roughness: 0.08, metalness: 0.1, transparent: true, opacity: 0.72, side: THREE.DoubleSide, envMapIntensity: 1.4 })); }
export function metalMaterial(colorHex = '#b9bcc0') { return cached(`metal|${colorHex}`, () => new THREE.MeshStandardMaterial({ color: new THREE.Color(colorHex), roughness: 0.35, metalness: 0.75 })); }
export function carPaint(colorHex) { return cached(`car|${colorHex}`, () => new THREE.MeshPhysicalMaterial({ color: new THREE.Color(colorHex), roughness: 0.38, metalness: 0.35, clearcoat: 1, clearcoatRoughness: 0.08 })); }
export function plasticMaterial(colorHex) { return cached(`plastic|${colorHex}`, () => new THREE.MeshStandardMaterial({ color: new THREE.Color(colorHex), roughness: 0.5, metalness: 0.05 })); }
export function glossMaterial(colorHex) { return cached(`gloss|${colorHex}`, () => new THREE.MeshPhysicalMaterial({ color: new THREE.Color(colorHex), roughness: 0.22, metalness: 0, clearcoat: 0.7, clearcoatRoughness: 0.15 })); }
export function fabricMaterial(colorHex) { return cached(`fabric|${colorHex}`, () => new THREE.MeshStandardMaterial({ color: new THREE.Color(colorHex), roughness: 0.95, metalness: 0 })); }
export function woodMaterial(colorHex) { return cached(`wood|${colorHex}`, () => { const t = tex('lumber'); return new THREE.MeshStandardMaterial({ map: t.map, color: new THREE.Color(colorHex).lerp(new THREE.Color(1, 1, 1), 0.08), roughness: 0.62 }); }); }
export function cabinetMaterial(colorHex, finish = 'wood') { if (finish === 'painted') return paintMaterial(colorHex); if (finish === 'laminate') return glossMaterial(colorHex); return woodMaterial(colorHex); }
export function emissiveMaterial(colorHex, intensity = 1.5) { return cached(`emit|${colorHex}|${intensity}`, () => new THREE.MeshStandardMaterial({ color: new THREE.Color(colorHex), emissive: new THREE.Color(colorHex), emissiveIntensity: intensity, roughness: 0.4 })); }
export function lampMaterial(colorHex) { return new THREE.MeshStandardMaterial({ color: new THREE.Color(colorHex), emissive: new THREE.Color(colorHex), emissiveIntensity: 0, roughness: 0.5 }); }
export function leafMaterial(colorHex = '#2f4f2f', height = 25) { return cached(`leaf|${colorHex}|${height}`, () => patchWind(new THREE.MeshStandardMaterial({ color: new THREE.Color(colorHex), roughness: 0.95 }), { mode: 'tree', amp: 1.1, height })); }
// Painterly foliage cards (spruce branch fans, leaf clusters): alpha-tested so they cast proper shadows, lit from both sides.
export function foliageCardMaterial(texName, colorHex, height = 25) {
  return cached(`fcard|${texName}|${colorHex}|${height}`, () => {
    const t = tex(texName);
    const m = new THREE.MeshStandardMaterial({ map: t.map, color: new THREE.Color(colorHex), alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.95, metalness: 0 });
    return patchWind(m, { mode: 'tree', amp: 1.2, height });
  });
}
// Fire: additive flame cards that wobble with uTime; brightness is set per fire by the builder.
export function flameMaterial() {
  return cached('flame', () => {
    const t = tex('flame');
    const m = new THREE.MeshBasicMaterial({ map: t.map, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, color: 0xffffff, fog: false });
    m.onBeforeCompile = (shader) => {
      shader.uniforms.uTime = wind.uTime;
      shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\nuniform float uTime;').replace('#include <begin_vertex>', `#include <begin_vertex>
        { float ph = position.x * 3.0 + position.z * 5.0; float hgt = clamp(uv.y, 0.0, 1.0);
          transformed.x += sin(uTime * 9.0 + ph) * 0.12 * hgt * hgt; transformed.y *= 0.85 + 0.15 * sin(uTime * 7.3 + ph * 1.3) * hgt; }`);
    };
    m.customProgramCacheKey = () => 'flame';
    return m;
  });
}
export function smokeMaterial() { return cached('smoke', () => new THREE.SpriteMaterial({ map: tex('smoke').map, transparent: true, depthWrite: false, opacity: 0.35, color: 0xe8e8e8, fog: true })); }
// Sun shafts: additive quads with vertex alpha fading away from the window.
export function shaftMaterial() { return cached('shaft', () => new THREE.MeshBasicMaterial({ map: tex('shaft').map, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, vertexColors: true, fog: false })); }
export function mirrorMaterial() { return cached('mirror', () => new THREE.MeshStandardMaterial({ color: 0xdfe6ec, roughness: 0.04, metalness: 1.0, envMapIntensity: 1.6 })); }
export function screenMaterial() { return cached('screen', () => new THREE.MeshStandardMaterial({ color: 0x0b1118, roughness: 0.15, metalness: 0.2, emissive: 0x16242e, emissiveIntensity: 0.25 })); }
export function barkMaterial(colorHex = '#5a4634') { return cached(`bark|${colorHex}`, () => new THREE.MeshStandardMaterial({ color: new THREE.Color(colorHex), roughness: 0.95 })); }
export function rockMaterial() { return cached('rock', () => new THREE.MeshStandardMaterial({ color: 0x8a8580, roughness: 0.95, flatShading: true })); }
export function snowMaterial() { return cached('snowmat', () => { const t = tex('snow'); return new THREE.MeshStandardMaterial({ map: t.map, roughness: 0.92 }); }); }
export function grassMaterial() {
  return cached('grass', () => {
    const t = tex('blade');
    const m = new THREE.MeshStandardMaterial({ map: t.map, alphaTest: 0.45, side: THREE.DoubleSide, roughness: 0.9, metalness: 0, color: 0xffffff });
    return patchWind(m, { mode: 'grass', amp: 0.38 });
  });
}
export function ghostMaterial(colorHex = '#ffb547') { return cached(`ghost|${colorHex}`, () => new THREE.MeshBasicMaterial({ color: new THREE.Color(colorHex), transparent: true, opacity: 0.45, depthWrite: false })); }
export function highlightMaterial() { return cached('highlight', () => new THREE.MeshBasicMaterial({ color: 0xffb547, transparent: true, opacity: 0.35, depthWrite: false, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 })); }
export function lineMaterial(colorHex = '#ffffff', opacity = 0.9) { return cached(`line|${colorHex}|${opacity}`, () => new THREE.LineBasicMaterial({ color: new THREE.Color(colorHex), transparent: opacity < 1, opacity })); }

// Ground: terrain or snow where the mask reveals it, blueprint elsewhere. Built on MeshStandardMaterial so
// it is lit and shadowed like everything else. The mask fades with a smooth curve so grass ombrés into blue.
export function groundMaterial(terrainType, season, snowCover) {
  const key = `ground|${terrainType}|${season}|${snowCover ? 'snow' : 'bare'}`;
  return cached(key, () => {
    const terrain = snowCover || season === 'winter' ? tex('terrain', terrainType, 'winter') : tex('terrain', terrainType, season);
    const blue = tex('blueprint');
    const m = new THREE.MeshStandardMaterial({ map: terrain.map, roughness: 0.95, metalness: 0 });
    m.userData.uniforms = { uBlue: { value: blue.map }, uMask: { value: null }, uMaskRect: { value: new THREE.Vector4(-100, -100, 200, 200) }, uBlueRepeat: { value: 1 / blue.size }, uTerrainRepeat: { value: 1 / terrain.size }, uReveal: { value: 1 } };
    m.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, m.userData.uniforms);
      shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vWPos;').replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;');
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vWPos; uniform sampler2D uBlue; uniform sampler2D uMask; uniform vec4 uMaskRect; uniform float uBlueRepeat; uniform float uTerrainRepeat; uniform float uReveal;')
        .replace('#include <map_fragment>', `
          vec2 mUv = (vWPos.xz - uMaskRect.xy) / uMaskRect.zw;
          float gMask = 0.0;
          if (mUv.x > 0.0 && mUv.x < 1.0 && mUv.y > 0.0 && mUv.y < 1.0) gMask = texture2D(uMask, vec2(mUv.x, 1.0 - mUv.y)).r;
          gMask = smoothstep(0.0, 1.0, clamp(gMask * uReveal, 0.0, 1.0));
          vec4 terrainTex = texture2D(map, vWPos.xz * uTerrainRepeat);
          vec4 blueTex = texture2D(uBlue, vec2(vWPos.x, -vWPos.z) * uBlueRepeat);
          // the blueprint lines stay faintly visible through the grass near its edge
          vec4 edgeTint = mix(blueTex, terrainTex, 0.85);
          vec4 groundCol = mix(blueTex, mix(edgeTint, terrainTex, smoothstep(0.35, 1.0, gMask)), gMask);
          diffuseColor *= groundCol;
        `)
        .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = mix(1.0, roughnessFactor, gMask);');
    };
    m.customProgramCacheKey = () => key;
    return m;
  });
}

export function disposeAll() {
  for (const m of matCache.values()) m.dispose();
  matCache.clear();
  for (const t of texCache.values()) { t.map.dispose(); if (t.bump) t.bump.dispose(); }
  texCache.clear();
}
