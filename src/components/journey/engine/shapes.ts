import { gaussian, mulberry32 } from "./math";

/**
 * Point-cloud generators. Every shape returns `count` xyzw points in local space
 * (roughly within a radius of 2.5 units); w carries a per-point cold tint
 * (0 = gold, 1 = blue/violet) so a shape can paint its own highlights.
 */

export type ShapeKey =
  | "drift"
  | "dreamer"
  | "orbit"
  | "wings"
  | "crowd"
  | "slump"
  | "flat"
  | "stairs"
  | "arrow"
  | "summit"
  | "pile"
  | "fog"
  | "faceless"
  | "question"
  | "smile"
  | "risen"
  | "helix"
  | "core"
  | "burst"
  | "thanks"
  | "halo";

type Rand = () => number;
type Draw = (ctx: CanvasRenderingContext2D) => void;

interface CanvasOptions {
  extent: number;
  depth: number;
  tint?: (x: number, y: number) => number;
  offset?: [number, number, number];
}

const RES = 320;
let scratch: HTMLCanvasElement | null = null;

function getCanvas() {
  scratch ??= document.createElement("canvas");
  scratch.width = RES;
  scratch.height = RES;
  return scratch;
}

/** Shared buffer writer so composite shapes can be built from several parts. */
class Cloud {
  readonly data: Float32Array;
  private cursor = 0;

  constructor(readonly count: number) {
    this.data = new Float32Array(count * 4);
  }

  get remaining() {
    return this.count - this.cursor;
  }

  push(x: number, y: number, z: number, w = 0) {
    if (this.cursor >= this.count) return;
    const i = this.cursor++ * 4;
    this.data[i] = x;
    this.data[i + 1] = y;
    this.data[i + 2] = z;
    this.data[i + 3] = w;
  }

  /** Rasterise a 2D drawing (y-up, world units) and scatter points over its filled pixels. */
  canvas(n: number, rand: Rand, draw: Draw, opts: CanvasOptions) {
    const canvas = getCanvas();
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return this.sphere(n, rand, 1.5, 0);
    const s = RES / opts.extent;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, RES, RES);
    ctx.setTransform(s, 0, 0, -s, RES / 2, RES / 2);
    ctx.fillStyle = "#fff";
    ctx.strokeStyle = "#fff";
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    draw(ctx);
    const pixels = ctx.getImageData(0, 0, RES, RES).data;
    const filled: number[] = [];
    for (let i = 0; i < RES * RES; i++) if (pixels[i * 4 + 3] > 110) filled.push(i);
    if (!filled.length) return this.sphere(n, rand, 1.5, 0);
    const [ox, oy, oz] = opts.offset ?? [0, 0, 0];
    for (let k = 0; k < n; k++) {
      const idx = filled[Math.floor(rand() * filled.length)];
      const x = ((idx % RES) + rand() - RES / 2) / s;
      const y = -(Math.floor(idx / RES) + rand() - RES / 2) / s;
      const z = gaussian(rand) * opts.depth;
      this.push(x + ox, y + oy, z + oz, opts.tint?.(x, y) ?? 0);
    }
  }

  sphere(n: number, rand: Rand, radius: number, w: number, center = [0, 0, 0], shell = false) {
    for (let k = 0; k < n; k++) {
      const u = rand() * 2 - 1;
      const a = rand() * Math.PI * 2;
      const r = shell ? radius * (1 + gaussian(rand) * 0.04) : radius * Math.cbrt(rand());
      const q = Math.sqrt(1 - u * u);
      this.push(center[0] + r * q * Math.cos(a), center[1] + r * u, center[2] + r * q * Math.sin(a), w);
    }
  }

  box(n: number, rand: Rand, sx: number, sy: number, sz: number, w: number, cy = 0) {
    for (let k = 0; k < n; k++) {
      this.push((rand() - 0.5) * sx, cy + (rand() - 0.5) * sy, (rand() - 0.5) * sz, w);
    }
  }
}

type Pose = "stand" | "raised" | "slump";

function line(ctx: CanvasRenderingContext2D, width: number, ...pts: number[]) {
  ctx.lineWidth = width;
  ctx.beginPath();
  ctx.moveTo(pts[0], pts[1]);
  for (let i = 2; i < pts.length; i += 2) ctx.lineTo(pts[i], pts[i + 1]);
  ctx.stroke();
}

function head(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, hollow = false) {
  ctx.beginPath();
  ctx.ellipse(x, y, r * 0.92, r * 1.08, 0, 0, Math.PI * 2);
  if (hollow) {
    ctx.lineWidth = r * 0.28;
    ctx.stroke();
  } else {
    ctx.fill();
  }
}

/** A figure drawn with thick strokes; `h` is the standing height. */
function figure(ctx: CanvasRenderingContext2D, cx: number, base: number, h: number, pose: Pose, hollowHead = false) {
  const u = h / 8;
  if (pose === "slump") {
    head(ctx, cx + 1.0 * u, base + 3.8 * u, 0.62 * u, hollowHead);
    ctx.lineWidth = 1.35 * u;
    ctx.beginPath();
    ctx.moveTo(cx - 0.4 * u, base + 1.5 * u);
    ctx.quadraticCurveTo(cx - 0.5 * u, base + 3.2 * u, cx + 0.55 * u, base + 3.2 * u);
    ctx.stroke();
    line(ctx, 0.7 * u, cx - 0.4 * u, base + 1.35 * u, cx + 1.7 * u, base + 1.6 * u, cx + 1.9 * u, base + 0.05 * u);
    line(ctx, 0.5 * u, cx + 0.4 * u, base + 3.0 * u, cx + 1.25 * u, base + 2.0 * u, cx + 1.7 * u, base + 1.2 * u);
    return;
  }
  head(ctx, cx, base + 7.25 * u, 0.62 * u, hollowHead);
  line(ctx, 1.45 * u, cx, base + 6.15 * u, cx, base + 4.0 * u);
  if (pose === "raised") {
    line(ctx, 0.5 * u, cx - 0.6 * u, base + 5.95 * u, cx - 1.5 * u, base + 7.4 * u, cx - 2.0 * u, base + 8.3 * u);
    line(ctx, 0.5 * u, cx + 0.6 * u, base + 5.95 * u, cx + 1.5 * u, base + 7.4 * u, cx + 2.0 * u, base + 8.3 * u);
  } else {
    line(ctx, 0.5 * u, cx - 0.75 * u, base + 5.95 * u, cx - 1.0 * u, base + 4.6 * u, cx - 1.05 * u, base + 3.6 * u);
    line(ctx, 0.5 * u, cx + 0.75 * u, base + 5.95 * u, cx + 1.0 * u, base + 4.6 * u, cx + 1.05 * u, base + 3.6 * u);
  }
  line(ctx, 0.62 * u, cx - 0.42 * u, base + 4.0 * u, cx - 0.62 * u, base + 0.2 * u);
  line(ctx, 0.62 * u, cx + 0.42 * u, base + 4.0 * u, cx + 0.62 * u, base + 0.2 * u);
}

const generators: Record<ShapeKey, (c: Cloud, rand: Rand) => void> = {
  drift(c, rand) {
    for (let k = 0; k < c.count; k++) {
      c.push((rand() - 0.5) * 15, (rand() - 0.5) * 8.5, -3.5 + rand() * 5, 0);
    }
  },

  dreamer(c, rand) {
    const n = c.count;
    c.canvas(Math.floor(n * 0.68), rand, (ctx) => figure(ctx, -0.5, -2.2, 3.5, "stand"), {
      extent: 6,
      depth: 0.18
    });
    c.sphere(Math.floor(n * 0.22), rand, 0.42, 0.18, [1.05, 1.85, 0]);
    const trail = c.remaining;
    for (let k = 0; k < trail; k++) {
      const t = rand();
      c.push(-0.4 + t * 1.45 + gaussian(rand) * 0.06, 1.05 + t * 0.8 + gaussian(rand) * 0.06, gaussian(rand) * 0.05, 0.1);
    }
  },

  orbit(c, rand) {
    while (c.remaining > 0) {
      const a = rand() * Math.PI * 2;
      const density = 0.3 + 0.7 * Math.pow(0.5 + 0.5 * Math.sin(a * 5), 3);
      if (rand() > density) continue;
      const r = 1.9 + gaussian(rand) * 0.1;
      c.push(Math.cos(a) * r, gaussian(rand) * 0.09, Math.sin(a) * r, 0);
    }
  },

  wings(c, rand) {
    c.canvas(
      c.count,
      rand,
      (ctx) => {
        for (const s of [-1, 1]) {
          for (let i = 0; i <= 9; i++) {
            const t = i / 9;
            ctx.lineWidth = 0.13 * (1.4 - t * 0.7);
            ctx.beginPath();
            ctx.moveTo(s * 0.15, -0.25);
            ctx.quadraticCurveTo(s * (0.4 + 1.3 * t), -0.1 + 0.9 * t, s * (0.6 + 2.2 * t), 0.15 + 1.9 * Math.sin(t * Math.PI * 0.8) - t * 0.6);
            ctx.stroke();
          }
        }
        ctx.beginPath();
        ctx.ellipse(0, -0.35, 0.16, 0.55, 0, 0, Math.PI * 2);
        ctx.fill();
      },
      { extent: 6.4, depth: 0.25 }
    );
  },

  crowd(c, rand) {
    const n = c.count;
    c.canvas(Math.floor(n * 0.3), rand, (ctx) => figure(ctx, 0, -1.6, 2.6, "stand"), {
      extent: 6,
      depth: 0.12
    });
    const people = 13;
    const each = Math.floor(c.remaining / people);
    for (let p = 0; p < people; p++) {
      const a = (p / people) * Math.PI * 2 + 0.2;
      const cx = Math.cos(a) * 2.5;
      const cz = Math.sin(a) * 2.5;
      for (let k = 0; k < each; k++) {
        if (rand() < 0.3) {
          c.push(cx + gaussian(rand) * 0.12, -0.05 + gaussian(rand) * 0.12, cz + gaussian(rand) * 0.12, 0.4);
        } else {
          const t = rand();
          c.push(cx + gaussian(rand) * 0.13 * (0.6 + t), -0.3 - t * 1.3, cz + gaussian(rand) * 0.13, 0.4);
        }
      }
    }
    c.sphere(c.remaining, rand, 0.4, 0, [0, 0.5, 0]);
  },

  slump(c, rand) {
    c.canvas(c.count, rand, (ctx) => figure(ctx, -0.9, -1.9, 4.6, "slump"), {
      extent: 6,
      depth: 0.2
    });
  },

  flat(c, rand) {
    for (let k = 0; k < c.count; k++) {
      const r = 3.6 * Math.sqrt(rand());
      const a = rand() * Math.PI * 2;
      c.push(Math.cos(a) * r * 1.2, -0.6 + gaussian(rand) * 0.015, Math.sin(a) * r * 0.7, 0);
    }
  },

  stairs(c, rand) {
    const steps = 7;
    for (let k = 0; k < c.count; k++) {
      const s = Math.floor(rand() * steps);
      const x0 = -2.4 + s * 0.68;
      const top = -1.9 + (s + 1) * 0.52;
      const z = (rand() - 0.5) * 1.8;
      if (rand() < 0.6) c.push(x0 + rand() * 0.68, top + gaussian(rand) * 0.015, z, 0);
      else c.push(x0 + gaussian(rand) * 0.015, top - rand() * 0.52, z, 0);
    }
  },

  arrow(c, rand) {
    c.canvas(
      c.count,
      rand,
      (ctx) => {
        line(ctx, 0.36, -2.0, -1.8, 1.0, 1.2);
        ctx.beginPath();
        ctx.moveTo(1.95, 2.15);
        ctx.lineTo(0.35, 1.75);
        ctx.lineTo(1.55, 0.55);
        ctx.closePath();
        ctx.fill();
      },
      { extent: 6, depth: 0.2 }
    );
  },

  summit(c, rand) {
    const climber = Math.floor(c.count * 0.06);
    for (let k = 0; k < c.count - climber; k++) {
      const x = (rand() - 0.5) * 5.8;
      const z = (rand() - 0.5) * 2.4;
      const ridge = Math.pow(Math.max(0, 1 - Math.abs(x) / 2.9), 1.35) * 3.1;
      const h = Math.max(0, ridge - 0.55 * z * z + Math.sin(x * 5.0 + z * 2) * 0.08);
      c.push(x, -1.9 + h * (0.92 + rand() * 0.08), z, 0);
    }
    for (let k = 0; k < climber; k++) {
      c.push(0.32 + gaussian(rand) * 0.06, 0.78 + gaussian(rand) * 0.09, gaussian(rand) * 0.06, 0);
    }
  },

  pile(c, rand) {
    for (let k = 0; k < c.count; k++) {
      if (rand() < 0.72) {
        const x = gaussian(rand) * 1.7;
        c.push(x, -2.2 + Math.abs(gaussian(rand)) * 0.28 * Math.max(0, 1 - Math.abs(x) / 4), gaussian(rand) * 0.8, 0.05);
      } else {
        c.push((rand() - 0.5) * 5, -2 + rand() * 3.2, gaussian(rand) * 0.9, 0.05);
      }
    }
  },

  fog(c, rand) {
    for (let k = 0; k < c.count; k++) {
      c.push((rand() - 0.5) * 14, (rand() - 0.5) * 8, -4.5 + rand() * 6, 0.25);
    }
  },

  faceless(c, rand) {
    c.canvas(
      c.count,
      rand,
      (ctx) => {
        ctx.lineWidth = 0.2;
        ctx.beginPath();
        ctx.ellipse(0, 0.95, 0.88, 1.12, 0, 0, Math.PI * 2);
        ctx.stroke();
        line(ctx, 0.5, 0, -0.2, 0, -0.75);
        ctx.beginPath();
        ctx.ellipse(0, -2.2, 2.1, 1.35, 0, 0, Math.PI);
        ctx.fill();
      },
      { extent: 6, depth: 0.22, tint: () => 1 }
    );
  },

  question(c, rand) {
    c.canvas(
      c.count,
      rand,
      (ctx) => {
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.font = `700 ${RES * 0.82}px Georgia, "Times New Roman", serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText("?", RES / 2, RES / 2 + RES * 0.04);
      },
      { extent: 5.2, depth: 0.2, tint: () => 0.7 }
    );
  },

  smile(c, rand) {
    c.canvas(
      c.count,
      rand,
      (ctx) => {
        ctx.lineWidth = 0.34;
        ctx.beginPath();
        ctx.arc(0, 1.0, 2.0, Math.PI + 0.55, Math.PI * 2 - 0.55);
        ctx.stroke();
      },
      { extent: 6, depth: 0.16 }
    );
  },

  risen(c, rand) {
    c.canvas(c.count, rand, (ctx) => figure(ctx, 0, -2.3, 3.9, "raised"), {
      extent: 6,
      depth: 0.18
    });
  },

  helix(c, rand) {
    for (let k = 0; k < c.count; k++) {
      const t = rand();
      const strand = rand() < 0.5 ? 0 : Math.PI;
      const a = t * Math.PI * 7 + strand;
      const r = 1.05 + gaussian(rand) * 0.07;
      c.push(Math.cos(a) * r, -2.3 + t * 4.6, Math.sin(a) * r, 0);
    }
  },

  core(c, rand) {
    const ring = Math.floor(c.count * 0.12);
    for (let k = 0; k < c.count - ring; k++) {
      const u = rand() * 2 - 1;
      const a = rand() * Math.PI * 2;
      const r = Math.abs(gaussian(rand)) * 0.2;
      const q = Math.sqrt(1 - u * u);
      c.push(r * q * Math.cos(a), r * u, r * q * Math.sin(a), 0);
    }
    for (let k = 0; k < ring; k++) {
      const a = rand() * Math.PI * 2;
      const r = 1.15 + gaussian(rand) * 0.05;
      c.push(Math.cos(a) * r, gaussian(rand) * 0.02, Math.sin(a) * r, 0.3);
    }
  },

  burst(c, rand) {
    const rays = 96;
    const dirs: number[][] = [];
    for (let i = 0; i < rays; i++) {
      const u = rand() * 2 - 1;
      const a = rand() * Math.PI * 2;
      const q = Math.sqrt(1 - u * u);
      dirs.push([q * Math.cos(a), u, q * Math.sin(a) * 0.45, 1.6 + rand() * 1.4]);
    }
    for (let k = 0; k < c.count; k++) {
      if (rand() < 0.16) {
        const r = Math.abs(gaussian(rand)) * 0.35;
        const d = dirs[Math.floor(rand() * rays)];
        c.push(d[0] * r, d[1] * r, d[2] * r, 0);
        continue;
      }
      const d = dirs[Math.floor(rand() * rays)];
      const r = 0.35 + Math.pow(rand(), 0.7) * d[3];
      c.push(d[0] * r + gaussian(rand) * 0.02, d[1] * r + gaussian(rand) * 0.02, d[2] * r, rand() < 0.08 ? 0.8 : 0);
    }
  },

  thanks(c, rand) {
    c.canvas(
      c.count,
      rand,
      (ctx) => {
        const u = 3.4 / 8;
        const base = -2.0;
        for (const s of [-1, 1]) {
          const cx = s * 1.25;
          head(ctx, cx, base + 7.25 * u, 0.62 * u, s < 0);
          line(ctx, 1.45 * u, cx, base + 6.15 * u, cx, base + 4.0 * u);
          line(ctx, 0.5 * u, cx + s * 0.75 * u, base + 5.95 * u, cx + s * 1.0 * u, base + 4.6 * u, cx + s * 1.05 * u, base + 3.6 * u);
          line(ctx, 0.5 * u, cx - s * 0.7 * u, base + 5.95 * u, cx - s * 1.7 * u, base + 5.0 * u, -s * 0.12, base + 5.05 * u);
          line(ctx, 0.62 * u, cx - 0.42 * u, base + 4.0 * u, cx - 0.62 * u, base + 0.2 * u);
          line(ctx, 0.62 * u, cx + 0.42 * u, base + 4.0 * u, cx + 0.62 * u, base + 0.2 * u);
        }
      },
      { extent: 6, depth: 0.18, tint: (x) => (x < -0.1 ? 1 : 0) }
    );
  },

  halo(c, rand) {
    for (let k = 0; k < c.count; k++) {
      const a = rand() * Math.PI * 2;
      const roll = rand();
      if (roll < 0.58) {
        const r = 3.05 + gaussian(rand) * 0.16;
        c.push(Math.cos(a) * r, gaussian(rand) * 0.08, Math.sin(a) * r, rand() < 0.06 ? 0.8 : 0);
      } else if (roll < 0.9) {
        const r = 3.2 + Math.pow(rand(), 1.8) * 1.6;
        c.push(Math.cos(a) * r, gaussian(rand) * 0.04, Math.sin(a) * r, 0);
      } else {
        const r = 4.6 + rand() * 3;
        c.push(Math.cos(a) * r, gaussian(rand) * 0.6, Math.sin(a) * r, 0.2);
      }
    }
  }
};

export interface ShapeData {
  key: ShapeKey;
  points: Float32Array;
  /** Coarse occupancy grid in the shape's initial screen-facing pose, used for hover hit tests. */
  hit: { grid: Uint8Array; minX: number; minY: number; cell: number; res: number };
}

const HIT_RES = 36;

export function buildShape(key: ShapeKey, count: number, pose: { angle: number; tilt: number }): ShapeData {
  const cloud = new Cloud(count);
  generators[key](cloud, mulberry32(hashKey(key)));
  // Shapes that build from parts may leave a remainder; fill it quietly.
  if (cloud.remaining > 0) cloud.sphere(cloud.remaining, mulberry32(7), 2.5, 0);
  return { key, points: cloud.data, hit: buildHitGrid(cloud.data, pose) };
}

function hashKey(key: string) {
  let h = 2166136261;
  for (let i = 0; i < key.length; i++) h = Math.imul(h ^ key.charCodeAt(i), 16777619);
  return h >>> 0;
}

function buildHitGrid(points: Float32Array, pose: { angle: number; tilt: number }) {
  const ca = Math.cos(pose.angle);
  const sa = Math.sin(pose.angle);
  const ct = Math.cos(pose.tilt);
  const st = Math.sin(pose.tilt);
  const n = points.length / 4;
  const xs = new Float32Array(n);
  const ys = new Float32Array(n);
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (let i = 0; i < n; i++) {
    const x = points[i * 4];
    const y = points[i * 4 + 1];
    const z = points[i * 4 + 2];
    const rx = ca * x + sa * z;
    const rz = -sa * x + ca * z;
    const py = ct * y - st * rz;
    xs[i] = rx;
    ys[i] = py;
    minX = Math.min(minX, rx);
    maxX = Math.max(maxX, rx);
    minY = Math.min(minY, py);
    maxY = Math.max(maxY, py);
  }
  const cell = Math.max(maxX - minX, maxY - minY) / HIT_RES + 1e-4;
  const counts = new Uint16Array(HIT_RES * HIT_RES);
  for (let i = 0; i < n; i++) {
    const gx = Math.min(HIT_RES - 1, Math.floor((xs[i] - minX) / cell));
    const gy = Math.min(HIT_RES - 1, Math.floor((ys[i] - minY) / cell));
    counts[gy * HIT_RES + gx]++;
  }
  const threshold = Math.max(2, (n / (HIT_RES * HIT_RES)) * 0.6);
  const grid = new Uint8Array(HIT_RES * HIT_RES);
  for (let i = 0; i < grid.length; i++) grid[i] = counts[i] >= threshold ? 1 : 0;
  return { grid, minX, minY, cell, res: HIT_RES };
}

/** 0..1 coverage of a local-space point, with one cell of dilation for forgiving hover. */
export function hitTest(shape: ShapeData, lx: number, ly: number) {
  const { grid, minX, minY, cell, res } = shape.hit;
  const gx = Math.floor((lx - minX) / cell);
  const gy = Math.floor((ly - minY) / cell);
  let hits = 0;
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      const x = gx + dx;
      const y = gy + dy;
      if (x >= 0 && y >= 0 && x < res && y < res && grid[y * res + x]) hits++;
    }
  }
  return Math.min(1, hits / 3);
}
