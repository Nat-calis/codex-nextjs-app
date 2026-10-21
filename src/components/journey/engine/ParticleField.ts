import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  Points,
  ShaderMaterial,
  Vector3,
  type DataTexture,
  type Scene,
  type WebGLRenderer
} from "three";
import { pointsFragment, pointsVertex } from "./shaders";
import { CpuSimulation, GpuSimulation, createDataTexture, type SimParams, type Simulation } from "./simulation";

export interface RenderParams {
  time: number;
  size: number;
  scale: number;
  cold: number;
  dim: number;
  intro: number;
  pointer: Vector3;
  pointerActive: number;
  press: number;
}

/** The visible particle system: a simulation backend plus the points that draw it. */
export class ParticleField {
  readonly sim: Simulation;
  readonly backend: "gpu" | "cpu";
  private geometry: BufferGeometry;
  private material: ShaderMaterial;
  private points: Points;
  private targets: DataTexture[] = [];

  constructor(private scene: Scene, renderer: WebGLRenderer, gpuSize: number, cpuSize: number) {
    const gpu = GpuSimulation.tryCreate(renderer, gpuSize);
    this.sim = gpu ?? new CpuSimulation(cpuSize);
    this.backend = gpu ? "gpu" : "cpu";

    const size = this.sim.size;
    const refs = new Float32Array(size * size * 2);
    for (let i = 0; i < size * size; i++) {
      refs[i * 2] = ((i % size) + 0.5) / size;
      refs[i * 2 + 1] = (Math.floor(i / size) + 0.5) / size;
    }
    this.geometry = new BufferGeometry();
    // `position` is unused by the shader but three needs it to size the draw call.
    this.geometry.setAttribute("position", new BufferAttribute(new Float32Array(size * size * 3), 3));
    this.geometry.setAttribute("ref", new BufferAttribute(refs, 2));

    this.material = new ShaderMaterial({
      vertexShader: pointsVertex,
      fragmentShader: pointsFragment,
      uniforms: {
        tPos: { value: null },
        tVel: { value: null },
        uPointer: { value: new Vector3() },
        uPointerActive: { value: 0 },
        uPress: { value: 0 },
        uTime: { value: 0 },
        uSize: { value: 1 },
        uScale: { value: 1 },
        uCold: { value: 0 },
        uDim: { value: 1 },
        uIntro: { value: 0 }
      },
      transparent: true,
      depthWrite: false,
      depthTest: false,
      blending: AdditiveBlending,
      premultipliedAlpha: true
    });
    this.points = new Points(this.geometry, this.material);
    this.points.frustumCulled = false;
    scene.add(this.points);
  }

  get count() {
    return this.sim.size * this.sim.size;
  }

  addTarget(points: Float32Array) {
    const tex = createDataTexture(points, this.sim.size);
    this.targets.push(tex);
    return this.targets.length - 1;
  }

  setTargets(a: number, b: number) {
    this.sim.setTargets(this.targets[a], this.targets[b]);
  }

  update(sim: SimParams, view: RenderParams) {
    this.sim.step(sim);
    const u = this.material.uniforms;
    u.tPos.value = this.sim.positions;
    u.tVel.value = this.sim.velocities;
    u.uPointer.value.copy(view.pointer);
    u.uPointerActive.value = view.pointerActive;
    u.uPress.value = view.press;
    u.uTime.value = view.time;
    u.uSize.value = view.size;
    u.uScale.value = view.scale;
    u.uCold.value = view.cold;
    u.uDim.value = view.dim;
    u.uIntro.value = view.intro;
  }

  dispose() {
    this.scene.remove(this.points);
    this.geometry.dispose();
    this.material.dispose();
    this.targets.forEach((t) => t.dispose());
    this.targets = [];
    this.sim.dispose();
  }
}
