import type { ShapeKey } from "./engine/shapes";

export type Align = "left" | "right" | "center";

/** Physical character of the particle field while a chapter is on screen. */
export interface Behavior {
  spring: number; // pull toward the chapter's shape
  damping: number; // velocity kept per 60fps frame
  noise: number; // ambient flow-field drift
  gravity: number; // positive pulls down, negative lifts
  swirl: number; // rotation around the shape's vertical axis
  energy: number; // how strongly the cursor can move particles
  cold: number; // 0 = gold, 1 = blue/violet
  size: number;
  dim: number;
}

export interface CameraPose {
  x: number;
  y: number;
  z: number;
  roll: number;
}

export interface ShapePlacement {
  /** Extra offset on top of the align-based side offset. */
  x?: number;
  y?: number;
  scale?: number;
  /** Starting yaw, constant yaw speed, yaw sway amplitude, tilt around X. */
  angle?: number;
  spin?: number;
  sway?: number;
  tilt?: number;
}

export type ChapterEvent = "shatter" | "bloom";

export interface Chapter {
  lines: string[];
  align: Align;
  shape: ShapeKey;
  behavior: Behavior;
  camera?: Partial<CameraPose>;
  placement?: ShapePlacement;
  onEnter?: ChapterEvent;
  variant?: "hero" | "quote" | "finale";
}

const base: Behavior = {
  spring: 8,
  damping: 0.91,
  noise: 0.35,
  gravity: 0,
  swirl: 0,
  energy: 1,
  cold: 0,
  size: 1,
  dim: 1
};

const b = (overrides: Partial<Behavior>): Behavior => ({ ...base, ...overrides });

export const chapters: Chapter[] = [
  {
    lines: ["A guy."],
    align: "center",
    shape: "drift",
    variant: "hero",
    behavior: b({ spring: 0.35, damping: 0.95, noise: 1.1, dim: 0.85 }),
    camera: { z: 9.5 }
  },
  {
    lines: ["Who had", "a dream."],
    align: "left",
    shape: "dreamer",
    behavior: b({ spring: 7, noise: 0.4 }),
    placement: { sway: 0.25 },
    camera: { x: 0.5, y: 0.2 }
  },
  {
    lines: ["He chased it,", "every single day."],
    align: "right",
    shape: "orbit",
    behavior: b({ spring: 6.5, noise: 0.3 }),
    placement: { spin: 0.9, tilt: 1.15 },
    camera: { x: -0.4, z: 8.6, roll: -0.02 }
  },
  {
    lines: ["He wanted", "to be free."],
    align: "left",
    shape: "wings",
    behavior: b({ spring: 6, noise: 0.6, gravity: -0.25 }),
    placement: { sway: 0.35, y: 0.2 },
    camera: { x: 0.5, y: -0.3, roll: 0.02 }
  },
  {
    lines: ["People", "doubted him."],
    align: "right",
    shape: "crowd",
    behavior: b({ spring: 7, noise: 0.45, cold: 0.15 }),
    placement: { sway: 0.55, y: -0.2 },
    camera: { x: -0.6, y: 1.4, z: 9.4 }
  },
  {
    lines: ["He got tired."],
    align: "left",
    shape: "slump",
    behavior: b({ spring: 4.5, noise: 0.25, gravity: 0.5, size: 0.9, dim: 0.8 }),
    camera: { x: 0.3, y: 0.8, z: 8.6 }
  },
  {
    lines: ["And bored."],
    align: "right",
    shape: "flat",
    behavior: b({ spring: 10, noise: 0.05, damping: 0.86, dim: 0.7, energy: 0.6 }),
    camera: { x: -0.2, y: 2.6, z: 9.2 }
  },
  {
    lines: ["But he", "kept going."],
    align: "left",
    shape: "stairs",
    behavior: b({ spring: 9, noise: 0.3 }),
    placement: { angle: -0.55, tilt: 0.25, sway: 0.15 },
    camera: { x: 0.6, y: 0.4 }
  },
  {
    lines: ["Ready or not,", "he went anyway."],
    align: "right",
    shape: "arrow",
    behavior: b({ spring: 11, noise: 0.4, energy: 1.2 }),
    placement: { sway: 0.3 },
    camera: { x: -0.5, z: 8.4, roll: -0.03 }
  },
  {
    lines: ["He almost", "made it."],
    align: "left",
    shape: "summit",
    behavior: b({ spring: 8, noise: 0.3 }),
    placement: { angle: 0.3, sway: 0.2, tilt: 0.12 },
    camera: { x: 0.4, y: -0.5, z: 8.8 }
  },
  {
    lines: ["Then he fell."],
    align: "right",
    shape: "pile",
    onEnter: "shatter",
    behavior: b({ spring: 3.2, noise: 0.2, gravity: 2.2, damping: 0.93, energy: 1.1 }),
    camera: { x: -0.3, y: 1.6, z: 9.6, roll: 0.025 }
  },
  {
    lines: ["He felt lost."],
    align: "center",
    shape: "fog",
    behavior: b({ spring: 0.25, damping: 0.95, noise: 0.9, cold: 0.3, dim: 0.55, size: 0.85 }),
    camera: { y: -0.4, z: 10.5 }
  },
  {
    lines: ["Then someone", "with no face", "asked him —"],
    align: "left",
    shape: "faceless",
    behavior: b({ spring: 6.5, noise: 0.3, cold: 0.9 }),
    placement: { sway: 0.2 },
    camera: { x: 0.8, z: 7.6 }
  },
  {
    lines: ["“Is this", "enough for you?”"],
    align: "right",
    shape: "question",
    variant: "quote",
    behavior: b({ spring: 8, noise: 0.35, cold: 0.55 }),
    placement: { sway: 0.3 },
    camera: { x: -0.5, z: 8.2 }
  },
  {
    lines: ["He smiled."],
    align: "left",
    shape: "smile",
    behavior: b({ spring: 9, noise: 0.3, cold: 0.1, size: 1.05 }),
    camera: { x: 0.3 }
  },
  {
    lines: ["He got up."],
    align: "right",
    shape: "risen",
    behavior: b({ spring: 9, noise: 0.4, energy: 1.2 }),
    placement: { sway: 0.2 },
    camera: { x: -0.4, y: -0.8, z: 8.6 }
  },
  {
    lines: ["And did it", "all again."],
    align: "left",
    shape: "helix",
    behavior: b({ spring: 8, noise: 0.35 }),
    placement: { spin: 1.3, tilt: 0.18 },
    camera: { x: 0.5, roll: 0.02 }
  },
  {
    lines: ["Finally —"],
    align: "right",
    shape: "core",
    behavior: b({ spring: 18, damping: 0.84, noise: 0.15, size: 0.85, energy: 0.6 }),
    placement: { spin: 2.2, tilt: 1.2 },
    camera: { x: -0.4, z: 7.2 }
  },
  {
    lines: ["He made it."],
    align: "left",
    shape: "burst",
    onEnter: "bloom",
    behavior: b({ spring: 5.2, noise: 0.6, energy: 1.4, size: 1.12 }),
    placement: { spin: 0.15 },
    camera: { x: 0.3, z: 10.8 }
  },
  {
    lines: ["He thanked the one", "with no face.", "And then, himself."],
    align: "right",
    shape: "thanks",
    behavior: b({ spring: 8, noise: 0.3 }),
    placement: { sway: 0.15 },
    camera: { x: -0.5, z: 8.8 }
  },
  {
    lines: ["Never stop", "until you win."],
    align: "center",
    shape: "halo",
    variant: "finale",
    behavior: b({ spring: 6, noise: 0.5, size: 1.1, energy: 1.3 }),
    placement: { spin: 0.25, tilt: Math.PI / 2 },
    camera: { z: 10 }
  }
];

export const finaleSubline = ["Get up again.", "Try again."];
