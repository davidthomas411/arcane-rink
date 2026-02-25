import type { PuckProvider } from "../providers/PuckProvider";
import { drawPad, padToPixel, type Rect } from "./PadRenderer2D";

type TrailPoint = {
  x: number;
  y: number;
  age: number;
};

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export class TrackingHUD {
  private readonly provider: PuckProvider;
  private readonly overlayRoot: HTMLElement;
  private readonly inputLabel: string;
  private readonly trail: TrailPoint[] = [];

  private readonly panelEl: HTMLDivElement;
  private readonly confFillEl: HTMLDivElement;
  private readonly confValueEl: HTMLSpanElement;
  private readonly debugEl: HTMLDivElement;

  constructor(args: {
    provider: PuckProvider;
    overlayRoot: HTMLElement;
    inputLabel: string;
  }) {
    this.provider = args.provider;
    this.overlayRoot = args.overlayRoot;
    this.inputLabel = args.inputLabel;

    this.panelEl = document.createElement("div");
    this.panelEl.className = "hud-card tracking-panel";
    this.panelEl.innerHTML = `
      <div class="hud-label">Tracking HUD</div>
      <div class="hud-row"><span>Input</span><strong>Input: ${this.inputLabel}</strong></div>
      <div class="hud-row"><span>Confidence</span><span class="confidence-value">100%</span></div>
      <div class="confidence-track"><div class="confidence-fill"></div></div>
    `;

    this.confFillEl = this.panelEl.querySelector(".confidence-fill") as HTMLDivElement;
    this.confValueEl = this.panelEl.querySelector(".confidence-value") as HTMLSpanElement;

    this.debugEl = document.createElement("div");
    this.debugEl.className = "hud-debug";

    this.overlayRoot.append(this.panelEl, this.debugEl);
  }

  update(dt: number): void {
    const pos = this.provider.getPosition();
    const vel = this.provider.getVelocity();
    const conf = clamp(this.provider.getConfidence(), 0, 1);

    this.trail.push({ x: pos.x, y: pos.y, age: 0 });
    if (this.trail.length > 32) {
      this.trail.shift();
    }

    for (let i = this.trail.length - 1; i >= 0; i -= 1) {
      this.trail[i].age += dt;
      if (this.trail[i].age > 0.35) {
        this.trail.splice(i, 1);
      }
    }

    this.confFillEl.style.width = `${(conf * 100).toFixed(0)}%`;
    this.confValueEl.textContent = `${(conf * 100).toFixed(0)}%`;
    this.debugEl.textContent = `x:${pos.x.toFixed(3)}  y:${pos.y.toFixed(3)}  vx:${vel.x.toFixed(2)}  vy:${vel.y.toFixed(2)}`;
  }

  renderPad(ctx: CanvasRenderingContext2D, padRect: Rect, timeSec: number): void {
    drawPad(ctx, padRect, timeSec);
  }

  renderReticle(ctx: CanvasRenderingContext2D, padRect: Rect, timeSec: number): void {
    this.renderTrail(ctx, padRect);

    const pos = padToPixel(padRect, this.provider.getPosition());
    const vel = this.provider.getVelocity();
    const speed = Math.hypot(vel.x, vel.y);
    const baseR = 7;
    const glowR = baseR + Math.min(10, speed * 1.6) + Math.sin(timeSec * 8) * 1.2;

    const glow = ctx.createRadialGradient(pos.x, pos.y, 0, pos.x, pos.y, glowR * 2.1);
    glow.addColorStop(0, "rgba(246, 229, 188, 0.92)");
    glow.addColorStop(0.45, "rgba(212, 175, 55, 0.42)");
    glow.addColorStop(1, "rgba(212, 175, 55, 0)");
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(pos.x, pos.y, glowR * 2.1, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = "rgba(244, 232, 202, 0.95)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(pos.x, pos.y, baseR + 3, 0, Math.PI * 2);
    ctx.stroke();

    ctx.strokeStyle = "rgba(184, 171, 144, 0.86)";
    ctx.lineWidth = 1.5;
    const arm = 13;
    ctx.beginPath();
    ctx.moveTo(pos.x - arm, pos.y);
    ctx.lineTo(pos.x - 5, pos.y);
    ctx.moveTo(pos.x + 5, pos.y);
    ctx.lineTo(pos.x + arm, pos.y);
    ctx.moveTo(pos.x, pos.y - arm);
    ctx.lineTo(pos.x, pos.y - 5);
    ctx.moveTo(pos.x, pos.y + 5);
    ctx.lineTo(pos.x, pos.y + arm);
    ctx.stroke();

    ctx.fillStyle = "rgba(255, 255, 255, 0.98)";
    ctx.beginPath();
    ctx.arc(pos.x, pos.y, 3, 0, Math.PI * 2);
    ctx.fill();
  }

  private renderTrail(ctx: CanvasRenderingContext2D, padRect: Rect): void {
    if (this.trail.length < 2) {
      return;
    }

    for (let i = 1; i < this.trail.length; i += 1) {
      const prev = this.trail[i - 1];
      const curr = this.trail[i];
      const p0 = padToPixel(padRect, prev);
      const p1 = padToPixel(padRect, curr);
      const alpha = clamp(1 - curr.age / 0.35, 0, 1);
      const width = 1 + alpha * 5;

      ctx.strokeStyle = `rgba(212, 175, 55, ${(alpha * 0.18).toFixed(3)})`;
      ctx.lineWidth = width;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(p0.x, p0.y);
      ctx.lineTo(p1.x, p1.y);
      ctx.stroke();
    }

    for (const node of this.trail) {
      const p = padToPixel(padRect, node);
      const alpha = clamp(1 - node.age / 0.35, 0, 1);
      if (alpha <= 0) {
        continue;
      }
      ctx.fillStyle = `rgba(233, 217, 178, ${(alpha * 0.16).toFixed(3)})`;
      ctx.beginPath();
      ctx.arc(p.x, p.y, 2 + alpha * 3, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  destroy(): void {
    this.panelEl.remove();
    this.debugEl.remove();
  }
}
