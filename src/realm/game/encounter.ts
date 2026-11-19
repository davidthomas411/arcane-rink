import type { Rebounder } from "../input/calibration";
import type { GestureDetector } from "../input/Gestures";
import type { PuckSample } from "../input/PuckSource";
import { angleDelta, clamp, dist, pick, TAU, type Vec } from "../util";
import { CLASSES, TIERS, type ClassDef, type TierDef } from "./classes";
import type { EncounterDef, HazardDef, OffenseDef } from "./content";
import { gearBonus } from "./loot";
import type { Hero } from "./save";

export type ArenaInfo = { w: number; d: number; rebounders: readonly Rebounder[] };

export type Sigil = { glyph: string; color: string };
export const SIGILS: readonly Sigil[] = [
  { glyph: "⬤", color: "#e8c547" },
  { glyph: "▲", color: "#e05a47" },
  { glyph: "■", color: "#58a6e8" },
  { glyph: "◆", color: "#b06fe0" },
  { glyph: "★", color: "#6fd07a" },
  { glyph: "✚", color: "#f0f0f0" }
];

export type Objective =
  | { kind: "runes"; x: number; y: number; r: number; ttl: number; maxTtl: number; left: number; age: number }
  | { kind: "twin"; a: Vec; b: Vec; r: number; next: 0 | 1; left: number; wide: boolean }
  | { kind: "weave"; a: Vec; b: Vec; cur: 0 | 1; acc: number; prev: number | null; left: number }
  | { kind: "bolt"; rebounderId: string; left: number }
  | { kind: "hold"; x: number; y: number; r: number; progress: number; left: number };

export type Hazard =
  | { kind: "fire"; x: number; y: number; r: number; fuse: number; maxFuse: number }
  | { kind: "wave"; axis: "x" | "y"; pos: number; dir: 1 | -1; speed: number; gap: number; gapWidth: number; resolved: boolean }
  | { kind: "chaser"; x: number; y: number; life: number }
  | { kind: "sigil"; x: number; y: number; r: number; sigil: Sigil; correct: boolean };

export type FloatText = { x: number; y: number; text: string; color: string; age: number; big: boolean };

export type HeroTally = { damage: number; stick: number; pass: number; aware: number; seconds: number; downs: number; hitsTaken: number };

/** A hero's fighting stats for one adventure: class + tier + gear, plus what they did. */
export type HeroRuntime = {
  hero: Hero;
  cls: ClassDef;
  tier: TierDef;
  maxHp: number;
  hp: number;
  power: number;
  dmgMult: number;
  haste: number;
  focus: number;
  tally: HeroTally;
};

export function makeHeroRuntime(hero: Hero): HeroRuntime {
  const cls = CLASSES[hero.classId];
  const gear = gearBonus(hero.gear);
  const maxHp = Math.round(100 * cls.mods.hp + gear.stamina * 2 + hero.level * 4);
  return {
    hero,
    cls,
    tier: TIERS[hero.tier],
    maxHp,
    hp: maxHp,
    power: 0,
    dmgMult: 1 + gear.power * 0.01 + (hero.level - 1) * 0.03,
    haste: 1 + gear.haste * 0.01,
    focus: Math.min(1.5, 1 + gear.focus * 0.005),
    tally: { damage: 0, stick: 0, pass: 0, aware: 0, seconds: 0, downs: 0, hitsTaken: 0 }
  };
}

type DamageKind = "touch" | "carry" | "pass" | "pattern" | "sig";

const REVIVE_TOUCHES = 10;
const EDGE = 0.9;

/**
 * One fight. The hero damages the enemy by completing offense objectives (the
 * hockey reps) while reacting to hazards that only appear on screen.
 */
export class Encounter {
  readonly enemyMax: number;
  enemyHp: number;
  time = 0;
  done = false;
  combo = 0;
  bestCombo = 0;
  damageDone = 0;
  objective: Objective | null = null;
  readonly hazards: Hazard[] = [];
  cast: { sigil: Sigil; t: number; total: number } | null = null;
  /** Touches still needed to get back up, or 0 when standing. */
  reviveLeft = 0;
  readonly floats: FloatText[] = [];
  callout: { text: string; sub: string; ttl: number } | null = null;
  /** Sound cue names raised this frame. */
  readonly sfx: string[] = [];
  /** Seconds from a cast starting to the hero breaking it. */
  readonly reactionTimes: number[] = [];
  dodges = 0;
  interrupts = 0;
  signatures = 0;
  /** Brief flash strength when the enemy is struck (for the HUD). */
  enemyFlash = 0;
  heroFlash = 0;

  private rt!: HeroRuntime;
  private offenseIndex = 0;
  private objectiveDelay = 0.4;
  private readonly hazardTimers: number[];
  private lastBoltId = "";

  constructor(
    readonly def: EncounterDef,
    private readonly arena: ArenaInfo,
    private readonly rng: () => number,
    hero: HeroRuntime
  ) {
    this.rt = hero;
    this.enemyMax = Math.round(def.enemy.hp * hero.tier.enemyHp);
    this.enemyHp = this.enemyMax;
    this.hazardTimers = def.hazards.map((h) => h.every * (0.7 + rng() * 0.3));
  }

  get hero(): HeroRuntime {
    return this.rt;
  }

  get timed(): boolean {
    return this.def.timeLimit !== undefined;
  }

  get timeLeft(): number {
    return Math.max(0, (this.def.timeLimit ?? 0) - this.time);
  }

  get signatureReady(): boolean {
    return this.rt.power >= 100;
  }

  get comboMult(): number {
    return 1 + Math.min(this.combo, 20) * 0.025;
  }

  /** What the hero must do for their signature move, given the gear on the floor. */
  get signatureKind(): ClassDef["signature"]["kind"] {
    const kind = this.rt.cls.signature.kind;
    if ((kind === "hardPass" || kind === "quickPass") && this.arena.rebounders.length === 0) return "flurry";
    return kind;
  }

  /** Tag a different hero in (party play). Hazards in flight are cleared so the swap is fair. */
  setHero(hero: HeroRuntime): void {
    this.rt = hero;
    this.hazards.length = 0;
    this.cast = null;
    this.reviveLeft = hero.hp <= 0 ? REVIVE_TOUCHES : 0;
    this.objective = null;
    this.objectiveDelay = 0.3;
  }

  update(dt: number, puck: PuckSample, gestures: GestureDetector): void {
    this.sfx.length = 0;
    for (let i = this.floats.length - 1; i >= 0; i -= 1) {
      this.floats[i]!.age += dt;
      if (this.floats[i]!.age > 1.4) this.floats.splice(i, 1);
    }
    if (this.callout) {
      this.callout.ttl -= dt;
      if (this.callout.ttl <= 0) this.callout = null;
    }
    this.enemyFlash = Math.max(0, this.enemyFlash - dt * 3);
    this.heroFlash = Math.max(0, this.heroFlash - dt * 2.5);
    if (this.done) return;

    this.time += dt;
    this.rt.tally.seconds += dt;

    if (this.reviveLeft > 0) {
      for (const event of gestures.events) {
        if (event.type !== "touch") continue;
        this.reviveLeft -= 1;
        this.rt.tally.stick += 1;
        this.sfx.push("tick");
        if (this.reviveLeft <= 0) {
          this.rt.hp = Math.round(this.rt.maxHp * 0.6);
          this.say("Back in the fight!", "", 1.4);
          this.sfx.push("revive");
          break;
        }
      }
      return;
    }

    this.handleGestures(puck, gestures);
    this.updateObjective(dt, puck);
    this.updateHazards(dt, puck);

    if (!this.timed && this.enemyHp <= 0) this.finish();
    if (this.timed && this.time >= (this.def.timeLimit ?? 0)) this.finish();
  }

  private finish(): void {
    this.done = true;
    this.hazards.length = 0;
    this.cast = null;
    this.objective = null;
    this.sfx.push("victory");
  }

  /** 1–3 stars: fast and clean earns three. */
  get stars(): number {
    if (this.timed) return this.damageDone >= 100 ? 3 : this.damageDone >= 50 ? 2 : 1;
    const clean = this.rt.tally.downs === 0;
    if (this.time <= this.def.par && clean) return 3;
    if (this.time <= this.def.par * 1.6 || clean) return 2;
    return 1;
  }

  // ---------------------------------------------------------------- damage

  private strike(base: number, kind: DamageKind, x: number, y: number, power: number, label = ""): void {
    const mods = this.rt.cls.mods;
    const classMult = kind === "touch" ? mods.touch : kind === "carry" ? mods.carry : kind === "pass" ? mods.pass : kind === "pattern" ? mods.pattern : 1;
    const amount = Math.max(1, Math.round(base * classMult * this.rt.dmgMult * this.comboMult));
    this.enemyHp = Math.max(0, this.enemyHp - amount);
    this.damageDone += amount;
    this.rt.tally.damage += amount;
    this.rt.power = Math.min(100, this.rt.power + power * this.rt.haste);
    const big = kind === "sig" || base >= 14;
    this.floats.push({ x, y, text: label ? `${label} ${amount}` : `${amount}`, color: kind === "sig" ? "#ffd75a" : "#fff3c4", age: 0, big });
    this.enemyFlash = Math.min(1, this.enemyFlash + (big ? 1 : 0.35));
    if (kind !== "touch") {
      this.combo += 1;
      this.bestCombo = Math.max(this.bestCombo, this.combo);
    }
  }

  private hurt(amount: number, x: number, y: number, text: string): void {
    this.rt.hp = Math.max(0, this.rt.hp - amount);
    this.rt.tally.hitsTaken += 1;
    this.combo = 0;
    this.heroFlash = 1;
    this.floats.push({ x, y, text: `${text} -${amount}`, color: "#ff6b57", age: 0, big: true });
    this.sfx.push("hurt");
    if (this.rt.hp <= 0) {
      this.rt.tally.downs += 1;
      this.reviveLeft = REVIVE_TOUCHES;
      this.hazards.length = 0;
      this.cast = null;
      this.say("Knocked down!", `${REVIVE_TOUCHES} quick dribbles to get up`, 2.5);
      this.sfx.push("down");
    }
  }

  private dodge(x: number, y: number): void {
    this.dodges += 1;
    this.rt.tally.aware += 1;
    this.rt.power = Math.min(100, this.rt.power + 8 * this.rt.haste);
    this.floats.push({ x, y, text: "Dodged!", color: "#8fe3a0", age: 0, big: false });
    this.sfx.push("dodge");
  }

  private say(text: string, sub: string, ttl: number): void {
    this.callout = { text, sub, ttl };
  }

  // -------------------------------------------------------------- gestures

  private handleGestures(puck: PuckSample, gestures: GestureDetector): void {
    const tier = this.rt.tier;
    let signature = false;
    const sig = this.signatureKind;
    for (const event of gestures.events) {
      if (event.type === "touch") {
        this.rt.tally.stick += 1;
        this.strike(event.amp >= 1.5 ? 2 : 1, "touch", puck.x, puck.y, 1.5);
      } else if (event.type === "passHit") {
        this.rt.tally.pass += 1;
        this.sfx.push("pass");
        const reb = this.arena.rebounders.find((r) => r.id === event.rebounderId);
        const hx = reb ? (reb.ax + reb.bx) / 2 : puck.x;
        const hy = reb ? (reb.ay + reb.by) / 2 : puck.y;
        const speedBonus = clamp((event.speed - tier.passMinSpeed) / tier.passMinSpeed, 0, 1) * 6;
        const objective = this.objective;
        if (objective?.kind === "bolt" && objective.rebounderId === event.rebounderId) {
          this.strike(14 + speedBonus, "pass", hx, hy, 16, "Bolt!");
          this.sfx.push("perfect");
          objective.left -= 1;
          if (objective.left <= 0) this.nextObjective();
          else this.objective = this.makeBolt(objective.left);
        } else {
          this.strike(5 + speedBonus, "pass", hx, hy, 8);
        }
        if (this.signatureReady && sig === "hardPass" && event.speed >= tier.passMinSpeed * 1.4) signature = true;
      } else if (event.type === "passReceived") {
        this.rt.tally.pass += 1;
        this.strike(6, "carry", puck.x, puck.y, 8, "Clean catch");
        if (this.signatureReady && sig === "quickPass" && event.roundTrip <= 2.6) signature = true;
      } else if (event.type === "circle") {
        this.rt.tally.stick += 2;
        this.strike(5, "pattern", puck.x, puck.y, 5);
        if (this.signatureReady && sig === "circle") signature = true;
      }
    }
    if (this.signatureReady && sig === "flurry" && gestures.touchesWithin(2.5) >= 7) signature = true;

    if (signature) {
      this.rt.power = 0;
      this.signatures += 1;
      this.strike(45, "sig", puck.x, puck.y, 0, this.rt.cls.signature.name);
      this.rt.power = 0;
      // A signature move also clears the floor.
      for (let i = this.hazards.length - 1; i >= 0; i -= 1) {
        const kind = this.hazards[i]!.kind;
        if (kind === "fire" || kind === "chaser") this.hazards.splice(i, 1);
      }
      this.say(`${this.rt.cls.signature.name}!`, "", 1.3);
      this.sfx.push("signature");
    }
  }

  // ------------------------------------------------------------- objective

  private spot(puck: PuckSample, minFromPuck: number, marginX = EDGE, marginY = EDGE): Vec {
    const { w, d } = this.arena;
    const mx = Math.min(marginX, w / 2 - 0.1);
    const my = Math.min(marginY, d / 2 - 0.1);
    let best: Vec = { x: w / 2, y: d / 2 };
    let bestScore = -Infinity;
    for (let i = 0; i < 14; i += 1) {
      const x = mx + this.rng() * (w - mx * 2);
      const y = my + this.rng() * (d - my * 2);
      let clear = dist(x, y, puck.x, puck.y);
      for (const hz of this.hazards) {
        if (hz.kind === "sigil" || hz.kind === "fire") clear = Math.min(clear, dist(x, y, hz.x, hz.y) + 0.8);
      }
      if (clear >= minFromPuck) return { x, y };
      if (clear > bestScore) {
        bestScore = clear;
        best = { x, y };
      }
    }
    return best;
  }

  private nextObjective(): void {
    this.objective = null;
    this.objectiveDelay = 0.35;
    this.offenseIndex += 1;
  }

  private makeBolt(left: number): Objective {
    const rebs = this.arena.rebounders;
    const options = rebs.length > 1 ? rebs.filter((r) => r.id !== this.lastBoltId) : rebs;
    const reb = pick(this.rng, options);
    this.lastBoltId = reb.id;
    return { kind: "bolt", rebounderId: reb.id, left };
  }

  private makeObjective(def: OffenseDef, puck: PuckSample): Objective {
    const r = this.rt.tier.targetRadius;
    const { w, d } = this.arena;
    switch (def.kind) {
      case "runes": {
        const p = this.spot(puck, Math.min(3, w * 0.3));
        const ttl = 6 * this.rt.focus * (this.rt.tier.fuse / 1.8);
        return { kind: "runes", x: p.x, y: p.y, r, ttl, maxTtl: ttl, left: def.count, age: 0 };
      }
      case "twin": {
        const spacing = Math.min(def.spacing, (def.axis === "y" ? d : w) - 1.6);
        const dir = def.axis === "x" ? { x: 1, y: 0 } : def.axis === "y" ? { x: 0, y: 1 } : { x: Math.SQRT1_2, y: this.rng() < 0.5 ? Math.SQRT1_2 : -Math.SQRT1_2 };
        const c = this.spot(puck, 0, 0.8 + (Math.abs(dir.x) * spacing) / 2, 0.8 + (Math.abs(dir.y) * spacing) / 2);
        const half = spacing / 2;
        return {
          kind: "twin",
          a: { x: c.x - dir.x * half, y: c.y - dir.y * half },
          b: { x: c.x + dir.x * half, y: c.y + dir.y * half },
          // Narrow pads must not overlap, or one touch would count for both.
          r: Math.min(r, spacing * 0.42),
          next: 0,
          left: def.reps,
          wide: spacing >= 2.5
        };
      }
      case "weave": {
        const sep = Math.min(2.6, w - 3.4);
        const c = this.spot(puck, 0, sep / 2 + 1.5, 1.6);
        return { kind: "weave", a: { x: c.x - sep / 2, y: c.y }, b: { x: c.x + sep / 2, y: c.y }, cur: 0, acc: 0, prev: null, left: def.loops };
      }
      case "bolt": {
        // No rebounders set up: fall back to a carry so the quest still works.
        if (this.arena.rebounders.length === 0) return this.makeObjective({ kind: "runes", count: def.count }, puck);
        return this.makeBolt(def.count);
      }
      case "hold": {
        const p = this.spot(puck, 2);
        return { kind: "hold", x: p.x, y: p.y, r: Math.max(0.5, r * 0.9), progress: 0, left: def.count };
      }
    }
  }

  private updateObjective(dt: number, puck: PuckSample): void {
    if (!this.objective) {
      this.objectiveDelay -= dt;
      if (this.objectiveDelay > 0) return;
      const def = this.def.offense[this.offenseIndex % this.def.offense.length]!;
      this.objective = this.makeObjective(def, puck);
      return;
    }
    if (!puck.visible) return;
    const o = this.objective;
    switch (o.kind) {
      case "runes": {
        o.age += dt;
        o.ttl -= dt;
        if (dist(puck.x, puck.y, o.x, o.y) <= o.r) {
          const swift = o.age < 1.6;
          this.rt.tally.stick += 2;
          this.strike(swift ? 14 : 10, "carry", o.x, o.y, 12, swift ? "Swift!" : "");
          this.sfx.push(swift ? "perfect" : "hit");
          o.left -= 1;
          if (o.left <= 0) {
            this.nextObjective();
          } else {
            const p = this.spot(puck, Math.min(3, this.arena.w * 0.3));
            o.x = p.x;
            o.y = p.y;
            o.ttl = o.maxTtl;
            o.age = 0;
          }
        } else if (o.ttl <= 0) {
          // Too slow: the rune fades and moves. No damage, but the combo is lost.
          this.combo = 0;
          this.floats.push({ x: o.x, y: o.y, text: "Faded", color: "#9aa0a8", age: 0, big: false });
          const p = this.spot(puck, 2);
          o.x = p.x;
          o.y = p.y;
          o.ttl = o.maxTtl;
          o.age = 0;
        }
        break;
      }
      case "twin": {
        const target = o.next === 0 ? o.a : o.b;
        if (dist(puck.x, puck.y, target.x, target.y) <= o.r) {
          this.rt.tally.stick += 1;
          this.strike(o.wide ? 5 : 3, "pattern", target.x, target.y, 4);
          this.sfx.push("hit");
          o.next = o.next === 0 ? 1 : 0;
          o.left -= 1;
          if (o.left <= 0) this.nextObjective();
        }
        break;
      }
      case "weave": {
        const p = o.cur === 0 ? o.a : o.b;
        const range = dist(puck.x, puck.y, p.x, p.y);
        if (range > 0.25 && range < 3.6) {
          const ang = Math.atan2(puck.y - p.y, puck.x - p.x);
          if (o.prev !== null) o.acc += angleDelta(o.prev, ang);
          o.prev = ang;
        } else {
          o.prev = null;
        }
        if (Math.abs(o.acc) >= TAU * 0.85) {
          this.rt.tally.stick += 4;
          this.strike(14, "pattern", p.x, p.y, 14, "Loop!");
          this.sfx.push("perfect");
          o.cur = o.cur === 0 ? 1 : 0;
          o.acc = 0;
          o.prev = null;
          o.left -= 1;
          if (o.left <= 0) this.nextObjective();
        }
        break;
      }
      case "bolt":
        // Resolved by pass events in handleGestures.
        break;
      case "hold": {
        const inside = dist(puck.x, puck.y, o.x, o.y) <= o.r;
        o.progress = inside && puck.speed < 0.9 ? o.progress + dt : Math.max(0, o.progress - dt * 2);
        if (o.progress >= 0.9) {
          this.rt.tally.stick += 2;
          this.strike(14, "carry", o.x, o.y, 12, "Steady!");
          this.sfx.push("perfect");
          o.left -= 1;
          if (o.left <= 0) {
            this.nextObjective();
          } else {
            const p = this.spot(puck, 2);
            o.x = p.x;
            o.y = p.y;
            o.progress = 0;
          }
        }
        break;
      }
    }
  }

  // --------------------------------------------------------------- hazards

  private updateHazards(dt: number, puck: PuckSample): void {
    const enraged = !this.timed && this.time > this.def.par * 1.5;
    for (let i = 0; i < this.def.hazards.length; i += 1) {
      this.hazardTimers[i]! -= dt * (enraged ? 1.4 : 1);
      if (this.hazardTimers[i]! > 0) continue;
      const def = this.def.hazards[i]!;
      if (!puck.visible || (def.kind === "cast" && this.cast)) {
        this.hazardTimers[i] = 0.5;
        continue;
      }
      this.hazardTimers[i] = def.every * (0.8 + this.rng() * 0.4);
      this.spawnHazard(def, puck);
    }

    if (this.cast) {
      this.cast.t += dt;
      if (this.cast.t >= this.cast.total) this.castLands(puck);
    }

    for (let i = this.hazards.length - 1; i >= 0; i -= 1) {
      // A knock-down clears the floor mid-loop, so entries can vanish under us.
      const hz = this.hazards[i];
      if (!hz) continue;
      if (hz.kind === "fire") {
        hz.fuse -= dt;
        if (hz.fuse <= 0) {
          this.hazards.splice(i, 1);
          this.sfx.push("boom");
          if (puck.visible && dist(puck.x, puck.y, hz.x, hz.y) < hz.r) this.hurt(15, hz.x, hz.y, "Burned");
          else this.dodge(hz.x, hz.y);
        }
      } else if (hz.kind === "wave") {
        const before = hz.pos;
        hz.pos += hz.dir * hz.speed * dt;
        const along = hz.axis === "x" ? puck.x : puck.y;
        const across = hz.axis === "x" ? puck.y : puck.x;
        if (!hz.resolved && puck.visible && (before - along) * (hz.pos - along) <= 0) {
          hz.resolved = true;
          if (Math.abs(across - hz.gap) <= hz.gapWidth / 2) this.dodge(puck.x, puck.y);
          else this.hurt(12, puck.x, puck.y, "Swept");
        }
        const extent = hz.axis === "x" ? this.arena.w : this.arena.d;
        if (hz.pos < -0.5 || hz.pos > extent + 0.5) this.hazards.splice(i, 1);
      } else if (hz.kind === "chaser") {
        hz.life -= dt;
        if (puck.visible) {
          const range = dist(hz.x, hz.y, puck.x, puck.y);
          if (range < 0.5) {
            this.hazards.splice(i, 1);
            this.hurt(12, puck.x, puck.y, "Caught");
            continue;
          }
          const step = this.rt.tier.chaserSpeed * dt;
          hz.x += ((puck.x - hz.x) / range) * step;
          hz.y += ((puck.y - hz.y) / range) * step;
        }
        if (hz.life <= 0) {
          this.hazards.splice(i, 1);
          this.dodge(hz.x, hz.y);
        }
      } else if (hz.kind === "sigil" && this.cast && puck.visible && dist(puck.x, puck.y, hz.x, hz.y) <= hz.r) {
        if (hz.correct) {
          this.reactionTimes.push(this.cast.t);
          this.interrupts += 1;
          this.rt.tally.aware += 3;
          this.clearSigils();
          this.cast = null;
          this.strike(22, "carry", hz.x, hz.y, 20, "Interrupt!");
          this.say("Spell broken!", "", 1.2);
          this.sfx.push("interrupt");
        } else {
          this.castLands(puck);
        }
        break;
      }
    }
  }

  private clearSigils(): void {
    for (let i = this.hazards.length - 1; i >= 0; i -= 1) {
      if (this.hazards[i]!.kind === "sigil") this.hazards.splice(i, 1);
    }
  }

  private castLands(puck: PuckSample): void {
    this.clearSigils();
    this.cast = null;
    this.hurt(20, puck.x, puck.y, "Hexed");
  }

  private spawnHazard(def: HazardDef, puck: PuckSample): void {
    const tier = this.rt.tier;
    const { w, d } = this.arena;
    switch (def.kind) {
      case "fire": {
        const fuse = tier.fuse * this.rt.cls.mods.fuse * this.rt.focus;
        this.hazards.push({
          kind: "fire",
          x: clamp(puck.x + puck.vx * 0.25, 0.5, w - 0.5),
          y: clamp(puck.y + puck.vy * 0.25, 0.5, d - 0.5),
          r: 1.25,
          fuse,
          maxFuse: fuse
        });
        this.sfx.push("warn");
        break;
      }
      case "wave": {
        const axis = this.rng() < 0.5 ? "x" : "y";
        const extent = axis === "x" ? w : d;
        const crossExtent = axis === "x" ? d : w;
        const dir = this.rng() < 0.5 ? 1 : -1;
        const gapWidth = Math.min(crossExtent * 0.5, tier.targetRadius * 4.2);
        this.hazards.push({
          kind: "wave",
          axis,
          pos: dir === 1 ? 0 : extent,
          dir,
          speed: extent / (2.6 * tier.fuse),
          gap: gapWidth / 2 + this.rng() * (crossExtent - gapWidth),
          gapWidth,
          resolved: false
        });
        this.say("Wave incoming!", "Get to the gap", 1.4);
        this.sfx.push("warn");
        break;
      }
      case "chaser": {
        // Start in the corner farthest from the puck.
        const x = puck.x < w / 2 ? w - 0.4 : 0.4;
        const y = puck.y < d / 2 ? d - 0.4 : 0.4;
        this.hazards.push({ kind: "chaser", x, y, life: 6 });
        this.say("It's hunting your puck!", "Keep moving", 1.4);
        this.sfx.push("warn");
        break;
      }
      case "cast": {
        const options = [...SIGILS];
        const chosen: Sigil[] = [];
        for (let i = 0; i < 3; i += 1) chosen.push(options.splice(Math.floor(this.rng() * options.length), 1)[0]!);
        const total = tier.castTime * this.rt.focus;
        this.cast = { sigil: chosen[0]!, t: 0, total };
        const placed: Vec[] = [];
        chosen.forEach((sigil, index) => {
          let p = this.spot(puck, 1.8);
          for (let tries = 0; tries < 10 && placed.some((q) => dist(p.x, p.y, q.x, q.y) < 2.2); tries += 1) p = this.spot(puck, 1.8);
          placed.push(p);
          this.hazards.push({ kind: "sigil", x: p.x, y: p.y, r: tier.targetRadius * 1.1, sigil, correct: index === 0 });
        });
        this.say(`${this.def.enemy.name} is casting!`, "Look up — find the matching stone", 1.8);
        this.sfx.push("cast");
        break;
      }
    }
  }
}
