import { clamp } from "../util";
import { emptySample, type PuckSample, type PuckSource } from "./PuckSource";

/** Development stand-in for the camera: the pointer is the puck. */
export class MouseSource implements PuckSource {
  readonly label = "Mouse (practice at the desk)";
  readonly sample: PuckSample;
  private tx: number;
  private ty: number;

  private readonly onMove = (event: PointerEvent): void => {
    const p = this.toArena(event.clientX, event.clientY);
    // Allow a little overshoot past the edges so "passes" can reach rebounders on the boundary.
    this.tx = clamp(p.x, -0.5, this.arenaW + 0.5);
    this.ty = clamp(p.y, -0.5, this.arenaD + 0.5);
  };

  constructor(
    private readonly toArena: (clientX: number, clientY: number) => { x: number; y: number },
    private readonly arenaW: number,
    private readonly arenaD: number
  ) {
    this.tx = arenaW / 2;
    this.ty = arenaD * 0.75;
    this.sample = emptySample(this.tx, this.ty);
    this.sample.visible = true;
    this.sample.conf = 1;
    window.addEventListener("pointermove", this.onMove, { passive: true });
  }

  update(dt: number): void {
    const s = this.sample;
    const safeDt = clamp(dt, 1 / 240, 0.1);
    const alpha = 1 - Math.exp(-30 * safeDt);
    const nx = s.x + (this.tx - s.x) * alpha;
    const ny = s.y + (this.ty - s.y) * alpha;
    s.vx = (nx - s.x) / safeDt;
    s.vy = (ny - s.y) / safeDt;
    s.speed = Math.hypot(s.vx, s.vy);
    s.x = nx;
    s.y = ny;
  }

  destroy(): void {
    window.removeEventListener("pointermove", this.onMove);
  }
}
