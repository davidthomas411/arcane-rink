import type { Rebounder } from "../input/calibration";
import type { GestureDetector } from "../input/Gestures";
import type { PuckSample } from "../input/PuckSource";
import { angleDelta, clamp, dist, pointSegment } from "../util";
import { CLASSES, TIERS, type ClassDef, type TierDef } from "./classes";
import type { BossAbility, EncounterDef, EnemyKind, Move, Spawn } from "./content";
import { gearBonus } from "./loot";
import type { Hero } from "./save";

export type ArenaInfo = { w: number; d: number; rebounders: readonly Rebounder[] };

export type EnemyState = "spawn" | "move" | "windup" | "recover" | "aim" | "charge" | "cast" | "dead";

export type Enemy = {
  id: number;
  kind: EnemyKind;
  name: string;
  x: number;
  y: number;
  r: number;
  /** Direction it is looking, radians. Its swing, shield and weak back all hang off this. */
  facing: number;
  hp: number;
  maxHp: number;
  state: EnemyState;
  /** Seconds in the current state, and how long the state lasts. */
  t: number;
  dur: number;
  /** Seconds until it may start its next attack. */
  cd: number;
  /** Seconds left stunned; frozen is the same thing with ice on it. */
  stun: number;
  frozen: boolean;
  /** Brutes carry a shield; lightning knocks it down for a while. */
  shield: boolean;
  shieldDown: number;
  /** Boss only: warded against everything but crystal lightning. */
  warded: boolean;
  only: Move | null;
  /** In a defence, a raider that has been hit turns on the hero and leaves the ward alone. */
  aggro: boolean;
  flash: number;
  dashCd: number;
  immuneNote: number;
  phase: number;
  hitHero: boolean;
  abilityIndex: number;
  pending: BossAbility | null;
};

export type Projectile = { x: number; y: number; vx: number; vy: number; r: number; life: number };
export type FireZone = { x: number; y: number; r: number; fuse: number; maxFuse: number };
export type Pickup = { x: number; y: number; kind: "gold" | "heart"; value: number; life: number };
export type Ward = { x: number; y: number; r: number; hp: number; maxHp: number; flash: number };

export type FloatText = { x: number; y: number; text: string; color: string; age: number; big: boolean };

/** One-shot visual events for the renderer. */
export type Fx =
  | { type: "slash"; x: number; y: number; ang: number; crit: boolean }
  | { type: "bolt"; x1: number; y1: number; x2: number; y2: number }
  | { type: "ring"; x: number; y: number; r: number; color: string }
  | { type: "burst"; x: number; y: number; color: string; n: number }
  | { type: "heal"; x1: number; y1: number; x2: number; y2: number }
  | { type: "shake"; amt: number };

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

type Spec = { name: string; hp: number; r: number; speed: number; turn: number };

const SPECS: Record<EnemyKind, Spec> = {
  runner: { name: "Cellar Imp", hp: 1, r: 0.32, speed: 2.5, turn: 9 },
  grunt: { name: "Goblin Grunt", hp: 60, r: 0.55, speed: 1.5, turn: 2.4 },
  berserker: { name: "Goblin Berserker", hp: 80, r: 0.6, speed: 0.6, turn: 3 },
  brute: { name: "Shield Brute", hp: 110, r: 0.72, speed: 1.0, turn: 1.3 },
  shaman: { name: "Goblin Shaman", hp: 46, r: 0.5, speed: 1.2, turn: 4 },
  totem: { name: "Mending Totem", hp: 60, r: 0.5, speed: 0, turn: 0 },
  wisp: { name: "Wisp", hp: 1, r: 0.27, speed: 1.4, turn: 9 },
  dummy: { name: "Training Post", hp: 70, r: 0.45, speed: 0, turn: 0 },
  boss: { name: "Boss", hp: 500, r: 1.0, speed: 0.9, turn: 1.8 }
};

const REVIVE_TOUCHES = 10;
export const MOVE_LABEL: Record<Move, string> = {
  strike: "quick dribbles",
  cleave: "wide dribbles",
  dash: "a fast cut through it",
  ring: "a loop around it",
  bolt: "crystal lightning"
};

/**
 * One fight. The puck is the hero. Creatures move, face, and attack on the
 * screen; the hero's moves are recognised from how the puck is handled.
 */
export class Encounter {
  time = 0;
  done = false;
  combo = 0;
  bestCombo = 0;
  damageDone = 0;
  gold = 0;
  readonly enemies: Enemy[] = [];
  readonly projectiles: Projectile[] = [];
  readonly fires: FireZone[] = [];
  readonly pickups: Pickup[] = [];
  ward: Ward | null = null;
  wardBroken = false;
  target: Enemy | null = null;
  waveIndex = -1;
  /** Touches still needed to get back up, or 0 when standing. */
  reviveLeft = 0;
  /** Seconds the next hit is empowered for after a clean catch. */
  empowered = 0;
  readonly floats: FloatText[] = [];
  readonly fx: Fx[] = [];
  callout: { text: string; sub: string; ttl: number } | null = null;
  readonly sfx: string[] = [];
  /** Seconds from a cast starting to the hero breaking it. */
  readonly reactionTimes: number[] = [];
  dodges = 0;
  interrupts = 0;
  signatures = 0;
  heroFlash = 0;

  private rt: HeroRuntime;
  private readonly pace: number;
  private readonly dashSpeed: number;
  private nextId = 1;
  private waveDelay = 0.6;
  private invuln = 0;
  private lastPuck: { x: number; y: number } | null = null;

  constructor(
    readonly def: EncounterDef,
    private readonly arena: ArenaInfo,
    private readonly rng: () => number,
    hero: HeroRuntime
  ) {
    this.rt = hero;
    // Slower, more readable enemies for younger players.
    this.pace = hero.tier.fuse / 1.8;
    this.dashSpeed = hero.tier.passMinSpeed * 0.75;
    if (def.mode === "defend") {
      this.ward = { x: arena.w / 2, y: arena.d / 2, r: 0.7, hp: 100, maxHp: 100, flash: 0 };
    }
  }

  get hero(): HeroRuntime {
    return this.rt;
  }

  get timed(): boolean {
    return this.def.mode === "timed";
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

  get waveCount(): number {
    return this.def.waves.length;
  }

  get alive(): Enemy[] {
    return this.enemies.filter((e) => e.state !== "dead");
  }

  /** What the hero must do for their signature move, given the gear on the floor. */
  get signatureKind(): ClassDef["signature"]["kind"] {
    const kind = this.rt.cls.signature.kind;
    if ((kind === "hardPass" || kind === "quickPass") && this.arena.rebounders.length === 0) return "flurry";
    return kind;
  }

  /** Tag a different hero in (party play). Attacks in flight are cleared so the swap is fair. */
  setHero(hero: HeroRuntime): void {
    this.rt = hero;
    this.projectiles.length = 0;
    this.fires.length = 0;
    for (const e of this.enemies) {
      if (e.state === "windup" || e.state === "aim" || e.state === "charge" || e.state === "cast") this.setState(e, "move", 0);
      e.cd = Math.max(e.cd, 1.5);
    }
    this.reviveLeft = hero.hp <= 0 ? REVIVE_TOUCHES : 0;
    this.lastPuck = null;
  }

  /** 1–3 stars: fast and clean earns three. */
  get stars(): number {
    if (this.timed) return this.damageDone >= 140 ? 3 : this.damageDone >= 70 ? 2 : 1;
    const clean = this.rt.tally.downs === 0;
    let stars = this.time <= this.def.par && clean ? 3 : this.time <= this.def.par * 1.6 || clean ? 2 : 1;
    if (this.wardBroken) stars = Math.max(1, stars - 1);
    return stars;
  }

  // ----------------------------------------------------------------- update

  update(dt: number, puck: PuckSample, gestures: GestureDetector): void {
    this.sfx.length = 0;
    this.fx.length = 0;
    for (let i = this.floats.length - 1; i >= 0; i -= 1) {
      this.floats[i]!.age += dt;
      if (this.floats[i]!.age > 1.4) this.floats.splice(i, 1);
    }
    if (this.callout) {
      this.callout.ttl -= dt;
      if (this.callout.ttl <= 0) this.callout = null;
    }
    this.heroFlash = Math.max(0, this.heroFlash - dt * 2.5);
    for (const e of this.enemies) {
      e.flash = Math.max(0, e.flash - dt * 4);
      e.phase += dt;
      e.dashCd = Math.max(0, e.dashCd - dt);
      e.immuneNote = Math.max(0, e.immuneNote - dt);
      if (e.state === "dead") e.t += dt;
    }
    for (let i = this.enemies.length - 1; i >= 0; i -= 1) {
      if (this.enemies[i]!.state === "dead" && this.enemies[i]!.t > 0.7) this.enemies.splice(i, 1);
    }
    if (this.ward) this.ward.flash = Math.max(0, this.ward.flash - dt * 3);
    if (this.done) return;

    this.time += dt;
    this.rt.tally.seconds += dt;
    this.invuln = Math.max(0, this.invuln - dt);
    this.empowered = Math.max(0, this.empowered - dt);

    if (this.reviveLeft > 0) {
      // Enemies hold off while the hero gets back up.
      for (const event of gestures.events) {
        if (event.type !== "touch") continue;
        this.reviveLeft -= 1;
        this.rt.tally.stick += 1;
        this.sfx.push("tick");
        if (this.reviveLeft <= 0) {
          this.rt.hp = Math.round(this.rt.maxHp * 0.6);
          this.invuln = 2;
          this.say("Back in the fight!", "", 1.4);
          this.sfx.push("revive");
          break;
        }
      }
      this.lastPuck = null;
      return;
    }

    if (puck.visible) {
      this.handleGestures(puck, gestures);
      this.handleDash(puck);
      this.handlePickups(puck, dt);
    }
    for (const e of this.enemies) this.updateEnemy(e, dt, puck);
    this.updateHazards(dt, puck);
    this.lastPuck = puck.visible ? { x: puck.x, y: puck.y } : null;

    if (this.target && this.target.state === "dead") this.target = null;
    this.updateWaves(dt, puck);
    if (this.timed && this.time >= (this.def.timeLimit ?? 0)) this.finish();
  }

  private finish(): void {
    this.done = true;
    this.projectiles.length = 0;
    this.fires.length = 0;
    this.sfx.push("victory");
  }

  private say(text: string, sub: string, ttl: number): void {
    this.callout = { text, sub, ttl };
  }

  private float(x: number, y: number, text: string, color: string, big = false): void {
    this.floats.push({ x, y, text, color, age: 0, big });
  }

  // ------------------------------------------------------------------ waves

  private updateWaves(dt: number, puck: PuckSample): void {
    if (this.done) return;
    if (this.waveIndex >= 0 && (this.timed || this.alive.length > 0)) return;
    if (this.waveIndex + 1 >= this.def.waves.length) {
      this.finish();
      return;
    }
    this.waveDelay -= dt;
    if (this.waveDelay > 0) return;
    this.waveIndex += 1;
    this.waveDelay = 1.1;
    const wave = this.def.waves[this.waveIndex]!;
    for (const spawn of wave) this.spawnGroup(spawn, puck);
    if (this.def.boss && this.waveIndex === this.def.waves.length - 1) {
      const boss = this.addEnemy("boss", this.arena.w / 2, 2.0);
      boss.name = this.def.boss.name;
      boss.maxHp = Math.round(this.def.boss.hp * this.rt.tier.enemyHp);
      boss.hp = boss.maxHp;
      boss.cd = 2.5;
      this.target = boss;
    }
    if (this.def.waves.length > 1 && this.waveIndex > 0) {
      this.say(this.waveIndex === this.def.waves.length - 1 ? "Final wave!" : `Wave ${this.waveIndex + 1}`, "", 1.2);
      this.sfx.push("warn");
    }
  }

  private spawnGroup(spawn: Spawn, puck: PuckSample): void {
    const count = spawn.count ?? 1;
    const { w, d } = this.arena;
    let kind = spawn.kind;
    let only = spawn.only ?? null;
    // No rebounder on the floor: swap out anything that needs a pass.
    if (this.arena.rebounders.length === 0) {
      if (kind === "totem") kind = "brute";
      if (only === "bolt") only = "strike";
    }
    const cluster = kind === "wisp" ? this.edgeSpot(puck) : null;
    for (let i = 0; i < count; i += 1) {
      let x: number;
      let y: number;
      if (kind === "dummy") {
        x = count === 1 ? w / 2 : w / 2 + (i - (count - 1) / 2) * 3.0;
        y = d * 0.42;
      } else if (kind === "totem") {
        x = w * (0.25 + this.rng() * 0.5);
        y = d * (0.2 + this.rng() * 0.25);
      } else if (cluster) {
        x = clamp(cluster.x + (this.rng() - 0.5) * 1.6, 0.4, w - 0.4);
        y = clamp(cluster.y + (this.rng() - 0.5) * 1.6, 0.4, d - 0.4);
      } else if (kind === "runner") {
        x = 0.8 + this.rng() * (w - 1.6);
        y = 0.8 + this.rng() * (d - 1.6);
      } else {
        const p = this.edgeSpot(puck);
        x = p.x;
        y = p.y;
      }
      const e = this.addEnemy(kind, x, y);
      e.only = only;
      if (kind === "dummy" && only) e.name = `Post: ${MOVE_LABEL[only]}`;
    }
  }

  /** A point just inside the boards, away from the puck. */
  private edgeSpot(puck: PuckSample): { x: number; y: number } {
    const { w, d } = this.arena;
    let best = { x: w / 2, y: 0.8 };
    let bestD = -1;
    for (let i = 0; i < 10; i += 1) {
      const side = Math.floor(this.rng() * 4);
      const t = 0.12 + this.rng() * 0.76;
      const p = side === 0 ? { x: w * t, y: 1.5 } : side === 1 ? { x: w - 0.8, y: d * t } : side === 2 ? { x: w * t, y: d - 0.8 } : { x: 0.8, y: d * t };
      let clear = dist(p.x, p.y, puck.x, puck.y);
      for (const e of this.enemies) clear = Math.min(clear, dist(p.x, p.y, e.x, e.y) + 1.5);
      if (clear > bestD) {
        bestD = clear;
        best = p;
      }
      if (clear > 3.5) break;
    }
    return best;
  }

  private addEnemy(kind: EnemyKind, x: number, y: number): Enemy {
    const spec = SPECS[kind];
    const hp = kind === "runner" || kind === "wisp" ? 1 : Math.round(spec.hp * this.rt.tier.enemyHp);
    const e: Enemy = {
      id: this.nextId++,
      kind,
      name: spec.name,
      x,
      y,
      r: spec.r,
      facing: Math.atan2(this.arena.d / 2 - y, this.arena.w / 2 - x),
      hp,
      maxHp: hp,
      state: "spawn",
      t: 0,
      dur: 0.7,
      cd: 1 + this.rng() * 2,
      stun: 0,
      frozen: false,
      shield: kind === "brute",
      shieldDown: 0,
      warded: false,
      only: null,
      aggro: false,
      flash: 0,
      dashCd: 0,
      immuneNote: 0,
      phase: this.rng() * 6,
      hitHero: false,
      abilityIndex: 0,
      pending: null
    };
    this.enemies.push(e);
    return e;
  }

  private setState(e: Enemy, state: EnemyState, dur: number): void {
    e.state = state;
    e.t = 0;
    e.dur = dur;
  }

  // ----------------------------------------------------------- hero attacks

  /** True if the point is in the enemy's rear arc. */
  behind(e: Enemy, px: number, py: number): boolean {
    return Math.abs(angleDelta(e.facing, Math.atan2(py - e.y, px - e.x))) > 1.9;
  }

  /** Apply one of the hero's moves to an enemy. Returns damage dealt (0 if it had no effect). */
  private hit(e: Enemy, base: number, move: Move, fromX: number, fromY: number, power: number, force = false): number {
    if (e.state === "dead" || e.state === "spawn") return 0;
    const immune = (why: string): number => {
      if (e.immuneNote <= 0) {
        e.immuneNote = 0.9;
        this.float(e.x, e.y - e.r, why, "#9fb4c8");
        this.sfx.push("clank");
      }
      return 0;
    };
    const physical = move === "strike" || move === "cleave" || move === "dash";
    const fromBehind = this.behind(e, fromX, fromY);
    if (!force) {
      if (e.only && e.only !== move && !(e.only === "strike" && move === "cleave")) return immune(`Needs ${MOVE_LABEL[e.only]}`);
      if (e.kind === "totem" && move !== "bolt") return immune("Only lightning!");
      if (e.warded && move !== "bolt") return immune("Warded!");
      if (e.shield && e.shieldDown <= 0 && physical && !fromBehind && e.stun <= 0) return immune("Blocked!");
    }

    const mods = this.rt.cls.mods;
    let mult = move === "strike" || move === "cleave" ? mods.strike : move === "dash" ? mods.dash : move === "bolt" ? mods.bolt : mods.ring;
    let crit = false;
    const hasBack = e.kind === "grunt" || e.kind === "brute" || e.kind === "berserker" || e.kind === "shaman" || e.kind === "boss";
    if (physical && hasBack && fromBehind) {
      mult *= mods.backstab;
      crit = true;
    }
    if (e.stun > 0 && e.kind !== "dummy") mult *= 1.3;
    if (this.empowered > 0 && move !== "bolt") {
      mult *= this.rt.hero.classId === "ranger" ? 4 : 3;
      this.empowered = 0;
      crit = true;
    }
    const amount = Math.max(1, Math.round(base * mult * this.rt.dmgMult * this.comboMult));
    // Timed training posts never fall over; the damage is the score.
    if (!(this.timed && e.kind === "dummy")) e.hp = Math.max(0, e.hp - amount);
    this.damageDone += amount;
    this.rt.tally.damage += amount;
    this.rt.power = Math.min(100, this.rt.power + power * this.rt.haste);
    e.flash = 1;
    e.aggro = true;
    if (physical) this.target = e;
    this.float(e.x + (this.rng() - 0.5) * 0.5, e.y - e.r - 0.2, crit ? `${amount}!` : `${amount}`, crit ? "#ffd75a" : "#fff3c4", crit || amount >= 20);

    // Getting hit while casting breaks the spell.
    if (e.state === "cast" && e.kind !== "boss") {
      this.reactionTimes.push(e.t);
      this.interrupts += 1;
      this.rt.tally.aware += 2;
      e.stun = Math.max(e.stun, 1.2);
      e.cd = 3 * this.pace;
      this.setState(e, "move", 0);
      this.float(e.x, e.y - e.r - 0.7, "Interrupted!", "#8fe3a0", true);
      this.sfx.push("interrupt");
    }
    if (e.hp <= 0) this.kill(e);
    return amount;
  }

  private kill(e: Enemy): void {
    this.setState(e, "dead", 0.7);
    this.combo += 1;
    this.bestCombo = Math.max(this.bestCombo, this.combo);
    this.fx.push({ type: "burst", x: e.x, y: e.y, color: e.kind === "wisp" ? "#b9a6ff" : "#ffd75a", n: e.kind === "boss" ? 60 : 16 });
    this.sfx.push(e.kind === "wisp" || e.kind === "runner" ? "hit" : "kill");
    if (e.kind === "dummy") return;
    const roll = this.rng();
    const rich = e.kind === "boss" || e.kind === "brute";
    if (roll < (rich ? 1 : e.kind === "wisp" ? 0.12 : 0.4)) this.pickups.push({ x: e.x, y: e.y, kind: "gold", value: rich ? 15 : 5, life: 9 });
    else if (roll > 0.86 && this.rt.hp < this.rt.maxHp) this.pickups.push({ x: e.x, y: e.y, kind: "heart", value: 18, life: 9 });
  }

  private handleGestures(puck: PuckSample, gestures: GestureDetector): void {
    const tier = this.rt.tier;
    const sig = this.signatureKind;
    let signature = false;
    for (const event of gestures.events) {
      if (event.type === "touch") {
        const wide = event.amp >= 1.4;
        const reach = wide ? 1.5 : 1.0;
        const near = this.alive.filter((e) => e.state !== "spawn" && dist(e.x, e.y, puck.x, puck.y) <= e.r + reach);
        if (near.length === 0) continue;
        this.rt.tally.stick += 1;
        if (wide) {
          for (const e of near) this.hit(e, 4, "cleave", puck.x, puck.y, 4);
          this.fx.push({ type: "slash", x: puck.x, y: puck.y, ang: event.axis === "x" ? 0 : Math.PI / 2, crit: true });
          this.sfx.push("cleave");
        } else {
          const e = this.target && near.includes(this.target) ? this.target : near.reduce((a, b) => (dist(a.x, a.y, puck.x, puck.y) < dist(b.x, b.y, puck.x, puck.y) ? a : b));
          const dealt = this.hit(e, 3, "strike", puck.x, puck.y, 3);
          this.fx.push({ type: "slash", x: e.x, y: e.y, ang: Math.atan2(e.y - puck.y, e.x - puck.x), crit: false });
          if (dealt > 0) this.sfx.push("strike");
        }
      } else if (event.type === "passHit") {
        this.rt.tally.pass += 1;
        this.sfx.push("pass");
        const reb = this.arena.rebounders.find((r) => r.id === event.rebounderId);
        const ox = reb ? (reb.ax + reb.bx) / 2 : puck.x;
        const oy = reb ? (reb.ay + reb.by) / 2 : puck.y;
        const speedBonus = clamp((event.speed - tier.passMinSpeed) / tier.passMinSpeed, 0, 1) * 8;
        this.castBolt(ox, oy, 22 + speedBonus, puck);
        if (this.signatureReady && sig === "hardPass" && event.speed >= tier.passMinSpeed * 1.4) signature = true;
      } else if (event.type === "passReceived") {
        this.rt.tally.pass += 1;
        this.empowered = 4;
        this.rt.power = Math.min(100, this.rt.power + 8 * this.rt.haste);
        this.float(puck.x, puck.y - 0.5, "Clean catch — empowered!", "#8fe3a0");
        this.sfx.push("perfect");
        if (this.signatureReady && sig === "quickPass" && event.roundTrip <= 2.6) signature = true;
      } else if (event.type === "circle") {
        this.rt.tally.stick += 3;
        this.castRing(event.x, event.y, event.r);
        if (this.signatureReady && sig === "circle") signature = true;
      }
    }
    if (this.signatureReady && sig === "flurry" && gestures.touchesWithin(2.5) >= 7) signature = true;
    if (signature) this.castSignature(puck);
  }

  private pickTarget(puck: PuckSample): Enemy | null {
    if (this.target && this.target.state !== "dead" && this.target.state !== "spawn") return this.target;
    let best: Enemy | null = null;
    let bestD = Infinity;
    for (const e of this.alive) {
      if (e.state === "spawn") continue;
      const d = dist(e.x, e.y, puck.x, puck.y) + (e.kind === "dummy" && e.only !== "bolt" ? 50 : 0);
      if (d < bestD) {
        bestD = d;
        best = e;
      }
    }
    return best;
  }

  private shock(e: Enemy, dmg: number, x1: number, y1: number, stun: number): void {
    this.fx.push({ type: "bolt", x1, y1, x2: e.x, y2: e.y });
    if (e.warded) {
      e.warded = false;
      e.stun = 3;
      this.setState(e, "move", 0);
      this.say("Ward shattered!", "Hit him now!", 1.6);
    }
    if (e.shield) e.shieldDown = 6;
    this.hit(e, dmg, "bolt", x1, y1, 16);
    if (e.state !== "dead" && e.kind !== "dummy" && e.kind !== "totem") {
      e.stun = Math.max(e.stun, stun);
      if (e.state === "windup" || e.state === "aim") this.setState(e, "move", 0);
    }
  }

  private castBolt(ox: number, oy: number, dmg: number, puck: PuckSample): void {
    // Lightning goes first for what only lightning can hurt, whatever the hero was hitting.
    const priority = this.alive.find((e) => e.state !== "spawn" && (e.kind === "totem" || e.warded || e.only === "bolt"));
    const first = priority ?? this.pickTarget(puck);
    if (!first) return;
    this.shock(first, dmg, ox, oy, 1.5);
    this.sfx.push("zap");
    const chains = this.rt.hero.classId === "ranger" ? 3 : 1;
    const struck = new Set<Enemy>([first]);
    let from = first;
    for (let i = 0; i < chains; i += 1) {
      let next: Enemy | null = null;
      let nextD = 4;
      for (const e of this.alive) {
        if (struck.has(e) || e.state === "spawn") continue;
        const d = dist(e.x, e.y, from.x, from.y);
        if (d < nextD) {
          nextD = d;
          next = e;
        }
      }
      if (!next) break;
      struck.add(next);
      this.shock(next, dmg * 0.5, from.x, from.y, 1);
      from = next;
    }
  }

  private castRing(x: number, y: number, r: number): void {
    if (r > 3.6) return;
    this.fx.push({ type: "ring", x, y, r, color: "#9fd8ff" });
    const mage = this.rt.hero.classId === "mage";
    let caught = 0;
    for (const e of this.alive) {
      if (e.state === "spawn" || dist(e.x, e.y, x, y) > r + e.r * 0.5) continue;
      const dealt = this.hit(e, 14, "ring", x, y, 9);
      if (dealt > 0) {
        caught += 1;
        if (e.state !== "dead" && e.kind !== "dummy") {
          e.stun = Math.max(e.stun, mage ? 3.5 : 2.5);
          e.frozen = true;
          if (e.state === "windup" || e.state === "aim") this.setState(e, "move", 0);
        }
      }
    }
    if (caught > 0) this.sfx.push("freeze");
    if (caught >= 3) this.float(x, y, `Ringed ${caught}!`, "#9fd8ff", true);
  }

  private castSignature(puck: PuckSample): void {
    const cls = this.rt.cls;
    this.signatures += 1;
    this.say(`${cls.signature.name}!`, "", 1.3);
    this.sfx.push("signature");
    this.fx.push({ type: "shake", amt: 0.5 });
    const foes = this.alive.filter((e) => e.state !== "spawn");
    // Signature moves cut through wards, shields and totems.
    const smite = (e: Enemy, dmg: number, stun: number, frozen: boolean): void => {
      this.hit(e, dmg, "ring", puck.x, puck.y, 0, true);
      if (e.state !== "dead" && e.kind !== "dummy" && e.kind !== "totem") {
        e.stun = Math.max(e.stun, stun);
        e.frozen = frozen;
        if (e.state === "windup" || e.state === "aim") this.setState(e, "move", 0);
      }
    };
    if (cls.id === "rogue") {
      const e = this.pickTarget(puck);
      if (e) smite(e, 70, 1.5, false);
      this.invuln = 2.5;
      this.fx.push({ type: "ring", x: puck.x, y: puck.y, r: 1.4, color: cls.color });
    } else if (cls.id === "mage") {
      for (const e of foes) smite(e, 26, 3.5, true);
      this.fx.push({ type: "ring", x: this.arena.w / 2, y: this.arena.d / 2, r: Math.max(this.arena.w, this.arena.d) * 0.6, color: "#9fd8ff" });
    } else {
      for (const e of foes) {
        const reb = this.arena.rebounders[Math.floor(this.rng() * this.arena.rebounders.length)];
        const ox = reb ? (reb.ax + reb.bx) / 2 : puck.x;
        const oy = reb ? (reb.ay + reb.by) / 2 : puck.y;
        this.fx.push({ type: "bolt", x1: ox, y1: oy, x2: e.x, y2: e.y });
        smite(e, cls.id === "warrior" ? 32 : 28, 2, false);
      }
    }
    this.rt.power = 0;
    this.projectiles.length = 0;
  }

  /** A fast cut of the puck straight through a body (and catching runners). */
  private handleDash(puck: PuckSample): void {
    const last = this.lastPuck;
    if (!last) return;
    for (const e of this.alive) {
      if (e.state === "spawn") continue;
      const near = pointSegment(e.x, e.y, last.x, last.y, puck.x, puck.y).d;
      if (e.kind === "runner") {
        if (near <= e.r + 0.3) {
          e.hp = 0;
          this.damageDone += 10;
          this.rt.tally.damage += 10;
          this.rt.tally.stick += 2;
          this.rt.power = Math.min(100, this.rt.power + 9 * this.rt.haste);
          this.float(e.x, e.y - 0.4, "Caught!", "#fff3c4", true);
          this.kill(e);
        }
        continue;
      }
      if (puck.speed < this.dashSpeed || e.dashCd > 0 || near > e.r * 0.9) continue;
      e.dashCd = 0.6;
      // Judged from where the cut started, so a dash that begins behind an enemy counts as a backstab.
      const dealt = this.hit(e, 8, "dash", last.x - puck.vx * 0.1, last.y - puck.vy * 0.1, 7);
      if (dealt > 0) {
        this.rt.tally.stick += 1;
        this.fx.push({ type: "slash", x: e.x, y: e.y, ang: Math.atan2(puck.vy, puck.vx), crit: true });
        this.sfx.push("cleave");
      }
    }
  }

  private handlePickups(puck: PuckSample, dt: number): void {
    for (let i = this.pickups.length - 1; i >= 0; i -= 1) {
      const p = this.pickups[i]!;
      p.life -= dt;
      if (dist(p.x, p.y, puck.x, puck.y) < 0.65) {
        if (p.kind === "gold") {
          this.gold += p.value;
          this.float(p.x, p.y - 0.3, `+${p.value} gold`, "#ffd75a");
        } else {
          this.rt.hp = Math.min(this.rt.maxHp, this.rt.hp + p.value);
          this.float(p.x, p.y - 0.3, `+${p.value} health`, "#8fe3a0");
        }
        this.sfx.push("coin");
        this.pickups.splice(i, 1);
      } else if (p.life <= 0) {
        this.pickups.splice(i, 1);
      }
    }
  }

  // ------------------------------------------------------------- hero harm

  private hurt(amount: number, x: number, y: number, text: string): void {
    if (this.invuln > 0 || this.reviveLeft > 0) return;
    this.invuln = 0.7;
    this.rt.hp = Math.max(0, this.rt.hp - amount);
    this.rt.tally.hitsTaken += 1;
    this.combo = 0;
    this.heroFlash = 1;
    this.float(x, y - 0.3, `${text} -${amount}`, "#ff6b57", true);
    this.fx.push({ type: "shake", amt: 0.35 });
    this.sfx.push("hurt");
    if (this.rt.hp <= 0) {
      this.rt.tally.downs += 1;
      this.reviveLeft = REVIVE_TOUCHES;
      this.projectiles.length = 0;
      this.fires.length = 0;
      for (const e of this.enemies) {
        if (e.state !== "dead" && e.state !== "spawn") this.setState(e, "move", 0);
        e.cd = Math.max(e.cd, 2);
      }
      this.say("Knocked down!", `${REVIVE_TOUCHES} quick dribbles to get up`, 2.5);
      this.sfx.push("down");
    }
  }

  private dodged(x: number, y: number): void {
    this.dodges += 1;
    this.rt.tally.aware += 1;
    this.rt.power = Math.min(100, this.rt.power + 5 * this.rt.haste);
    this.float(x, y - 0.3, "Dodged!", "#8fe3a0");
    this.sfx.push("dodge");
  }

  // --------------------------------------------------------------- enemy AI

  /** Swing reach and half-angle: used for both the telegraph and the hit test. */
  swingShape(e: Enemy): { reach: number; half: number } {
    return e.kind === "boss" ? { reach: e.r + 2.6, half: 1.1 } : { reach: e.r + 1.9, half: 0.95 };
  }

  private turnToward(e: Enemy, tx: number, ty: number, dt: number, rate: number): void {
    const delta = angleDelta(e.facing, Math.atan2(ty - e.y, tx - e.x));
    const step = (rate / this.pace) * dt;
    e.facing += clamp(delta, -step, step);
  }

  private stepToward(e: Enemy, tx: number, ty: number, dt: number, speed: number): void {
    const d = dist(e.x, e.y, tx, ty);
    if (d < 0.01) return;
    const step = (speed / this.pace) * dt;
    e.x = clamp(e.x + ((tx - e.x) / d) * step, e.r, this.arena.w - e.r);
    // Tall figures keep off the far boards so they do not cover the headline above the rink.
    e.y = clamp(e.y + ((ty - e.y) / d) * step, this.minY(e), this.arena.d - e.r);
  }

  /** Tall figures keep off the far boards so they do not cover the headline above the rink. */
  private minY(e: Enemy): number {
    return e.kind === "boss" ? 2.0 : e.kind === "wisp" || e.kind === "runner" ? e.r + 0.3 : 1.5;
  }

  /** Keep bodies from stacking on one spot. */
  private separate(e: Enemy, dt: number): void {
    for (const o of this.enemies) {
      if (o === e || o.state === "dead") continue;
      const d = dist(e.x, e.y, o.x, o.y);
      const min = (e.r + o.r) * 0.9;
      if (d > 0.001 && d < min) {
        const push = ((min - d) / min) * 2 * dt;
        e.x = clamp(e.x + ((e.x - o.x) / d) * push, e.r, this.arena.w - e.r);
        e.y = clamp(e.y + ((e.y - o.y) / d) * push, this.minY(e), this.arena.d - e.r);
      }
    }
  }

  private updateEnemy(e: Enemy, dt: number, puck: PuckSample): void {
    if (e.state === "dead") return;
    e.t += dt;
    if (e.state === "spawn") {
      if (e.t >= e.dur) this.setState(e, "move", 0);
      return;
    }
    e.shieldDown = Math.max(0, e.shieldDown - dt);
    if (e.stun > 0) {
      e.stun -= dt;
      if (e.stun <= 0) e.frozen = false;
      return;
    }
    e.cd -= dt;
    const spec = SPECS[e.kind];
    if (e.kind !== "totem" && e.kind !== "dummy" && e.state !== "charge") this.separate(e, dt);

    if (e.kind === "dummy") return;
    if (e.kind === "totem") {
      if (e.cd <= 0) {
        e.cd = 4;
        for (const o of this.alive) {
          if (o === e || o.kind === "totem" || o.kind === "dummy" || o.hp >= o.maxHp) continue;
          o.hp = Math.min(o.maxHp, o.hp + Math.ceil(o.maxHp * (o.kind === "boss" ? 0.03 : 0.12)));
          this.fx.push({ type: "heal", x1: e.x, y1: e.y, x2: o.x, y2: o.y });
        }
      }
      return;
    }
    if (e.kind === "runner") {
      if (!puck.visible) return;
      // Run from the puck, slide along the boards, and jink so it cannot be pinned in a corner forever.
      const d = Math.max(0.2, dist(e.x, e.y, puck.x, puck.y));
      let fx = (e.x - puck.x) / d;
      let fy = (e.y - puck.y) / d;
      const { w, d: depth } = this.arena;
      fx += (1 / Math.max(0.3, e.x) - 1 / Math.max(0.3, w - e.x)) * 0.9;
      fy += (1 / Math.max(0.3, e.y) - 1 / Math.max(0.3, depth - e.y)) * 0.9;
      const jink = Math.sin(e.phase * 2.3 + e.id) * 0.9;
      const gx = fx - fy * jink;
      const gy = fy + fx * jink;
      const len = Math.hypot(gx, gy) || 1;
      e.facing = Math.atan2(gy, gx);
      this.stepToward(e, e.x + gx / len, e.y + gy / len, dt, spec.speed * (d < 3.5 ? 1 : 0.35));
      return;
    }
    if (e.kind === "wisp") {
      if (!puck.visible) return;
      if (dist(e.x, e.y, puck.x, puck.y) < e.r + 0.28) {
        this.setState(e, "dead", 0.7);
        this.fx.push({ type: "burst", x: e.x, y: e.y, color: "#b9a6ff", n: 8 });
        this.hurt(5, puck.x, puck.y, "Stung");
        return;
      }
      const ang = Math.atan2(puck.y - e.y, puck.x - e.x) + Math.sin(e.phase * 3 + e.id * 1.7) * 0.8;
      e.facing = ang;
      this.stepToward(e, e.x + Math.cos(ang), e.y + Math.sin(ang), dt, spec.speed);
      return;
    }

    // Grunts and brutes go for the ward in a defence; everything else hunts the puck.
    const wardTarget = this.ward && !this.wardBroken && !e.aggro && (e.kind === "grunt" || e.kind === "brute") ? this.ward : null;
    const tx = wardTarget ? wardTarget.x : puck.x;
    const ty = wardTarget ? wardTarget.y : puck.y;
    if (!wardTarget && !puck.visible && e.state === "move") return;
    const range = dist(e.x, e.y, tx, ty);

    switch (e.state) {
      case "move": {
        this.turnToward(e, tx, ty, dt, spec.turn);
        if (e.kind === "grunt" || e.kind === "brute") {
          const reach = wardTarget ? e.r + wardTarget.r + 0.25 : e.r + 0.9;
          if (range > reach) this.stepToward(e, tx, ty, dt, spec.speed);
          else if (e.cd <= 0) this.setState(e, "windup", (e.kind === "brute" ? 1.15 : 0.9) * this.pace);
        } else if (e.kind === "berserker") {
          if (range > 5) this.stepToward(e, tx, ty, dt, spec.speed);
          if (e.cd <= 0) this.setState(e, "aim", 1.15 * this.pace);
        } else if (e.kind === "shaman") {
          if (range < 2.8) this.stepToward(e, e.x * 2 - tx, e.y * 2 - ty, dt, spec.speed);
          else if (range > 5.5) this.stepToward(e, tx, ty, dt, spec.speed);
          if (e.cd <= 0) this.setState(e, "cast", 1.5 * this.pace);
        } else if (e.kind === "boss") {
          if (range > e.r + 1.3) this.stepToward(e, tx, ty, dt, spec.speed);
          if (e.cd <= 0) this.startBossAbility(e, puck);
        }
        break;
      }
      case "windup": {
        if (e.t < e.dur) break;
        const { reach, half } = this.swingShape(e);
        if (wardTarget) {
          wardTarget.hp = Math.max(0, wardTarget.hp - (e.kind === "brute" ? 10 : 6));
          wardTarget.flash = 1;
          this.sfx.push("boom");
          if (wardTarget.hp <= 0) {
            this.wardBroken = true;
            this.say("The ward has fallen!", "Finish them anyway", 2);
            this.fx.push({ type: "burst", x: wardTarget.x, y: wardTarget.y, color: "#9fd8ff", n: 30 });
          }
        } else if (puck.visible) {
          const inCone = range <= reach && Math.abs(angleDelta(e.facing, Math.atan2(puck.y - e.y, puck.x - e.x))) <= half;
          if (inCone) this.hurt(e.kind === "boss" ? 16 : e.kind === "brute" ? 13 : 10, puck.x, puck.y, "Hit");
          else if (range <= reach + 1.5) this.dodged(puck.x, puck.y);
        }
        this.fx.push({ type: "slash", x: e.x + Math.cos(e.facing) * reach * 0.5, y: e.y + Math.sin(e.facing) * reach * 0.5, ang: e.facing + Math.PI / 2, crit: false });
        this.sfx.push("swing");
        this.setState(e, "recover", 1.1);
        break;
      }
      case "recover": {
        if (e.t >= e.dur) {
          e.cd = e.kind === "boss" ? this.bossCooldown(e) : (e.aggro || !this.ward ? 0.5 : 1.4) * this.pace;
          this.setState(e, "move", 0);
        }
        break;
      }
      case "aim": {
        // Tracks the puck, then commits to a lane for the last part of the wind-up.
        if (e.t < e.dur * 0.6) this.turnToward(e, tx, ty, dt, 6);
        if (e.t >= e.dur) {
          e.hitHero = false;
          this.setState(e, "charge", 3);
          this.sfx.push("swing");
        }
        break;
      }
      case "charge": {
        const speed = (e.kind === "boss" ? 9 : 11) / Math.sqrt(this.pace);
        e.x += Math.cos(e.facing) * speed * dt;
        e.y += Math.sin(e.facing) * speed * dt;
        if (puck.visible && !e.hitHero && dist(e.x, e.y, puck.x, puck.y) < e.r + 0.45) {
          e.hitHero = true;
          this.hurt(e.kind === "boss" ? 18 : 14, puck.x, puck.y, "Trampled");
        }
        const { w, d } = this.arena;
        if (e.x < e.r || e.x > w - e.r || e.y < this.minY(e) || e.y > d - e.r || e.t >= e.dur) {
          e.x = clamp(e.x, e.r, w - e.r);
          e.y = clamp(e.y, this.minY(e), d - e.r);
          // Missing means crashing into the boards: the opening to punish.
          e.stun = e.hitHero ? 0.8 : e.kind === "boss" ? 3 : 2.5;
          if (!e.hitHero) {
            this.dodged(e.x, e.y);
            this.float(e.x, e.y - e.r - 0.6, "Stunned!", "#ffd75a", true);
          }
          this.fx.push({ type: "shake", amt: 0.25 });
          this.fx.push({ type: "burst", x: e.x, y: e.y, color: "#cfd6dd", n: 10 });
          this.sfx.push("boom");
          e.cd = e.kind === "boss" ? this.bossCooldown(e) : 4.5 * this.pace;
          this.setState(e, "move", 0);
        }
        break;
      }
      case "cast": {
        if (e.t < e.dur * 0.7) this.turnToward(e, tx, ty, dt, 6);
        if (e.t < e.dur) break;
        if (e.kind === "boss" && e.pending === "bombs") {
          const fuse = this.rt.tier.fuse * this.rt.focus;
          const spots = [
            { x: puck.x, y: puck.y },
            { x: puck.x + (this.rng() - 0.5) * 5, y: puck.y + (this.rng() - 0.5) * 4 },
            { x: puck.x + (this.rng() - 0.5) * 5, y: puck.y + (this.rng() - 0.5) * 4 }
          ];
          for (const s of spots) {
            this.fires.push({ x: clamp(s.x, 0.6, this.arena.w - 0.6), y: clamp(s.y, 0.6, this.arena.d - 0.6), r: 1.25, fuse, maxFuse: fuse });
          }
          this.sfx.push("warn");
        } else {
          const speed = 6 / this.pace;
          const spread = e.kind === "boss" ? [-0.38, 0, 0.38] : [0];
          for (const off of spread) {
            const a = e.facing + off;
            this.projectiles.push({ x: e.x + Math.cos(a) * e.r, y: e.y + Math.sin(a) * e.r, vx: Math.cos(a) * speed, vy: Math.sin(a) * speed, r: 0.28, life: 4 });
          }
          this.sfx.push("cast");
        }
        e.pending = null;
        e.cd = e.kind === "boss" ? this.bossCooldown(e) : 3.2 * this.pace;
        this.setState(e, "move", 0);
        break;
      }
      default:
        break;
    }
  }

  private bossCooldown(e: Enemy): number {
    return (e.hp < e.maxHp * 0.35 ? 1.3 : 2.1) * this.pace;
  }

  private startBossAbility(e: Enemy, puck: PuckSample): void {
    const list = this.def.boss?.abilities ?? ["swing"];
    let ability = list[e.abilityIndex % list.length]!;
    e.abilityIndex += 1;
    if (this.arena.rebounders.length === 0 && (ability === "ward" || ability === "totem")) ability = "swing";
    if (this.alive.length >= 6 && (ability === "grunts" || ability === "wisps" || ability === "totem")) ability = "swing";
    switch (ability) {
      case "swing":
        // Only swing if the hero is close enough for it to matter; otherwise lunge closer and try again.
        if (dist(e.x, e.y, puck.x, puck.y) <= this.swingShape(e).reach + 0.6) {
          this.setState(e, "windup", 1.15 * this.pace);
        } else {
          e.abilityIndex -= 1;
          e.cd = 0.4;
          this.stepToward(e, puck.x, puck.y, 0.25, 4);
        }
        break;
      case "charge":
        this.setState(e, "aim", 1.25 * this.pace);
        break;
      case "bombs":
      case "volley":
        e.pending = ability;
        this.setState(e, "cast", (ability === "bombs" ? 0.8 : 1.35) * this.pace);
        if (ability === "bombs") this.say("Bombs!", "Get clear of the red", 1.2);
        break;
      case "ward":
        e.warded = true;
        e.cd = 4 * this.pace;
        this.say(`${e.name} is warded!`, "Pass off a crystal to shatter it", 2.2);
        this.sfx.push("cast");
        break;
      case "grunts":
        this.spawnGroup({ kind: "grunt", count: 2 }, puck);
        e.cd = this.bossCooldown(e);
        this.say("Reinforcements!", "", 1.2);
        break;
      case "wisps":
        this.spawnGroup({ kind: "wisp", count: 5 }, puck);
        e.cd = this.bossCooldown(e);
        break;
      case "totem":
        this.spawnGroup({ kind: "totem" }, puck);
        e.cd = this.bossCooldown(e);
        this.say("A totem is healing him!", "Break it with a pass", 1.8);
        break;
    }
  }

  private updateHazards(dt: number, puck: PuckSample): void {
    // A warded boss slowly mends until the ward is shattered.
    for (const e of this.enemies) {
      if (e.warded && e.state !== "dead") e.hp = Math.min(e.maxHp, e.hp + e.maxHp * 0.012 * dt);
    }
    for (let i = this.projectiles.length - 1; i >= 0; i -= 1) {
      const p = this.projectiles[i];
      if (!p) continue;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.life -= dt;
      if (puck.visible && dist(p.x, p.y, puck.x, puck.y) < p.r + 0.26) {
        this.projectiles.splice(i, 1);
        this.fx.push({ type: "burst", x: p.x, y: p.y, color: "#b06fe0", n: 8 });
        this.hurt(10, puck.x, puck.y, "Hexed");
        continue;
      }
      const { w, d } = this.arena;
      if (p.x < -0.3 || p.y < -0.3 || p.x > w + 0.3 || p.y > d + 0.3 || p.life <= 0) {
        this.projectiles.splice(i, 1);
        this.dodged(clamp(p.x, 0.5, w - 0.5), clamp(p.y, 0.5, d - 0.5));
      }
    }
    for (let i = this.fires.length - 1; i >= 0; i -= 1) {
      // A knock-down clears these lists mid-loop, so entries can vanish under us.
      const f = this.fires[i];
      if (!f) continue;
      f.fuse -= dt;
      if (f.fuse > 0) continue;
      this.fires.splice(i, 1);
      this.sfx.push("boom");
      this.fx.push({ type: "burst", x: f.x, y: f.y, color: "#ff7a3c", n: 18 });
      const range = puck.visible ? dist(puck.x, puck.y, f.x, f.y) : Infinity;
      if (range < f.r) this.hurt(12, f.x, f.y, "Burned");
      else if (range < f.r + 1.5) this.dodged(f.x, f.y);
    }
  }
}
