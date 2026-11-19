import { angleDelta, pointSegment, TAU } from "../util";
import type { Rebounder } from "./calibration";
import type { PuckSample } from "./PuckSource";

export type GestureEvent =
  | { type: "touch"; axis: "x" | "y"; amp: number }
  | { type: "passHit"; rebounderId: string; speed: number }
  | { type: "passReceived"; rebounderId: string; speed: number; roundTrip: number }
  | { type: "passLost"; rebounderId: string }
  /** A closed loop drawn with the puck; centre and radius describe what it encircled. */
  | { type: "circle"; dir: 1 | -1; x: number; y: number; r: number };

export type GestureTuning = {
  /** Minimum speed (ft/s) for a puck heading at a rebounder to count as a pass. */
  passMinSpeed: number;
};

export type PracticeStats = {
  touches: number;
  passes: number;
  receptions: number;
  circles: number;
  topPassSpeed: number;
  distanceFt: number;
};

type AxisState = { dir: number; extreme: number; anchor: number; lastTurn: number; lastTurnAt: number };

const TOUCH_HYSTERESIS = 0.12;
const TOUCH_MIN_AMP = 0.3;

function newAxis(v: number): AxisState {
  return { dir: 0, extreme: v, anchor: v, lastTurn: v, lastTurnAt: -10 };
}

/**
 * Turns the raw puck track into hockey actions: stickhandling touches (direction
 * reversals), passes off a rebounder and their receptions, and full circles.
 */
export class GestureDetector {
  readonly events: GestureEvent[] = [];
  readonly stats: PracticeStats = { touches: 0, passes: 0, receptions: 0, circles: 0, topPassSpeed: 0, distanceFt: 0 };
  /** Seconds the puck has been resting (under control and nearly still). */
  stillTime = 0;
  /** Timestamps of recent touches, for burst ("flurry") detection. */
  readonly touchTimes: number[] = [];

  private time = 0;
  private ax: AxisState | null = null;
  private ay: AxisState | null = null;
  private lastTouchAt = -10;
  private lastX = 0;
  private lastY = 0;
  private hasLast = false;

  private pass:
    | { phase: "idle" }
    | { phase: "out"; reb: Rebounder; peak: number; t: number; minDist: number; off: number; sx: number; sy: number }
    | { phase: "back"; reb: Rebounder; peak: number; t: number; calm: number; hidden: number } = { phase: "idle" };

  private heading: number | null = null;
  private winding = 0;
  private windingAge = 0;
  private slowTime = 0;
  private readonly loop: { x: number; y: number }[] = [];

  constructor(private rebounders: readonly Rebounder[], private tuning: GestureTuning) {}

  setRebounders(rebounders: readonly Rebounder[]): void {
    this.rebounders = rebounders;
  }

  /** True while a pass is in flight or coming back. */
  get passing(): boolean {
    return this.pass.phase !== "idle";
  }

  touchesWithin(seconds: number): number {
    let count = 0;
    for (let i = this.touchTimes.length - 1; i >= 0; i -= 1) {
      if (this.time - this.touchTimes[i]! <= seconds) count += 1;
      else break;
    }
    return count;
  }

  update(dt: number, puck: PuckSample): void {
    this.events.length = 0;
    this.time += dt;
    while (this.touchTimes.length > 0 && this.time - this.touchTimes[0]! > 6) this.touchTimes.shift();

    if (!puck.visible) {
      this.stillTime = 0;
      this.hasLast = false;
      this.heading = null;
      this.updatePass(dt, puck);
      return;
    }

    if (this.hasLast) {
      const step = Math.hypot(puck.x - this.lastX, puck.y - this.lastY);
      if (step < 3) this.stats.distanceFt += step;
    }
    this.lastX = puck.x;
    this.lastY = puck.y;
    this.hasLast = true;

    this.stillTime = puck.speed < 0.7 ? this.stillTime + dt : 0;

    this.updatePass(dt, puck);
    // Fast dribbles often point at a rebounder for a moment, so a pass that is only
    // "on its way" must not mute touch counting. The return leg is the exception.
    if (this.pass.phase !== "back") this.updateTouches(puck);
    this.updateCircle(dt, puck);
  }

  private updateTouches(puck: PuckSample): void {
    if (!this.ax || !this.ay) {
      this.ax = newAxis(puck.x);
      this.ay = newAxis(puck.y);
      return;
    }
    this.axisStep(this.ax, puck.x, "x");
    this.axisStep(this.ay, puck.y, "y");
  }

  private axisStep(state: AxisState, v: number, axis: "x" | "y"): void {
    if (state.dir === 0) {
      if (Math.abs(v - state.anchor) > TOUCH_HYSTERESIS) {
        state.dir = Math.sign(v - state.anchor);
        state.extreme = v;
      }
      return;
    }
    if ((v - state.extreme) * state.dir > 0) {
      state.extreme = v;
      return;
    }
    if ((state.extreme - v) * state.dir > TOUCH_HYSTERESIS) {
      const amp = Math.abs(state.extreme - state.lastTurn);
      const quick = this.time - state.lastTurnAt < 1.5;
      state.lastTurn = state.extreme;
      state.lastTurnAt = this.time;
      state.dir = -state.dir;
      state.extreme = v;
      // A diagonal dribble reverses on both axes at once: count it as one touch.
      if (amp >= TOUCH_MIN_AMP && quick && this.time - this.lastTouchAt > 0.09) {
        this.lastTouchAt = this.time;
        this.touchTimes.push(this.time);
        this.stats.touches += 1;
        this.events.push({ type: "touch", axis, amp });
      }
    }
  }

  private updatePass(dt: number, puck: PuckSample): void {
    const pass = this.pass;
    if (pass.phase === "idle") {
      if (!puck.visible || puck.speed < this.tuning.passMinSpeed) return;
      const target = this.aimedRebounder(puck);
      if (target) this.pass = { phase: "out", reb: target.reb, peak: puck.speed, t: 0, minDist: target.dist, off: 0, sx: puck.x, sy: puck.y };
      return;
    }

    pass.t += dt;
    const reb = pass.reb;
    const near = pointSegment(puck.x, puck.y, reb.ax, reb.ay, reb.bx, reb.by).d;

    if (pass.phase === "out") {
      if (puck.visible) {
        pass.peak = Math.max(pass.peak, puck.speed);
        pass.minDist = Math.min(pass.minDist, near);
      }
      // A real pass travels: stickhandling right beside a rebounder is not one.
      const travelled = Math.hypot(puck.x - pass.sx, puck.y - pass.sy) >= 1.2;
      const receding = puck.visible && near > pass.minDist + 0.35 && pass.minDist < 1.2;
      if (travelled && ((puck.visible && near < 0.7) || receding)) {
        this.stats.passes += 1;
        this.stats.topPassSpeed = Math.max(this.stats.topPassSpeed, pass.peak);
        this.events.push({ type: "passHit", rebounderId: reb.id, speed: pass.peak });
        this.pass = { phase: "back", reb, peak: pass.peak, t: 0, calm: 0, hidden: 0 };
        this.resetTouchAxes();
      } else {
        // Curving away or slowing down well short of the rebounder means it was a carry, not a pass.
        const stillAimed = puck.visible && puck.speed >= this.tuning.passMinSpeed * 0.5 && this.aimedRebounder(puck)?.reb === reb;
        pass.off = !puck.visible || stillAimed ? 0 : pass.off + dt;
        if (pass.t > 1.4 || pass.off > 0.12) this.pass = { phase: "idle" };
      }
      return;
    }

    // Coming back: a reception is the puck settling under control away from the rebounder.
    pass.hidden = puck.visible ? 0 : pass.hidden + dt;
    pass.calm = puck.visible && near > 0.9 && puck.speed < 4 ? pass.calm + dt : 0;
    if (pass.calm >= 0.1) {
      this.stats.receptions += 1;
      this.events.push({ type: "passReceived", rebounderId: reb.id, speed: pass.peak, roundTrip: pass.t });
      this.pass = { phase: "idle" };
      this.resetTouchAxes();
    } else if (pass.t > 3.5 || pass.hidden > 1.8) {
      this.events.push({ type: "passLost", rebounderId: reb.id });
      this.pass = { phase: "idle" };
      this.resetTouchAxes();
    }
  }

  private resetTouchAxes(): void {
    this.ax = null;
    this.ay = null;
  }

  /** Which rebounder is the puck travelling toward, if any? */
  private aimedRebounder(puck: PuckSample): { reb: Rebounder; dist: number } | null {
    const dx = puck.vx / puck.speed;
    const dy = puck.vy / puck.speed;
    let best: { reb: Rebounder; dist: number } | null = null;
    for (const reb of this.rebounders) {
      // Lengthen the segment slightly so a pass that clips the end still counts.
      const sx = reb.bx - reb.ax;
      const sy = reb.by - reb.ay;
      const len = Math.hypot(sx, sy) || 1;
      const ex = (sx / len) * 0.4;
      const ey = (sy / len) * 0.4;
      const ax = reb.ax - ex;
      const ay = reb.ay - ey;
      const rx = sx + ex * 2;
      const ry = sy + ey * 2;
      const denom = dx * ry - dy * rx;
      if (Math.abs(denom) < 1e-6) continue;
      const t = ((ax - puck.x) * ry - (ay - puck.y) * rx) / denom;
      const u = ((ax - puck.x) * dy - (ay - puck.y) * dx) / denom;
      if (t <= 0 || t > 25 || u < 0 || u > 1) continue;
      if (!best || t < best.dist) best = { reb, dist: t };
    }
    return best;
  }

  private resetLoop(): void {
    this.winding = 0;
    this.windingAge = 0;
    this.loop.length = 0;
  }

  private updateCircle(dt: number, puck: PuckSample): void {
    if (puck.speed < 1.2 || this.pass.phase === "back") {
      this.slowTime += dt;
      if (this.slowTime > 0.5) {
        this.resetLoop();
        this.heading = null;
      }
      return;
    }
    this.slowTime = 0;
    const heading = Math.atan2(puck.vy, puck.vx);
    if (this.heading !== null) {
      const dh = angleDelta(this.heading, heading);
      // Sharp reversals are dribbles, not arcs.
      if (Math.abs(dh) < 1.3) {
        this.winding += this.winding !== 0 && Math.sign(dh) !== Math.sign(this.winding) ? dh * 2 : dh;
        this.windingAge += dt;
        this.loop.push({ x: puck.x, y: puck.y });
      } else {
        this.resetLoop();
      }
      if (this.windingAge > 4) this.resetLoop();
      if (Math.abs(this.winding) >= TAU * 0.95) {
        let cx = 0;
        let cy = 0;
        for (const p of this.loop) {
          cx += p.x;
          cy += p.y;
        }
        cx /= this.loop.length;
        cy /= this.loop.length;
        let r = 0;
        for (const p of this.loop) r += Math.hypot(p.x - cx, p.y - cy);
        r /= this.loop.length;
        this.stats.circles += 1;
        this.events.push({ type: "circle", dir: this.winding > 0 ? 1 : -1, x: cx, y: cy, r });
        this.resetLoop();
      }
    }
    this.heading = heading;
  }
}
