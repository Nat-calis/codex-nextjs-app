import { Color, PerspectiveCamera, Plane, Raycaster, Scene, Vector2, Vector3, WebGLRenderer } from "three";

export interface StageOptions {
  maxPixelRatio: number;
  preserveDrawingBuffer?: boolean;
}

/** Owns the renderer, scene and camera, and keeps them sized to the host element. */
export class Stage {
  readonly renderer: WebGLRenderer;
  readonly scene = new Scene();
  readonly camera = new PerspectiveCamera(35, 1, 0.1, 100);
  width = 1;
  height = 1;
  pixelRatio = 1;

  private observer: ResizeObserver;
  private listeners = new Set<(stage: Stage) => void>();
  private raycaster = new Raycaster();
  private plane = new Plane(new Vector3(0, 0, 1), 0);
  private ndc = new Vector2();

  constructor(private host: HTMLElement, private options: StageOptions) {
    this.renderer = new WebGLRenderer({
      antialias: false,
      alpha: false,
      powerPreference: "high-performance",
      preserveDrawingBuffer: options.preserveDrawingBuffer ?? false
    });
    this.renderer.setClearColor(new Color("#020203"), 1);
    this.renderer.domElement.setAttribute("aria-hidden", "true");
    host.appendChild(this.renderer.domElement);
    this.camera.position.set(0, 0, 9);
    this.observer = new ResizeObserver(() => this.resize());
    this.observer.observe(host);
    this.resize();
  }

  get aspect() {
    return this.width / this.height;
  }

  onResize(listener: (stage: Stage) => void) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  resize() {
    const rect = this.host.getBoundingClientRect();
    this.width = Math.max(1, Math.round(rect.width));
    this.height = Math.max(1, Math.round(rect.height));
    this.pixelRatio = Math.min(window.devicePixelRatio || 1, this.options.maxPixelRatio);
    this.renderer.setPixelRatio(this.pixelRatio);
    this.renderer.setSize(this.width, this.height, false);
    this.camera.aspect = this.aspect;
    this.camera.updateProjectionMatrix();
    this.listeners.forEach((listener) => listener(this));
  }

  /** Projects a viewport pixel onto the z = 0 plane where the story is staged. */
  screenToWorld(x: number, y: number, out: Vector3) {
    this.ndc.set((x / this.width) * 2 - 1, -(y / this.height) * 2 + 1);
    this.raycaster.setFromCamera(this.ndc, this.camera);
    return this.raycaster.ray.intersectPlane(this.plane, out) ?? out.set(0, 0, 0);
  }

  render() {
    this.renderer.render(this.scene, this.camera);
  }

  dispose() {
    this.observer.disconnect();
    this.listeners.clear();
    this.renderer.dispose();
    this.renderer.forceContextLoss();
    this.renderer.domElement.remove();
  }
}
