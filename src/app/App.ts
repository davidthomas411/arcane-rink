import { Game, type GameRunSummary } from "../game/Game";
import { applyRunXp, calculateRunXp, getLevelProgress } from "../game/ProgressionSystem";
import {
  getThreatEventMilestone,
  getThreatProgressionState,
  type ThreatEventMilestone
} from "../game/ThreatProgression";
import {
  applyLootRewards,
  collectLevelUnlockRewards,
  cosmeticLabel,
  cosmeticShortLabel,
  cosmeticsForSlot,
  rollRunDropReward,
  type CosmeticSlotKey,
  type LootReward
} from "../game/Rewards";
import {
  CLASS_OPTIONS,
  classLabel,
  type ClassId,
  type EquippedCosmetics,
  type Profile,
  type StylePreset
} from "../models/Profile";
import { ProfileManager } from "../profiles/ProfileManager";
import {
  createArcaneScoreboard,
  setArcaneScoreboardScore
} from "../ui/ArcaneScoreboard";
import playerAPortraitUrl from "../../tmp/A.png";
import playerKPortraitUrl from "../../tmp/k.png";
import goblinPortraitUrl from "../../tmp/G.png";

type ScreenMode = "profiles" | "play" | "results" | "customize" | "transition";

type RunOutcome = {
  summary: GameRunSummary;
  profileBefore: Profile;
  profileAfter: Profile;
  xpGained: number;
  levelUps: number[];
  rewards: LootReward[];
};

type AppWindow = Window & {
  __arcaneRinkApp?: AppController;
};

function cloneProfile(profile: Profile): Profile {
  return {
    ...profile,
    perks: [...profile.perks],
    unlockedCosmetics: [...profile.unlockedCosmetics],
    equippedCosmetics: { ...profile.equippedCosmetics },
    stats: { ...profile.stats }
  };
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function formatClock(seconds: number): string {
  const total = Math.max(0, Math.round(seconds));
  const mins = Math.floor(total / 60)
    .toString()
    .padStart(2, "0");
  const secs = (total % 60).toString().padStart(2, "0");
  return `${mins}:${secs}`;
}

function playerPortraitUrlForProfile(profile: Profile): string {
  const name = profile.displayName.trim().toUpperCase();
  if (name === "KT" || name.startsWith("KT ") || name.startsWith("K")) {
    return playerKPortraitUrl;
  }
  return playerAPortraitUrl;
}

function loadoutSummary(profile: Profile): { helmet: string; stick: string; gloves: string } {
  return {
    helmet: cosmeticShortLabel(profile.equippedCosmetics.helmet),
    stick: cosmeticShortLabel(profile.equippedCosmetics.stick),
    gloves: cosmeticShortLabel(profile.equippedCosmetics.gloves)
  };
}

function slotTitle(slot: CosmeticSlotKey): string {
  switch (slot) {
    case "helmet":
      return "Helmet";
    case "stick":
      return "Stick";
    case "gloves":
      return "Gloves";
    case "trail":
      return "Trail";
    case "targetSkin":
      return "Gate Skin";
    default:
      return slot;
  }
}

class AppController {
  private readonly root: HTMLElement;
  private readonly shell: HTMLDivElement;
  private readonly canvas: HTMLCanvasElement;
  private readonly gameOverlay: HTMLDivElement;
  private readonly screenLayer: HTMLDivElement;

  private readonly profileManager = new ProfileManager();
  private activeProfile: Profile | null = null;
  private mode: ScreenMode = "profiles";
  private game: Game | null = null;
  private lastOutcome: RunOutcome | null = null;
  private customizeReturnMode: "profiles" | "play" | "results" = "profiles";
  private readonly trainingCompletedProfileIds = new Set<string>();
  private activePlaySessionKind: "match" | "training" | "spell_demo" = "match";
  private pendingTransitionTimeoutId: number | null = null;
  private pendingTransitionIntervalId: number | null = null;
  private pendingTransitionToken = 0;

  constructor(root: HTMLElement) {
    this.root = root;
    this.activeProfile = this.profileManager.getActiveProfile();

    this.root.innerHTML = "";

    this.shell = document.createElement("div");
    this.shell.className = "app-shell";

    this.canvas = document.createElement("canvas");
    this.canvas.className = "game-canvas";
    this.canvas.setAttribute("aria-label", "Arcane Rink game canvas");

    this.gameOverlay = document.createElement("div");
    this.gameOverlay.className = "hud-overlay";

    this.screenLayer = document.createElement("div");
    this.screenLayer.className = "screen-layer";

    this.shell.append(this.canvas, this.gameOverlay, this.screenLayer);
    this.root.append(this.shell);

    if (this.activeProfile) {
      this.startPlay();
    } else {
      this.showProfiles();
    }
  }

  destroy(): void {
    this.clearPendingTransition();
    this.stopGame();
    this.screenLayer.replaceChildren();
    this.root.innerHTML = "";
  }

  private showProfiles(): void {
    this.mode = "profiles";
    this.clearPendingTransition();
    this.stopGame();
    this.renderProfilesScreen();
  }

  private showCustomize(returnMode: "profiles" | "play" | "results"): void {
    if (!this.activeProfile) {
      this.showProfiles();
      return;
    }
    this.customizeReturnMode = returnMode;
    this.mode = "customize";
    this.clearPendingTransition();
    this.stopGame();
    this.renderCustomizeScreen();
  }

  private startPlay(options?: {
    forceTraining?: boolean;
    forceSpellDemo?: boolean;
    skipAutoTraining?: boolean;
    skipThreatEvent?: boolean;
  }): void {
    if (!this.activeProfile) {
      this.showProfiles();
      return;
    }

    const profile = this.activeProfile;
    const spellDemoMode = options?.forceSpellDemo === true;
    const shouldAutoTraining =
      !spellDemoMode &&
      options?.forceTraining !== true &&
      options?.skipAutoTraining !== true &&
      profile.stats.runs === 0 &&
      !this.trainingCompletedProfileIds.has(profile.id);
    const trainingMode = !spellDemoMode && (options?.forceTraining === true || shouldAutoTraining);
    this.activePlaySessionKind = spellDemoMode ? "spell_demo" : trainingMode ? "training" : "match";

    if (!spellDemoMode && !trainingMode && options?.skipThreatEvent !== true) {
      const threatEvent = getThreatEventMilestone(profile.stats.runs);
      if (threatEvent) {
        this.showThreatEventTransition(threatEvent);
        return;
      }
    }

    this.mode = "play";
    this.lastOutcome = null;
    this.clearPendingTransition();
    this.screenLayer.replaceChildren();

    this.stopGame();
    this.game = new Game({
      mount: this.shell,
      canvas: this.canvas,
      overlay: this.gameOverlay,
      playerDisplayName: profile.displayName,
      playerRunCount: profile.stats.runs,
      trainingMode,
      spellDemoMode,
      playerLoadoutSummary: loadoutSummary(profile),
      onRunComplete: (summary) => {
        this.handleRunComplete(summary);
      }
    });
    this.game.start();

    this.renderPlayChrome();
  }

  private stopGame(): void {
    if (!this.game) {
      return;
    }
    this.game.destroy();
    this.game = null;
    this.gameOverlay.replaceChildren();
  }

  private handleRunComplete(summary: GameRunSummary): void {
    if (!this.activeProfile) {
      return;
    }

    if (summary.trainingMode) {
      this.trainingCompletedProfileIds.add(this.activeProfile.id);
      this.showTrainingToMatchTransition(summary);
      return;
    }

    const before = cloneProfile(this.activeProfile);

    const statsApplied: Profile = {
      ...before,
      stats: {
        ...before.stats,
        runs: before.stats.runs + 1,
        bestScore: Math.max(before.stats.bestScore, summary.score),
        bestCombo: Math.max(before.stats.bestCombo, summary.bestCombo),
        totalHits: before.stats.totalHits + summary.hits,
        totalPerfects: before.stats.totalPerfects + summary.perfects
      }
    };

    const xpGained = calculateRunXp(summary);
    const xpApplied = applyRunXp(statsApplied, xpGained);

    let after = xpApplied.profile;
    const levelRewards = collectLevelUnlockRewards(xpApplied.previousLevel, xpApplied.newLevel, after);
    after = applyLootRewards(after, levelRewards);

    const runDrop = rollRunDropReward(after, summary);
    const rewards = [...levelRewards];
    if (runDrop) {
      rewards.push(runDrop);
      after = applyLootRewards(after, [runDrop]);
    }

    after = this.profileManager.updateProfile(after.id, after);
    this.activeProfile = after;

    this.lastOutcome = {
      summary,
      profileBefore: before,
      profileAfter: after,
      xpGained,
      levelUps: xpApplied.levelUps,
      rewards
    };

    this.mode = "results";
    this.clearPendingTransition();
    this.stopGame();
    this.renderResultsScreen();
  }

  private clearPendingTransition(): void {
    this.pendingTransitionToken += 1;
    if (this.pendingTransitionTimeoutId !== null) {
      window.clearTimeout(this.pendingTransitionTimeoutId);
      this.pendingTransitionTimeoutId = null;
    }
    if (this.pendingTransitionIntervalId !== null) {
      window.clearInterval(this.pendingTransitionIntervalId);
      this.pendingTransitionIntervalId = null;
    }
  }

  private showTrainingToMatchTransition(summary: GameRunSummary): void {
    if (!this.activeProfile) {
      this.showProfiles();
      return;
    }

    const profile = this.activeProfile;
    this.mode = "transition";
    this.lastOutcome = null;
    this.clearPendingTransition();
    this.stopGame();

    const wrapper = document.createElement("div");
    wrapper.className = "screen-backdrop screen-backdrop--transition";
    wrapper.innerHTML = `
      <div class="screen-panel transition-screen">
        <div class="transition-screen__frame" aria-hidden="true"></div>
        <div class="transition-screen__header">
          <div class="screen-eyebrow">Intermission</div>
          <h1>Training Complete</h1>
          <p class="screen-copy transition-screen__copy">
            The real match is about to begin. Placeholder cutscene screen for future story beats.
          </p>
        </div>

        <div class="transition-matchup" role="group" aria-label="Upcoming match">
          <div class="transition-skater-card transition-skater-card--home">
            <div class="transition-skater-card__label">Home</div>
            <div class="transition-skater-card__portrait-wrap">
              <img src="${playerPortraitUrlForProfile(profile)}" alt="${escapeHtml(profile.displayName)} portrait" />
            </div>
            <div class="transition-skater-card__name">${escapeHtml(profile.displayName)}</div>
            <div class="transition-skater-card__sub">${escapeHtml(classLabel(profile.classId))} • #${escapeHtml(profile.jerseyNumber)}</div>
          </div>

          <div class="transition-versus">
            <div class="transition-versus__plate">Next Match</div>
            <div class="transition-versus__teams">
              <span>${escapeHtml(profile.displayName)}</span>
              <span>vs</span>
              <span>${escapeHtml(summary.monsterTeamName)}</span>
            </div>
            <div class="transition-versus__rules">
              <span>3 Periods</span>
              <span>Win by Goals</span>
              <span>Breach Ends Run</span>
            </div>
            <div class="transition-countdown" data-transition-countdown>
              <div class="transition-countdown__value" data-transition-count>3</div>
              <div class="transition-countdown__sub" data-transition-count-sub>Match starts in</div>
              <div class="transition-countdown__bar"><span data-transition-bar></span></div>
            </div>
            <div class="transition-screen__actions">
              <button type="button" class="ui-btn" data-action="begin-match">Begin Match</button>
            </div>
          </div>

          <div class="transition-skater-card transition-skater-card--away">
            <div class="transition-skater-card__label">Away</div>
            <div class="transition-skater-card__portrait-wrap">
              <img src="${goblinPortraitUrl}" alt="${escapeHtml(summary.monsterTeamName)} portrait" />
            </div>
            <div class="transition-skater-card__name">${escapeHtml(summary.monsterTeamName)}</div>
            <div class="transition-skater-card__sub">Monster Team</div>
          </div>
        </div>

        <div class="transition-screen__footer">
          <div class="transition-chip">Practice hits: ${summary.hits}</div>
          <div class="transition-chip">Best combo: x${summary.bestCombo}</div>
          <div class="transition-chip">Runes in training: ${summary.score.toLocaleString()}</div>
        </div>
      </div>
    `;

    this.screenLayer.replaceChildren(wrapper);

    const countdownValueEl = wrapper.querySelector<HTMLElement>("[data-transition-count]");
    const countdownSubEl = wrapper.querySelector<HTMLElement>("[data-transition-count-sub]");
    const countdownBarEl = wrapper.querySelector<HTMLElement>("[data-transition-bar]");
    const beginButton = wrapper.querySelector<HTMLButtonElement>('[data-action="begin-match"]');

    const durationMs = 3200;
    const startedAt = performance.now();
    const token = this.pendingTransitionToken;
    let finished = false;

      const beginMatch = (): void => {
      if (finished) {
        return;
      }
      finished = true;
      if (token !== this.pendingTransitionToken) {
        return;
      }
      this.startPlay({ skipAutoTraining: true });
    };

    const updateCountdown = (): void => {
      if (token !== this.pendingTransitionToken) {
        return;
      }
      const elapsed = performance.now() - startedAt;
      const remainingMs = Math.max(0, durationMs - elapsed);
      const progress = clamp(elapsed / durationMs, 0, 1);

      let label = "3";
      if (remainingMs <= 250) {
        label = "GO!";
      } else if (remainingMs <= 1000) {
        label = "1";
      } else if (remainingMs <= 2000) {
        label = "2";
      }

      if (countdownValueEl) {
        countdownValueEl.textContent = label;
        countdownValueEl.dataset.phase = label === "GO!" ? "go" : "count";
      }
      if (countdownSubEl) {
        countdownSubEl.textContent = label === "GO!" ? "Drop the puck" : "Match starts in";
      }
      if (countdownBarEl) {
        countdownBarEl.style.width = `${(progress * 100).toFixed(1)}%`;
      }
    };

    updateCountdown();
    this.pendingTransitionIntervalId = window.setInterval(updateCountdown, 80);
    this.pendingTransitionTimeoutId = window.setTimeout(() => {
      if (token !== this.pendingTransitionToken) {
        return;
      }
      beginMatch();
    }, durationMs);

    beginButton?.addEventListener("click", () => {
      if (token !== this.pendingTransitionToken) {
        return;
      }
      beginMatch();
    });
  }

  private showThreatEventTransition(event: ThreatEventMilestone): void {
    if (!this.activeProfile) {
      this.showProfiles();
      return;
    }

    const profile = this.activeProfile;
    this.mode = "transition";
    this.lastOutcome = null;
    this.clearPendingTransition();
    this.stopGame();

    const tierLabel = event.threatTier === 1 ? "I" : String(event.threatTier);
    const title = event.unlocksBreach ? `Rift Event ${tierLabel} • Seal Stress Unleashed` : `Rift Event ${tierLabel} • Threat Escalates`;
    const copy = event.unlocksBreach
      ? "The Rookie Ward has lifted. Misses and monster pressure now crack the Arcane Shield. If the seal breaks, the match ends immediately."
      : "The rift deepens after your recent matches. Monsters will pressure the seal harder and gates may feel less forgiving as the threat tier rises.";

    const wrapper = document.createElement("div");
    wrapper.className = "screen-backdrop screen-backdrop--transition";
    wrapper.innerHTML = `
      <div class="screen-panel transition-screen transition-screen--threat">
        <div class="transition-screen__frame" aria-hidden="true"></div>
        <div class="transition-screen__header">
          <div class="screen-eyebrow">Rift Escalation</div>
          <h1>${escapeHtml(title)}</h1>
          <p class="screen-copy transition-screen__copy">${escapeHtml(copy)}</p>
        </div>

        <div class="transition-matchup" role="group" aria-label="Threat event briefing">
          <div class="transition-skater-card transition-skater-card--home">
            <div class="transition-skater-card__label">Skater</div>
            <div class="transition-skater-card__portrait-wrap">
              <img src="${playerPortraitUrlForProfile(profile)}" alt="${escapeHtml(profile.displayName)} portrait" />
            </div>
            <div class="transition-skater-card__name">${escapeHtml(profile.displayName)}</div>
            <div class="transition-skater-card__sub">Completed runs: ${profile.stats.runs}</div>
          </div>

          <div class="transition-versus">
            <div class="transition-versus__plate">${event.unlocksBreach ? "New Mechanic" : "Tier Up"}</div>
            <div class="transition-versus__teams">
              <span>${event.unlocksBreach ? "Breach Enabled" : "Threat Raised"}</span>
              <span>vs</span>
              <span>${event.unlocksBreach ? "Rookie Ward Removed" : `Rift Tier ${event.threatTier}`}</span>
            </div>
            <div class="transition-versus__rules">
              ${event.unlocksBreach ? "<span>Seal can shatter now</span>" : ""}
              <span>Misses add pressure</span>
              <span>Quick hits stabilize</span>
              <span>Breach ends run</span>
            </div>
            <div class="transition-countdown" data-transition-countdown>
              <div class="transition-countdown__value" data-transition-count>3</div>
              <div class="transition-countdown__sub" data-transition-count-sub>Briefing ends in</div>
              <div class="transition-countdown__bar"><span data-transition-bar></span></div>
            </div>
            <div class="transition-screen__actions">
              <button type="button" class="ui-btn" data-action="begin-match">Start Next Match</button>
            </div>
          </div>

          <div class="transition-skater-card transition-skater-card--away">
            <div class="transition-skater-card__label">Threat</div>
            <div class="transition-skater-card__portrait-wrap">
              <img src="${goblinPortraitUrl}" alt="Goblin threat portrait" />
            </div>
            <div class="transition-skater-card__name">${event.unlocksBreach ? "Seal Breach" : `Rift Tier ${event.threatTier}`}</div>
            <div class="transition-skater-card__sub">
              ${event.unlocksBreach ? "Watch Arcane Shield + Threat meter" : "Monsters press harder"}
            </div>
          </div>
        </div>

        <div class="transition-screen__footer">
          <div class="transition-chip">Milestone reached: ${event.completedRuns} runs</div>
          <div class="transition-chip">Quick hits reduce pressure</div>
          <div class="transition-chip">Late hits help less</div>
        </div>
      </div>
    `;

    this.screenLayer.replaceChildren(wrapper);

    const countdownValueEl = wrapper.querySelector<HTMLElement>("[data-transition-count]");
    const countdownSubEl = wrapper.querySelector<HTMLElement>("[data-transition-count-sub]");
    const countdownBarEl = wrapper.querySelector<HTMLElement>("[data-transition-bar]");
    const beginButton = wrapper.querySelector<HTMLButtonElement>('[data-action="begin-match"]');

    const durationMs = 3800;
    const startedAt = performance.now();
    const token = this.pendingTransitionToken;
    let finished = false;

    const beginMatch = (): void => {
      if (finished) {
        return;
      }
      finished = true;
      if (token !== this.pendingTransitionToken) {
        return;
      }
      this.startPlay({ skipAutoTraining: true, skipThreatEvent: true });
    };

    const updateCountdown = (): void => {
      if (token !== this.pendingTransitionToken) {
        return;
      }
      const elapsed = performance.now() - startedAt;
      const remainingMs = Math.max(0, durationMs - elapsed);
      const progress = clamp(elapsed / durationMs, 0, 1);

      let label = "3";
      if (remainingMs <= 300) {
        label = "GO!";
      } else if (remainingMs <= 1200) {
        label = "1";
      } else if (remainingMs <= 2400) {
        label = "2";
      }

      if (countdownValueEl) {
        countdownValueEl.textContent = label;
        countdownValueEl.dataset.phase = label === "GO!" ? "go" : "count";
      }
      if (countdownSubEl) {
        countdownSubEl.textContent = label === "GO!" ? "Drop the puck" : "Briefing ends in";
      }
      if (countdownBarEl) {
        countdownBarEl.style.width = `${(progress * 100).toFixed(1)}%`;
      }
    };

    updateCountdown();
    this.pendingTransitionIntervalId = window.setInterval(updateCountdown, 80);
    this.pendingTransitionTimeoutId = window.setTimeout(() => {
      if (token !== this.pendingTransitionToken) {
        return;
      }
      beginMatch();
    }, durationMs);

    beginButton?.addEventListener("click", () => {
      if (token !== this.pendingTransitionToken) {
        return;
      }
      beginMatch();
    });
  }

  private renderPlayChrome(): void {
    if (!this.activeProfile) {
      return;
    }

    const profile = this.activeProfile;
    const progress = getLevelProgress(profile.xp);
    const isTraining = this.activePlaySessionKind === "training";
    const isSpellDemo = this.activePlaySessionKind === "spell_demo";

    this.screenLayer.innerHTML = `
      <div class="ui-float-bar">
        <div class="ui-float-meta">
          <div class="ui-float-title">${escapeHtml(profile.displayName)} <span>#${escapeHtml(profile.jerseyNumber)}</span></div>
          <div class="ui-float-sub">${escapeHtml(classLabel(profile.classId))} • Lv ${profile.level} • ${progress.xpIntoLevel}/${progress.xpToNextLevel} XP${
            isSpellDemo ? " • Spell Demo" : isTraining ? " • Training Mode" : ""
          }</div>
        </div>
        <div class="ui-float-actions">
          <button type="button" class="ui-btn ui-btn-ghost" data-action="profiles">Profiles</button>
          <button type="button" class="ui-btn ui-btn-ghost" data-action="customize">Customize</button>
          <button type="button" class="ui-btn ui-btn-ghost" data-action="training">Training</button>
          <button type="button" class="ui-btn ui-btn-ghost" data-action="spell-demo">${isSpellDemo ? "Back To Match" : "Spell Demo"}</button>
          <button type="button" class="ui-btn" data-action="restart">${
            isSpellDemo ? "Reset Demo" : isTraining ? "Restart Training" : "Restart Run"
          }</button>
          <button
            type="button"
            class="ui-btn ui-btn-ghost ui-btn-icon"
            data-action="howto-toggle"
            aria-label="How to play"
            aria-haspopup="dialog"
            aria-expanded="false"
          >?</button>
        </div>
      </div>
      <div class="ui-help-overlay" data-ui-help-overlay hidden>
        <section class="ui-help-popover" role="dialog" aria-modal="false" aria-labelledby="howto-title">
          <div class="ui-help-popover__head">
            <div>
              <div class="ui-help-popover__eyebrow">How To Play</div>
              <h2 id="howto-title">Arcane Rink Match Flow</h2>
            </div>
            <button type="button" class="ui-btn ui-btn-ghost ui-btn-icon" data-action="howto-close" aria-label="Close help">x</button>
          </div>
          <div class="ui-help-popover__body">
            <p><strong>Goal:</strong> Win the hockey match over <strong>3 periods</strong> by scoring more goals than the monster team before the final horn.</p>
            <p><strong>Offense:</strong> Quick hits on rune gates build your <strong>shot charge</strong>. Fill it to trigger a shot attempt and score.</p>
            <p><strong>Defense:</strong> When monsters have the puck, quick hits build <strong>takeaway charge</strong>. Fill it to win possession back.</p>
            <p><strong>Spell Demo:</strong> Use <strong>Spell Demo</strong> to loop faceoff rune casts at a slower pace. Practice tracing and center snap timing without match pressure.</p>
            <p><strong>Combo rule:</strong> Only hits in the <strong>first half</strong> of a gate timer build combo. Late hits still help a little, but they break the chain.</p>
            <p><strong>Rookie ward:</strong> Your first few matches are protected while you learn. After a milestone briefing, seal breach risk turns on and threat tiers begin escalating.</p>
            <p><strong>Difficulty arc:</strong> <strong>Period 1</strong> is forgiving, <strong>Period 2</strong> increases gate speed/pressure, and <strong>Period 3</strong> is the final push with tougher gates. If you get far ahead, monsters surge harder; if you fall behind, the game gives a small comeback assist.</p>
            <p><strong>Breach fail:</strong> If <strong>Arcane Shield</strong> hits zero, the seal breaks and the run ends immediately.</p>
            <p><strong>Controls:</strong> Move the puck/reticle into gates. Press <kbd>R</kbd> after a run ends to restart.</p>
          </div>
        </section>
      </div>
    `;

    this.screenLayer.querySelector<HTMLButtonElement>('[data-action="profiles"]')?.addEventListener("click", () => {
      this.showProfiles();
    });
    this.screenLayer.querySelector<HTMLButtonElement>('[data-action="customize"]')?.addEventListener("click", () => {
      this.showCustomize("play");
    });
    this.screenLayer.querySelector<HTMLButtonElement>('[data-action="restart"]')?.addEventListener("click", () => {
      this.startPlay({
        forceTraining: isTraining,
        forceSpellDemo: isSpellDemo,
        skipAutoTraining: !isTraining && !isSpellDemo,
        skipThreatEvent: true
      });
    });
    this.screenLayer.querySelector<HTMLButtonElement>('[data-action="training"]')?.addEventListener("click", () => {
      this.startPlay({ forceTraining: true, skipAutoTraining: true, skipThreatEvent: true });
    });
    this.screenLayer.querySelector<HTMLButtonElement>('[data-action="spell-demo"]')?.addEventListener("click", () => {
      if (isSpellDemo) {
        this.startPlay({ skipAutoTraining: true, skipThreatEvent: true });
        return;
      }
      this.startPlay({ forceSpellDemo: true, skipAutoTraining: true, skipThreatEvent: true });
    });
    const helpToggle = this.screenLayer.querySelector<HTMLButtonElement>('[data-action="howto-toggle"]');
    const helpClose = this.screenLayer.querySelector<HTMLButtonElement>('[data-action="howto-close"]');
    const helpOverlay = this.screenLayer.querySelector<HTMLDivElement>("[data-ui-help-overlay]");
    const setHelpOpen = (open: boolean): void => {
      if (!helpOverlay || !helpToggle) {
        return;
      }
      helpOverlay.hidden = !open;
      helpToggle.setAttribute("aria-expanded", open ? "true" : "false");
      helpToggle.classList.toggle("is-active", open);
    };
    helpToggle?.addEventListener("click", () => {
      const willOpen = helpOverlay?.hidden ?? true;
      setHelpOpen(willOpen);
    });
    helpClose?.addEventListener("click", () => {
      setHelpOpen(false);
    });
    helpOverlay?.addEventListener("click", (event) => {
      if (event.target === helpOverlay) {
        setHelpOpen(false);
      }
    });
  }

  private renderProfilesScreen(): void {
    const profiles = this.profileManager.listProfiles();
    const wrapper = document.createElement("div");
    wrapper.className = "screen-backdrop";

    const cards = profiles
      .map((profile) => {
        const isActive = this.activeProfile?.id === profile.id;
        return `
          <button type="button" class="profile-card ${isActive ? "is-active" : ""}" data-profile-id="${escapeHtml(profile.id)}">
            <div class="profile-card-name">${escapeHtml(profile.displayName)} <span>#${escapeHtml(profile.jerseyNumber)}</span></div>
            <div class="profile-card-sub">${escapeHtml(classLabel(profile.classId))} • Lv ${profile.level} • ${profile.xp} XP</div>
            <div class="profile-card-stats">
              <span>Best ${profile.stats.bestScore.toLocaleString()}</span>
              <span>Combo x${profile.stats.bestCombo}</span>
              <span>Runs ${profile.stats.runs}</span>
            </div>
          </button>
        `;
      })
      .join("");

    wrapper.innerHTML = `
      <div class="screen-panel profile-screen">
        <div class="screen-eyebrow">Arcane Rink</div>
        <h1>Profiles</h1>
        <p class="screen-copy">Select a skater profile or create a new one. Progress, XP, and rewards persist locally on this device.</p>

        <div class="profile-grid">
          <section class="profile-list">
            <h2>Roster</h2>
            ${cards || '<div class="empty-state">No profiles yet. Create one to start playing.</div>'}
          </section>

          <section class="profile-create">
            <h2>Create Profile</h2>
            <form id="create-profile-form" class="stack-form">
              <label>
                <span>Hockey Name</span>
                <input name="displayName" type="text" maxlength="20" placeholder="Rink Wizard" required />
              </label>
              <label>
                <span>Jersey Number</span>
                <input name="jerseyNumber" type="text" inputmode="numeric" maxlength="3" placeholder="27" required />
              </label>
              <label>
                <span>Class</span>
                <select name="classId">
                  ${CLASS_OPTIONS.map((option) => `<option value="${option.id}">${option.label}</option>`).join("")}
                </select>
              </label>
              <button type="submit" class="ui-btn ui-btn-wide">Create and Play</button>
            </form>
          </section>
        </div>

        <div class="screen-actions">
          ${
            this.activeProfile
              ? '<button type="button" class="ui-btn ui-btn-ghost" data-action="customize-active">Customize Active</button>'
              : ""
          }
        </div>
      </div>
    `;

    this.screenLayer.replaceChildren(wrapper);

    this.screenLayer.querySelectorAll<HTMLButtonElement>("[data-profile-id]").forEach((button) => {
      button.addEventListener("click", () => {
        const id = button.dataset.profileId;
        if (!id) {
          return;
        }
        const selected = this.profileManager.selectProfile(id);
        if (!selected) {
          return;
        }
        this.activeProfile = selected;
        this.startPlay();
      });
    });

    this.screenLayer
      .querySelector<HTMLButtonElement>('[data-action="customize-active"]')
      ?.addEventListener("click", () => {
        this.showCustomize("profiles");
      });

    const form = this.screenLayer.querySelector<HTMLFormElement>("#create-profile-form");
    form?.addEventListener("submit", (event) => {
      event.preventDefault();
      const formData = new FormData(form);
      const displayName = String(formData.get("displayName") ?? "")
        .trim()
        .slice(0, 20);
      const jerseyNumber = String(formData.get("jerseyNumber") ?? "")
        .replace(/[^\d]/g, "")
        .slice(0, 3);
      const classIdRaw = String(formData.get("classId") ?? "BLADEMASTER");
      const classId: ClassId =
        classIdRaw === "FROST_WARDEN" || classIdRaw === "SHADOW_ROGUE" ? classIdRaw : "BLADEMASTER";

      if (!displayName) {
        return;
      }

      this.activeProfile = this.profileManager.createAndSelectProfile({
        displayName,
        jerseyNumber: jerseyNumber || "00",
        classId
      });
      this.startPlay();
    });
  }

  private renderCustomizeScreen(): void {
    const profile = this.activeProfile;
    if (!profile) {
      this.showProfiles();
      return;
    }

    const slotOrder: CosmeticSlotKey[] = ["helmet", "stick", "gloves", "trail", "targetSkin"];
    const portraitUrl = playerPortraitUrlForProfile(profile);
    const returnMode = this.customizeReturnMode;
    const returnLabel =
      returnMode === "play" ? "Return to Play" : returnMode === "results" ? "Back to Results" : "Back to Profiles";
    const styleOptions: StylePreset[] = ["ARCANE", "FROST", "FEL"];

    const slotFieldsHtml = slotOrder
      .map((slot) => {
        const unlocked = cosmeticsForSlot(slot).filter((id) => profile.unlockedCosmetics.includes(id));
        const equippedId = profile.equippedCosmetics[slot];
        const lockedCount = Math.max(0, cosmeticsForSlot(slot).length - unlocked.length);
        return `
          <label class="loadout-slot">
            <span class="loadout-slot__label">${slotTitle(slot)}</span>
            <select name="slot-${slot}">
              ${unlocked
                .map(
                  (id) =>
                    `<option value="${id}" ${equippedId === id ? "selected" : ""}>${escapeHtml(cosmeticShortLabel(id))}</option>`
                )
                .join("")}
            </select>
            <span class="loadout-slot__meta">${unlocked.length} unlocked${lockedCount > 0 ? ` • ${lockedCount} locked` : ""}</span>
          </label>
        `;
      })
      .join("");

    const inventoryGroupsHtml = slotOrder
      .map((slot) => {
        const items = cosmeticsForSlot(slot);
        const equippedId = profile.equippedCosmetics[slot];
        const chips = items
          .map((id) => {
            const unlocked = profile.unlockedCosmetics.includes(id);
            const classes = [
              "loadout-chip",
              unlocked ? "is-unlocked" : "is-locked",
              equippedId === id ? "is-equipped" : ""
            ]
              .filter(Boolean)
              .join(" ");
            return `<span class="${classes}">${escapeHtml(cosmeticShortLabel(id))}</span>`;
          })
          .join("");
        return `
          <div class="loadout-inventory-group">
            <div class="loadout-inventory-group__title">${slotTitle(slot)}</div>
            <div class="loadout-chip-row">${chips}</div>
          </div>
        `;
      })
      .join("");

    const wrapper = document.createElement("div");
    wrapper.className = "screen-backdrop";
    wrapper.innerHTML = `
      <div class="screen-panel customize-screen">
        <div class="screen-eyebrow">Customize Hero</div>
        <h1>${escapeHtml(profile.displayName)} #${escapeHtml(profile.jerseyNumber)}</h1>
        <p class="screen-copy customize-copy">
          Equip unlocked gear and rune cosmetics. ${
            returnMode === "play" ? "Returning to play will start a fresh run." : "Changes are saved to this profile."
          }
        </p>

        <div class="customize-grid">
          <section class="customize-preview">
            <div class="customize-preview__portrait-wrap">
              <img class="customize-preview__portrait" src="${portraitUrl}" alt="${escapeHtml(profile.displayName)} portrait" />
              <div class="customize-preview__tag">Current Loadout</div>
            </div>
            <div class="customize-preview__meta">
              <div><span>Class</span><strong>${escapeHtml(classLabel(profile.classId))}</strong></div>
              <div><span>Style</span><strong>${escapeHtml(profile.stylePreset)}</strong></div>
              <div><span>Helmet</span><strong>${escapeHtml(cosmeticShortLabel(profile.equippedCosmetics.helmet))}</strong></div>
              <div><span>Stick</span><strong>${escapeHtml(cosmeticShortLabel(profile.equippedCosmetics.stick))}</strong></div>
              <div><span>Gloves</span><strong>${escapeHtml(cosmeticShortLabel(profile.equippedCosmetics.gloves))}</strong></div>
            </div>
          </section>

          <section class="customize-controls">
            <form id="customize-loadout-form" class="stack-form customize-form">
              <label class="loadout-slot">
                <span class="loadout-slot__label">Arena Style</span>
                <select name="stylePreset">
                  ${styleOptions
                    .map(
                      (value) => `<option value="${value}" ${profile.stylePreset === value ? "selected" : ""}>${value}</option>`
                    )
                    .join("")}
                </select>
                <span class="loadout-slot__meta">Profile visual theme preset</span>
              </label>

              <div class="customize-slot-grid">
                ${slotFieldsHtml}
              </div>

              <div class="screen-actions customize-actions">
                <button type="button" class="ui-btn ui-btn-ghost" data-action="customize-back">${returnLabel}</button>
                <button type="submit" class="ui-btn">Save Loadout</button>
              </div>
            </form>
          </section>
        </div>

        <section class="customize-inventory">
          <h2>Unlocked + Locked Gear</h2>
          <div class="customize-inventory-grid">${inventoryGroupsHtml}</div>
        </section>
      </div>
    `;

    this.screenLayer.replaceChildren(wrapper);

    const goBack = (): void => {
      if (this.customizeReturnMode === "play") {
        this.startPlay();
      } else if (this.customizeReturnMode === "results" && this.lastOutcome) {
        this.mode = "results";
        this.renderResultsScreen();
      } else {
        this.showProfiles();
      }
    };

    this.screenLayer.querySelector<HTMLButtonElement>('[data-action="customize-back"]')?.addEventListener("click", () => {
      goBack();
    });

    const form = this.screenLayer.querySelector<HTMLFormElement>("#customize-loadout-form");
    form?.addEventListener("submit", (event) => {
      event.preventDefault();
      const current = this.activeProfile;
      if (!current) {
        this.showProfiles();
        return;
      }
      const data = new FormData(form);
      const nextEquipped: EquippedCosmetics = { ...current.equippedCosmetics };
      for (const slot of slotOrder) {
        const raw = String(data.get(`slot-${slot}`) ?? "");
        if (!raw) {
          continue;
        }
        const available = cosmeticsForSlot(slot).filter((id) => current.unlockedCosmetics.includes(id));
        if (available.includes(raw as (typeof available)[number])) {
          switch (slot) {
            case "helmet":
              nextEquipped.helmet = raw as EquippedCosmetics["helmet"];
              break;
            case "stick":
              nextEquipped.stick = raw as EquippedCosmetics["stick"];
              break;
            case "gloves":
              nextEquipped.gloves = raw as EquippedCosmetics["gloves"];
              break;
            case "trail":
              nextEquipped.trail = raw as EquippedCosmetics["trail"];
              break;
            case "targetSkin":
              nextEquipped.targetSkin = raw as EquippedCosmetics["targetSkin"];
              break;
          }
        }
      }
      const stylePresetRaw = String(data.get("stylePreset") ?? current.stylePreset);
      const stylePreset: StylePreset =
        stylePresetRaw === "FROST" || stylePresetRaw === "FEL" ? stylePresetRaw : "ARCANE";

      const updated = this.profileManager.updateProfile(current.id, {
        ...current,
        stylePreset,
        equippedCosmetics: nextEquipped
      });
      this.activeProfile = updated;
      goBack();
    });
  }

  private renderResultsScreen(): void {
    const outcome = this.lastOutcome;
    const profile = this.activeProfile;
    if (!outcome || !profile) {
      this.showProfiles();
      return;
    }

    const beforeProgress = getLevelProgress(outcome.profileBefore.xp);
    const afterProgress = getLevelProgress(outcome.profileAfter.xp);
    const progressPct = (afterProgress.xpIntoLevel / Math.max(1, afterProgress.xpToNextLevel)) * 100;
    const failedByBreach = outcome.summary.endReason === "breach";
    const hasMatchScore = typeof outcome.summary.playerGoals === "number" && typeof outcome.summary.enemyGoals === "number";
    const finalMatchScore = hasMatchScore ? `${outcome.summary.playerGoals}-${outcome.summary.enemyGoals}` : null;
    const opponentName = "monsterTeamName" in outcome.summary ? outcome.summary.monsterTeamName : null;
    const matchResult = "matchResult" in outcome.summary ? outcome.summary.matchResult : null;
    const resultTitle = failedByBreach
      ? "Game Over"
      : matchResult === "win"
        ? "Victory"
        : matchResult === "loss"
          ? "Defeat"
          : matchResult === "tie"
            ? "Draw"
            : "Results";
    const resultCopy = failedByBreach
      ? "Seal shattered before the final horn. Progress from this run was saved."
      : matchResult === "win"
        ? "Monster team defeated. Progress and rewards saved."
        : matchResult === "loss"
          ? "Monster team wins this one. Progress from the run was saved."
          : "Match complete. Progress and rewards saved.";
    const timeLabel = failedByBreach ? "Survived" : "Duration";
    const periodSummary =
      "periodScores" in outcome.summary && Array.isArray(outcome.summary.periodScores)
        ? outcome.summary.periodScores
            .map((period) => `P${period.period} ${period.playerGoals}-${period.enemyGoals}`)
            .join(" • ")
        : "";
    const scoreboardHome = hasMatchScore ? outcome.summary.playerGoals : Math.max(0, Math.floor(outcome.summary.score / 1000));
    const scoreboardGuest = hasMatchScore ? outcome.summary.enemyGoals : 0;
    const scoreboardClock = formatClock(outcome.summary.elapsedSec);
    const scoreboardOutcomeLabel = failedByBreach
      ? "Seal Broken"
      : matchResult === "win"
        ? "Final • Victory"
        : matchResult === "loss"
          ? "Final • Defeat"
          : matchResult === "tie"
            ? "Final • Draw"
            : "Final";
    const scoreboardThreatLabel = failedByBreach
      ? "Threat: Breach"
      : matchResult === "loss"
        ? "Threat: High"
        : matchResult === "tie"
          ? "Threat: Rising"
          : outcome.summary.breaches > 0
            ? "Threat: Cracking"
            : "Threat: Stable";
    const scoreboardThreatFill = clamp(
      failedByBreach
        ? 1
        : 0.16 + outcome.summary.breaches * 0.22 + (matchResult === "loss" ? 0.2 : matchResult === "tie" ? 0.1 : 0),
      0.1,
      1
    );
    const scoreboardShieldFill = clamp(
      failedByBreach ? 0.03 : 0.94 - scoreboardThreatFill * 0.72 + (matchResult === "win" ? 0.05 : 0),
      0.03,
      0.98
    );
    const periodIndicator = clamp(
      Math.ceil(outcome.summary.elapsedSec / Math.max(1, outcome.summary.durationSec / 3)),
      1,
      3
    );
    const scoreboardPeriodRail = failedByBreach ? `Period ${periodIndicator}` : "Period 3";
    const scoreboardStateClass = failedByBreach
      ? "is-breach"
      : matchResult === "win"
        ? "is-win"
        : matchResult === "loss"
          ? "is-loss"
          : "is-tie";
    const rewardHtml =
      outcome.rewards.length > 0
        ? outcome.rewards
            .map(
              (reward) => `
                <div class="loot-pill ${reward.source === "level_unlock" ? "is-level" : "is-drop"}">
                  <span class="loot-source">${reward.source === "level_unlock" ? "Level Up" : "Run Drop"}</span>
                  <strong>${escapeHtml(cosmeticLabel(reward.id))}</strong>
                </div>
              `
            )
            .join("")
        : '<div class="empty-state">No loot this run. Higher combo and more perfects increase drop chance.</div>';
    const visibleRewardCount = 3;
    const rewardCompactHtml =
      outcome.rewards.length > 0
        ? [
            ...outcome.rewards.slice(0, visibleRewardCount).map(
              (reward) => `
                <div class="loot-pill ${reward.source === "level_unlock" ? "is-level" : "is-drop"}">
                  <span class="loot-source">${reward.source === "level_unlock" ? "Level" : "Drop"}</span>
                  <strong>${escapeHtml(cosmeticLabel(reward.id))}</strong>
                </div>
              `
            ),
            outcome.rewards.length > visibleRewardCount
              ? `<div class="loot-pill loot-pill-more"><span class="loot-source">More</span><strong>+${
                  outcome.rewards.length - visibleRewardCount
                } unlock${outcome.rewards.length - visibleRewardCount === 1 ? "" : "s"}</strong></div>`
              : ""
          ].join("")
        : '<div class="empty-state empty-state-compact">No loot this run.</div>';
    const perkPointsEarned = outcome.levelUps.length;
    const profileTotalsLine = `Runs ${profile.stats.runs} • Best ${profile.stats.bestScore.toLocaleString()} • Best Combo x${
      profile.stats.bestCombo
    } • Cosmetics ${profile.unlockedCosmetics.length}`;
    const playerPortraitUrl = playerPortraitUrlForProfile(profile);
    const perfectRatePct = outcome.summary.hits > 0 ? Math.round((outcome.summary.perfects / outcome.summary.hits) * 100) : 0;
    const threatProgress = getThreatProgressionState(profile.stats.runs);
    const headlineBadges: Array<{ sigil: string; label: string; tone: "win" | "loss" | "breach" | "neutral" | "gold" }> = [];
    headlineBadges.push({
      sigil: failedByBreach ? "BR" : matchResult === "win" ? "WN" : matchResult === "loss" ? "LS" : "DR",
      label: failedByBreach ? "Seal Broken" : matchResult === "win" ? "Monster Team Defeated" : matchResult === "loss" ? "Monster Team Holds" : "Split Decision",
      tone: failedByBreach ? "breach" : matchResult === "win" ? "win" : matchResult === "loss" ? "loss" : "neutral"
    });
    if (outcome.summary.bestCombo >= 8) {
      headlineBadges.push({ sigil: "CH", label: "Hot Quick Chain", tone: "gold" });
    } else if (outcome.summary.bestCombo >= 4) {
      headlineBadges.push({ sigil: "CB", label: `Chain x${outcome.summary.bestCombo}`, tone: "neutral" });
    }
    if (outcome.summary.hits >= 8 && perfectRatePct >= 35) {
      headlineBadges.push({ sigil: "PF", label: `Precision ${perfectRatePct}%`, tone: "gold" });
    } else if (!failedByBreach && outcome.summary.breaches === 0) {
      headlineBadges.push({ sigil: "SD", label: "Seal Held", tone: "win" });
    } else if (outcome.summary.breaches > 0) {
      headlineBadges.push({ sigil: "RF", label: `${outcome.summary.breaches} Rift Scar${outcome.summary.breaches === 1 ? "" : "s"}`, tone: "breach" });
    }
    const headlineBadgeHtml = headlineBadges
      .slice(0, 3)
      .map(
        (badge) => `
          <div class="results-ribbon results-ribbon--${badge.tone}">
            <span class="results-ribbon__sigil">${badge.sigil}</span>
            <span class="results-ribbon__label">${escapeHtml(badge.label)}</span>
          </div>
        `
      )
      .join("");

    const periodCardsHtml =
      outcome.summary.periodScores.length > 0
        ? outcome.summary.periodScores
            .map((period) => {
              const diff = period.playerGoals - period.enemyGoals;
              const periodClass = diff > 0 ? "is-win" : diff < 0 ? "is-loss" : "is-tie";
              const tone = diff > 0 ? "Push" : diff < 0 ? "Under Siege" : "Even Ice";
              return `
                <div class="results-period-card ${periodClass}">
                  <span class="results-period-card__label">P${period.period}</span>
                  <strong class="results-period-card__score">${period.playerGoals}-${period.enemyGoals}</strong>
                  <span class="results-period-card__tone">${tone}</span>
                </div>
              `;
            })
            .join("")
        : `
          <div class="results-period-card is-tie">
            <span class="results-period-card__label">Match</span>
            <strong class="results-period-card__score">${finalMatchScore ?? outcome.summary.score.toLocaleString()}</strong>
            <span class="results-period-card__tone">Complete</span>
          </div>
        `;

    const summaryTiles = [
      { sigil: "HT", label: "Hits", value: String(outcome.summary.hits), tone: "ice" },
      { sigil: "PF", label: "Perfects", value: String(outcome.summary.perfects), tone: "gold" },
      { sigil: "AC", label: "Accuracy", value: `${perfectRatePct}%`, tone: "neutral" },
      { sigil: "CB", label: "Best Chain", value: `x${outcome.summary.bestCombo}`, tone: "arcane" },
      { sigil: "TM", label: timeLabel, value: `${outcome.summary.elapsedSec.toFixed(1)}s`, tone: "neutral" },
      { sigil: "RN", label: "Runes", value: outcome.summary.score.toLocaleString(), tone: "gold" },
      {
        sigil: "RT",
        label: "Threat",
        value: failedByBreach ? "Breach" : outcome.summary.breaches > 0 ? `Scars ${outcome.summary.breaches}` : "Stable",
        tone: failedByBreach ? "breach" : outcome.summary.breaches > 0 ? "warn" : "win"
      },
      {
        sigil: "GO",
        label: hasMatchScore ? "Goals" : "Result",
        value: hasMatchScore ? (finalMatchScore ?? "0-0") : resultTitle,
        tone: matchResult === "win" ? "win" : matchResult === "loss" || failedByBreach ? "loss" : "neutral"
      }
    ];
    const summaryTilesHtml = summaryTiles
      .map(
        (tile) => `
          <div class="results-stat-tile results-stat-tile--${tile.tone}">
            <span class="results-stat-tile__sigil">${tile.sigil}</span>
            <span class="results-stat-tile__label">${escapeHtml(tile.label)}</span>
            <strong class="results-stat-tile__value">${escapeHtml(tile.value)}</strong>
          </div>
        `
      )
      .join("");

    const rewardGalleryHtml =
      outcome.rewards.length > 0
        ? [
            ...outcome.rewards.slice(0, 4).map((reward) => {
              const isLevel = reward.source === "level_unlock";
              return `
                <div class="results-loot-card ${isLevel ? "is-level" : "is-drop"}">
                  <span class="results-loot-card__sigil">${isLevel ? "LV" : "DR"}</span>
                  <span class="results-loot-card__source">${isLevel ? "Level Unlock" : "Run Drop"}</span>
                  <strong class="results-loot-card__name">${escapeHtml(cosmeticShortLabel(reward.id))}</strong>
                </div>
              `;
            }),
            outcome.rewards.length > 4
              ? `
                <div class="results-loot-card is-more">
                  <span class="results-loot-card__sigil">+</span>
                  <span class="results-loot-card__source">Additional Loot</span>
                  <strong class="results-loot-card__name">${outcome.rewards.length - 4} more unlocks</strong>
                </div>
              `
              : ""
          ].join("")
        : `
          <div class="results-loot-card is-empty">
            <span class="results-loot-card__sigil">RN</span>
            <span class="results-loot-card__source">No Loot This Run</span>
            <strong class="results-loot-card__name">Perfects and quick chains improve drop odds</strong>
          </div>
        `;

    const progressionChipsHtml = [
      `Runs ${profile.stats.runs}`,
      `Rift Tier ${threatProgress.threatTier}`,
      threatProgress.rookieWardActive
        ? `Rookie Ward • ${threatProgress.runsUntilBreachUnlock} to breach unlock`
        : `Next Rift Event • Run ${threatProgress.nextThreatMilestoneRuns}`
    ]
      .map((text) => `<span class="results-note-chip">${escapeHtml(text)}</span>`)
      .join("");

    const wrapper = document.createElement("div");
    wrapper.className = "screen-backdrop";
    wrapper.innerHTML = `
      <div class="screen-panel results-screen">
        <div class="results-header results-header--hero">
          <div class="results-header__main">
            <div class="screen-eyebrow">${resultTitle}</div>
            <h1>${
              hasMatchScore && finalMatchScore
                ? `${escapeHtml(profile.displayName)} • ${finalMatchScore}${opponentName ? ` vs ${escapeHtml(opponentName)}` : ""}`
                : `${escapeHtml(profile.displayName)} • ${outcome.summary.score.toLocaleString()} pts`
            }</h1>
            <p class="screen-copy results-copy-compact">${resultCopy}</p>
            <div class="results-ribbon-row">${headlineBadgeHtml}</div>
          </div>
          <div class="results-outcome-chip ${scoreboardStateClass}">
            <span>${failedByBreach ? "Breach" : matchResult === "win" ? "Win" : matchResult === "loss" ? "Loss" : "Draw"}</span>
            <strong>${finalMatchScore ?? outcome.summary.score.toLocaleString()}</strong>
            <small class="results-outcome-chip__meta">${timeLabel} ${outcome.summary.elapsedSec.toFixed(1)}s</small>
          </div>
        </div>

        <section class="results-arcane-scoreboard-wrap ${scoreboardStateClass}" data-results-scoreboard-wrap>
          <div data-results-scoreboard></div>
        </section>

        <div class="results-grid results-grid-compact">
          <section class="results-card results-card--visual results-card--match">
            <h2>Match Story</h2>
            <div class="results-matchup-band">
              <div class="results-portrait-medallion results-portrait-medallion--home">
                <div class="results-portrait-medallion__art">
                  <img src="${playerPortraitUrl}" alt="${escapeHtml(profile.displayName)} portrait" />
                </div>
                <div class="results-portrait-medallion__meta">
                  <span>Home</span>
                  <strong>${escapeHtml(profile.displayName)}</strong>
                </div>
              </div>
              <div class="results-matchup-core">
                <div class="results-matchup-core__sigil">${failedByBreach ? "BR" : matchResult === "win" ? "WN" : matchResult === "loss" ? "LS" : "DR"}</div>
                <div class="results-matchup-core__label">${failedByBreach ? "Seal Break" : "Final Horn"}</div>
              </div>
              <div class="results-portrait-medallion results-portrait-medallion--away">
                <div class="results-portrait-medallion__art">
                  <img src="${goblinPortraitUrl}" alt="${escapeHtml(opponentName ?? "Monster Team")} portrait" />
                </div>
                <div class="results-portrait-medallion__meta">
                  <span>Away</span>
                  <strong>${escapeHtml(opponentName ?? "Guest")}</strong>
                </div>
              </div>
            </div>
            <div class="results-period-strip">${periodCardsHtml}</div>
            <div class="results-stat-tiles">${summaryTilesHtml}</div>
            ${
              failedByBreach
                ? `<div class="level-up-note">Seal Breach • Ended early after ${outcome.summary.breaches} breach${outcome.summary.breaches === 1 ? "" : "es"}</div>`
                : ""
            }
            ${periodSummary ? `<div class="results-inline-note">${escapeHtml(periodSummary)}</div>` : ""}
          </section>

          <section class="results-card results-card--visual results-card--progress">
            <h2>Progress + Rewards</h2>
            <div class="results-progress-hero">
              <div class="results-level-medal">
                <span>Level</span>
                <strong>${outcome.profileAfter.level}</strong>
              </div>
              <div class="results-progress-hero__lines">
                <div class="xp-summary-line">
                  <span>XP Gained</span>
                  <strong>+${outcome.xpGained}</strong>
                </div>
                <div class="xp-summary-line">
                  <span>Level Shift</span>
                  <strong>${outcome.profileBefore.level} → ${outcome.profileAfter.level}</strong>
                </div>
              </div>
              <div class="results-perk-burst ${perkPointsEarned > 0 ? "is-earned" : ""}">
                <span>Perk Points</span>
                <strong>${perkPointsEarned > 0 ? `+${perkPointsEarned}` : "0"}</strong>
              </div>
            </div>
            <div class="xp-track">
              <div class="xp-fill" style="width:${progressPct.toFixed(2)}%"></div>
            </div>
            <div class="xp-meta xp-meta-compact">
              <span>Lv ${afterProgress.level} • ${afterProgress.xpIntoLevel}/${afterProgress.xpToNextLevel} XP to next</span>
            </div>
            ${
              outcome.levelUps.length > 0
                ? `<div class="level-up-note">Level up! ${outcome.levelUps
                    .map((level) => `Lv ${level}`)
                    .join(" • ")} • +${perkPointsEarned} perk point${perkPointsEarned > 1 ? "s" : ""}</div>`
                : ""
            }
            <div class="results-loot-gallery">${rewardGalleryHtml}</div>
            <div class="results-note-strip">
              ${progressionChipsHtml}
            </div>
            <div class="results-inline-note">${escapeHtml(profileTotalsLine)}</div>
          </section>
        </div>

        <details class="results-details">
          <summary>More details</summary>
          <div class="results-details-content">
            <div class="results-stats">
              <div><span>Runs</span><strong>${profile.stats.runs}</strong></div>
              <div><span>Best Score</span><strong>${profile.stats.bestScore.toLocaleString()}</strong></div>
              <div><span>Best Combo</span><strong>x${profile.stats.bestCombo}</strong></div>
              <div><span>Unlocked Cosmetics</span><strong>${profile.unlockedCosmetics.length}</strong></div>
              <div><span>XP Before</span><strong>Lv ${beforeProgress.level} • ${beforeProgress.xpIntoLevel}/${beforeProgress.xpToNextLevel}</strong></div>
              <div><span>XP Now</span><strong>Lv ${afterProgress.level} • ${afterProgress.xpIntoLevel}/${afterProgress.xpToNextLevel}</strong></div>
            </div>
            <div class="loot-grid loot-grid-compact">${rewardHtml}</div>
          </div>
        </details>

        <div class="screen-actions">
          <button type="button" class="ui-btn ui-btn-ghost" data-action="profiles">Switch Profile</button>
          <button type="button" class="ui-btn ui-btn-ghost" data-action="customize">Customize</button>
          <button type="button" class="ui-btn" data-action="again">Play Again</button>
        </div>
      </div>
    `;

    this.screenLayer.replaceChildren(wrapper);

    const scoreboardMount = wrapper.querySelector<HTMLElement>("[data-results-scoreboard]");
    if (scoreboardMount) {
      const sb = createArcaneScoreboard("results");
      sb.root.dataset.tone = failedByBreach
        ? "breach"
        : matchResult === "win"
          ? "win"
          : matchResult === "loss"
            ? "loss"
            : "tie";
      sb.periodRailEl.textContent = scoreboardPeriodRail;
      sb.enemyRailEl.textContent = opponentName ?? "Guest";
      sb.phaseEl.textContent = scoreboardThreatLabel;
      sb.guestLabelEl.textContent = (opponentName ?? "Guest").split(" ")[0] ?? "Guest";
      sb.timerEl.textContent = scoreboardClock;
      sb.timeDialEl.style.setProperty(
        "--progress",
        clamp(outcome.summary.elapsedSec / Math.max(1, outcome.summary.durationSec), 0, 1).toFixed(4)
      );
      sb.timeDialSubEl.textContent = failedByBreach ? "Survived" : "Final horn";
      setArcaneScoreboardScore(sb, scoreboardHome, scoreboardGuest);
      sb.scoreLabelEl.textContent = scoreboardOutcomeLabel;
      sb.scoreDialSubEl.textContent = `${periodSummary || "Three periods complete"} • Runes ${outcome.summary.score.toLocaleString()}`;
      sb.comboEl.textContent = `x${outcome.summary.bestCombo}`;
      sb.comboDialSubEl.textContent =
        outcome.summary.bestCombo > 0 ? `Best quick chain • x${outcome.summary.bestCombo}` : "No chain established";
      sb.integrityFillEl.style.width = `${(scoreboardShieldFill * 100).toFixed(1)}%`;
      sb.pressureFillEl.style.height = `${(scoreboardThreatFill * 100).toFixed(1)}%`;
      for (let i = 0; i < sb.comboPipsEls.length; i += 1) {
        const pip = sb.comboPipsEls[i];
        pip.classList.toggle("is-active", i < Math.min(5, outcome.summary.bestCombo));
        pip.classList.toggle("is-overflow", outcome.summary.bestCombo >= 6 && i === sb.comboPipsEls.length - 1);
      }
      scoreboardMount.replaceWith(sb.root);
    }

    this.screenLayer.querySelector<HTMLButtonElement>('[data-action="profiles"]')?.addEventListener("click", () => {
      this.showProfiles();
    });
    this.screenLayer.querySelector<HTMLButtonElement>('[data-action="customize"]')?.addEventListener("click", () => {
      this.showCustomize("results");
    });
    this.screenLayer.querySelector<HTMLButtonElement>('[data-action="again"]')?.addEventListener("click", () => {
      this.startPlay();
    });
  }
}

export function mountApp(root: HTMLElement): void {
  const win = window as AppWindow;
  win.__arcaneRinkApp?.destroy();
  const app = new AppController(root);
  win.__arcaneRinkApp = app;
}
