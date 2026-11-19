import type { Rebounder } from "../input/calibration";
import type { PuckSample } from "../input/PuckSource";
import type { Encounter } from "../game/encounter";
import { clamp, TAU } from "../util";

export type Insets = { top: number; right: number; bottom: number; left: number };

export type ReadyCircle = { x: number; y: number; r: number; progress: number; label: string };

const GOLD = "#d4af37";
const PARCH = "#e6dcc4";

/**
 * Draws the top-down floor on the TV. One foot on the floor is `scale` pixels,
 * so everything the kids see lines up with where the puck really is.
 */
export class ArenaRenderer {
  readonly ctx: CanvasRenderingContext2D;
  private viewW = 1;
  private viewH = 1;
  private dpr = 1;
  private ox = 0;
  private oy = 0;
  scale = 50;
  private readonly trail: { x: number; y: number }[] = [];

  constructor(readonly canvas: HTMLCanvasElement, private arenaW: number, private arenaD: number) {
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("2D canvas unavailable");
    this.ctx = ctx;
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
    const s = this.scale;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, this.viewW, this.viewH);
    ctx.lineCap = "round";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";

    this.drawFloor();

    const litId = encounter?.objective?.kind === "bolt" ? encounter.objective.rebounderId : null;
    for (const reb of opts.rebounders) this.drawRebounder(reb, reb.id === litId, time);

    if (encounter) {
      this.drawObjective(encounter, time);
      this.drawHazards(encounter, time);
    }

    if (opts.ready) {
      const r = opts.ready;
      ctx.beginPath();
      ctx.arc(this.px(r.x), this.py(r.y), r.r * s, 0, TAU);
      ctx.fillStyle = "rgba(212,175,55,0.12)";
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

    this.drawPuck(puck, time);

    if (encounter) {
      for (const f of encounter.floats) {
        const rise = f.age * 0.9;
        ctx.globalAlpha = clamp(1.4 - f.age, 0, 1);
        this.text(f.text, f.x, f.y - 0.4 - rise, s * (f.big ? 0.46 : 0.3), f.color);
      }
      ctx.globalAlpha = 1;
      if (encounter.reviveLeft > 0) {
        ctx.fillStyle = "rgba(60,0,0,0.45)";
        ctx.fillRect(this.px(0), this.py(0), this.arenaW * s, this.arenaD * s);
        this.text("KNOCKED DOWN", this.arenaW / 2, this.arenaD * 0.36, s * 0.6, "#ff8a75");
        this.text(`${encounter.reviveLeft}`, this.arenaW / 2, this.arenaD * 0.56, s * 1.3, "#fff3c4");
        this.text("quick dribbles to get up!", this.arenaW / 2, this.arenaD * 0.76, s * 0.36, PARCH);
      }
    }

    if (opts.banner) {
      ctx.fillStyle = "rgba(10,10,12,0.6)";
      ctx.fillRect(this.px(0), this.py(this.arenaD * 0.4), this.arenaW * s, this.arenaD * s * 0.2);
      this.text(opts.banner, this.arenaW / 2, this.arenaD * 0.5, s * 0.5, "#ffd75a");
    }
  }

  private text(value: string, x: number, y: number, size: number, color: string): void {
    const { ctx } = this;
    ctx.font = `700 ${Math.max(12, Math.round(size))}px "Cinzel", "Palatino Linotype", Georgia, serif`;
    ctx.lineWidth = Math.max(3, size * 0.16);
    ctx.strokeStyle = "rgba(0,0,0,0.85)";
    ctx.lineJoin = "round";
    ctx.strokeText(value, this.px(x), this.py(y));
    ctx.fillStyle = color;
    ctx.fillText(value, this.px(x), this.py(y));
  }

  private drawFloor(): void {
    const { ctx } = this;
    const s = this.scale;
    const x0 = this.px(0);
    const y0 = this.py(0);
    const w = this.arenaW * s;
    const h = this.arenaD * s;
    const ice = ctx.createLinearGradient(0, y0, 0, y0 + h);
    ice.addColorStop(0, "#22303d");
    ice.addColorStop(1, "#18222c");
    ctx.fillStyle = ice;
    ctx.fillRect(x0, y0, w, h);
    ctx.strokeStyle = "rgba(160,190,215,0.08)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = 1; x < this.arenaW; x += 1) {
      ctx.moveTo(this.px(x), y0);
      ctx.lineTo(this.px(x), y0 + h);
    }
    for (let y = 1; y < this.arenaD; y += 1) {
      ctx.moveTo(x0, this.py(y));
      ctx.lineTo(x0 + w, this.py(y));
    }
    ctx.stroke();
    ctx.lineWidth = 6;
    ctx.strokeStyle = "#4a4a48";
    ctx.strokeRect(x0 - 3, y0 - 3, w + 6, h + 6);
    ctx.lineWidth = 2;
    ctx.strokeStyle = "rgba(212,175,55,0.55)";
    ctx.strokeRect(x0 - 7, y0 - 7, w + 14, h + 14);
  }

  private drawRebounder(reb: Rebounder, lit: boolean, time: number): void {
    const { ctx } = this;
    const s = this.scale;
    const pulse = 0.5 + 0.5 * Math.sin(time * 7);
    ctx.beginPath();
    ctx.moveTo(this.px(reb.ax), this.py(reb.ay));
    ctx.lineTo(this.px(reb.bx), this.py(reb.by));
    ctx.lineWidth = lit ? s * (0.28 + pulse * 0.1) : s * 0.16;
    ctx.strokeStyle = lit ? `rgba(255,215,90,${0.75 + pulse * 0.25})` : "rgba(111,168,220,0.75)";
    ctx.shadowColor = lit ? "#ffd75a" : "#6fa8dc";
    ctx.shadowBlur = lit ? 30 : 8;
    ctx.stroke();
    ctx.shadowBlur = 0;
    if (lit) {
      const mx = (reb.ax + reb.bx) / 2;
      const my = (reb.ay + reb.by) / 2;
      // Nudge the label toward the middle of the floor so it stays on screen.
      const lx = mx + Math.sign(this.arenaW / 2 - mx) * (Math.abs(this.arenaW / 2 - mx) > 1 ? 1.1 : 0);
      const ly = my + Math.sign(this.arenaD / 2 - my) * (Math.abs(this.arenaD / 2 - my) > 1 ? 0.7 : 0);
      this.text("PASS HERE!", lx, ly, s * 0.38, "#ffd75a");
    }
  }

  private drawObjective(enc: Encounter, time: number): void {
    const o = enc.objective;
    if (!o) return;
    const { ctx } = this;
    const s = this.scale;
    const pulse = 0.5 + 0.5 * Math.sin(time * 6);
    const pad = (x: number, y: number, r: number, active: boolean): void => {
      ctx.beginPath();
      ctx.arc(this.px(x), this.py(y), r * s, 0, TAU);
      ctx.fillStyle = active ? `rgba(255,215,90,${0.3 + pulse * 0.25})` : "rgba(160,170,180,0.1)";
      ctx.fill();
      ctx.lineWidth = active ? 5 : 2;
      ctx.strokeStyle = active ? "#ffd75a" : "rgba(200,200,200,0.35)";
      ctx.stroke();
    };
    switch (o.kind) {
      case "runes": {
        pad(o.x, o.y, o.r, true);
        ctx.beginPath();
        ctx.arc(this.px(o.x), this.py(o.y), (o.r + 0.16) * s, -Math.PI / 2, -Math.PI / 2 + TAU * clamp(o.ttl / o.maxTtl, 0, 1));
        ctx.lineWidth = 4;
        ctx.strokeStyle = PARCH;
        ctx.stroke();
        this.text("✦", o.x, o.y, o.r * s * 1.1, "#fff3c4");
        break;
      }
      case "twin": {
        ctx.beginPath();
        ctx.moveTo(this.px(o.a.x), this.py(o.a.y));
        ctx.lineTo(this.px(o.b.x), this.py(o.b.y));
        ctx.setLineDash([8, 10]);
        ctx.lineWidth = 2;
        ctx.strokeStyle = "rgba(255,215,90,0.4)";
        ctx.stroke();
        ctx.setLineDash([]);
        pad(o.a.x, o.a.y, o.r, o.next === 0);
        pad(o.b.x, o.b.y, o.r, o.next === 1);
        break;
      }
      case "weave": {
        [o.a, o.b].forEach((p, index) => {
          const active = o.cur === index;
          if (active) {
            ctx.beginPath();
            ctx.arc(this.px(p.x), this.py(p.y), 1.0 * s, 0, TAU);
            ctx.setLineDash([8, 10]);
            ctx.lineWidth = 2;
            ctx.strokeStyle = "rgba(255,215,90,0.45)";
            ctx.stroke();
            ctx.setLineDash([]);
            const frac = clamp(Math.abs(o.acc) / (TAU * 0.85), 0, 1);
            ctx.beginPath();
            ctx.arc(this.px(p.x), this.py(p.y), 1.0 * s, -Math.PI / 2, -Math.PI / 2 + TAU * frac);
            ctx.lineWidth = 7;
            ctx.strokeStyle = "#8fe3a0";
            ctx.stroke();
          }
          ctx.beginPath();
          ctx.arc(this.px(p.x), this.py(p.y), 0.32 * s, 0, TAU);
          ctx.fillStyle = active ? "#ffd75a" : "#5c5346";
          ctx.fill();
          ctx.lineWidth = 3;
          ctx.strokeStyle = "#1f2123";
          ctx.stroke();
        });
        const p = o.cur === 0 ? o.a : o.b;
        this.text("CIRCLE", p.x, p.y - 1.35, s * 0.3, "#ffd75a");
        break;
      }
      case "bolt":
        break;
      case "hold": {
        pad(o.x, o.y, o.r, true);
        ctx.beginPath();
        ctx.arc(this.px(o.x), this.py(o.y), o.r * s * clamp(o.progress / 0.9, 0, 1), 0, TAU);
        ctx.fillStyle = "rgba(143,227,160,0.7)";
        ctx.fill();
        this.text("STOP IT HERE", o.x, o.y - o.r - 0.35, s * 0.3, "#ffd75a");
        break;
      }
    }
  }

  private drawHazards(enc: Encounter, time: number): void {
    const { ctx } = this;
    const s = this.scale;
    for (const hz of enc.hazards) {
      if (hz.kind === "fire") {
        const frac = 1 - clamp(hz.fuse / hz.maxFuse, 0, 1);
        ctx.beginPath();
        ctx.arc(this.px(hz.x), this.py(hz.y), hz.r * s, 0, TAU);
        ctx.fillStyle = "rgba(224,60,40,0.22)";
        ctx.fill();
        ctx.lineWidth = 4;
        ctx.strokeStyle = "#ff5a3c";
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(this.px(hz.x), this.py(hz.y), hz.r * s * frac, 0, TAU);
        ctx.fillStyle = "rgba(255,110,50,0.55)";
        ctx.fill();
      } else if (hz.kind === "wave") {
        const thick = 0.35 * s;
        ctx.fillStyle = "rgba(255,90,60,0.8)";
        ctx.shadowColor = "#ff5a3c";
        ctx.shadowBlur = 18;
        const g0 = hz.gap - hz.gapWidth / 2;
        const g1 = hz.gap + hz.gapWidth / 2;
        if (hz.axis === "x") {
          const x = this.px(clamp(hz.pos, 0, this.arenaW)) - thick / 2;
          ctx.fillRect(x, this.py(0), thick, g0 * s);
          ctx.fillRect(x, this.py(g1), thick, (this.arenaD - g1) * s);
        } else {
          const y = this.py(clamp(hz.pos, 0, this.arenaD)) - thick / 2;
          ctx.fillRect(this.px(0), y, g0 * s, thick);
          ctx.fillRect(this.px(g1), y, (this.arenaW - g1) * s, thick);
        }
        ctx.shadowBlur = 0;
        // Mark the safe lane across the whole floor so it can be read early.
        ctx.fillStyle = "rgba(143,227,160,0.13)";
        if (hz.axis === "x") ctx.fillRect(this.px(0), this.py(g0), this.arenaW * s, hz.gapWidth * s);
        else ctx.fillRect(this.px(g0), this.py(0), hz.gapWidth * s, this.arenaD * s);
      } else if (hz.kind === "chaser") {
        const wobble = Math.sin(time * 12) * 0.05;
        ctx.beginPath();
        ctx.arc(this.px(hz.x), this.py(hz.y), (0.38 + wobble) * s, 0, TAU);
        ctx.fillStyle = "rgba(176,111,224,0.85)";
        ctx.shadowColor = "#b06fe0";
        ctx.shadowBlur = 24;
        ctx.fill();
        ctx.shadowBlur = 0;
        ctx.fillStyle = "#fff";
        ctx.beginPath();
        ctx.arc(this.px(hz.x - 0.12), this.py(hz.y - 0.05), 0.07 * s, 0, TAU);
        ctx.arc(this.px(hz.x + 0.12), this.py(hz.y - 0.05), 0.07 * s, 0, TAU);
        ctx.fill();
      } else {
        ctx.beginPath();
        ctx.arc(this.px(hz.x), this.py(hz.y), hz.r * s, 0, TAU);
        ctx.fillStyle = "rgba(30,30,34,0.9)";
        ctx.fill();
        ctx.lineWidth = 5;
        ctx.strokeStyle = hz.sigil.color;
        ctx.stroke();
        this.text(hz.sigil.glyph, hz.x, hz.y + 0.02, hz.r * s * 1.25, hz.sigil.color);
      }
    }
  }

  private drawPuck(puck: PuckSample, time: number): void {
    const { ctx } = this;
    const s = this.scale;
    if (puck.visible) {
      this.trail.push({ x: puck.x, y: puck.y });
      if (this.trail.length > 14) this.trail.shift();
    } else if (this.trail.length > 0) {
      this.trail.shift();
    }
    for (let i = 1; i < this.trail.length; i += 1) {
      const a = this.trail[i - 1]!;
      const b = this.trail[i]!;
      ctx.beginPath();
      ctx.moveTo(this.px(a.x), this.py(a.y));
      ctx.lineTo(this.px(b.x), this.py(b.y));
      ctx.lineWidth = (i / this.trail.length) * s * 0.22;
      ctx.strokeStyle = `rgba(120,255,150,${(i / this.trail.length) * 0.5})`;
      ctx.stroke();
    }
    const r = Math.max(7, s * 0.17);
    ctx.beginPath();
    ctx.arc(this.px(puck.x), this.py(puck.y), r, 0, TAU);
    if (puck.visible) {
      ctx.fillStyle = "#59e07a";
      ctx.shadowColor = "#59e07a";
      ctx.shadowBlur = 22;
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.lineWidth = 3;
      ctx.strokeStyle = "#0f1113";
      ctx.stroke();
    } else {
      ctx.setLineDash([5, 5]);
      ctx.lineWidth = 3;
      ctx.strokeStyle = `rgba(200,200,200,${0.4 + 0.3 * Math.sin(time * 8)})`;
      ctx.stroke();
      ctx.setLineDash([]);
    }
  }
}
