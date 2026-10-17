// Groundwork — camera rig (orbit / plan / walkthrough) and a small gesture tracker.
// The rig has no listeners of its own: app.js decides whether a gesture belongs to the camera or
// to the active tool, so one-finger drawing and two-finger navigation never fight.
import * as THREE from './vendor.js';

export class CameraRig {
  constructor(camera) {
    this.camera = camera;
    this.mode = 'orbit'; // orbit | walk
    this.target = new THREE.Vector3(0, 0, 0); this.goalTarget = this.target.clone();
    this.distance = 120; this.goalDistance = 120;
    this.theta = Math.PI * 0.2; this.goalTheta = this.theta;   // azimuth
    this.phi = Math.PI * 0.32; this.goalPhi = this.phi;        // polar, 0 = straight down
    this.minPhi = 0.02; this.maxPhi = Math.PI * 0.47;
    this.minDist = 4; this.maxDist = 700;
    // walk mode
    this.walkPos = new THREE.Vector3(0, 5.5, 20); this.walkYaw = 0; this.walkPitch = 0; this.eyeHeight = 5.5; this.walkSpeed = 9;
    this.moveInput = new THREE.Vector2();
    this.snapAnim = 0;
  }
  orbit(dx, dy) { this.goalTheta -= dx * 0.006; this.goalPhi = THREE.MathUtils.clamp(this.goalPhi - dy * 0.005, this.minPhi, this.maxPhi); }
  zoom(factor) { this.goalDistance = THREE.MathUtils.clamp(this.goalDistance * factor, this.minDist, this.maxDist); }
  pan(dx, dy, viewportH) {
    // move the target in the ground plane by the pixel delta at the target's depth
    const scale = (2 * Math.tan((this.camera.fov * Math.PI) / 360) * this.goalDistance) / viewportH;
    const right = new THREE.Vector3(Math.cos(this.goalTheta), 0, -Math.sin(this.goalTheta));
    const fwd = new THREE.Vector3(-Math.sin(this.goalTheta), 0, -Math.cos(this.goalTheta));
    this.goalTarget.addScaledVector(right, -dx * scale).addScaledVector(fwd, dy * scale);
  }
  setTop() { this.goalPhi = this.minPhi; }
  setTilt(phi) { this.goalPhi = THREE.MathUtils.clamp(phi, this.minPhi, this.maxPhi); }
  frame(bbox, pad = 1.6) {
    if (!bbox) return;
    this.goalTarget.set(bbox.cx, 0, bbox.cz);
    const size = Math.max(bbox.w, bbox.d, 20);
    const aspectFix = Math.sqrt(Math.min(1, this.camera.aspect || 1)); // tall phone screens need to back off a bit
    this.goalDistance = THREE.MathUtils.clamp((size * pad) / aspectFix, this.minDist, this.maxDist);
  }
  jumpToGoal() { this.target.copy(this.goalTarget); this.distance = this.goalDistance; this.theta = this.goalTheta; this.phi = this.goalPhi; }
  enterWalk(pos, yaw = 0) { this.mode = 'walk'; this.walkPos.set(pos.x, pos.y + this.eyeHeight, pos.z); this.walkYaw = yaw; this.walkPitch = 0; }
  exitWalk() { this.mode = 'orbit'; }
  look(dx, dy) { this.walkYaw -= dx * 0.0045; this.walkPitch = THREE.MathUtils.clamp(this.walkPitch - dy * 0.0035, -1.2, 1.2); }
  update(dt) {
    const k = 1 - Math.exp(-dt * 12);
    if (this.mode === 'orbit') {
      this.target.lerp(this.goalTarget, k); this.distance += (this.goalDistance - this.distance) * k;
      this.theta += (this.goalTheta - this.theta) * k; this.phi += (this.goalPhi - this.phi) * k;
      const p = new THREE.Vector3(Math.sin(this.theta) * Math.sin(this.phi), Math.cos(this.phi), Math.cos(this.theta) * Math.sin(this.phi)).multiplyScalar(this.distance).add(this.target);
      p.y = Math.max(p.y, 1.5);
      this.camera.position.copy(p); this.camera.up.set(0, 1, 0); this.camera.lookAt(this.target);
      this.camera.near = Math.max(0.2, this.distance * 0.004); this.camera.far = 3000; this.camera.updateProjectionMatrix();
    } else {
      const fwd = new THREE.Vector3(-Math.sin(this.walkYaw), 0, -Math.cos(this.walkYaw));
      const right = new THREE.Vector3(Math.cos(this.walkYaw), 0, -Math.sin(this.walkYaw));
      const step = this.walkSpeed * dt;
      this.walkPos.addScaledVector(fwd, this.moveInput.y * step).addScaledVector(right, this.moveInput.x * step);
      this.camera.position.copy(this.walkPos);
      const dir = new THREE.Vector3(Math.cos(this.walkPitch) * fwd.x, Math.sin(this.walkPitch), Math.cos(this.walkPitch) * fwd.z);
      this.camera.up.set(0, 1, 0); this.camera.lookAt(this.walkPos.clone().add(dir));
      this.camera.near = 0.15; this.camera.far = 3000; this.camera.updateProjectionMatrix();
    }
  }
  get focus() { return this.mode === 'orbit' ? this.target : this.walkPos; }
}

// Pointer gesture tracker: tap, single drag, two-finger pinch/pan/twist, wheel.
export class Gestures {
  constructor(el, handlers) {
    this.el = el; this.h = handlers; this.pointers = new Map(); this.single = null; this.pinch = null;
    el.addEventListener('pointerdown', (e) => this._down(e)); el.addEventListener('pointermove', (e) => this._move(e));
    el.addEventListener('pointerup', (e) => this._up(e)); el.addEventListener('pointercancel', (e) => this._up(e)); el.addEventListener('pointerleave', (e) => { if (e.pointerType === 'mouse' && this.pointers.size) this._up(e); });
    el.addEventListener('wheel', (e) => { e.preventDefault(); this.h.wheel?.(e); }, { passive: false });
    el.addEventListener('contextmenu', (e) => e.preventDefault());
  }
  _down(e) {
    this.el.setPointerCapture?.(e.pointerId);
    this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY, t: performance.now(), button: e.button, type: e.pointerType, shift: e.shiftKey, ctrl: e.ctrlKey || e.metaKey });
    if (this.pointers.size === 1) { this.single = { id: e.pointerId, moved: false, claimed: null }; this.h.pointerDown?.(e, this._pt(e)); }
    else if (this.pointers.size === 2) {
      if (this.single) { if (this.single.moved && this.single.claimed) this.h.dragEnd?.(this.single.claimed, this._pt(e), true); this.single = null; }
      const [a, b] = [...this.pointers.values()]; this.pinch = { dist: Math.hypot(a.x - b.x, a.y - b.y), cx: (a.x + b.x) / 2, cy: (a.y + b.y) / 2, ang: Math.atan2(b.y - a.y, b.x - a.x) };
    }
  }
  _move(e) {
    const p = this.pointers.get(e.pointerId); if (!p) return;
    p.x = e.clientX; p.y = e.clientY;
    if (this.pointers.size === 1 && this.single && this.single.id === e.pointerId) {
      const dx = e.clientX - p.sx; const dy = e.clientY - p.sy;
      if (!this.single.moved && Math.hypot(dx, dy) > (p.type === 'touch' ? 8 : 4)) { this.single.moved = true; this.single.claimed = this.h.dragStart?.(this._pt({ clientX: p.sx, clientY: p.sy }), p) || 'camera'; this.single.lx = p.sx; this.single.ly = p.sy; }
      if (this.single.moved) { const mdx = e.clientX - this.single.lx; const mdy = e.clientY - this.single.ly; this.single.lx = e.clientX; this.single.ly = e.clientY; this.h.drag?.(this.single.claimed, this._pt(e), mdx, mdy, p); }
      else this.h.hover?.(this._pt(e));
    } else if (this.pointers.size === 2 && this.pinch) {
      const [a, b] = [...this.pointers.values()]; const dist = Math.hypot(a.x - b.x, a.y - b.y); const cx = (a.x + b.x) / 2; const cy = (a.y + b.y) / 2; const ang = Math.atan2(b.y - a.y, b.x - a.x);
      let dAng = ang - this.pinch.ang; if (dAng > Math.PI) dAng -= 2 * Math.PI; if (dAng < -Math.PI) dAng += 2 * Math.PI;
      this.h.pinch?.({ scale: dist / Math.max(1, this.pinch.dist), dx: cx - this.pinch.cx, dy: cy - this.pinch.cy, rot: dAng, cx, cy });
      this.pinch = { dist, cx, cy, ang };
    } else if (this.pointers.size === 0) this.h.hover?.(this._pt(e));
  }
  _up(e) {
    const p = this.pointers.get(e.pointerId); if (!p) { return; }
    this.pointers.delete(e.pointerId);
    if (this.single && this.single.id === e.pointerId) {
      if (this.single.moved) this.h.dragEnd?.(this.single.claimed, this._pt(e), false, p);
      else if (performance.now() - p.t < 600) this.h.tap?.(this._pt(e), p);
      this.single = null;
    }
    if (this.pointers.size < 2) this.pinch = null;
    if (this.pointers.size === 1) { const [id, q] = [...this.pointers.entries()][0]; q.sx = q.x; q.sy = q.y; this.single = { id, moved: true, claimed: 'camera', lx: q.x, ly: q.y }; }
  }
  _pt(e) { const r = this.el.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top, nx: ((e.clientX - r.left) / r.width) * 2 - 1, ny: -((e.clientY - r.top) / r.height) * 2 + 1 }; }
}

// On-screen joystick for the walkthrough. Emits a unit vector in `vec`.
export class Joystick {
  constructor(el, knob) {
    this.el = el; this.knob = knob; this.vec = new THREE.Vector2(); this.id = null; this.radius = 44;
    el.addEventListener('pointerdown', (e) => { this.id = e.pointerId; el.setPointerCapture(e.pointerId); this._set(e); });
    el.addEventListener('pointermove', (e) => { if (e.pointerId === this.id) this._set(e); });
    const end = (e) => { if (e.pointerId === this.id) { this.id = null; this.vec.set(0, 0); knob.style.transform = 'translate(-50%,-50%)'; } };
    el.addEventListener('pointerup', end); el.addEventListener('pointercancel', end);
  }
  _set(e) {
    const r = this.el.getBoundingClientRect(); let dx = e.clientX - (r.left + r.width / 2); let dy = e.clientY - (r.top + r.height / 2);
    const L = Math.hypot(dx, dy); const m = Math.min(1, L / this.radius); if (L > 0) { dx /= L; dy /= L; }
    this.vec.set(dx * m, -dy * m);
    this.knob.style.transform = `translate(calc(-50% + ${dx * m * this.radius}px), calc(-50% + ${dy * m * this.radius}px))`;
  }
}
