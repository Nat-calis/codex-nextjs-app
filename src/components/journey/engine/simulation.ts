import {
  DataTexture,
  FloatType,
  HalfFloatType,
  NearestFilter,
  RGBAFormat,
  Vector2,
  Vector3,
  Vector4,
  type IUniform,
  type Texture,
  type WebGLRenderer
} from "three";
import { GPUComputationRenderer, type Variable } from "three/examples/jsm/misc/GPUComputationRenderer.js";
import { hash2 } from "./math";
import { positionShader, velocityShader } from "./shaders";

/** Everything the simulation needs each frame. Mirrors the uniforms in shaders.ts. */
export interface SimParams {
  time: number;
  delta: number;
  mix: number;
  xformA: Vector4;
  xformB: Vector4;
  rotA: Vector2;
  rotB: Vector2;
  spring: number;
  damping: number;
  noise: number;
  gravity: number;
  swirl: number;
  energy: number;
  intro: number;
  reduced: number;
  pointer: Vector3;
  pointerVel: Vector3;
  pointerActive: number;
  press: number;
  shock: Vector4;
  voidRect: Vector4;
  voidStrength: number;
}

export function createSimParams(): SimParams {
  return {
    time: 0,
    delta: 0,
    mix: 0,
    xformA: new Vector4(0, 0, 0, 1),
    xformB: new Vector4(0, 0, 0, 1),
    rotA: new Vector2(),
    rotB: new Vector2(),
    spring: 1,
    damping: 0.9,
    noise: 0,
    gravity: 0,
    swirl: 0,
    energy: 1,
    intro: 0,
    reduced: 0,
    pointer: new Vector3(999, 999, 0),
    pointerVel: new Vector3(),
    pointerActive: 0,
    press: 0,
    shock: new Vector4(0, 0, 0, -1),
    voidRect: new Vector4(0, 0, 1, 1),
    voidStrength: 0
  };
}

export interface Simulation {
  readonly size: number;
  readonly positions: Texture;
  readonly velocities: Texture;
  setTargets(a: DataTexture, b: DataTexture): void;
  step(params: SimParams): void;
  dispose(): void;
}

export function createDataTexture(data: Float32Array, size: number) {
  const tex = new DataTexture(data, size, size, RGBAFormat, FloatType);
  tex.minFilter = NearestFilter;
  tex.magFilter = NearestFilter;
  tex.needsUpdate = true;
  return tex;
}

/** Particles begin on a wide shell far outside the frame and are pulled in during the intro. */
export function seedPositions(size: number) {
  const data = new Float32Array(size * size * 4);
  for (let i = 0; i < size * size; i++) {
    const u = (i % size) / size;
    const v = Math.floor(i / size) / size;
    const a = hash2(u * 91.7, v * 13.1) * Math.PI * 2;
    const r = 9 + hash2(v * 41.3, u * 7.7) * 7;
    data[i * 4] = Math.cos(a) * r;
    data[i * 4 + 1] = Math.sin(a) * r * 0.6;
    data[i * 4 + 2] = -2 - hash2(u + 3.1, v + 1.7) * 6;
  }
  return data;
}

export class GpuSimulation implements Simulation {
  private gpu: GPUComputationRenderer;
  private pos: Variable;
  private vel: Variable;
  private uniforms: Record<string, IUniform>;

  private constructor(readonly size: number, renderer: WebGLRenderer, half: boolean) {
    this.gpu = new GPUComputationRenderer(size, size, renderer);
    if (half) this.gpu.setDataType(HalfFloatType);
    const p0 = this.gpu.createTexture();
    (p0.image.data as Float32Array).set(seedPositions(size));
    const v0 = this.gpu.createTexture();
    this.pos = this.gpu.addVariable("texturePosition", positionShader, p0);
    this.vel = this.gpu.addVariable("textureVelocity", velocityShader, v0);
    this.gpu.setVariableDependencies(this.pos, [this.pos, this.vel]);
    this.gpu.setVariableDependencies(this.vel, [this.pos, this.vel]);

    const p = createSimParams();
    // One shared uniform table; both passes read the same objects.
    this.uniforms = {
      tTargetA: { value: null },
      tTargetB: { value: null },
      uXformA: { value: p.xformA },
      uXformB: { value: p.xformB },
      uRotA: { value: p.rotA },
      uRotB: { value: p.rotB },
      uMix: { value: 0 },
      uDelta: { value: 0 },
      uTime: { value: 0 },
      uSpring: { value: 1 },
      uDamping: { value: 0.9 },
      uNoise: { value: 0 },
      uGravity: { value: 0 },
      uSwirl: { value: 0 },
      uEnergy: { value: 1 },
      uIntro: { value: 0 },
      uReduced: { value: 0 },
      uPointer: { value: p.pointer },
      uPointerVel: { value: p.pointerVel },
      uPointerActive: { value: 0 },
      uPress: { value: 0 },
      uShock: { value: p.shock },
      uVoid: { value: p.voidRect },
      uVoidStrength: { value: 0 }
    };
    Object.assign(this.pos.material.uniforms, this.uniforms);
    Object.assign(this.vel.material.uniforms, this.uniforms);
  }

  /** Returns null when the device cannot render to float targets. */
  static tryCreate(renderer: WebGLRenderer, size: number): GpuSimulation | null {
    const ext = renderer.extensions;
    const full = ext.has("EXT_color_buffer_float");
    const half = !full && ext.has("EXT_color_buffer_half_float");
    if (!full && !half) return null;
    if (renderer.capabilities.maxVertexTextures < 2) return null;
    const sim = new GpuSimulation(size, renderer, half);
    const error = sim.gpu.init();
    if (error) {
      sim.dispose();
      return null;
    }
    return sim;
  }

  get positions() {
    return this.gpu.getCurrentRenderTarget(this.pos).texture;
  }

  get velocities() {
    return this.gpu.getCurrentRenderTarget(this.vel).texture;
  }

  setTargets(a: DataTexture, b: DataTexture) {
    this.uniforms.tTargetA.value = a;
    this.uniforms.tTargetB.value = b;
  }

  step(p: SimParams) {
    const u = this.uniforms;
    u.uXformA.value.copy(p.xformA);
    u.uXformB.value.copy(p.xformB);
    u.uRotA.value.copy(p.rotA);
    u.uRotB.value.copy(p.rotB);
    u.uPointer.value.copy(p.pointer);
    u.uPointerVel.value.copy(p.pointerVel);
    u.uShock.value.copy(p.shock);
    u.uVoid.value.copy(p.voidRect);
    u.uMix.value = p.mix;
    u.uDelta.value = p.delta;
    u.uTime.value = p.time;
    u.uSpring.value = p.spring;
    u.uDamping.value = p.damping;
    u.uNoise.value = p.noise;
    u.uGravity.value = p.gravity;
    u.uSwirl.value = p.swirl;
    u.uEnergy.value = p.energy;
    u.uIntro.value = p.intro;
    u.uReduced.value = p.reduced;
    u.uPointerActive.value = p.pointerActive;
    u.uPress.value = p.press;
    u.uVoidStrength.value = p.voidStrength;
    this.gpu.compute();
  }

  dispose() {
    this.gpu.dispose();
  }
}

/**
 * Fallback for devices without float render targets: the same physics on the CPU
 * with fewer particles, uploaded as data textures so rendering stays identical.
 */
export class CpuSimulation implements Simulation {
  readonly positions: DataTexture;
  readonly velocities: DataTexture;
  private pos: Float32Array;
  private vel: Float32Array;
  private seeds: Float32Array;
  private a: Float32Array | null = null;
  private b: Float32Array | null = null;

  constructor(readonly size: number) {
    const n = size * size;
    this.pos = seedPositions(size);
    this.vel = new Float32Array(n * 4);
    this.seeds = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      this.seeds[i] = hash2(((i % size) + 0.5) / size, (Math.floor(i / size) + 0.5) / size);
    }
    this.positions = createDataTexture(this.pos, size);
    this.velocities = createDataTexture(this.vel, size);
  }

  setTargets(a: DataTexture, b: DataTexture) {
    this.a = a.image.data as Float32Array;
    this.b = b.image.data as Float32Array;
  }

  step(p: SimParams) {
    const { a, b, pos, vel, seeds } = this;
    if (!a || !b) return;
    const dt = p.delta;
    const dampF = Math.pow(p.damping, dt * 60);
    const [caA, saA, ctA, stA] = [Math.cos(p.rotA.x), Math.sin(p.rotA.x), Math.cos(p.rotA.y), Math.sin(p.rotA.y)];
    const [caB, saB, ctB, stB] = [Math.cos(p.rotB.x), Math.sin(p.rotB.x), Math.cos(p.rotB.y), Math.sin(p.rotB.y)];
    const cx = p.xformA.x + (p.xformB.x - p.xformA.x) * p.mix;
    const cz = p.xformA.z + (p.xformB.z - p.xformA.z) * p.mix;
    const speed = Math.hypot(p.pointerVel.x, p.pointerVel.y);
    const slow = 1 - smooth(0.5, 4, speed);
    const fast = smooth(0.3, 6, speed) * (1 - p.reduced * 0.85);
    const t = p.time;

    for (let i = 0, n = seeds.length; i < n; i++) {
      const k = i * 4;
      const seed = seeds[i];
      // target (orient + xform), mixed with a per-particle schedule
      let x = a[k], y = a[k + 1], z = a[k + 2];
      let rx = caA * x + saA * z, rz = -saA * x + caA * z;
      const tax = rx * p.xformA.w + p.xformA.x;
      const tay = (ctA * y - stA * rz) * p.xformA.w + p.xformA.y;
      const taz = (stA * y + ctA * rz) * p.xformA.w + p.xformA.z;
      x = b[k]; y = b[k + 1]; z = b[k + 2];
      rx = caB * x + saB * z; rz = -saB * x + caB * z;
      const tbx = rx * p.xformB.w + p.xformB.x;
      const tby = (ctB * y - stB * rz) * p.xformB.w + p.xformB.y;
      const tbz = (stB * y + ctB * rz) * p.xformB.w + p.xformB.z;
      const m = smooth(seed * 0.4, 0.6 + seed * 0.4, p.mix);
      const tw = a[k + 3] + (b[k + 3] - a[k + 3]) * m;

      const px = pos[k], py = pos[k + 1], pz = pos[k + 2];
      const spring = p.spring * (0.55 + 0.9 * seed) * p.intro;
      let ax = (tax + (tbx - tax) * m - px) * spring;
      let ay = (tay + (tby - tay) * m - py) * spring;
      let az = (taz + (tbz - taz) * m - pz) * spring;

      const fx = px * 0.45 + seed * 2, fy = py * 0.45 + seed * 2, fz = pz * 0.45 + seed * 2;
      const ft = t * 0.35 + seed * 6.2831;
      ax += (Math.sin(fy * 1.3 + ft) + Math.sin(fz * 0.7 - ft * 0.6)) * 0.5 * p.noise;
      ay += (Math.sin(fz * 1.1 + ft * 0.8) + Math.sin(fx * 0.9 + ft * 0.4)) * 0.5 * p.noise;
      az += (Math.sin(fx * 1.2 - ft * 0.7) + Math.sin(fy * 0.8 + ft * 0.5)) * 0.5 * p.noise;
      ay -= p.gravity * (0.4 + seed);
      ax += -(pz - cz) * p.swirl;
      az += (px - cx) * p.swirl;

      const dx = p.pointer.x - px, dy = p.pointer.y - py;
      const dist = Math.hypot(dx, dy) + 1e-4;
      const ux = dx / dist, uy = dy / dist;
      const near = Math.exp(-dist * dist * 0.9);
      const pull = slow * Math.exp(-dist * dist * 0.55) * 2.4 * p.pointerActive * p.energy;
      ax += ux * pull;
      ay += uy * pull;
      const shove = fast * near * p.pointerActive * p.energy;
      ax += (p.pointerVel.x * 1.6 - ux * speed * 2.2) * shove;
      ay += (p.pointerVel.y * 1.6 - uy * speed * 2.2) * shove;
      az += (seed - 0.5) * fast * near * speed * 3 * p.pointerActive;
      const well = Math.exp(-dist * 0.45) * p.press;
      ax += (ux * 16 - uy * 5 * near) * well;
      ay += (uy * 16 + ux * 5 * near) * well;

      if (p.shock.w >= 0) {
        const sx = px - p.shock.x, sy = py - p.shock.y, sz = pz - p.shock.z;
        const sl = Math.hypot(sx, sy, sz) + 1e-4;
        const ring = Math.exp(-Math.pow(sl - p.shock.w * 7, 2) * 1.5) * Math.exp(-p.shock.w * 1.6) * 60 * (1 - p.reduced * 0.8);
        ax += (sx / sl) * ring;
        ay += (sy / sl) * ring;
        az += (sz / sl) * ring;
      }

      const qx = (px - p.voidRect.x) / p.voidRect.z, qy = (py - p.voidRect.y) / p.voidRect.w;
      const ql = Math.hypot(qx, qy);
      if (ql < 1) {
        const f = ((1 - ql) * p.voidStrength * 30) / (ql + 1e-4);
        ax += qx * f;
        ay += qy * f;
      }

      let vx = (vel[k] + ax * dt) * dampF;
      let vy = (vel[k + 1] + ay * dt) * dampF;
      let vz = (vel[k + 2] + az * dt) * dampF;
      const vs = Math.hypot(vx, vy, vz);
      if (vs > 18) {
        vx *= 18 / vs;
        vy *= 18 / vs;
        vz *= 18 / vs;
      }
      vel[k] = vx;
      vel[k + 1] = vy;
      vel[k + 2] = vz;
      pos[k] = px + vx * dt;
      pos[k + 1] = py + vy * dt;
      pos[k + 2] = pz + vz * dt;
      pos[k + 3] += (tw - pos[k + 3]) * (1 - Math.exp(-dt * 2.5));
    }
    this.positions.needsUpdate = true;
    this.velocities.needsUpdate = true;
  }

  dispose() {
    this.positions.dispose();
    this.velocities.dispose();
  }
}

function smooth(e0: number, e1: number, x: number) {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
}
