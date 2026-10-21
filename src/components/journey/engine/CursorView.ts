import { Spring, clamp, damp } from "./math";

export interface CursorElements {
  dot: HTMLElement;
  ring: HTMLElement;
  progress: SVGCircleElement;
  label: HTMLElement;
}

export interface CursorState {
  x: number;
  y: number;
  visible: boolean;
  hover: number;
  press: number;
}

const CIRCUMFERENCE = 2 * Math.PI * 21;

/**
 * Custom cursor: an exact dot plus a trailing ring that swells over particles,
 * stretches with speed, and fills a progress arc while charging a hold.
 */
export class CursorView {
  private rx = new Spring(0);
  private ry = new Spring(0);
  private hover = 0;
  private opacity = 0;
  private labelOpacity = 0;
  private placed = false;
  private releases = 0;

  constructor(private el: CursorElements) {
    el.progress.style.strokeDasharray = `${CIRCUMFERENCE}`;
  }

  /** Called when a gathered hold is released; the hint retires after the visitor gets it. */
  noteRelease() {
    this.releases++;
  }

  update(dt: number, s: CursorState) {
    if (!this.placed && s.visible) {
      this.rx.value = s.x;
      this.ry.value = s.y;
      this.placed = true;
    }
    const x = this.rx.update(s.x, 0.11, dt);
    const y = this.ry.update(s.y, 0.11, dt);
    const vx = this.rx.velocity;
    const vy = this.ry.velocity;
    const speed = Math.hypot(vx, vy);
    const stretch = clamp(speed / 2600, 0, 0.55);
    const angle = Math.atan2(vy, vx);

    this.hover = damp(this.hover, s.hover, 10, dt);
    this.opacity = damp(this.opacity, s.visible ? 1 : 0, 8, dt);
    const scale = 1 + this.hover * 0.9 - s.press * 0.45;

    const { dot, ring, progress, label } = this.el;
    dot.style.opacity = this.opacity.toFixed(3);
    dot.style.transform = `translate3d(${s.x}px, ${s.y}px, 0) scale(${1 - this.hover * 0.4 + s.press * 0.8})`;
    ring.style.opacity = this.opacity.toFixed(3);
    ring.style.transform =
      `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0) rotate(${angle}rad) ` +
      `scale(${(scale * (1 + stretch)).toFixed(3)}, ${(scale * (1 - stretch * 0.5)).toFixed(3)})`;
    ring.style.setProperty("--hover", this.hover.toFixed(3));
    progress.style.strokeDashoffset = `${(1 - s.press) * CIRCUMFERENCE}`;

    const wantLabel = this.releases < 2 && (this.hover > 0.55 || s.press > 0.05) ? 1 : 0;
    this.labelOpacity = damp(this.labelOpacity, wantLabel * this.opacity, 6, dt);
    label.style.opacity = this.labelOpacity.toFixed(3);
    label.style.transform = `translate3d(${(x + 34).toFixed(1)}px, ${(y + 18).toFixed(1)}px, 0)`;
    const text = s.press > 0.05 ? "release" : "hold";
    if (label.textContent !== text) label.textContent = text;
  }
}
