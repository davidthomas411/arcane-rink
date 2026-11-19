import type { TierDef } from "../realm/game/classes";
import type { Rebounder } from "../realm/input/calibration";
import type { GestureDetector } from "../realm/input/Gestures";
import type { PuckSample } from "../realm/input/PuckSource";
import { clamp, dist } from "../realm/util";

/**
 * Real-time hockey on a full-size rink. Units are metres; up-ice (toward the
 * goblin net) is -z, so "push the puck away from you on the floor" is "go forward".
 *
 * The player's patch of floor rides along with their skater: where the puck sits
 * on the floor is where it sits around the skater's feet, and it also steers.
 *   puck forward / back   -> skate faster / slower
 *   puck left / right     -> drift that way (quick dribbles average out)
 *   move the puck away from a poke-check in time -> deke
 *   pass off a side rebounder  -> pass to a winger; a clean catch brings it back
 *   pass off the far rebounder -> shoot; hit its left or right end to pick your corner
 */
export const RINK = { halfW: 13, halfL: 30, goalLine: 27, blueLine: 8.5, netHalf: 0.92 };

export type Mate = { x: number; z: number; open: boolean };
export type Goblin = { x: number; z: number; state: "skate" | "poke" | "beaten"; t: number; markX: number; markZ: number; cd: number; homeX: number };
export type Holder = "me" | "wing0" | "wing1" | "flight" | "goblin";
export type RushPhase = "play" | "battle" | "goal" | "conceded" | "over";

export type RushArena = { w: number; d: number; rebounders: readonly Rebounder[] };

const REACH_X = 1.5;
const REACH_Z = 1.1;
const PERIOD_SECONDS = 150;

export class RushSim {
  readonly me = { x: 0, z: 14, vx: 0, vz: 0 };
  /** Smoothed puck offset used for steering, so stickhandling does not jerk the skater about. */
  private steerX = 0;
  private steerZ = 0;
  /** Where the puck is around the skater right now. */
  lx = 0;
  lz = -0.5;
  readonly puck = { x: 0, z: 13.5 };
  holder: Holder = "me";
  private flight: { fromX: number; fromZ: number; toX: number; toZ: number; t: number; dur: number; then: Holder | "shot" } | null = null;
  readonly wings: [Mate, Mate] = [
    { x: -7, z: 12, open: true },
    { x: 7, z: 12, open: true }
  ];
  readonly goblins: Goblin[] = [];
  readonly goalie = { x: 0 };
  readonly score: [number, number] = [0, 0];
  period = 1;
  clock = PERIOD_SECONDS;
  phase: RushPhase = "play";
  phaseT = 0;
  /** Quick touches still needed to win the puck back in a battle. */
  battleLeft = 0;
  battleTime = 0;
  banner: { text: string; sub: string; ttl: number } | null = null;
  readonly sfx: string[] = [];
  dekes = 0;
  passes = 0;
  shots = 0;
  private wingHold = 0;
  private boost = 0;
  private shotAim = 0;
  private shotPower = 0;
  private readonly pace: number;

  constructor(private readonly arena: RushArena, private readonly tier: TierDef, private readonly rng: () => number) {
    this.pace = tier.fuse / 1.8;
    this.faceoff(true);
  }

  private say(text: string, sub = "", ttl = 1.6): void {
    this.banner = { text, sub, ttl };
  }

  private faceoff(mine: boolean): void {
    this.me.x = 0;
    this.me.z = mine ? 14 : 18;
    this.me.vx = 0;
    this.me.vz = 0;
    this.holder = "me";
    this.flight = null;
    this.goblins.length = 0;
    for (const [x, z] of [[-4, 2], [4.5, -6], [-1, -15]] as const) {
      this.goblins.push({ x, z, state: "skate", t: 0, markX: 0, markZ: 0, cd: 1.5, homeX: x });
    }
    this.goalie.x = 0;
    this.phase = "play";
    this.phaseT = 0;
  }

  /** Floor position (feet) -> offset around the skater (metres). */
  local(puck: PuckSample): { lx: number; lz: number } {
    return {
      lx: clamp((puck.x / this.arena.w - 0.5) * 2, -1, 1) * REACH_X,
      lz: clamp((puck.y / this.arena.d - 0.55) * 2, -1, 1) * REACH_Z
    };
  }

  get inZone(): boolean {
    return this.me.z < -RINK.blueLine;
  }

  /** Which way a rebounder sits from the middle of the floor. */
  private side(id: string): "left" | "right" | "far" | "near" {
    const reb = this.arena.rebounders.find((r) => r.id === id);
    if (!reb) return "far";
    const dx = (reb.ax + reb.bx) / 2 - this.arena.w / 2;
    const dy = (reb.ay + reb.by) / 2 - this.arena.d / 2;
    if (Math.abs(dx) * this.arena.d > Math.abs(dy) * this.arena.w) return dx < 0 ? "left" : "right";
    return dy < 0 ? "far" : "near";
  }

  update(dt: number, puck: PuckSample, gestures: GestureDetector): void {
    this.sfx.length = 0;
    if (this.banner) {
      this.banner.ttl -= dt;
      if (this.banner.ttl <= 0) this.banner = null;
    }
    if (this.phase === "over") return;
    this.phaseT += dt;

    if (this.phase === "goal" || this.phase === "conceded") {
      if (this.phaseT > 2.6) this.faceoff(this.phase === "conceded");
      return;
    }

    this.clock -= dt;
    if (this.clock <= 0) {
      if (this.period >= 2) {
        this.phase = "over";
        this.say("Final whistle", `${this.score[0]} – ${this.score[1]}`, 99);
        this.sfx.push("victory");
        return;
      }
      this.period += 1;
      this.clock = PERIOD_SECONDS;
      this.say("Period 2", "", 1.8);
      this.faceoff(true);
    }

    if (puck.visible) {
      const l = this.local(puck);
      this.lx = l.lx;
      this.lz = l.lz;
    }

    if (this.phase === "battle") {
      this.updateBattle(dt, gestures);
      return;
    }

    this.skate(dt);
    this.updateWings(dt);
    this.handleGestures(puck, gestures);
    this.updateFlight(dt);
    this.updateGoblins(dt);

    if (this.holder === "me") {
      this.puck.x = this.me.x + this.lx;
      this.puck.z = this.me.z + this.lz;
    } else if (this.holder === "wing0" || this.holder === "wing1") {
      const w = this.wings[this.holder === "wing0" ? 0 : 1];
      this.puck.x = w.x + (this.holder === "wing0" ? 0.5 : -0.5);
      this.puck.z = w.z - 0.6;
      this.wingHold -= dt;
      // If the real puck never came back cleanly, the winger sends it back anyway after a moment.
      if (this.wingHold <= 0) this.launch(this.me.x, this.me.z - 0.5, "me");
    }
    // The goalie leans toward the side the puck is on, but only so fast: pull it across, then pick the far corner.
    const want = clamp((this.me.x / RINK.halfW) * 1.2 + (this.lx / REACH_X) * 0.55, -0.7, 0.7);
    this.goalie.x += clamp(want - this.goalie.x, -1.5 * dt, 1.5 * dt) / this.pace;
  }

  private skate(dt: number): void {
    const k = 1 - Math.exp(-dt / 0.45);
    this.steerX += (this.lx - this.steerX) * k;
    this.steerZ += (this.lz - this.steerZ) * k;
    this.boost = Math.max(0, this.boost - dt);
    const forward = 3.4 + clamp(-this.steerZ / REACH_Z, -1, 1) * 2.6 + (this.boost > 0 ? 2 : 0);
    const wantVx = (this.steerX / REACH_X) * 4.2;
    const a = 1 - Math.exp(-dt / 0.3);
    this.me.vx += (wantVx - this.me.vx) * a;
    this.me.vz += (-forward - this.me.vz) * a;
    this.me.x = clamp(this.me.x + this.me.vx * dt, -RINK.halfW + 1.2, RINK.halfW - 1.2);
    this.me.z = clamp(this.me.z + this.me.vz * dt, -RINK.goalLine + 3.2, RINK.halfL - 2);
  }

  private updateWings(dt: number): void {
    this.wings.forEach((w, i) => {
      const side = i === 0 ? -1 : 1;
      const tx = clamp(this.me.x * 0.35 + side * 7.5, -RINK.halfW + 1.5, RINK.halfW - 1.5);
      const tz = clamp(this.me.z - 2.5, -RINK.goalLine + 5, RINK.halfL - 2);
      w.x += clamp(tx - w.x, -5 * dt, 5 * dt);
      w.z += clamp(tz - w.z, -7.5 * dt, 7.5 * dt);
      w.open = !this.goblins.some((g) => g.state !== "beaten" && dist(g.x, g.z, w.x, w.z) < 3.2);
    });
  }

  private launch(toX: number, toZ: number, then: Holder | "shot"): void {
    const d = dist(this.puck.x, this.puck.z, toX, toZ);
    this.flight = { fromX: this.puck.x, fromZ: this.puck.z, toX, toZ, t: 0, dur: Math.max(0.18, d / 20), then };
    this.holder = "flight";
  }

  private handleGestures(puck: PuckSample, gestures: GestureDetector): void {
    const noRebounders = this.arena.rebounders.length === 0;
    for (const e of gestures.events) {
      if (e.type === "passHit" && this.holder === "me") {
        const side = this.side(e.rebounderId);
        const power = clamp(e.speed / this.tier.passMinSpeed - 1, 0, 1);
        if (side === "far" && this.inZone) this.shoot(power, this.spotOn(e.rebounderId, puck));
        else this.pass(side === "right" ? 1 : side === "left" ? 0 : this.wings[0].open ? 0 : 1);
      } else if (e.type === "passReceived" && (this.holder === "wing0" || this.holder === "wing1")) {
        // The real puck came back off the rebounder and was caught: that is the return pass.
        this.launch(this.me.x, this.me.z - 0.5, "me");
        this.boost = 2.5;
        for (const g of this.goblins) {
          if (g.state !== "beaten" && dist(g.x, g.z, this.me.x, this.me.z) < 5) this.beat(g);
        }
        this.say("Give and go!", "Clean catch — you're past them", 1.3);
        this.sfx.push("perfect");
      }
    }
    // Without a rebounder: a hard push away is a shot, a hard push sideways is a pass.
    if (noRebounders && this.holder === "me" && puck.visible && puck.speed > this.tier.passMinSpeed * 1.3) {
      if (-puck.vy > Math.abs(puck.vx) * 1.5 && this.inZone) this.shoot(0.5, clamp(this.lx / REACH_X, -1, 1));
      else if (Math.abs(puck.vx) > Math.abs(puck.vy) * 1.5) this.pass(puck.vx < 0 ? 0 : 1);
    }
  }

  private pass(to: 0 | 1): void {
    const w = this.wings[to];
    this.passes += 1;
    this.wingHold = 2.4;
    this.launch(w.x, w.z - 0.6, to === 0 ? "wing0" : "wing1");
    this.sfx.push("pass");
  }

  /** Where along a rebounder the puck struck: -1 at its left end, +1 at its right. */
  private spotOn(id: string, puck: PuckSample): number {
    const reb = this.arena.rebounders.find((r) => r.id === id);
    if (!reb) return 0;
    const lo = Math.min(reb.ax, reb.bx);
    const hi = Math.max(reb.ax, reb.bx);
    return hi - lo < 0.2 ? 0 : clamp(((puck.x - lo) / (hi - lo)) * 2 - 1, -1, 1);
  }

  /** @param spot -1..1: which side of the net the shot is headed for. */
  private shoot(power: number, spot: number): void {
    this.shots += 1;
    this.shotAim = spot * (RINK.netHalf - 0.12);
    this.shotPower = power;
    this.launch(this.shotAim, -RINK.goalLine, "shot");
    this.sfx.push("cleave");
  }

  private updateFlight(dt: number): void {
    const f = this.flight;
    if (!f) return;
    f.t += dt;
    const k = Math.min(1, f.t / f.dur);
    this.puck.x = f.fromX + (f.toX - f.fromX) * k;
    this.puck.z = f.fromZ + (f.toZ - f.fromZ) * k;
    if (k < 1) return;
    this.flight = null;
    if (f.then === "shot") {
      const cover = 0.5 - this.shotPower * 0.18;
      if (Math.abs(this.shotAim - this.goalie.x) > cover) {
        this.score[0] += 1;
        this.phase = "goal";
        this.phaseT = 0;
        this.say("GOAL!!!", `${this.score[0]} – ${this.score[1]}`, 2.6);
        this.sfx.push("victory");
      } else {
        this.say("Saved!", "Aim for the end of the crystals the goalie has left open", 1.7);
        this.sfx.push("clank");
        this.turnover(this.goblins[2] ?? this.goblins[0]!);
      }
      return;
    }
    this.holder = f.then;
  }

  private beat(g: Goblin): void {
    g.state = "beaten";
    g.t = 0;
  }

  private updateGoblins(dt: number): void {
    const carrierX = this.holder === "me" ? this.me.x : this.puck.x;
    const carrierZ = this.holder === "me" ? this.me.z : this.puck.z;
    for (const g of this.goblins) {
      g.t += dt;
      g.cd -= dt;
      if (g.state === "beaten") {
        // Left behind; gets back into the play after a while.
        if (g.t > 3.2 * this.pace) {
          g.state = "skate";
          g.z = Math.min(g.z, this.me.z - 12);
          g.x = g.homeX;
        }
        continue;
      }
      const range = dist(g.x, g.z, carrierX, carrierZ);
      if (g.state === "skate") {
        // Hold a gap in front of the puck carrier, closing as they get near.
        const ahead = g.z < carrierZ + 1;
        const tx = ahead ? carrierX * 0.8 + g.homeX * 0.2 : g.homeX;
        const tz = ahead ? carrierZ - 1.4 : carrierZ - 9;
        const speed = (range < 9 ? 3.6 : 2) / this.pace;
        const d = Math.max(0.01, dist(g.x, g.z, tx, tz));
        g.x += ((tx - g.x) / d) * Math.min(d, speed * dt);
        g.z += ((tz - g.z) / d) * Math.min(d, speed * dt);
        if (this.holder === "me" && range < 2.4 && g.cd <= 0) {
          // Wind up a poke-check at where the puck is right now.
          g.state = "poke";
          g.t = 0;
          g.markX = this.puck.x - this.me.x;
          g.markZ = this.puck.z - this.me.z;
          this.sfx.push("warn");
        }
      } else if (g.state === "poke") {
        if (g.t >= 0.75 * this.pace) {
          g.cd = 2.2 * this.pace;
          const still = dist(this.lx, this.lz, g.markX, g.markZ) < 0.6;
          if (this.holder === "me" && still && dist(g.x, g.z, this.me.x, this.me.z) < 4) {
            this.turnover(g);
          } else {
            this.dekes += 1;
            this.beat(g);
            if (this.holder === "me") this.say("Deked!", "", 0.9);
            this.sfx.push("dodge");
          }
        }
      }
    }
  }

  private turnover(by: Goblin): void {
    this.holder = "goblin";
    this.flight = null;
    this.puck.x = by.x;
    this.puck.z = by.z + 0.6;
    this.phase = "battle";
    this.phaseT = 0;
    this.battleLeft = 8;
    this.battleTime = 5.5 * this.pace;
    for (const g of this.goblins) g.state = "skate";
    this.say("Stripped!", "8 quick dribbles to win it back", 1.6);
    this.sfx.push("hurt");
  }

  /** A puck battle on the boards: quick hands win it back, or the goblins break away. */
  private updateBattle(dt: number, gestures: GestureDetector): void {
    this.battleTime -= dt;
    for (const e of gestures.events) {
      if (e.type === "touch") {
        this.battleLeft -= 1;
        this.sfx.push("tick");
      }
    }
    if (this.battleLeft <= 0) {
      this.phase = "play";
      this.holder = "me";
      this.boost = 2;
      for (const g of this.goblins) {
        if (dist(g.x, g.z, this.me.x, this.me.z) < 4) this.beat(g);
        g.cd = 2;
      }
      this.say("Won it back!", "", 1.1);
      this.sfx.push("revive");
    } else if (this.battleTime <= 0) {
      // They are away. Your goalie stops most of these.
      if (this.rng() < 0.4) {
        this.score[1] += 1;
        this.say("Goblins score", `${this.score[0]} – ${this.score[1]}`, 2.6);
        this.sfx.push("down");
      } else {
        this.say("Breakaway… saved!", "Your goalie bails you out", 2.6);
        this.sfx.push("dodge");
      }
      this.phase = "conceded";
      this.phaseT = 0;
    }
  }

  private demoShot: { x: number; y: number } | null = null;

  /** What a scripted demo player should do with the puck on the floor (feet). */
  demoAim(puck: PuckSample, passing: boolean, time: number): { x: number; y: number; speed: number } {
    const { w, d } = this.arena;
    const toFloor = (lx: number, lz: number): { x: number; y: number } => ({ x: (lx / REACH_X / 2 + 0.5) * w, y: (lz / REACH_Z / 2 + 0.55) * d });
    if (this.phase === "battle") {
      const p = toFloor(Math.floor(time / 0.2) % 2 === 0 ? -0.45 : 0.45, -0.2);
      return { ...p, speed: 6 };
    }
    const far = this.arena.rebounders.find((r) => this.side(r.id) === "far");
    const sideReb = this.arena.rebounders.find((r) => this.side(r.id) !== "far");
    const fire = (reb: Rebounder): { x: number; y: number; speed: number } => {
      this.demoShot = { x: (reb.ax + reb.bx) / 2, y: (reb.ay + reb.by) / 2 };
      return { ...this.demoShot, speed: 16 };
    };
    // Once a pass or shot is on its way, follow through to the rebounder, then come back for the catch.
    if (this.demoShot) {
      if (dist(puck.x, puck.y, this.demoShot.x, this.demoShot.y) > 0.15 && this.holder === "me") return { ...this.demoShot, speed: 16 };
      this.demoShot = null;
    }
    if (passing || this.holder !== "me") return { ...toFloor(0, -0.1), speed: 9 };
    const poke = this.goblins.find((g) => g.state === "poke");
    if (poke) {
      const p = toFloor(poke.markX > 0 ? -1.1 : 1.1, -0.5);
      return { ...p, speed: 10 };
    }
    if (this.inZone && far && this.me.z < -RINK.blueLine - 6) {
      // Shoot for the end of the rebounder on the side the goalie has left open.
      const lo = Math.min(far.ax, far.bx);
      const hi = Math.max(far.ax, far.bx);
      const end = this.goalie.x > 0 ? lo + (hi - lo) * 0.12 : hi - (hi - lo) * 0.12;
      this.demoShot = { x: end, y: (far.ay + far.by) / 2 };
      return { ...this.demoShot, speed: 16 };
    }
    const close = this.goblins.find((g) => g.state === "skate" && g.z < this.me.z && dist(g.x, g.z, this.me.x, this.me.z) < 6);
    if (close && sideReb && this.wings.some((m) => m.open) && Math.floor(time / 7) % 2 === 0 && puck.speed < 3) return fire(sideReb);
    const dodge = close ? (close.x > this.me.x ? -0.9 : 0.9) : clamp(-this.me.x / 6, -0.6, 0.6);
    return { ...toFloor(dodge, -0.75), speed: 6 };
  }
}
