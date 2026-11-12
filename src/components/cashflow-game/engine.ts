import * as THREE from "three";

/* ------------------------------------------------------------------ */
/*  "Risograph Ledger" palette: paper, ink and fluoro spot colours      */
/* ------------------------------------------------------------------ */
export const PALETTE = {
  paper: 0xf4ecdc,
  ink: 0x1e1b2e,
  pink: 0xff4fa3,
  teal: 0x00a19b,
  yellow: 0xffd23f,
  blue: 0x3b5bdb,
  orange: 0xff7a3d,
  green: 0x18b26b
};

const css = (hex: number) => `#${hex.toString(16).padStart(6, "0")}`;

export type Phase = "ready" | "playing" | "report" | "over";

export interface QuarterReport {
  quarter: number;
  cashSales: number;
  collections: number;
  opex: number;
  taxes: number;
  ocf: number;
  capex: number;
  fcf: number;
  arEnd: number;
  investments: number;
}

export interface GameSnapshot {
  phase: Phase;
  quarter: number;
  totalQuarters: number;
  timeLeft: number;
  quarterLength: number;
  cash: number;
  ocf: number;
  capex: number;
  fcf: number;
  totalFcf: number;
  receivables: number;
  revenueMult: number;
  streak: number;
  reports: QuarterReport[];
  endReason: "bankrupt" | "complete" | null;
}

type ItemKind = "coin" | "invoice" | "expense" | "capex";

interface Item {
  kind: ItemKind;
  lane: number;
  x: number;
  y: number;
  z: number;
  value: number;
  done: boolean;
  obj: THREE.Object3D;
  spin: number;
}

interface Popup {
  sprite: THREE.Sprite;
  life: number;
}

interface Particle {
  mesh: THREE.Mesh;
  vel: THREE.Vector3;
  life: number;
}

const LANES = [-2.2, 0, 2.2];
const QUARTERS = 6;
const QUARTER_LENGTH = 24; // seconds
const START_CASH = 100;
const TAX_RATE = 0.2;
const SPAWN_Z = -120;

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */
function makeToonRamp() {
  const data = new Uint8Array([90, 170, 255]);
  const tex = new THREE.DataTexture(data, 3, 1, THREE.RedFormat);
  tex.minFilter = THREE.NearestFilter;
  tex.magFilter = THREE.NearestFilter;
  tex.needsUpdate = true;
  return tex;
}

function ledgerTexture() {
  const c = document.createElement("canvas");
  c.width = 256;
  c.height = 256;
  const g = c.getContext("2d")!;
  g.fillStyle = css(PALETTE.paper);
  g.fillRect(0, 0, 256, 256);
  g.strokeStyle = "rgba(59,91,219,0.28)";
  g.lineWidth = 2;
  for (let i = 0; i <= 256; i += 32) {
    g.beginPath();
    g.moveTo(0, i);
    g.lineTo(256, i);
    g.stroke();
  }
  g.strokeStyle = "rgba(255,79,163,0.35)";
  g.lineWidth = 3;
  g.beginPath();
  g.moveTo(40, 0);
  g.lineTo(40, 256);
  g.stroke();
  // halftone speckle
  g.fillStyle = "rgba(30,27,46,0.08)";
  for (let i = 0; i < 260; i++) {
    g.beginPath();
    g.arc(Math.random() * 256, Math.random() * 256, Math.random() * 1.6, 0, Math.PI * 2);
    g.fill();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(2, 40);
  tex.anisotropy = 4;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

const labelCache = new Map<string, THREE.CanvasTexture>();

function labelTexture(lines: string[], bg: number, fg: number, w = 256, h = 128) {
  const key = `${lines.join("|")}-${bg}-${fg}-${w}x${h}`;
  const hit = labelCache.get(key);
  if (hit) return hit;
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const g = c.getContext("2d")!;
  // mis-registered shadow plate
  g.fillStyle = css(PALETTE.pink);
  g.fillRect(10, 10, w - 14, h - 14);
  g.fillStyle = css(bg);
  g.fillRect(4, 4, w - 14, h - 14);
  g.strokeStyle = css(PALETTE.ink);
  g.lineWidth = 6;
  g.strokeRect(4, 4, w - 14, h - 14);
  g.textAlign = "center";
  g.textBaseline = "middle";
  const size = lines.length > 1 ? Math.floor(h / 3.4) : Math.floor(h / 2.2);
  g.font = `900 ${size}px "Arial Black", Impact, system-ui, sans-serif`;
  lines.forEach((line, i) => {
    const y = (h - 10) / 2 + (i - (lines.length - 1) / 2) * size * 1.1;
    g.fillStyle = css(PALETTE.blue);
    g.globalAlpha = 0.55;
    g.fillText(line, (w - 10) / 2 + 3, y + 3);
    g.globalAlpha = 1;
    g.fillStyle = css(fg);
    g.fillText(line, (w - 10) / 2, y);
  });
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  labelCache.set(key, tex);
  return tex;
}

function popupTexture(text: string, color: number) {
  const key = `pop-${text}-${color}`;
  const hit = labelCache.get(key);
  if (hit) return hit;
  const c = document.createElement("canvas");
  c.width = 256;
  c.height = 96;
  const g = c.getContext("2d")!;
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.font = `900 54px "Arial Black", Impact, system-ui, sans-serif`;
  g.lineWidth = 10;
  g.strokeStyle = css(PALETTE.ink);
  g.strokeText(text, 128, 50);
  g.fillStyle = css(PALETTE.pink);
  g.fillText(text, 132, 54);
  g.fillStyle = css(color);
  g.fillText(text, 128, 50);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  labelCache.set(key, tex);
  return tex;
}

/* ------------------------------------------------------------------ */
/*  Engine                                                             */
/* ------------------------------------------------------------------ */
export class CashFlowEngine {
  private container: HTMLElement;
  private onUpdate: (s: GameSnapshot) => void;
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera: THREE.PerspectiveCamera;
  private clock = new THREE.Clock();
  private raf = 0;
  private resizeObs: ResizeObserver;
  private ramp = makeToonRamp();
  private inkMat = new THREE.MeshBasicMaterial({ color: PALETTE.ink, side: THREE.BackSide });
  private mats = new Map<number, THREE.MeshToonMaterial>();
  private disposables: { dispose: () => void }[] = [];

  // world
  private road!: THREE.Mesh;
  private roadTex!: THREE.CanvasTexture;
  private player = new THREE.Group();
  private playerBody!: THREE.Group;
  private shadow!: THREE.Mesh;
  private towers: THREE.Object3D[] = [];
  private items: Item[] = [];
  private popups: Popup[] = [];
  private particles: Particle[] = [];
  private geos: Record<string, THREE.BufferGeometry> = {};

  // state
  private phase: Phase = "ready";
  private lane = 1;
  private px = 0;
  private py = 0;
  private vy = 0;
  private speed = 14;
  private spawnAcc = 0;
  private rowsSinceCapex = 0;
  private shake = 0;
  private lastEmit = 0;
  private elapsed = 0;
  private camY = 4.6;

  private quarter = 1;
  private timeLeft = QUARTER_LENGTH;
  private cash = START_CASH;
  private receivables = 0; // invoices issued this quarter, collected next quarter
  private revenueMult = 1;
  private streak = 0;
  private reports: QuarterReport[] = [];
  private endReason: GameSnapshot["endReason"] = null;
  private q = this.freshQuarter();

  constructor(container: HTMLElement, onUpdate: (s: GameSnapshot) => void) {
    this.container = container;
    this.onUpdate = onUpdate;

    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.setClearColor(PALETTE.paper);
    container.appendChild(this.renderer.domElement);
    this.renderer.domElement.style.display = "block";

    this.camera = new THREE.PerspectiveCamera(58, 1, 0.1, 400);
    this.camera.position.set(0, 4.6, 8.2);
    this.camera.lookAt(0, 1.2, -6);

    this.scene.background = new THREE.Color(PALETTE.paper);
    this.scene.fog = new THREE.Fog(PALETTE.paper, 40, 125);

    this.buildWorld();
    this.resize();
    this.resizeObs = new ResizeObserver(() => this.resize());
    this.resizeObs.observe(container);

    this.emit(true);
    this.loop();
  }

  /* ---------------- public API ---------------- */
  start() {
    if (this.phase === "ready") {
      this.seedRows();
      this.phase = "playing";
      this.clock.getDelta();
      this.emit(true);
    }
  }

  nextQuarter() {
    if (this.phase !== "report") return;
    this.quarter += 1;
    this.timeLeft = QUARTER_LENGTH;
    this.q = this.freshQuarter();
    // collect last quarter's receivables: working capital turns into cash
    if (this.receivables > 0) {
      this.q.collections += this.receivables;
      this.cash += this.receivables;
      this.popup(`+$${this.receivables} AR`, PALETTE.blue, 0, 2.6, -2);
      this.receivables = 0;
    }
    this.clearItems();
    this.seedRows();
    this.phase = "playing";
    this.clock.getDelta();
    this.emit(true);
  }

  restart() {
    this.clearItems();
    this.quarter = 1;
    this.timeLeft = QUARTER_LENGTH;
    this.cash = START_CASH;
    this.receivables = 0;
    this.revenueMult = 1;
    this.streak = 0;
    this.reports = [];
    this.endReason = null;
    this.q = this.freshQuarter();
    this.lane = 1;
    this.px = 0;
    this.py = 0;
    this.vy = 0;
    this.elapsed = 0;
    this.seedRows();
    this.phase = "playing";
    this.clock.getDelta();
    this.emit(true);
  }

  move(dir: -1 | 1) {
    if (this.phase !== "playing") return;
    this.lane = Math.max(0, Math.min(2, this.lane + dir));
  }

  jump() {
    if (this.phase !== "playing") return;
    if (this.py <= 0.001) this.vy = 10.5;
  }

  dispose() {
    cancelAnimationFrame(this.raf);
    this.resizeObs.disconnect();
    this.clearItems();
    this.disposables.forEach((d) => d.dispose());
    this.mats.forEach((m) => m.dispose());
    Object.values(this.geos).forEach((g) => g.dispose());
    labelCache.forEach((t) => t.dispose());
    labelCache.clear();
    this.inkMat.dispose();
    this.ramp.dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }

  /* ---------------- building ---------------- */
  private toon(color: number) {
    let m = this.mats.get(color);
    if (!m) {
      m = new THREE.MeshToonMaterial({ color, gradientMap: this.ramp });
      this.mats.set(color, m);
    }
    return m;
  }

  /** Mesh with an inverted-hull ink outline: the comic / print look. */
  private inked(geo: THREE.BufferGeometry, color: number, outline = 1.07) {
    const g = new THREE.Group();
    const body = new THREE.Mesh(geo, this.toon(color));
    const line = new THREE.Mesh(geo, this.inkMat);
    line.scale.setScalar(outline);
    g.add(line, body);
    return g;
  }

  private buildWorld() {
    const hemi = new THREE.HemisphereLight(0xffffff, PALETTE.pink, 1.4);
    const sun = new THREE.DirectionalLight(0xffffff, 2.2);
    sun.position.set(-6, 12, 6);
    this.scene.add(hemi, sun);

    this.geos = {
      coin: new THREE.CylinderGeometry(0.42, 0.42, 0.14, 20).rotateX(Math.PI / 2),
      box: new THREE.BoxGeometry(1, 1, 1),
      envelope: new THREE.BoxGeometry(0.95, 0.62, 0.1),
      flap: new THREE.ConeGeometry(0.42, 0.34, 3).rotateZ(Math.PI).rotateY(Math.PI / 6),
      post: new THREE.BoxGeometry(0.28, 2.8, 0.28),
      beam: new THREE.BoxGeometry(1.95, 0.32, 0.36),
      shard: new THREE.TetrahedronGeometry(0.16),
      plane: new THREE.PlaneGeometry(1, 1)
    };

    // Ledger-paper road
    this.roadTex = ledgerTexture();
    this.disposables.push(this.roadTex);
    const roadGeo = new THREE.PlaneGeometry(7.6, 260);
    this.disposables.push(roadGeo);
    this.road = new THREE.Mesh(roadGeo, new THREE.MeshBasicMaterial({ map: this.roadTex }));
    this.disposables.push(this.road.material as THREE.Material);
    this.road.rotation.x = -Math.PI / 2;
    this.road.position.z = -110;
    this.scene.add(this.road);

    // ink rails on road edges
    for (const x of [-3.85, 3.85]) {
      const rail = this.inked(this.geos.box, PALETTE.ink, 1);
      rail.scale.set(0.14, 0.14, 260);
      rail.position.set(x, 0.07, -110);
      this.scene.add(rail);
    }

    // Fluoro sun with print stripes
    const sunGeo = new THREE.CircleGeometry(38, 48);
    this.disposables.push(sunGeo);
    const sunMat = new THREE.MeshBasicMaterial({ color: PALETTE.pink, fog: false });
    this.disposables.push(sunMat);
    const sunDisc = new THREE.Mesh(sunGeo, sunMat);
    sunDisc.position.set(0, 18, -230);
    this.scene.add(sunDisc);
    const stripeMat = new THREE.MeshBasicMaterial({ color: PALETTE.paper, fog: false });
    this.disposables.push(stripeMat);
    for (let i = 0; i < 6; i++) {
      const s = new THREE.Mesh(this.geos.plane, stripeMat);
      s.scale.set(90, 1.2 + i * 0.7, 1);
      s.position.set(0, 4 + i * 4.2, -229);
      this.scene.add(s);
    }

    // Bar-chart skyline that scrolls past
    const towerColors = [PALETTE.teal, PALETTE.yellow, PALETTE.blue, PALETTE.pink, PALETTE.orange];
    for (let i = 0; i < 44; i++) {
      const side = i % 2 === 0 ? -1 : 1;
      const h = 2 + Math.random() * 12;
      const t = this.inked(this.geos.box, towerColors[i % towerColors.length], 1.04);
      t.scale.set(2 + Math.random() * 1.5, h, 2 + Math.random() * 1.5);
      t.position.set(side * (6.5 + Math.random() * 7), h / 2, -i * 5.6);
      this.towers.push(t);
      this.scene.add(t);
    }

    // Player: a chunky stack of banknotes with a paper band
    this.playerBody = new THREE.Group();
    for (let i = 0; i < 4; i++) {
      const note = this.inked(this.geos.box, i % 2 ? PALETTE.green : 0x26c87c, 1.05);
      note.scale.set(1.25, 0.22, 0.75);
      note.position.y = 0.11 + i * 0.24;
      note.rotation.y = (i - 1.5) * 0.06;
      this.playerBody.add(note);
    }
    const band = this.inked(this.geos.box, PALETTE.yellow, 1.04);
    band.scale.set(0.3, 1.02, 0.8);
    band.position.y = 0.48;
    this.playerBody.add(band);
    const badge = new THREE.Sprite(
      new THREE.SpriteMaterial({ map: labelTexture(["FCF"], PALETTE.paper, PALETTE.ink, 192, 96) })
    );
    this.disposables.push(badge.material);
    badge.scale.set(0.9, 0.45, 1);
    badge.position.set(0, 1.45, 0);
    this.playerBody.add(badge);
    this.player.add(this.playerBody);

    const shadowGeo = new THREE.CircleGeometry(0.8, 24);
    this.disposables.push(shadowGeo);
    const shadowMat = new THREE.MeshBasicMaterial({ color: PALETTE.blue, transparent: true, opacity: 0.35 });
    this.disposables.push(shadowMat);
    this.shadow = new THREE.Mesh(shadowGeo, shadowMat);
    this.shadow.rotation.x = -Math.PI / 2;
    this.shadow.position.y = 0.02;
    this.player.add(this.shadow);
    this.scene.add(this.player);
  }

  private resize() {
    const w = this.container.clientWidth || 1;
    const h = this.container.clientHeight || 1;
    this.renderer.setSize(w, h, false);
    this.renderer.domElement.style.width = "100%";
    this.renderer.domElement.style.height = "100%";
    this.camera.aspect = w / h;
    // narrow screens: pull the camera back so all three lanes stay visible
    this.camera.position.z = w / h < 0.8 ? 11 : 8.2;
    this.camY = w / h < 0.8 ? 6 : 4.6;
    this.camera.position.y = this.camY;
    this.camera.lookAt(0, 1.2, -6);
    this.camera.updateProjectionMatrix();
  }

  /* ---------------- spawning ---------------- */
  private freshQuarter() {
    return { cashSales: 0, collections: 0, opex: 0, capex: 0, invoiced: 0, investments: 0 };
  }

  private coinValue() {
    return Math.round(6 * this.revenueMult);
  }
  private invoiceValue() {
    return Math.round(16 * this.revenueMult);
  }
  private expenseValue() {
    return 10 + this.quarter * 3;
  }
  private capexCost() {
    return 45 + this.quarter * 10;
  }

  private addItem(kind: ItemKind, lane: number, z: number, y = 0) {
    let obj: THREE.Object3D;
    let value = 0;
    const x = LANES[lane];
    switch (kind) {
      case "coin": {
        obj = this.inked(this.geos.coin, PALETTE.yellow, 1.12);
        value = this.coinValue();
        y = y || 0.9;
        break;
      }
      case "invoice": {
        const g = new THREE.Group();
        g.add(this.inked(this.geos.envelope, PALETTE.blue, 1.08));
        const flap = this.inked(this.geos.flap, PALETTE.paper, 1.06);
        flap.position.set(0, 0.12, 0.07);
        flap.scale.set(1.1, 0.9, 0.2);
        g.add(flap);
        value = this.invoiceValue();
        const tag = new THREE.Sprite(
          new THREE.SpriteMaterial({ map: labelTexture([`AR $${value}`], PALETTE.paper, PALETTE.blue) })
        );
        tag.scale.set(1.1, 0.55, 1);
        tag.position.y = 0.85;
        g.add(tag);
        obj = g;
        y = 1;
        break;
      }
      case "expense": {
        const g = new THREE.Group();
        const block = this.inked(this.geos.box, PALETTE.pink, 1.04);
        block.scale.set(1.7, 1.05, 0.55);
        block.position.y = 0.52;
        g.add(block);
        value = this.expenseValue();
        const tag = new THREE.Sprite(
          new THREE.SpriteMaterial({
            map: labelTexture(["OPEX", `-$${value}`], PALETTE.yellow, PALETTE.ink)
          })
        );
        tag.scale.set(1.3, 0.65, 1);
        tag.position.y = 1.55;
        g.add(tag);
        obj = g;
        break;
      }
      case "capex": {
        const g = new THREE.Group();
        for (const sx of [-0.85, 0.85]) {
          const post = this.inked(this.geos.post, PALETTE.teal, 1.06);
          post.position.set(sx, 1.4, 0);
          g.add(post);
        }
        const beam = this.inked(this.geos.beam, PALETTE.teal, 1.06);
        beam.position.y = 2.85;
        g.add(beam);
        value = this.capexCost();
        const tag = new THREE.Sprite(
          new THREE.SpriteMaterial({
            map: labelTexture(["CAPEX", `-$${value}`, "+30% REV"], PALETTE.paper, PALETTE.teal, 256, 160)
          })
        );
        tag.scale.set(1.5, 0.94, 1);
        tag.position.y = 1.6;
        g.add(tag);
        obj = g;
        break;
      }
    }
    obj.position.set(x, y, z);
    this.scene.add(obj);
    this.items.push({ kind, lane, x, y, z, value, done: false, obj, spin: Math.random() * 6 });
  }

  private spawnRow(z: number) {
    const lanes = [0, 1, 2];
    const plan: (ItemKind | "trail" | null)[] = [null, null, null];
    let walls = 0;
    const capexChance = this.rowsSinceCapex > 5 ? 0.35 : 0;
    let capexPlaced = false;

    for (const l of lanes.sort(() => Math.random() - 0.5)) {
      const r = Math.random();
      if (!capexPlaced && Math.random() < capexChance) {
        plan[l] = "capex";
        capexPlaced = true;
      } else if (r < 0.28 + this.quarter * 0.02 && walls < 2) {
        plan[l] = "expense";
        walls++;
      } else if (r < 0.62) {
        plan[l] = "trail";
      } else if (r < 0.74) {
        plan[l] = "invoice";
      }
    }
    this.rowsSinceCapex = capexPlaced ? 0 : this.rowsSinceCapex + 1;

    plan.forEach((p, l) => {
      if (p === "trail") {
        for (let i = 0; i < 3; i++) this.addItem("coin", l, z - i * 2.2);
      } else if (p === "expense") {
        this.addItem("expense", l, z);
        if (Math.random() < 0.5) this.addItem("coin", l, z, 2.5); // reward a jump
      } else if (p) {
        this.addItem(p, l, z);
      }
    });
  }

  /** Fill the road ahead so a quarter never starts on an empty track. */
  private seedRows() {
    for (let z = -34; z >= SPAWN_Z; z -= 20) this.spawnRow(z);
    this.spawnAcc = 0;
  }

  private clearItems() {
    for (const it of this.items) this.disposeObj(it.obj);
    this.items = [];
    for (const p of this.popups) {
      this.scene.remove(p.sprite);
      p.sprite.material.dispose();
    }
    this.popups = [];
    for (const p of this.particles) {
      this.scene.remove(p.mesh);
    }
    this.particles = [];
  }

  private disposeObj(obj: THREE.Object3D) {
    this.scene.remove(obj);
    obj.traverse((o) => {
      if (o instanceof THREE.Sprite) o.material.dispose();
    });
  }

  /* ---------------- feedback ---------------- */
  private popup(text: string, color: number, x: number, y: number, z: number) {
    const mat = new THREE.SpriteMaterial({ map: popupTexture(text, color), transparent: true, depthTest: false });
    const s = new THREE.Sprite(mat);
    s.scale.set(2, 0.75, 1);
    s.position.set(x, y, z);
    s.renderOrder = 10;
    this.scene.add(s);
    this.popups.push({ sprite: s, life: 1 });
  }

  private burst(x: number, y: number, z: number, color: number, n = 8) {
    for (let i = 0; i < n; i++) {
      const m = new THREE.Mesh(this.geos.shard, this.toon(color));
      m.position.set(x, y, z);
      this.scene.add(m);
      this.particles.push({
        mesh: m,
        vel: new THREE.Vector3((Math.random() - 0.5) * 7, Math.random() * 6 + 2, (Math.random() - 0.5) * 4),
        life: 0.7
      });
    }
  }

  /* ---------------- economy ---------------- */
  private collect(it: Item) {
    it.done = true;
    switch (it.kind) {
      case "coin": {
        this.streak++;
        const bonus = this.streak >= 10 ? 2 : 1;
        const v = it.value * bonus;
        this.cash += v;
        this.q.cashSales += v;
        this.popup(`+$${v}`, PALETTE.green, it.x, it.y + 1, it.z);
        this.burst(it.x, it.y, it.z, PALETTE.yellow, 5);
        break;
      }
      case "invoice": {
        this.receivables += it.value;
        this.q.invoiced += it.value;
        this.popup(`AR +$${it.value}`, PALETTE.blue, it.x, it.y + 1, it.z);
        this.burst(it.x, it.y, it.z, PALETTE.blue, 6);
        break;
      }
      case "expense": {
        this.streak = 0;
        this.cash -= it.value;
        this.q.opex += it.value;
        this.shake = 0.35;
        this.popup(`-$${it.value}`, PALETTE.pink, it.x, 2, it.z);
        this.burst(it.x, 0.8, it.z, PALETTE.pink, 12);
        break;
      }
      case "capex": {
        if (this.cash < it.value) {
          this.popup("NO FUNDS", PALETTE.orange, it.x, 2.4, it.z);
          break;
        }
        this.cash -= it.value;
        this.q.capex += it.value;
        this.q.investments += 1;
        this.revenueMult = Math.round((this.revenueMult + 0.3) * 100) / 100;
        this.popup(`REV x${this.revenueMult.toFixed(1)}`, PALETTE.teal, it.x, 2.6, it.z);
        this.burst(it.x, 1.6, it.z, PALETTE.teal, 14);
        break;
      }
    }
    this.disposeObj(it.obj);
    if (this.cash < 0) this.gameOver("bankrupt");
  }

  private liveTaxEstimate() {
    const pretax = this.q.cashSales + this.q.invoiced - this.q.opex;
    return Math.max(0, Math.round(pretax * TAX_RATE));
  }

  private closeQuarter() {
    const taxes = this.liveTaxEstimate();
    this.cash -= taxes;
    const ocf = this.q.cashSales + this.q.collections - this.q.opex - taxes;
    const report: QuarterReport = {
      quarter: this.quarter,
      cashSales: this.q.cashSales,
      collections: this.q.collections,
      opex: this.q.opex,
      taxes,
      ocf,
      capex: this.q.capex,
      fcf: ocf - this.q.capex,
      arEnd: this.receivables,
      investments: this.q.investments
    };
    this.reports.push(report);
    if (this.cash < 0) return this.gameOver("bankrupt");
    if (this.quarter >= QUARTERS) {
      // final quarter: outstanding invoices still get collected at year end
      this.cash += this.receivables;
      return this.gameOver("complete");
    }
    this.phase = "report";
    this.emit(true);
  }

  private gameOver(reason: "bankrupt" | "complete") {
    this.endReason = reason;
    this.phase = "over";
    this.emit(true);
  }

  private emit(force = false) {
    const now = performance.now();
    if (!force && now - this.lastEmit < 100) return;
    this.lastEmit = now;
    const ocf = this.q.cashSales + this.q.collections - this.q.opex;
    this.onUpdate({
      phase: this.phase,
      quarter: this.quarter,
      totalQuarters: QUARTERS,
      timeLeft: Math.max(0, this.timeLeft),
      quarterLength: QUARTER_LENGTH,
      cash: this.cash,
      ocf,
      capex: this.q.capex,
      fcf: ocf - this.q.capex,
      totalFcf: this.reports.reduce((s, r) => s + r.fcf, 0),
      receivables: this.receivables,
      revenueMult: this.revenueMult,
      streak: this.streak,
      reports: [...this.reports],
      endReason: this.endReason
    });
  }

  /* ---------------- loop ---------------- */
  private loop = () => {
    this.raf = requestAnimationFrame(this.loop);
    const dt = Math.min(this.clock.getDelta(), 0.05);
    this.elapsed += dt;
    const playing = this.phase === "playing";

    if (playing) {
      this.timeLeft -= dt;
      const progress = 1 - this.timeLeft / QUARTER_LENGTH;
      this.speed = 13 + this.quarter * 1.6 + progress * 2;

      // spawn
      this.spawnAcc += this.speed * dt;
      if (this.spawnAcc > 10) {
        this.spawnAcc = 0;
        this.spawnRow(SPAWN_Z);
      }

      // player physics
      this.vy -= 30 * dt;
      this.py = Math.max(0, this.py + this.vy * dt);
      if (this.py === 0) this.vy = Math.max(0, this.vy);
    }

    const scroll = playing ? this.speed * dt : dt * 1.5;

    // road + skyline scroll
    this.roadTex.offset.y += scroll / 6.5;
    for (const t of this.towers) {
      t.position.z += scroll;
      if (t.position.z > 12) t.position.z -= 44 * 5.6;
    }

    // player
    this.px += (LANES[this.lane] - this.px) * Math.min(1, dt * 14);
    this.player.position.set(this.px, 0, 0);
    this.playerBody.position.y = this.py + Math.sin(this.elapsed * 8) * 0.05 + 0.05;
    this.playerBody.rotation.z = (this.px - LANES[this.lane]) * 0.25;
    this.playerBody.rotation.x = this.py > 0 ? -0.25 : Math.sin(this.elapsed * 16) * 0.03;
    if (!playing) this.playerBody.rotation.y += dt * 0.8;
    else this.playerBody.rotation.y *= 0.9;
    const s = 1 - Math.min(this.py, 3) * 0.15;
    this.shadow.scale.set(s, s, s);

    // items
    if (playing) {
      for (const it of this.items) {
        it.z += scroll;
        it.obj.position.z = it.z;
        it.spin += dt;
        if (it.kind === "coin") it.obj.rotation.y = it.spin * 4;
        if (it.kind === "invoice") it.obj.position.y = it.y + Math.sin(it.spin * 4) * 0.15;

        if (!it.done && Math.abs(it.z) < 0.8 && Math.abs(it.x - this.px) < 1.05) {
          const feet = this.py;
          if (it.kind === "expense" && feet > 1.05) continue; // jumped clean over
          if (it.kind === "coin" && Math.abs(it.y - (feet + 0.6)) > 1.1) continue;
          if (it.kind === "invoice" && feet > 2) continue;
          this.collect(it);
          if (this.phase !== "playing") break;
        }
      }
      const keep: Item[] = [];
      for (const it of this.items) {
        if (it.done && !it.obj.parent) continue;
        if (it.z > 8) {
          this.disposeObj(it.obj);
          continue;
        }
        keep.push(it);
      }
      this.items = keep;

      if (this.phase === "playing" && this.timeLeft <= 0) this.closeQuarter();
    }

    // popups & particles
    this.popups = this.popups.filter((p) => {
      p.life -= dt;
      p.sprite.position.y += dt * 1.6;
      p.sprite.material.opacity = Math.max(0, p.life);
      if (p.life <= 0) {
        this.scene.remove(p.sprite);
        p.sprite.material.dispose();
        return false;
      }
      return true;
    });
    this.particles = this.particles.filter((p) => {
      p.life -= dt;
      p.vel.y -= 18 * dt;
      p.mesh.position.addScaledVector(p.vel, dt);
      p.mesh.rotation.x += dt * 8;
      p.mesh.rotation.y += dt * 6;
      if (p.life <= 0) {
        this.scene.remove(p.mesh);
        return false;
      }
      return true;
    });

    // camera follow + shake
    this.shake = Math.max(0, this.shake - dt);
    const sx = (Math.random() - 0.5) * this.shake;
    const sy = (Math.random() - 0.5) * this.shake;
    this.camera.position.x += (this.px * 0.35 + sx - this.camera.position.x) * Math.min(1, dt * 6);
    this.camera.position.y = this.camY + sy;
    this.camera.lookAt(this.px * 0.2, 1.2, -6);

    this.renderer.render(this.scene, this.camera);
    if (playing) this.emit();
  };
}
