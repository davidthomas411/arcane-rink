import { playCue, startMusic, stopMusic } from "../audio";
import type { Adventure, EncounterDef, EnemyKind } from "../game/content";
import { Encounter, makeHeroRuntime, type Enemy, type HeroRuntime } from "../game/encounter";
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
  gold: number;
};

type Phase = "ready" | "fight" | "cleared" | "over";

const asset = (name: string): string => new URL(`../assets/${name}`, import.meta.url).href;

/** Portrait art per creature; the CSS filter matches the tint used on the floor. */
const PORTRAITS: Record<EnemyKind, { img?: string; filter?: string; glyph?: string }> = {
  grunt: { img: "goblin.png" },
  berserker: { img: "goblin.png", filter: "hue-rotate(-75deg) saturate(1.5)" },
  brute: { img: "goblin.png", filter: "hue-rotate(110deg) saturate(0.8)" },
  shaman: { img: "goblin.png", filter: "hue-rotate(200deg) saturate(1.2)" },
  boss: { img: "goblin.png", filter: "contrast(1.15) saturate(1.25)" },
  runner: { img: "goblin-toon.png" },
  totem: { glyph: "🗿" },
  wisp: { glyph: "✨" },
  dummy: { glyph: "🪵" }
};

export const HERO_PORTRAITS: Record<string, string> = { a: "hero-a.png", k: "hero-k.png" };

function formatClock(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  return `${Math.floor(s / 60)}:${`${s % 60}`.padStart(2, "0")}`;
}

/** The one line of coaching at the top of the screen: what to do about what is on the floor right now. */
function coach(enc: Encounter): { title: string; sub: string } {
  const foes = enc.alive;
  const wave = enc.waveCount > 1 && enc.waveIndex >= 0 ? `Wave ${enc.waveIndex + 1} of ${enc.waveCount} · ` : "";
  const left = `${wave}${foes.length} left`;
  if (enc.timed) return { title: enc.def.story, sub: enc.def.drill };
  if (foes.length === 0) return { title: "Get ready…", sub: "" };
  if (foes.some((e) => e.warded)) return { title: "He's warded — PASS off a crystal!", sub: "Only lightning breaks a ward" };
  if (foes.some((e) => e.state === "aim" || e.state === "charge")) return { title: "Charge! Get out of the lane", sub: "If it misses, it's stunned — punish it" };
  if (foes.some((e) => e.kind === "totem")) return { title: "PASS off a crystal to break the totem", sub: "It heals them and sticks can't hurt it" };
  if (enc.ward && !enc.wardBroken) return { title: "Protect the ward — cut them off!", sub: left };
  if (foes.every((e) => e.kind === "runner")) return { title: "Catch the imps!", sub: left };
  if (foes.filter((e) => e.kind === "wisp").length >= 3) return { title: "Loop around the wisps — or cut through", sub: left };
  if (foes.some((e) => e.only)) return { title: "Each post only falls to one move", sub: "Read the label under it" };
  const t = enc.target;
  if (t && t.shield && t.shieldDown <= 0 && t.stun <= 0) return { title: "Shield up — get the puck BEHIND it", sub: "Or crack it with a pass" };
  if (foes.some((e) => e.state === "cast")) return { title: "It's casting — hit it or dodge sideways", sub: left };
  return { title: "Dribble beside it — stay out of the red", sub: `Green arc is its weak back · ${left}` };
}

/** Runs one adventure: ready checks, hero rotation, the fight loop and the HUD. */
export class PlaySession {
  private readonly el: HTMLDivElement;
  private readonly renderer: ArenaRenderer;
  private readonly source: PuckSource;
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
  private gold = 0;
  private readonly reactionTimes: number[] = [];
  private readonly refs: Record<string, HTMLElement> = {};
  private ended = false;
  private shownEnemy = "";
  private shownHero = "";

  private readonly onKey = (event: KeyboardEvent): void => {
    if (event.key === "Escape") this.finish(false);
    else if (event.key === " " && this.phase === "ready") {
      event.preventDefault();
      this.readyProgress = 1;
    } else if (event.key.toLowerCase() === "p") this.paused = !this.paused;
  };

  private readonly onResize = (): void => this.layout();

  constructor(
    root: HTMLElement,
    private readonly opts: {
      adventure: Adventure;
      heroes: Hero[];
      cal: Calibration;
      makeSource: (toArena: (cx: number, cy: number) => { x: number; y: number }) => PuckSource;
      onEnd: (result: SessionResult) => void;
    }
  ) {
    const { heroes, cal } = opts;
    this.runtimes = heroes.map(makeHeroRuntime);
    this.gestures = this.runtimes.map((rt) => new GestureDetector(cal.rebounders, { passMinSpeed: rt.tier.passMinSpeed }));

    this.el = document.createElement("div");
    this.el.className = "play";
    this.el.innerHTML = `
      <canvas class="play-canvas"></canvas>
      <div class="hud hud-top">
        <div class="frame enemy-frame" data-ref="enemyFrame">
          <div class="portrait" data-ref="enemyPortrait"></div>
          <div class="frame-body">
            <div class="frame-name"><span data-ref="enemyName"></span><small data-ref="stage"></small></div>
            <div class="bar bar-hp"><i data-ref="enemyBar"></i><span data-ref="enemyText"></span></div>
            <div class="frame-note" data-ref="enemyNote"></div>
          </div>
        </div>
        <div class="objective" data-ref="objective">
          <div class="objective-title" data-ref="objTitle"></div>
          <div class="objective-sub" data-ref="objSub"></div>
        </div>
        <div class="meta">
          <div class="timer" data-ref="timer">0:00</div>
          <div class="combo" data-ref="combo"></div>
          <div class="gold" data-ref="gold"></div>
        </div>
      </div>
      <div class="hud hud-bottom">
        <div class="frame hero-frame" data-ref="heroFrame">
          <div class="portrait" data-ref="heroPortrait"></div>
          <div class="frame-body">
            <div class="frame-name"><span data-ref="heroName"></span><small data-ref="heroSub"></small></div>
            <div class="bar bar-hp bar-hero"><i data-ref="heroBar"></i><span data-ref="heroText"></span></div>
            <div class="bar bar-power"><i data-ref="powerBar"></i><span data-ref="powerText"></span></div>
          </div>
        </div>
        <div class="party-strip" data-ref="party"></div>
        <div class="moves" data-ref="moves">
          <span><b>Quick dribbles</b> strike</span>
          <span><b>Wide dribbles</b> cleave</span>
          <span><b>Cut through</b> dash</span>
          <span><b>Loop around</b> freeze</span>
          <span><b>Pass</b> lightning</span>
        </div>
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
    startMusic();
    this.raf = requestAnimationFrame(this.frame);
    // Lets browser tests inspect a session; stripped from production builds.
    if (import.meta.env.DEV) (window as unknown as { __realmSession?: PlaySession }).__realmSession = this;
  }

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
    this.renderer.layout({ top: top + 30, bottom: bottom + 30, left: 30, right: 30 });
  }

  private readyPoint(): { x: number; y: number } {
    return { x: this.opts.cal.arenaW / 2, y: this.opts.cal.arenaD * 0.72 };
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
    const gestures = this.gestures[this.heroIndex]!;
    this.source.drive?.({ encounter: this.phase === "fight" ? this.encounter : null, ready: this.phase === "ready" ? this.readyPoint() : null, passing: gestures.passing });
    this.source.update(dt);
    const puck = this.source.sample;
    if (this.paused) return;
    gestures.update(dt, puck);
    const { adventure } = this.opts;

    if (this.phase === "ready") {
      const p = this.readyPoint();
      const inside = puck.visible && dist(puck.x, puck.y, p.x, p.y) <= 1;
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
      this.renderer.addFx(enc.fx);
      this.totalSeconds += dt;
      for (const cue of enc.sfx) playCue(cue);
      if (enc.done) {
        this.bank(enc);
        this.results.push({ def: enc.def, stars: enc.stars, time: enc.time, bestCombo: enc.bestCombo, damage: enc.damageDone });
        this.phase = "cleared";
        this.clearedTimer = 2.6;
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

  private bank(enc: Encounter): void {
    this.dodges += enc.dodges;
    this.interrupts += enc.interrupts;
    this.gold += enc.gold;
    this.reactionTimes.push(...enc.reactionTimes);
  }

  private setPortrait(node: HTMLElement, key: string, shownKey: "shownEnemy" | "shownHero", html: string): void {
    if (this[shownKey] === key) return;
    this[shownKey] = key;
    node.innerHTML = html;
  }

  private render(time: number): void {
    const enc = this.encounter;
    const { cal, adventure } = this.opts;
    const puck = this.source.sample;
    const r = this.refs;
    const rt = this.hero;
    const fresh = this.phase === "ready" && enc.time === 0;

    let ready: ReadyCircle | null = null;
    if (this.phase === "ready") {
      const p = this.readyPoint();
      ready = { x: p.x, y: p.y, r: 1, progress: this.readyProgress, label: this.readyLabel };
    }
    let banner: string | null = null;
    if (this.paused) banner = "Paused — press P";
    else if (this.phase === "fight" && this.lostTime > 1.2) banner = "Puck lost — bring it back into view";
    else if (this.phase === "cleared") banner = enc.timed ? "Time! Nice work" : "Victory!";

    this.renderer.heroColor = rt.cls.color;
    this.renderer.draw({ time, puck, rebounders: cal.rebounders, encounter: fresh ? null : enc, ready, banner });

    // Target frame: the boss if there is one, otherwise whatever the hero is fighting.
    const boss = enc.alive.find((e) => e.kind === "boss");
    const shown: Enemy | null = boss ?? enc.target ?? null;
    r.stage!.textContent = adventure.encounters.length > 1 ? ` ${this.encounterIndex + 1} / ${adventure.encounters.length}` : "";
    if (enc.timed) {
      this.setPortrait(r.enemyPortrait!, "timed", "shownEnemy", `<span>${enc.def.enemy.glyph}</span>`);
      r.enemyName!.textContent = enc.def.name;
      r.enemyBar!.style.width = `${(enc.timeLeft / (enc.def.timeLimit ?? 1)) * 100}%`;
      r.enemyText!.textContent = `${formatClock(enc.timeLeft)} left · score ${enc.damageDone}`;
      r.enemyNote!.textContent = "";
    } else if (shown && !fresh) {
      const art = PORTRAITS[shown.kind];
      this.setPortrait(
        r.enemyPortrait!,
        shown.kind,
        "shownEnemy",
        art.img ? `<img src="${asset(art.img)}" alt="" style="filter:${art.filter ?? "none"}" />` : `<span>${art.glyph ?? "?"}</span>`
      );
      r.enemyName!.textContent = shown.name;
      r.enemyBar!.style.width = `${(shown.hp / shown.maxHp) * 100}%`;
      r.enemyText!.textContent = `${Math.ceil(shown.hp)} / ${shown.maxHp}`;
      r.enemyNote!.textContent = shown.warded
        ? "WARDED — needs lightning"
        : shown.stun > 0
          ? shown.frozen
            ? "Frozen — hit it now!"
            : "Stunned — hit it now!"
          : shown.shield && shown.shieldDown <= 0
            ? "Shield up — attack from behind"
            : shown.state === "cast"
              ? "Casting…"
              : "";
    } else {
      this.setPortrait(r.enemyPortrait!, "card", "shownEnemy", `<span>${enc.def.enemy.glyph}</span>`);
      r.enemyName!.textContent = enc.def.enemy.name;
      r.enemyBar!.style.width = "100%";
      r.enemyText!.textContent = enc.def.name;
      r.enemyNote!.textContent = "";
    }
    r.enemyFrame!.classList.toggle("is-hit", !!shown && shown.flash > 0.5);

    // Headline: alerts first, then the story before a fight, then live coaching.
    const callout = this.phase === "fight" ? enc.callout : null;
    const obj = callout ? { title: callout.text, sub: callout.sub } : fresh ? { title: enc.def.story, sub: enc.def.drill } : coach(enc);
    r.objTitle!.textContent = obj.title;
    r.objSub!.textContent = obj.sub;
    r.objective!.classList.toggle("is-alert", callout !== null);
    r.timer!.textContent = formatClock(enc.time);
    r.combo!.textContent = enc.combo >= 2 ? `${enc.combo} streak ×${enc.comboMult.toFixed(2)}` : "";
    const gold = this.gold + enc.gold;
    r.gold!.textContent = enc.ward ? `Ward ${Math.ceil(enc.ward.hp)}%${gold ? ` · ${gold} gold` : ""}` : gold ? `${gold} gold` : "";

    // Hero frame
    const face = HERO_PORTRAITS[rt.hero.portrait];
    this.setPortrait(r.heroPortrait!, rt.hero.id, "shownHero", face ? `<img src="${asset(face)}" alt="" />` : `<span>${rt.cls.glyph}</span>`);
    r.heroPortrait!.style.borderColor = rt.cls.color;
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
    if (!completed && enc.time > 0 && !enc.done) this.bank(enc);
    const result: SessionResult = {
      adventure: this.opts.adventure,
      completed,
      encounters: this.results,
      heroes: this.runtimes.map((runtime, i) => ({ hero: runtime.hero, runtime, practice: this.gestures[i]!.stats })),
      dodges: this.dodges,
      interrupts: this.interrupts,
      reactionTimes: this.reactionTimes,
      seconds: this.totalSeconds,
      gold: this.gold
    };
    this.destroy();
    this.opts.onEnd(result);
  }

  destroy(): void {
    this.ended = true;
    this.phase = "over";
    cancelAnimationFrame(this.raf);
    stopMusic();
    window.removeEventListener("keydown", this.onKey);
    window.removeEventListener("resize", this.onResize);
    this.source.destroy();
  }
}
