import { Vector3 } from "three";
import { damp } from "./math";
import type { Stage } from "./Stage";

export interface PointerRelease {
  strength: number;
  world: Vector3;
}

/**
 * Raw pointer input turned into physical quantities. Velocity is derived from frame
 * deltas (not event timing) so behaviour is identical in live use and recordings.
 */
export class PointerController {
  screen = { x: 0, y: 0 };
  world = new Vector3(999, 999, 0);
  velocity = new Vector3();
  /** 0..1, fades in while the pointer is over the page. */
  active = 0;
  /** 0..1, charges while the button is held. */
  press = 0;
  isDown = false;
  isTouch = false;
  hasMoved = false;

  private inside = false;
  private downAt = 0;
  private clock = 0;
  private prevWorld = new Vector3();
  private sampleWorld = new Vector3();
  private pendingRelease: PointerRelease | null = null;
  private disposers: (() => void)[] = [];

  constructor(target: Window) {
    const on = <K extends keyof WindowEventMap>(type: K, fn: (e: WindowEventMap[K]) => void) => {
      target.addEventListener(type, fn as EventListener, { passive: true });
      this.disposers.push(() => target.removeEventListener(type, fn as EventListener));
    };
    on("pointermove", (e) => {
      this.isTouch = e.pointerType === "touch";
      this.screen.x = e.clientX;
      this.screen.y = e.clientY;
      this.inside = !this.isTouch || this.isDown;
      this.hasMoved = true;
    });
    on("pointerdown", (e) => {
      this.isTouch = e.pointerType === "touch";
      this.screen.x = e.clientX;
      this.screen.y = e.clientY;
      this.isDown = true;
      this.inside = true;
      this.hasMoved = true;
      this.downAt = this.clock;
    });
    const up = () => {
      if (!this.isDown) return;
      this.isDown = false;
      const held = this.clock - this.downAt;
      // A tap gives a small pulse; a long hold releases what it gathered.
      const strength = this.press > 0.15 ? this.press : held < 0.25 ? 0.35 : 0;
      if (strength > 0) this.pendingRelease = { strength, world: this.world.clone() };
      if (this.isTouch) this.inside = false;
    };
    on("pointerup", up);
    on("pointercancel", up);
    on("blur", () => {
      this.inside = false;
      this.isDown = false;
    });
    const leave = (e: MouseEvent) => {
      if (!e.relatedTarget) this.inside = false;
    };
    document.addEventListener("mouseout", leave);
    this.disposers.push(() => document.removeEventListener("mouseout", leave));
  }

  /** Consumes the release that happened since the last frame, if any. */
  takeRelease() {
    const r = this.pendingRelease;
    this.pendingRelease = null;
    return r;
  }

  update(dt: number, stage: Stage, reduced: boolean) {
    this.clock += dt;
    stage.screenToWorld(this.screen.x, this.screen.y, this.sampleWorld);
    // Light smoothing removes mouse jitter without adding perceptible lag.
    this.world.x = damp(this.world.x, this.sampleWorld.x, 28, dt);
    this.world.y = damp(this.world.y, this.sampleWorld.y, 28, dt);
    if (!this.hasMoved) this.world.copy(this.sampleWorld);

    const vx = (this.world.x - this.prevWorld.x) / Math.max(dt, 1e-3);
    const vy = (this.world.y - this.prevWorld.y) / Math.max(dt, 1e-3);
    const valid = this.active > 0.01;
    this.velocity.x = damp(this.velocity.x, valid ? vx : 0, 14, dt);
    this.velocity.y = damp(this.velocity.y, valid ? vy : 0, 14, dt);
    this.prevWorld.copy(this.world);

    this.active = damp(this.active, this.inside && this.hasMoved ? 1 : 0, 6, dt);
    const charging = this.isDown && this.clock - this.downAt > 0.18;
    const target = charging ? 1 : 0;
    this.press = damp(this.press, target, charging ? (reduced ? 4 : 1.6) : 10, dt);
  }

  dispose() {
    this.disposers.forEach((d) => d());
    this.disposers = [];
  }
}
