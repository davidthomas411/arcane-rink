import { Game, type GameRunSummary } from "../game/Game";
import { applyRunXp, calculateRunXp, getLevelProgress } from "../game/ProgressionSystem";
import {
  applyLootRewards,
  collectLevelUnlockRewards,
  cosmeticLabel,
  rollRunDropReward,
  type LootReward
} from "../game/Rewards";
import { CLASS_OPTIONS, classLabel, type ClassId, type Profile } from "../models/Profile";
import { ProfileManager } from "../profiles/ProfileManager";
import { createArcaneScoreboard, setArcaneScoreboardScore } from "../ui/ArcaneScoreboard";

type ScreenMode = "profiles" | "play" | "results";

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
    this.stopGame();
    this.screenLayer.replaceChildren();
    this.root.innerHTML = "";
  }

  private showProfiles(): void {
    this.mode = "profiles";
    this.stopGame();
    this.renderProfilesScreen();
  }

  private startPlay(): void {
    if (!this.activeProfile) {
      this.showProfiles();
      return;
    }

    this.mode = "play";
    this.lastOutcome = null;
    this.screenLayer.replaceChildren();

    this.stopGame();
    this.game = new Game({
      mount: this.shell,
      canvas: this.canvas,
      overlay: this.gameOverlay,
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
    this.stopGame();
    this.renderResultsScreen();
  }

  private renderPlayChrome(): void {
    if (!this.activeProfile) {
      return;
    }

    const profile = this.activeProfile;
    const progress = getLevelProgress(profile.xp);

    this.screenLayer.innerHTML = `
      <div class="ui-float-bar">
        <div class="ui-float-meta">
          <div class="ui-float-title">${escapeHtml(profile.displayName)} <span>#${escapeHtml(profile.jerseyNumber)}</span></div>
          <div class="ui-float-sub">${escapeHtml(classLabel(profile.classId))} • Lv ${profile.level} • ${progress.xpIntoLevel}/${progress.xpToNextLevel} XP</div>
        </div>
        <div class="ui-float-actions">
          <button type="button" class="ui-btn ui-btn-ghost" data-action="profiles">Profiles</button>
          <button type="button" class="ui-btn" data-action="restart">Restart Run</button>
        </div>
      </div>
    `;

    this.screenLayer.querySelector<HTMLButtonElement>('[data-action="profiles"]')?.addEventListener("click", () => {
      this.showProfiles();
    });
    this.screenLayer.querySelector<HTMLButtonElement>('[data-action="restart"]')?.addEventListener("click", () => {
      this.startPlay();
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
    const scoreboardPeriodRail = periodSummary || "P1 0-0 • P2 0-0 • P3 0-0";
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

    const wrapper = document.createElement("div");
    wrapper.className = "screen-backdrop";
    wrapper.innerHTML = `
      <div class="screen-panel results-screen">
        <div class="results-header">
          <div>
            <div class="screen-eyebrow">${resultTitle}</div>
            <h1>${
              hasMatchScore && finalMatchScore
                ? `${escapeHtml(profile.displayName)} • ${finalMatchScore}${opponentName ? ` vs ${escapeHtml(opponentName)}` : ""}`
                : `${escapeHtml(profile.displayName)} • ${outcome.summary.score.toLocaleString()} pts`
            }</h1>
            <p class="screen-copy results-copy-compact">${resultCopy}</p>
          </div>
          <div class="results-outcome-chip ${scoreboardStateClass}">
            <span>${failedByBreach ? "Breach" : matchResult === "win" ? "Win" : matchResult === "loss" ? "Loss" : "Draw"}</span>
            <strong>${finalMatchScore ?? outcome.summary.score.toLocaleString()}</strong>
          </div>
        </div>

        <section class="results-arcane-scoreboard-wrap ${scoreboardStateClass}" data-results-scoreboard-wrap>
          <div data-results-scoreboard></div>
        </section>

        <div class="results-grid results-grid-compact">
          <section class="results-card">
            <h2>Match Summary</h2>
            <div class="results-stats results-stats-compact">
              ${
                hasMatchScore && finalMatchScore
                  ? `<div><span>Final</span><strong>${finalMatchScore}</strong></div>
                     <div><span>Opponent</span><strong>${escapeHtml(opponentName ?? "Guest")}</strong></div>`
                  : ""
              }
              <div><span>Hits</span><strong>${outcome.summary.hits}</strong></div>
              <div><span>Perfects</span><strong>${outcome.summary.perfects}</strong></div>
              <div><span>Best Combo</span><strong>x${outcome.summary.bestCombo}</strong></div>
              <div><span>${timeLabel}</span><strong>${outcome.summary.elapsedSec.toFixed(1)}s</strong></div>
              <div><span>Runes</span><strong>${outcome.summary.score.toLocaleString()}</strong></div>
            </div>
            ${
              failedByBreach
                ? `<div class="level-up-note">Seal Breach • Ended early after ${outcome.summary.breaches} breach${outcome.summary.breaches === 1 ? "" : "es"}</div>`
                : ""
            }
            ${periodSummary ? `<div class="results-inline-note">${escapeHtml(periodSummary)}</div>` : ""}
          </section>

          <section class="results-card">
            <h2>Progress + Rewards</h2>
            <div class="xp-summary-line">
              <span>XP Gained</span>
              <strong>+${outcome.xpGained}</strong>
            </div>
            <div class="xp-summary-line">
              <span>Level</span>
              <strong>${outcome.profileBefore.level} → ${outcome.profileAfter.level}</strong>
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
            <div class="results-loot-strip">${rewardCompactHtml}</div>
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
