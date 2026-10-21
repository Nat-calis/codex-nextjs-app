import { Vector3, type PerspectiveCamera } from "three";
import type { CameraPose } from "../content";
import { Spring } from "./math";

/**
 * Cinematic camera: every axis rides its own critically damped spring, so story
 * beats glide in with momentum and never cut. A touch of pointer parallax keeps
 * the frame alive without competing with the particles.
 */
export class CameraRig {
  private x = new Spring(0);
  private y = new Spring(0);
  private z = new Spring(14);
  private roll = new Spring(0);
  private lookX = new Spring(0);
  private lookY = new Spring(0);
  private look = new Vector3();

  constructor(private camera: PerspectiveCamera) {}

  update(dt: number, pose: CameraPose, focus: { x: number; y: number }, parallax: { x: number; y: number }, fit: number) {
    const smooth = 0.9;
    this.x.update(pose.x + parallax.x * 0.35, smooth, dt);
    this.y.update(pose.y + parallax.y * 0.25, smooth, dt);
    this.z.update(pose.z * fit, 1.2, dt);
    this.roll.update(pose.roll, 1.4, dt);
    this.lookX.update(focus.x * 0.22, 1.1, dt);
    this.lookY.update(focus.y * 0.22, 1.1, dt);

    this.camera.position.set(this.x.value, this.y.value, this.z.value);
    this.look.set(this.lookX.value, this.lookY.value, 0);
    this.camera.up.set(Math.sin(this.roll.value), Math.cos(this.roll.value), 0);
    this.camera.lookAt(this.look);
    this.camera.updateMatrixWorld();
  }
}
