// Records /journey into an MP4 with a scripted cursor and scroll choreography.
// Usage: npm run build && npx next start -p 3100, then
//        node scripts/record-journey.mjs <frames-dir> <out.mp4>
import { chromium } from "playwright";
import { execFileSync } from "node:child_process";
import { mkdirSync, rmSync } from "node:fs";

const [framesDir = "journey-frames", outFile = "journey.mp4"] = process.argv.slice(2);
const W = 1920, H = 1080, FPS = 30, DT = 1 / FPS;
const URL = process.env.JOURNEY_URL ?? "http://localhost:3100/journey?capture";

// Must match `align` order in src/components/journey/content.ts.
const ALIGN = ["center","left","right","left","right","left","right","left","right","left","right","center","left","right","left","right","left","right","left","right","center"];
const HOLD_IN = new Set([3, 8, 15]);
const SWIPE_IN = new Set([2, 6, 10, 13, 17]);

rmSync(framesDir, { recursive: true, force: true });
mkdirSync(framesDir, { recursive: true });

const browser = await chromium.launch({ args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });
const page = await browser.newPage({ viewport: { width: W, height: H } });
page.on("pageerror", (e) => console.error("pageerror:", e.message));
await page.goto(URL, { waitUntil: "networkidle" });
await page.waitForFunction(() => window.__journey);

let frame = 0;
const shoot = async () => {
  await page.evaluate((dt) => window.__journey.advance(dt), DT);
  await page.screenshot({ path: `${framesDir}/f${String(frame++).padStart(5, "0")}.jpg`, type: "jpeg", quality: 92 });
  if (frame % 150 === 0) console.log(`frame ${frame} (${(frame / FPS).toFixed(1)}s)`);
};
const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
let cx = W * 0.5, cy = H * 1.05;
const moveTo = async (x, y, seconds, fn) => {
  const n = Math.max(1, Math.round(seconds * FPS));
  const sx = cx, sy = cy;
  for (let i = 1; i <= n; i++) {
    const t = ease(i / n);
    cx = sx + (x - sx) * t; cy = sy + (y - sy) * t;
    if (fn) [cx, cy] = fn(cx, cy, i / n);
    await page.mouse.move(cx, cy);
    await shoot();
  }
};
const idle = async (seconds) => { for (let i = 0; i < Math.round(seconds * FPS); i++) await shoot(); };
const orbit = async (ox, oy, r, seconds, turns = 1) => {
  const n = Math.round(seconds * FPS);
  for (let i = 1; i <= n; i++) {
    const a = (i / n) * turns * Math.PI * 2;
    cx = ox + Math.cos(a) * r; cy = oy + Math.sin(a * 1.3) * r * 0.7;
    await page.mouse.move(cx, cy);
    await shoot();
  }
};
const holdRelease = async (seconds) => {
  await page.mouse.down();
  await idle(seconds);
  await page.mouse.up();
  await idle(0.9);
};
const shapeCenter = (i) => {
  const a = ALIGN[i];
  return [a === "left" ? W * 0.68 : a === "right" ? W * 0.32 : W * 0.5, H * 0.5];
};

// Loading + intro: wait for the engine, then let the loader count up and dissolve.
await page.evaluate(() => window.__journey.ready);
await page.mouse.move(cx, cy);
await idle(3.4);

// Hero: drift in, glide around the headline, a fast swipe, then gather and release.
await moveTo(W * 0.62, H * 0.42, 1.6);
await orbit(W * 0.5, H * 0.5, 260, 2.4, 0.8);
await moveTo(W * 0.15, H * 0.62, 0.35);
await moveTo(W * 0.85, H * 0.35, 0.3);
await moveTo(W * 0.5, H * 0.75, 0.8);
await holdRelease(1.4);

for (let i = 1; i < ALIGN.length; i++) {
  await page.evaluate((f) => window.__journey.setStory(f), i);
  const [ox, oy] = shapeCenter(i);
  // Ease toward the forming shape while the morph plays.
  await moveTo(ox + (ALIGN[i] === "left" ? 260 : -260), oy + 180, 1.4);
  if (HOLD_IN.has(i)) {
    await moveTo(ox, oy, 0.6);
    await holdRelease(1.2);
  } else if (SWIPE_IN.has(i)) {
    await orbit(ox, oy, 150, 1.0, 0.5);
    await moveTo(ox - 420, oy - 120, 0.22);
    await moveTo(ox + 420, oy + 90, 0.26);
    await idle(0.6);
  } else {
    await orbit(ox, oy, 170, 1.8, 0.7);
  }
}
// Finale: hover the halo, one last release, then let it breathe.
await orbit(W * 0.5, H * 0.5, 420, 2.4, 0.6);
await moveTo(W * 0.5, H * 0.82, 0.6);
await holdRelease(1.3);
await moveTo(W * 0.5, H * 1.1, 1.0);
await idle(3);

await browser.close();
console.log(`encoding ${frame} frames`);
execFileSync("ffmpeg", ["-loglevel", "error", "-y", "-framerate", String(FPS), "-i", `${framesDir}/f%05d.jpg`,
  "-c:v", "libx264", "-preset", "slow", "-crf", "20", "-pix_fmt", "yuv420p", "-movflags", "+faststart", outFile], { stdio: "inherit" });
console.log(`wrote ${outFile}`);
