# Learn Codex App

Next.js project scaffolded with TypeScript, App Router, Tailwind CSS, and ESLint.

## Getting Started

Install dependencies:

```bash
npm install
```

Run the development server:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

## Keep Going — particle story (`/journey`)

An experimental Three.js landing page: ~16k gold particles simulated on the GPU
(GPGPU ping-pong textures) that morph through 21 story shapes as you scroll.

- **Move** slowly to attract particles, **swipe** fast to scatter them, **hold and release** to gather then fire a shockwave.
- Architecture lives in `src/components/journey/engine/`: `Stage` (renderer/scene/camera/resize),
  `ParticleField` + `simulation.ts` (GPU backend with a CPU fallback), `shapes.ts`, `ScrollDirector`,
  `CameraRig`, `PointerController`, `TextLayer`, `CursorView`, `SoundBus` (event bus + optional synth).
- Story text and per-chapter physics/camera live in `src/components/journey/content.ts`.
- Respects `prefers-reduced-motion`, caps device pixel ratio, uses fewer particles on touch devices,
  and falls back to a static page without WebGL2.

Record a video (needs `ffmpeg`):

```bash
npm run build && npx next start -p 3100 &
npm run record:journey
```
