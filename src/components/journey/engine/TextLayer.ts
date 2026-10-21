import { clamp, easeOutCubic, smoothstep } from "./math";

export interface TextFrame {
  /** Chapter whose headline is most visible, and how visible it is. */
  active: number;
  visibility: number;
  /** Headline bounds in viewport pixels (only meaningful when visibility > 0). */
  rect: { x: number; y: number; w: number; h: number };
}

interface Entry {
  root: HTMLElement;
  headline: HTMLElement;
  lines: HTMLElement[];
  shown: boolean;
}

/**
 * Drives the DOM headlines from the story position. Lines rise out of a blur
 * one after another and drift against the camera so they feel staged inside
 * the scene rather than pasted on top of it.
 */
export class TextLayer {
  private entries: Entry[];
  private frame: TextFrame = { active: 0, visibility: 0, rect: { x: 0, y: 0, w: 0, h: 0 } };

  constructor(chapters: HTMLElement[]) {
    this.entries = chapters.map((root) => ({
      root,
      headline: root.querySelector<HTMLElement>("[data-headline]") ?? root,
      lines: Array.from(root.querySelectorAll<HTMLElement>("[data-line]")),
      shown: true
    }));
  }

  update(position: number, intro: number, drift: { x: number; y: number }, reduced: boolean): TextFrame {
    const last = this.entries.length - 1;
    let best = -1;
    let bestVis = 0;
    const vis = this.entries.map((_, j) => {
      const d = position - j;
      const enter = j === 0 ? 1 : smoothstep(-0.27, -0.04, d);
      const exit = j === last ? 1 : 1 - smoothstep(0.28, 0.48, d);
      const v = enter * exit * intro;
      if (v > bestVis) {
        bestVis = v;
        best = j;
      }
      return v;
    });

    // Read layout before any style writes to avoid forced reflows.
    if (best >= 0) {
      const r = this.entries[best].headline.getBoundingClientRect();
      this.frame.rect = { x: r.left, y: r.top, w: r.width, h: r.height };
    }
    this.frame.active = Math.max(0, best);
    this.frame.visibility = bestVis;

    this.entries.forEach((entry, j) => {
      const v = vis[j];
      const visible = v > 0.001;
      if (visible !== entry.shown) {
        entry.root.style.visibility = visible ? "visible" : "hidden";
        entry.shown = visible;
      }
      if (!visible) return;
      const depth = reduced ? 0 : 1;
      entry.root.style.transform = `translate3d(${(-drift.x * 18 * depth).toFixed(2)}px, ${(drift.y * 12 * depth).toFixed(2)}px, 0)`;
      entry.lines.forEach((line, i) => {
        const lv = easeOutCubic(clamp(v * 1.35 - i * 0.13));
        const lift = (1 - lv) * (reduced ? 0 : 34);
        const blur = (1 - lv) * (reduced ? 0 : 9);
        line.style.opacity = lv.toFixed(3);
        line.style.transform = `translate3d(0, ${lift.toFixed(2)}px, 0)`;
        line.style.filter = blur > 0.05 ? `blur(${blur.toFixed(2)}px)` : "none";
      });
    });

    return this.frame;
  }
}
