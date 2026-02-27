import type { PuckPoint, PuckProvider, PuckVelocity } from "./PuckProvider";

type PixelRect = { x: number; y: number; width: number; height: number };

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

export class MousePuckProvider implements PuckProvider {
  private readonly canvas: HTMLCanvasElement;
  private readonly getPadBounds: () => PixelRect;

  private readonly position: PuckPoint = { x: 0.5, y: 0.5 };
  private readonly velocity: PuckVelocity = { x: 0, y: 0 };
  private readonly target: PuckPoint = { x: 0.5, y: 0.5 };

  private handlePointerMoveBound = (event: PointerEvent): void => {
    const px = event.offsetX;
    const py = event.offsetY;
    const pad = this.getPadBounds();

    if (pad.width <= 0 || pad.height <= 0) {
      return;
    }

    this.target.x = clamp01((px - pad.x) / pad.width);
    this.target.y = clamp01((py - pad.y) / pad.height);
  };

  constructor(canvas: HTMLCanvasElement, getPadBounds: () => PixelRect) {
    this.canvas = canvas;
    this.getPadBounds = getPadBounds;

    canvas.addEventListener("pointermove", this.handlePointerMoveBound, { passive: true });
  }

  update(dt: number): void {
    const safeDt = Math.max(1 / 240, Math.min(0.1, dt));
    const alpha = 1 - Math.exp(-24 * safeDt);

    const prevX = this.position.x;
    const prevY = this.position.y;

    this.position.x += (this.target.x - this.position.x) * alpha;
    this.position.y += (this.target.y - this.position.y) * alpha;

    this.velocity.x = (this.position.x - prevX) / safeDt;
    this.velocity.y = (this.position.y - prevY) / safeDt;
  }

  getPosition(): PuckPoint {
    return this.position;
  }

  getVelocity(): PuckVelocity {
    return this.velocity;
  }

  getConfidence(): number {
    return 1;
  }

  destroy(): void {
    this.canvas.removeEventListener("pointermove", this.handlePointerMoveBound);
  }
}
