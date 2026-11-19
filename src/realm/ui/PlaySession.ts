import { playCue } from "../audio";
import type { Adventure, EncounterDef } from "../game/content";
import { Encounter, makeHeroRuntime, type HeroRuntime, type Objective } from "../game/encounter";
import type { Hero } from "../game/save";
import type { Calibration } from "../input/calibration";
import { GestureDetector, type PracticeStats } from "../input/Gestures";
import type { PuckSource } from "../input/PuckSource";
import { ArenaRenderer, type ReadyCircle } from "../render/ArenaRenderer";
import { clamp, dist, escapeHtml, makeRng } from "../util";

export type SessionResult = {
  adventure: Adventure;
  /** False if the party left before the last encounter was cleared. */
  completed: boolean;
  encounters: { def: EncounterDef; stars: number; time: number; bestCombo: number; damage: number }[];
  heroes: { hero: Hero; runtime: HeroRuntime; practice: PracticeStats }[];
  dodges: number;
  interrupts: number;
  reactionTimes: number[];
  seconds: number;
};

type Phase = "ready" | "fight" | "cleared" | "over";

function formatClock(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  return `${Math.floor(s / 60)}:${`${s % 60}`.padStart(2, "0")}`;
}

function objectiveText(o: Objective | null): { title: string; sub: string } {
  if (!o) return { title: "Get ready…", sub: "" };
  const left = (n: number): string => (n > 500 ? "as many as you can" : `${n} to go`);
  switch (o.kind) {
    case "runes":
      return { title: "Carry the puck to the rune", sub: left(o.left) };
    case "twin": {
      const vertical = Math.abs(o.a.x - o.b.x) < 0.1;
      const diagonal = !vertical && Math.abs(o.a.y - o.b.y) > 0.1;
      const title = vertical ? "Pull and push between the runes" : diagonal ? "Diagonal dribbles, rune to rune" : o.wide ? "WIDE dribbles — reach for each rune" : "Quick dribbles between the runes";
      return { title, sub: left(o.left) };
    }
    case "weave":
      return { title: "Figure-eight around the stones", sub: o.left > 500 ? "as many loops as you can" : `${o.left} loops to go` };
    case "bolt":
      return { title: "PASS off the glowing crystal", sub: left(o.left) };
    case "hold":
      return { title: "Stop the puck dead in the circle", sub: "soft hands" };
  }
}

/** Runs one adventure: ready checks, hero rotation, the fight loop and the HUD. */
export class PlaySession {
  private readonly el: HTMLDivElement;
  private readonly renderer: ArenaRenderer;
  private readonly runtimes: HeroRuntime[];
  private readonly gestures: GestureDetector[];
  private readonly rng = makeRng((Date.now() ^ 0x9e3779b9) >>> 0);
  private heroIndex = 0;
  private encounterIndex = 0;
  private encounter: Encounter;
  private phase: Phase = "ready";
  private readyProgress = 0;
  private readyLabel = "";
  private shiftTime = 0;
  private clearedTimer = 0;
  private lostTime = 0;
  private paused = false;
  private raf = 0;
  private lastMs = 0;
  private totalSeconds = 0;
  private readonly results: SessionResult["encounters"] = [];
  private dodges = 0;
  private interrupts = 0;
  private readonly reactionTimes: number[] = [];
  private readonly refs: Record<string, HTMLElement> = {};
  private ended = false;

  private readonly onKey = (event: KeyboardEvent): void => {
    if (event.key === "Escape") this.finish(false);
    else if (event.key === " " && this.phase === "ready") {
      event.preventDefault();
      this.readyProgress = 1;
    } else if (event.key.toLowerCase() === "p") this.paused = !this.paused;
  };

  private readonly onResize = (): void => this.layout();

  constructor(
    private readonly root: HTMLElement,
    private readonly opts: {
      adventure: Adventure;
      heroes: Hero[];
      cal: Calibration;
      makeSource: (toArena: (cx: number, cy: number) => { x: number; y: number }) => PuckSource;
      onEnd: (result: SessionResult) => void;
    }
  ) {
    const { adventure, heroes, cal } = opts;
    this.runtimes = heroes.map(makeHeroRuntime);
    this.gestures = this.runtimes.map((rt) => new GestureDetector(cal.rebounders, { passMinSpeed: rt.tier.passMinSpeed }));

    this.el = document.createElement("div");
    this.el.className = "play";
    this.el.innerHTML = `
      <canvas class="play-canvas"></canvas>
      <div class="hud hud-top">
        <div class="frame enemy-frame" data-ref="enemyFrame">
          <div class="portrait" data-ref="enemyGlyph"></div>
          <div class="frame-body">
            <div class="frame-name"><span data-ref="enemyName"></span><small data-ref="stage"></small></div>
            <div class="bar bar-hp"><i data-ref="enemyBar"></i><span data-ref="enemyText"></span></div>
            <div class="castbar is-off" data-ref="cast">
              <div class="bar bar-cast"><i data-ref="castBar"></i><span>Find the matching stone!</span></div>
            </div>
          </div>
        </div>
        <div class="objective" data-ref="objective">
          <div class="objective-title" data-ref="objTitle"></div>
          <div class="objective-sub" data-ref="objSub"></div>
        </div>
        <div class="meta">
          <div class="timer" data-ref="timer">0:00</div>
          <div class="combo" data-ref="combo"></div>
        </div>
      </div>
      <div class="hud hud-bottom">
        <div class="frame hero-frame" data-ref="heroFrame">
          <div class="portrait" data-ref="heroGlyph"></div>
          <div class="frame-body">
            <div class="frame-name"><span data-ref="heroName"></span><small data-ref="heroSub"></small></div>
            <div class="bar bar-hp bar-hero"><i data-ref="heroBar"></i><span data-ref="heroText"></span></div>
            <div class="bar bar-power"><i data-ref="powerBar"></i><span data-ref="powerText"></span></div>
          </div>
        </div>
        <div class="party-strip" data-ref="party"></div>
        <div class="play-side">
          <div class="tracker-chip" data-ref="tracker"></div>
          <button class="btn btn-small" data-ref="quit" type="button">Leave (Esc)</button>
        </div>
      </div>`;
    root.replaceChildren(this.el);
    this.el.querySelectorAll<HTMLElement>("[data-ref]").forEach((node) => {
      this.refs[node.dataset.ref!] = node;
    });
    this.refs.quit!.addEventListener("click", () => this.finish(false));

    const canvas = this.el.querySelector<HTMLCanvasElement>(".play-canvas")!;
    this.renderer = new ArenaRenderer(canvas, cal.arenaW, cal.arenaD);
    this.source = opts.makeSource((cx, cy) => this.renderer.toArena(cx, cy));
    this.encounter = this.makeEncounter();
    this.enterReady(`${this.hero.hero.name}: bring the puck here to start`);

    this.refs.party!.hidden = this.runtimes.length < 2;
    window.addEventListener("keydown", this.onKey);
    window.addEventListener("resize", this.onResize);
    this.layout();
    this.raf = requestAnimationFrame(this.frame);
    // Lets browser tests drive a session; stripped from production builds.
    if (import.meta.env.DEV) (window as unknown as { __realmSession?: PlaySession }).__realmSession = this;
  }

  private readonly source: PuckSource;

  private get hero(): HeroRuntime {
    return this.runtimes[this.heroIndex]!;
  }

  private makeEncounter(): Encounter {
    const def = this.opts.adventure.encounters[this.encounterIndex]!;
    const { cal } = this.opts;
    for (const rt of this.runtimes) rt.hp = rt.maxHp;
    return new Encounter(def, { w: cal.arenaW, d: cal.arenaD, rebounders: cal.rebounders }, this.rng, this.hero);
  }

  private enterReady(label: string): void {
    this.phase = "ready";
    this.readyProgress = 0;
    this.readyLabel = label;
    this.shiftTime = 0;
  }

  private layout(): void {
    const top = this.el.querySelector<HTMLElement>(".hud-top")!.getBoundingClientRect().height;
    const bottom = this.el.querySelector<HTMLElement>(".hud-bottom")!.getBoundingClientRect().height;
    this.renderer.layout({ top: top + 26, bottom: bottom + 26, left: 22, right: 22 });
  }

  private readonly frame = (ms: number): void => {
    if (this.ended) return;
    const dt = this.lastMs === 0 ? 1 / 60 : clamp((ms - this.lastMs) / 1000, 1 / 240, 0.05);
    this.lastMs = ms;
    this.update(dt);
    if (this.ended) return;
    this.render(ms / 1000);
    this.raf = requestAnimationFrame(this.frame);
  };

  private update(dt: number): void {
    this.source.update(dt);
    const puck = this.source.sample;
    const gestures = this.gestures[this.heroIndex]!;
    if (this.paused) return;
    gestures.update(dt, puck);
    const { cal, adventure } = this.opts;

    if (this.phase === "ready") {
      const inside = puck.visible && dist(puck.x, puck.y, cal.arenaW / 2, cal.arenaD * 0.68) <= 1;
      this.readyProgress = inside ? this.readyProgress + dt / 0.8 : Math.max(0, this.readyProgress - dt * 2);
      if (this.readyProgress >= 1) {
        this.phase = "fight";
        this.lostTime = 0;
        playCue("ready");
      }
      return;
    }

    if (this.phase === "fight") {
      this.lostTime = puck.visible ? 0 : this.lostTime + dt;
      // Never punish a kid for the camera losing the puck: freeze the fight instead.
      if (this.lostTime > 1.2) return;
      const enc = this.encounter;
      enc.update(dt, puck, gestures);
      this.totalSeconds += dt;
      for (const cue of enc.sfx) playCue(cue);
      if (enc.done) {
        this.results.push({ def: enc.def, stars: enc.stars, time: enc.time, bestCombo: enc.bestCombo, damage: enc.damageDone });
        this.dodges += enc.dodges;
        this.interrupts += enc.interrupts;
        this.reactionTimes.push(...enc.reactionTimes);
        this.phase = "cleared";
        this.clearedTimer = 2.4;
        return;
      }
      this.shiftTime += dt;
      const shift = adventure.shiftSeconds;
      if (shift && this.runtimes.length > 1 && this.shiftTime >= shift && enc.reviveLeft === 0) {
        this.heroIndex = (this.heroIndex + 1) % this.runtimes.length;
        enc.setHero(this.hero);
        this.enterReady(`TAG IN: ${this.hero.hero.name}!`);
      }
      return;
    }

    if (this.phase === "cleared") {
      this.encounter.update(dt, puck, gestures);
      this.clearedTimer -= dt;
      if (this.clearedTimer > 0) return;
      if (this.encounterIndex + 1 >= adventure.encounters.length) {
        this.finish(true);
        return;
      }
      this.encounterIndex += 1;
      if (this.runtimes.length > 1) this.heroIndex = (this.heroIndex + 1) % this.runtimes.length;
      this.encounter = this.makeEncounter();
      this.enterReady(this.runtimes.length > 1 ? `TAG IN: ${this.hero.hero.name}!` : "Bring the puck here for the next fight");
    }
  }

  private render(time: number): void {
    const enc = this.encounter;
    const { cal, adventure } = this.opts;
    const puck = this.source.sample;
    const r = this.refs;
    const rt = this.hero;

    let ready: ReadyCircle | null = null;
    if (this.phase === "ready") {
      ready = { x: cal.arenaW / 2, y: cal.arenaD * 0.68, r: 1, progress: this.readyProgress, label: this.readyLabel };
    }
    let banner: string | null = null;
    if (this.paused) banner = "Paused — press P";
    else if (this.phase === "fight" && this.lostTime > 1.2) banner = "Puck lost — bring it back into view";
    else if (this.phase === "cleared") banner = enc.timed ? "Time! Nice work" : `${enc.def.enemy.name} defeated!`;

    this.renderer.draw({ time, puck, rebounders: cal.rebounders, encounter: this.phase === "ready" && enc.time === 0 ? null : enc, ready, banner });

    // Enemy frame
    // While casting, the enemy holds its spell symbol up in place of its portrait.
    r.enemyGlyph!.textContent = enc.cast ? enc.cast.sigil.glyph : enc.def.enemy.glyph;
    r.enemyGlyph!.style.color = enc.cast ? enc.cast.sigil.color : "";
    r.enemyGlyph!.style.borderColor = enc.cast ? enc.cast.sigil.color : "";
    r.enemyGlyph!.classList.toggle("is-casting", enc.cast !== null);
    r.enemyName!.textContent = enc.timed ? enc.def.name : enc.def.enemy.name;
    r.stage!.textContent = adventure.encounters.length > 1 ? ` ${this.encounterIndex + 1} / ${adventure.encounters.length}` : "";
    if (enc.timed) {
      r.enemyBar!.style.width = `${(enc.timeLeft / (enc.def.timeLimit ?? 1)) * 100}%`;
      r.enemyText!.textContent = `${formatClock(enc.timeLeft)} left · score ${enc.damageDone}`;
    } else {
      r.enemyBar!.style.width = `${(enc.enemyHp / enc.enemyMax) * 100}%`;
      r.enemyText!.textContent = `${enc.enemyHp} / ${enc.enemyMax}`;
    }
    r.enemyFrame!.classList.toggle("is-hit", enc.enemyFlash > 0.5);
    r.cast!.classList.toggle("is-off", !enc.cast);
    if (enc.cast) {
      r.castBar!.style.width = `${(enc.cast.t / enc.cast.total) * 100}%`;
    }

    // Objective
    // Alerts take over the headline for a moment instead of covering the floor.
    const callout = this.phase === "fight" ? enc.callout : null;
    const obj = callout
      ? { title: callout.text, sub: callout.sub }
      : this.phase === "ready" && enc.time === 0
        ? { title: enc.def.story, sub: enc.def.drill }
        : objectiveText(enc.objective);
    r.objTitle!.textContent = obj.title;
    r.objSub!.textContent = obj.sub;
    r.objective!.classList.toggle("is-alert", callout !== null);
    r.timer!.textContent = formatClock(enc.time);
    r.combo!.textContent = enc.combo >= 2 ? `Combo ×${enc.comboMult.toFixed(2)}` : "";

    // Hero frame
    r.heroGlyph!.textContent = rt.cls.glyph;
    r.heroGlyph!.style.borderColor = rt.cls.color;
    r.heroName!.textContent = `${rt.hero.name} #${rt.hero.jersey}`;
    r.heroSub!.textContent = ` Lv ${rt.hero.level} ${rt.cls.name}`;
    r.heroBar!.style.width = `${(rt.hp / rt.maxHp) * 100}%`;
    r.heroText!.textContent = `${rt.hp} / ${rt.maxHp}`;
    r.powerBar!.style.width = `${rt.power}%`;
    r.powerBar!.style.background = rt.cls.color;
    const sigReady = enc.signatureReady;
    const hint = enc.signatureKind === rt.cls.signature.kind ? rt.cls.signature.hint : "7 lightning-quick dribbles";
    r.powerText!.textContent = sigReady ? `${rt.cls.signature.name} READY — ${hint}` : `${rt.cls.powerName} ${Math.round(rt.power)}`;
    r.heroFrame!.classList.toggle("is-ready", sigReady);
    r.heroFrame!.classList.toggle("is-hit", enc.heroFlash > 0.5);

    if (this.runtimes.length > 1) {
      const shift = adventure.shiftSeconds;
      const shiftLeft = shift && this.phase === "fight" ? `<span class="shift">Shift ${formatClock(shift - this.shiftTime)}</span>` : "";
      r.party!.innerHTML =
        this.runtimes
          .map((p, i) => `<span class="party-chip${i === this.heroIndex ? " is-active" : ""}">${p.cls.glyph} ${escapeHtml(p.hero.name)}</span>`)
          .join("") + shiftLeft;
    }

    r.tracker!.textContent = `${this.source.label} · ${puck.visible ? "tracking" : "searching…"}`;
    r.tracker!.classList.toggle("is-lost", !puck.visible);
  }

  private finish(completed: boolean): void {
    if (this.ended) return;
    const enc = this.encounter;
    if (!completed && enc.time > 0 && !enc.done) {
      this.dodges += enc.dodges;
      this.interrupts += enc.interrupts;
      this.reactionTimes.push(...enc.reactionTimes);
    }
    const result: SessionResult = {
      adventure: this.opts.adventure,
      completed,
      encounters: this.results,
      heroes: this.runtimes.map((runtime, i) => ({ hero: runtime.hero, runtime, practice: this.gestures[i]!.stats })),
      dodges: this.dodges,
      interrupts: this.interrupts,
      reactionTimes: this.reactionTimes,
      seconds: this.totalSeconds
    };
    this.destroy();
    this.opts.onEnd(result);
  }

  destroy(): void {
    this.ended = true;
    this.phase = "over";
    cancelAnimationFrame(this.raf);
    window.removeEventListener("keydown", this.onKey);
    window.removeEventListener("resize", this.onResize);
    this.source.destroy();
  }
}
