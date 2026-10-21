/**
 * Sound-ready interaction layer. The experience only emits semantic events;
 * anything (the bundled synth below, a sample player, analytics) can listen.
 */
export interface SoundEvents {
  chapter: { index: number; forward: boolean };
  hover: { level: number };
  charge: { level: number };
  release: { strength: number };
  scatter: { speed: number };
  beat: { kind: "shatter" | "bloom" };
}

type Handler<K extends keyof SoundEvents> = (payload: SoundEvents[K]) => void;

export class SoundBus {
  private handlers = new Map<keyof SoundEvents, Set<Handler<never>>>();

  on<K extends keyof SoundEvents>(type: K, handler: Handler<K>) {
    if (!this.handlers.has(type)) this.handlers.set(type, new Set());
    this.handlers.get(type)!.add(handler as Handler<never>);
    return () => this.handlers.get(type)?.delete(handler as Handler<never>);
  }

  emit<K extends keyof SoundEvents>(type: K, payload: SoundEvents[K]) {
    this.handlers.get(type)?.forEach((h) => (h as Handler<K>)(payload));
  }

  clear() {
    this.handlers.clear();
  }
}

const PENTATONIC = [0, 3, 5, 7, 10, 12, 15];

/** A deliberately quiet WebAudio synth. Off until the visitor opts in. */
export class AmbientSynth {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private hoverGain: GainNode | null = null;
  private chargeOsc: OscillatorNode | null = null;
  private chargeGain: GainNode | null = null;
  private unsubscribe: (() => void)[] = [];

  constructor(private bus: SoundBus) {}

  get enabled() {
    return this.ctx !== null && this.ctx.state === "running";
  }

  async enable() {
    if (!this.ctx) {
      const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return false;
      this.ctx = new Ctor();
      this.build(this.ctx);
    }
    await this.ctx.resume();
    this.master!.gain.setTargetAtTime(0.5, this.ctx.currentTime, 0.4);
    return true;
  }

  async disable() {
    if (!this.ctx || !this.master) return;
    this.master.gain.setTargetAtTime(0, this.ctx.currentTime, 0.15);
    await new Promise((r) => setTimeout(r, 400));
    await this.ctx.suspend();
  }

  private build(ctx: AudioContext) {
    const master = ctx.createGain();
    master.gain.value = 0;
    master.connect(ctx.destination);
    this.master = master;

    // Hover: a band of filtered noise whose level follows how much is under the cursor.
    const noise = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const data = noise.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    const src = ctx.createBufferSource();
    src.buffer = noise;
    src.loop = true;
    const band = ctx.createBiquadFilter();
    band.type = "bandpass";
    band.frequency.value = 1400;
    band.Q.value = 0.8;
    this.hoverGain = ctx.createGain();
    this.hoverGain.gain.value = 0;
    src.connect(band).connect(this.hoverGain).connect(master);
    src.start();

    this.chargeOsc = ctx.createOscillator();
    this.chargeOsc.type = "sine";
    this.chargeOsc.frequency.value = 110;
    this.chargeGain = ctx.createGain();
    this.chargeGain.gain.value = 0;
    this.chargeOsc.connect(this.chargeGain).connect(master);
    this.chargeOsc.start();

    this.unsubscribe.push(
      this.bus.on("hover", ({ level }) => this.hoverGain!.gain.setTargetAtTime(level * 0.03, ctx.currentTime, 0.12)),
      this.bus.on("charge", ({ level }) => {
        this.chargeGain!.gain.setTargetAtTime(level * 0.08, ctx.currentTime, 0.1);
        this.chargeOsc!.frequency.setTargetAtTime(110 + level * 110, ctx.currentTime, 0.1);
      }),
      this.bus.on("chapter", ({ index }) => this.bell(220 * Math.pow(2, PENTATONIC[index % PENTATONIC.length] / 12), 0.06)),
      this.bus.on("release", ({ strength }) => this.thump(strength)),
      this.bus.on("beat", ({ kind }) => (kind === "bloom" ? this.bell(440, 0.1) : this.thump(1)))
    );
  }

  private bell(freq: number, level: number) {
    const ctx = this.ctx;
    if (!ctx || !this.master) return;
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(level, t + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 2.4);
    osc.connect(gain).connect(this.master);
    osc.start(t);
    osc.stop(t + 2.5);
  }

  private thump(strength: number) {
    const ctx = this.ctx;
    if (!ctx || !this.master) return;
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.frequency.setValueAtTime(140, t);
    osc.frequency.exponentialRampToValueAtTime(40, t + 0.5);
    gain.gain.setValueAtTime(0.18 * strength, t);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.7);
    osc.connect(gain).connect(this.master);
    osc.start(t);
    osc.stop(t + 0.8);
  }

  dispose() {
    this.unsubscribe.forEach((u) => u());
    this.unsubscribe = [];
    void this.ctx?.close();
    this.ctx = null;
  }
}
