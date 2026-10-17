// Groundwork — post-processing: ambient occlusion (contact shadows in corners and under furniture),
// bloom on lights and the sun, then filmic tone mapping. Written against plain three.js so it needs
// no addon imports. Everything degrades gracefully: with `enabled` false the app renders directly.
import * as THREE from './vendor.js';

const QUAD_VERT = /* glsl */`varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;

const SSAO_FRAG = /* glsl */`
  precision highp float;
  varying vec2 vUv;
  uniform sampler2D tDepth; uniform vec2 uRes; uniform float uNear; uniform float uFar; uniform mat4 uProj; uniform mat4 uProjInv;
  uniform float uRadius; uniform float uBias; uniform float uStrength;
  #include <packing>
  float readDepth(vec2 uv) { return texture2D(tDepth, uv).x; }
  vec3 viewPos(vec2 uv, float depth) { vec4 clip = vec4(uv * 2.0 - 1.0, depth * 2.0 - 1.0, 1.0); vec4 v = uProjInv * clip; return v.xyz / v.w; }
  float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
  void main() {
    float depth = readDepth(vUv);
    if (depth >= 1.0) { gl_FragColor = vec4(1.0); return; }
    vec3 P = viewPos(vUv, depth);
    vec3 N = normalize(cross(dFdx(P), dFdy(P)));
    float ang = hash(gl_FragCoord.xy) * 6.2831;
    vec3 rnd = vec3(cos(ang), sin(ang), 0.0);
    vec3 T = normalize(rnd - N * dot(rnd, N)); vec3 B = cross(N, T);
    mat3 TBN = mat3(T, B, N);
    const int N_SAMPLES = 12;
    vec3 kernel[12];
    kernel[0] = vec3(0.12, 0.05, 0.35); kernel[1] = vec3(-0.22, 0.18, 0.28); kernel[2] = vec3(0.05, -0.3, 0.42); kernel[3] = vec3(0.4, 0.3, 0.2);
    kernel[4] = vec3(-0.35, -0.2, 0.5); kernel[5] = vec3(0.25, -0.5, 0.3); kernel[6] = vec3(-0.1, 0.55, 0.6); kernel[7] = vec3(0.6, -0.1, 0.55);
    kernel[8] = vec3(-0.55, 0.35, 0.7); kernel[9] = vec3(0.3, 0.6, 0.75); kernel[10] = vec3(-0.2, -0.65, 0.8); kernel[11] = vec3(0.05, 0.1, 0.95);
    float occ = 0.0;
    for (int i = 0; i < N_SAMPLES; i++) {
      vec3 s = P + TBN * kernel[i] * uRadius;
      vec4 clip = uProj * vec4(s, 1.0); vec2 suv = clip.xy / clip.w * 0.5 + 0.5;
      if (suv.x < 0.0 || suv.x > 1.0 || suv.y < 0.0 || suv.y > 1.0) continue;
      float sd = readDepth(suv); if (sd >= 1.0) continue;
      float sz = viewPos(suv, sd).z;
      float range = smoothstep(0.0, 1.0, uRadius / abs(P.z - sz));
      occ += (sz >= s.z + uBias ? 1.0 : 0.0) * range;
    }
    float ao = 1.0 - (occ / float(N_SAMPLES)) * uStrength;
    gl_FragColor = vec4(vec3(ao), 1.0);
  }`;

const BLUR_FRAG = /* glsl */`
  precision highp float; varying vec2 vUv; uniform sampler2D tDiffuse; uniform vec2 uDir;
  void main() {
    vec4 c = vec4(0.0); float w[5]; w[0] = 0.227; w[1] = 0.194; w[2] = 0.121; w[3] = 0.054; w[4] = 0.016;
    c += texture2D(tDiffuse, vUv) * w[0];
    for (int i = 1; i < 5; i++) { vec2 o = uDir * float(i); c += texture2D(tDiffuse, vUv + o) * w[i]; c += texture2D(tDiffuse, vUv - o) * w[i]; }
    gl_FragColor = c;
  }`;

const BRIGHT_FRAG = /* glsl */`
  precision highp float; varying vec2 vUv; uniform sampler2D tDiffuse; uniform float uThreshold;
  void main() { vec3 c = texture2D(tDiffuse, vUv).rgb; float l = dot(c, vec3(0.2126, 0.7152, 0.0722)); float k = smoothstep(uThreshold, uThreshold + 0.6, l); gl_FragColor = vec4(c * k, 1.0); }`;

const COMPOSITE_FRAG = /* glsl */`
  precision highp float; varying vec2 vUv;
  uniform sampler2D tScene; uniform sampler2D tAO; uniform sampler2D tBloom; uniform float uExposure; uniform float uAO; uniform float uBloom; uniform float uVignette;
  vec3 aces(vec3 x) { const float a = 2.51; const float b = 0.03; const float c = 2.43; const float d = 0.59; const float e = 0.14; return clamp((x * (a * x + b)) / (x * (c * x + d) + e), 0.0, 1.0); }
  vec3 toSRGB(vec3 c) { return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c)); }
  void main() {
    vec3 col = texture2D(tScene, vUv).rgb;
    float ao = texture2D(tAO, vUv).r;
    col *= mix(1.0, ao, uAO);
    col += texture2D(tBloom, vUv).rgb * uBloom;
    col = aces(col * uExposure);
    vec2 d = vUv - 0.5; col *= 1.0 - uVignette * dot(d, d) * 1.2;
    gl_FragColor = vec4(toSRGB(col), 1.0);
  }`;

function fsMaterial(frag, uniforms) { return new THREE.ShaderMaterial({ vertexShader: QUAD_VERT, fragmentShader: frag, uniforms, depthTest: false, depthWrite: false, toneMapped: false }); }

export class PostFX {
  constructor(renderer, scene, camera) {
    this.renderer = renderer; this.scene = scene; this.camera = camera;
    this.enabled = false; this.ao = true; this.bloom = true; this.aoStrength = 0.9; this.bloomStrength = 0.35; this.vignette = 0.12;
    this.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), null); this.quadScene = new THREE.Scene(); this.quadScene.add(this.quad); this.quadCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.size = { w: 1, h: 1 };
    this.mats = {
      ssao: fsMaterial(SSAO_FRAG, { tDepth: { value: null }, uRes: { value: new THREE.Vector2() }, uNear: { value: 0.1 }, uFar: { value: 1000 }, uProj: { value: new THREE.Matrix4() }, uProjInv: { value: new THREE.Matrix4() }, uRadius: { value: 1.6 }, uBias: { value: 0.04 }, uStrength: { value: 1.0 } }),
      blur: fsMaterial(BLUR_FRAG, { tDiffuse: { value: null }, uDir: { value: new THREE.Vector2() } }),
      bright: fsMaterial(BRIGHT_FRAG, { tDiffuse: { value: null }, uThreshold: { value: 1.0 } }),
      composite: fsMaterial(COMPOSITE_FRAG, { tScene: { value: null }, tAO: { value: null }, tBloom: { value: null }, uExposure: { value: 1 }, uAO: { value: 1 }, uBloom: { value: 0.35 }, uVignette: { value: 0.12 } }),
    };
    this.white = new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1); this.white.needsUpdate = true;
    this.black = new THREE.DataTexture(new Uint8Array([0, 0, 0, 255]), 1, 1); this.black.needsUpdate = true;
  }
  setSize(w, h) {
    if (w === this.size.w && h === this.size.h && this.sceneRT) return;
    this.size = { w, h }; this.dispose();
    const depthTexture = new THREE.DepthTexture(w, h, THREE.UnsignedIntType);
    this.sceneRT = new THREE.WebGLRenderTarget(w, h, { type: THREE.HalfFloatType, depthTexture, depthBuffer: true, samples: 4 });
    const hw = Math.max(1, Math.floor(w / 2)); const hh = Math.max(1, Math.floor(h / 2));
    this.aoRT = new THREE.WebGLRenderTarget(hw, hh); this.aoRT2 = new THREE.WebGLRenderTarget(hw, hh);
    const qw = Math.max(1, Math.floor(w / 4)); const qh = Math.max(1, Math.floor(h / 4));
    this.bloomRT = new THREE.WebGLRenderTarget(qw, qh, { type: THREE.HalfFloatType }); this.bloomRT2 = new THREE.WebGLRenderTarget(qw, qh, { type: THREE.HalfFloatType });
  }
  dispose() { for (const k of ['sceneRT', 'aoRT', 'aoRT2', 'bloomRT', 'bloomRT2']) { if (this[k]) { this[k].dispose(); this[k] = null; } } }
  _pass(material, target) { this.quad.material = material; this.renderer.setRenderTarget(target); this.renderer.render(this.quadScene, this.quadCam); }
  render() {
    const r = this.renderer; const cam = this.camera;
    const size = new THREE.Vector2(); r.getDrawingBufferSize(size);
    this.setSize(size.x, size.y);
    const prevTone = r.toneMapping;
    r.setRenderTarget(this.sceneRT); r.render(this.scene, cam);
    // AO
    let aoTex = this.white;
    if (this.ao) {
      const m = this.mats.ssao; const u = m.uniforms;
      u.tDepth.value = this.sceneRT.depthTexture; u.uRes.value.set(this.aoRT.width, this.aoRT.height); u.uNear.value = cam.near; u.uFar.value = cam.far;
      u.uProj.value.copy(cam.projectionMatrix); u.uProjInv.value.copy(cam.projectionMatrixInverse); u.uStrength.value = this.aoStrength;
      u.uRadius.value = cam.fov > 60 ? 1.1 : 1.6;
      this._pass(m, this.aoRT);
      this.mats.blur.uniforms.tDiffuse.value = this.aoRT.texture; this.mats.blur.uniforms.uDir.value.set(1 / this.aoRT.width, 0); this._pass(this.mats.blur, this.aoRT2);
      this.mats.blur.uniforms.tDiffuse.value = this.aoRT2.texture; this.mats.blur.uniforms.uDir.value.set(0, 1 / this.aoRT.height); this._pass(this.mats.blur, this.aoRT);
      aoTex = this.aoRT.texture;
    }
    // bloom
    let bloomTex = this.black;
    if (this.bloom) {
      this.mats.bright.uniforms.tDiffuse.value = this.sceneRT.texture; this.mats.bright.uniforms.uThreshold.value = 1.0; this._pass(this.mats.bright, this.bloomRT);
      for (let i = 0; i < 2; i++) {
        this.mats.blur.uniforms.tDiffuse.value = this.bloomRT.texture; this.mats.blur.uniforms.uDir.value.set(1.5 / this.bloomRT.width, 0); this._pass(this.mats.blur, this.bloomRT2);
        this.mats.blur.uniforms.tDiffuse.value = this.bloomRT2.texture; this.mats.blur.uniforms.uDir.value.set(0, 1.5 / this.bloomRT.height); this._pass(this.mats.blur, this.bloomRT);
      }
      bloomTex = this.bloomRT.texture;
    }
    const c = this.mats.composite.uniforms;
    c.tScene.value = this.sceneRT.texture; c.tAO.value = aoTex; c.tBloom.value = bloomTex; c.uExposure.value = r.toneMappingExposure; c.uAO.value = this.ao ? 1 : 0; c.uBloom.value = this.bloomStrength; c.uVignette.value = this.vignette;
    r.toneMapping = THREE.NoToneMapping;
    this._pass(this.mats.composite, null);
    r.toneMapping = prevTone;
    r.setRenderTarget(null);
  }
}
