import type { Encounter, Enemy } from "../game/encounter";
import { angleDelta, clamp, dist, pointSegment } from "../util";
import type { Rebounder } from "./calibration";
import { emptySample, type PuckSample, type PuckSource } from "./PuckSource";

export type BotContext = {
  encounter: Encounter | null;
  /** Where to wait before a fight starts, or null once it is under way. */
  ready: { x: number; y: number } | null;
  /** True while a pass is out or coming back. */
  passing: boolean;
};

/**
 * A scripted player. It handles the puck the way the game wants a kid to:
 * dribble beside enemies, step around swings, pass at what needs lightning.
 * Used by the automated tests and by the watch-it-play demo mode.
 */
export class BotSource implements PuckSource {
  readonly label = "Demo player";
  readonly sample: PuckSample;
  private gx: number;
  private gy: number;
  private speed = 0;
  private clock = 0;
  private passPhase = 0;
  private passTimer = 0;

  constructor(
    private readonly arenaW: number,
    private readonly arenaD: number,
    private readonly rebounders: readonly Rebounder[]
  ) {
    this.gx = arenaW / 2;
    this.gy = arenaD * 0.7;
    this.sample = { ...emptySample(this.gx, this.gy), visible: true, conf: 1 };
  }

  private go(x: number, y: number, speed: number): void {
    this.gx = clamp(x, 0.25, this.arenaW - 0.25);
    this.gy = clamp(y, 0.25, this.arenaD - 0.25);
    this.speed = speed;
  }

  /** Decide where the puck should go next. Call once per frame before update(). */
  drive(ctx: BotContext): void {
    const s = this.sample;
    if (ctx.ready) {
      this.go(ctx.ready.x, ctx.ready.y, 6);
      return;
    }
    const enc = ctx.encounter;
    if (!enc || enc.done) {
      this.speed = 0;
      return;
    }
    // About five touches a second: quick, but what a practised kid can do.
    const flip = Math.floor(this.clock / 0.2) % 2 === 0 ? 1 : -1;
    if (enc.reviveLeft > 0) {
      this.go(this.arenaW / 2 + flip * 0.4, this.arenaD * 0.6, 6);
      return;
    }

    // --- stay out of what is about to land -------------------------------
    for (const f of enc.fires) {
      if (dist(s.x, s.y, f.x, f.y) < f.r + 0.4) {
        const d = Math.max(0.05, dist(s.x, s.y, f.x, f.y));
        this.go(f.x + ((s.x - f.x) / d) * (f.r + 1.2), f.y + ((s.y - f.y) / d) * (f.r + 1.2), 8);
        return;
      }
    }
    for (const e of enc.enemies) {
      if (e.state === "windup") {
        const { reach, half } = enc.swingShape(e);
        const inCone = dist(e.x, e.y, s.x, s.y) <= reach + 0.3 && Math.abs(angleDelta(e.facing, Math.atan2(s.y - e.y, s.x - e.x))) <= half + 0.25;
        if (inCone) {
          this.go(e.x - Math.cos(e.facing) * (e.r + 0.6), e.y - Math.sin(e.facing) * (e.r + 0.6), 9);
          return;
        }
      }
      if (e.state === "aim" || e.state === "charge") {
        const fx = e.x + Math.cos(e.facing) * 30;
        const fy = e.y + Math.sin(e.facing) * 30;
        const lane = pointSegment(s.x, s.y, e.x, e.y, fx, fy);
        if (lane.d < e.r + 1.1) {
          const side = Math.sign((s.x - e.x) * Math.sin(e.facing) - (s.y - e.y) * Math.cos(e.facing)) || 1;
          this.go(s.x + Math.sin(e.facing) * side * 2.2, s.y - Math.cos(e.facing) * side * 2.2, 9);
          return;
        }
      }
    }
    for (const p of enc.projectiles) {
      const lane = pointSegment(s.x, s.y, p.x, p.y, p.x + p.vx * 2, p.y + p.vy * 2);
      if (lane.d < 0.9) {
        const len = Math.hypot(p.vx, p.vy) || 1;
        const side = Math.sign((s.x - p.x) * p.vy - (s.y - p.y) * p.vx) || 1;
        this.go(s.x + (p.vy / len) * side * 1.8, s.y - (p.vx / len) * side * 1.8, 9);
        return;
      }
    }

    // --- pick a job -------------------------------------------------------
    const foes = enc.alive.filter((e) => e.state !== "spawn");
    const pickup = enc.pickups[0];
    if (foes.length === 0) {
      if (pickup) this.go(pickup.x, pickup.y, 6);
      else this.speed = 0;
      return;
    }
    const canPass = this.rebounders.length > 0;
    const needsBolt = (e: Enemy): boolean => e.kind === "totem" || e.warded || e.only === "bolt";
    if (canPass && (this.passPhase > 0 || foes.some(needsBolt) || foes.every((e) => e.shield && e.shieldDown <= 0 && e.stun <= 0))) {
      this.drivePass(ctx.passing);
      return;
    }
    this.passPhase = 0;

    const nearest = (list: Enemy[]): Enemy => list.reduce((a, b) => (dist(a.x, a.y, s.x, s.y) <= dist(b.x, b.y, s.x, s.y) ? a : b));
    // In a defence, peel off whichever raider is closest to the ward first.
    const ward = enc.ward && !enc.wardBroken ? enc.ward : null;
    const raiders = ward ? foes.filter((f) => !f.aggro && (f.kind === "grunt" || f.kind === "brute")) : [];
    const pool = foes.filter((f) => !needsBolt(f)).length > 0 ? foes.filter((f) => !needsBolt(f)) : foes;
    const e = ward && raiders.length > 0 ? raiders.reduce((a, b) => (dist(a.x, a.y, ward.x, ward.y) <= dist(b.x, b.y, ward.x, ward.y) ? a : b)) : nearest(pool);

    if (e.kind === "runner") {
      this.go(e.x, e.y, 6.5);
    } else if (e.kind === "wisp" || e.only === "dash") {
      // Cut straight through and out the far side.
      const ang = Math.atan2(e.y - s.y, e.x - s.x);
      const side = e.only === "dash" ? (Math.floor(this.clock / 0.55) % 2 === 0 ? 1 : -1) : 1;
      if (e.only === "dash") this.go(e.x + side * 1.6, e.y + 0.05, 9);
      else this.go(e.x + Math.cos(ang) * 1.2, e.y + Math.sin(ang) * 1.2, 8);
    } else if (e.only === "ring") {
      const ang = Math.atan2(s.y - e.y, s.x - e.x) + 0.4;
      this.go(e.x + Math.cos(ang) * 1.1, e.y + Math.sin(ang) * 1.1, 6);
    } else if (e.only === "cleave") {
      const xs = foes.filter((f) => f.only === "cleave").map((f) => f.x);
      const side = Math.floor(this.clock / 0.5) % 2 === 0;
      this.go(side ? Math.min(...xs) - 0.2 : Math.max(...xs) + 0.2, e.y + 0.7, 8);
    } else {
      // Work the puck in behind it and dribble there.
      const bx = e.x - Math.cos(e.facing) * (e.r + 0.45);
      const by = e.y - Math.sin(e.facing) * (e.r + 0.45);
      if (dist(s.x, s.y, bx, by) > 0.9) this.go(bx, by, 7);
      else this.go(bx - Math.sin(e.facing) * 0.38 * flip, by + Math.cos(e.facing) * 0.38 * flip, 4.5);
    }
  }

  private drivePass(passing: boolean): void {
    const s = this.sample;
    const reb = this.rebounders.reduce((a, b) => (dist((a.ax + a.bx) / 2, (a.ay + a.by) / 2, s.x, s.y) <= dist((b.ax + b.bx) / 2, (b.ay + b.by) / 2, s.x, s.y) ? a : b));
    const mx = (reb.ax + reb.bx) / 2;
    const my = (reb.ay + reb.by) / 2;
    // Stand off the rebounder, fire at it, come back and settle the catch.
    const nx = Math.sign(this.arenaW / 2 - mx) * (Math.abs(this.arenaW / 2 - mx) > 1 ? 1 : 0);
    const ny = Math.sign(this.arenaD / 2 - my) * (Math.abs(this.arenaD / 2 - my) > 1 ? 1 : 0);
    const sx = mx + nx * 3;
    const sy = my + ny * 3;
    this.passTimer += 1 / 60;
    if (this.passPhase === 0) {
      this.passPhase = 1;
      this.passTimer = 0;
    }
    if (this.passPhase === 1) {
      this.go(sx, sy, 7);
      if (dist(s.x, s.y, sx, sy) < 0.15) {
        this.passPhase = 2;
        this.passTimer = 0;
      }
    } else if (this.passPhase === 2) {
      this.gx = mx;
      this.gy = my;
      this.speed = 15;
      if (dist(s.x, s.y, mx, my) < 0.1 || this.passTimer > 1.5) {
        this.passPhase = 3;
        this.passTimer = 0;
      }
    } else if (this.passPhase === 3) {
      this.go(sx, sy, 8);
      if (dist(s.x, s.y, sx, sy) < 0.1) {
        this.passPhase = 4;
        this.passTimer = 0;
      }
    } else {
      this.speed = 0;
      if ((!passing && this.passTimer > 0.25) || this.passTimer > 2) this.passPhase = 0;
    }
  }

  update(dt: number): void {
    const s = this.sample;
    this.clock += dt;
    const dx = this.gx - s.x;
    const dy = this.gy - s.y;
    const d = Math.hypot(dx, dy);
    const step = Math.min(d, this.speed * dt);
    const nx = d > 1e-6 ? s.x + (dx / d) * step : s.x;
    const ny = d > 1e-6 ? s.y + (dy / d) * step : s.y;
    s.vx = (nx - s.x) / dt;
    s.vy = (ny - s.y) / dt;
    s.speed = Math.hypot(s.vx, s.vy);
    s.x = nx;
    s.y = ny;
  }

  destroy(): void {
    // Nothing to release.
  }
}
