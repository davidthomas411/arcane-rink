import { playCue, startMusic, stopMusic } from "../realm/audio";
import { CLASSES, TIERS } from "../realm/game/classes";
import type { Hero } from "../realm/game/save";
import type { Calibration } from "../realm/input/calibration";
import { GestureDetector, type PracticeStats } from "../realm/input/Gestures";
import { emptySample, type PuckSample, type PuckSource } from "../realm/input/PuckSource";
import { ArenaRenderer } from "../realm/render/ArenaRenderer";
import { clamp, escapeHtml, makeRng } from "../realm/util";
import { chooseAction } from "./ai";
import { AvatarView } from "./body/AvatarView";
import type { BodyTracker } from "./body/BodyTracker";
import { Board3D, type Highlight } from "./Board3D";
import { makeDrill, type Drill } from "./drills";
import { ACTIONS_PER_TURN, COLS, Match, ROWS, type Action, type CheckSpec, type MatchEvent, type Team } from "./rules";

export type MatchResult = {
  score: [number, number];
  completed: boolean;
  heroes: { hero: Hero; practice: PracticeStats; checks: number; made: number }[];
  /** Share of drill time spent with the head up, if the body tracker was on. */
  headsUp: number | null;
  seconds: number;
};

const asset = (name: string): string => new URL(`../realm/assets/${name}`, import.meta.url).href;
const HERO_FACES: Record<string, string> = { a: "hero-a.png", k: "hero-k.png" };
const DWELL_SECONDS = 0.75;
const AWAY_NAMES = ["Skrix", "Grukk", "Mauler", "Bonewall"];
const HOME_SPARES = ["Flash", "Ace", "Tank", "Wall"];

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * A puck source the screen can steer itself: used for the watch-it-play demo,
 * where a scripted coach picks squares and performs the drills.
 */
export class GuidedPuck implements PuckSource {
  readonly label = "Demo player";
  readonly sample: PuckSample;
  goal = { x: 0, y: 0, speed: 0 };

  constructor(w: number, d: number) {
    this.sample = { ...emptySample(w / 2, d * 0.6), visible: true, conf: 1 };
    this.goal = { x: w / 2, y: d * 0.6, speed: 0 };
  }

  update(dt: number): void {
    const s = this.sample;
    const dx = this.goal.x - s.x;
    const dy = this.goal.y - s.y;
    const d = Math.hypot(dx, dy);
    const step = Math.min(d, this.goal.speed * dt);
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

/** One fantasy hockey match: the 3D board, the turn flow, and the drills that stand in for dice. */
export class MatchScreen {
  private readonly el: HTMLDivElement;
  private readonly board: Board3D;
  private readonly floor: ArenaRenderer;
  private readonly avatar: AvatarView | null;
  private readonly match: Match;
  private readonly source: PuckSource;
  private readonly guided: GuidedPuck | null;
  private readonly gestures: GestureDetector[];
  private readonly rng = makeRng((Date.now() ^ 0x2545f491) >>> 0);
  private readonly refs: Record<string, HTMLElement> = {};
  private readonly tallies: { checks: number; made: number }[];

  private selected = -1;
  private busy = true;
  private drill: Drill | null = null;
  private drillIntro = 0;
  private drillResolve: ((face: number) => void) | null = null;
  private drillSpec: CheckSpec | null = null;
  private drillUpTime = 0;
  private upTotal = 0;
  private upSeconds = 0;
  private cursorCell: { x: number; y: number } | null = null;
  private dwell = 0;
  private dwellKey = "";
  private banner = { text: "", sub: "", until: 0 };
  private log: string[] = [];
  private coachIndex = 0;
  private raf = 0;
  private lastMs = 0;
  private seconds = 0;
  private ended = false;
  private demoPlan: { x: number; y: number }[] = [];
  private demoStall = 0;

  private readonly onKey = (event: KeyboardEvent): void => {
    if (event.key === "Escape") this.finish(false);
    else if (event.key.toLowerCase() === "e" && !this.busy && this.match.team === 0) void this.run({ type: "endTurn" });
  };
  private readonly onResize = (): void => this.layout();
  private readonly onClick = (event: MouseEvent): void => {
    if (this.busy || this.drill || this.match.team !== 0) return;
    const hit = this.board.pick(event.clientX, event.clientY);
    if (hit) void this.choose(Math.floor(hit.x), Math.floor(hit.y));
  };

  constructor(
    root: HTMLElement,
    private readonly opts: {
      heroes: Hero[];
      cal: Calibration;
      demo: boolean;
      /** Turns each side gets per period: 3 is a quick match, 5 a full one. */
      turns: number;
      body: BodyTracker | null;
      makeSource: (toArena: (cx: number, cy: number) => { x: number; y: number }) => PuckSource;
      onEnd: (result: MatchResult) => void;
    }
  ) {
    const { heroes, cal } = opts;
    this.el = document.createElement("div");
    this.el.className = "match";
    this.el.innerHTML = `
      <canvas class="match-board"></canvas>
      <div class="match-top">
        <div class="score-plate">
          <div class="team team-home"><small>HOME</small><b data-ref="homeName"></b></div>
          <div class="score" data-ref="homeScore">0</div>
          <div class="clock"><small data-ref="period"></small><b data-ref="turn"></b><span class="pips" data-ref="pips"></span></div>
          <div class="score" data-ref="awayScore">0</div>
          <div class="team team-away"><small>AWAY</small><b>Cryptfang Goblins</b></div>
        </div>
      </div>
      <div class="match-prompt"><div data-ref="prompt"></div><small data-ref="promptSub"></small></div>
      <div class="match-banner" data-ref="banner" hidden><div data-ref="bannerText"></div><small data-ref="bannerSub"></small></div>
      <div class="drill" data-ref="drill" hidden>
        <canvas class="drill-floor"></canvas>
        <aside class="drill-side">
          <div class="drill-title" data-ref="drillTitle"></div>
          <div class="drill-detail" data-ref="drillDetail"></div>
          <div class="die" data-ref="die">1</div>
          <div class="drill-need" data-ref="drillNeed"></div>
          <div class="bar bar-cast"><i data-ref="drillTime"></i></div>
          <div class="drill-how" data-ref="drillHow"></div>
          <div class="drill-eyes" data-ref="drillEyes"></div>
        </aside>
      </div>
      <div class="avatar-panel" data-ref="avatarPanel" hidden><canvas class="avatar-canvas"></canvas><small data-ref="avatarNote"></small></div>
      <div class="match-bottom">
        <div class="frame hero-frame"><div class="portrait" data-ref="coachPortrait"></div>
          <div class="frame-body"><div class="frame-name"><span data-ref="coachName"></span><small data-ref="coachSub"></small></div>
          <div class="frame-note" data-ref="coachNote"></div></div></div>
        <div class="match-log" data-ref="log"></div>
        <div class="legend">
          <span class="lg lg-move">Skate</span><span class="lg lg-deke">Skate past a defender (roll)</span>
          <span class="lg lg-pass">Pass</span><span class="lg lg-hit">Body check</span><span class="lg lg-shoot">Shoot</span>
        </div>
        <div class="play-side"><div class="tracker-chip" data-ref="tracker"></div>
          <button class="btn btn-small" data-ref="quit" type="button">Leave (Esc)</button></div>
      </div>`;
    root.replaceChildren(this.el);
    this.el.querySelectorAll<HTMLElement>("[data-ref]").forEach((node) => {
      this.refs[node.dataset.ref!] = node;
    });
    this.refs.quit!.addEventListener("click", () => this.finish(false));

    this.board = new Board3D(this.el.querySelector<HTMLCanvasElement>(".match-board")!);
    this.floor = new ArenaRenderer(this.el.querySelector<HTMLCanvasElement>(".drill-floor")!, cal.arenaW, cal.arenaD);

    const homeNames = HOME_SPARES.map((spare, i) => heroes[i]?.name ?? spare);
    this.match = new Match({ turnsPerPeriod: opts.turns, periods: 2, names: [homeNames, AWAY_NAMES] }, this.rng);
    this.match.onEvent = (event) => this.onMatchEvent(event);
    this.board.setMatch(this.match, heroes.map((h) => HERO_FACES[h.portrait] ?? null));
    this.refs.homeName!.textContent = heroes.length === 1 ? `${heroes[0]!.name}'s Puckbound` : "The Puckbound";

    this.gestures = heroes.map((h) => new GestureDetector(cal.rebounders, { passMinSpeed: TIERS[h.tier].passMinSpeed }));
    this.tallies = heroes.map(() => ({ checks: 0, made: 0 }));

    this.guided = opts.demo ? new GuidedPuck(cal.arenaW, cal.arenaD) : null;
    this.source =
      this.guided ??
      opts.makeSource((cx, cy) => {
        // The mouse stands in for the puck: over the board it points at squares, in a drill at the floor map.
        if (this.drill) return this.floor.toArena(cx, cy);
        const hit = this.board.pick(cx, cy);
        if (!hit) return { x: cal.arenaW / 2, y: cal.arenaD / 2 };
        return { x: ((hit.x + 1) / (COLS + 2)) * cal.arenaW, y: (hit.y / ROWS) * cal.arenaD };
      });

    const body = opts.body && opts.body.active ? opts.body : null;
    this.avatar = body ? new AvatarView(this.el.querySelector<HTMLCanvasElement>(".avatar-canvas")!, body, CLASSES[heroes[0]!.classId].color) : null;
    this.refs.avatarPanel!.hidden = !this.avatar;

    this.el.querySelector(".match-board")!.addEventListener("click", this.onClick as EventListener);
    window.addEventListener("keydown", this.onKey);
    window.addEventListener("resize", this.onResize);
    this.layout();
    startMusic();
    this.raf = requestAnimationFrame(this.frame);
    if (import.meta.env.DEV) (window as unknown as { __match?: MatchScreen }).__match = this;
    void this.match.start((spec) => this.roll(spec)).then(() => {
      this.busy = false;
      this.afterAction();
    });
  }

  private get coach(): Hero {
    return this.opts.heroes[this.coachIndex % this.opts.heroes.length]!;
  }

  private layout(): void {
    this.board.resize();
    this.floor.layout({ top: 24, bottom: 24, left: 24, right: 24 });
    this.avatar?.resize();
  }

  private say(text: string, sub = "", ms = 1500): void {
    this.banner = { text, sub, until: performance.now() + ms };
  }

  private note(text: string): void {
    this.log.unshift(text);
    this.log.length = Math.min(this.log.length, 4);
  }

  // ---------------------------------------------------------- rules events

  private async onMatchEvent(event: MatchEvent): Promise<void> {
    switch (event.type) {
      case "sync":
        this.board.sync();
        break;
      case "period":
        this.say(event.period === 1 ? "Puck drop!" : `Period ${event.period}`, "Faceoff at centre ice", 1600);
        await sleep(900);
        break;
      case "faceoff":
        this.board.sync();
        this.say(event.winner === 0 ? "You won the draw!" : "Goblins win the draw", "", 1300);
        this.note(event.winner === 0 ? "Faceoff won" : "Faceoff lost");
        await sleep(1000);
        break;
      case "turn":
        this.selected = -1;
        this.board.sync();
        if (event.team === 0) {
          this.coachIndex = event.turn - 1 + (event.period - 1) * this.match.config.turnsPerPeriod;
          const tag = this.opts.heroes.length > 1 ? `TAG IN: ${this.coach.name}!` : "Your turn";
          this.say(tag, `${ACTIONS_PER_TURN} skaters may act`, 1500);
          this.avatar?.setColor(CLASSES[this.coach.classId].color);
          playCue("ready");
        } else {
          this.say("Goblins' turn", "", 1100);
        }
        await sleep(900);
        break;
      case "move":
        await this.board.playMove(event.id, event.path);
        break;
      case "roll": {
        const who = event.spec.team === 0 ? "You" : "Goblins";
        const text = `${event.spec.label}: ${who} rolled ${event.roll}, needed ${event.spec.target}+`;
        this.note(`${event.success ? "✔" : "✘"} ${text}`);
        if (event.spec.kind !== "faceoff") {
          this.say(event.success ? `${event.spec.label} — made it!` : `${event.spec.label} — failed`, `Rolled ${event.roll}, needed ${event.spec.target}+`, 1300);
          playCue(event.success ? "perfect" : "hurt");
          await sleep(1100);
        }
        break;
      }
      case "knockdown":
        playCue("boom");
        await this.board.playKnockdown(event.id);
        this.note(`${this.match.skater(event.id).name} is flattened`);
        break;
      case "pass":
        playCue("pass");
        await this.board.playPass(event.to);
        break;
      case "shot":
        playCue("cleave");
        await this.board.playShot(this.match.skater(event.id).team, event.goal);
        break;
      case "goal":
        this.say(event.team === 0 ? "GOAL!!!" : "Goblins score", `${this.match.score[0]} – ${this.match.score[1]}`, 2400);
        this.note(event.team === 0 ? "GOAL for the Puckbound!" : "Goal against");
        playCue(event.team === 0 ? "victory" : "down");
        await sleep(2200);
        break;
      case "turnover":
        this.say("TURNOVER", event.reason, 1500);
        this.note(`Turnover: ${event.reason}`);
        playCue("warn");
        await sleep(1300);
        break;
      case "over":
        break;
    }
  }

  // ------------------------------------------------------------- dice rolls

  /** The rules ask for a number: the home side earns it with a drill, the goblins roll a die. */
  private async roll(spec: CheckSpec): Promise<number> {
    const idx = this.coachIndex % this.opts.heroes.length;
    if (spec.team === 0) {
      const face = await this.runDrill(spec, spec.label.toUpperCase(), spec.detail);
      this.tallies[idx]!.checks += 1;
      if (face >= spec.target || face === 6) this.tallies[idx]!.made += 1;
      return face;
    }
    let roll = 1 + Math.floor(this.rng() * 6);
    if (spec.kind === "shot") {
      // You get to play goalie: a quick reaction drill takes one off their shot.
      const save: CheckSpec = { ...spec, kind: "faceoff", team: 0, target: 4, label: "Save", detail: "Goblin shot! React to stop it" };
      const face = await this.runDrill(save, "SAVE!", "React to the rune to take 1 off their shot");
      this.tallies[idx]!.checks += 1;
      if (face >= 4) {
        this.tallies[idx]!.made += 1;
        roll = Math.max(1, roll - 1);
        this.note("Big save attempt: −1 to their shot");
      }
    } else {
      await this.showDie(roll, spec);
    }
    return roll;
  }

  private async showDie(roll: number, spec: CheckSpec): Promise<void> {
    if (spec.kind === "faceoff") return;
    const end = performance.now() + 650;
    while (performance.now() < end) {
      this.say(`Goblins: ${spec.label}`, `Rolling… ${1 + Math.floor(Math.random() * 6)}`, 200);
      await sleep(80);
    }
    void roll;
  }

  private runDrill(spec: CheckSpec, title: string, detail: string): Promise<number> {
    const { cal } = this.opts;
    const tier = TIERS[this.coach.tier];
    this.drill = makeDrill(spec.kind, { w: cal.arenaW, d: cal.arenaD, rebounders: cal.rebounders }, tier, this.rng);
    this.drillSpec = spec;
    this.drillIntro = 1.6;
    this.drillUpTime = 0;
    this.refs.drill!.hidden = false;
    this.refs.drillTitle!.textContent = title;
    this.refs.drillDetail!.textContent = detail;
    this.refs.drillNeed!.textContent = spec.kind === "faceoff" && title !== "SAVE!" ? "Beat the goblin's roll" : `Need ${spec.target}+`;
    this.refs.drillHow!.textContent = this.drill.instruction;
    this.floor.heroColor = CLASSES[this.coach.classId].color;
    this.layout();
    playCue("cast");
    return new Promise((resolve) => {
      this.drillResolve = resolve;
    });
  }

  private updateDrill(dt: number, puck: PuckSample, gestures: GestureDetector, time: number): void {
    const drill = this.drill!;
    const body = this.opts.body && this.opts.body.active ? this.opts.body : null;
    if (this.drillIntro > 0) {
      this.drillIntro -= dt;
      if (this.drillIntro <= 0) body?.calibrateHeadsUp();
    } else {
      drill.update(dt, puck, gestures);
      if (body && body.status === "live") {
        const up = body.headsUp > 0.5 ? dt : 0;
        this.drillUpTime += up;
        this.upSeconds += up;
        this.upTotal += dt;
      }
    }
    const eyesShare = drill.time > 0.3 ? this.drillUpTime / drill.time : 1;
    const eyesBonus = body !== null && eyesShare >= 0.7;
    this.floor.draw({
      time,
      puck,
      rebounders: this.opts.cal.rebounders,
      encounter: null,
      ready: null,
      banner: this.drillIntro > 0 ? `Get ready… ${Math.ceil(this.drillIntro)}` : null,
      overlay: (g) => drill.draw(g, time),
      charged: drill.charged
    });
    const r = this.refs;
    r.die!.textContent = `${drill.face}`;
    r.die!.dataset.face = `${drill.face}`;
    const target = this.drillSpec?.target ?? 4;
    r.die!.classList.toggle("is-made", drill.face >= target);
    r.drillTime!.style.width = `${clamp(1 - drill.time / drill.duration, 0, 1) * 100}%`;
    r.drillEyes!.textContent = body ? `Eyes up ${Math.round(eyesShare * 100)}%${eyesBonus ? " — +1 to the roll" : " — keep your head up for +1"}` : "";
    r.drillEyes!.classList.toggle("is-good", eyesBonus);

    if (drill.done) {
      const face = clamp(drill.face + (eyesBonus && drill.face > 1 ? 1 : 0), 1, 6);
      this.drill = null;
      this.refs.drill!.hidden = true;
      const resolve = this.drillResolve;
      this.drillResolve = null;
      this.layout();
      resolve?.(face);
    }
  }

  // --------------------------------------------------------------- choosing

  private highlights(): Highlight[] {
    const m = this.match;
    const out: Highlight[] = [];
    if (this.busy || m.team !== 0 || m.over) return out;
    if (this.selected < 0) {
      for (const s of m.skaters) if (s.team === 0 && m.canActivate(s)) out.push({ x: s.x, y: s.y, kind: "pick" });
      return out;
    }
    const opts = m.options(this.selected);
    for (const mv of opts.moves) out.push({ x: mv.x, y: mv.y, kind: mv.deke ? "deke" : "move" });
    for (const p of opts.passes) out.push({ x: p.to.x, y: p.to.y, kind: "pass" });
    for (const h of opts.hits) out.push({ x: h.on.x, y: h.on.y, kind: "hit" });
    if (opts.shot) out.push({ x: COLS, y: Math.floor(ROWS / 2), kind: "shoot" });
    return out;
  }

  /** What dwelling on (or clicking) a square means right now, if anything. */
  private actionAt(x: number, y: number): Action | { type: "select"; id: number } | null {
    const m = this.match;
    const occupant = x >= 0 && x < COLS ? m.at(x, y) : null;
    if (this.selected < 0) {
      return occupant && occupant.team === 0 && m.canActivate(occupant) ? { type: "select", id: occupant.id } : null;
    }
    const opts = m.options(this.selected);
    if (x >= COLS && Math.abs(y - Math.floor(ROWS / 2)) <= 1 && opts.shot) return { type: "shoot", id: this.selected };
    if (occupant) {
      if (occupant.id === this.selected) return { type: "rest", id: this.selected };
      if (opts.passes.some((p) => p.to.id === occupant.id)) return { type: "pass", id: this.selected, to: occupant.id };
      if (opts.hits.some((h) => h.on.id === occupant.id)) return { type: "hit", id: this.selected, on: occupant.id };
      if (occupant.team === 0 && m.canActivate(occupant)) return { type: "select", id: occupant.id };
      return null;
    }
    return opts.moves.some((mv) => mv.x === x && mv.y === y) ? { type: "move", id: this.selected, x, y } : null;
  }

  private async choose(x: number, y: number): Promise<void> {
    const action = this.actionAt(x, y);
    if (!action || this.busy) return;
    playCue("tick");
    if (action.type === "select") {
      // Switching skaters closes out the one who was part-way through.
      const prev = this.selected >= 0 ? this.match.skater(this.selected) : null;
      this.selected = action.id;
      this.board.setSelection(action.id);
      if (prev && prev.active && !prev.done) await this.run({ type: "rest", id: prev.id });
      return;
    }
    await this.run(action);
  }

  private async run(action: Action): Promise<void> {
    this.busy = true;
    await this.match.act(action, (spec) => this.roll(spec));
    this.busy = false;
    this.afterAction();
  }

  private afterAction(): void {
    const m = this.match;
    if (m.over) {
      this.finish(true);
      return;
    }
    if (this.selected >= 0 && (m.team !== 0 || !m.canActivate(m.skater(this.selected)))) this.selected = -1;
    this.board.setSelection(this.selected);
    this.dwell = 0;
    this.dwellKey = "";
    this.demoPlan = [];
    this.demoStall = 0;
    if (m.team === 1) void this.aiTurn();
  }

  private async aiTurn(): Promise<void> {
    this.busy = true;
    while (!this.ended && !this.match.over && this.match.team === 1) {
      await sleep(450);
      await this.match.act(chooseAction(this.match, 1), (spec) => this.roll(spec));
    }
    this.busy = false;
    this.afterAction();
  }

  /** Demo coach: turn the computer's choice into squares to point the puck at. */
  private planDemo(): void {
    if (this.demoPlan.length > 0) return;
    const m = this.match;
    const action = chooseAction(m, 0);
    const cell = (id: number): { x: number; y: number } => ({ x: m.skater(id).x, y: m.skater(id).y });
    if (action.type === "endTurn") {
      void this.run(action);
      return;
    }
    if (this.selected !== action.id) this.demoPlan.push(cell(action.id));
    if (action.type === "move") this.demoPlan.push({ x: action.x, y: action.y });
    else if (action.type === "pass") this.demoPlan.push(cell(action.to));
    else if (action.type === "hit") this.demoPlan.push(cell(action.on));
    else if (action.type === "shoot") this.demoPlan.push({ x: COLS, y: Math.floor(ROWS / 2) });
    else this.demoPlan.push(cell(action.id));
  }

  // ------------------------------------------------------------------ frame

  private readonly frame = (ms: number): void => {
    if (this.ended) return;
    const dt = this.lastMs === 0 ? 1 / 60 : clamp((ms - this.lastMs) / 1000, 1 / 240, 0.05);
    this.lastMs = ms;
    const time = ms / 1000;
    this.seconds += dt;
    const { cal } = this.opts;
    const gestures = this.gestures[this.coachIndex % this.gestures.length]!;

    if (this.guided) {
      if (this.drill) {
        this.guided.goal = this.drillIntro > 0 ? { x: cal.arenaW / 2, y: cal.arenaD * 0.6, speed: 6 } : this.drill.aim(this.guided.sample);
      } else if (!this.busy && this.match.team === 0 && !this.match.over) {
        // If the scripted coach ever points at something the board will not accept, give the turn up rather than hang.
        this.demoStall += dt;
        if (this.demoStall > 8) {
          this.demoStall = 0;
          void this.run({ type: "endTurn" });
        }
        this.planDemo();
        const next = this.demoPlan[0];
        if (next) this.guided.goal = { x: ((next.x + 1.5) / (COLS + 2)) * cal.arenaW, y: ((next.y + 0.5) / ROWS) * cal.arenaD, speed: 7 };
      }
    }
    this.source.update(dt);
    const puck = this.source.sample;
    gestures.update(dt, puck);

    if (this.drill) {
      this.updateDrill(dt, puck, gestures, time);
    } else if (!this.busy && this.match.team === 0 && puck.visible) {
      // The puck on the floor is the cursor on the rink: hold it on a square to choose it.
      const x = Math.floor((puck.x / cal.arenaW) * (COLS + 2)) - 1;
      const y = clamp(Math.floor((puck.y / cal.arenaD) * ROWS), 0, ROWS - 1);
      this.cursorCell = { x: clamp(x, -1, COLS), y };
      const key = `${x},${y}`;
      const actionable = this.actionAt(x, y) !== null;
      if (key !== this.dwellKey) {
        this.dwellKey = key;
        this.dwell = 0;
      } else if (actionable) {
        this.dwell += dt;
        if (this.dwell >= DWELL_SECONDS) {
          this.dwell = 0;
          this.dwellKey = "";
          if (this.demoPlan[0] && this.demoPlan[0].x === x && this.demoPlan[0].y === y) this.demoPlan.shift();
          void this.choose(x, y);
        }
      }
    } else {
      this.cursorCell = null;
    }

    const showCursor = !this.drill && !this.busy && this.match.team === 0 && this.cursorCell;
    this.board.setHighlights(this.highlights(), showCursor ? { ...this.cursorCell!, progress: this.dwell / DWELL_SECONDS } : null);
    this.board.render(time, dt);
    this.avatar?.render(dt);
    this.renderHud(puck);
    this.raf = requestAnimationFrame(this.frame);
  };

  private renderHud(puck: PuckSample): void {
    const m = this.match;
    const r = this.refs;
    r.homeScore!.textContent = `${m.score[0]}`;
    r.awayScore!.textContent = `${m.score[1]}`;
    r.period!.textContent = `PERIOD ${m.period} OF ${m.config.periods}`;
    r.turn!.textContent = `Turn ${Math.max(1, m.turn)} / ${m.config.turnsPerPeriod}`;
    r.pips!.innerHTML = m.team === 0 ? Array.from({ length: ACTIONS_PER_TURN }, (_, i) => `<i class="${i < m.actionsLeft ? "on" : ""}"></i>`).join("") : "";

    let prompt = "";
    let sub = "";
    if (m.team === 1) {
      prompt = "Goblins are on the move…";
      sub = "Get ready to make a save";
    } else if (this.busy) {
      prompt = "";
    } else if (this.selected < 0) {
      prompt = "Pick a skater";
      sub = "Slide the puck onto a glowing skater and hold it there";
    } else {
      const s = m.skater(this.selected);
      const opts = m.options(s.id);
      prompt = `${s.name}: choose a move`;
      sub = opts.shot ? `Push the puck into the net to SHOOT (needs ${opts.shot.target}+)` : m.carrier?.id === s.id ? "Skate up ice, or pass to a blue teammate" : "Skate, or body-check a red goblin";
    }
    r.prompt!.textContent = prompt;
    r.promptSub!.textContent = sub;

    const showBanner = performance.now() < this.banner.until && !this.drill;
    r.banner!.hidden = !showBanner;
    if (showBanner) {
      r.bannerText!.textContent = this.banner.text;
      r.bannerSub!.textContent = this.banner.sub;
    }

    const coach = this.coach;
    const cls = CLASSES[coach.classId];
    const face = HERO_FACES[coach.portrait];
    const key = `${coach.id}`;
    if (r.coachPortrait!.dataset.key !== key) {
      r.coachPortrait!.dataset.key = key;
      r.coachPortrait!.innerHTML = face ? `<img src="${asset(face)}" alt="" />` : `<span>${cls.glyph}</span>`;
      r.coachPortrait!.style.borderColor = cls.color;
    }
    r.coachName!.textContent = `${coach.name} #${coach.jersey}`;
    r.coachSub!.textContent = " on the puck";
    const t = this.tallies[this.coachIndex % this.tallies.length]!;
    r.coachNote!.textContent = t.checks > 0 ? `Skill checks made: ${t.made} of ${t.checks}` : "Your drills are the dice";
    r.log!.innerHTML = this.log.map((line) => `<div>${escapeHtml(line)}</div>`).join("");

    const body = this.opts.body;
    r.tracker!.textContent = `${this.source.label} · ${puck.visible ? "tracking" : "searching…"}${body && body.active ? ` · body ${body.status === "live" ? `${body.fps.toFixed(0)} fps` : "no player seen"}` : ""}`;
    r.tracker!.classList.toggle("is-lost", !puck.visible);
    if (this.avatar && body) {
      r.avatarPanel!.classList.toggle("is-big", this.drill !== null);
      r.avatarNote!.textContent = body.status === "live" ? `${Math.round(body.latest?.latencyMs ?? 0)} ms behind` : "Step into view of the body camera";
    }
  }

  private finish(completed: boolean): void {
    if (this.ended) return;
    this.ended = true;
    cancelAnimationFrame(this.raf);
    stopMusic();
    window.removeEventListener("keydown", this.onKey);
    window.removeEventListener("resize", this.onResize);
    this.source.destroy();
    this.board.dispose();
    this.avatar?.dispose();
    this.opts.onEnd({
      score: [this.match.score[0], this.match.score[1]],
      completed,
      heroes: this.opts.heroes.map((hero, i) => ({ hero, practice: this.gestures[i]!.stats, checks: this.tallies[i]!.checks, made: this.tallies[i]!.made })),
      headsUp: this.upTotal > 1 ? this.upSeconds / this.upTotal : null,
      seconds: this.seconds
    });
  }

  /** Which side is to act (exposed for tests). */
  get activeTeam(): Team {
    return this.match.team;
  }
}
