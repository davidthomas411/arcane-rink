import type { TierDef } from "../realm/game/classes";
import type { Rebounder } from "../realm/input/calibration";
import type { GestureDetector } from "../realm/input/Gestures";
import type { PuckSample } from "../realm/input/PuckSource";
import type { ArenaRenderer } from "../realm/render/ArenaRenderer";
import { clamp, dist } from "../realm/util";
import type { CheckKind } from "./rules";

export type DrillArena = { w: number; d: number; rebounders: readonly Rebounder[] };

/**
 * A skill check. Instead of rolling a die, the player does a few seconds of
 * stickhandling or passing and the die face climbs with how well they do it.
 */
export interface Drill {
  readonly title: string;
  readonly instruction: string;
  readonly duration: number;
  /** The die as it stands right now, 1..6. */
  face: number;
  time: number;
  done: boolean;
  /** Light the rebounders as the target. */
  readonly charged: boolean;
  update(dt: number, puck: PuckSample, gestures: GestureDetector): void;
  draw(g: ArenaRenderer, time: number): void;
  /** Where a scripted demo player should send the puck. */
  aim(puck: PuckSample): { x: number; y: number; speed: number };
}

abstract class BaseDrill implements Drill {
  abstract readonly title: string;
  abstract readonly instruction: string;
  abstract readonly duration: number;
  face = 1;
  time = 0;
  done = false;
  readonly charged: boolean = false;

  constructor(protected readonly arena: DrillArena, protected readonly tier: TierDef) {}

  update(dt: number, puck: PuckSample, gestures: GestureDetector): void {
    if (this.done) return;
    this.time += dt;
    this.step(dt, puck, gestures);
    if (this.time >= this.duration || this.face >= 6) this.done = true;
  }

  protected abstract step(dt: number, puck: PuckSample, gestures: GestureDetector): void;
  abstract draw(g: ArenaRenderer, time: number): void;
  abstract aim(puck: PuckSample): { x: number; y: number; speed: number };

  /** Younger tiers need fewer reps per pip. */
  protected get ease(): number {
    return this.tier.id === "rookie" ? 0.72 : this.tier.id === "elite" ? 1.25 : 1;
  }
}

/** Deke: quick side-to-side between two pads. */
class DekeDrill extends BaseDrill {
  readonly title = "DEKE";
  readonly instruction = "Dribble pad to pad — fast!";
  readonly duration = 6;
  private next: 0 | 1 = 0;
  private reps = 0;
  private readonly a: { x: number; y: number };
  private readonly b: { x: number; y: number };
  private readonly r: number;

  constructor(arena: DrillArena, tier: TierDef) {
    super(arena, tier);
    const cx = arena.w / 2;
    const cy = arena.d * 0.6;
    const half = Math.min(1.3, arena.w / 2 - 1);
    this.a = { x: cx - half, y: cy };
    this.b = { x: cx + half, y: cy };
    this.r = tier.targetRadius;
  }

  protected step(_dt: number, puck: PuckSample): void {
    if (!puck.visible) return;
    const t = this.next === 0 ? this.a : this.b;
    if (dist(puck.x, puck.y, t.x, t.y) <= this.r) {
      this.reps += 1;
      this.next = this.next === 0 ? 1 : 0;
      this.face = clamp(1 + Math.floor(this.reps / (1.8 * this.ease)), 1, 6);
    }
  }

  draw(g: ArenaRenderer, time: number): void {
    g.pad(this.a.x, this.a.y, this.r, this.next === 0, time);
    g.pad(this.b.x, this.b.y, this.r, this.next === 1, time);
  }

  aim(): { x: number; y: number; speed: number } {
    const t = this.next === 0 ? this.a : this.b;
    return { x: t.x, y: t.y, speed: 7 };
  }
}

/** Body check: power, measured as wide dribbles. */
class HitDrill extends BaseDrill {
  readonly title = "BODY CHECK";
  readonly instruction = "WIDE, hard dribbles — build power!";
  readonly duration = 5;
  private count = 0;
  private flip = 1;
  private flipAt = 0;

  protected step(_dt: number, _puck: PuckSample, gestures: GestureDetector): void {
    for (const e of gestures.events) {
      if (e.type === "touch" && e.amp >= 1.1) this.count += 1;
    }
    this.face = clamp(1 + Math.floor(this.count / (1.5 * this.ease)), 1, 6);
  }

  draw(g: ArenaRenderer, time: number): void {
    const cx = this.arena.w / 2;
    const cy = this.arena.d * 0.6;
    g.pad(cx - 1.3, cy, 0.5, false, time);
    g.pad(cx + 1.3, cy, 0.5, false, time);
    g.text(`POWER ${this.count}`, cx, cy - 1.2, g.scale * 0.5, "#ff9a5c");
  }

  aim(): { x: number; y: number; speed: number } {
    if (this.time - this.flipAt > 0.3) {
      this.flip = -this.flip;
      this.flipAt = this.time;
    }
    return { x: this.arena.w / 2 + this.flip * 1.3, y: this.arena.d * 0.6, speed: 9 };
  }
}

/** Pass and shot: fire the puck off a rebounder. A pass also wants a clean catch. */
class RebounderDrill extends BaseDrill {
  readonly title: string;
  readonly instruction: string;
  readonly duration = 7;
  override readonly charged = true;
  private hitAt = -1;
  private stage = 0;

  constructor(arena: DrillArena, tier: TierDef, private readonly shot: boolean) {
    super(arena, tier);
    this.title = shot ? "SHOT" : "PASS";
    this.instruction = shot ? "Rip it off the crystals — hard and quick!" : "Pass off the crystals and catch it clean";
  }

  protected step(_dt: number, _puck: PuckSample, gestures: GestureDetector): void {
    for (const e of gestures.events) {
      if (e.type === "passHit" && this.hitAt < 0) {
        this.hitAt = this.time;
        const ratio = e.speed / this.tier.passMinSpeed;
        if (this.shot) {
          const power = ratio < 1.2 ? 3 : ratio < 1.45 ? 4 : ratio < 1.75 ? 5 : 6;
          this.face = clamp(power + (this.time < 2.5 ? 1 : 0), 1, 6);
          this.done = true;
        } else {
          this.face = ratio < 1.25 ? 3 : 4;
        }
      } else if (e.type === "passReceived" && this.hitAt >= 0 && !this.shot) {
        // A clean catch is worth a pip, a quick give-and-go another.
        this.face = clamp(this.face + 1 + (e.roundTrip < 2.2 ? 1 : 0), 1, 6);
        this.done = true;
      } else if (e.type === "passLost" && this.hitAt >= 0) {
        this.done = true;
      }
    }
    if (this.hitAt >= 0 && this.time - this.hitAt > 3) this.done = true;
  }

  draw(g: ArenaRenderer): void {
    if (this.hitAt >= 0 && !this.shot) g.text("Now catch it!", this.arena.w / 2, this.arena.d * 0.5, g.scale * 0.4, "#8fe3a0");
  }

  aim(puck: PuckSample): { x: number; y: number; speed: number } {
    const reb = this.arena.rebounders[0];
    if (!reb) return { x: puck.x, y: puck.y, speed: 0 };
    const mx = (reb.ax + reb.bx) / 2;
    const my = (reb.ay + reb.by) / 2;
    const nx = Math.sign(this.arena.w / 2 - mx) * (Math.abs(this.arena.w / 2 - mx) > 1 ? 1 : 0);
    const ny = Math.sign(this.arena.d / 2 - my) * (Math.abs(this.arena.d / 2 - my) > 1 ? 1 : 0);
    const sx = mx + nx * 3.2;
    const sy = my + ny * 3.2;
    if (this.stage === 0) {
      if (dist(puck.x, puck.y, sx, sy) < 0.15) this.stage = 1;
      return { x: sx, y: sy, speed: 8 };
    }
    if (this.stage === 1) {
      if (dist(puck.x, puck.y, mx, my) < 0.12) this.stage = 2;
      return { x: mx, y: my, speed: 15 };
    }
    return { x: sx, y: sy, speed: dist(puck.x, puck.y, sx, sy) < 0.1 ? 0 : 8 };
  }
}

/** Faceoff: wait for the drop, then get to the rune first. */
class ReactionDrill extends BaseDrill {
  readonly title = "FACEOFF";
  readonly instruction = "Wait for the drop… then GO!";
  readonly duration = 6;
  private readonly home: { x: number; y: number };
  private target: { x: number; y: number } | null = null;
  private dropAt: number;
  private droppedAt = -1;

  constructor(arena: DrillArena, tier: TierDef, private readonly rng: () => number) {
    super(arena, tier);
    this.home = { x: arena.w / 2, y: arena.d * 0.6 };
    this.dropAt = 1 + rng() * 1.2;
  }

  protected step(_dt: number, puck: PuckSample): void {
    if (!puck.visible) return;
    if (this.droppedAt < 0) {
      // Jumping early resets the wait, like a real faceoff.
      if (dist(puck.x, puck.y, this.home.x, this.home.y) > 1.1) this.dropAt = this.time + 0.8 + this.rng() * 0.8;
      if (this.time >= this.dropAt) {
        this.droppedAt = this.time;
        const ang = this.rng() * Math.PI * 2;
        this.target = {
          x: clamp(this.home.x + Math.cos(ang) * 2.8, 0.9, this.arena.w - 0.9),
          y: clamp(this.home.y + Math.sin(ang) * 2.2, 0.9, this.arena.d - 0.9)
        };
      }
      return;
    }
    if (this.target && dist(puck.x, puck.y, this.target.x, this.target.y) <= this.tier.targetRadius) {
      const t = (this.time - this.droppedAt) / this.ease;
      this.face = t < 0.9 ? 6 : t < 1.2 ? 5 : t < 1.5 ? 4 : t < 1.9 ? 3 : 2;
      this.done = true;
    }
  }

  draw(g: ArenaRenderer, time: number): void {
    if (this.target) {
      g.pad(this.target.x, this.target.y, this.tier.targetRadius, true, time);
      g.text("GO!", this.target.x, this.target.y - this.tier.targetRadius - 0.4, g.scale * 0.5, "#ffd75a");
    } else {
      g.pad(this.home.x, this.home.y, 1, false, time);
      g.text("Hold here…", this.home.x, this.home.y - 1.35, g.scale * 0.34, "#e6dcc4");
    }
  }

  aim(): { x: number; y: number; speed: number } {
    const t = this.target ?? this.home;
    return { x: t.x, y: t.y, speed: this.target ? 6 : 5 };
  }
}

/** Stand-in for pass and shot checks when no rebounder is set up: race between runes. */
class RuneDrill extends BaseDrill {
  readonly title: string;
  readonly instruction = "Carry the puck to each rune — quick!";
  readonly duration = 6;
  private target: { x: number; y: number };
  private count = 0;

  constructor(arena: DrillArena, tier: TierDef, private readonly rng: () => number, title: string) {
    super(arena, tier);
    this.title = title;
    this.target = { x: arena.w * 0.3, y: arena.d * 0.4 };
  }

  protected step(_dt: number, puck: PuckSample): void {
    if (!puck.visible || dist(puck.x, puck.y, this.target.x, this.target.y) > this.tier.targetRadius) return;
    this.count += 1;
    this.face = clamp(1 + Math.floor(this.count / this.ease), 1, 6);
    for (let i = 0; i < 8; i += 1) {
      const x = 1 + this.rng() * (this.arena.w - 2);
      const y = 1 + this.rng() * (this.arena.d - 2);
      if (dist(x, y, puck.x, puck.y) > 2.2) {
        this.target = { x, y };
        break;
      }
    }
  }

  draw(g: ArenaRenderer, time: number): void {
    g.pad(this.target.x, this.target.y, this.tier.targetRadius, true, time);
  }

  aim(): { x: number; y: number; speed: number } {
    return { x: this.target.x, y: this.target.y, speed: 7 };
  }
}

export function makeDrill(kind: CheckKind, arena: DrillArena, tier: TierDef, rng: () => number): Drill {
  const hasRebounder = arena.rebounders.length > 0;
  switch (kind) {
    case "deke":
      return new DekeDrill(arena, tier);
    case "hit":
      return new HitDrill(arena, tier);
    case "pass":
      return hasRebounder ? new RebounderDrill(arena, tier, false) : new RuneDrill(arena, tier, rng, "PASS");
    case "shot":
      return hasRebounder ? new RebounderDrill(arena, tier, true) : new RuneDrill(arena, tier, rng, "SHOT");
    case "faceoff":
      return new ReactionDrill(arena, tier, rng);
  }
}
