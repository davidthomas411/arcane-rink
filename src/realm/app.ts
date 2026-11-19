import { isMuted, setMuted, unlockAudio } from "./audio";
import { CLASS_LIST, CLASSES, TIER_LIST, TIERS, type ClassId, type TierId } from "./game/classes";
import { DAILY, ZONES, type Adventure } from "./game/content";
import { gearBonus, RARITY_COLOR, SLOT_GLYPH, SLOT_LABEL, SLOTS, STAT_LABEL } from "./game/loot";
import { applyRewards, type RewardSummary } from "./game/rewards";
import {
  createHero,
  dailyDoneToday,
  loadSave,
  MAX_PARTY,
  partyHeroes,
  persistSave,
  SKILL_LABEL,
  SKILL_MAX,
  xpForLevel,
  type Hero,
  type Save,
  type SkillId
} from "./game/save";
import { CameraSource, CameraTracker } from "./input/CameraSource";
import { loadCalibration, saveCalibration, type Calibration } from "./input/calibration";
import { MouseSource } from "./input/MouseSource";
import { CalibrationScreen } from "./ui/CalibrationScreen";
import { PlaySession, type SessionResult } from "./ui/PlaySession";
import { escapeHtml, makeRng } from "./util";

const FPS_TO_MPH = 0.6818;
const SKILLS: readonly SkillId[] = ["stick", "pass", "aware"];

function stars(count: number, max = 3): string {
  return `<span class="stars" aria-label="${count} of ${max} stars">${"★".repeat(count)}<i>${"★".repeat(Math.max(0, max - count))}</i></span>`;
}

function bar(fraction: number, cls = ""): string {
  return `<div class="bar bar-thin ${cls}"><i style="width:${Math.round(Math.max(0, Math.min(1, fraction)) * 100)}%"></i></div>`;
}

export class RealmApp {
  private save: Save;
  private cal: Calibration;
  private tracker: CameraTracker | null = null;
  private cameraRunning = false;
  private session: PlaySession | null = null;
  private notice = "";

  constructor(private readonly root: HTMLElement) {
    this.save = loadSave();
    this.cal = loadCalibration();
    root.addEventListener("pointerdown", unlockAudio, { passive: true });
    window.addEventListener("keydown", unlockAudio);
    this.showTavern();
  }

  private commit(): void {
    persistSave(this.save);
  }

  private getTracker(): CameraTracker {
    if (!this.tracker) this.tracker = new CameraTracker(this.cal.color);
    return this.tracker;
  }

  private screen(html: string, cls: string): HTMLDivElement {
    const el = document.createElement("div");
    el.className = `screen ${cls}`;
    el.innerHTML = html;
    this.root.replaceChildren(el);
    return el;
  }

  // ---------------------------------------------------------------- tavern

  private heroCard(hero: Hero): string {
    const cls = CLASSES[hero.classId];
    const order = this.save.party.indexOf(hero.id);
    const inParty = order >= 0;
    const gear = gearBonus(hero.gear);
    return `
      <article class="hero-card${inParty ? " in-party" : ""}" style="--class:${cls.color}">
        <div class="hero-top">
          <div class="portrait">${cls.glyph}</div>
          <div>
            <h3>${escapeHtml(hero.name)} <span class="jersey">#${escapeHtml(hero.jersey)}</span></h3>
            <p>Level ${hero.level} ${cls.name} · ${TIERS[hero.tier].name}</p>
          </div>
        </div>
        ${bar(hero.xp / xpForLevel(hero.level), "bar-xp")}
        <p class="tiny">${hero.xp} / ${xpForLevel(hero.level)} XP · Gear score ${gear.gearScore}</p>
        <div class="skills">
          ${SKILLS.map((id) => `<div><span>${SKILL_LABEL[id]}</span>${bar(hero.skills[id] / SKILL_MAX, "bar-skill")}<b>${Math.floor(hero.skills[id])}</b></div>`).join("")}
        </div>
        <div class="row">
          <button class="btn ${inParty ? "btn-primary" : ""}" data-act="party" data-id="${hero.id}" type="button">${inParty ? `In party · ${order + 1}` : "Join party"}</button>
          <button class="btn" data-act="sheet" data-id="${hero.id}" type="button">Hero sheet</button>
        </div>
      </article>`;
  }

  private showTavern(): void {
    const party = partyHeroes(this.save);
    const camera = this.cal.input === "camera";
    const el = this.screen(
      `
      <header class="screen-head">
        <div>
          <h1>Arcane Rink</h1>
          <p class="lede">Realm of the Puckbound — eyes on the screen, puck on your stick.</p>
        </div>
        <div class="streak" title="Daily routine streak">🔥 ${this.save.daily.streak} day streak</div>
      </header>
      ${this.notice ? `<p class="notice">${escapeHtml(this.notice)}</p>` : ""}
      <div class="tavern-grid">
        <section>
          <h2>Heroes <small>Pick up to ${MAX_PARTY} for the party. In dungeons and raids they take shifts.</small></h2>
          <div class="roster">
            ${this.save.heroes.map((hero) => this.heroCard(hero)).join("")}
            <button class="hero-card hero-new" data-act="new" type="button"><span>＋</span>New hero</button>
          </div>
        </section>
        <aside class="panel">
          <h2>Rink setup</h2>
          <dl class="facts">
            <dt>Puck tracking</dt><dd>${camera ? "Overhead camera" : "Mouse (desk practice)"}</dd>
            <dt>Floor</dt><dd>${this.cal.arenaW} × ${this.cal.arenaD} ft</dd>
            <dt>Rebounders</dt><dd>${this.cal.rebounders.length || "none — pass quests become carries"}</dd>
          </dl>
          <div class="col">
            <button class="btn" data-act="calibrate" type="button">Camera &amp; floor setup</button>
            ${this.cal.cameraReady ? `<button class="btn" data-act="toggle-input" type="button">Switch to ${camera ? "mouse" : "camera"}</button>` : ""}
            <button class="btn" data-act="mute" type="button">Sound: ${isMuted() ? "off" : "on"}</button>
            <a class="btn" href="legacy.html">Original shooting-pad game</a>
          </div>
          <button class="btn btn-primary btn-big" data-act="enter" type="button" ${party.length === 0 ? "disabled" : ""}>Enter the world →</button>
          ${party.length === 0 ? `<p class="hint">Create a hero and add them to the party to begin.</p>` : `<p class="hint">Party: ${party.map((h) => escapeHtml(h.name)).join(", ")}</p>`}
        </aside>
      </div>`,
      "tavern"
    );
    this.notice = "";
    el.addEventListener("click", (event) => {
      const target = (event.target as HTMLElement).closest<HTMLElement>("[data-act]");
      if (!target) return;
      const id = target.dataset.id ?? "";
      switch (target.dataset.act) {
        case "new":
          this.showHeroForm();
          break;
        case "party": {
          const index = this.save.party.indexOf(id);
          if (index >= 0) this.save.party.splice(index, 1);
          else if (this.save.party.length < MAX_PARTY) this.save.party.push(id);
          else this.notice = `The party is full (${MAX_PARTY} heroes).`;
          this.commit();
          this.showTavern();
          break;
        }
        case "sheet": {
          const hero = this.save.heroes.find((h) => h.id === id);
          if (hero) this.showSheet(hero);
          break;
        }
        case "calibrate":
          this.showCalibration();
          break;
        case "toggle-input":
          this.cal.input = this.cal.input === "camera" ? "mouse" : "camera";
          saveCalibration(this.cal);
          this.showTavern();
          break;
        case "mute":
          setMuted(!isMuted());
          this.showTavern();
          break;
        case "enter":
          this.showMap();
          break;
      }
    });
  }

  private showHeroForm(): void {
    let classId: ClassId = "warrior";
    let tier: TierId = "skilled";
    const el = this.screen(
      `
      <header class="screen-head"><div><h1>New hero</h1><p class="lede">Every class levels up a different hockey habit.</p></div></header>
      <form class="panel hero-form">
        <div class="row">
          <label>Hero name <input name="name" maxlength="14" required autocomplete="off" placeholder="e.g. Ava" /></label>
          <label>Jersey # <input name="jersey" maxlength="2" inputmode="numeric" placeholder="00" /></label>
        </div>
        <h2>Class</h2>
        <div class="choice-grid" data-group="class">
          ${CLASS_LIST.map(
            (c) => `
            <button type="button" class="choice${c.id === classId ? " is-on" : ""}" data-class="${c.id}" style="--class:${c.color}">
              <span class="portrait">${c.glyph}</span>
              <b>${c.name}</b>
              <span>${c.focus}</span>
              <small>Signature: ${c.signature.name} — ${c.signature.hint}</small>
              <small>${c.passive}</small>
            </button>`
          ).join("")}
        </div>
        <h2>Challenge <small>Per hero, so siblings of different ages can share a party.</small></h2>
        <div class="choice-grid choice-grid-3" data-group="tier">
          ${TIER_LIST.map((t) => `<button type="button" class="choice${t.id === tier ? " is-on" : ""}" data-tier="${t.id}"><b>${t.name}</b><span>${t.blurb}</span></button>`).join("")}
        </div>
        <div class="row">
          <button class="btn" type="button" data-act="cancel">Cancel</button>
          <button class="btn btn-primary" type="submit">Create hero</button>
        </div>
      </form>`,
      "hero-form-screen"
    );
    const form = el.querySelector("form")!;
    el.addEventListener("click", (event) => {
      const target = event.target as HTMLElement;
      const classButton = target.closest<HTMLElement>("[data-class]");
      const tierButton = target.closest<HTMLElement>("[data-tier]");
      if (classButton) {
        classId = classButton.dataset.class as ClassId;
        el.querySelectorAll("[data-class]").forEach((node) => node.classList.toggle("is-on", node === classButton));
      } else if (tierButton) {
        tier = tierButton.dataset.tier as TierId;
        el.querySelectorAll("[data-tier]").forEach((node) => node.classList.toggle("is-on", node === tierButton));
      } else if (target.closest('[data-act="cancel"]')) {
        this.showTavern();
      }
    });
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      const data = new FormData(form);
      const hero = createHero(String(data.get("name") ?? ""), String(data.get("jersey") ?? ""), classId, tier);
      this.save.heroes.push(hero);
      if (this.save.party.length < MAX_PARTY) this.save.party.push(hero.id);
      this.commit();
      this.showTavern();
    });
    form.querySelector<HTMLInputElement>('input[name="name"]')!.focus();
  }

  private showSheet(hero: Hero): void {
    const cls = CLASSES[hero.classId];
    const gear = gearBonus(hero.gear);
    const minutes = Math.round(hero.stats.seconds / 60);
    const el = this.screen(
      `
      <header class="screen-head">
        <div><h1>${cls.glyph} ${escapeHtml(hero.name)} <span class="jersey">#${escapeHtml(hero.jersey)}</span></h1>
        <p class="lede">Level ${hero.level} ${cls.name} — ${cls.focus}</p></div>
        <button class="btn" data-act="back" type="button">← Back</button>
      </header>
      <div class="sheet-grid">
        <section class="panel">
          <h2>Gear <small>Score ${gear.gearScore}</small></h2>
          <ul class="gear">
            ${SLOTS.map((slot) => {
              const item = hero.gear[slot];
              return item
                ? `<li><span class="slot">${SLOT_GLYPH[slot]}</span><div><b style="color:${RARITY_COLOR[item.rarity]}">${escapeHtml(item.name)}</b><small>Item level ${item.ilvl} · +${item.value} ${STAT_LABEL[item.stat]}</small></div></li>`
                : `<li class="empty"><span class="slot">${SLOT_GLYPH[slot]}</span><div><b>${SLOT_LABEL[slot]}</b><small>Empty — win quests to find gear</small></div></li>`;
            }).join("")}
          </ul>
          <h2>Class</h2>
          <p><b>${cls.signature.name}</b> — when ${cls.powerName} is full: ${cls.signature.hint}.</p>
          <p>${cls.passive}</p>
        </section>
        <section class="panel">
          <h2>Hockey skills</h2>
          <div class="skills skills-big">
            ${SKILLS.map((id) => `<div><span>${SKILL_LABEL[id]}</span>${bar(hero.skills[id] / SKILL_MAX, "bar-skill")}<b>${Math.floor(hero.skills[id])} / ${SKILL_MAX}</b></div>`).join("")}
          </div>
          <h2>Career</h2>
          <dl class="facts">
            <dt>Practice time</dt><dd>${minutes} min</dd>
            <dt>Dribble touches</dt><dd>${hero.stats.touches.toLocaleString()}</dd>
            <dt>Passes / clean catches</dt><dd>${hero.stats.passes} / ${hero.stats.receptions}</dd>
            <dt>Hardest pass</dt><dd>${(hero.stats.topPassSpeed * FPS_TO_MPH).toFixed(1)} mph</dd>
            <dt>Puck travel</dt><dd>${Math.round(hero.stats.distanceFt).toLocaleString()} ft</dd>
          </dl>
          <h2>Challenge</h2>
          <div class="row">
            ${TIER_LIST.map((t) => `<button class="btn btn-small${t.id === hero.tier ? " is-on" : ""}" data-tier="${t.id}" type="button">${t.name}</button>`).join("")}
          </div>
          <div class="row"><button class="btn btn-danger btn-small" data-act="delete" type="button">Retire this hero…</button></div>
        </section>
      </div>`,
      "sheet"
    );
    el.addEventListener("click", (event) => {
      const target = event.target as HTMLElement;
      const tierButton = target.closest<HTMLElement>("[data-tier]");
      if (tierButton) {
        hero.tier = tierButton.dataset.tier as TierId;
        this.commit();
        this.showSheet(hero);
      } else if (target.closest('[data-act="back"]')) {
        this.showTavern();
      } else if (target.closest('[data-act="delete"]')) {
        if (window.confirm(`Retire ${hero.name} for good? Their level and gear will be lost.`)) {
          this.save.heroes = this.save.heroes.filter((h) => h.id !== hero.id);
          this.save.party = this.save.party.filter((id) => id !== hero.id);
          this.commit();
          this.showTavern();
        }
      }
    });
  }

  // ------------------------------------------------------------------- map

  private adventureCard(adventure: Adventure, party: Hero[]): string {
    const top = Math.max(...party.map((h) => h.level));
    const locked = top < adventure.level;
    const best = Math.max(0, ...party.map((h) => h.stars[adventure.id] ?? 0));
    const minutes = Math.max(1, Math.round(adventure.encounters.reduce((sum, e) => sum + (e.timeLimit ?? e.par), 0) / 60));
    return `
      <button class="adventure kind-${adventure.kind}${locked ? " is-locked" : ""}" data-adventure="${adventure.id}" type="button" ${locked ? "disabled" : ""}>
        <span class="adventure-glyph">${adventure.encounters[adventure.encounters.length - 1]!.enemy.glyph}</span>
        <span class="adventure-body">
          <b>${escapeHtml(adventure.name)}</b>
          <span>${escapeHtml(adventure.blurb)}</span>
          <small>${locked ? `🔒 Reach level ${adventure.level}` : `Level ${adventure.level} · about ${minutes} min · ${escapeHtml(adventure.encounters[0]!.drill)}`}</small>
        </span>
        ${stars(best)}
      </button>`;
  }

  private showMap(): void {
    const party = partyHeroes(this.save);
    if (party.length === 0) {
      this.showTavern();
      return;
    }
    const doneToday = dailyDoneToday(this.save);
    const el = this.screen(
      `
      <header class="screen-head">
        <div><h1>World map</h1><p class="lede">Party: ${party.map((h) => `${CLASSES[h.classId].glyph} ${escapeHtml(h.name)} (Lv ${h.level})`).join(" · ")}</p></div>
        <button class="btn" data-act="back" type="button">← Tavern</button>
      </header>
      ${this.notice ? `<p class="notice">${escapeHtml(this.notice)}</p>` : ""}
      <section class="zone zone-daily">
        <h2>Daily routine <small>${doneToday ? "Done today — come back tomorrow to grow the streak" : "Not done yet today"} · 🔥 ${this.save.daily.streak}</small></h2>
        <div class="adventures">${this.adventureCard(DAILY, party)}</div>
      </section>
      ${ZONES.map(
        (zone) => `
        <section class="zone">
          <h2>${escapeHtml(zone.name)} <small>${escapeHtml(zone.levels)} — ${escapeHtml(zone.blurb)}</small></h2>
          <div class="adventures">${zone.adventures.map((a) => this.adventureCard(a, party)).join("")}</div>
        </section>`
      ).join("")}`,
      "map"
    );
    this.notice = "";
    el.addEventListener("click", (event) => {
      const target = event.target as HTMLElement;
      if (target.closest('[data-act="back"]')) {
        this.showTavern();
        return;
      }
      const id = target.closest<HTMLElement>("[data-adventure]")?.dataset.adventure;
      const adventure = id === DAILY.id ? DAILY : ZONES.flatMap((z) => z.adventures).find((a) => a.id === id);
      if (adventure) void this.startAdventure(adventure);
    });
  }

  // ------------------------------------------------------------------ play

  private async startAdventure(adventure: Adventure): Promise<void> {
    const party = partyHeroes(this.save);
    // Quests and the daily routine are solo: the first hero in the party plays.
    const heroes = adventure.kind === "dungeon" || adventure.kind === "raid" ? party : party.slice(0, 1);
    if (this.cal.input === "camera" && !this.cameraRunning) {
      try {
        await this.getTracker().start(this.cal.deviceId);
        this.cameraRunning = true;
      } catch (error) {
        this.notice = `Camera could not start (${error instanceof Error ? error.message : String(error)}). Open Camera & floor setup, or switch to mouse.`;
        this.showTavern();
        return;
      }
    }
    const cal = this.cal;
    this.session = new PlaySession(this.root, {
      adventure,
      heroes,
      cal,
      makeSource: (toArena) => {
        if (cal.input === "camera") {
          const tracker = this.getTracker();
          tracker.color = cal.color;
          return new CameraSource(tracker, cal);
        }
        return new MouseSource(toArena, cal.arenaW, cal.arenaD);
      },
      onEnd: (result) => {
        this.session = null;
        this.showResults(result);
      }
    });
  }

  private showResults(result: SessionResult): void {
    const summary: RewardSummary = applyRewards(
      this.save,
      {
        adventure: result.adventure,
        completed: result.completed,
        encounters: result.encounters,
        heroes: result.heroes.map((h) => ({ hero: h.hero, tally: h.runtime.tally, practice: h.practice }))
      },
      makeRng((Date.now() ^ 0x51ed270b) >>> 0)
    );
    this.commit();

    const played = result.heroes.filter((h) => h.runtime.tally.seconds > 0);
    const avgReaction = result.reactionTimes.length > 0 ? result.reactionTimes.reduce((a, b) => a + b, 0) / result.reactionTimes.length : null;
    const rewardCards = summary.rewards
      .map((reward) => {
        const cls = CLASSES[reward.hero.classId];
        const skillLine = SKILLS.filter((id) => reward.skillUps[id] > 0)
          .map((id) => `${SKILL_LABEL[id]} +${reward.skillUps[id]}`)
          .join(" · ");
        return `
        <article class="reward" style="--class:${cls.color}">
          <h3>${cls.glyph} ${escapeHtml(reward.hero.name)}</h3>
          ${result.completed ? `<p class="xp">+${reward.xp} XP</p>` : `<p class="tiny">Left early — practice counted, no XP or loot.</p>`}
          ${reward.levelUps.length > 0 ? `<p class="level-up">LEVEL UP! Now level ${reward.levelUps[reward.levelUps.length - 1]}</p>` : ""}
          ${bar(reward.hero.xp / xpForLevel(reward.hero.level), "bar-xp")}
          ${skillLine ? `<p class="tiny">${skillLine}</p>` : ""}
          ${
            reward.loot
              ? `<div class="loot"><span class="slot">${SLOT_GLYPH[reward.loot.slot]}</span><div><b style="color:${RARITY_COLOR[reward.loot.rarity]}">${escapeHtml(reward.loot.name)}</b><small>${reward.loot.rarity} · item level ${reward.loot.ilvl} · +${reward.loot.value} ${STAT_LABEL[reward.loot.stat]}</small><small>${reward.equipped ? "Equipped — it's an upgrade!" : "Not an upgrade; left behind."}</small></div></div>`
              : ""
          }
        </article>`;
      })
      .join("");

    const practiceRows = played
      .map((h) => {
        const p = h.practice;
        return `<tr><th>${escapeHtml(h.hero.name)}</th><td>${p.touches}</td><td>${p.passes}</td><td>${p.receptions}</td><td>${p.topPassSpeed > 0 ? (p.topPassSpeed * FPS_TO_MPH).toFixed(1) : "–"}</td><td>${Math.round(p.distanceFt)}</td><td>${h.runtime.tally.hitsTaken}</td></tr>`;
      })
      .join("");

    const el = this.screen(
      `
      <header class="screen-head">
        <div>
          <h1>${result.completed ? "Victory!" : "Adventure ended"}</h1>
          <p class="lede">${escapeHtml(result.adventure.name)} ${result.completed ? stars(summary.stars) : ""}</p>
        </div>
        ${summary.streak !== null ? `<div class="streak">🔥 ${summary.streak} day streak</div>` : ""}
      </header>
      <div class="rewards">${rewardCards || `<p class="hint">No one took a shift, so there is nothing to report.</p>`}</div>
      <section class="panel">
        <h2>Practice report <small>What that fight really was</small></h2>
        <table class="report">
          <thead><tr><th></th><th>Dribble touches</th><th>Passes</th><th>Clean catches</th><th>Hardest pass (mph)</th><th>Puck travel (ft)</th><th>Times hit</th></tr></thead>
          <tbody>${practiceRows}</tbody>
        </table>
        <p class="tiny">Heads-up: dodged ${result.dodges} · spells broken ${result.interrupts}${avgReaction !== null ? ` · average ${avgReaction.toFixed(1)} s to read and reach the right stone` : ""} · ${Math.round(result.seconds)} s of active play.</p>
      </section>
      <div class="row row-center">
        <button class="btn" data-act="map" type="button">World map</button>
        <button class="btn btn-primary" data-act="again" type="button">Play again</button>
      </div>`,
      "results"
    );
    el.addEventListener("click", (event) => {
      const act = (event.target as HTMLElement).closest<HTMLElement>("[data-act]")?.dataset.act;
      if (act === "map") this.showMap();
      else if (act === "again") void this.startAdventure(result.adventure);
    });
  }

  // ----------------------------------------------------------- calibration

  private showCalibration(): void {
    new CalibrationScreen(this.root, this.cal, this.getTracker(), this.cameraRunning, (cal, cameraRunning) => {
      this.cameraRunning = cameraRunning;
      if (cal) {
        this.cal = cal;
        saveCalibration(cal);
      }
      this.getTracker().color = this.cal.color;
      this.showTavern();
    });
  }
}
