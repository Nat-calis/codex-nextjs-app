import { Vector3, Vector4, Vector2 } from "three";
import { chapters, type Behavior, type CameraPose, type Chapter } from "../content";
import { CameraRig } from "./CameraRig";
import { CursorView, type CursorElements } from "./CursorView";
import { Spring, clamp, easeInOutCubic, easeOutCubic, lerp, smoothstep } from "./math";
import { ParticleField } from "./ParticleField";
import { PointerController } from "./PointerController";
import { ScrollDirector } from "./ScrollDirector";
import { buildShape, hitTest, type ShapeData } from "./shapes";
import { createSimParams } from "./simulation";
import { SoundBus } from "./SoundBus";
import { Stage } from "./Stage";
import { TextLayer } from "./TextLayer";

export interface ExperienceDom {
  root: HTMLElement;
  host: HTMLElement;
  chapters: HTMLElement[];
  cursor: CursorElements;
  loader: { root: HTMLElement; count: HTMLElement; bar: HTMLElement };
  hud: { root: HTMLElement; index: HTMLElement; bar: HTMLElement };
}

export interface ExperienceOptions {
  /** Manual clock for frame-accurate recording; disables the rAF loop. */
  capture?: boolean;
  coarsePointer: boolean;
}

interface Layout {
  stacked: boolean;
  fit: number;
}

const DEFAULT_POSE: CameraPose = { x: 0, y: 0, z: 9, roll: 0 };
const BEHAVIOR_KEYS: (keyof Behavior)[] = ["spring", "damping", "noise", "gravity", "swirl", "energy", "cold", "size", "dim"];

const nextTask = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

/**
 * Orchestrates the story: scroll position picks two neighbouring chapters, and
 * everything else (shape morph, physics character, camera, type, cursor, sound)
 * is interpolated between them.
 */
export class Experience {
  readonly sound = new SoundBus();
  private stage: Stage;
  private field: ParticleField;
  private pointer: PointerController;
  private scroll: ScrollDirector;
  private rig: CameraRig;
  private text: TextLayer;
  private cursor: CursorView;

  private shapes: ShapeData[] = [];
  private targetIndex: number[] = [];
  private sim = createSimParams();
  private behavior: Behavior = { ...chapters[0].behavior };
  private pose: CameraPose = { ...DEFAULT_POSE };
  private layout: Layout = { stacked: false, fit: 1 };
  private reducedQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
  private reduced = this.reducedQuery.matches;

  private time = 0;
  private progress = 0;
  private shownProgress = new Spring(0);
  private readyAt = -1;
  private raf = 0;
  private last = 0;
  private lastActive = 0;
  private lastPosition = 0;
  private lastHoverSent = 0;
  private scatterCooldown = 0;
  private disposed = false;
  private tmp = new Vector3();
  private voidA = new Vector3();
  private voidB = new Vector3();
  private scratchXform = new Vector4();
  private scratchRot = new Vector2();

  /** Resolves once every shape is built and shaders are compiled. */
  readonly ready: Promise<void>;

  /** Throws when WebGL is unavailable so the caller can render the static fallback. */
  constructor(private dom: ExperienceDom, private options: ExperienceOptions) {
    this.stage = new Stage(dom.host, {
      maxPixelRatio: options.capture ? 1 : options.coarsePointer ? 1.5 : 2
    });
    const small = options.coarsePointer || Math.min(window.innerWidth, window.innerHeight) < 600;
    this.field = new ParticleField(this.stage.scene, this.stage.renderer, small ? 88 : 128, small ? 48 : 64);
    this.pointer = new PointerController(window);
    this.scroll = new ScrollDirector(chapters.length);
    this.rig = new CameraRig(this.stage.camera);
    this.text = new TextLayer(dom.chapters);
    this.cursor = new CursorView(dom.cursor);
    this.stage.onResize(() => this.updateLayout());
    this.updateLayout();
    this.reducedQuery.addEventListener("change", this.onReducedChange);
    dom.root.dataset.backend = this.field.backend;
    if (!options.capture) {
      this.last = performance.now();
      this.raf = requestAnimationFrame(this.loop);
    }
    this.ready = this.load();
  }

  get particleCount() {
    return this.field.count;
  }

  private async load() {
    this.progress = 0.08;
    await Promise.race([document.fonts?.ready, new Promise((r) => setTimeout(r, 1500))]);
    this.progress = 0.15;

    const cache = new Map<string, number>();
    for (let i = 0; i < chapters.length; i++) {
      const ch = chapters[i];
      let index = cache.get(ch.shape);
      if (index === undefined) {
        const shape = buildShape(ch.shape, this.field.count, {
          angle: ch.placement?.angle ?? 0,
          tilt: ch.placement?.tilt ?? 0
        });
        index = this.field.addTarget(shape.points);
        this.shapes[index] = shape;
        cache.set(ch.shape, index);
        await nextTask();
        if (this.disposed) return;
      }
      this.targetIndex[i] = index;
      this.progress = 0.15 + (0.75 * (i + 1)) / chapters.length;
    }
    this.field.setTargets(this.targetIndex[0], this.targetIndex[1]);
    this.stage.renderer.compile(this.stage.scene, this.stage.camera);
    this.progress = 1;
  }

  private onReducedChange = () => {
    this.reduced = this.reducedQuery.matches;
  };

  private loop = (now: number) => {
    const dt = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;
    this.advance(dt);
    this.raf = requestAnimationFrame(this.loop);
  };

  /** Recorder hooks. */
  setStoryPosition(position: number | null) {
    this.scroll.setManual(position);
  }

  advance(dt: number) {
    if (this.disposed) return;
    this.time += dt;
    const reduced = this.reduced;

    // Loading sequence: the counter eases toward real progress, then hands over to the intro.
    const shown = this.shownProgress.update(this.progress, 0.35, dt);
    if (this.readyAt < 0 && this.progress >= 1 && shown > 0.995) this.readyAt = this.time;
    const since = this.readyAt < 0 ? -1 : this.time - this.readyAt;
    const loaderOut = since < 0 ? 0 : smoothstep(0, reduced ? 0.3 : 1.0, since);
    const intro = since < 0 ? 0 : reduced ? smoothstep(0, 0.6, since) : easeOutCubic(clamp((since - 0.25) / 2.8));
    this.renderLoader(shown, loaderOut);
    if (this.targetIndex.length < chapters.length) {
      this.stage.render();
      return;
    }

    this.scroll.update(dt, reduced);
    const f = this.scroll.value;
    const n = chapters.length;
    const a = Math.min(Math.floor(f), n - 2);
    const frac = f - a;
    const mix = easeInOutCubic(clamp((frac - 0.35) / 0.5));
    const chA = chapters[a];
    const chB = chapters[a + 1];

    this.blendBehavior(chA, chB, mix, Math.abs(this.scroll.velocity));
    this.blendPose(chA, chB, mix);

    this.pointer.update(dt, this.stage, reduced);
    const sim = this.sim;
    sim.time = this.time;
    sim.delta = this.readyAt < 0 ? 0 : dt;
    sim.mix = mix;
    sim.intro = intro;
    sim.reduced = reduced ? 1 : 0;
    this.placeShape(a, sim.xformA, sim.rotA);
    this.placeShape(a + 1, sim.xformB, sim.rotB);
    this.field.setTargets(this.targetIndex[a], this.targetIndex[a + 1]);

    const p = this.pointer;
    const pointerOn = p.active * intro;
    sim.pointer.copy(p.world);
    sim.pointerVel.copy(p.velocity);
    sim.pointerActive = pointerOn;
    sim.press = p.press * intro;

    const release = p.takeRelease();
    if (release && intro > 0.5) {
      this.shock(release.world);
      this.sound.emit("release", { strength: release.strength });
      if (release.strength > 0.5) this.cursor.noteRelease();
    }
    if (sim.shock.w >= 0) {
      sim.shock.w += dt;
      if (sim.shock.w > 2.5) sim.shock.w = -1;
    }

    // Typography: lines reveal from the story position and drift against the camera.
    const drift = { x: this.stage.camera.position.x - this.pose.x, y: this.stage.camera.position.y - this.pose.y };
    const frame = this.text.update(f, smoothstep(0.35, 1, intro), drift, reduced);
    this.updateVoid(frame.rect, frame.visibility);
    this.handleChapterChange(frame.active);
    this.handleBeats(f);

    const hover = this.hover(a, mix) * pointerOn;
    this.field.update(sim, {
      time: this.time,
      size: this.behavior.size * (this.layout.stacked ? 0.85 : 1),
      scale: 30 * this.stage.pixelRatio * (this.stage.height / 900),
      cold: this.behavior.cold,
      dim: this.behavior.dim,
      intro,
      pointer: p.world,
      pointerActive: pointerOn,
      press: sim.press
    });

    const parallax = reduced ? { x: 0, y: 0 } : { x: (p.screen.x / this.stage.width - 0.5) * p.active, y: -(p.screen.y / this.stage.height - 0.5) * p.active };
    const focus = { x: lerp(sim.xformA.x, sim.xformB.x, mix), y: lerp(sim.xformA.y, sim.xformB.y, mix) };
    this.rig.update(dt, this.pose, focus, parallax, this.layout.fit);

    this.cursor.update(dt, {
      x: p.screen.x,
      y: p.screen.y,
      visible: (this.options.capture || !p.isTouch) && p.hasMoved && p.active > 0.05 && loaderOut > 0.5,
      hover,
      press: p.press
    });
    this.renderHud(f, intro);
    this.emitSound(hover, dt);

    this.stage.render();
  }

  private blendBehavior(a: Chapter, b: Chapter, mix: number, scrollSpeed: number) {
    for (const key of BEHAVIOR_KEYS) this.behavior[key] = lerp(a.behavior[key], b.behavior[key], mix);
    const s = this.sim;
    const calm = this.reduced ? 0.35 : 1;
    s.spring = this.behavior.spring;
    s.damping = this.behavior.damping;
    // Scrolling stirs the field: fast flicks make the particles restless.
    s.noise = (this.behavior.noise + Math.min(scrollSpeed, 3) * 0.35) * calm;
    s.gravity = this.behavior.gravity;
    s.swirl = this.behavior.swirl * calm;
    s.energy = this.behavior.energy;
  }

  private blendPose(a: Chapter, b: Chapter, mix: number) {
    const pa = { ...DEFAULT_POSE, ...a.camera };
    const pb = { ...DEFAULT_POSE, ...b.camera };
    const sx = this.layout.stacked ? 0.3 : 1;
    this.pose.x = lerp(pa.x, pb.x, mix) * sx;
    this.pose.y = lerp(pa.y, pb.y, mix);
    this.pose.z = lerp(pa.z, pb.z, mix);
    this.pose.roll = this.reduced ? 0 : lerp(pa.roll, pb.roll, mix);
  }

  private placeShape(index: number, xform: { set(x: number, y: number, z: number, w: number): unknown }, rot: { set(x: number, y: number): unknown }) {
    const ch = chapters[index];
    const pl = ch.placement ?? {};
    const side = ch.align === "left" ? 1 : ch.align === "right" ? -1 : 0;
    const motion = this.reduced ? 0.3 : 1;
    const angle = (pl.angle ?? 0) + (pl.spin ?? 0) * this.time * motion + (pl.sway ?? 0) * Math.sin(this.time * 0.35 + index) * motion;
    rot.set(angle, pl.tilt ?? 0);
    const aspect = this.stage.aspect;
    if (this.layout.stacked) {
      xform.set(0, 0.95 + (pl.y ?? 0) * 0.7, 0, 0.68 * (pl.scale ?? 1));
    } else {
      const spread = clamp(aspect / 1.78, 0.62, 1.2);
      const scale = clamp(aspect / 1.6, 0.72, 1) * (pl.scale ?? 1);
      xform.set(side * 2.45 * spread + (pl.x ?? 0), pl.y ?? 0, 0, scale);
    }
  }

  private updateLayout() {
    const aspect = this.stage.aspect;
    const stacked = aspect < 0.8;
    this.layout = { stacked, fit: stacked ? clamp(1 + (0.8 - aspect) * 1.1, 1, 1.6) : 1 };
    this.dom.root.dataset.layout = stacked ? "stacked" : "wide";
  }

  private updateVoid(rect: { x: number; y: number; w: number; h: number }, visibility: number) {
    const s = this.sim;
    if (visibility <= 0 || rect.w <= 0) {
      s.voidStrength = 0;
      return;
    }
    this.stage.screenToWorld(rect.x, rect.y, this.voidA);
    this.stage.screenToWorld(rect.x + rect.w, rect.y + rect.h, this.voidB);
    s.voidRect.set(
      (this.voidA.x + this.voidB.x) / 2,
      (this.voidA.y + this.voidB.y) / 2,
      Math.abs(this.voidB.x - this.voidA.x) * 0.58 + 0.3,
      Math.abs(this.voidB.y - this.voidA.y) * 0.62 + 0.35
    );
    s.voidStrength = visibility;
  }

  private hover(a: number, mix: number) {
    const w = this.pointer.world;
    const test = (index: number, xform: { x: number; y: number; w: number }) =>
      hitTest(this.shapes[this.targetIndex[index]], (w.x - xform.x) / xform.w, (w.y - xform.y) / xform.w);
    return lerp(test(a, this.sim.xformA), test(a + 1, this.sim.xformB), mix);
  }

  private shock(at: Vector3) {
    if (this.reduced) return;
    this.sim.shock.set(at.x, at.y, at.z, 0);
  }

  private handleChapterChange(active: number) {
    if (active === this.lastActive) return;
    this.sound.emit("chapter", { index: active, forward: active > this.lastActive });
    this.lastActive = active;
  }

  /** Story beats fire as the morph into their chapter begins, and only when moving forward. */
  private handleBeats(f: number) {
    const prev = this.lastPosition;
    this.lastPosition = f;
    if (this.readyAt < 0 || f <= prev) return;
    chapters.forEach((ch, j) => {
      const at = j - 0.62;
      if (!ch.onEnter || !(prev < at && f >= at)) return;
      // Both beats erupt from the previous shape: the climber's spot on the summit,
      // or the heart of the collapsed core.
      const x = this.scratchXform;
      this.placeShape(j - 1, x, this.scratchRot);
      const [ox, oy] = ch.onEnter === "shatter" ? [0.32, 0.8] : [0, 0];
      this.shock(this.tmp.set(x.x + ox * x.w, x.y + oy * x.w, 0));
      this.sound.emit("beat", { kind: ch.onEnter });
    });
  }

  private renderLoader(shown: number, out: number) {
    const { root, count, bar } = this.dom.loader;
    const pct = Math.round(shown * 100);
    const text = String(pct).padStart(3, "0");
    if (count.textContent !== text) count.textContent = text;
    bar.style.transform = `scaleX(${shown.toFixed(4)})`;
    root.style.opacity = (1 - out).toFixed(3);
    root.style.transform = `translate3d(0, ${(-out * 24).toFixed(2)}px, 0)`;
    const gone = out >= 0.999;
    if (gone !== (root.style.visibility === "hidden")) root.style.visibility = gone ? "hidden" : "visible";
  }

  private renderHud(f: number, intro: number) {
    const { root, index, bar } = this.dom.hud;
    const current = String(Math.round(f) + 1).padStart(2, "0");
    if (index.textContent !== current) index.textContent = current;
    bar.style.transform = `scaleY(${(f / (chapters.length - 1)).toFixed(4)})`;
    root.style.opacity = smoothstep(0.5, 1, intro).toFixed(3);
  }

  private emitSound(hover: number, dt: number) {
    if (Math.abs(hover - this.lastHoverSent) > 0.04) {
      this.lastHoverSent = hover;
      this.sound.emit("hover", { level: hover });
    }
    this.sound.emit("charge", { level: this.pointer.press });
    this.scatterCooldown = Math.max(0, this.scatterCooldown - dt);
    const speed = Math.hypot(this.pointer.velocity.x, this.pointer.velocity.y);
    if (speed > 8 && this.scatterCooldown === 0) {
      this.scatterCooldown = 0.35;
      this.sound.emit("scatter", { speed });
    }
  }

  dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    this.reducedQuery.removeEventListener("change", this.onReducedChange);
    this.sound.clear();
    this.pointer.dispose();
    this.scroll.dispose();
    this.field.dispose();
    this.stage.dispose();
  }
}

