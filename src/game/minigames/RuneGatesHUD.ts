import type { PuckProvider } from "../../providers/PuckProvider";
import { padToPixel, type Rect } from "../../tracking/PadRenderer2D";
import { Effects2D } from "../../tracking/Effects2D";
import type { MonsterTeam } from "../MonsterTeams";
import {
  createArcaneScoreboard,
  setArcaneScoreboardScore,
  type ArcaneScoreboardRefs
} from "../../ui/ArcaneScoreboard";

type RuneStyle = "ARCANE" | "FROST" | "FEL";

type RingTarget = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  style: RuneStyle;
  age: number;
  lifetime: number;
  id: number;
};

type ComboFlash = {
  text: string;
  age: number;
  duration: number;
};

type HitGrade = "PERFECT" | "GREAT" | "HIT";
type ThreatPhase = "STABLE" | "CRACKING" | "BREACH";
type MatchResult = "win" | "loss" | "tie";
type Possession = "PLAYER" | "ENEMY";
type GameSfxKey =
  | "offense"
  | "defense"
  | "turnover"
  | "goal"
  | "goal_against"
  | "warning"
  | "victory"
  | "loss";

type PeriodScore = {
  period: number;
  playerGoals: number;
  enemyGoals: number;
};

export type RuneGatesSessionSummary = {
  modeId: "RUNE_GATES_HUD";
  endReason: "timer" | "breach";
  durationSec: number;
  elapsedSec: number;
  score: number;
  hits: number;
  perfects: number;
  bestCombo: number;
  breaches: number;
  monsterTeamId: string;
  monsterTeamName: string;
  playerGoals: number;
  enemyGoals: number;
  matchResult: MatchResult;
  periodScores: PeriodScore[];
  endedAtMs: number;
};

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function formatClockMmSs(totalSeconds: number): string {
  const clamped = Math.max(0, Math.ceil(totalSeconds - 1e-6));
  const mins = Math.floor(clamped / 60)
    .toString()
    .padStart(2, "0");
  const secs = (clamped % 60).toString().padStart(2, "0");
  return `${mins}:${secs}`;
}

function pickStyle(): RuneStyle {
  const styles: RuneStyle[] = ["ARCANE", "FROST", "FEL"];
  return styles[Math.floor(Math.random() * styles.length)] ?? "ARCANE";
}

function styleHue(style: RuneStyle): number {
  switch (style) {
    case "ARCANE":
      return 280;
    case "FROST":
      return 205;
    case "FEL":
      return 132;
    default:
      return 205;
  }
}

export class RuneGatesHUD {
  private readonly provider: PuckProvider;
  private readonly overlayRoot: HTMLElement;
  private readonly getPadBounds: () => Rect;
  private readonly effects: Effects2D;
  private readonly monsterTeam: MonsterTeam;

  private readonly panelEl: HTMLDivElement;
  private readonly scoreboardRefs: ArcaneScoreboardRefs;
  private readonly timerEl: HTMLSpanElement;
  private readonly homeScoreEl: HTMLSpanElement;
  private readonly guestScoreEl: HTMLSpanElement;
  private readonly comboEl: HTMLSpanElement;
  private readonly timeDialEl: HTMLDivElement;
  private readonly scoreDialEl: HTMLDivElement;
  private readonly comboStatEl: HTMLDivElement;
  private readonly comboPipsEls: HTMLSpanElement[];
  private readonly timeDialSubEl: HTMLSpanElement;
  private readonly scoreDialSubEl: HTMLSpanElement;
  private readonly comboDialSubEl: HTMLSpanElement;
  private readonly integrityFillEl: HTMLDivElement;
  private readonly pressureFillEl: HTMLDivElement;
  private readonly phaseEl: HTMLDivElement;
  private readonly periodRailEl: HTMLSpanElement;
  private readonly enemyRailEl: HTMLSpanElement;
  private readonly guestLabelEl: HTMLSpanElement;
  private readonly scoreLabelEl: HTMLSpanElement;
  private readonly comboFlashEl: HTMLDivElement;
  private readonly statusEl: HTMLDivElement;

  private target: RingTarget | null = null;
  private nextTargetId = 1;
  private wasInsideTarget = false;
  private comboFlash: ComboFlash | null = null;
  private readonly onSessionEnd?: (summary: RuneGatesSessionSummary) => void;
  private readonly introClipUrls: string[] = [
    new URL(
      "../../../tmp/audio/game intros/ElevenLabs_2026-02-25T04_23_50_RunesAwaken1_gen_sp100_s50_sb75_se0_b_m2.mp3",
      import.meta.url
    ).href,
    new URL(
      "../../../tmp/audio/game intros/ElevenLabs_2026-02-25T04_23_50_RunesAwaken1_gen_sp100_s50_sb75_se0_b_m2 (1).mp3",
      import.meta.url
    ).href,
    new URL(
      "../../../tmp/audio/game intros/ElevenLabs_2026-02-25T04_24_53_RunesAwaken1_gen_sp100_s50_sb75_se0_b_m2.mp3",
      import.meta.url
    ).href,
    new URL(
      "../../../tmp/audio/game intros/ElevenLabs_2026-02-25T04_25_17_RunesAwaken1_gen_sp100_s50_sb75_se0_b_m2.mp3",
      import.meta.url
    ).href,
    new URL(
      "../../../tmp/audio/game intros/ElevenLabs_2026-02-25T04_25_40_RunesAwaken1_gen_sp100_s50_sb75_se0_b_m2.mp3",
      import.meta.url
    ).href,
    new URL(
      "../../../tmp/audio/game intros/ElevenLabs_2026-02-25T04_26_07_RunesAwaken1_gen_sp100_s50_sb75_se0_b_m2.mp3",
      import.meta.url
    ).href,
    new URL(
      "../../../tmp/audio/game intros/ElevenLabs_2026-02-25T04_26_36_RunesAwaken1_gen_sp100_s50_sb75_se0_b_m2.mp3",
      import.meta.url
    ).href
  ];
  private introAudio: HTMLAudioElement | null = null;
  private lastIntroClipIndex = -1;
  private readonly gameSfxClips: Record<GameSfxKey, string[]> = {
    offense: [new URL("../../../tmp/audio/game clips - simple/Offence.mp3", import.meta.url).href],
    defense: [new URL("../../../tmp/audio/game clips - simple/Deefence.mp3", import.meta.url).href],
    turnover: [new URL("../../../tmp/audio/game clips - simple/turnover.mp3", import.meta.url).href],
    goal: [new URL("../../../tmp/audio/game clips - simple/Goooaaall.mp3", import.meta.url).href],
    goal_against: [
      new URL("../../../tmp/audio/game clips - simple/Boo.mp3", import.meta.url).href,
      new URL("../../../tmp/audio/game clips - simple/Teerible.mp3", import.meta.url).href
    ],
    warning: [
      new URL("../../../tmp/audio/game clips - simple/Teerible.mp3", import.meta.url).href,
      new URL("../../../tmp/audio/game clips - simple/Boo.mp3", import.meta.url).href
    ],
    victory: [new URL("../../../tmp/audio/game clips - simple/Victory.mp3", import.meta.url).href],
    loss: [
      new URL("../../../tmp/audio/game clips - simple/You Lose.mp3", import.meta.url).href,
      new URL("../../../tmp/audio/game clips - simple/You Suck!.mp3", import.meta.url).href
    ]
  };
  private readonly gameSfxCooldownMs: Record<GameSfxKey, number> = {
    offense: 700,
    defense: 700,
    turnover: 650,
    goal: 1000,
    goal_against: 1000,
    warning: 900,
    victory: 1800,
    loss: 1800
  };
  private readonly gameSfxLastPlayedAt = new Map<GameSfxKey, number>();
  private readonly gameSfxLastClipIndex = new Map<GameSfxKey, number>();

  private sessionDuration = 60;
  private timeRemaining = 60;
  private spawnDelay = 0.2;
  private score = 0;
  private readonly periodCount = 3;
  private readonly periodDurationSec = 20;
  private currentPeriod = 1;
  private currentPeriodIndex = 0;
  private playerGoals = 0;
  private enemyGoals = 0;
  private possession: Possession = "PLAYER";
  private playerAttackCharge = 0;
  private enemyAttackCharge = 0;
  private possessionLockTimer = 0;
  private readonly playerGoalsByPeriod = [0, 0, 0];
  private readonly enemyGoalsByPeriod = [0, 0, 0];
  private combo = 0;
  private bestCombo = 0;
  private hits = 0;
  private perfects = 0;
  private ended = false;
  private hasEmittedEnd = false;
  private endReason: "timer" | "breach" | null = null;
  // Tuning knob: combos only advance if the ring is hit in this early portion of its lifetime.
  private readonly quickComboWindowRatio = 0.5;
  private sealIntegrity = 1;
  private riftPressure = 0.08;
  private breachSurgeTimer = 0;
  private breachCount = 0;
  private lowestIntegrity = 1;
  private readonly breachOutroDuration = 2.65;
  private breachOutroTimer = 0;
  private breachOutroBurstStage = 0;
  private breachOutroPower = 1;
  private readonly finishOutroDuration = 2.35;
  private finishOutroTimer = 0;
  private finishOutroBurstStage = 0;
  private finishOutroPower = 1;
  private finishOutroResult: MatchResult = "tie";
  private statusTransientTimer = 0;
  private statusPersistent = false;

  private readonly onKeyDownBound = (event: KeyboardEvent): void => {
    if (
      event.key.toLowerCase() === "r" &&
      this.ended &&
      !(
        (this.endReason === "breach" && this.breachOutroTimer > 0) ||
        (this.endReason === "timer" && this.finishOutroTimer > 0)
      )
    ) {
      this.reset();
    }
  };

  constructor(args: {
    provider: PuckProvider;
    overlayRoot: HTMLElement;
    getPadBounds: () => Rect;
    effects: Effects2D;
    monsterTeam: MonsterTeam;
    onSessionEnd?: (summary: RuneGatesSessionSummary) => void;
  }) {
    this.provider = args.provider;
    this.overlayRoot = args.overlayRoot;
    this.getPadBounds = args.getPadBounds;
    this.effects = args.effects;
    this.monsterTeam = args.monsterTeam;
    this.onSessionEnd = args.onSessionEnd;

    const scoreboard = createArcaneScoreboard("hud");
    this.scoreboardRefs = scoreboard;
    this.panelEl = scoreboard.root;
    this.timerEl = scoreboard.timerEl;
    this.homeScoreEl = scoreboard.homeScoreEl;
    this.guestScoreEl = scoreboard.guestScoreEl;
    this.comboEl = scoreboard.comboEl;
    this.timeDialEl = scoreboard.timeDialEl;
    this.scoreDialEl = scoreboard.scoreDialEl;
    this.comboStatEl = scoreboard.comboStatEl;
    this.comboPipsEls = scoreboard.comboPipsEls;
    this.timeDialSubEl = scoreboard.timeDialSubEl;
    this.scoreDialSubEl = scoreboard.scoreDialSubEl;
    this.comboDialSubEl = scoreboard.comboDialSubEl;
    this.integrityFillEl = scoreboard.integrityFillEl;
    this.pressureFillEl = scoreboard.pressureFillEl;
    this.phaseEl = scoreboard.phaseEl;
    this.periodRailEl = scoreboard.periodRailEl;
    this.enemyRailEl = scoreboard.enemyRailEl;
    this.guestLabelEl = scoreboard.guestLabelEl;
    this.scoreLabelEl = scoreboard.scoreLabelEl;

    this.enemyRailEl.textContent = this.monsterTeam.title;
    this.guestLabelEl.textContent = this.monsterTeam.shortName;

    this.comboFlashEl = document.createElement("div");
    this.comboFlashEl.className = "combo-flash";

    this.statusEl = document.createElement("div");
    this.statusEl.className = "session-status";

    this.overlayRoot.append(this.panelEl, this.comboFlashEl, this.statusEl);
    window.addEventListener("keydown", this.onKeyDownBound);

    this.reset();
  }

  reset(): void {
    this.playRandomIntroClip();
    this.gameSfxLastPlayedAt.clear();
    this.gameSfxLastClipIndex.clear();
    this.target = null;
    this.wasInsideTarget = false;
    this.comboFlash = null;
    this.sessionDuration = this.periodCount * this.periodDurationSec;
    this.timeRemaining = this.sessionDuration;
    this.spawnDelay = 0.25;
    this.score = 0;
    this.currentPeriod = 1;
    this.currentPeriodIndex = 0;
    this.playerGoals = 0;
    this.enemyGoals = 0;
    this.possession = "PLAYER";
    this.playerAttackCharge = 0;
    this.enemyAttackCharge = 0;
    this.possessionLockTimer = 0;
    this.playerGoalsByPeriod.fill(0);
    this.enemyGoalsByPeriod.fill(0);
    this.combo = 0;
    this.bestCombo = 0;
    this.hits = 0;
    this.perfects = 0;
    this.ended = false;
    this.hasEmittedEnd = false;
    this.endReason = null;
    this.sealIntegrity = 1;
    this.riftPressure = 0.08;
    this.breachSurgeTimer = 0;
    this.breachCount = 0;
    this.lowestIntegrity = 1;
    this.breachOutroTimer = 0;
    this.breachOutroBurstStage = 0;
    this.breachOutroPower = 1;
    this.finishOutroTimer = 0;
    this.finishOutroBurstStage = 0;
    this.finishOutroPower = 1;
    this.finishOutroResult = "tie";
    this.statusTransientTimer = 0;
    this.statusPersistent = false;
    this.statusEl.textContent = "";
    delete this.statusEl.dataset.tone;
    this.statusEl.classList.remove("visible");
    this.updateHud();
  }

  update(dt: number): void {
    this.possessionLockTimer = Math.max(0, this.possessionLockTimer - dt);
    this.updateTransientStatus(dt);

    if (this.comboFlash) {
      this.comboFlash.age += dt;
      if (this.comboFlash.age >= this.comboFlash.duration) {
        this.comboFlash = null;
      }
    }
    this.updateComboFlashDom();

    if (this.ended) {
      this.updateEndedState(dt);
      this.updateHud();
      return;
    }

    this.updateTension(dt);
    if (this.ended) {
      this.updateEndedState(dt);
      this.updateHud();
      return;
    }

    this.timeRemaining = Math.max(0, this.timeRemaining - dt);
    this.updateMatchClockAndPeriods();
    if (this.timeRemaining <= 0) {
      this.ended = true;
      this.endReason = "timer";
      this.target = null;
      this.wasInsideTarget = false;
      const finalResult = this.getMatchResult();
      this.finishOutroResult = finalResult;
      const outroBase = finalResult === "win" ? 1.18 : finalResult === "tie" ? 1.06 : 0.98;
      this.finishOutroPower = clamp(outroBase + this.bestCombo * 0.028 + this.perfects * 0.01, 0.95, 2.05);
      this.finishOutroTimer = this.finishOutroDuration;
      this.finishOutroBurstStage = 0;
      const resultText = finalResult === "win" ? "Victory" : finalResult === "loss" ? "Defeat" : "Draw";
      this.statusPersistent = false;
      this.statusTransientTimer = 0;
      this.statusEl.dataset.tone = finalResult === "win" ? "goal" : finalResult === "loss" ? "danger" : "neutral";
      this.statusEl.textContent = `${resultText} • ${this.playerGoals}-${this.enemyGoals} vs ${this.monsterTeam.shortName} • Runes ${this.score.toLocaleString()}`;
      this.statusEl.classList.remove("visible");
      this.flashCombo("FINAL HORN", finalResult === "win" ? "great" : finalResult === "tie" ? "hit" : "late");
      this.updateEndedState(dt);
      this.updateHud();
      return;
    }

    this.updateEnemyAttack(dt);

    if (this.target) {
      this.target.age += dt;
      this.target.x += this.target.vx * dt;
      this.target.y += this.target.vy * dt;
      const boundMargin = 0.09 + this.target.radius;
      const minX = boundMargin;
      const maxX = 1 - boundMargin;
      const minY = boundMargin;
      const maxY = 1 - boundMargin;
      if (this.target.x < minX) {
        this.target.x = minX;
        this.target.vx = Math.abs(this.target.vx);
      } else if (this.target.x > maxX) {
        this.target.x = maxX;
        this.target.vx = -Math.abs(this.target.vx);
      }
      if (this.target.y < minY) {
        this.target.y = minY;
        this.target.vy = Math.abs(this.target.vy);
      } else if (this.target.y > maxY) {
        this.target.y = maxY;
        this.target.vy = -Math.abs(this.target.vy);
      }
      if (this.target.age >= this.target.lifetime) {
        this.target = null;
        this.wasInsideTarget = false;
        this.spawnDelay = 0.18;
        this.combo = 0;
        this.flashCombo("MISS", "miss");
        this.applyMissPressure();
      }
    } else {
      this.spawnDelay -= dt;
      if (this.spawnDelay <= 0) {
        this.spawnTarget();
      }
    }

    if (this.ended) {
      this.updateEndedState(dt);
      this.updateHud();
      return;
    }

    if (this.target) {
      const pad = this.getPadBounds();
      const pos = this.provider.getPosition();
      const puckPx = padToPixel(pad, pos);
      const targetPx = padToPixel(pad, this.target);
      const dx = puckPx.x - targetPx.x;
      const dy = puckPx.y - targetPx.y;
      const minDim = Math.min(pad.width, pad.height);
      const radiusPx = this.target.radius * minDim;
      const dist = Math.hypot(dx, dy);
      const inside = dist <= radiusPx;

      if (inside && !this.wasInsideTarget) {
        this.handleHit(dist, radiusPx, targetPx.x, targetPx.y, this.target.style);
      }

      this.wasInsideTarget = inside;
    }

    this.updateHud();
  }

  renderWorld(ctx: CanvasRenderingContext2D, padRect: Rect, timeSec: number): void {
    this.renderThreatEnvironment(ctx, padRect, timeSec);

    if (!this.target) {
      return;
    }

    const targetPx = padToPixel(padRect, this.target);
    const minDim = Math.min(padRect.width, padRect.height);
    const radiusPx = this.target.radius * minDim;
    const hue = styleHue(this.target.style);
    const lifeAlpha = 1 - clamp(this.target.age / this.target.lifetime, 0, 1);
    const pulse = 0.5 + 0.5 * Math.sin(timeSec * 7.2 + this.target.id * 0.47);
    const spawnT = clamp(this.target.age / 0.22, 0, 1);
    const spawnEase = 1 - Math.pow(1 - spawnT, 3);
    const spawnScale = 0.84 + spawnEase * 0.16;
    const spawnGlow = (1 - spawnT) * (1 - spawnT);
    const portalRadius = radiusPx * spawnScale;
    const portalInner = portalRadius * (0.52 + pulse * 0.06);
    const arcProgress = clamp(this.target.age / this.target.lifetime, 0, 1);
    const quickProgress = clamp(this.target.age / (this.target.lifetime * this.quickComboWindowRatio), 0, 1);
    const quickWindowRemaining = 1 - quickProgress;

    const outerGlow = ctx.createRadialGradient(
      targetPx.x,
      targetPx.y,
      portalRadius * 0.15,
      targetPx.x,
      targetPx.y,
      portalRadius * 2.8
    );
    outerGlow.addColorStop(0, `hsla(${hue} 100% 68% / ${0.18 + spawnGlow * 0.18})`);
    outerGlow.addColorStop(0.35, `hsla(${hue} 100% 60% / ${0.12 + pulse * 0.12})`);
    outerGlow.addColorStop(0.8, `hsla(${hue} 100% 55% / 0.04)`);
    outerGlow.addColorStop(1, `hsla(${hue} 100% 55% / 0)`);
    ctx.fillStyle = outerGlow;
    ctx.beginPath();
    ctx.arc(targetPx.x, targetPx.y, portalRadius * 2.8, 0, Math.PI * 2);
    ctx.fill();

    // Subtle bloom halo
    ctx.save();
    ctx.shadowColor = `hsla(${hue} 100% 68% / ${(0.35 + pulse * 0.18).toFixed(3)})`;
    ctx.shadowBlur = 18;
    ctx.strokeStyle = `hsla(${hue} 100% 78% / ${(0.7 * lifeAlpha + spawnGlow * 0.2).toFixed(3)})`;
    ctx.lineWidth = 3.5;
    ctx.beginPath();
    ctx.arc(targetPx.x, targetPx.y, portalRadius, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();

    ctx.save();
    ctx.translate(targetPx.x, targetPx.y);

    // Outer runic portal ring
    ctx.rotate(timeSec * 0.55 + this.target.id * 0.33);
    ctx.strokeStyle = `hsla(${hue} 100% 84% / ${(0.42 + pulse * 0.26).toFixed(3)})`;
    ctx.lineWidth = 1.7;
    ctx.beginPath();
    ctx.arc(0, 0, portalRadius * 0.92, 0, Math.PI * 2);
    ctx.stroke();

    for (let i = 0; i < 10; i += 1) {
      const angle = (Math.PI * 2 * i) / 10;
      const a0 = angle - 0.16;
      const a1 = angle + 0.16;
      ctx.strokeStyle = `hsla(${hue} 100% 78% / ${(0.18 + pulse * 0.18).toFixed(3)})`;
      ctx.lineWidth = 2.4;
      ctx.beginPath();
      ctx.arc(0, 0, portalRadius * (1.08 + ((i % 2) ? 0.04 : 0)), a0, a1);
      ctx.stroke();
    }

    // Inner glyph pattern (slow counter rotation)
    ctx.rotate(-timeSec * 1.1 - this.target.id * 0.51);
    ctx.strokeStyle = `hsla(${hue} 100% 86% / ${(0.22 + pulse * 0.18).toFixed(3)})`;
    ctx.lineWidth = 1.25;
    ctx.beginPath();
    ctx.arc(0, 0, portalInner, 0, Math.PI * 2);
    ctx.stroke();

    const glyphCount = 12;
    for (let i = 0; i < glyphCount; i += 1) {
      ctx.save();
      ctx.rotate((Math.PI * 2 * i) / glyphCount);
      ctx.beginPath();
      ctx.moveTo(portalInner * 0.8, 0);
      ctx.lineTo(portalInner * 1.05, 0);
      ctx.moveTo(portalInner * 0.68, -2.2);
      ctx.lineTo(portalInner * 0.74, 2.2);
      ctx.stroke();
      ctx.restore();
    }

    ctx.rotate(timeSec * 0.45 + this.target.id * 0.23);
    ctx.strokeStyle = `hsla(${hue} 100% 88% / ${(0.18 + pulse * 0.14).toFixed(3)})`;
    ctx.lineWidth = 1.1;
    ctx.beginPath();
    for (let i = 0; i < 6; i += 1) {
      const angle = (Math.PI * 2 * i) / 6;
      const x = Math.cos(angle) * portalInner * 0.52;
      const y = Math.sin(angle) * portalInner * 0.52;
      if (i === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
    }
    ctx.closePath();
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(-portalInner * 0.22, 0);
    ctx.lineTo(portalInner * 0.22, 0);
    ctx.moveTo(0, -portalInner * 0.22);
    ctx.lineTo(0, portalInner * 0.22);
    ctx.stroke();
    ctx.restore();

    const coreGlow = ctx.createRadialGradient(
      targetPx.x,
      targetPx.y,
      0,
      targetPx.x,
      targetPx.y,
      portalInner * 1.6
    );
    coreGlow.addColorStop(0, `hsla(${hue} 100% 78% / ${0.08 + pulse * 0.08})`);
    coreGlow.addColorStop(0.45, `hsla(${hue} 100% 64% / ${0.05 + spawnGlow * 0.08})`);
    coreGlow.addColorStop(1, `hsla(${hue} 100% 60% / 0)`);
    ctx.fillStyle = coreGlow;
    ctx.beginPath();
    ctx.arc(targetPx.x, targetPx.y, portalInner * 1.6, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = `hsla(${hue} 100% 80% / ${0.9 * lifeAlpha})`;
    ctx.lineWidth = 4;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.arc(
      targetPx.x,
      targetPx.y,
      portalRadius + 7,
      -Math.PI / 2,
      -Math.PI / 2 + (Math.PI * 2 * (1 - arcProgress))
    );
    ctx.stroke();

    // Quick-hit timing window arc (combo only advances while this remains)
    if (quickWindowRemaining > 0) {
      ctx.save();
      ctx.strokeStyle = `rgba(255, 223, 154, ${(0.22 + quickWindowRemaining * 0.45).toFixed(3)})`;
      ctx.lineWidth = 3;
      ctx.lineCap = "round";
      ctx.shadowColor = `rgba(255, 213, 130, ${(0.15 + quickWindowRemaining * 0.25).toFixed(3)})`;
      ctx.shadowBlur = 10;
      ctx.beginPath();
      ctx.arc(
        targetPx.x,
        targetPx.y,
        portalRadius - 5,
        -Math.PI / 2,
        -Math.PI / 2 + Math.PI * 2 * quickWindowRemaining
      );
      ctx.stroke();
      ctx.restore();
    } else {
      ctx.strokeStyle = `rgba(255, 141, 141, ${(0.05 + pulse * 0.05).toFixed(3)})`;
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.arc(targetPx.x, targetPx.y, portalRadius - 5, 0, Math.PI * 2);
      ctx.stroke();
    }

    if (spawnGlow > 0.02) {
      ctx.strokeStyle = `hsla(${hue} 100% 85% / ${(spawnGlow * 0.45).toFixed(3)})`;
      ctx.lineWidth = 2.2 + spawnGlow * 3;
      ctx.beginPath();
      ctx.arc(targetPx.x, targetPx.y, portalRadius * (1.05 + spawnGlow * 0.35), 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  renderScreenOutroOverlay(ctx: CanvasRenderingContext2D, width: number, height: number, timeSec: number): void {
    if (this.endReason === "timer" && this.finishOutroTimer > 0) {
      this.renderFinishScreenOutroOverlay(ctx, width, height, timeSec);
      return;
    }

    if (this.endReason !== "breach" || this.breachOutroTimer <= 0) {
      return;
    }

    const progress = clamp(1 - this.breachOutroTimer / this.breachOutroDuration, 0, 1);
    const power = clamp(this.breachOutroPower, 1, 2.2);
    const veilT = clamp((progress - 0.14) / 0.86, 0, 1);
    const blackT = clamp((progress - 0.52) / 0.48, 0, 1);
    const finalT = clamp((progress - 0.84) / 0.16, 0, 1);
    const pulse = 0.5 + 0.5 * Math.sin(timeSec * (9 + power * 4.5));
    const pad = this.getPadBounds();
    const cx = pad.x + pad.width * 0.5;
    const cy = pad.y + pad.height * 0.5;
    const maxDim = Math.max(width, height);

    const veil = ctx.createRadialGradient(cx, cy, pad.width * 0.08, cx, cy, maxDim * (0.58 + power * 0.05));
    veil.addColorStop(
      0,
      `rgba(255, 108, 66, ${(0.04 + veilT * 0.12 + pulse * 0.025 * veilT * power).toFixed(3)})`
    );
    veil.addColorStop(0.34, `rgba(92, 18, 16, ${(0.06 + veilT * 0.18).toFixed(3)})`);
    veil.addColorStop(1, "rgba(8, 6, 10, 0)");
    ctx.fillStyle = veil;
    ctx.fillRect(0, 0, width, height);

    if (veilT > 0.04) {
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(timeSec * 0.32 * power);
      ctx.strokeStyle = `rgba(255, 162, 126, ${(0.03 + veilT * 0.08).toFixed(3)})`;
      ctx.lineWidth = 1.1;
      ctx.shadowColor = `rgba(255, 126, 84, ${(0.05 + veilT * 0.1).toFixed(3)})`;
      ctx.shadowBlur = 10;
      for (let ring = 0; ring < 2; ring += 1) {
        const r = Math.min(width, height) * (0.18 + ring * 0.075 + veilT * 0.02);
        ctx.beginPath();
        for (let s = 0; s < 12; s += 1) {
          const a0 = (Math.PI * 2 * s) / 12 + (ring ? 0.11 : -0.06);
          const a1 = a0 + 0.18;
          ctx.arc(0, 0, r, a0, a1);
        }
        ctx.stroke();
      }
      ctx.restore();
    }

    const blackoutAlpha = Math.min(1, Math.pow(blackT, 1.35) * (0.92 + (power - 1) * 0.07) + finalT * 0.08);
    if (blackoutAlpha > 0.001) {
      ctx.fillStyle = `rgba(0, 0, 0, ${blackoutAlpha.toFixed(3)})`;
      ctx.fillRect(0, 0, width, height);
    }
  }

  private renderFinishScreenOutroOverlay(
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number,
    timeSec: number
  ): void {
    if (this.finishOutroTimer <= 0) {
      return;
    }

    const progress = clamp(1 - this.finishOutroTimer / this.finishOutroDuration, 0, 1);
    const power = clamp(this.finishOutroPower, 0.95, 2.05);
    const hue = this.finishOutroResult === "win" ? 46 : this.finishOutroResult === "tie" ? 204 : 28;
    const veilT = clamp((progress - 0.04) / 0.82, 0, 1);
    const flareT = clamp((progress - 0.22) / 0.42, 0, 1) * (1 - clamp((progress - 0.72) / 0.22, 0, 1));
    const blackT = clamp((progress - 0.74) / 0.26, 0, 1);
    const pulse = 0.5 + 0.5 * Math.sin(timeSec * (6.5 + power * 1.8));
    const pad = this.getPadBounds();
    const cx = pad.x + pad.width * 0.5;
    const cy = pad.y + pad.height * 0.5;
    const maxDim = Math.max(width, height);

    const veil = ctx.createRadialGradient(cx, cy, pad.width * 0.06, cx, cy, maxDim * 0.7);
    if (this.finishOutroResult === "win") {
      veil.addColorStop(0, `rgba(255, 220, 132, ${(0.05 + veilT * 0.14 + pulse * 0.02 * veilT).toFixed(3)})`);
      veil.addColorStop(0.34, `rgba(110, 210, 255, ${(0.04 + veilT * 0.08).toFixed(3)})`);
      veil.addColorStop(1, "rgba(5, 8, 12, 0)");
    } else if (this.finishOutroResult === "tie") {
      veil.addColorStop(0, `rgba(128, 219, 255, ${(0.04 + veilT * 0.1 + pulse * 0.015 * veilT).toFixed(3)})`);
      veil.addColorStop(0.34, `rgba(92, 126, 255, ${(0.03 + veilT * 0.06).toFixed(3)})`);
      veil.addColorStop(1, "rgba(5, 8, 12, 0)");
    } else {
      veil.addColorStop(0, `rgba(255, 186, 116, ${(0.04 + veilT * 0.09 + pulse * 0.012 * veilT).toFixed(3)})`);
      veil.addColorStop(0.34, `rgba(255, 104, 84, ${(0.03 + veilT * 0.07).toFixed(3)})`);
      veil.addColorStop(1, "rgba(5, 8, 12, 0)");
    }
    ctx.fillStyle = veil;
    ctx.fillRect(0, 0, width, height);

    if (flareT > 0.01) {
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(timeSec * 0.18 * (this.finishOutroResult === "win" ? 1 : -1));
      for (let i = 0; i < 2; i += 1) {
        const rays = 12 + i * 4;
        const inner = Math.min(width, height) * (0.12 + i * 0.05);
        const outer = Math.min(width, height) * (0.26 + i * 0.09 + flareT * 0.05) * (0.98 + (power - 1) * 0.08);
        const alpha = (0.015 + flareT * 0.04) * (i === 0 ? 1 : 0.75);
        ctx.fillStyle = `hsla(${hue} 100% ${this.finishOutroResult === "win" ? 75 : 68}% / ${alpha.toFixed(3)})`;
        for (let r = 0; r < rays; r += 1) {
          const a = (Math.PI * 2 * r) / rays + i * 0.08 + timeSec * (i === 0 ? 0.3 : -0.22);
          const spread = 0.04 + i * 0.01;
          ctx.beginPath();
          ctx.moveTo(Math.cos(a - spread) * inner, Math.sin(a - spread) * inner);
          ctx.lineTo(Math.cos(a) * outer, Math.sin(a) * outer);
          ctx.lineTo(Math.cos(a + spread) * inner, Math.sin(a + spread) * inner);
          ctx.closePath();
          ctx.fill();
        }
      }
      ctx.restore();
    }

    const blackoutAlpha = Math.min(1, Math.pow(blackT, 1.25) * 0.96);
    if (blackoutAlpha > 0.001) {
      ctx.fillStyle = `rgba(0, 0, 0, ${blackoutAlpha.toFixed(3)})`;
      ctx.fillRect(0, 0, width, height);
    }
  }

  destroy(): void {
    if (this.introAudio) {
      this.introAudio.pause();
      this.introAudio.src = "";
      this.introAudio = null;
    }
    window.removeEventListener("keydown", this.onKeyDownBound);
    this.panelEl.remove();
    this.comboFlashEl.remove();
    this.statusEl.remove();
  }

  private playRandomIntroClip(): void {
    const clips = this.introClipUrls;
    if (clips.length === 0) {
      return;
    }

    let index = Math.floor(Math.random() * clips.length);
    if (clips.length > 1 && index === this.lastIntroClipIndex) {
      index = (index + 1 + Math.floor(Math.random() * (clips.length - 1))) % clips.length;
    }
    this.lastIntroClipIndex = index;

    if (this.introAudio) {
      this.introAudio.pause();
      this.introAudio.currentTime = 0;
      this.introAudio.src = "";
      this.introAudio = null;
    }

    const audio = new Audio(clips[index] ?? clips[0]);
    audio.preload = "auto";
    audio.volume = 0.78;
    audio.addEventListener(
      "ended",
      () => {
        if (this.introAudio === audio) {
          this.introAudio = null;
        }
      },
      { once: true }
    );
    this.introAudio = audio;
    void audio.play().catch(() => {
      if (this.introAudio === audio) {
        this.introAudio = null;
      }
    });
  }

  private playGameSfx(key: GameSfxKey): void {
    // Avoid layering gameplay callouts on top of the pre-game intro VO.
    if (this.introAudio) {
      return;
    }
    const clips = this.gameSfxClips[key];
    if (!clips || clips.length === 0) {
      return;
    }
    const now = performance.now();
    const lastAt = this.gameSfxLastPlayedAt.get(key) ?? -Infinity;
    const cooldown = this.gameSfxCooldownMs[key] ?? 700;
    if (now - lastAt < cooldown) {
      return;
    }

    let index = Math.floor(Math.random() * clips.length);
    const prevIndex = this.gameSfxLastClipIndex.get(key) ?? -1;
    if (clips.length > 1 && index === prevIndex) {
      index = (index + 1 + Math.floor(Math.random() * (clips.length - 1))) % clips.length;
    }

    this.gameSfxLastPlayedAt.set(key, now);
    this.gameSfxLastClipIndex.set(key, index);

    const audio = new Audio(clips[index] ?? clips[0]);
    audio.preload = "auto";
    audio.volume =
      key === "goal" || key === "victory" ? 0.88 : key === "loss" || key === "goal_against" ? 0.8 : 0.72;
    void audio.play().catch(() => {
      // Ignore autoplay/user-gesture failures.
    });
  }

  private spawnTarget(): void {
    const margin = 0.12;
    const pressure = this.riftPressure + (this.breachSurgeTimer > 0 ? 0.16 : 0);
    const rubberBand = this.getEnemyRubberBand();
    const assist = this.getPlayerAssist();
    const enemyHasPuck = this.possession === "ENEMY";
    const chaos = clamp(
      this.monsterTeam.gateAggression * 0.18 + (enemyHasPuck ? 0.11 : 0) + Math.max(0, rubberBand) * 0.24 - assist * 0.14,
      0,
      0.42
    );

    const radiusBase = enemyHasPuck ? 0.055 : 0.06;
    const radius = clamp(radiusBase + Math.random() * 0.03 - chaos * 0.025 + assist * 0.014, 0.043, 0.089);

    const lifetimeScale = clamp(1 - Math.min(0.34, pressure * 0.2 + chaos * 0.32) + assist * 0.12, 0.66, 1.2);
    const lifetimeBase = enemyHasPuck ? 1.28 + Math.random() * 0.72 : 1.38 + Math.random() * 0.78;

    const puck = this.provider.getPosition();
    const minDist =
      (enemyHasPuck ? 0.22 : 0.12) + Math.max(0, rubberBand) * 0.16 - assist * 0.06;
    const maxDist = 0.86 - margin * 1.1;
    let x = margin + Math.random() * (1 - margin * 2);
    let y = margin + Math.random() * (1 - margin * 2);
    for (let attempt = 0; attempt < 10; attempt += 1) {
      const sx = margin + Math.random() * (1 - margin * 2);
      const sy = margin + Math.random() * (1 - margin * 2);
      const d = Math.hypot(sx - puck.x, sy - puck.y);
      if (d >= minDist || attempt >= 8) {
        x = sx;
        y = sy;
        if (d <= maxDist) {
          break;
        }
      }
    }

    const driftMag = clamp(
      (enemyHasPuck ? 0.06 : 0.03) +
        chaos * 0.22 +
        pressure * 0.035 -
        assist * 0.03,
      0,
      0.16
    );
    const driftAngle = Math.random() * Math.PI * 2;

    this.target = {
      x,
      y,
      vx: Math.cos(driftAngle) * driftMag,
      vy: Math.sin(driftAngle) * driftMag,
      radius,
      style: pickStyle(),
      age: 0,
      lifetime: lifetimeBase * lifetimeScale,
      id: this.nextTargetId++
    };
    this.wasInsideTarget = false;
  }

  private handleHit(
    distPx: number,
    radiusPx: number,
    worldX: number,
    worldY: number,
    style: RuneStyle
  ): void {
    const target = this.target;
    if (!target) {
      return;
    }

    const timingRatio = clamp(target.age / target.lifetime, 0, 1);
    const isQuickTiming = timingRatio <= this.quickComboWindowRatio;
    const onOffense = this.possession === "PLAYER";
    const perfectRadiusPx = radiusPx * 0.42;
    const isCenterHit = distPx <= perfectRadiusPx;
    const isPerfect = isQuickTiming && isCenterHit;
    const grade: HitGrade = isPerfect ? "PERFECT" : isQuickTiming ? "GREAT" : "HIT";

    this.hits += 1;
    if (isPerfect) {
      this.perfects += 1;
    }

    const comboBeforeHit = this.combo;
    if (isQuickTiming) {
      this.combo += 1;
      this.bestCombo = Math.max(this.bestCombo, this.combo);
    } else {
      this.combo = 0;
    }

    const base = onOffense ? 72 : 56;
    const timingScore = Math.round((1 - timingRatio) * 58);
    const quickBonus = isQuickTiming ? 24 : 0;
    const centerBonus = isCenterHit ? (isQuickTiming ? 60 : 28) : 0;
    const comboMultiplier = isQuickTiming ? 1 + Math.min(2.4, (this.combo - 1) * 0.16) : 1;
    const points = Math.round((base + timingScore + quickBonus + centerBonus) * comboMultiplier);

    this.score += points;

    const comboImpact = 1 + Math.min(1.8, Math.max(0, this.combo - 1) * 0.12) + (isPerfect ? 0.25 : 0);
    this.effects.spawnHitBurst(worldX, worldY, styleHue(style), comboImpact);
    this.effects.spawnFloatingText(
      worldX,
      worldY - radiusPx * 0.18,
      grade,
      grade === "PERFECT" ? 42 : grade === "GREAT" ? 46 : styleHue(style)
    );
    this.effects.triggerShake((isPerfect ? 0.9 : grade === "GREAT" ? 0.7 : 0.5) * Math.min(1.55, comboImpact));
    this.pulseComboStat();

    let turnoverToDefense = false;
    if (isQuickTiming) {
      const stabilityGain = 0.038 + Math.min(0.08, this.combo * 0.006) + (isPerfect ? 0.018 : 0);
      const pressureRelief = 0.075 + Math.min(0.13, this.combo * 0.01) + (isPerfect ? 0.03 : 0.012);
      this.sealIntegrity = clamp(this.sealIntegrity + stabilityGain, 0, 1);
      this.riftPressure = clamp(this.riftPressure - pressureRelief, 0, 1);

      if (onOffense) {
        const attackGain = 0.16 + Math.min(0.18, this.combo * 0.022) + (isPerfect ? 0.1 : 0.04);
        this.addPlayerAttackCharge(attackGain);
        this.enemyAttackCharge = clamp(this.enemyAttackCharge - (isPerfect ? 0.12 : 0.07), 0, 2);
      } else {
        const takeawayGain = 0.18 + Math.min(0.22, this.combo * 0.024) + (isPerfect ? 0.08 : 0.03);
        this.addPlayerAttackCharge(takeawayGain);
        this.enemyAttackCharge = clamp(this.enemyAttackCharge - (isPerfect ? 0.2 : 0.14), 0, 2);
        this.playerAttackCharge = clamp(this.playerAttackCharge, 0, 2);
      }
    } else {
      const lateStabilize = isCenterHit ? 0.012 : 0.006;
      this.sealIntegrity = clamp(this.sealIntegrity + lateStabilize, 0, 1);
      this.riftPressure = clamp(this.riftPressure + 0.035, 0, 1);

      if (onOffense) {
        this.addPlayerAttackCharge(isCenterHit ? 0.04 : 0.025);
        this.addEnemyAttackCharge(isCenterHit ? 0.04 : 0.07);
        const turnoverRisk =
          (comboBeforeHit >= 2 ? 0.35 : 0.16) +
          (isCenterHit ? -0.08 : 0.12) +
          Math.max(0, this.getEnemyRubberBand()) * 0.25;
        turnoverToDefense = Math.random() < clamp(turnoverRisk, 0.08, 0.8);
      } else {
        this.addPlayerAttackCharge(isCenterHit ? 0.065 : 0.04);
        this.addEnemyAttackCharge(isCenterHit ? 0.035 : 0.065);
      }
    }

    if (grade === "PERFECT") {
      this.flashCombo(`PERFECT +${points}`, "perfect");
    } else if (grade === "GREAT") {
      this.flashCombo(`GREAT +${points}`, "great");
    } else if (comboBeforeHit > 0) {
      this.flashCombo(`LATE +${points} • COMBO LOST`, "late");
    } else {
      this.flashCombo(`HIT +${points}`, "hit");
    }

    if (isQuickTiming && this.combo >= 2) {
      this.flashCombo(`COMBO x${this.combo}`, "combo");
    }

    this.target = null;
    this.wasInsideTarget = false;
    this.spawnDelay = 0.08;

    if (turnoverToDefense && !this.ended) {
      this.changePossession("ENEMY", "TURNOVER");
    }
  }

  private flashCombo(text: string, variant: "hit" | "great" | "perfect" | "combo" | "miss" | "late"): void {
    let duration = 0.55;
    if (variant === "combo") {
      duration = 0.75;
    }
    if (variant === "miss" || variant === "late") {
      duration = 0.7;
    }
    this.comboFlash = { text, age: 0, duration };
    this.comboFlashEl.dataset.variant = variant;
    this.comboFlashEl.textContent = text;
  }

  private updateComboFlashDom(): void {
    if (!this.comboFlash) {
      this.comboFlashEl.classList.remove("visible");
      return;
    }

    const t = clamp(this.comboFlash.age / this.comboFlash.duration, 0, 1);
    const alpha = t < 0.15 ? t / 0.15 : 1 - (t - 0.15) / 0.85;
    const lift = 12 + t * 26;
    const scale = 0.92 + (1 - t) * 0.22;

    this.comboFlashEl.classList.add("visible");
    this.comboFlashEl.style.opacity = alpha.toFixed(3);
    this.comboFlashEl.style.transform = `translate(-50%, calc(-50% - ${lift.toFixed(1)}px)) scale(${scale.toFixed(3)})`;
  }

  private updateTransientStatus(dt: number): void {
    if (this.statusPersistent || this.statusTransientTimer <= 0) {
      return;
    }
    this.statusTransientTimer = Math.max(0, this.statusTransientTimer - dt);
    if (this.statusTransientTimer <= 0) {
      this.statusEl.classList.remove("visible");
      delete this.statusEl.dataset.tone;
    }
  }

  private showStatus(text: string, tone: "offense" | "defense" | "goal" | "danger" | "neutral", duration = 1.15): void {
    this.statusPersistent = false;
    this.statusTransientTimer = duration;
    this.statusEl.dataset.tone = tone;
    this.statusEl.textContent = text;
    this.statusEl.classList.add("visible");
  }

  private pinStatus(text: string, tone: "goal" | "danger" | "neutral"): void {
    this.statusPersistent = true;
    this.statusTransientTimer = 0;
    this.statusEl.dataset.tone = tone;
    this.statusEl.textContent = text;
    this.statusEl.classList.add("visible");
  }

  private getMatchProgress(): number {
    return this.sessionDuration > 0 ? clamp((this.sessionDuration - this.timeRemaining) / this.sessionDuration, 0, 1) : 0;
  }

  private getGoalDifferential(): number {
    return this.playerGoals - this.enemyGoals;
  }

  private getEnemyRubberBand(): number {
    const lead = Math.max(0, this.getGoalDifferential());
    const trail = Math.max(0, -this.getGoalDifferential());
    const periodRamp = this.currentPeriodIndex * 0.08;
    const timeRamp = this.getMatchProgress() * 0.12;
    return clamp(
      lead * 0.16 * this.monsterTeam.comebackBias - trail * 0.1 + periodRamp + timeRamp,
      -0.18,
      0.52
    );
  }

  private getPlayerAssist(): number {
    const lead = Math.max(0, this.getGoalDifferential());
    const trail = Math.max(0, -this.getGoalDifferential());
    const openingEase = this.currentPeriodIndex === 0 ? 0.08 : 0;
    return clamp(trail * 0.12 + openingEase - lead * 0.06, 0, 0.32);
  }

  private getPossessionLabel(): string {
    return this.possession === "PLAYER" ? "Offense" : "Defense";
  }

  private getPlayerShotThreshold(): number {
    const assist = this.getPlayerAssist();
    return Math.max(0.65, this.monsterTeam.playerGoalThreshold - assist * 0.18);
  }

  private getPlayerTakeawayThreshold(): number {
    const assist = this.getPlayerAssist();
    return Math.max(0.52, this.monsterTeam.playerTakeawayThreshold - assist * 0.16);
  }

  private getEnemyShotThreshold(): number {
    const rubberBand = this.getEnemyRubberBand();
    return clamp(this.monsterTeam.enemyGoalThreshold - rubberBand * 0.2, 0.65, 1.2);
  }

  private changePossession(next: Possession, reason: "TURNOVER" | "TAKEAWAY" | "FACEOFF" | "SAVE"): void {
    if (this.ended) {
      return;
    }
    if (reason !== "FACEOFF" && next !== this.possession && this.possessionLockTimer > 0) {
      return;
    }
    if (next === this.possession && reason !== "FACEOFF") {
      return;
    }

    this.possession = next;
    this.possessionLockTimer = 0.22;
    this.combo = 0;
    this.target = null;
    this.wasInsideTarget = false;
    this.spawnDelay = reason === "FACEOFF" ? 0.34 : 0.14;

    if (next === "PLAYER" && reason !== "FACEOFF") {
      this.playGameSfx("offense");
    } else if (reason === "TURNOVER") {
      this.playGameSfx("turnover");
    } else if (reason !== "FACEOFF") {
      this.playGameSfx("defense");
    }

    if (next === "PLAYER") {
      this.playerAttackCharge = clamp(this.playerAttackCharge * 0.15, 0, 2);
      this.enemyAttackCharge = clamp(this.enemyAttackCharge * 0.22, 0, 2);
      const banner = reason === "TAKEAWAY" ? "PUCK WON • OFFENSE" : reason === "SAVE" ? "SAVE • COUNTER" : "FACEOFF • OFFENSE";
      if (reason !== "FACEOFF") {
        this.flashCombo("OFFENSE", reason === "TAKEAWAY" ? "great" : "hit");
        this.showStatus(banner, "offense", 1.15);
      }
      const pad = this.getPadBounds();
      const cx = pad.x + pad.width * 0.5;
      const cy = pad.y + pad.height * 0.5;
      if (reason !== "FACEOFF") {
        this.effects.spawnFloatingText(cx, cy - Math.min(pad.width, pad.height) * 0.07, "OFFENSE", 202);
        this.effects.spawnShockwave(cx, cy, 202, 1.2);
        this.effects.triggerShake(0.34);
      }
    } else {
      this.enemyAttackCharge = Math.max(this.enemyAttackCharge * 0.25, 0.18 + this.currentPeriodIndex * 0.05);
      this.playerAttackCharge = clamp(this.playerAttackCharge * 0.12, 0, 2);
      const banner =
        reason === "TURNOVER" ? "TURNOVER • DEFEND" : reason === "SAVE" ? "MONSTERS RECOVER • DEFEND" : "FACEOFF • DEFEND";
      if (reason !== "FACEOFF") {
        this.flashCombo("DEFENSE", reason === "TURNOVER" ? "miss" : "late");
        this.showStatus(banner, "defense", 1.2);
      }
      const pad = this.getPadBounds();
      const cx = pad.x + pad.width * 0.5;
      const cy = pad.y + pad.height * 0.5;
      if (reason !== "FACEOFF") {
        this.effects.spawnFloatingText(cx, cy - Math.min(pad.width, pad.height) * 0.07, "DEFENSE", 14);
        this.effects.spawnShockwave(cx, cy, 14, 1.15);
        this.effects.triggerShake(0.38);
      }
    }
  }

  private resolvePlayerShotAttempt(): void {
    if (this.ended || this.possession !== "PLAYER") {
      return;
    }
    const comboBoost = Math.min(0.3, this.combo * 0.035);
    const perfectBoost = Math.min(0.18, this.perfects * 0.006);
    const rubberBand = this.getEnemyRubberBand();
    const chaosPenalty = Math.max(0, rubberBand) * 0.16;
    const pressurePenalty = this.riftPressure * 0.08;
    const chance = clamp(0.54 + comboBoost + perfectBoost - chaosPenalty - pressurePenalty, 0.34, 0.9);
    const roll = Math.random();
    if (roll <= chance) {
      this.scorePlayerGoal();
      this.changePossession("ENEMY", "FACEOFF");
      return;
    }

    const pad = this.getPadBounds();
    const cx = pad.x + pad.width * 0.5;
    const cy = pad.y + pad.height * 0.47;
    this.effects.spawnFloatingText(cx, cy, "SAVE!", 38);
    this.effects.spawnShockwave(cx, cy, 38, 1.15);
    this.effects.triggerShake(0.42);
    this.showStatus("Monster save • scramble", "defense", 0.95);

    const keepOffenseChance = clamp(0.22 + this.combo * 0.03 + this.getPlayerAssist() * 0.35, 0.18, 0.6);
    if (Math.random() < keepOffenseChance) {
      this.playerAttackCharge = clamp(0.22 + this.combo * 0.04, 0, 2);
      this.enemyAttackCharge = clamp(this.enemyAttackCharge + 0.08, 0, 2);
      this.flashCombo("REBOUND", "combo");
      this.spawnDelay = 0.08;
      return;
    }

    this.changePossession("ENEMY", "SAVE");
  }

  private resolveEnemyShotAttempt(reason: "COUNTER" | "SUSTAINED PRESSURE"): void {
    if (this.ended || this.possession !== "ENEMY") {
      return;
    }
    const pressure = clamp(this.riftPressure, 0, 1);
    const fracture = clamp(1 - this.sealIntegrity, 0, 1);
    const rubberBand = this.getEnemyRubberBand();
    const defensiveChain = Math.min(0.18, this.combo * 0.03);
    const chance = clamp(
      0.42 +
        pressure * 0.18 +
        fracture * 0.12 +
        Math.max(0, rubberBand) * 0.2 +
        (reason === "COUNTER" ? 0.06 : 0) -
        defensiveChain,
      0.22,
      0.86
    );

    if (Math.random() <= chance) {
      this.scoreEnemyGoal(reason);
      this.changePossession("PLAYER", "FACEOFF");
      return;
    }

    const pad = this.getPadBounds();
    const cx = pad.x + pad.width * 0.5;
    const cy = pad.y + pad.height * 0.53;
    this.effects.spawnFloatingText(cx, cy, "SAVE", 196);
    this.effects.spawnShockwave(cx, cy, 196, 1.05);
    this.effects.triggerShake(0.33);
    this.flashCombo("BIG SAVE", "great");
    this.showStatus("You survive the rush", "offense", 0.9);
    this.changePossession("PLAYER", "SAVE");
  }

  private getPeriodLabel(period: number): string {
    if (period === 1) {
      return "1st";
    }
    if (period === 2) {
      return "2nd";
    }
    if (period === 3) {
      return "3rd";
    }
    return `${period}th`;
  }

  private getCurrentPeriodIndex(): number {
    const elapsed = this.sessionDuration - this.timeRemaining;
    return clamp(Math.floor(elapsed / this.periodDurationSec), 0, this.periodCount - 1);
  }

  private updateMatchClockAndPeriods(): void {
    const periodIndex = this.getCurrentPeriodIndex();
    if (periodIndex !== this.currentPeriodIndex) {
      this.currentPeriodIndex = periodIndex;
      this.currentPeriod = periodIndex + 1;
      this.flashCombo(`${this.getPeriodLabel(this.currentPeriod)} PERIOD`, "hit");
      this.showStatus(
        `${this.getPeriodLabel(this.currentPeriod)} period • ${this.possession === "PLAYER" ? "you start on offense" : "hold the line"}`,
        this.possession === "PLAYER" ? "offense" : "defense",
        1.25
      );
      this.effects.triggerShake(0.28);
    }
  }

  private updateEnemyAttack(dt: number): void {
    if (this.possession !== "ENEMY") {
      const decay = 0.2 + this.getPlayerAssist() * 0.12;
      this.enemyAttackCharge = Math.max(0, this.enemyAttackCharge - decay * dt);
      return;
    }
    const phase = this.getThreatPhase();
    const pressure = clamp(this.riftPressure, 0, 1);
    const fracture = clamp(1 - this.sealIntegrity, 0, 1);
    const periodRamp = this.currentPeriodIndex * 0.014;
    const phaseBonus = phase === "BREACH" ? 0.038 : phase === "CRACKING" ? 0.016 : 0;
    const surgeBonus = this.breachSurgeTimer > 0 ? 0.03 : 0;
    const comboSuppression = Math.min(0.03, this.combo * 0.0026);
    const rubberBand = Math.max(0, this.getEnemyRubberBand());
    const gain =
      (0.015 +
        pressure * 0.035 +
        fracture * 0.03 +
        periodRamp +
        phaseBonus +
        surgeBonus +
        rubberBand * 0.03 -
        comboSuppression) *
      this.monsterTeam.offenseRate;

    this.enemyAttackCharge = clamp(this.enemyAttackCharge + gain * dt, 0, 1.25);
    const enemyShotThreshold = this.getEnemyShotThreshold();
    if (this.enemyAttackCharge >= enemyShotThreshold) {
      this.enemyAttackCharge -= enemyShotThreshold;
      this.resolveEnemyShotAttempt("SUSTAINED PRESSURE");
    }
  }

  private addPlayerAttackCharge(amount: number): void {
    if (amount <= 0 || this.ended) {
      return;
    }
    this.playerAttackCharge = clamp(this.playerAttackCharge + amount, 0, 2);
    const threshold = this.possession === "PLAYER" ? this.getPlayerShotThreshold() : this.getPlayerTakeawayThreshold();
    while (this.playerAttackCharge >= threshold && !this.ended) {
      this.playerAttackCharge -= threshold;
      if (this.possession === "PLAYER") {
        this.resolvePlayerShotAttempt();
      } else {
        this.changePossession("PLAYER", "TAKEAWAY");
      }
    }
  }

  private addEnemyAttackCharge(amount: number): void {
    if (amount <= 0 || this.ended) {
      return;
    }
    this.enemyAttackCharge = clamp(this.enemyAttackCharge + amount * this.monsterTeam.counterSpikeOnMiss, 0, 2);
    if (this.possession !== "ENEMY") {
      return;
    }
    const threshold = this.getEnemyShotThreshold();
    while (this.enemyAttackCharge >= threshold && !this.ended) {
      this.enemyAttackCharge -= threshold;
      this.resolveEnemyShotAttempt("COUNTER");
    }
  }

  private scorePlayerGoal(): void {
    const periodIndex = this.currentPeriodIndex;
    this.playerGoals += 1;
    this.playerGoalsByPeriod[periodIndex] = (this.playerGoalsByPeriod[periodIndex] ?? 0) + 1;

    const pad = this.getPadBounds();
    const cx = pad.x + pad.width * 0.5;
    const cy = pad.y + pad.height * 0.44;
    this.effects.spawnShockwave(cx, cy, 46, 2.6);
    this.effects.spawnFloatingText(cx, cy - Math.min(pad.width, pad.height) * 0.07, "GOAL", 46);
    this.effects.triggerShake(0.95);
    this.playGameSfx("goal");
    this.flashCombo(`${this.playerGoals}-${this.enemyGoals} • GOAL`, "great");
    this.showStatus(`GOAL • ${this.playerGoals}-${this.enemyGoals} ${this.monsterTeam.shortName}`, "goal", 1.35);

    this.riftPressure = clamp(this.riftPressure - 0.12, 0, 1);
    this.sealIntegrity = clamp(this.sealIntegrity + 0.04, 0, 1);
    this.enemyAttackCharge = clamp(this.enemyAttackCharge - 0.35, 0, 2);
    this.playerAttackCharge = 0;
  }

  private scoreEnemyGoal(reason: "COUNTER" | "SUSTAINED PRESSURE"): void {
    if (this.ended) {
      return;
    }
    const periodIndex = this.currentPeriodIndex;
    this.enemyGoals += 1;
    this.enemyGoalsByPeriod[periodIndex] = (this.enemyGoalsByPeriod[periodIndex] ?? 0) + 1;
    this.combo = 0;

    const pad = this.getPadBounds();
    const cx = pad.x + pad.width * 0.5;
    const cy = pad.y + pad.height * 0.54;
    this.effects.spawnShockwave(cx, cy, 6, 2.2);
    this.effects.spawnFloatingText(cx, cy - Math.min(pad.width, pad.height) * 0.05, "GOAL AGAINST", 8);
    this.effects.triggerShake(0.85);
    this.playGameSfx("goal_against");
    this.flashCombo(`${this.playerGoals}-${this.enemyGoals} • ${reason}`, "miss");
    this.showStatus(`GOAL AGAINST • ${this.playerGoals}-${this.enemyGoals}`, "danger", 1.35);

    this.riftPressure = clamp(this.riftPressure + 0.08, 0, 1);
    this.sealIntegrity = clamp(this.sealIntegrity - 0.03, 0, 1);
    this.playerAttackCharge = clamp(this.playerAttackCharge - 0.25, 0, 2);
    this.enemyAttackCharge = 0;
  }

  private getMatchResult(): MatchResult {
    if (this.endReason === "breach") {
      return "loss";
    }
    if (this.playerGoals > this.enemyGoals) {
      return "win";
    }
    if (this.playerGoals < this.enemyGoals) {
      return "loss";
    }
    return "tie";
  }

  private updateHud(): void {
    const elapsedTotal = this.sessionDuration - this.timeRemaining;
    const periodIndex = this.getCurrentPeriodIndex();
    const periodStart = periodIndex * this.periodDurationSec;
    const periodElapsed = clamp(elapsedTotal - periodStart, 0, this.periodDurationSec);
    const periodTimeRemaining = clamp(this.periodDurationSec - periodElapsed, 0, this.periodDurationSec);
    const periodTimeProgress = this.periodDurationSec > 0 ? clamp(periodTimeRemaining / this.periodDurationSec, 0, 1) : 0;

    this.timerEl.textContent = formatClockMmSs(periodTimeRemaining);
    setArcaneScoreboardScore(this.scoreboardRefs, this.playerGoals, this.enemyGoals);
    this.comboEl.textContent = `x${this.combo}`;

    const timeProgress = periodTimeProgress;
    const timeUrgency = 1 - timeProgress;
    const possessionThreshold =
      this.possession === "PLAYER" ? this.getPlayerShotThreshold() : this.getPlayerTakeawayThreshold();
    const scoreBandProgress = clamp(this.playerAttackCharge / Math.max(0.0001, possessionThreshold), 0, 1);
    const comboProgress = clamp(this.combo / 8, 0, 1);
    const comboHeat = clamp(this.combo / 12, 0, 1);

    this.timeDialEl.style.setProperty("--progress", timeProgress.toFixed(4));
    this.timeDialEl.style.setProperty("--urgency", timeUrgency.toFixed(4));
    this.scoreDialEl.style.setProperty("--progress", scoreBandProgress.toFixed(4));
    this.comboStatEl.style.setProperty("--progress", comboProgress.toFixed(4));
    this.comboStatEl.style.setProperty("--combo-heat", comboHeat.toFixed(4));

    this.timeDialEl.dataset.state =
      timeProgress <= 0.2 ? "critical" : timeProgress <= 0.45 ? "warning" : "stable";
    this.comboStatEl.dataset.state =
      this.combo >= 8 ? "overdrive" : this.combo >= 4 ? "hot" : this.combo >= 1 ? "warm" : "idle";

    this.periodRailEl.textContent = `P${this.currentPeriod}/${this.periodCount} • ${this.getPeriodLabel(this.currentPeriod)} • ${this.getPossessionLabel()}`;
    this.scoreLabelEl.textContent = this.ended ? "Final" : this.getPossessionLabel();

    this.timeDialSubEl.textContent = this.ended
      ? this.endReason === "breach"
        ? "Seal shattered"
        : "Final horn"
      : `${this.getPeriodLabel(this.currentPeriod)} • ${Math.round(periodTimeRemaining)}s left`;
    this.scoreDialSubEl.textContent = this.ended
      ? `${this.monsterTeam.shortName} • Runes ${this.score.toLocaleString()}`
      : `${this.possession === "PLAYER" ? "Shot" : "Takeaway"} ${Math.round(scoreBandProgress * 100)}% • Runes ${this.score.toLocaleString()}`;
    this.comboDialSubEl.textContent =
      this.combo > 0
        ? `${this.possession === "PLAYER" ? "Quick chain" : "Stop chain"} • x${this.combo}`
        : this.possession === "PLAYER"
          ? "Quick hits build shots"
          : "Quick stops win puck";

    const integrity = clamp(this.sealIntegrity, 0, 1);
    const pressure = clamp(this.riftPressure, 0, 1);
    const phase = this.getThreatPhase();
    const integrityThreat = 1 - integrity;
    let threatDisplay = Math.max(pressure * 0.86, integrityThreat * 0.96);
    if (phase === "CRACKING") {
      threatDisplay = Math.max(threatDisplay, 0.46 + Math.max(pressure, integrityThreat) * 0.34);
    }
    if (phase === "BREACH") {
      const breachPulse = clamp(this.breachSurgeTimer / 2.6, 0, 1);
      const breachOutro = this.endReason === "breach" ? clamp(this.breachOutroTimer / this.breachOutroDuration, 0, 1) : 0;
      threatDisplay = Math.max(threatDisplay, 0.82 + Math.max(breachPulse * 0.18, breachOutro * 0.12));
    }
    threatDisplay = clamp(threatDisplay, 0, 1);
    this.integrityFillEl.style.width = `${(integrity * 100).toFixed(1)}%`;
    this.pressureFillEl.style.height = `${(threatDisplay * 100).toFixed(1)}%`;
    this.panelEl.dataset.threat = phase;
    this.panelEl.dataset.possession = this.possession;
    this.comboStatEl.style.setProperty("--combo-pips-fill", String(Math.min(5, this.combo)));
    for (let i = 0; i < this.comboPipsEls.length; i += 1) {
      const pip = this.comboPipsEls[i];
      pip.classList.toggle("is-active", i < Math.min(5, this.combo));
      pip.classList.toggle("is-overflow", this.combo >= 6 && i === this.comboPipsEls.length - 1);
    }

    let phaseText = `Threat: Stable • ${this.getPossessionLabel()}`;
    if (phase === "CRACKING") {
      phaseText = `Threat: Cracking Ice • ${this.getPossessionLabel()}`;
    } else if (phase === "BREACH") {
      phaseText = `Threat: Breach Surge${this.breachCount > 0 ? ` • ${this.breachCount}` : ""} • ${this.getPossessionLabel()}`;
    } else if (this.breachCount > 0) {
      phaseText = `Threat: Stable • Breaches ${this.breachCount} • ${this.getPossessionLabel()}`;
    }
    this.phaseEl.textContent = phaseText;
  }

  private pulseComboStat(): void {
    if (!this.comboStatEl) {
      return;
    }
    this.comboStatEl.classList.remove("is-pulsing");
    // Force reflow so rapid hits can retrigger the CSS animation.
    void this.comboStatEl.offsetWidth;
    this.comboStatEl.classList.add("is-pulsing");
  }

  private updateEndedState(dt: number): void {
    if (this.endReason === "timer") {
      this.breachSurgeTimer = Math.max(0, this.breachSurgeTimer - dt);
      if (this.finishOutroTimer <= 0) {
        this.emitSessionEnd();
        return;
      }

      const previousTimer = this.finishOutroTimer;
      this.finishOutroTimer = Math.max(0, this.finishOutroTimer - dt);
      const previousProgress = clamp(1 - previousTimer / this.finishOutroDuration, 0, 1);
      const progress = clamp(1 - this.finishOutroTimer / this.finishOutroDuration, 0, 1);

      const pad = this.getPadBounds();
      const cx = pad.x + pad.width * 0.5;
      const cy = pad.y + pad.height * 0.5;
      const minDim = Math.min(pad.width, pad.height);
      const power = clamp(this.finishOutroPower, 0.95, 2.05);
      const hue = this.finishOutroResult === "win" ? 46 : this.finishOutroResult === "tie" ? 204 : 28;

      if (this.finishOutroBurstStage === 0 && progress >= 0.08) {
        this.finishOutroBurstStage = 1;
        this.effects.spawnShockwave(cx, cy, hue, 1.6 * power);
        this.effects.triggerShake(0.45 * power);
        this.effects.spawnFloatingText(cx, cy - minDim * 0.09, "FINAL HORN", hue);
        this.flashCombo("FINAL HORN", this.finishOutroResult === "win" ? "great" : "hit");
      }

      if (this.finishOutroBurstStage === 1 && progress >= 0.34) {
        this.finishOutroBurstStage = 2;
        const burstCount = this.finishOutroResult === "win" ? 4 : this.finishOutroResult === "tie" ? 3 : 2;
        for (let i = 0; i < burstCount; i += 1) {
          const a = (Math.PI * 2 * i) / burstCount + progress * 1.4;
          const r = minDim * (0.11 + i * 0.035);
          const x = cx + Math.cos(a) * r;
          const y = cy + Math.sin(a) * r;
          this.effects.spawnHitBurst(x, y, hue + i * 6, (1.35 + i * 0.12) * power);
        }
        this.effects.spawnShockwave(cx, cy, hue, 1.95 * power);
        this.effects.triggerShake((this.finishOutroResult === "win" ? 0.72 : 0.56) * power);
        const label =
          this.finishOutroResult === "win" ? "VICTORY" : this.finishOutroResult === "tie" ? "DRAW" : "FINAL";
        this.effects.spawnFloatingText(cx, cy + minDim * 0.02, label, hue);
      }

      if (this.finishOutroBurstStage === 2 && progress >= 0.6) {
        this.finishOutroBurstStage = 3;
        if (this.finishOutroResult === "win") {
          for (let i = 0; i < 6; i += 1) {
            const a = (Math.PI * 2 * i) / 6 + progress * 0.6;
            const r = minDim * 0.28;
            this.effects.spawnHitBurst(cx + Math.cos(a) * r, cy + Math.sin(a) * r, 46 + i * 4, 1.35 * power);
          }
          this.playGameSfx("victory");
          this.flashCombo(`${this.playerGoals}-${this.enemyGoals} • VICTORY`, "perfect");
          this.effects.triggerShake(0.58 * power);
        } else if (this.finishOutroResult === "tie") {
          this.flashCombo(`${this.playerGoals}-${this.enemyGoals} • DRAW`, "great");
          this.effects.triggerShake(0.38 * power);
        } else {
          this.playGameSfx("loss");
          this.flashCombo(`${this.playerGoals}-${this.enemyGoals} • DEFEAT`, "late");
          this.effects.triggerShake(0.3 * power);
        }
        this.pinStatus(this.statusEl.textContent || "Match complete", this.finishOutroResult === "loss" ? "danger" : "goal");
      }

      if (previousProgress < 0.82 && progress >= 0.82) {
        this.effects.spawnShockwave(cx, cy, hue, 1.45 * power);
        this.effects.triggerShake(0.3 * power);
      }

      if (this.finishOutroTimer <= 0) {
        this.emitSessionEnd();
      }
      return;
    }

    if (this.endReason !== "breach") {
      this.emitSessionEnd();
      return;
    }

    this.breachSurgeTimer = Math.max(0, this.breachSurgeTimer - dt);
    if (this.breachOutroTimer <= 0) {
      this.emitSessionEnd();
      return;
    }

    const previousTimer = this.breachOutroTimer;
    this.breachOutroTimer = Math.max(0, this.breachOutroTimer - dt);
    const previousProgress = clamp(1 - previousTimer / this.breachOutroDuration, 0, 1);
    const progress = clamp(1 - this.breachOutroTimer / this.breachOutroDuration, 0, 1);

    const pad = this.getPadBounds();
    const cx = pad.x + pad.width * 0.5;
    const cy = pad.y + pad.height * 0.5;
    const minDim = Math.min(pad.width, pad.height);

    const outroPower = clamp(this.breachOutroPower, 1, 2.2);

    if (this.breachOutroBurstStage === 0 && progress >= 0.16) {
      this.breachOutroBurstStage = 1;
      this.effects.spawnShockwave(cx, cy, 14, 2.1 * outroPower);
      this.effects.spawnShockwave(cx, cy, 6, 1.55 * outroPower);
      this.effects.triggerShake(0.75 * outroPower);
      this.effects.spawnFloatingText(cx, cy + minDim * 0.03, "SEAL FAILING", 18);
    }

    if (this.breachOutroBurstStage === 1 && progress >= 0.44) {
      this.breachOutroBurstStage = 2;
      for (let i = 0; i < 3; i += 1) {
        const a = (Math.PI * 2 * i) / 3 + progress * 1.7;
        const r = minDim * (0.12 + i * 0.04);
        const x = cx + Math.cos(a) * r;
        const y = cy + Math.sin(a) * r;
        this.effects.spawnHitBurst(x, y, 18 + i * 8, (1.5 + i * 0.18) * outroPower);
      }
      this.effects.spawnShockwave(cx, cy, 8, 2.25 * outroPower);
      this.effects.triggerShake(0.95 * outroPower);
      this.flashCombo("RIFT OPENING", "late");
    }

    if (this.breachOutroBurstStage === 2 && progress >= 0.76) {
      this.breachOutroBurstStage = 3;
      this.effects.spawnShockwave(cx, cy, 0, 2.5 * outroPower);
      this.effects.spawnShockwave(cx, cy, 22, 2.65 * outroPower);
      this.effects.spawnHitBurst(cx, cy, 12, 2.2 * outroPower);
      this.effects.triggerShake(1.1 * outroPower);
      this.effects.spawnFloatingText(cx, cy - minDim * 0.02, "GAME OVER", 6);
      this.playGameSfx("loss");
      this.flashCombo("SEAL SHATTERED", "miss");
      this.pinStatus(this.statusEl.textContent || "Seal shattered", "danger");
    }

    if (previousProgress < 0.9 && progress >= 0.9) {
      this.effects.triggerShake(0.55 * outroPower);
    }

    if (this.breachOutroTimer <= 0) {
      this.emitSessionEnd();
    }
  }

  private updateTension(dt: number): void {
    this.breachSurgeTimer = Math.max(0, this.breachSurgeTimer - dt);

    const elapsed = this.sessionDuration - this.timeRemaining;
    const endgame = clamp(elapsed / this.sessionDuration, 0, 1);
    const comboWardRate = this.combo > 0 ? Math.min(0.028, this.combo * 0.0035) : 0;
    const possessionPressureBias = this.possession === "ENEMY" ? 0.018 : -0.006;
    const possessionDrainBias = this.possession === "ENEMY" ? 0.006 : -0.002;

    const pressureGainRate =
      0.045 +
      endgame * 0.055 +
      (1 - this.sealIntegrity) * 0.05 +
      (this.breachSurgeTimer > 0 ? 0.07 : 0) +
      possessionPressureBias;
    const integrityDrainRate =
      0.012 +
      this.riftPressure * 0.022 +
      endgame * 0.008 +
      (this.breachSurgeTimer > 0 ? 0.015 : 0) +
      possessionDrainBias;

    this.riftPressure = clamp(this.riftPressure + pressureGainRate * dt - comboWardRate * 0.6 * dt, 0, 1);
    this.sealIntegrity = clamp(this.sealIntegrity - integrityDrainRate * dt + comboWardRate * dt, 0, 1);
    this.lowestIntegrity = Math.min(this.lowestIntegrity, this.sealIntegrity);

    if (this.sealIntegrity <= 0.0001) {
      this.triggerBreach();
    }
  }

  private applyMissPressure(): void {
    const onOffense = this.possession === "PLAYER";
    this.riftPressure = clamp(
      this.riftPressure + (onOffense ? 0.11 : 0.15) + (this.breachSurgeTimer > 0 ? 0.04 : 0),
      0,
      1
    );
    this.sealIntegrity = clamp(this.sealIntegrity - (onOffense ? 0.07 : 0.095), 0, 1);
    this.addEnemyAttackCharge(onOffense ? 0.14 : 0.28);
    if (onOffense && !this.ended) {
      this.changePossession("ENEMY", "TURNOVER");
    } else if (!this.ended) {
      this.playGameSfx("warning");
      this.showStatus("Defensive miss • enemy rush", "danger", 1.05);
    }
    this.lowestIntegrity = Math.min(this.lowestIntegrity, this.sealIntegrity);
    if (this.sealIntegrity <= 0.0001) {
      this.triggerBreach();
    }
  }

  private triggerBreach(): void {
    if (this.ended) {
      return;
    }
    const comboAtFail = this.combo;
    this.breachCount += 1;
    this.breachSurgeTimer = 2.6;
    this.sealIntegrity = 0.28;
    this.riftPressure = clamp(Math.max(this.riftPressure, 0.72) + 0.08, 0, 1);
    this.combo = 0;
    this.target = null;
    this.wasInsideTarget = false;
    this.ended = true;
    this.endReason = "breach";
    this.breachOutroTimer = this.breachOutroDuration;
    this.breachOutroBurstStage = 0;
    const comboCharge = comboAtFail * 0.75 + this.bestCombo * 0.35;
    this.breachOutroPower = clamp(1 + comboCharge * 0.045, 1, 2.1);

    const pad = this.getPadBounds();
    const cx = pad.x + pad.width * 0.5;
    const cy = pad.y + pad.height * 0.5;
    this.effects.spawnShockwave(cx, cy, 18, 1.95 * this.breachOutroPower);
    this.effects.spawnFloatingText(cx, cy - Math.min(pad.width, pad.height) * 0.08, "BREACH", 18);
    this.effects.triggerShake(0.95 * this.breachOutroPower);
    this.playGameSfx("warning");
    this.statusPersistent = false;
    this.statusTransientTimer = 0;
    this.statusEl.dataset.tone = "danger";
    this.statusEl.textContent = `Seal shattered • ${this.playerGoals}-${this.enemyGoals} vs ${this.monsterTeam.shortName} • Breaches ${this.breachCount}`;
    this.statusEl.classList.remove("visible");
    this.flashCombo("BREACH!", "late");
  }

  private getThreatPhase(): ThreatPhase {
    if (this.breachSurgeTimer > 0.05 || this.riftPressure >= 0.82 || this.sealIntegrity <= 0.2) {
      return "BREACH";
    }
    if (this.riftPressure >= 0.45 || this.sealIntegrity <= 0.58) {
      return "CRACKING";
    }
    return "STABLE";
  }

  private renderThreatEnvironment(ctx: CanvasRenderingContext2D, padRect: Rect, timeSec: number): void {
    const pressure = clamp(this.riftPressure, 0, 1);
    const fracture = clamp(1 - this.sealIntegrity, 0, 1);
    const breachPulse = clamp(this.breachSurgeTimer / 2.6, 0, 1);
    if (pressure < 0.03 && fracture < 0.03 && breachPulse < 0.01) {
      return;
    }

    const minDim = Math.min(padRect.width, padRect.height);
    const cx = padRect.x + padRect.width * 0.5;
    const cy = padRect.y + padRect.height * 0.5;
    const padRadius = minDim * 0.035;

    ctx.save();
    ctx.beginPath();
    ctx.roundRect(padRect.x, padRect.y, padRect.width, padRect.height, padRadius);
    ctx.clip();

    // Ominous heat/lava tint that builds with pressure.
    const heatAlpha = pressure * 0.14 + breachPulse * 0.18;
    const heat = ctx.createRadialGradient(cx, cy + minDim * 0.12, minDim * 0.05, cx, cy + minDim * 0.12, minDim * 0.8);
    heat.addColorStop(0, `rgba(255, 120, 70, ${(heatAlpha * 0.35).toFixed(3)})`);
    heat.addColorStop(0.45, `rgba(255, 72, 44, ${(heatAlpha * 0.22).toFixed(3)})`);
    heat.addColorStop(1, "rgba(255, 72, 44, 0)");
    ctx.fillStyle = heat;
    ctx.fillRect(padRect.x, padRect.y, padRect.width, padRect.height);

    this.renderCracksAndLava(ctx, padRect, fracture, pressure, timeSec, breachPulse);

    if (pressure > 0.35 || breachPulse > 0.05) {
      this.renderHellfireEdges(ctx, padRect, timeSec, pressure, breachPulse);
    }

    if (pressure > 0.58 || breachPulse > 0.1) {
      this.renderMonsterPresence(ctx, padRect, timeSec, pressure, breachPulse);
    }

    const breachOutroProgress =
      this.endReason === "breach" && this.breachOutroTimer > 0
        ? clamp(1 - this.breachOutroTimer / this.breachOutroDuration, 0, 1)
        : 0;
    const finishOutroProgress =
      this.endReason === "timer" && this.finishOutroTimer > 0
        ? clamp(1 - this.finishOutroTimer / this.finishOutroDuration, 0, 1)
        : 0;
    if (finishOutroProgress > 0) {
      this.renderFinishOutro(ctx, padRect, timeSec, finishOutroProgress);
    }
    if (breachOutroProgress > 0) {
      this.renderBreachOutro(ctx, padRect, timeSec, breachOutroProgress, breachPulse);
    }

    if (breachPulse > 0.02) {
      const flash = Math.sin(timeSec * 22) * 0.5 + 0.5;
      ctx.fillStyle = `rgba(255, 118, 78, ${(breachPulse * (0.04 + flash * 0.05)).toFixed(3)})`;
      ctx.fillRect(padRect.x, padRect.y, padRect.width, padRect.height);
    }

    ctx.restore();
  }

  private renderBreachOutro(
    ctx: CanvasRenderingContext2D,
    padRect: Rect,
    timeSec: number,
    progress: number,
    breachPulse: number
  ): void {
    const minDim = Math.min(padRect.width, padRect.height);
    const cx = padRect.x + padRect.width * 0.5;
    const cy = padRect.y + padRect.height * 0.5;
    const power = clamp(this.breachOutroPower, 1, 2.2);
    const ringRadius = minDim * (0.16 + progress * 0.2) * (0.96 + (power - 1) * 0.12);
    const slitWidth = minDim * (0.02 + progress * 0.22) * (0.95 + (power - 1) * 0.2);
    const slitHeight = minDim * (0.06 + progress * 0.28) * (0.95 + (power - 1) * 0.14);
    const pulse = 0.5 + 0.5 * Math.sin(timeSec * (12 + progress * 26));
    const quake = 1 + breachPulse * 0.35 + (power - 1) * 0.18;

    // Collapsing seal rings pulled into the rift.
    for (let i = 0; i < 4; i += 1) {
      const t = clamp((progress - i * 0.13) / (1 - i * 0.13), 0, 1);
      if (t <= 0) {
        continue;
      }
      const r = ringRadius * (1.2 + i * 0.22) * (1 - t * 0.75);
      const alpha = (1 - t) * (0.16 + (3 - i) * 0.04) * (0.92 + (power - 1) * 0.18);
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(timeSec * (0.8 + i * 0.22) * (i % 2 ? -1 : 1) * quake);
      ctx.strokeStyle = `rgba(255, ${200 - i * 22}, ${120 - i * 10}, ${alpha.toFixed(3)})`;
      ctx.lineWidth = 1.8 + (1 - t) * 1.4;
      ctx.shadowColor = `rgba(255, 134, 82, ${(alpha * 0.75).toFixed(3)})`;
      ctx.shadowBlur = 10 + (1 - t) * 8 + (power - 1) * 4;
      ctx.beginPath();
      for (let s = 0; s < 8; s += 1) {
        const a0 = (Math.PI * 2 * s) / 8 + 0.12;
        const a1 = a0 + Math.PI / 8;
        ctx.arc(0, 0, r, a0, a1);
      }
      ctx.stroke();
      ctx.restore();
    }

    // Core rift glow and dark slit opening.
    const riftGlow = ctx.createRadialGradient(cx, cy, minDim * 0.03, cx, cy, minDim * 0.42);
    riftGlow.addColorStop(
      0,
      `rgba(255, 243, 214, ${(0.08 + progress * 0.28 + pulse * 0.08 + (power - 1) * 0.05).toFixed(3)})`
    );
    riftGlow.addColorStop(0.35, `rgba(255, 122, 76, ${(0.12 + progress * 0.22 + (power - 1) * 0.04).toFixed(3)})`);
    riftGlow.addColorStop(0.75, `rgba(199, 48, 24, ${(0.05 + progress * 0.12 + (power - 1) * 0.02).toFixed(3)})`);
    riftGlow.addColorStop(1, "rgba(199, 48, 24, 0)");
    ctx.fillStyle = riftGlow;
    ctx.beginPath();
    ctx.arc(cx, cy, minDim * (0.18 + progress * 0.28), 0, Math.PI * 2);
    ctx.fill();

    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(Math.sin(timeSec * 3.6) * 0.04);
    ctx.shadowColor = `rgba(255, 126, 84, ${(0.22 + progress * 0.38).toFixed(3)})`;
    ctx.shadowBlur = 18 + progress * 18 + (power - 1) * 8;
    ctx.fillStyle = `rgba(12, 5, 6, ${(0.55 + progress * 0.35).toFixed(3)})`;
    ctx.beginPath();
    ctx.ellipse(0, 0, slitWidth, slitHeight, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = `rgba(255, 188, 138, ${(0.12 + progress * 0.36 + pulse * 0.08).toFixed(3)})`;
    ctx.lineWidth = 1.2 + progress * 2.2;
    ctx.beginPath();
    ctx.ellipse(0, 0, slitWidth * 1.02, slitHeight * 1.02, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();

    // Radial fracture spears expanding outward.
    const spearCount = 10;
    for (let i = 0; i < spearCount; i += 1) {
      const a = (Math.PI * 2 * i) / spearCount + progress * 0.6 + Math.sin(i * 7.1) * 0.08;
      const inner = minDim * (0.07 + progress * 0.06);
      const outer = minDim * (0.18 + progress * 0.34 + (i % 3) * 0.02) * (0.98 + (power - 1) * 0.1);
      const jitter = (0.5 + 0.5 * Math.sin(timeSec * 15 + i * 1.4)) * progress * (10 + (power - 1) * 7);
      const x0 = cx + Math.cos(a) * inner;
      const y0 = cy + Math.sin(a) * inner;
      const x1 = cx + Math.cos(a) * (outer + jitter);
      const y1 = cy + Math.sin(a) * (outer + jitter);
      ctx.save();
      ctx.strokeStyle = `rgba(255, ${126 + (i % 3) * 20}, 78, ${(0.1 + progress * 0.26).toFixed(3)})`;
      ctx.lineWidth = 1.4 + (i % 2) * 0.9;
      ctx.shadowColor = `rgba(255, 116, 76, ${(0.08 + progress * 0.18).toFixed(3)})`;
      ctx.shadowBlur = 10 + (power - 1) * 4;
      ctx.beginPath();
      ctx.moveTo(x0, y0);
      ctx.lineTo(x1, y1);
      ctx.stroke();
      ctx.restore();
    }

    if (progress > 0.72) {
      const whiteFlash =
        clamp((progress - 0.72) / 0.18, 0, 1) * (1 - clamp((progress - 0.9) / 0.1, 0, 1) * 0.8);
      if (whiteFlash > 0.01) {
        ctx.fillStyle = `rgba(255, 244, 224, ${(whiteFlash * (0.16 + (power - 1) * 0.06)).toFixed(3)})`;
        ctx.fillRect(padRect.x, padRect.y, padRect.width, padRect.height);
      }
    }
  }

  private renderFinishOutro(
    ctx: CanvasRenderingContext2D,
    padRect: Rect,
    timeSec: number,
    progress: number
  ): void {
    const minDim = Math.min(padRect.width, padRect.height);
    const cx = padRect.x + padRect.width * 0.5;
    const cy = padRect.y + padRect.height * 0.5;
    const power = clamp(this.finishOutroPower, 0.95, 2.05);
    const hue = this.finishOutroResult === "win" ? 46 : this.finishOutroResult === "tie" ? 204 : 28;
    const pulse = 0.5 + 0.5 * Math.sin(timeSec * (7.5 + progress * 6));
    const flare = clamp((progress - 0.08) / 0.34, 0, 1) * (1 - clamp((progress - 0.82) / 0.18, 0, 1));
    const crown = clamp((progress - 0.28) / 0.44, 0, 1);

    // Stabilizing or final-horn rune waves.
    for (let i = 0; i < 4; i += 1) {
      const t = clamp((progress - i * 0.1) / (0.72 - i * 0.06), 0, 1);
      if (t <= 0) {
        continue;
      }
      const radius = minDim * (0.1 + i * 0.06 + t * (0.18 + i * 0.02)) * (0.96 + (power - 1) * 0.08);
      const alpha = (1 - t) * (0.15 + (3 - i) * 0.03) * (this.finishOutroResult === "win" ? 1.1 : 0.8);
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(timeSec * (0.5 + i * 0.18) * (i % 2 ? -1 : 1));
      ctx.strokeStyle = `hsla(${hue} 100% ${this.finishOutroResult === "win" ? 78 : 72}% / ${alpha.toFixed(3)})`;
      ctx.lineWidth = 1.4 + (1 - t) * 1.6;
      ctx.shadowColor = `hsla(${hue} 100% ${this.finishOutroResult === "win" ? 72 : 66}% / ${(alpha * 0.8).toFixed(3)})`;
      ctx.shadowBlur = 10 + (1 - t) * 8;
      ctx.beginPath();
      for (let s = 0; s < 10; s += 1) {
        const a0 = (Math.PI * 2 * s) / 10 + (i % 2 ? 0.12 : -0.08);
        const a1 = a0 + 0.2 + (pulse - 0.5) * 0.05;
        ctx.arc(0, 0, radius, a0, a1);
      }
      ctx.stroke();
      ctx.restore();
    }

    // Central seal flare.
    const core = ctx.createRadialGradient(cx, cy, minDim * 0.02, cx, cy, minDim * (0.22 + flare * 0.18));
    if (this.finishOutroResult === "win") {
      core.addColorStop(0, `rgba(255, 241, 198, ${(0.06 + flare * 0.18 + pulse * 0.05 * flare).toFixed(3)})`);
      core.addColorStop(0.4, `rgba(255, 198, 94, ${(0.08 + flare * 0.18).toFixed(3)})`);
      core.addColorStop(0.72, `rgba(94, 209, 255, ${(0.04 + flare * 0.09).toFixed(3)})`);
      core.addColorStop(1, "rgba(94, 209, 255, 0)");
    } else if (this.finishOutroResult === "tie") {
      core.addColorStop(0, `rgba(209, 241, 255, ${(0.05 + flare * 0.12 + pulse * 0.03 * flare).toFixed(3)})`);
      core.addColorStop(0.42, `rgba(118, 226, 255, ${(0.05 + flare * 0.12).toFixed(3)})`);
      core.addColorStop(1, "rgba(118, 226, 255, 0)");
    } else {
      core.addColorStop(0, `rgba(255, 228, 186, ${(0.04 + flare * 0.1 + pulse * 0.02 * flare).toFixed(3)})`);
      core.addColorStop(0.42, `rgba(255, 165, 102, ${(0.04 + flare * 0.11).toFixed(3)})`);
      core.addColorStop(1, "rgba(255, 165, 102, 0)");
    }
    ctx.fillStyle = core;
    ctx.beginPath();
    ctx.arc(cx, cy, minDim * (0.12 + flare * 0.22), 0, Math.PI * 2);
    ctx.fill();

    // Victory crown rays / final horn rays.
    if (crown > 0.01) {
      const rayCount = this.finishOutroResult === "win" ? 16 : 12;
      for (let i = 0; i < rayCount; i += 1) {
        const a = (Math.PI * 2 * i) / rayCount + timeSec * 0.16;
        const inner = minDim * (0.12 + crown * 0.04);
        const outer = minDim * (0.24 + crown * 0.18 + (i % 3) * 0.01) * (0.98 + (power - 1) * 0.07);
        const alpha = (0.02 + crown * 0.08) * (this.finishOutroResult === "win" ? 1 : 0.65);
        ctx.save();
        ctx.strokeStyle = `hsla(${hue} 100% ${this.finishOutroResult === "win" ? 76 : 68}% / ${alpha.toFixed(3)})`;
        ctx.lineWidth = 1 + (i % 2 ? 0.7 : 0.2);
        ctx.shadowColor = `hsla(${hue} 100% 70% / ${(alpha * 0.8).toFixed(3)})`;
        ctx.shadowBlur = 8;
        ctx.beginPath();
        ctx.moveTo(cx + Math.cos(a) * inner, cy + Math.sin(a) * inner);
        ctx.lineTo(cx + Math.cos(a) * outer, cy + Math.sin(a) * outer);
        ctx.stroke();
        ctx.restore();
      }
    }

    // Final white-gold wash before the fade.
    if (progress > 0.68) {
      const wash = clamp((progress - 0.68) / 0.2, 0, 1) * (1 - clamp((progress - 0.92) / 0.08, 0, 1) * 0.85);
      if (wash > 0.01) {
        const tint = this.finishOutroResult === "win" ? "255, 240, 205" : this.finishOutroResult === "tie" ? "226, 243, 255" : "255, 226, 190";
        ctx.fillStyle = `rgba(${tint}, ${(wash * (0.12 + (power - 1) * 0.03)).toFixed(3)})`;
        ctx.fillRect(padRect.x, padRect.y, padRect.width, padRect.height);
      }
    }
  }

  private renderCracksAndLava(
    ctx: CanvasRenderingContext2D,
    padRect: Rect,
    fracture: number,
    pressure: number,
    timeSec: number,
    breachPulse: number
  ): void {
    if (fracture < 0.08 && breachPulse < 0.05) {
      return;
    }

    const cx = padRect.x + padRect.width * 0.5;
    const cy = padRect.y + padRect.height * 0.5;
    const rx = padRect.width * 0.46;
    const ry = padRect.height * 0.42;
    const crackCount = 4 + Math.floor(fracture * 8) + (breachPulse > 0.1 ? 2 : 0);
    const crackAlpha = Math.min(0.45, 0.08 + fracture * 0.35 + breachPulse * 0.22);
    const lavaAlpha = Math.max(0, (fracture - 0.18) * 0.45 + breachPulse * 0.4 + pressure * 0.12);

    for (let i = 0; i < crackCount; i += 1) {
      const angle = (Math.PI * 2 * i) / crackCount + Math.sin(i * 4.3) * 0.22;
      const edgeX = cx + Math.cos(angle) * rx;
      const edgeY = cy + Math.sin(angle) * ry;
      const innerX = cx + Math.cos(angle) * (rx * (0.14 + ((i % 3) * 0.05))) + Math.sin(i * 1.9) * padRect.width * 0.03;
      const innerY = cy + Math.sin(angle) * (ry * (0.14 + ((i % 2) * 0.06))) + Math.cos(i * 1.6) * padRect.height * 0.025;

      const segs = 6;
      ctx.beginPath();
      for (let s = 0; s <= segs; s += 1) {
        const t = s / segs;
        const wobble = (1 - t) * (6 + fracture * 10);
        const wobbleX = Math.sin(i * 9.2 + s * 1.3) * wobble;
        const wobbleY = Math.cos(i * 7.7 + s * 1.1) * wobble;
        const x = edgeX + (innerX - edgeX) * t + wobbleX;
        const y = edgeY + (innerY - edgeY) * t + wobbleY;
        if (s === 0) {
          ctx.moveTo(x, y);
        } else {
          ctx.lineTo(x, y);
        }
      }

      ctx.save();
      ctx.strokeStyle = `rgba(6, 10, 14, ${crackAlpha.toFixed(3)})`;
      ctx.lineWidth = 2.2 + fracture * 1.6;
      ctx.lineCap = "round";
      ctx.stroke();

      if (lavaAlpha > 0.02) {
        const pulse = 0.5 + 0.5 * Math.sin(timeSec * 6.5 + i * 1.7);
        ctx.strokeStyle = `rgba(255, 116, 64, ${(lavaAlpha * (0.45 + pulse * 0.35)).toFixed(3)})`;
        ctx.shadowColor = `rgba(255, 120, 70, ${(lavaAlpha * 0.5).toFixed(3)})`;
        ctx.shadowBlur = 10;
        ctx.lineWidth = 1.0 + fracture * 0.8;
        ctx.stroke();
      }
      ctx.restore();
    }
  }

  private renderHellfireEdges(
    ctx: CanvasRenderingContext2D,
    padRect: Rect,
    timeSec: number,
    pressure: number,
    breachPulse: number
  ): void {
    const flames = 5 + Math.floor(pressure * 8);
    const baseY = padRect.y + padRect.height - 3;
    const width = padRect.width / flames;
    const amp = (padRect.height * 0.035 + pressure * padRect.height * 0.06) * (1 + breachPulse * 0.35);

    for (let i = 0; i < flames; i += 1) {
      const x0 = padRect.x + i * width;
      const x1 = x0 + width;
      const phase = timeSec * (1.7 + (i % 3) * 0.22) + i * 0.9;
      const h1 = amp * (0.55 + 0.45 * (Math.sin(phase) * 0.5 + 0.5));
      const h2 = amp * (0.45 + 0.55 * (Math.cos(phase * 1.2) * 0.5 + 0.5));

      const flame = ctx.createLinearGradient(0, baseY - amp * 1.2, 0, baseY);
      flame.addColorStop(0, `rgba(255, 209, 122, ${(0.04 + pressure * 0.05 + breachPulse * 0.06).toFixed(3)})`);
      flame.addColorStop(0.5, `rgba(255, 102, 64, ${(0.06 + pressure * 0.08 + breachPulse * 0.08).toFixed(3)})`);
      flame.addColorStop(1, "rgba(255, 72, 44, 0)");

      ctx.save();
      ctx.fillStyle = flame;
      ctx.beginPath();
      ctx.moveTo(x0, baseY);
      ctx.lineTo(x0, baseY - h1 * 0.35);
      ctx.quadraticCurveTo(x0 + width * 0.25, baseY - h1, x0 + width * 0.5, baseY - h2 * 0.55);
      ctx.quadraticCurveTo(x0 + width * 0.75, baseY - h2, x1, baseY - h1 * 0.28);
      ctx.lineTo(x1, baseY);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
  }

  private renderMonsterPresence(
    ctx: CanvasRenderingContext2D,
    padRect: Rect,
    timeSec: number,
    pressure: number,
    breachPulse: number
  ): void {
    const alpha = Math.min(0.45, (pressure - 0.5) * 0.5 + breachPulse * 0.28);
    if (alpha <= 0) {
      return;
    }

    const cx = padRect.x + padRect.width * 0.5;
    const topY = padRect.y + padRect.height * 0.16;
    const eyeSpread = padRect.width * 0.11;
    const eyeY = topY + Math.sin(timeSec * 1.3) * 2;
    const eyePulse = 0.5 + 0.5 * Math.sin(timeSec * 7.8);

    ctx.save();
    ctx.fillStyle = `rgba(2, 4, 7, ${(alpha * 0.55).toFixed(3)})`;
    ctx.beginPath();
    ctx.ellipse(cx, topY, padRect.width * 0.22, padRect.height * 0.11, 0, Math.PI, 0, true);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(padRect.x + padRect.width * 0.09, padRect.y + padRect.height * 0.52, padRect.width * 0.09, padRect.height * 0.15, 0.45, 0, Math.PI * 2);
    ctx.ellipse(padRect.x + padRect.width * 0.91, padRect.y + padRect.height * 0.5, padRect.width * 0.09, padRect.height * 0.15, -0.45, 0, Math.PI * 2);
    ctx.fill();

    const eyeGlow = (0.18 + eyePulse * 0.22 + breachPulse * 0.18) * alpha;
    for (const ex of [cx - eyeSpread, cx + eyeSpread]) {
      ctx.shadowColor = `rgba(255, 96, 70, ${(eyeGlow * 0.9).toFixed(3)})`;
      ctx.shadowBlur = 14;
      ctx.fillStyle = `rgba(255, 113, 84, ${(eyeGlow * 0.95).toFixed(3)})`;
      ctx.beginPath();
      ctx.ellipse(ex, eyeY, 6 + eyePulse * 1.5, 2.2 + eyePulse * 0.5, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = `rgba(255, 230, 190, ${(eyeGlow * 0.55).toFixed(3)})`;
      ctx.beginPath();
      ctx.arc(ex + 1, eyeY - 0.4, 1.1, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  private emitSessionEnd(): void {
    if (this.hasEmittedEnd) {
      return;
    }
    this.hasEmittedEnd = true;
    const elapsedSec = Math.max(0, this.sessionDuration - this.timeRemaining);
    this.onSessionEnd?.({
      modeId: "RUNE_GATES_HUD",
      endReason: this.endReason ?? "timer",
      durationSec: this.sessionDuration,
      elapsedSec: Number(elapsedSec.toFixed(2)),
      score: this.score,
      hits: this.hits,
      perfects: this.perfects,
      bestCombo: this.bestCombo,
      breaches: this.breachCount,
      monsterTeamId: this.monsterTeam.id,
      monsterTeamName: this.monsterTeam.name,
      playerGoals: this.playerGoals,
      enemyGoals: this.enemyGoals,
      matchResult: this.getMatchResult(),
      periodScores: this.playerGoalsByPeriod.map((playerGoals, index) => ({
        period: index + 1,
        playerGoals,
        enemyGoals: this.enemyGoalsByPeriod[index] ?? 0
      })),
      endedAtMs: Date.now()
    });
  }
}
