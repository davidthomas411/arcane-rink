import type { Rebounder } from "../input/calibration";
import type { PuckSample } from "../input/PuckSource";
import type { Encounter, Enemy, Fx } from "../game/encounter";
import { clamp, TAU } from "../util";

export type Insets = { top: number; right: number; bottom: number; left: number };
export type ReadyCircle = { x: number; y: number; r: number; progress: number; label: string };

const asset = (name: string): string => new URL(`../assets/${name}`, import.meta.url).href;

const GOLD = "#d4af37";
const PARCH = "#e6dcc4";
const FONT = '"Cinzel", "Palatino Linotype", Georgia, serif';

type Sprite = HTMLCanvasElement | HTMLImageElement;
type Particle = { x: number; y: number; vx: number; vy: number; life: number; max: number; color: string; size: number };
type Effect =
  | { type: "slash"; x: number; y: number; ang: number; crit: boolean; age: number }
  | { type: "bolt"; x1: number; y1: number; x2: number; y2: number; age: number }
  | { type: "ring"; x: number; y: number; r: number; color: string; age: number }
  | { type: "heal"; x1: number; y1: number; x2: number; y2: number; age: number };

function loadImage(name: string): HTMLImageElement {
  const img = new Image();
  img.decoding = "async";
  img.src = asset(name);
  return img;
}

/**
 * Draws the top-down floor on the TV. One foot on the floor is `scale` pixels,
 * so everything the kids see lines up with where the puck really is. Creatures
 * are drawn as standing figures with their feet on their true floor position.
 */
export class ArenaRenderer {
  readonly ctx: CanvasRenderingContext2D;
  private viewW = 1;
  private viewH = 1;
  private dpr = 1;
  private ox = 0;
  private oy = 0;
  scale = 50;
  heroColor = "#59e07a";
  private readonly trail: { x: number; y: number }[] = [];
  private readonly particles: Particle[] = [];
  private readonly effects: Effect[] = [];
  private shake = 0;
  private lastTime = 0;
  private floorCache: HTMLCanvasElement | null = null;

  private readonly ice = loadImage("ice.jpg");
  private readonly goblin = loadImage("goblin.png");
  private readonly toon = loadImage("goblin-toon.png");
  private readonly sprites = new Map<string, Sprite>();

  constructor(readonly canvas: HTMLCanvasElement, private arenaW: number, private arenaD: number) {
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("2D canvas unavailable");
    this.ctx = ctx;
    this.ice.addEventListener("load", () => (this.floorCache = null));
    this.goblin.addEventListener("load", () => this.sprites.clear());
    this.toon.addEventListener("load", () => this.sprites.clear());
  }

  layout(insets: Insets): void {
    const rect = this.canvas.getBoundingClientRect();
    this.viewW = Math.max(1, rect.width);
    this.viewH = Math.max(1, rect.height);
    this.dpr = Math.min(2, window.devicePixelRatio || 1);
    this.canvas.width = Math.round(this.viewW * this.dpr);
    this.canvas.height = Math.round(this.viewH * this.dpr);
    const availW = Math.max(50, this.viewW - insets.left - insets.right);
    const availH = Math.max(50, this.viewH - insets.top - insets.bottom);
    this.scale = Math.min(availW / this.arenaW, availH / this.arenaD);
    this.ox = insets.left + (availW - this.arenaW * this.scale) / 2;
    this.oy = insets.top + (availH - this.arenaD * this.scale) / 2;
    this.floorCache = null;
  }

  /** Browser client coordinates -> feet on the floor (used by the mouse stand-in). */
  toArena(clientX: number, clientY: number): { x: number; y: number } {
    const rect = this.canvas.getBoundingClientRect();
    return { x: (clientX - rect.left - this.ox) / this.scale, y: (clientY - rect.top - this.oy) / this.scale };
  }

  private px(x: number): number {
    return this.ox + x * this.scale;
  }

  private py(y: number): number {
    return this.oy + y * this.scale;
  }

  /** Queue the one-shot effects the fight raised this frame. */
  addFx(list: readonly Fx[]): void {
    for (const fx of list) {
      if (fx.type === "burst") {
        for (let i = 0; i < fx.n; i += 1) {
          const a = Math.random() * TAU;
          const v = 1 + Math.random() * 4;
          const life = 0.35 + Math.random() * 0.5;
          this.particles.push({ x: fx.x, y: fx.y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 1, life, max: life, color: fx.color, size: 0.04 + Math.random() * 0.07 });
        }
      } else if (fx.type === "shake") {
        this.shake = Math.max(this.shake, fx.amt);
      } else {
        this.effects.push({ ...fx, age: 0 } as Effect);
      }
    }
  }

  // ---------------------------------------------------------------- sprites

  private sprite(key: string, base: HTMLImageElement, filter: string): Sprite | null {
    if (!base.complete || base.naturalWidth === 0) return null;
    const cached = this.sprites.get(key);
    if (cached) return cached;
    if (!filter) {
      this.sprites.set(key, base);
      return base;
    }
    const c = document.createElement("canvas");
    c.width = base.naturalWidth;
    c.height = base.naturalHeight;
    const cctx = c.getContext("2d")!;
    cctx.filter = filter;
    cctx.drawImage(base, 0, 0);
    this.sprites.set(key, c);
    return c;
  }

  private enemySprite(e: Enemy): { img: Sprite | null; height: number } {
    const frozen = e.frozen ? " frozen" : "";
    const ice = e.frozen ? " hue-rotate(170deg) saturate(0.55) brightness(1.35)" : "";
    switch (e.kind) {
      case "grunt":
        return { img: this.sprite(`grunt${frozen}`, this.goblin, ice.trim()), height: 1.75 };
      case "berserker":
        return { img: this.sprite(`berserker${frozen}`, this.goblin, `hue-rotate(-75deg) saturate(1.5)${ice}`), height: 1.9 };
      case "brute":
        return { img: this.sprite(`brute${frozen}`, this.goblin, `hue-rotate(110deg) saturate(0.8) brightness(0.95)${ice}`), height: 2.25 };
      case "shaman":
        return { img: this.sprite(`shaman${frozen}`, this.goblin, `hue-rotate(200deg) saturate(1.2)${ice}`), height: 1.65 };
      case "boss":
        return { img: this.sprite(`boss${frozen}`, this.goblin, `contrast(1.15) saturate(1.25)${ice}`), height: 2.9 };
      case "runner":
        return { img: this.sprite(`runner${frozen}`, this.toon, ice.trim()), height: 1.15 };
      default:
        return { img: null, height: 1.6 };
    }
  }

  // ------------------------------------------------------------------ frame

  draw(opts: {
    time: number;
    puck: PuckSample;
    rebounders: readonly Rebounder[];
    encounter: Encounter | null;
    ready: ReadyCircle | null;
    banner: string | null;
  }): void {
    const { ctx } = this;
    const { time, puck, encounter } = opts;
    const dt = clamp(time - this.lastTime, 0, 0.05);
    this.lastTime = time;
    const s = this.scale;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, this.viewW, this.viewH);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";

    this.shake = Math.max(0, this.shake - dt * 1.6);
    if (this.shake > 0.01) {
      ctx.translate((Math.random() - 0.5) * this.shake * s * 0.3, (Math.random() - 0.5) * this.shake * s * 0.3);
    }

    this.drawFloor();

    const needsBolt = encounter ? encounter.alive.some((e) => e.kind === "totem" || e.warded || e.only === "bolt") : false;
    for (const reb of opts.rebounders) this.drawCrystals(reb, needsBolt, time);

    if (encounter) {
      this.drawTelegraphs(encounter);
      for (const f of encounter.fires) {
        const frac = 1 - clamp(f.fuse / f.maxFuse, 0, 1);
        const g = ctx.createRadialGradient(this.px(f.x), this.py(f.y), 0, this.px(f.x), this.py(f.y), f.r * s);
        g.addColorStop(0, `rgba(255,170,60,${0.25 + frac * 0.5})`);
        g.addColorStop(Math.max(0.05, frac), `rgba(255,90,40,${0.3 + frac * 0.3})`);
        g.addColorStop(1, "rgba(160,20,10,0.12)");
        ctx.beginPath();
        ctx.arc(this.px(f.x), this.py(f.y), f.r * s, 0, TAU);
        ctx.fillStyle = g;
        ctx.fill();
        ctx.lineWidth = 3;
        ctx.strokeStyle = "#ff5a3c";
        ctx.stroke();
      }
      if (encounter.ward) this.drawWard(encounter, time);
      for (const p of encounter.pickups) this.drawPickup(p.x, p.y, p.kind, p.life, time);
    }

    if (opts.ready) this.drawReady(opts.ready);

    // Everything standing on the floor, back to front so nearer figures overlap farther ones.
    const standing: { y: number; draw: () => void }[] = [];
    if (encounter) {
      for (const e of encounter.enemies) standing.push({ y: e.y, draw: () => this.drawEnemy(e, encounter, time) });
    }
    standing.sort((a, b) => a.y - b.y);
    for (const item of standing) item.draw();
    // The hero is always drawn last: the player must never lose sight of their own puck behind a figure.
    this.drawHero(puck, encounter, time);

    if (encounter) {
      for (const p of encounter.projectiles) {
        const g = ctx.createRadialGradient(this.px(p.x), this.py(p.y), 0, this.px(p.x), this.py(p.y), p.r * s * 2.2);
        g.addColorStop(0, "#ffffff");
        g.addColorStop(0.3, "#d79bff");
        g.addColorStop(1, "rgba(120,40,200,0)");
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(this.px(p.x), this.py(p.y), p.r * s * 2.2, 0, TAU);
        ctx.fill();
        if (Math.random() < 0.5) this.particles.push({ x: p.x, y: p.y, vx: (Math.random() - 0.5) * 0.6, vy: (Math.random() - 0.5) * 0.6, life: 0.35, max: 0.35, color: "#c58bff", size: 0.06 });
      }
    }

    this.drawEffects(dt);

    if (encounter) {
      for (const f of encounter.floats) {
        ctx.globalAlpha = clamp(1.4 - f.age, 0, 1);
        const pop = f.big ? 1 + Math.max(0, 0.25 - f.age) * 1.6 : 1;
        this.text(f.text, f.x, f.y - 0.5 - f.age * 0.9, s * (f.big ? 0.44 : 0.3) * pop, f.color);
      }
      ctx.globalAlpha = 1;
      if (encounter.reviveLeft > 0) {
        ctx.fillStyle = "rgba(60,0,0,0.5)";
        ctx.fillRect(this.px(0), this.py(0), this.arenaW * s, this.arenaD * s);
        this.text("KNOCKED DOWN", this.arenaW / 2, this.arenaD * 0.34, s * 0.6, "#ff8a75");
        this.text(`${encounter.reviveLeft}`, this.arenaW / 2, this.arenaD * 0.55, s * 1.3, "#fff3c4");
        this.text("quick dribbles to get up!", this.arenaW / 2, this.arenaD * 0.76, s * 0.36, PARCH);
      }
    }

    if (opts.banner) {
      const g = ctx.createLinearGradient(this.px(0), 0, this.px(this.arenaW), 0);
      g.addColorStop(0, "rgba(10,10,12,0)");
      g.addColorStop(0.2, "rgba(10,10,12,0.8)");
      g.addColorStop(0.8, "rgba(10,10,12,0.8)");
      g.addColorStop(1, "rgba(10,10,12,0)");
      ctx.fillStyle = g;
      ctx.fillRect(this.px(0), this.py(this.arenaD * 0.4), this.arenaW * s, this.arenaD * s * 0.2);
      this.text(opts.banner, this.arenaW / 2, this.arenaD * 0.5, s * 0.5, "#ffd75a");
    }
  }

  private text(value: string, x: number, y: number, size: number, color: string): void {
    const { ctx } = this;
    ctx.font = `700 ${Math.max(12, Math.round(size))}px ${FONT}`;
    ctx.lineWidth = Math.max(3, size * 0.18);
    ctx.strokeStyle = "rgba(0,0,0,0.9)";
    ctx.strokeText(value, this.px(x), this.py(y));
    ctx.fillStyle = color;
    ctx.fillText(value, this.px(x), this.py(y));
  }

  // ------------------------------------------------------------------ floor

  /** The rink is painted once per layout: textured ice, engraved runes, timber boards. */
  private buildFloor(): HTMLCanvasElement {
    const s = this.scale;
    const frame = Math.max(14, s * 0.3);
    const w = Math.ceil(this.arenaW * s + frame * 2);
    const h = Math.ceil(this.arenaD * s + frame * 2);
    const c = document.createElement("canvas");
    c.width = Math.ceil(w * this.dpr);
    c.height = Math.ceil(h * this.dpr);
    const g = c.getContext("2d")!;
    g.scale(this.dpr, this.dpr);

    // Boards: dark timber with an iron lip and a gold inlay.
    const wood = g.createLinearGradient(0, 0, 0, h);
    wood.addColorStop(0, "#4a3422");
    wood.addColorStop(0.5, "#2e2014");
    wood.addColorStop(1, "#3b2a1c");
    g.fillStyle = wood;
    g.beginPath();
    g.roundRect(0, 0, w, h, frame * 0.7);
    g.fill();
    g.strokeStyle = "rgba(0,0,0,0.45)";
    g.lineWidth = 1;
    for (let i = 0; i < w; i += 26) {
      g.beginPath();
      g.moveTo(i + (i % 52 === 0 ? 3 : -2), 0);
      g.lineTo(i, h);
      g.stroke();
    }
    g.strokeStyle = "#17120c";
    g.lineWidth = 3;
    g.beginPath();
    g.roundRect(1.5, 1.5, w - 3, h - 3, frame * 0.7);
    g.stroke();

    const ix = frame;
    const iy = frame;
    const iw = this.arenaW * s;
    const ih = this.arenaD * s;
    g.save();
    g.beginPath();
    g.rect(ix, iy, iw, ih);
    g.clip();
    g.fillStyle = "#1d2a36";
    g.fillRect(ix, iy, iw, ih);
    if (this.ice.complete && this.ice.naturalWidth > 0) {
      const pattern = g.createPattern(this.ice, "repeat");
      if (pattern) {
        const tile = (s * 4.5) / this.ice.naturalWidth;
        pattern.setTransform(new DOMMatrix().translate(ix, iy).scale(tile));
        g.globalAlpha = 0.9;
        g.fillStyle = pattern;
        g.fillRect(ix, iy, iw, ih);
        g.globalAlpha = 1;
      }
    }
    // Cold blue wash so bright telegraphs and figures read clearly on top.
    g.fillStyle = "rgba(24,52,84,0.42)";
    g.fillRect(ix, iy, iw, ih);

    // Engraved rune circle and rink lines.
    const cx = ix + iw / 2;
    const cy = iy + ih / 2;
    g.strokeStyle = "rgba(170,215,255,0.2)";
    g.lineWidth = 2;
    for (const r of [1.45, 1.2, 0.5]) {
      g.beginPath();
      g.arc(cx, cy, r * s, 0, TAU);
      g.stroke();
    }
    g.font = `600 ${Math.round(s * 0.2)}px ${FONT}`;
    g.fillStyle = "rgba(170,215,255,0.26)";
    g.textAlign = "center";
    g.textBaseline = "middle";
    const runes = "ᚠᚢᚦᚨᚱᚲᚷᚹᚺᚾᛁᛃᛇᛈᛉᛊᛏᛒ";
    for (let i = 0; i < runes.length; i += 1) {
      const a = (i / runes.length) * TAU;
      g.save();
      g.translate(cx + Math.cos(a) * 1.32 * s, cy + Math.sin(a) * 1.32 * s);
      g.rotate(a + Math.PI / 2);
      g.fillText(runes[i]!, 0, 0);
      g.restore();
    }
    g.strokeStyle = "rgba(190,70,60,0.22)";
    g.lineWidth = Math.max(2, s * 0.05);
    g.beginPath();
    g.moveTo(cx, iy);
    g.lineTo(cx, iy + ih);
    g.stroke();
    g.strokeStyle = "rgba(170,215,255,0.07)";
    g.lineWidth = 1;
    g.beginPath();
    for (let x = 1; x < this.arenaW; x += 1) {
      g.moveTo(ix + x * s, iy);
      g.lineTo(ix + x * s, iy + ih);
    }
    for (let y = 1; y < this.arenaD; y += 1) {
      g.moveTo(ix, iy + y * s);
      g.lineTo(ix + iw, iy + y * s);
    }
    g.stroke();

    // Torchlight from the corners, darkness at the edges.
    for (const [tx, ty] of [[ix, iy], [ix + iw, iy], [ix, iy + ih], [ix + iw, iy + ih]] as const) {
      const glow = g.createRadialGradient(tx, ty, 0, tx, ty, s * 3.2);
      glow.addColorStop(0, "rgba(255,170,90,0.2)");
      glow.addColorStop(1, "rgba(255,170,90,0)");
      g.fillStyle = glow;
      g.fillRect(ix, iy, iw, ih);
    }
    const vig = g.createRadialGradient(cx, cy, Math.min(iw, ih) * 0.3, cx, cy, Math.max(iw, ih) * 0.75);
    vig.addColorStop(0, "rgba(0,0,0,0)");
    vig.addColorStop(1, "rgba(0,0,0,0.5)");
    g.fillStyle = vig;
    g.fillRect(ix, iy, iw, ih);
    g.restore();

    g.strokeStyle = "#0c0d0e";
    g.lineWidth = 4;
    g.strokeRect(ix - 2, iy - 2, iw + 4, ih + 4);
    g.strokeStyle = "rgba(212,175,55,0.7)";
    g.lineWidth = 1.5;
    g.strokeRect(ix - 5, iy - 5, iw + 10, ih + 10);
    // Iron corner plates with rivets.
    for (const [qx, qy] of [[0, 0], [w, 0], [0, h], [w, h]] as const) {
      g.fillStyle = "#3a3c40";
      g.beginPath();
      g.arc(qx, qy, frame * 1.5, 0, TAU);
      g.fill();
      g.fillStyle = "#b9a25a";
      g.beginPath();
      g.arc(qx + (qx === 0 ? 1 : -1) * frame * 0.55, qy + (qy === 0 ? 1 : -1) * frame * 0.55, Math.max(2, frame * 0.14), 0, TAU);
      g.fill();
    }
    return c;
  }

  private drawFloor(): void {
    if (!this.floorCache) this.floorCache = this.buildFloor();
    const frame = Math.max(14, this.scale * 0.3);
    const c = this.floorCache;
    this.ctx.save();
    this.ctx.shadowColor = "rgba(0,0,0,0.8)";
    this.ctx.shadowBlur = 40;
    this.ctx.drawImage(c, this.px(0) - frame, this.py(0) - frame, c.width / this.dpr, c.height / this.dpr);
    this.ctx.restore();
  }

  private drawCrystals(reb: Rebounder, charged: boolean, time: number): void {
    const { ctx } = this;
    const s = this.scale;
    const len = Math.hypot(reb.bx - reb.ax, reb.by - reb.ay);
    const n = Math.max(3, Math.round(len / 0.45));
    const ang = Math.atan2(reb.by - reb.ay, reb.bx - reb.ax);
    const pulse = 0.5 + 0.5 * Math.sin(time * 6);
    ctx.save();
    ctx.shadowColor = charged ? "#ffe07a" : "#58b8ff";
    ctx.shadowBlur = charged ? 26 + pulse * 18 : 12;
    for (let i = 0; i < n; i += 1) {
      const t = (i + 0.5) / n;
      const x = this.px(reb.ax + (reb.bx - reb.ax) * t);
      const y = this.py(reb.ay + (reb.by - reb.ay) * t);
      const h = s * (0.26 + ((i * 37) % 5) * 0.035) * (charged ? 1.15 + pulse * 0.15 : 1);
      const wd = s * 0.13;
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(ang + ((i % 3) - 1) * 0.18);
      const g = ctx.createLinearGradient(-wd, 0, wd, 0);
      if (charged) {
        g.addColorStop(0, "#fff6c9");
        g.addColorStop(0.5, "#ffd75a");
        g.addColorStop(1, "#b98416");
      } else {
        g.addColorStop(0, "#d9f2ff");
        g.addColorStop(0.5, "#6fb6ea");
        g.addColorStop(1, "#285a8c");
      }
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(0, -h);
      ctx.lineTo(wd, -h * 0.25);
      ctx.lineTo(wd * 0.7, h * 0.6);
      ctx.lineTo(-wd * 0.7, h * 0.6);
      ctx.lineTo(-wd, -h * 0.25);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
    ctx.restore();
    if (charged) {
      const mx = (reb.ax + reb.bx) / 2;
      const my = (reb.ay + reb.by) / 2;
      const lx = mx + Math.sign(this.arenaW / 2 - mx) * (Math.abs(this.arenaW / 2 - mx) > 1 ? 1.2 : 0);
      const ly = my + Math.sign(this.arenaD / 2 - my) * (Math.abs(this.arenaD / 2 - my) > 1 ? 0.75 : 0);
      this.text("PASS HERE!", lx, ly, s * 0.34, "#ffd75a");
    }
  }

  private drawReady(r: ReadyCircle): void {
    const { ctx } = this;
    const s = this.scale;
    ctx.beginPath();
    ctx.arc(this.px(r.x), this.py(r.y), r.r * s, 0, TAU);
    ctx.fillStyle = "rgba(212,175,55,0.14)";
    ctx.fill();
    ctx.setLineDash([s * 0.18, s * 0.14]);
    ctx.lineWidth = 3;
    ctx.strokeStyle = GOLD;
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.beginPath();
    ctx.arc(this.px(r.x), this.py(r.y), r.r * s, -Math.PI / 2, -Math.PI / 2 + TAU * clamp(r.progress, 0, 1));
    ctx.lineWidth = Math.max(5, s * 0.14);
    ctx.strokeStyle = "#8fe3a0";
    ctx.stroke();
    this.text(r.label, r.x, r.y - r.r - 0.35, s * 0.32, PARCH);
  }

  private drawWard(enc: Encounter, time: number): void {
    const ward = enc.ward!;
    const { ctx } = this;
    const s = this.scale;
    const x = this.px(ward.x);
    const y = this.py(ward.y);
    const frac = ward.hp / ward.maxHp;
    ctx.beginPath();
    ctx.arc(x, y, (ward.r + 0.35) * s, 0, TAU);
    ctx.strokeStyle = "rgba(0,0,0,0.6)";
    ctx.lineWidth = s * 0.14;
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(x, y, (ward.r + 0.35) * s, -Math.PI / 2, -Math.PI / 2 + TAU * frac);
    ctx.strokeStyle = frac > 0.4 ? "#7fd0ff" : "#ff6b57";
    ctx.lineWidth = s * 0.1;
    ctx.stroke();
    if (enc.wardBroken) return;
    ctx.save();
    ctx.translate(x, y - s * 0.25 + Math.sin(time * 2) * s * 0.04);
    ctx.shadowColor = ward.flash > 0.2 ? "#ff6b57" : "#7fd0ff";
    ctx.shadowBlur = 30;
    const h = s * 1.0;
    const wd = s * 0.42;
    const g = ctx.createLinearGradient(-wd, 0, wd, 0);
    g.addColorStop(0, "#eaf8ff");
    g.addColorStop(0.5, ward.flash > 0.2 ? "#ff9d8a" : "#6fc3f5");
    g.addColorStop(1, "#1f5f96");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(0, -h);
    ctx.lineTo(wd, -h * 0.2);
    ctx.lineTo(wd * 0.6, h * 0.55);
    ctx.lineTo(-wd * 0.6, h * 0.55);
    ctx.lineTo(-wd, -h * 0.2);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
    this.text("WARD", ward.x, ward.y + ward.r + 0.6, s * 0.24, "#bfe6ff");
  }

  private drawPickup(x: number, y: number, kind: "gold" | "heart", life: number, time: number): void {
    const { ctx } = this;
    const s = this.scale;
    const bob = Math.sin(time * 5 + x) * s * 0.05;
    ctx.globalAlpha = life < 2 ? 0.4 + 0.6 * Math.abs(Math.sin(time * 10)) : 1;
    ctx.fillStyle = "rgba(0,0,0,0.4)";
    ctx.beginPath();
    ctx.ellipse(this.px(x), this.py(y) + s * 0.12, s * 0.18, s * 0.07, 0, 0, TAU);
    ctx.fill();
    if (kind === "gold") {
      const g = ctx.createRadialGradient(this.px(x) - s * 0.05, this.py(y) - s * 0.08 + bob, 1, this.px(x), this.py(y) + bob, s * 0.2);
      g.addColorStop(0, "#fff6c9");
      g.addColorStop(0.5, "#f2c53d");
      g.addColorStop(1, "#8a5d0a");
      ctx.fillStyle = g;
      ctx.shadowColor = "#f2c53d";
      ctx.shadowBlur = 14;
      ctx.beginPath();
      ctx.arc(this.px(x), this.py(y) + bob, s * 0.17, 0, TAU);
      ctx.fill();
      ctx.shadowBlur = 0;
    } else {
      ctx.font = `${Math.round(s * 0.4)}px serif`;
      ctx.fillText("❤️", this.px(x), this.py(y) + bob);
    }
    ctx.globalAlpha = 1;
  }

  // ------------------------------------------------------------- telegraphs

  /** Danger areas are painted on the ice before they land, so they can be read and avoided. */
  private drawTelegraphs(enc: Encounter): void {
    const { ctx } = this;
    const s = this.scale;
    // Lanes and cones stop at the boards.
    ctx.save();
    ctx.beginPath();
    ctx.rect(this.px(0), this.py(0), this.arenaW * s, this.arenaD * s);
    ctx.clip();
    for (const e of enc.enemies) {
      if (e.state === "windup" && !(enc.ward && !enc.wardBroken && !e.aggro && (e.kind === "grunt" || e.kind === "brute"))) {
        const { reach, half } = enc.swingShape(e);
        const frac = clamp(e.t / e.dur, 0, 1);
        const x = this.px(e.x);
        const y = this.py(e.y);
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.arc(x, y, reach * s, e.facing - half, e.facing + half);
        ctx.closePath();
        ctx.fillStyle = "rgba(220,50,40,0.2)";
        ctx.fill();
        ctx.strokeStyle = "rgba(255,90,60,0.9)";
        ctx.lineWidth = 2.5;
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.arc(x, y, reach * s * frac, e.facing - half, e.facing + half);
        ctx.closePath();
        ctx.fillStyle = "rgba(255,90,50,0.5)";
        ctx.fill();
      } else if (e.state === "aim" || e.state === "charge") {
        const frac = e.state === "charge" ? 1 : clamp(e.t / e.dur, 0, 1);
        const locked = e.state === "charge" || frac >= 0.6;
        ctx.save();
        ctx.translate(this.px(e.x), this.py(e.y));
        ctx.rotate(e.facing);
        const len = (this.arenaW + this.arenaD) * s;
        const half = (e.r + 0.35) * s;
        ctx.beginPath();
        ctx.rect(0, -half, len, half * 2);
        ctx.fillStyle = locked ? `rgba(255,70,45,${0.22 + frac * 0.22})` : "rgba(255,170,60,0.16)";
        ctx.fill();
        ctx.strokeStyle = locked ? "rgba(255,90,60,0.9)" : "rgba(255,190,90,0.7)";
        ctx.lineWidth = 2;
        ctx.setLineDash(locked ? [] : [10, 10]);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.strokeStyle = "rgba(255,230,200,0.55)";
        ctx.lineWidth = 3;
        for (let d = s * 1.2; d < s * 9; d += s * 1.2) {
          ctx.beginPath();
          ctx.moveTo(d - half * 0.5, -half * 0.6);
          ctx.lineTo(d, 0);
          ctx.lineTo(d - half * 0.5, half * 0.6);
          ctx.stroke();
        }
        ctx.restore();
      } else if (e.state === "cast" && e.pending !== "bombs" && e.t > e.dur * 0.35) {
        const spread = e.kind === "boss" ? [-0.38, 0, 0.38] : [0];
        ctx.strokeStyle = `rgba(200,130,255,${e.t > e.dur * 0.7 ? 0.8 : 0.35})`;
        ctx.lineWidth = 2;
        ctx.setLineDash([6, 8]);
        for (const off of spread) {
          ctx.beginPath();
          ctx.moveTo(this.px(e.x), this.py(e.y));
          ctx.lineTo(this.px(e.x + Math.cos(e.facing + off) * 14), this.py(e.y + Math.sin(e.facing + off) * 14));
          ctx.stroke();
        }
        ctx.setLineDash([]);
      }
    }
    ctx.restore();
  }

  // ---------------------------------------------------------------- figures

  private drawEnemy(e: Enemy, enc: Encounter, time: number): void {
    const { ctx } = this;
    const s = this.scale;
    const x = this.px(e.x);
    const y = this.py(e.y);
    const appear = e.state === "spawn" ? clamp(e.t / e.dur, 0, 1) : e.state === "dead" ? 1 - clamp(e.t / 0.6, 0, 1) : 1;
    if (appear <= 0) return;
    ctx.save();
    ctx.globalAlpha = appear;

    // Footprint: target ring, facing wedge, weak back, shield.
    const hasBack = e.kind === "grunt" || e.kind === "brute" || e.kind === "berserker" || e.kind === "shaman" || e.kind === "boss";
    if (enc.target === e && e.state !== "dead") {
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(time * 1.2);
      ctx.setLineDash([s * 0.22, s * 0.16]);
      ctx.lineWidth = 3;
      ctx.strokeStyle = "#ffd75a";
      ctx.beginPath();
      ctx.arc(0, 0, (e.r + 0.32) * s, 0, TAU);
      ctx.stroke();
      ctx.restore();
    }
    ctx.fillStyle = "rgba(0,0,0,0.45)";
    ctx.beginPath();
    ctx.ellipse(x, y, e.r * s * 1.05, e.r * s * 0.6, 0, 0, TAU);
    ctx.fill();
    if (hasBack && e.state !== "dead") {
      ctx.lineWidth = Math.max(3, s * 0.07);
      ctx.strokeStyle = "rgba(143,227,160,0.75)";
      ctx.beginPath();
      ctx.arc(x, y, (e.r + 0.14) * s, e.facing + 1.9, e.facing + TAU - 1.9);
      ctx.stroke();
      ctx.fillStyle = "rgba(255,120,90,0.85)";
      ctx.beginPath();
      ctx.moveTo(x + Math.cos(e.facing) * (e.r + 0.42) * s, y + Math.sin(e.facing) * (e.r + 0.42) * s);
      ctx.lineTo(x + Math.cos(e.facing + 0.5) * (e.r + 0.1) * s, y + Math.sin(e.facing + 0.5) * (e.r + 0.1) * s);
      ctx.lineTo(x + Math.cos(e.facing - 0.5) * (e.r + 0.1) * s, y + Math.sin(e.facing - 0.5) * (e.r + 0.1) * s);
      ctx.closePath();
      ctx.fill();
    }
    if (e.shield && e.state !== "dead") {
      const up = e.shieldDown <= 0 && e.stun <= 0;
      ctx.lineWidth = Math.max(5, s * 0.14);
      ctx.strokeStyle = up ? "#8fc7ff" : "rgba(143,199,255,0.25)";
      ctx.shadowColor = "#8fc7ff";
      ctx.shadowBlur = up ? 16 : 0;
      ctx.setLineDash(up ? [] : [8, 10]);
      ctx.beginPath();
      ctx.arc(x, y, (e.r + 0.3) * s, e.facing - 1.25, e.facing + 1.25);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.shadowBlur = 0;
    }
    if (e.warded) {
      ctx.lineWidth = 4;
      ctx.strokeStyle = `rgba(255,215,90,${0.6 + 0.4 * Math.sin(time * 8)})`;
      ctx.shadowColor = "#ffd75a";
      ctx.shadowBlur = 24;
      ctx.beginPath();
      ctx.arc(x, y - e.r * s * 0.8, (e.r + 0.9) * s, 0, TAU);
      ctx.stroke();
      ctx.shadowBlur = 0;
    }

    const { img, height } = this.enemySprite(e);
    const bob = e.stun > 0 ? 0 : Math.sin(e.phase * (e.state === "move" ? 7 : 3)) * s * 0.03;
    let top = y - height * s;
    if (img) {
      const iw = "naturalWidth" in img ? img.naturalWidth : img.width;
      const ih = "naturalHeight" in img ? img.naturalHeight : img.height;
      const h = height * s;
      const w = (iw / ih) * h;
      const lean = e.state === "windup" ? -0.12 * Math.sin(clamp(e.t / e.dur, 0, 1) * Math.PI) : e.state === "charge" ? 0.2 : 0;
      ctx.save();
      ctx.translate(x, y + e.r * s * 0.3 + bob);
      if (Math.cos(e.facing) < 0) ctx.scale(-1, 1);
      ctx.rotate(lean);
      if (e.kind === "boss") {
        ctx.shadowColor = "rgba(255,120,40,0.9)";
        ctx.shadowBlur = 30;
      }
      ctx.drawImage(img, -w / 2, -h, w, h);
      ctx.shadowBlur = 0;
      if (e.flash > 0.05) {
        ctx.globalCompositeOperation = "lighter";
        ctx.globalAlpha = appear * e.flash * 0.8;
        ctx.drawImage(img, -w / 2, -h, w, h);
        ctx.globalCompositeOperation = "source-over";
        ctx.globalAlpha = appear;
      }
      ctx.restore();
      top = y + e.r * s * 0.3 - h;
    } else if (e.kind === "wisp") {
      const r = e.r * s * (1.5 + 0.2 * Math.sin(e.phase * 9));
      const cy = y - s * 0.35 + bob * 3;
      const g = ctx.createRadialGradient(x, cy, 0, x, cy, r * 1.8);
      g.addColorStop(0, "#ffffff");
      g.addColorStop(0.25, e.frozen ? "#bfe9ff" : "#c9b4ff");
      g.addColorStop(1, "rgba(110,70,220,0)");
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(x, cy, r * 1.8, 0, TAU);
      ctx.fill();
      ctx.fillStyle = "#2a1850";
      ctx.beginPath();
      ctx.arc(x - r * 0.22, cy - r * 0.05, r * 0.11, 0, TAU);
      ctx.arc(x + r * 0.22, cy - r * 0.05, r * 0.11, 0, TAU);
      ctx.fill();
      top = cy - r;
    } else if (e.kind === "totem") {
      const h = s * 1.7;
      const w = s * 0.75;
      top = y - h;
      const g = ctx.createLinearGradient(x - w / 2, 0, x + w / 2, 0);
      g.addColorStop(0, "#7d7466");
      g.addColorStop(0.45, "#5c5346");
      g.addColorStop(1, "#2f2a23");
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.roundRect(x - w / 2, top, w, h + e.r * s * 0.3, w * 0.25);
      ctx.fill();
      ctx.strokeStyle = "#15120e";
      ctx.lineWidth = 2;
      ctx.stroke();
      const glow = 0.6 + 0.4 * Math.sin(time * 4 + e.id);
      ctx.fillStyle = `rgba(120,255,150,${glow})`;
      ctx.shadowColor = "#6dff95";
      ctx.shadowBlur = 16;
      for (const row of [0.22, 0.52]) {
        ctx.beginPath();
        ctx.ellipse(x - w * 0.2, top + h * row, w * 0.11, w * 0.07, 0, 0, TAU);
        ctx.ellipse(x + w * 0.2, top + h * row, w * 0.11, w * 0.07, 0, 0, TAU);
        ctx.fill();
        ctx.fillRect(x - w * 0.18, top + h * (row + 0.1), w * 0.36, w * 0.06);
      }
      ctx.shadowBlur = 0;
      if (e.flash > 0.05) {
        ctx.fillStyle = `rgba(255,255,255,${e.flash * 0.6})`;
        ctx.fillRect(x - w / 2, top, w, h);
      }
    } else {
      // Training post.
      const h = s * 1.35;
      const w = s * 0.42;
      top = y - h;
      const g = ctx.createLinearGradient(x - w / 2, 0, x + w / 2, 0);
      g.addColorStop(0, "#8a6238");
      g.addColorStop(0.5, "#5e4023");
      g.addColorStop(1, "#33210f");
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.roundRect(x - w / 2, top, w, h + e.r * s * 0.2, w * 0.3);
      ctx.fill();
      ctx.strokeStyle = "#17100a";
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.strokeStyle = "#d8c08a";
      ctx.lineWidth = Math.max(3, s * 0.06);
      for (const row of [0.25, 0.36, 0.47]) {
        ctx.beginPath();
        ctx.moveTo(x - w / 2, top + h * row);
        ctx.lineTo(x + w / 2, top + h * (row + 0.04));
        ctx.stroke();
      }
      ctx.fillStyle = "#b13a1a";
      ctx.beginPath();
      ctx.arc(x, top + h * 0.7, w * 0.3, 0, TAU);
      ctx.fill();
      if (e.flash > 0.05) {
        ctx.fillStyle = `rgba(255,255,255,${e.flash * 0.5})`;
        ctx.fillRect(x - w / 2, top, w, h);
      }
      if (e.only) this.text(e.name.replace("Post: ", ""), e.x, e.y + e.r + 0.45, s * 0.24, "#ffd75a");
    }

    // Overhead: health, cast bar, status.
    if (e.state !== "dead" && e.kind !== "wisp" && e.kind !== "runner" && !(enc.timed && e.kind === "dummy") && e.kind !== "boss") {
      const bw = Math.max(s * 0.9, e.r * s * 2);
      const bx = x - bw / 2;
      const by = top - s * 0.22;
      ctx.fillStyle = "#0c0d0e";
      ctx.fillRect(bx - 2, by - 2, bw + 4, s * 0.11 + 4);
      ctx.fillStyle = e.hp / e.maxHp > 0.35 ? "#c8402c" : "#ff8a3c";
      ctx.fillRect(bx, by, bw * clamp(e.hp / e.maxHp, 0, 1), s * 0.11);
    }
    if (e.state === "cast") {
      const frac = clamp(e.t / e.dur, 0, 1);
      const cy = top + s * 0.1;
      const g = ctx.createRadialGradient(x, cy, 0, x, cy, s * (0.15 + frac * 0.35));
      g.addColorStop(0, "#ffffff");
      g.addColorStop(0.4, e.pending === "bombs" ? "#ff9a4a" : "#d79bff");
      g.addColorStop(1, "rgba(120,40,200,0)");
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(x, cy, s * (0.15 + frac * 0.35), 0, TAU);
      ctx.fill();
    }
    if (e.stun > 0 && e.state !== "dead") {
      for (let i = 0; i < 3; i += 1) {
        const a = time * 4 + (i * TAU) / 3;
        this.textPx(e.frozen ? "❄" : "★", x + Math.cos(a) * s * 0.4, top - s * 0.05 + Math.sin(a) * s * 0.12, s * 0.26, e.frozen ? "#bfe9ff" : "#ffd75a");
      }
    }
    ctx.restore();
  }

  private textPx(value: string, x: number, y: number, size: number, color: string): void {
    const { ctx } = this;
    ctx.font = `700 ${Math.max(10, Math.round(size))}px ${FONT}`;
    ctx.lineWidth = 3;
    ctx.strokeStyle = "rgba(0,0,0,0.85)";
    ctx.strokeText(value, x, y);
    ctx.fillStyle = color;
    ctx.fillText(value, x, y);
  }

  /** The puck is the hero: a glowing rune-disc that leaves a ribbon of light. */
  private drawHero(puck: PuckSample, enc: Encounter | null, time: number): void {
    const { ctx } = this;
    const s = this.scale;
    if (puck.visible) {
      this.trail.push({ x: puck.x, y: puck.y });
      if (this.trail.length > 18) this.trail.shift();
    } else if (this.trail.length > 0) {
      this.trail.shift();
    }
    ctx.save();
    ctx.shadowColor = this.heroColor;
    ctx.shadowBlur = 14;
    for (let i = 1; i < this.trail.length; i += 1) {
      const a = this.trail[i - 1]!;
      const b = this.trail[i]!;
      const f = i / this.trail.length;
      ctx.beginPath();
      ctx.moveTo(this.px(a.x), this.py(a.y));
      ctx.lineTo(this.px(b.x), this.py(b.y));
      ctx.lineWidth = f * s * 0.24;
      ctx.globalAlpha = f * 0.75;
      ctx.strokeStyle = this.heroColor;
      ctx.stroke();
    }
    ctx.restore();

    const x = this.px(puck.x);
    const y = this.py(puck.y);
    const r = Math.max(10, s * 0.24);
    if (!puck.visible) {
      ctx.setLineDash([5, 5]);
      ctx.lineWidth = 3;
      ctx.strokeStyle = `rgba(220,220,220,${0.4 + 0.3 * Math.sin(time * 8)})`;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, TAU);
      ctx.stroke();
      ctx.setLineDash([]);
      return;
    }
    const empowered = enc ? enc.empowered > 0 : false;
    const ready = enc ? enc.signatureReady : false;
    if (empowered || ready) {
      const aura = ctx.createRadialGradient(x, y, r * 0.5, x, y, r * (3 + Math.sin(time * 10) * 0.4));
      aura.addColorStop(0, empowered ? "rgba(143,227,160,0.75)" : "rgba(255,215,90,0.6)");
      aura.addColorStop(1, "rgba(255,255,255,0)");
      ctx.fillStyle = aura;
      ctx.beginPath();
      ctx.arc(x, y, r * 3.4, 0, TAU);
      ctx.fill();
    }
    ctx.fillStyle = "rgba(0,0,0,0.5)";
    ctx.beginPath();
    ctx.ellipse(x, y + r * 0.35, r * 1.1, r * 0.55, 0, 0, TAU);
    ctx.fill();
    ctx.save();
    ctx.shadowColor = this.heroColor;
    ctx.shadowBlur = 22;
    const g = ctx.createRadialGradient(x - r * 0.3, y - r * 0.35, r * 0.1, x, y, r);
    g.addColorStop(0, "#ffffff");
    g.addColorStop(0.35, this.heroColor);
    g.addColorStop(1, "#0f1a14");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, TAU);
    ctx.fill();
    ctx.restore();
    ctx.lineWidth = Math.max(2, r * 0.16);
    ctx.strokeStyle = GOLD;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, TAU);
    ctx.stroke();
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(time * 1.5);
    ctx.strokeStyle = "rgba(255,255,255,0.8)";
    ctx.lineWidth = Math.max(1.5, r * 0.1);
    ctx.beginPath();
    for (let i = 0; i < 3; i += 1) {
      const a = (i * TAU) / 3;
      ctx.moveTo(0, 0);
      ctx.lineTo(Math.cos(a) * r * 0.6, Math.sin(a) * r * 0.6);
    }
    ctx.stroke();
    ctx.restore();
  }

  // ---------------------------------------------------------------- effects

  private drawEffects(dt: number): void {
    const { ctx } = this;
    const s = this.scale;
    for (let i = this.effects.length - 1; i >= 0; i -= 1) {
      const fx = this.effects[i]!;
      fx.age += dt;
      if (fx.type === "slash") {
        const life = 0.22;
        if (fx.age > life) {
          this.effects.splice(i, 1);
          continue;
        }
        const f = fx.age / life;
        ctx.save();
        ctx.translate(this.px(fx.x), this.py(fx.y));
        ctx.rotate(fx.ang);
        ctx.globalAlpha = 1 - f;
        ctx.strokeStyle = fx.crit ? "#ffe9a0" : "#ffffff";
        ctx.shadowColor = fx.crit ? "#ffb23c" : "#cfe6ff";
        ctx.shadowBlur = 16;
        ctx.lineWidth = s * (fx.crit ? 0.16 : 0.1) * (1 - f * 0.6);
        ctx.beginPath();
        ctx.arc(-s * 0.5, 0, s * (fx.crit ? 1.0 : 0.75), -0.9 + f * 0.5, 0.9 + f * 0.5);
        ctx.stroke();
        ctx.restore();
      } else if (fx.type === "bolt") {
        const life = 0.3;
        if (fx.age > life) {
          this.effects.splice(i, 1);
          continue;
        }
        ctx.save();
        ctx.globalAlpha = 1 - fx.age / life;
        ctx.shadowColor = "#9fd0ff";
        ctx.shadowBlur = 22;
        for (const [width, color] of [[s * 0.16, "rgba(120,180,255,0.7)"], [s * 0.06, "#ffffff"]] as const) {
          ctx.strokeStyle = color;
          ctx.lineWidth = width;
          ctx.beginPath();
          ctx.moveTo(this.px(fx.x1), this.py(fx.y1));
          const segs = 9;
          for (let k = 1; k < segs; k += 1) {
            const t = k / segs;
            const jx = (Math.random() - 0.5) * 0.5;
            const jy = (Math.random() - 0.5) * 0.5;
            ctx.lineTo(this.px(fx.x1 + (fx.x2 - fx.x1) * t + jx), this.py(fx.y1 + (fx.y2 - fx.y1) * t + jy));
          }
          ctx.lineTo(this.px(fx.x2), this.py(fx.y2));
          ctx.stroke();
        }
        ctx.restore();
      } else if (fx.type === "ring") {
        const life = 0.6;
        if (fx.age > life) {
          this.effects.splice(i, 1);
          continue;
        }
        const f = fx.age / life;
        ctx.save();
        ctx.globalAlpha = 1 - f;
        const x = this.px(fx.x);
        const y = this.py(fx.y);
        const g = ctx.createRadialGradient(x, y, 0, x, y, fx.r * s);
        g.addColorStop(0, "rgba(255,255,255,0)");
        g.addColorStop(0.75, "rgba(160,220,255,0.25)");
        g.addColorStop(1, "rgba(160,220,255,0.55)");
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(x, y, fx.r * s * (1 + f * 0.15), 0, TAU);
        ctx.fill();
        ctx.strokeStyle = fx.color;
        ctx.shadowColor = fx.color;
        ctx.shadowBlur = 20;
        ctx.lineWidth = s * 0.1 * (1 - f);
        ctx.stroke();
        ctx.restore();
      } else {
        const life = 0.5;
        if (fx.age > life) {
          this.effects.splice(i, 1);
          continue;
        }
        ctx.save();
        ctx.globalAlpha = (1 - fx.age / life) * 0.8;
        ctx.strokeStyle = "#7dff9c";
        ctx.shadowColor = "#7dff9c";
        ctx.shadowBlur = 14;
        ctx.lineWidth = s * 0.07;
        ctx.setLineDash([s * 0.2, s * 0.15]);
        ctx.lineDashOffset = -fx.age * s * 6;
        ctx.beginPath();
        ctx.moveTo(this.px(fx.x1), this.py(fx.y1) - s * 0.8);
        ctx.lineTo(this.px(fx.x2), this.py(fx.y2) - s * 0.8);
        ctx.stroke();
        ctx.restore();
      }
    }

    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    for (let i = this.particles.length - 1; i >= 0; i -= 1) {
      const p = this.particles[i]!;
      p.life -= dt;
      if (p.life <= 0) {
        this.particles.splice(i, 1);
        continue;
      }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += 5 * dt;
      p.vx *= 1 - 2 * dt;
      ctx.globalAlpha = clamp(p.life / p.max, 0, 1);
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(this.px(p.x), this.py(p.y), p.size * s, 0, TAU);
      ctx.fill();
    }
    ctx.restore();
    ctx.globalAlpha = 1;
  }
}
