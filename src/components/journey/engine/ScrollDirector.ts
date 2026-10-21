import { Spring, clamp } from "./math";

/**
 * Maps native page scroll to a continuous chapter position (0 .. count-1)
 * and adds inertia so the story eases between beats instead of jumping.
 */
export class ScrollDirector {
  private spring = new Spring(0);
  private target = 0;
  private manual: number | null = null;
  private onScroll = () => this.read();

  constructor(private count: number) {
    window.addEventListener("scroll", this.onScroll, { passive: true });
    window.addEventListener("resize", this.onScroll, { passive: true });
    this.read();
  }

  /** Chapter position, e.g. 3.4 = 40% of the way from chapter 3 to 4. */
  get value() {
    return this.spring.value;
  }

  get velocity() {
    return this.spring.velocity;
  }

  /** Drive the story directly (used by the recorder); null returns control to the page. */
  setManual(position: number | null) {
    this.manual = position;
  }

  private read() {
    const max = document.documentElement.scrollHeight - window.innerHeight;
    this.target = max > 0 ? clamp(window.scrollY / max) * (this.count - 1) : 0;
  }

  update(dt: number, reduced: boolean) {
    const target = this.manual ?? this.target;
    this.spring.update(target, reduced ? 0.12 : 0.55, dt);
    this.spring.value = clamp(this.spring.value, 0, this.count - 1);
  }

  dispose() {
    window.removeEventListener("scroll", this.onScroll);
    window.removeEventListener("resize", this.onScroll);
  }
}
