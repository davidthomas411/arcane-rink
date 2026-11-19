/**
 * Rules for the fantasy hockey match: a small board game in the spirit of
 * tabletop fantasy football, played on a rink grid.
 *
 * Nothing here knows about cameras, pucks or drawing. Every risky action asks a
 * `Roller` for a number from 1 to 6. In the real game that number is earned by
 * the player doing a stickhandling or passing drill; in tests it is a dice roll.
 */
export const COLS = 11;
export const ROWS = 7;
/** Activations a team gets each turn. */
export const ACTIONS_PER_TURN = 3;
/** How close to the attacking end a skater must be to shoot (columns). */
export const SHOT_RANGE = 3;

export type Team = 0 | 1;
export type Role = "sniper" | "playmaker" | "enforcer" | "defender";

export type Skater = {
  id: number;
  team: Team;
  role: Role;
  name: string;
  x: number;
  y: number;
  /** Squares it can skate per activation. */
  ma: number;
  /** Strength for body checks. */
  st: number;
  /** Target numbers (roll this or higher): lower is better. */
  ag: number;
  pa: number;
  sh: number;
  /** Knocked flat: no zone of control, cannot act. */
  down: boolean;
  /** Just got back up this turn and cannot act yet. */
  groggy: boolean;
  moved: boolean;
  /** Activation finished for this turn. */
  done: boolean;
  /** Activation started (counts against the turn's actions). */
  active: boolean;
};

export type CheckKind = "deke" | "pass" | "shot" | "hit" | "faceoff";

export type CheckSpec = {
  kind: CheckKind;
  team: Team;
  skater: Skater | null;
  /** Roll needed, 2..6. A 1 always fails and a 6 always succeeds. */
  target: number;
  label: string;
  detail: string;
  /** True when failing hands the puck to the other side. */
  turnoverOnFail: boolean;
  /** The opposing skater involved, if any. */
  versus?: Skater;
};

export type Roller = (spec: CheckSpec) => Promise<number>;

export type Cell = { x: number; y: number };

export type MatchEvent =
  | { type: "turn"; team: Team; period: number; turn: number }
  | { type: "move"; id: number; path: Cell[] }
  | { type: "roll"; spec: CheckSpec; roll: number; success: boolean }
  | { type: "knockdown"; id: number }
  | { type: "pass"; from: number; to: Cell; caught: boolean }
  | { type: "shot"; id: number; goal: boolean }
  | { type: "goal"; team: Team }
  | { type: "turnover"; team: Team; reason: string }
  | { type: "faceoff"; winner: Team }
  | { type: "period"; period: number }
  | { type: "over" }
  | { type: "sync" };

export type MoveOption = { x: number; y: number; path: Cell[]; deke: boolean; target: number };

export type Options = {
  moves: MoveOption[];
  passes: { to: Skater; target: number }[];
  hits: { on: Skater; target: number }[];
  shot: { target: number } | null;
};

export type Action =
  | { type: "move"; id: number; x: number; y: number }
  | { type: "pass"; id: number; to: number }
  | { type: "hit"; id: number; on: number }
  | { type: "shoot"; id: number }
  | { type: "rest"; id: number }
  | { type: "endTurn" };

type RoleSpec = { ma: number; st: number; ag: number; pa: number; sh: number };

/** Shooting numbers already include the goalie: even a sniper needs a good roll. */
export const ROLE_SPECS: Record<Role, RoleSpec> = {
  sniper: { ma: 4, st: 2, ag: 3, pa: 4, sh: 4 },
  playmaker: { ma: 4, st: 2, ag: 2, pa: 2, sh: 5 },
  enforcer: { ma: 3, st: 4, ag: 4, pa: 5, sh: 6 },
  defender: { ma: 3, st: 3, ag: 3, pa: 3, sh: 6 }
};

export const ROLE_LABEL: Record<Role, string> = { sniper: "Sniper", playmaker: "Playmaker", enforcer: "Enforcer", defender: "Defender" };

const ROLE_ORDER: readonly Role[] = ["playmaker", "sniper", "enforcer", "defender"];
/** Faceoff formation for the team attacking right; mirrored for the other. */
const FORMATION: Record<Role, Cell> = {
  playmaker: { x: 4, y: 3 },
  sniper: { x: 3, y: 1 },
  enforcer: { x: 3, y: 5 },
  defender: { x: 1, y: 3 }
};

function clampTarget(n: number): number {
  return Math.max(2, Math.min(6, Math.round(n)));
}

export function cheb(a: Cell, b: Cell): number {
  return Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
}

export type MatchConfig = { turnsPerPeriod: number; periods: number; names: [string[], string[]] };

export class Match {
  readonly skaters: Skater[] = [];
  /** Who has the puck, or where it lies loose. */
  puck: { carrier: number | null; x: number; y: number } = { carrier: null, x: 5, y: 3 };
  readonly score: [number, number] = [0, 0];
  period = 1;
  turn = 0;
  team: Team = 0;
  actionsLeft = 0;
  over = false;
  /** How many turns each side has taken this period. */
  private readonly taken: [number, number] = [0, 0];
  onEvent: (event: MatchEvent) => Promise<void> = async () => undefined;

  constructor(readonly config: MatchConfig, private readonly rng: () => number) {
    let id = 1;
    for (const team of [0, 1] as const) {
      ROLE_ORDER.forEach((role, i) => {
        const spec = ROLE_SPECS[role];
        this.skaters.push({ id: id++, team, role, name: config.names[team][i] ?? ROLE_LABEL[role], x: 0, y: 0, ...spec, down: false, groggy: false, moved: false, done: false, active: false });
      });
    }
    this.lineUp();
  }

  skater(id: number): Skater {
    const s = this.skaters.find((p) => p.id === id);
    if (!s) throw new Error(`No skater ${id}`);
    return s;
  }

  at(x: number, y: number): Skater | null {
    return this.skaters.find((p) => p.x === x && p.y === y) ?? null;
  }

  get carrier(): Skater | null {
    return this.puck.carrier === null ? null : this.skater(this.puck.carrier);
  }

  /** Column of the goal line a team attacks. */
  goalX(team: Team): number {
    return team === 0 ? COLS - 1 : 0;
  }

  private lineUp(): void {
    for (const s of this.skaters) {
      const cell = FORMATION[s.role];
      s.x = s.team === 0 ? cell.x : COLS - 1 - cell.x;
      s.y = cell.y;
      s.down = false;
      s.groggy = false;
    }
    this.puck = { carrier: null, x: Math.floor(COLS / 2), y: Math.floor(ROWS / 2) };
  }

  /** Standing opponents next to a square: each one makes leaving it risky. */
  zones(team: Team, x: number, y: number, ignoreId = -1): number {
    let count = 0;
    for (const p of this.skaters) {
      if (p.team !== team && !p.down && p.id !== ignoreId && cheb(p, { x, y }) === 1) count += 1;
    }
    return count;
  }

  canActivate(s: Skater): boolean {
    if (this.over || s.team !== this.team || s.down || s.groggy || s.done) return false;
    return s.active || this.actionsLeft > 0;
  }

  /** Everything a skater could do right now. */
  options(id: number): Options {
    const s = this.skater(id);
    const out: Options = { moves: [], passes: [], hits: [], shot: null };
    if (!this.canActivate(s)) return out;
    const hasPuck = this.puck.carrier === s.id;

    if (!s.moved) {
      const needsDeke = this.zones(s.team, s.x, s.y) > 0;
      const seen = new Map<number, Cell[]>();
      seen.set(s.y * COLS + s.x, []);
      let frontier: Cell[] = [{ x: s.x, y: s.y }];
      for (let step = 0; step < s.ma; step += 1) {
        const next: Cell[] = [];
        for (const cell of frontier) {
          const path = seen.get(cell.y * COLS + cell.x)!;
          for (let dy = -1; dy <= 1; dy += 1) {
            for (let dx = -1; dx <= 1; dx += 1) {
              const x = cell.x + dx;
              const y = cell.y + dy;
              if ((dx === 0 && dy === 0) || x < 0 || y < 0 || x >= COLS || y >= ROWS) continue;
              const key = y * COLS + x;
              if (seen.has(key) || this.at(x, y)) continue;
              seen.set(key, [...path, { x, y }]);
              next.push({ x, y });
            }
          }
        }
        frontier = next;
      }
      for (const [key, path] of seen) {
        if (path.length === 0) continue;
        const x = key % COLS;
        const y = Math.floor(key / COLS);
        out.moves.push({ x, y, path, deke: needsDeke, target: clampTarget(s.ag + (this.zones(s.team, x, y) > 0 ? 1 : 0)) });
      }
    }

    for (const o of this.skaters) {
      if (o.team === s.team || o.down || cheb(o, s) !== 1) continue;
      const assists = this.skaters.filter((p) => p.team === s.team && p.id !== s.id && !p.down && cheb(p, o) === 1).length;
      out.hits.push({ on: o, target: clampTarget(4 + (o.st - s.st) - assists) });
    }

    if (hasPuck) {
      for (const mate of this.skaters) {
        if (mate.team !== s.team || mate.id === s.id || mate.down) continue;
        const range = cheb(mate, s);
        if (range > 6) continue;
        out.passes.push({ to: mate, target: clampTarget(s.pa + (range > 3 ? 1 : 0) + (this.zones(s.team, mate.x, mate.y) > 0 ? 1 : 0)) });
      }
      const range = Math.abs(this.goalX(s.team) - s.x);
      if (range < SHOT_RANGE) {
        const offCentre = Math.abs(s.y - Math.floor(ROWS / 2)) > 1 ? 1 : 0;
        out.shot = { target: clampTarget(s.sh + (range > 1 ? 1 : 0) + offCentre + (this.zones(s.team, s.x, s.y) > 0 ? 1 : 0)) };
      }
    }
    return out;
  }

  // ----------------------------------------------------------------- flow

  /** Drop the puck: a faceoff decides who goes first. */
  async start(roller: Roller): Promise<void> {
    await this.onEvent({ type: "period", period: this.period });
    await this.faceoff(roller);
  }

  private async faceoff(roller: Roller): Promise<void> {
    this.lineUp();
    await this.onEvent({ type: "sync" });
    const centres = [0, 1].map((team) => this.skaters.find((p) => p.team === team && p.role === "playmaker")!) as [Skater, Skater];
    // Each side rolls; the higher roll wins the draw. Ties go again.
    let winner: Team | null = null;
    for (let tries = 0; tries < 3 && winner === null; tries += 1) {
      const rolls: number[] = [];
      for (const team of [0, 1] as const) {
        const spec: CheckSpec = { kind: "faceoff", team, skater: centres[team], target: 4, label: "Faceoff", detail: "Win the draw: higher roll takes the puck", turnoverOnFail: false, versus: centres[team === 0 ? 1 : 0] };
        rolls.push(await roller(spec));
      }
      if (rolls[0] !== rolls[1]) winner = rolls[0]! > rolls[1]! ? 0 : 1;
    }
    if (winner === null) winner = this.rng() < 0.5 ? 0 : 1;
    this.puck.carrier = centres[winner].id;
    await this.onEvent({ type: "faceoff", winner });
    await this.beginTurn(winner);
  }

  private async beginTurn(team: Team): Promise<void> {
    this.team = team;
    this.taken[team] += 1;
    this.turn = this.taken[team];
    this.actionsLeft = ACTIONS_PER_TURN;
    for (const s of this.skaters) {
      s.moved = false;
      s.done = false;
      s.active = false;
      if (s.team === team) {
        // Anyone flattened last turn gets up now but sits this turn out.
        s.groggy = s.down;
        s.down = false;
      }
    }
    await this.onEvent({ type: "turn", team, period: this.period, turn: this.turn });
  }

  private async endTurn(roller: Roller): Promise<void> {
    const other: Team = this.team === 0 ? 1 : 0;
    const limit = this.config.turnsPerPeriod;
    if (this.taken[0] >= limit && this.taken[1] >= limit) {
      if (this.period >= this.config.periods) {
        this.over = true;
        await this.onEvent({ type: "over" });
        return;
      }
      this.period += 1;
      this.taken[0] = 0;
      this.taken[1] = 0;
      await this.onEvent({ type: "period", period: this.period });
      await this.faceoff(roller);
      return;
    }
    await this.beginTurn(this.taken[other] < limit ? other : this.team);
  }

  private async check(spec: CheckSpec, roller: Roller): Promise<{ roll: number; success: boolean }> {
    const roll = Math.max(1, Math.min(6, Math.round(await roller(spec))));
    const success = roll !== 1 && (roll === 6 || roll >= spec.target);
    await this.onEvent({ type: "roll", spec, roll, success });
    return { roll, success };
  }

  private begin(s: Skater): void {
    if (!s.active) {
      s.active = true;
      this.actionsLeft -= 1;
    }
  }

  private finish(s: Skater): void {
    s.done = true;
  }

  private async loosePuck(near: Cell): Promise<void> {
    // The puck skitters to a free neighbouring square.
    const spots: Cell[] = [];
    for (let dy = -1; dy <= 1; dy += 1) {
      for (let dx = -1; dx <= 1; dx += 1) {
        const x = near.x + dx;
        const y = near.y + dy;
        if (x < 0 || y < 0 || x >= COLS || y >= ROWS || this.at(x, y)) continue;
        spots.push({ x, y });
      }
    }
    const spot = spots.length > 0 ? spots[Math.floor(this.rng() * spots.length)]! : near;
    this.puck = { carrier: null, x: spot.x, y: spot.y };
    await this.onEvent({ type: "sync" });
  }

  private async knockDown(s: Skater): Promise<void> {
    s.down = true;
    await this.onEvent({ type: "knockdown", id: s.id });
    if (this.puck.carrier === s.id) await this.loosePuck(s);
  }

  private async turnover(reason: string, roller: Roller): Promise<void> {
    await this.onEvent({ type: "turnover", team: this.team, reason });
    await this.endTurn(roller);
  }

  /** Carry out one action for the side whose turn it is. */
  async act(action: Action, roller: Roller): Promise<void> {
    if (this.over) return;
    if (action.type === "endTurn") {
      await this.endTurn(roller);
      return;
    }
    const s = this.skater(action.id);
    if (!this.canActivate(s)) return;
    const opts = this.options(s.id);

    if (action.type === "rest") {
      this.begin(s);
      this.finish(s);
    } else if (action.type === "move") {
      const move = opts.moves.find((m) => m.x === action.x && m.y === action.y);
      if (!move) return;
      this.begin(s);
      s.moved = true;
      if (move.deke) {
        const { success } = await this.check(
          { kind: "deke", team: s.team, skater: s, target: move.target, label: "Deke", detail: `${s.name} tries to slip away from a defender`, turnoverOnFail: true },
          roller
        );
        if (!success) {
          this.finish(s);
          await this.knockDown(s);
          await this.turnover(`${s.name} was stood up`, roller);
          return;
        }
      }
      s.x = move.x;
      s.y = move.y;
      if (this.puck.carrier === null && this.puck.x === s.x && this.puck.y === s.y) this.puck.carrier = s.id;
      await this.onEvent({ type: "move", id: s.id, path: move.path });
      // Nothing left to do after skating? Then the activation is over.
      const after = this.options(s.id);
      if (after.passes.length === 0 && after.hits.length === 0 && !after.shot) this.finish(s);
    } else if (action.type === "hit") {
      const hit = opts.hits.find((h) => h.on.id === action.on);
      if (!hit) return;
      this.begin(s);
      this.finish(s);
      const { roll, success } = await this.check(
        { kind: "hit", team: s.team, skater: s, target: hit.target, label: "Body check", detail: `${s.name} lines up ${hit.on.name}`, turnoverOnFail: false, versus: hit.on },
        roller
      );
      if (success) {
        await this.knockDown(hit.on);
      } else if (roll === 1) {
        await this.knockDown(s);
        await this.turnover(`${s.name} bounced off`, roller);
        return;
      }
    } else if (action.type === "pass") {
      const pass = opts.passes.find((p) => p.to.id === action.to);
      if (!pass) return;
      this.begin(s);
      this.finish(s);
      const { roll, success } = await this.check(
        { kind: "pass", team: s.team, skater: s, target: pass.target, label: "Pass", detail: `${s.name} feeds ${pass.to.name}`, turnoverOnFail: true, versus: pass.to },
        roller
      );
      await this.onEvent({ type: "pass", from: s.id, to: { x: pass.to.x, y: pass.to.y }, caught: success });
      if (success) {
        this.puck.carrier = pass.to.id;
        await this.onEvent({ type: "sync" });
      } else {
        // A terrible pass is picked off; a poor one just gets away.
        const thief = roll === 1 ? this.skaters.filter((p) => p.team !== s.team && !p.down && cheb(p, pass.to) <= 3).sort((a, b) => cheb(a, pass.to) - cheb(b, pass.to))[0] : undefined;
        if (thief) {
          this.puck.carrier = thief.id;
          await this.onEvent({ type: "sync" });
        } else {
          await this.loosePuck(pass.to);
        }
        await this.turnover(thief ? `Picked off by ${thief.name}` : "The pass got away", roller);
        return;
      }
    } else if (action.type === "shoot") {
      if (!opts.shot) return;
      this.begin(s);
      this.finish(s);
      const { success } = await this.check(
        { kind: "shot", team: s.team, skater: s, target: opts.shot.target, label: "Shot", detail: `${s.name} shoots!`, turnoverOnFail: true },
        roller
      );
      await this.onEvent({ type: "shot", id: s.id, goal: success });
      if (success) {
        this.score[s.team] += 1;
        await this.onEvent({ type: "goal", team: s.team });
        // Reset, and the side that was scored on gets the puck to start its turn.
        const other: Team = s.team === 0 ? 1 : 0;
        this.lineUp();
        this.puck.carrier = this.skaters.find((p) => p.team === other && p.role === "playmaker")!.id;
        await this.onEvent({ type: "sync" });
        await this.endTurn(roller);
        return;
      }
      // Saved: the goalie steers it to the nearest defender.
      const other: Team = s.team === 0 ? 1 : 0;
      const gx = this.goalX(s.team);
      const taker = this.skaters.filter((p) => p.team === other && !p.down).sort((a, b) => Math.abs(a.x - gx) - Math.abs(b.x - gx))[0];
      if (taker) {
        this.puck.carrier = taker.id;
        await this.onEvent({ type: "sync" });
      } else {
        await this.loosePuck({ x: gx + (s.team === 0 ? -1 : 1), y: Math.floor(ROWS / 2) });
      }
      await this.turnover("Saved!", roller);
      return;
    }

    await this.onEvent({ type: "sync" });
    const anyoneLeft = this.skaters.some((p) => this.canActivate(p));
    if (!anyoneLeft) await this.endTurn(roller);
  }
}
