import type { PuckProvider } from "../../providers/PuckProvider";
import { padToPixel, type Point, type Rect } from "../../tracking/PadRenderer2D";
import { Effects2D } from "../../tracking/Effects2D";
import type { MonsterTeam } from "../MonsterTeams";
import { BREACH_UNLOCK_RUNS, getThreatProgressionState, type ThreatProgressionState } from "../ThreatProgression";
import {
  createArcaneScoreboard,
  setArcaneScoreboardScore,
  type ArcaneScoreboardRefs
} from "../../ui/ArcaneScoreboard";

type RuneStyle = "ARCANE" | "FROST" | "FEL";
type HudPortraitId = "PLAYER_A" | "PLAYER_K" | "GOBLIN" | null;

type SidePortraitSlotRefs = {
  root: HTMLDivElement;
  imgEl: HTMLImageElement;
  happyVideoEl: HTMLVideoElement;
  angryVideoEl: HTMLVideoElement;
  fallbackEl: HTMLSpanElement;
  nameEl: HTMLSpanElement;
  sideEl: HTMLSpanElement;
  stateEl: HTMLSpanElement;
  gearEl: HTMLSpanElement;
};

type PlayerLoadoutSummary = {
  helmet: string;
  stick: string;
  gloves: string;
};

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
type FaceoffSpellStage = "APPROACH" | "TRACE" | "SNAP";
type FaceoffSpellTrigger = "OPENING" | "PERIOD" | "GOAL_RESET" | "BREACH_SAVE";
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

type DifficultyPace = "OPENING" | "PRESSURE" | "FINAL_PUSH";
type InterludeChallengeId = "SPEED_BURST" | "RUNE_SCRIPT" | "ICE_SPRINT";

type DifficultySnapshot = {
  pace: DifficultyPace;
  paceLabel: string;
  paceShort: string;
  baseIntensity: number;
  openingGrace: number;
  finalPush: number;
  playerMercy: number;
  enemySurge: number;
  gateChaosBonus: number;
  gateRadiusBias: number;
  gateLifetimeBias: number;
  driftBias: number;
  enemyAttackScale: number;
  tensionScale: number;
  playerShotChanceBias: number;
  enemyShotChanceBias: number;
  playerThresholdAssist: number;
  enemyThresholdPressure: number;
  missPenaltyScale: number;
};

type FaceoffSpellState = {
  trigger: FaceoffSpellTrigger;
  favoredPossession: Possession;
  anchor: Point;
  stage: FaceoffSpellStage;
  nodes: Point[];
  currentNodeIndex: number;
  traceTolerancePx: number;
  snapTolerancePx: number;
  approachDurationSec: number;
  traceDurationSec: number;
  totalDurationSec: number;
  timeRemainingSec: number;
  snapCueDelaySec: number;
  snapWindowRemainingSec: number;
  centerHoldSec: number;
  centerHoldGoalSec: number;
  runeSpinSeed: number;
};

type InterludeScheduleEntry = {
  progress: number;
  challengeId: InterludeChallengeId;
};

type InterludeChallengeState = {
  id: InterludeChallengeId;
  label: string;
  prompt: string;
  durationSec: number;
  timeRemainingSec: number;
  introRemainingSec: number;
  checkpoints: Point[];
  currentCheckpointIndex: number;
  checkpointRadiusScale: number;
  hue: number;
  rewardScore: number;
  rewardCharge: number;
  failPressure: number;
  failIntegrity: number;
  failTurnover: boolean;
  successBanner: string;
};

type BreachFractureKind = "RADIAL" | "BRANCH" | "RING";

type BreachFracturePath = {
  kind: BreachFractureKind;
  nodes: Point[];
  activation: number;
  major: boolean;
  thickness: number;
  maskPhase: number;
};

type RuntimeTexture = {
  image: HTMLImageElement;
  ready: boolean;
};

type BreachFrostSeed = {
  lane: number;
  riseRate: number;
  drift: number;
  size: number;
  phase: number;
};

type BreachThemePalette = {
  hairline: string;
  hairlineMask: string;
  leakCore: string;
  leakOuter: string;
  depthDark: string;
  edgeLight: string;
  frost: string;
};

const PLAYER_A_PORTRAIT_URL = new URL("../../../tmp/A.png", import.meta.url).href;
const PLAYER_K_PORTRAIT_URL = new URL("../../../tmp/k.png", import.meta.url).href;
const GOBLIN_PORTRAIT_URL = new URL("../../../tmp/G.png", import.meta.url).href;
const GOBLIN_ANGRY_ANIM_URL = new URL("../../../animations/angry_goblin.mp4", import.meta.url).href;
const GOBLIN_HAPPY_ANIM_URL = new URL("../../../animations/happy_goblin.mp4", import.meta.url).href;
const BGM_TRACK_MODULES = import.meta.glob(
  ["../../../audio/soundtracks/*.{mp3,ogg,wav,m4a}", "../../../tmp/audio/bgm/*.{mp3,ogg,wav,m4a}"],
  {
    eager: true,
    import: "default"
  }
) as Record<string, string>;
const BGM_TRACK_URLS = Object.entries(BGM_TRACK_MODULES)
  .sort(([a], [b]) => a.localeCompare(b))
  .map(([, url]) => url)
  .filter((url): url is string => typeof url === "string" && url.length > 0);
const PUCK_HIT_SFX_URLS = [
  new URL("../../../audio/puck/puck_hit_01.mp3", import.meta.url).href,
  new URL("../../../audio/puck/puck_hit_02.mp3", import.meta.url).href,
  new URL("../../../audio/puck/puck_hit_03.mp3", import.meta.url).href,
  new URL("../../../audio/puck/puck_hit_04.wav", import.meta.url).href
].filter((url): url is string => typeof url === "string" && url.length > 0);
const BREACH_FISSURE_TEXTURE = createRuntimeTexture(new URL("../../../tmp/Ice004.png", import.meta.url).href);
const BREACH_ROUGH_TEXTURE = createRuntimeTexture(
  new URL("../../../tmp/Ice004_1K-JPG/Ice004_1K-JPG_Roughness.jpg", import.meta.url).href
);
const BREACH_DISPLACE_TEXTURE = createRuntimeTexture(
  new URL("../../../tmp/Ice004_1K-JPG/Ice004_1K-JPG_Displacement.jpg", import.meta.url).href
);
const FACEOFF_SPOTS: Point[] = [
  { x: 0.5, y: 0.5 },
  { x: 0.24, y: 0.33 },
  { x: 0.24, y: 0.67 },
  { x: 0.76, y: 0.33 },
  { x: 0.76, y: 0.67 }
];
const HUD_REFRESH_INTERVAL_SEC = 1 / 20;
const ANNOUNCER_SFX_POOL_SIZE = 2;
const PUCK_HIT_SFX_POOL_SIZE = 4;
const FACEOFF_SPELL_PATTERNS: Point[][] = [
  [
    { x: -0.15, y: -0.19 },
    { x: -0.04, y: -0.22 },
    { x: 0.1, y: -0.16 },
    { x: 0.18, y: -0.05 },
    { x: 0.12, y: 0.07 },
    { x: 0.02, y: 0.13 },
    { x: -0.05, y: 0.09 },
    { x: -0.01, y: 0.03 }
  ],
  [
    { x: -0.18, y: 0.12 },
    { x: -0.19, y: -0.01 },
    { x: -0.11, y: -0.15 },
    { x: 0.03, y: -0.2 },
    { x: 0.17, y: -0.11 },
    { x: 0.13, y: 0.03 },
    { x: 0.03, y: 0.1 },
    { x: -0.01, y: 0.03 }
  ],
  [
    { x: -0.15, y: -0.05 },
    { x: -0.06, y: -0.18 },
    { x: 0.08, y: -0.14 },
    { x: 0.16, y: -0.01 },
    { x: 0.1, y: 0.12 },
    { x: -0.03, y: 0.16 },
    { x: -0.13, y: 0.07 },
    { x: -0.01, y: 0.02 }
  ],
  [
    { x: -0.2, y: -0.02 },
    { x: -0.11, y: -0.17 },
    { x: 0.04, y: -0.2 },
    { x: 0.17, y: -0.09 },
    { x: 0.16, y: 0.05 },
    { x: 0.04, y: 0.15 },
    { x: -0.09, y: 0.13 },
    { x: -0.01, y: 0.02 }
  ]
];
const RUNE_SCRIPT_PATHS: Point[][] = [
  [
    { x: 0.28, y: 0.82 },
    { x: 0.5, y: 0.2 },
    { x: 0.72, y: 0.82 },
    { x: 0.62, y: 0.58 },
    { x: 0.38, y: 0.58 }
  ],
  [
    { x: 0.3, y: 0.2 },
    { x: 0.3, y: 0.82 },
    { x: 0.3, y: 0.52 },
    { x: 0.72, y: 0.24 },
    { x: 0.3, y: 0.52 },
    { x: 0.72, y: 0.82 }
  ],
  [
    { x: 0.24, y: 0.28 },
    { x: 0.48, y: 0.2 },
    { x: 0.72, y: 0.3 },
    { x: 0.3, y: 0.72 },
    { x: 0.54, y: 0.82 },
    { x: 0.76, y: 0.7 }
  ]
];

function createRuntimeTexture(url: string): RuntimeTexture {
  const image = new Image();
  image.decoding = "async";
  const texture: RuntimeTexture = { image, ready: false };
  image.addEventListener("load", () => {
    texture.ready = true;
  });
  image.src = url;
  return texture;
}

function drawTiledRuntimeTexture(
  ctx: CanvasRenderingContext2D,
  rect: Rect,
  texture: RuntimeTexture,
  args: {
    alpha: number;
    tileScale: number;
    driftX?: number;
    driftY?: number;
    composite?: GlobalCompositeOperation;
  }
): void {
  if (!texture.ready || texture.image.naturalWidth <= 0 || texture.image.naturalHeight <= 0) {
    return;
  }
  const tileW = Math.max(24, texture.image.naturalWidth * args.tileScale);
  const tileH = Math.max(24, texture.image.naturalHeight * args.tileScale);
  const driftX = ((args.driftX ?? 0) % tileW + tileW) % tileW;
  const driftY = ((args.driftY ?? 0) % tileH + tileH) % tileH;
  const startX = rect.x - tileW + driftX;
  const startY = rect.y - tileH + driftY;
  const endX = rect.x + rect.width + tileW;
  const endY = rect.y + rect.height + tileH;

  ctx.save();
  ctx.globalAlpha = args.alpha;
  if (args.composite) {
    ctx.globalCompositeOperation = args.composite;
  }
  for (let y = startY; y < endY; y += tileH) {
    for (let x = startX; x < endX; x += tileW) {
      ctx.drawImage(texture.image, x, y, tileW, tileH);
    }
  }
  ctx.restore();
}

export type RuneGatesSessionSummary = {
  modeId: "RUNE_GATES_HUD";
  trainingMode: boolean;
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

function seededUnit(seed: number): number {
  const value = Math.sin(seed * 127.1 + 311.7) * 43758.5453123;
  return value - Math.floor(value);
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

function normalizePortraitInitials(name: string | null | undefined, fallback: string): string {
  const cleaned = (name ?? "")
    .toUpperCase()
    .replace(/[^A-Z0-9 ]+/g, " ")
    .trim();
  if (!cleaned) {
    return fallback;
  }
  const parts = cleaned.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return `${parts[0]?.[0] ?? ""}${parts[1]?.[0] ?? ""}`.slice(0, 2);
  }
  return cleaned.slice(0, 2);
}

function resolvePlayerPortraitId(displayName: string | null | undefined): HudPortraitId {
  const value = (displayName ?? "").trim().toUpperCase();
  if (!value) {
    return null;
  }
  if (value === "AT" || value.startsWith("AT ") || value.startsWith("A")) {
    return "PLAYER_A";
  }
  if (value === "KT" || value.startsWith("KT ") || value.startsWith("K")) {
    return "PLAYER_K";
  }
  return null;
}

function portraitUrlForId(id: HudPortraitId): string | null {
  switch (id) {
    case "PLAYER_A":
      return PLAYER_A_PORTRAIT_URL;
    case "PLAYER_K":
      return PLAYER_K_PORTRAIT_URL;
    case "GOBLIN":
      return GOBLIN_PORTRAIT_URL;
    default:
      return null;
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
  private readonly countdownEl: HTMLDivElement;
  private readonly playerDisplayName: string;
  private readonly playerLoadoutSummary: PlayerLoadoutSummary | null;
  private readonly trainingMode: boolean;
  private readonly spellDemoMode: boolean;
  private readonly playerRunCount: number;
  private readonly threatProgression: ThreatProgressionState;
  private readonly homePortraitSlot: SidePortraitSlotRefs;
  private readonly guestPortraitSlot: SidePortraitSlotRefs;
  private lastPortraitLayoutKey = "";

  private target: RingTarget | null = null;
  private faceoffSpell: FaceoffSpellState | null = null;
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
  private bgmAudio: HTMLAudioElement | null = null;
  private lastBgmTrackIndex = -1;
  private bgmDuckUntilMs = 0;
  private bgmCurrentGain = 0;
  private readonly bgmBaseVolume = 0.22;
  private readonly bgmDuckVolume = 0.1;
  private readonly bgmTrackUrls = BGM_TRACK_URLS;
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
  private readonly sfxAudioPools = new Map<string, HTMLAudioElement[]>();
  private readonly sfxAudioPoolCursor = new Map<string, number>();
  private readonly puckHitSfxUrls = PUCK_HIT_SFX_URLS;
  private puckHitSfxLastClipIndex = -1;
  private puckHitSfxLastPlayedAt = -Infinity;
  private readonly puckHitSfxCooldownMs = 90;
  private preStartCountdownActive = false;
  private preStartCountdownDurationSec = 3.2;
  private preStartCountdownRemainingSec = 0;
  private preStartCountdownSyncedToIntro = false;

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
  private momentumDifficultyBand: -1 | 0 | 1 = 0;
  private momentumDifficultyCooldown = 0;
  private faceoffDemoCooldown = 0;
  private faceoffDemoRounds = 0;
  private interludeChallenge: InterludeChallengeState | null = null;
  private interludeCheckpointWasInside = false;
  private interludeSchedule: InterludeScheduleEntry[] = [];
  private nextInterludeScheduleIndex = 0;
  private completedInterludes = 0;
  private lastFaceoffSpotIndex = -1;
  private breachRitualCooldown = 0;
  private breachRitualSaves = 0;
  private guestEmoteTimerId: number | null = null;
  private guestEmoteToken = 0;
  private breachVisualPropagation = 0;
  private breachVisualStep = 0;
  private breachRumbleCooldown = 0;
  private crackPropagationCueLastAtMs = -Infinity;
  private crackCueAudioContext: AudioContext | null = null;
  private readonly crackPropagationCueCooldownMs = 320;
  private readonly breachFracturePaths: BreachFracturePath[] = this.buildBreachFracturePaths();
  private readonly breachFrostSeeds: BreachFrostSeed[] = this.buildBreachFrostSeeds();
  private hudRefreshCooldown = 0;

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
    playerDisplayName?: string;
    playerLoadoutSummary?: PlayerLoadoutSummary;
    trainingMode?: boolean;
    spellDemoMode?: boolean;
    playerRunCount?: number;
    onSessionEnd?: (summary: RuneGatesSessionSummary) => void;
  }) {
    this.provider = args.provider;
    this.overlayRoot = args.overlayRoot;
    this.getPadBounds = args.getPadBounds;
    this.effects = args.effects;
    this.monsterTeam = args.monsterTeam;
    this.onSessionEnd = args.onSessionEnd;
    this.playerDisplayName = (args.playerDisplayName ?? "AT").trim() || "AT";
    this.playerLoadoutSummary = args.playerLoadoutSummary ?? null;
    this.trainingMode = args.trainingMode === true;
    this.spellDemoMode = args.spellDemoMode === true;
    this.playerRunCount = Math.max(0, Math.floor(args.playerRunCount ?? 0));
    this.threatProgression = getThreatProgressionState(this.playerRunCount);

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

    this.homePortraitSlot = this.createSidePortraitSlot("home");
    this.guestPortraitSlot = this.createSidePortraitSlot("guest");
    this.configureSidePortraitSlot(
      this.homePortraitSlot,
      resolvePlayerPortraitId(this.playerDisplayName),
      this.playerDisplayName,
      "Home",
      this.playerLoadoutSummary
        ? `${this.playerLoadoutSummary.helmet} • ${this.playerLoadoutSummary.stick}`
        : "Starter gear"
    );
    this.configureSidePortraitSlot(
      this.guestPortraitSlot,
      "GOBLIN",
      this.monsterTeam.shortName,
      "Away",
      this.monsterTeam.gearLabel
    );

    this.comboFlashEl = document.createElement("div");
    this.comboFlashEl.className = "combo-flash";

    this.statusEl = document.createElement("div");
    this.statusEl.className = "session-status";

    this.countdownEl = document.createElement("div");
    this.countdownEl.className = "pre-run-countdown";

    this.overlayRoot.append(
      this.panelEl,
      this.homePortraitSlot.root,
      this.guestPortraitSlot.root,
      this.countdownEl,
      this.comboFlashEl,
      this.statusEl
    );
    window.addEventListener("keydown", this.onKeyDownBound);

    this.reset();
  }

  private createSidePortraitSlot(side: "home" | "guest"): SidePortraitSlotRefs {
    const root = document.createElement("div");
    root.className = `side-skater side-skater--${side}`;
    root.innerHTML = `
      <div class="side-skater__frame">
        <div class="side-skater__art">
          <img class="side-skater__image" alt="" />
          <video class="side-skater__video side-skater__video--happy" muted playsinline preload="auto"></video>
          <video class="side-skater__video side-skater__video--angry" muted playsinline preload="auto"></video>
          <span class="side-skater__fallback"></span>
        </div>
        <div class="side-skater__plate">
          <span class="side-skater__side">${side === "home" ? "HOME" : "AWAY"}</span>
          <strong class="side-skater__name">${side === "home" ? "PLAYER" : "GUEST"}</strong>
          <span class="side-skater__gear">Starter gear</span>
          <span class="side-skater__state">OFFENSE</span>
        </div>
      </div>
    `;

    const imgEl = root.querySelector<HTMLImageElement>(".side-skater__image");
    const happyVideoEl = root.querySelector<HTMLVideoElement>(".side-skater__video--happy");
    const angryVideoEl = root.querySelector<HTMLVideoElement>(".side-skater__video--angry");
    const fallbackEl = root.querySelector<HTMLSpanElement>(".side-skater__fallback");
    const nameEl = root.querySelector<HTMLSpanElement>(".side-skater__name");
    const sideEl = root.querySelector<HTMLSpanElement>(".side-skater__side");
    const gearEl = root.querySelector<HTMLSpanElement>(".side-skater__gear");
    const stateEl = root.querySelector<HTMLSpanElement>(".side-skater__state");
    if (!imgEl || !happyVideoEl || !angryVideoEl || !fallbackEl || !nameEl || !sideEl || !gearEl || !stateEl) {
      throw new Error("RuneGatesHUD side portrait slot failed to initialize");
    }

    happyVideoEl.loop = false;
    happyVideoEl.playsInline = true;
    happyVideoEl.muted = true;
    happyVideoEl.hidden = true;
    angryVideoEl.loop = false;
    angryVideoEl.playsInline = true;
    angryVideoEl.muted = true;
    angryVideoEl.hidden = true;

    return { root, imgEl, happyVideoEl, angryVideoEl, fallbackEl, nameEl, sideEl, stateEl, gearEl };
  }

  private configureSidePortraitSlot(
    slot: SidePortraitSlotRefs,
    portraitId: HudPortraitId,
    displayName: string,
    sideLabel: string,
    gearSummary: string
  ): void {
    const portraitUrl = portraitUrlForId(portraitId);
    const initials = normalizePortraitInitials(displayName, sideLabel === "Home" ? "P1" : "EN");
    slot.root.dataset.portraitId = portraitId ?? "NONE";

    slot.nameEl.textContent = displayName;
    slot.sideEl.textContent = sideLabel.toUpperCase();
    slot.gearEl.textContent = gearSummary;
    slot.fallbackEl.textContent = initials;

    const supportsGoblinEmotes = portraitId === "GOBLIN" && sideLabel.toUpperCase() === "AWAY";
    if (supportsGoblinEmotes) {
      slot.happyVideoEl.src = GOBLIN_HAPPY_ANIM_URL;
      slot.angryVideoEl.src = GOBLIN_ANGRY_ANIM_URL;
      slot.root.dataset.emote = "idle";
    } else {
      slot.happyVideoEl.pause();
      slot.happyVideoEl.removeAttribute("src");
      slot.angryVideoEl.pause();
      slot.angryVideoEl.removeAttribute("src");
      delete slot.root.dataset.emote;
    }
    slot.happyVideoEl.hidden = true;
    slot.angryVideoEl.hidden = true;

    if (portraitUrl) {
      slot.imgEl.src = portraitUrl;
      slot.imgEl.hidden = false;
      slot.root.classList.add("is-loaded");
      slot.root.classList.remove("is-empty");
    } else {
      slot.imgEl.removeAttribute("src");
      slot.imgEl.hidden = true;
      slot.root.classList.remove("is-loaded");
      slot.root.classList.add("is-empty");
    }
  }

  private stopGuestEmote(resetToImage = true): void {
    if (this.guestEmoteTimerId !== null) {
      window.clearTimeout(this.guestEmoteTimerId);
      this.guestEmoteTimerId = null;
    }
    this.guestEmoteToken += 1;
    this.guestPortraitSlot.happyVideoEl.pause();
    this.guestPortraitSlot.angryVideoEl.pause();
    this.guestPortraitSlot.happyVideoEl.currentTime = 0;
    this.guestPortraitSlot.angryVideoEl.currentTime = 0;
    this.guestPortraitSlot.happyVideoEl.hidden = true;
    this.guestPortraitSlot.angryVideoEl.hidden = true;
    this.guestPortraitSlot.root.dataset.emote = "idle";
    if (resetToImage && this.guestPortraitSlot.root.classList.contains("is-loaded")) {
      this.guestPortraitSlot.imgEl.hidden = false;
    }
  }

  private triggerGuestEmote(kind: "HAPPY" | "ANGRY"): void {
    if (this.guestPortraitSlot.root.dataset.portraitId !== "GOBLIN") {
      return;
    }
    const activeVideo = kind === "HAPPY" ? this.guestPortraitSlot.happyVideoEl : this.guestPortraitSlot.angryVideoEl;
    const otherVideo = kind === "HAPPY" ? this.guestPortraitSlot.angryVideoEl : this.guestPortraitSlot.happyVideoEl;
    if (!activeVideo.src) {
      return;
    }

    this.stopGuestEmote(false);
    const token = ++this.guestEmoteToken;
    this.guestPortraitSlot.root.dataset.emote = kind.toLowerCase();
    otherVideo.hidden = true;
    otherVideo.pause();
    otherVideo.currentTime = 0;
    this.guestPortraitSlot.imgEl.hidden = true;

    activeVideo.hidden = false;
    activeVideo.currentTime = 0;
    activeVideo.onended = () => {
      if (token !== this.guestEmoteToken) {
        return;
      }
      this.stopGuestEmote(true);
    };

    void activeVideo.play().catch(() => {
      if (token !== this.guestEmoteToken) {
        return;
      }
      this.stopGuestEmote(true);
    });

    const fallbackMs = Number.isFinite(activeVideo.duration) && activeVideo.duration > 0.2 ? activeVideo.duration * 1000 + 80 : 2200;
    this.guestEmoteTimerId = window.setTimeout(() => {
      if (token !== this.guestEmoteToken) {
        return;
      }
      this.stopGuestEmote(true);
    }, fallbackMs);
  }

  private updateSidePortraitHud(): void {
    this.updateSidePortraitLayout();

    const playerOnOffense = this.possession === "PLAYER";
    this.homePortraitSlot.root.dataset.possession = playerOnOffense ? "offense" : "defense";
    this.guestPortraitSlot.root.dataset.possession = playerOnOffense ? "defense" : "offense";
    this.homePortraitSlot.root.classList.toggle("is-offense", playerOnOffense);
    this.homePortraitSlot.root.classList.toggle("is-defense", !playerOnOffense);
    this.homePortraitSlot.stateEl.textContent = playerOnOffense ? "PUCK" : "DEFEND";

    this.guestPortraitSlot.root.classList.toggle("is-offense", !playerOnOffense);
    this.guestPortraitSlot.root.classList.toggle("is-defense", playerOnOffense);
    this.guestPortraitSlot.stateEl.textContent = playerOnOffense ? "DEFEND" : "PUCK";

    if (this.ended) {
      this.homePortraitSlot.root.classList.toggle("is-win", this.playerGoals > this.enemyGoals);
      this.guestPortraitSlot.root.classList.toggle("is-win", this.enemyGoals > this.playerGoals);
    } else {
      this.homePortraitSlot.root.classList.remove("is-win");
      this.guestPortraitSlot.root.classList.remove("is-win");
    }
  }

  private updateSidePortraitLayout(): void {
    const overlayWidth = this.overlayRoot.clientWidth;
    const overlayHeight = this.overlayRoot.clientHeight;
    const pad = this.getPadBounds();

    const outerMargin = 14;
    const gap = clamp(Math.round(Math.min(22, pad.width * 0.03)), 12, 22);
    const panelHeight = clamp(pad.height * 0.72, 220, Math.min(560, overlayHeight - outerMargin * 2));
    const targetPanelWidth = clamp(panelHeight * 0.62, 120, 300);
    const centerY = pad.y + pad.height * 0.54;
    const top = clamp(centerY - panelHeight * 0.5, outerMargin + 12, overlayHeight - panelHeight - outerMargin);

    const leftAvailable = Math.max(0, pad.x - gap - outerMargin);
    const rightAvailable = Math.max(0, overlayWidth - (pad.x + pad.width) - gap - outerMargin);
    const minShowWidth = 108;

    const leftWidth = Math.min(targetPanelWidth, leftAvailable);
    const rightWidth = Math.min(targetPanelWidth, rightAvailable);
    const showLeft = leftWidth >= minShowWidth;
    const showRight = rightWidth >= minShowWidth;

    const leftX = Math.round(pad.x - gap - leftWidth);
    const rightX = Math.round(pad.x + pad.width + gap);

    const layoutKey = [
      overlayWidth,
      overlayHeight,
      Math.round(pad.x),
      Math.round(pad.y),
      Math.round(pad.width),
      Math.round(pad.height),
      Math.round(top),
      Math.round(panelHeight),
      Math.round(leftWidth),
      Math.round(rightWidth),
      showLeft ? 1 : 0,
      showRight ? 1 : 0
    ].join("|");

    if (layoutKey === this.lastPortraitLayoutKey) {
      return;
    }
    this.lastPortraitLayoutKey = layoutKey;

    this.homePortraitSlot.root.classList.toggle("is-hidden", !showLeft);
    this.guestPortraitSlot.root.classList.toggle("is-hidden", !showRight);

    if (showLeft) {
      this.homePortraitSlot.root.style.left = `${leftX}px`;
      this.homePortraitSlot.root.style.top = `${Math.round(top)}px`;
      this.homePortraitSlot.root.style.width = `${Math.round(leftWidth)}px`;
      this.homePortraitSlot.root.style.height = `${Math.round(panelHeight)}px`;
    }
    if (showRight) {
      this.guestPortraitSlot.root.style.left = `${rightX}px`;
      this.guestPortraitSlot.root.style.top = `${Math.round(top)}px`;
      this.guestPortraitSlot.root.style.width = `${Math.round(rightWidth)}px`;
      this.guestPortraitSlot.root.style.height = `${Math.round(panelHeight)}px`;
    }
  }

  reset(): void {
    this.stopBackgroundMusic();
    if (this.introAudio) {
      this.introAudio.pause();
      this.introAudio.src = "";
      this.introAudio = null;
    }
    if (this.spellDemoMode) {
      this.preStartCountdownActive = false;
      this.preStartCountdownDurationSec = 0;
      this.preStartCountdownRemainingSec = 0;
      this.preStartCountdownSyncedToIntro = false;
    } else {
      this.startPreStartCountdown(3.2);
      this.playRandomIntroClip();
    }
    this.gameSfxLastPlayedAt.clear();
    this.gameSfxLastClipIndex.clear();
    this.puckHitSfxLastClipIndex = -1;
    this.puckHitSfxLastPlayedAt = -Infinity;
    this.target = null;
    this.faceoffSpell = null;
    this.faceoffDemoCooldown = this.spellDemoMode ? 0.35 : 0;
    this.faceoffDemoRounds = 0;
    this.interludeChallenge = null;
    this.interludeCheckpointWasInside = false;
    this.interludeSchedule = this.buildInterludeSchedule();
    this.nextInterludeScheduleIndex = 0;
    this.completedInterludes = 0;
    this.lastFaceoffSpotIndex = -1;
    this.breachRitualCooldown = 0;
    this.breachRitualSaves = 0;
    this.wasInsideTarget = false;
    this.comboFlash = null;
    this.sessionDuration = this.spellDemoMode ? 9999 : this.trainingMode ? 18 : this.periodCount * this.periodDurationSec;
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
    this.riftPressure = this.trainingMode || this.spellDemoMode ? 0.02 : this.isRookieWardActive() ? 0.05 : 0.08;
    this.breachSurgeTimer = 0;
    this.breachCount = 0;
    this.lowestIntegrity = 1;
    this.breachOutroTimer = 0;
    this.breachOutroBurstStage = 0;
    this.breachOutroPower = 1;
    this.breachVisualPropagation = clamp(Math.max(this.riftPressure * 0.6, 1 - this.sealIntegrity), 0, 1);
    this.breachVisualStep = Math.floor(this.breachVisualPropagation * 10);
    this.breachRumbleCooldown = 0;
    this.crackPropagationCueLastAtMs = -Infinity;
    this.finishOutroTimer = 0;
    this.finishOutroBurstStage = 0;
    this.finishOutroPower = 1;
    this.finishOutroResult = "tie";
    this.statusTransientTimer = 0;
    this.statusPersistent = false;
    this.momentumDifficultyBand = 0;
    this.momentumDifficultyCooldown = 0;
    this.statusEl.textContent = "";
    delete this.statusEl.dataset.tone;
    this.statusEl.classList.remove("visible");
    this.stopGuestEmote(true);
    this.panelEl.dataset.training = this.trainingMode ? "true" : "false";
    this.panelEl.dataset.spellDemo = this.spellDemoMode ? "true" : "false";
    this.hudRefreshCooldown = 0;
    this.updateCountdownDom();
    this.updateHud(true);
  }

  update(dt: number): void {
    this.updateBackgroundMusic(dt);
    this.hudRefreshCooldown = Math.max(0, this.hudRefreshCooldown - dt);
    this.possessionLockTimer = Math.max(0, this.possessionLockTimer - dt);
    this.momentumDifficultyCooldown = Math.max(0, this.momentumDifficultyCooldown - dt);
    this.breachRitualCooldown = Math.max(0, this.breachRitualCooldown - dt);
    this.updateTransientStatus(dt);

    if (this.comboFlash) {
      this.comboFlash.age += dt;
      if (this.comboFlash.age >= this.comboFlash.duration) {
        this.comboFlash = null;
      }
    }
    this.updateComboFlashDom();
    this.updateBreachVisualState(dt);

    if (this.preStartCountdownActive) {
      this.updatePreStartCountdown(dt);
      this.updateHud();
      return;
    }

    if (this.faceoffSpell) {
      this.updateFaceoffSpell(dt);
      this.updateHud();
      return;
    }

    if (this.interludeChallenge) {
      this.updateInterludeChallenge(dt);
      this.updateHud();
      return;
    }

    if (this.spellDemoMode) {
      this.updateSpellDemoLoop(dt);
      this.updateHud();
      return;
    }

    if (this.ended) {
      this.updateEndedState(dt);
      this.updateHud();
      return;
    }

    if (!this.trainingMode) {
      this.updateTension(dt);
    }
    if (this.faceoffSpell) {
      this.updateHud();
      return;
    }
    if (this.ended) {
      this.updateEndedState(dt);
      this.updateHud();
      return;
    }

    this.timeRemaining = Math.max(0, this.timeRemaining - dt);
    this.updateMatchClockAndPeriods();
    this.updateMomentumDifficultyCallout();
    if (this.timeRemaining <= 0) {
      if (this.trainingMode) {
        this.ended = true;
        this.endReason = "timer";
        this.target = null;
        this.wasInsideTarget = false;
        this.flashCombo("TRAINING COMPLETE", "great");
        this.showStatus("Training complete • starting match", "offense", 1.05);
        this.emitSessionEnd();
        return;
      }
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

    this.maybeStartInterludeChallenge();
    if (this.interludeChallenge) {
      this.updateHud();
      return;
    }

    if (!this.trainingMode) {
      this.updateEnemyAttack(dt);
    }

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
        if (this.trainingMode) {
          if (!this.statusPersistent && this.statusTransientTimer <= 0) {
            this.showStatus("Training miss • keep tracking the next gate", "offense", 0.8);
          }
        } else {
          this.applyMissPressure();
        }
      }
    } else {
      this.spawnDelay -= dt;
      if (this.spawnDelay <= 0) {
        this.spawnTarget();
      }
    }
    if (this.faceoffSpell) {
      this.updateHud();
      return;
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

    if (this.faceoffSpell) {
      this.renderFaceoffSpell(ctx, padRect, timeSec, this.faceoffSpell);
      return;
    }

    if (this.interludeChallenge) {
      this.renderInterludeChallenge(ctx, padRect, timeSec, this.interludeChallenge);
      return;
    }

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
    this.stopBackgroundMusic();
    this.stopGuestEmote(false);
    this.homePortraitSlot.happyVideoEl.pause();
    this.homePortraitSlot.happyVideoEl.removeAttribute("src");
    this.homePortraitSlot.angryVideoEl.pause();
    this.homePortraitSlot.angryVideoEl.removeAttribute("src");
    this.guestPortraitSlot.happyVideoEl.pause();
    this.guestPortraitSlot.happyVideoEl.removeAttribute("src");
    this.guestPortraitSlot.angryVideoEl.pause();
    this.guestPortraitSlot.angryVideoEl.removeAttribute("src");
    for (const pool of this.sfxAudioPools.values()) {
      for (const audio of pool) {
        audio.pause();
        audio.src = "";
      }
    }
    this.sfxAudioPools.clear();
    this.sfxAudioPoolCursor.clear();
    window.removeEventListener("keydown", this.onKeyDownBound);
    this.panelEl.remove();
    this.homePortraitSlot.root.remove();
    this.guestPortraitSlot.root.remove();
    this.countdownEl.remove();
    this.comboFlashEl.remove();
    this.statusEl.remove();
    if (this.crackCueAudioContext && this.crackCueAudioContext.state !== "closed") {
      void this.crackCueAudioContext.close();
      this.crackCueAudioContext = null;
    }
  }

  private startPreStartCountdown(durationSec: number): void {
    const safeDuration = clamp(durationSec, 1.2, 8);
    this.preStartCountdownActive = true;
    this.preStartCountdownDurationSec = safeDuration;
    this.preStartCountdownRemainingSec = safeDuration;
    this.preStartCountdownSyncedToIntro = false;
    this.updateCountdownDom();
  }

  private finishPreStartCountdown(): void {
    this.preStartCountdownActive = false;
    this.preStartCountdownRemainingSec = 0;
    this.preStartCountdownSyncedToIntro = false;
    this.updateCountdownDom();
    if (!this.ended && this.currentPeriod === 1) {
      this.startFaceoffSpell("OPENING", "PLAYER");
    }
  }

  private syncPreStartCountdownToIntroAudio(): void {
    if (!this.preStartCountdownActive || !this.introAudio) {
      return;
    }
    const duration = this.introAudio.duration;
    if (!Number.isFinite(duration) || duration <= 0.05) {
      return;
    }
    const safeDuration = clamp(duration, 1.2, 12);
    this.preStartCountdownDurationSec = safeDuration;
    this.preStartCountdownRemainingSec = clamp(safeDuration - this.introAudio.currentTime, 0, safeDuration);
    this.preStartCountdownSyncedToIntro = true;
  }

  private updatePreStartCountdown(dt: number): void {
    if (!this.preStartCountdownActive) {
      this.updateCountdownDom();
      return;
    }

    this.syncPreStartCountdownToIntroAudio();

    if (this.introAudio && this.preStartCountdownSyncedToIntro) {
      this.preStartCountdownRemainingSec = clamp(
        this.preStartCountdownDurationSec - this.introAudio.currentTime,
        0,
        this.preStartCountdownDurationSec
      );
    } else {
      this.preStartCountdownRemainingSec = Math.max(0, this.preStartCountdownRemainingSec - dt);
    }

    if (!this.introAudio && this.preStartCountdownSyncedToIntro) {
      this.preStartCountdownRemainingSec = 0;
    }

    this.updateCountdownDom();

    if (this.preStartCountdownRemainingSec <= 0.001) {
      this.finishPreStartCountdown();
    }
  }

  private getPreStartCountdownLabel(): string {
    if (!this.preStartCountdownActive) {
      return "";
    }
    const duration = Math.max(0.001, this.preStartCountdownDurationSec);
    const progress = clamp(1 - this.preStartCountdownRemainingSec / duration, 0, 0.9999);
    if (progress < 0.25) {
      return "3";
    }
    if (progress < 0.5) {
      return "2";
    }
    if (progress < 0.75) {
      return "1";
    }
    return "GO!";
  }

  private updateCountdownDom(): void {
    if (!this.preStartCountdownActive) {
      this.countdownEl.classList.remove("visible");
      this.countdownEl.textContent = "";
      delete this.countdownEl.dataset.phase;
      // Reset inline animation styles so the hidden plaque cannot linger as an empty dark pill.
      this.countdownEl.style.removeProperty("opacity");
      this.countdownEl.style.removeProperty("transform");
      return;
    }

    const label = this.getPreStartCountdownLabel();
    const phase = label === "GO!" ? "go" : "count";
    const duration = Math.max(0.001, this.preStartCountdownDurationSec);
    const progress = clamp(1 - this.preStartCountdownRemainingSec / duration, 0, 1);
    const localPulse = 0.5 + 0.5 * Math.sin(progress * Math.PI * (phase === "go" ? 6 : 12));
    const scale = phase === "go" ? 1.04 + localPulse * 0.09 : 0.96 + localPulse * 0.06;
    const lift = phase === "go" ? 18 : 12;
    const alpha = phase === "go" ? 0.98 : 0.94;

    this.countdownEl.dataset.phase = phase;
    this.countdownEl.textContent = label;
    this.countdownEl.classList.add("visible");
    this.countdownEl.style.opacity = alpha.toFixed(3);
    this.countdownEl.style.transform = `translate(-50%, calc(-50% - ${lift}px)) scale(${scale.toFixed(3)})`;
  }

  private getRandomFaceoffAnchor(): Point {
    const spots = FACEOFF_SPOTS;
    if (spots.length === 0) {
      return { x: 0.5, y: 0.5 };
    }
    let index = Math.floor(Math.random() * spots.length);
    if (spots.length > 1 && index === this.lastFaceoffSpotIndex) {
      index = (index + 1 + Math.floor(Math.random() * (spots.length - 1))) % spots.length;
    }
    this.lastFaceoffSpotIndex = index;
    return spots[index] ?? { x: 0.5, y: 0.5 };
  }

  private buildFaceoffSpellNodes(seed: number, anchor: Point): Point[] {
    const patterns = FACEOFF_SPELL_PATTERNS;
    const variantIndex = Math.floor(seededUnit(seed * 3.17 + 0.91) * patterns.length);
    const template = patterns[variantIndex] ?? patterns[0] ?? [{ x: 0, y: 0 }];
    const mirrorX = seededUnit(seed * 7.03 + 1.8) > 0.5 ? -1 : 1;
    const rotation = (seededUnit(seed * 5.11 + 2.4) - 0.5) * Math.PI * 0.9;
    const scaleX = 0.95 + seededUnit(seed * 11.9 + 4.4) * 0.2;
    const scaleY = 0.94 + seededUnit(seed * 13.6 + 6.2) * 0.22;
    const jitterRadius = 0.005 + seededUnit(seed * 17.2 + 9.1) * 0.004;
    const cosRot = Math.cos(rotation);
    const sinRot = Math.sin(rotation);
    const nodes: Point[] = template.map((base, index) => {
      const progress = template.length <= 1 ? 1 : index / (template.length - 1);
      const jitterAngle = seededUnit(seed * 101.7 + index * 33.1) * Math.PI * 2;
      const jitterScale = 1 - progress * 0.88;
      const jitter = jitterRadius * jitterScale;
      const localX = base.x * mirrorX * scaleX + Math.cos(jitterAngle) * jitter;
      const localY = base.y * scaleY + Math.sin(jitterAngle) * jitter;
      const x = localX * cosRot - localY * sinRot;
      const y = localX * sinRot + localY * cosRot;
      return {
        x: clamp(anchor.x + x * 0.72, 0.1, 0.9),
        y: clamp(anchor.y + y * 1.08, 0.12, 0.88)
      };
    });

    // Keep the final trace node close to center so the snap cue flow stays readable.
    const lastIndex = nodes.length - 1;
    if (lastIndex >= 0) {
      const finalAngle = seededUnit(seed * 19.7 + 2.3) * Math.PI * 2;
      const finalRadius = 0.012 + seededUnit(seed * 23.3 + 7.6) * 0.012;
      const finalNode: Point = {
        x: clamp(anchor.x + Math.cos(finalAngle) * finalRadius * 0.72, 0.1, 0.9),
        y: clamp(anchor.y + Math.sin(finalAngle) * finalRadius * 1.08, 0.12, 0.88)
      };
      nodes[lastIndex] = finalNode;
      if (lastIndex > 0) {
        const preNode = nodes[lastIndex - 1];
        nodes[lastIndex - 1] = {
          x: clamp(preNode.x * 0.46 + finalNode.x * 0.54, 0.1, 0.9),
          y: clamp(preNode.y * 0.46 + finalNode.y * 0.54, 0.12, 0.88)
        };
      }
    }
    return nodes;
  }

  private buildInterludeSchedule(): InterludeScheduleEntry[] {
    if (this.trainingMode || this.spellDemoMode) {
      return [];
    }
    const run = this.playerRunCount;
    const base: InterludeScheduleEntry[] =
      run < 2
        ? []
        : run < 6
          ? [{ progress: 0.62, challengeId: "SPEED_BURST" }]
          : run < 12
          ? [
              { progress: 0.34, challengeId: "SPEED_BURST" },
              { progress: 0.74, challengeId: "RUNE_SCRIPT" }
            ]
          : [
              { progress: 0.22, challengeId: "SPEED_BURST" },
              { progress: 0.5, challengeId: "RUNE_SCRIPT" },
              { progress: 0.8, challengeId: "ICE_SPRINT" }
            ];

    if (run >= 16 && base.length >= 3) {
      const openerVariant: InterludeChallengeId = seededUnit(run * 4.21 + 1.13) > 0.5 ? "SPEED_BURST" : "ICE_SPRINT";
      base[0] = { ...base[0], challengeId: openerVariant };
    }

    const avoidBand = 0.045;
    const periodCuts = [1 / 3, 2 / 3];
    return base
      .map((entry, index) => {
        const jitterSpan = run < 3 ? 0.03 : 0.05;
        const jitter = (seededUnit(run * 17.1 + index * 9.3) - 0.5) * jitterSpan;
        let progress = clamp(entry.progress + jitter, 0.16 + index * 0.06, 0.9);
        for (const cut of periodCuts) {
          if (Math.abs(progress - cut) < avoidBand) {
            progress = clamp(progress + (progress < cut ? -avoidBand : avoidBand), 0.16, 0.9);
          }
        }
        return { progress, challengeId: entry.challengeId };
      })
      .sort((a, b) => a.progress - b.progress);
  }

  private buildSpeedBurstCheckpoints(seed: number): Point[] {
    const puck = this.provider.getPosition();
    const points: Point[] = [{ x: clamp(puck.x, 0.14, 0.86), y: clamp(puck.y, 0.14, 0.86) }];
    const count = this.isRookieWardActive() ? 5 : 6;
    for (let i = 1; i < count; i += 1) {
      const prev = points[i - 1] ?? { x: 0.5, y: 0.5 };
      const angle = seededUnit(seed * 9.7 + i * 2.3) * Math.PI * 2;
      const step = 0.18 + seededUnit(seed * 11.3 + i * 3.8) * 0.11;
      const next: Point = {
        x: clamp(prev.x + Math.cos(angle) * step, 0.12, 0.88),
        y: clamp(prev.y + Math.sin(angle) * step, 0.12, 0.88)
      };
      points.push(next);
    }
    return points;
  }

  private buildIceSprintCheckpoints(seed: number): Point[] {
    const puck = this.provider.getPosition();
    const direction = puck.x <= 0.5 ? 1 : -1;
    const startX = clamp(puck.x, 0.14, 0.86);
    const ys = [0.22, 0.76, 0.32, 0.68, 0.5];
    const points: Point[] = [{ x: startX, y: clamp(puck.y, 0.14, 0.86) }];
    for (let i = 0; i < ys.length; i += 1) {
      const t = (i + 1) / ys.length;
      const laneY = ys[i] ?? 0.5;
      const jitter = (seededUnit(seed * 7.7 + i * 1.3) - 0.5) * 0.08;
      points.push({
        x: clamp(startX + direction * (0.14 + t * 0.66) + jitter * 0.24, 0.1, 0.9),
        y: clamp(laneY + jitter, 0.1, 0.9)
      });
    }
    return points;
  }

  private buildRuneScriptCheckpoints(seed: number): Point[] {
    const templates = RUNE_SCRIPT_PATHS;
    const index = Math.floor(seededUnit(seed * 3.3 + 0.7) * templates.length);
    const template = templates[index] ?? templates[0] ?? [{ x: 0.5, y: 0.5 }];
    const mirror = seededUnit(seed * 5.9 + 3.1) > 0.5 ? -1 : 1;
    const jitterAmount = 0.018;
    return template.map((node, i) => {
      const centerX = 0.5;
      const mirroredX = centerX + (node.x - centerX) * mirror;
      const jitterAngle = seededUnit(seed * 12.7 + i * 2.1) * Math.PI * 2;
      const jitter = jitterAmount * (1 - i / Math.max(1, template.length - 1));
      return {
        x: clamp(mirroredX + Math.cos(jitterAngle) * jitter, 0.1, 0.9),
        y: clamp(node.y + Math.sin(jitterAngle) * jitter, 0.1, 0.9)
      };
    });
  }

  private maybeStartInterludeChallenge(): void {
    if (
      this.trainingMode ||
      this.spellDemoMode ||
      this.ended ||
      this.preStartCountdownActive ||
      this.faceoffSpell !== null ||
      this.interludeChallenge !== null
    ) {
      return;
    }
    const nextEntry = this.interludeSchedule[this.nextInterludeScheduleIndex];
    if (!nextEntry) {
      return;
    }
    if (this.getMatchProgress() < nextEntry.progress) {
      return;
    }
    if (this.target && this.target.age < this.target.lifetime * 0.72) {
      return;
    }

    this.nextInterludeScheduleIndex += 1;
    this.startInterludeChallenge(nextEntry.challengeId);
  }

  private startInterludeChallenge(id: InterludeChallengeId): void {
    const seed = this.playerRunCount * 31.7 + (this.sessionDuration - this.timeRemaining) * 2.3 + this.completedInterludes * 9.1;
    let challenge: InterludeChallengeState;
    if (id === "RUNE_SCRIPT") {
      challenge = {
        id,
        label: "Rune Script",
        prompt: "Trace the large rune path in order",
        durationSec: this.isRookieWardActive() ? 10.8 : 9.6,
        timeRemainingSec: this.isRookieWardActive() ? 10.8 : 9.6,
        introRemainingSec: 1.5,
        checkpoints: this.buildRuneScriptCheckpoints(seed),
        currentCheckpointIndex: 0,
        checkpointRadiusScale: this.isRookieWardActive() ? 0.085 : 0.074,
        hue: 282,
        rewardScore: 320,
        rewardCharge: 0.72,
        failPressure: 0.05,
        failIntegrity: 0.024,
        failTurnover: false,
        successBanner: "RUNE MASTERED"
      };
    } else if (id === "ICE_SPRINT") {
      challenge = {
        id,
        label: "Ice Sprint",
        prompt: "Race lane-to-lane before the horn",
        durationSec: this.isRookieWardActive() ? 8.3 : 7.2,
        timeRemainingSec: this.isRookieWardActive() ? 8.3 : 7.2,
        introRemainingSec: 1.2,
        checkpoints: this.buildIceSprintCheckpoints(seed),
        currentCheckpointIndex: 0,
        checkpointRadiusScale: this.isRookieWardActive() ? 0.092 : 0.082,
        hue: 188,
        rewardScore: 280,
        rewardCharge: 0.62,
        failPressure: 0.065,
        failIntegrity: 0.03,
        failTurnover: true,
        successBanner: "SPRINT WON"
      };
    } else {
      challenge = {
        id: "SPEED_BURST",
        label: "Speed Burst",
        prompt: "Chain quick gates at max tempo",
        durationSec: this.isRookieWardActive() ? 8.6 : 7.4,
        timeRemainingSec: this.isRookieWardActive() ? 8.6 : 7.4,
        introRemainingSec: 1.1,
        checkpoints: this.buildSpeedBurstCheckpoints(seed),
        currentCheckpointIndex: 0,
        checkpointRadiusScale: this.isRookieWardActive() ? 0.09 : 0.078,
        hue: 200,
        rewardScore: 250,
        rewardCharge: 0.58,
        failPressure: 0.055,
        failIntegrity: 0.02,
        failTurnover: false,
        successBanner: "TEMPO SURGE"
      };
    }

    this.interludeChallenge = challenge;
    this.interludeCheckpointWasInside = false;
    this.target = null;
    this.wasInsideTarget = false;
    this.spawnDelay = 0.16;
    this.combo = 0;
    this.flashCombo(challenge.label.toUpperCase(), "hit");
    this.showStatus(`${challenge.label} • ${challenge.prompt}`, this.possession === "PLAYER" ? "offense" : "defense", 1.12);
    const pad = this.getPadBounds();
    const cx = pad.x + pad.width * 0.5;
    const cy = pad.y + pad.height * 0.5;
    this.effects.spawnShockwave(cx, cy, challenge.hue, 1.15);
    this.effects.triggerShake(0.22);
  }

  private resolveInterludeChallenge(success: boolean): void {
    const challenge = this.interludeChallenge;
    if (!challenge) {
      return;
    }

    const pad = this.getPadBounds();
    const cx = pad.x + pad.width * 0.5;
    const cy = pad.y + pad.height * 0.5;

    if (success) {
      this.completedInterludes += 1;
      const timeBonus = Math.round(challenge.timeRemainingSec * 32);
      this.score += challenge.rewardScore + timeBonus;
      this.addPlayerAttackCharge(challenge.rewardCharge + clamp(challenge.timeRemainingSec / challenge.durationSec, 0, 1) * 0.14);
      this.riftPressure = clamp(this.riftPressure - 0.07, 0, 1);
      this.sealIntegrity = clamp(this.sealIntegrity + 0.03, 0, 1);
      this.applyThreatSafetyRails();
      this.flashCombo(challenge.successBanner, "great");
      this.showStatus(`${challenge.label} clear • momentum gained`, this.possession === "PLAYER" ? "offense" : "goal", 1.05);
      this.effects.spawnFloatingText(cx, cy - Math.min(pad.width, pad.height) * 0.06, challenge.successBanner, challenge.hue);
      this.effects.spawnShockwave(cx, cy, challenge.hue, 1.42);
      this.effects.triggerShake(0.38);
    } else {
      this.riftPressure = clamp(this.riftPressure + challenge.failPressure, 0, 1);
      this.sealIntegrity = clamp(this.sealIntegrity - challenge.failIntegrity, 0, 1);
      this.applyThreatSafetyRails();
      this.addEnemyAttackCharge(0.18 + (challenge.id === "ICE_SPRINT" ? 0.14 : 0.08));
      if (challenge.failTurnover && this.possession === "PLAYER" && !this.ended) {
        this.changePossession("ENEMY", "TURNOVER");
      }
      this.flashCombo(`${challenge.label.toUpperCase()} FAILED`, "late");
      this.showStatus(`${challenge.label} failed • pressure rises`, "danger", 1.05);
      this.effects.spawnFloatingText(cx, cy - Math.min(pad.width, pad.height) * 0.06, "CHALLENGE LOST", 18);
      this.effects.spawnShockwave(cx, cy, 14, 1.24);
      this.effects.triggerShake(0.44);
    }

    this.interludeChallenge = null;
    this.interludeCheckpointWasInside = false;
    if (!this.ended && this.faceoffSpell === null) {
      this.spawnDelay = Math.min(this.spawnDelay, 0.12);
    }
  }

  private updateInterludeChallenge(dt: number): void {
    const challenge = this.interludeChallenge;
    if (!challenge || this.ended) {
      return;
    }

    if (challenge.introRemainingSec > 0) {
      challenge.introRemainingSec = Math.max(0, challenge.introRemainingSec - dt);
      return;
    }

    challenge.timeRemainingSec = Math.max(0, challenge.timeRemainingSec - dt);
    const checkpoint = challenge.checkpoints[challenge.currentCheckpointIndex];
    if (checkpoint) {
      const pad = this.getPadBounds();
      const puckPx = padToPixel(pad, this.provider.getPosition());
      const checkpointPx = padToPixel(pad, checkpoint);
      const radiusPx = Math.min(pad.width, pad.height) * challenge.checkpointRadiusScale;
      const dist = Math.hypot(puckPx.x - checkpointPx.x, puckPx.y - checkpointPx.y);
      const inside = dist <= radiusPx;

      if (inside && !this.interludeCheckpointWasInside) {
        challenge.currentCheckpointIndex += 1;
        this.interludeCheckpointWasInside = true;
        this.effects.spawnHitBurst(checkpointPx.x, checkpointPx.y, challenge.hue, 1.1);
        this.playPuckHitSfx(0.75);
        if (challenge.currentCheckpointIndex >= challenge.checkpoints.length) {
          this.resolveInterludeChallenge(true);
          return;
        }
      } else if (!inside) {
        this.interludeCheckpointWasInside = false;
      }
    }

    if (challenge.timeRemainingSec <= 0) {
      this.resolveInterludeChallenge(false);
    }
  }

  private getPeriodFaceoffFavoredPossession(): Possession {
    const diff = this.getGoalDifferential();
    if (diff <= -1) {
      return "PLAYER";
    }
    if (diff >= 1) {
      return "ENEMY";
    }
    return this.currentPeriod === 1 ? "PLAYER" : this.possession;
  }

  private startFaceoffSpell(trigger: FaceoffSpellTrigger, favoredPossession: Possession): void {
    if (this.ended) {
      return;
    }

    const difficulty = this.getDifficultySnapshot();
    const pad = this.getPadBounds();
    const minDim = Math.max(240, Math.min(pad.width, pad.height));
    const breachRitual = trigger === "BREACH_SAVE";
    const centerIceFaceoff = trigger === "GOAL_RESET";
    const anchor = breachRitual || centerIceFaceoff ? { x: 0.5, y: 0.5 } : this.getRandomFaceoffAnchor();
    const approachDuration = 0;
    const openingBonus = trigger === "OPENING" ? 0.35 : 0;
    const rookieBonus = this.isRookieWardActive() ? 0.4 : 0;
    const demoBonus = this.spellDemoMode ? 0.95 : 0;
    const ritualBonus = breachRitual ? 0.78 : 0;
    const traceDuration = clamp(
      2.25 + openingBonus + rookieBonus + demoBonus + ritualBonus - difficulty.baseIntensity * (breachRitual ? 0.16 : 0.25),
      1.7,
      breachRitual ? 4.8 : 4.4
    );
    const snapWindow = clamp(
      0.72 +
        (this.isRookieWardActive() ? 0.22 : 0) +
        (this.spellDemoMode ? 0.3 : 0) +
        (breachRitual ? 0.3 : 0) -
        difficulty.baseIntensity * (breachRitual ? 0.035 : 0.06),
      0.55,
      breachRitual ? 1.6 : 1.45
    );
    const cueDelay = clamp(
      0.34 + (this.spellDemoMode ? 0.18 : 0) + (breachRitual ? 0.08 : 0) - difficulty.baseIntensity * (breachRitual ? 0.03 : 0.06),
      0.2,
      breachRitual ? 0.82 : 0.7
    );
    const centerHold = this.isRookieWardActive() || this.spellDemoMode || breachRitual ? 0.11 : 0.145;
    const runeSpinSeed = Math.random() * 1000;
    const totalDurationSec = traceDuration + cueDelay + snapWindow;
    const toleranceBoost = breachRitual ? 0.014 : 0;
    this.faceoffSpell = {
      trigger,
      favoredPossession,
      anchor,
      stage: "APPROACH",
      nodes: this.buildFaceoffSpellNodes(runeSpinSeed, anchor),
      currentNodeIndex: 0,
      traceTolerancePx: minDim * (this.isRookieWardActive() || this.spellDemoMode ? 0.118 : 0.09) + minDim * toleranceBoost,
      snapTolerancePx: minDim * (this.isRookieWardActive() || this.spellDemoMode ? 0.118 : 0.096) + minDim * toleranceBoost,
      approachDurationSec: approachDuration,
      traceDurationSec: traceDuration,
      totalDurationSec,
      timeRemainingSec: 0,
      snapCueDelaySec: cueDelay,
      snapWindowRemainingSec: snapWindow,
      centerHoldSec: 0,
      centerHoldGoalSec: centerHold,
      runeSpinSeed
    };

    this.target = null;
    this.wasInsideTarget = false;
    this.spawnDelay = 0.16;
    this.combo = 0;
    this.possessionLockTimer = 0;

    if (breachRitual) {
      this.flashCombo("TOUCH RITUAL START", "miss");
      this.showStatus("Emergency ritual • touch the start glyph to begin tracing", "danger", 1.12);
      this.playGameSfx("warning");
      return;
    }

    if (trigger === "OPENING") {
      this.flashCombo(this.spellDemoMode ? "SPELL DEMO" : "FACEOFF GLYPH", "combo");
      this.showStatus(
        this.spellDemoMode
          ? "Demo pace • touch the start glyph, then trace + snap"
          : "Touch the highlighted start glyph, then trace + snap",
        "offense",
        this.spellDemoMode ? 0.92 : 1.1
      );
      return;
    }

    if (trigger === "PERIOD") {
      this.flashCombo("PERIOD FACEOFF", "hit");
      this.showStatus(
        `${this.getPeriodLabel(this.currentPeriod)} period draw • touch the start glyph`,
        favoredPossession === "PLAYER" ? "offense" : "defense",
        1.05
      );
      return;
    }

    this.flashCombo(centerIceFaceoff ? "CENTER ICE FACEOFF" : "FACEOFF RESET", "hit");
    this.showStatus(
      centerIceFaceoff
        ? "Goal reset • touch the start glyph at center ice"
        : "Rune draw reset • touch the start glyph",
      favoredPossession === "PLAYER" ? "offense" : "defense",
      0.95
    );
  }

  private updateFaceoffSpell(dt: number): void {
    const spell = this.faceoffSpell;
    if (!spell) {
      return;
    }

    const pad = this.getPadBounds();
    const puckPx = padToPixel(pad, this.provider.getPosition());

    if (spell.stage === "APPROACH") {
      const startNode = spell.nodes[0];
      const startPx = padToPixel(pad, startNode);
      const distToStart = Math.hypot(puckPx.x - startPx.x, puckPx.y - startPx.y);
      const startTolerance = spell.traceTolerancePx * 1.08;
      if (distToStart <= startTolerance) {
        this.effects.spawnHitBurst(startPx.x, startPx.y, spell.trigger === "BREACH_SAVE" ? 22 : 198, 0.86);
        spell.currentNodeIndex = Math.min(1, Math.max(0, spell.nodes.length - 1));
        if (spell.currentNodeIndex >= spell.nodes.length) {
          spell.stage = "SNAP";
          spell.timeRemainingSec = spell.snapCueDelaySec + spell.snapWindowRemainingSec;
          this.flashCombo("SNAP TO CENTER", "great");
          this.showStatus("Hold... then snap to center on cue", "offense", 0.88);
          return;
        }
        spell.stage = "TRACE";
        spell.timeRemainingSec = spell.traceDurationSec;
        if (spell.trigger === "BREACH_SAVE") {
          this.flashCombo("TRACE TO SEAL", "great");
          this.showStatus("Trace the ritual now", "danger", 0.95);
        } else {
          this.flashCombo("TRACE THE RUNE", "great");
          this.showStatus("Trace the rune path", "offense", 0.85);
        }
      }
      return;
    }

    spell.timeRemainingSec = Math.max(0, spell.timeRemainingSec - dt);

    if (spell.stage === "TRACE") {
      const node = spell.nodes[spell.currentNodeIndex];
      const nodePx = padToPixel(pad, node);
      const dist = Math.hypot(puckPx.x - nodePx.x, puckPx.y - nodePx.y);
      if (dist <= spell.traceTolerancePx) {
        spell.currentNodeIndex += 1;
        this.effects.spawnHitBurst(nodePx.x, nodePx.y, 198, 0.72 + spell.currentNodeIndex * 0.05);
        if (spell.currentNodeIndex >= spell.nodes.length) {
          spell.stage = "SNAP";
          spell.timeRemainingSec = spell.snapCueDelaySec + spell.snapWindowRemainingSec;
          this.flashCombo("SNAP TO CENTER", "great");
          this.showStatus("Hold... then snap to center on cue", "offense", 0.88);
        }
      }

      if (spell.timeRemainingSec <= 0) {
        this.resolveFaceoffSpell(false);
      }
      return;
    }

    if (spell.snapCueDelaySec > 0) {
      spell.snapCueDelaySec = Math.max(0, spell.snapCueDelaySec - dt);
      spell.timeRemainingSec = spell.snapCueDelaySec + spell.snapWindowRemainingSec;
      if (spell.snapCueDelaySec <= 0.001) {
        const anchor = padToPixel(pad, spell.anchor);
        const cx = anchor.x;
        const cy = anchor.y;
        this.effects.spawnShockwave(cx, cy, 212, 1.05);
        this.flashCombo("NOW!", "perfect");
      }
      return;
    }

    spell.snapWindowRemainingSec = Math.max(0, spell.snapWindowRemainingSec - dt);
    spell.timeRemainingSec = spell.snapWindowRemainingSec;
    const centerPx = padToPixel(pad, spell.anchor);
    const distToCenter = Math.hypot(puckPx.x - centerPx.x, puckPx.y - centerPx.y);
    if (distToCenter <= spell.snapTolerancePx) {
      spell.centerHoldSec = Math.min(spell.centerHoldGoalSec, spell.centerHoldSec + dt);
    } else {
      spell.centerHoldSec = Math.max(0, spell.centerHoldSec - dt * 1.8);
    }

    if (spell.centerHoldSec >= spell.centerHoldGoalSec) {
      this.resolveFaceoffSpell(true);
      return;
    }

    if (spell.snapWindowRemainingSec <= 0) {
      this.resolveFaceoffSpell(false);
    }
  }

  private updateSpellDemoLoop(dt: number): void {
    this.faceoffDemoCooldown = Math.max(0, this.faceoffDemoCooldown - dt);
    if (this.faceoffSpell || this.faceoffDemoCooldown > 0 || this.ended) {
      return;
    }
    const favored: Possession = this.faceoffDemoRounds % 2 === 0 ? "PLAYER" : "ENEMY";
    this.faceoffDemoRounds += 1;
    this.startFaceoffSpell("OPENING", favored);
  }

  private resolveFaceoffSpell(success: boolean): void {
    const spell = this.faceoffSpell;
    if (!spell || this.ended) {
      return;
    }

    this.faceoffSpell = null;

    if (spell.trigger === "BREACH_SAVE") {
      const pad = this.getPadBounds();
      const anchor = padToPixel(pad, spell.anchor);
      const cx = anchor.x;
      const cy = anchor.y;
      const ritualPower = clamp(1 + this.combo * 0.08 + (success ? 0.25 : 0), 0.9, 2.1);

      if (success) {
        const integrityRestore = 0.24 + Math.min(0.16, this.bestCombo * 0.012);
        const pressureDrop = 0.28 + Math.min(0.14, this.bestCombo * 0.01);
        this.sealIntegrity = clamp(Math.max(this.sealIntegrity, 0.08) + integrityRestore, 0, 1);
        this.riftPressure = clamp(this.riftPressure - pressureDrop, 0, 1);
        this.applyThreatSafetyRails();
        this.breachRitualSaves += 1;
        this.score += 180 + Math.round(this.bestCombo * 12);
        this.flashCombo("SEAL STABILIZED", "perfect");
        this.showStatus(`Ritual success • seal restored (${this.breachRitualSaves})`, "goal", 1.2);
        this.effects.spawnFloatingText(cx, cy - Math.min(pad.width, pad.height) * 0.08, "SEAL HELD", 200);
        this.effects.spawnShockwave(cx, cy, 200, 1.45 * ritualPower);
        this.effects.spawnHitBurst(cx, cy, 196, 1.55 * ritualPower);
        this.effects.triggerShake(0.52 * ritualPower);
      } else {
        this.flashCombo("RITUAL FAILED", "miss");
        this.showStatus("Rift consumes the seal", "danger", 1.05);
        this.effects.spawnFloatingText(cx, cy - Math.min(pad.width, pad.height) * 0.08, "RIFT WINS", 8);
        this.effects.spawnShockwave(cx, cy, 12, 1.6 * ritualPower);
        this.effects.triggerShake(0.62 * ritualPower);
        this.triggerBreach();
      }
      return;
    }

    const winner: Possession = success ? "PLAYER" : spell.favoredPossession;
    this.changePossession(winner, "FACEOFF", { fromFaceoffResolution: true });

    const pad = this.getPadBounds();
    const anchor = padToPixel(pad, spell.anchor);
    const cx = anchor.x;
    const cy = anchor.y;
    const label = winner === "PLAYER" ? "OFFENSE" : "DEFENSE";
    const hue = winner === "PLAYER" ? 200 : 16;
    const tone = winner === "PLAYER" ? "offense" : "defense";
    const comboVariant = winner === "PLAYER" ? (success ? "great" : "hit") : "late";

    if (success && winner === "PLAYER" && spell.favoredPossession === "ENEMY") {
      this.flashCombo("RUNE STEAL", "perfect");
      this.showStatus("Spell steal • you win the draw", "goal", 1.1);
    } else if (success && winner === "PLAYER") {
      this.flashCombo("DRAW WON", comboVariant);
      this.showStatus("Clean draw • offense starts", tone, 1);
    } else if (!success && winner === "PLAYER") {
      this.flashCombo("SCRAMBLE WIN", comboVariant);
      this.showStatus("Scramble draw • you still keep puck", tone, 0.95);
    } else {
      this.flashCombo("DRAW LOST", comboVariant);
      this.showStatus("Lost draw • defend the rush", tone, 1.05);
    }

    this.effects.spawnFloatingText(cx, cy - Math.min(pad.width, pad.height) * 0.07, label, hue);
    this.effects.spawnShockwave(cx, cy, hue, success ? 1.1 : 1.24);
    this.effects.triggerShake(success ? 0.32 : 0.42);
    this.playGameSfx(winner === "PLAYER" ? "offense" : "defense");
    if (this.spellDemoMode) {
      this.faceoffDemoCooldown = 0.85;
    }
  }

  private playRandomIntroClip(): void {
    const clips = this.introClipUrls;
    if (clips.length === 0) {
      this.tryStartBackgroundMusic();
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
    this.stopBackgroundMusic();

    const audio = new Audio(clips[index] ?? clips[0]);
    audio.preload = "auto";
    audio.volume = 0.78;
    audio.addEventListener("loadedmetadata", () => {
      if (this.introAudio === audio) {
        this.syncPreStartCountdownToIntroAudio();
        this.updateCountdownDom();
      }
    });
    audio.addEventListener("durationchange", () => {
      if (this.introAudio === audio) {
        this.syncPreStartCountdownToIntroAudio();
        this.updateCountdownDom();
      }
    });
    audio.addEventListener(
      "ended",
      () => {
        if (this.introAudio === audio) {
          if (this.preStartCountdownActive) {
            this.preStartCountdownRemainingSec = 0;
            this.preStartCountdownSyncedToIntro = true;
            this.updateCountdownDom();
          }
          this.introAudio = null;
          this.tryStartBackgroundMusic();
        }
      },
      { once: true }
    );
    this.introAudio = audio;
    void audio.play().catch(() => {
      if (this.introAudio === audio) {
        this.introAudio = null;
      }
      this.tryStartBackgroundMusic();
    });
  }

  private getAnnouncerToneTier(): "ROOKIE" | "MILD" | "FULL" {
    if (this.trainingMode) {
      return "ROOKIE";
    }
    if (this.playerRunCount < 3) {
      return "ROOKIE";
    }
    if (this.playerRunCount < 12) {
      return "MILD";
    }
    return "FULL";
  }

  private getAvailableSfxClipsForKey(key: GameSfxKey): string[] {
    const clips = this.gameSfxClips[key] ?? [];
    const tier = this.getAnnouncerToneTier();
    if (clips.length === 0) {
      return clips;
    }

    const isHarsh = (url: string): boolean => /you%20suck|you suck|teerible/i.test(url);
    const isTaunt = (url: string): boolean => /boo|teerible|you%20lose|you lose|you%20suck|you suck/i.test(url);

    if (tier === "FULL") {
      return clips;
    }
    if (tier === "MILD") {
      if (key === "warning" || key === "goal_against" || key === "loss") {
        const filtered = clips.filter((url) => !isHarsh(url));
        return filtered.length > 0 ? filtered : clips;
      }
      return clips;
    }

    // Rookie/training tier: no taunt callouts on mistakes/goals against/loss.
    if (key === "warning") {
      return [];
    }
    if (key === "goal_against" || key === "loss") {
      const filtered = clips.filter((url) => !isTaunt(url));
      return filtered.length > 0 ? filtered : [];
    }
    return clips;
  }

  private getPooledSfxAudio(url: string, poolSize: number): HTMLAudioElement {
    const size = Math.max(1, Math.floor(poolSize));
    let pool = this.sfxAudioPools.get(url);
    if (!pool) {
      pool = [];
      this.sfxAudioPools.set(url, pool);
      this.sfxAudioPoolCursor.set(url, 0);
    }

    while (pool.length < size) {
      const audio = new Audio(url);
      audio.preload = "auto";
      pool.push(audio);
    }

    const cursor = this.sfxAudioPoolCursor.get(url) ?? 0;
    const nextIndex = cursor % pool.length;
    this.sfxAudioPoolCursor.set(url, (nextIndex + 1) % pool.length);
    return pool[nextIndex]!;
  }

  private playPooledSfx(url: string, volume: number, poolSize: number): void {
    const audio = this.getPooledSfxAudio(url, poolSize);
    audio.volume = volume;
    try {
      audio.currentTime = 0;
    } catch {
      // Ignore seek failures while the element is still priming.
    }
    void audio.play().catch(() => {
      // Ignore autoplay/user-gesture failures.
    });
  }

  private playGameSfx(key: GameSfxKey): void {
    // Avoid layering gameplay callouts on top of the pre-game intro VO.
    if (this.introAudio) {
      return;
    }
    const clips = this.getAvailableSfxClipsForKey(key);
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

    const volume = key === "goal" || key === "victory" ? 0.88 : key === "loss" || key === "goal_against" ? 0.8 : 0.72;
    this.duckBackgroundMusic(key === "goal" || key === "goal_against" || key === "victory" || key === "loss" ? 950 : 520);
    this.playPooledSfx(clips[index] ?? clips[0]!, volume, ANNOUNCER_SFX_POOL_SIZE);
  }

  private playPuckHitSfx(intensity: number): void {
    if (this.introAudio) {
      return;
    }
    const clips = this.puckHitSfxUrls;
    if (!clips || clips.length === 0) {
      return;
    }

    const now = performance.now();
    if (now - this.puckHitSfxLastPlayedAt < this.puckHitSfxCooldownMs) {
      return;
    }

    let index = Math.floor(Math.random() * clips.length);
    if (clips.length > 1 && index === this.puckHitSfxLastClipIndex) {
      index = (index + 1 + Math.floor(Math.random() * (clips.length - 1))) % clips.length;
    }
    this.puckHitSfxLastClipIndex = index;
    this.puckHitSfxLastPlayedAt = now;

    const volume = clamp(0.28 + intensity * 0.22, 0.24, 0.56);
    this.duckBackgroundMusic(160);
    this.playPooledSfx(clips[index] ?? clips[0]!, volume, PUCK_HIT_SFX_POOL_SIZE);
  }

  private playCrackPropagationCue(intensity: number): void {
    if (this.introAudio || this.trainingMode || this.spellDemoMode || this.preStartCountdownActive) {
      return;
    }
    const now = performance.now();
    if (now - this.crackPropagationCueLastAtMs < this.crackPropagationCueCooldownMs) {
      return;
    }
    this.crackPropagationCueLastAtMs = now;
    this.duckBackgroundMusic(120);

    const windowWithWebkitAudio = window as Window & { webkitAudioContext?: typeof AudioContext };
    const AudioContextCtor = windowWithWebkitAudio.AudioContext ?? windowWithWebkitAudio.webkitAudioContext;
    if (!AudioContextCtor) {
      this.playPuckHitSfx(clamp(0.64 + intensity * 0.16, 0.6, 1));
      return;
    }

    try {
      if (!this.crackCueAudioContext || this.crackCueAudioContext.state === "closed") {
        this.crackCueAudioContext = new AudioContextCtor();
      }
      const audioCtx = this.crackCueAudioContext;
      if (audioCtx.state === "suspended") {
        void audioCtx.resume();
      }

      const at = audioCtx.currentTime;
      const baseHz = 210 + intensity * 130;

      const primary = audioCtx.createOscillator();
      primary.type = "triangle";
      primary.frequency.setValueAtTime(baseHz, at);
      primary.frequency.exponentialRampToValueAtTime(Math.max(86, baseHz * 0.33), at + 0.18);

      const brittle = audioCtx.createOscillator();
      brittle.type = "square";
      brittle.frequency.setValueAtTime(baseHz * 1.82, at);
      brittle.frequency.exponentialRampToValueAtTime(Math.max(146, baseHz * 0.72), at + 0.12);

      const filter = audioCtx.createBiquadFilter();
      filter.type = "bandpass";
      filter.frequency.setValueAtTime(760 + intensity * 280, at);
      filter.Q.value = 0.8 + intensity * 1.1;

      const gain = audioCtx.createGain();
      gain.gain.setValueAtTime(0.0001, at);
      gain.gain.exponentialRampToValueAtTime(0.06 + intensity * 0.045, at + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.22);

      primary.connect(filter);
      brittle.connect(filter);
      filter.connect(gain);
      gain.connect(audioCtx.destination);

      primary.start(at);
      brittle.start(at + 0.002);
      primary.stop(at + 0.24);
      brittle.stop(at + 0.16);

      primary.onended = () => {
        primary.disconnect();
        brittle.disconnect();
        filter.disconnect();
        gain.disconnect();
      };
    } catch {
      this.playPuckHitSfx(clamp(0.6 + intensity * 0.18, 0.6, 1));
    }
  }

  private updateBackgroundMusic(dt: number): void {
    const bgm = this.bgmAudio;
    if (!bgm) {
      return;
    }
    const now = performance.now();
    const targetGain = now < this.bgmDuckUntilMs ? this.bgmDuckVolume : 1;
    const lerpRate = now < this.bgmDuckUntilMs ? 8.5 : 3.8;
    const t = Math.min(1, dt * lerpRate);
    this.bgmCurrentGain += (targetGain - this.bgmCurrentGain) * t;
    bgm.volume = this.bgmBaseVolume * this.bgmCurrentGain;
  }

  private duckBackgroundMusic(durationMs: number): void {
    if (!this.bgmAudio) {
      return;
    }
    this.bgmDuckUntilMs = Math.max(this.bgmDuckUntilMs, performance.now() + Math.max(0, durationMs));
  }

  private stopBackgroundMusic(): void {
    this.bgmDuckUntilMs = 0;
    this.bgmCurrentGain = 0;
    if (!this.bgmAudio) {
      return;
    }
    this.bgmAudio.pause();
    this.bgmAudio.src = "";
    this.bgmAudio = null;
  }

  private tryStartBackgroundMusic(): void {
    if (this.introAudio || this.bgmAudio || this.bgmTrackUrls.length === 0) {
      return;
    }
    this.playNextBackgroundTrack();
  }

  private playNextBackgroundTrack(): void {
    if (this.bgmTrackUrls.length === 0 || this.introAudio) {
      return;
    }

    let index = Math.floor(Math.random() * this.bgmTrackUrls.length);
    if (this.bgmTrackUrls.length > 1 && index === this.lastBgmTrackIndex) {
      index = (index + 1 + Math.floor(Math.random() * (this.bgmTrackUrls.length - 1))) % this.bgmTrackUrls.length;
    }
    this.lastBgmTrackIndex = index;

    this.stopBackgroundMusic();

    const audio = new Audio(this.bgmTrackUrls[index] ?? this.bgmTrackUrls[0]);
    audio.preload = "auto";
    audio.loop = false;
    this.bgmCurrentGain = 0.75;
    audio.volume = this.bgmBaseVolume * this.bgmCurrentGain;
    audio.addEventListener("ended", () => {
      if (this.bgmAudio === audio) {
        this.bgmAudio = null;
        this.playNextBackgroundTrack();
      }
    });
    audio.addEventListener("error", () => {
      if (this.bgmAudio === audio) {
        this.bgmAudio = null;
        this.playNextBackgroundTrack();
      }
    });
    this.bgmAudio = audio;
    void audio.play().catch(() => {
      if (this.bgmAudio === audio) {
        this.bgmAudio = null;
      }
    });
  }

  private spawnTarget(): void {
    const margin = 0.12;
    const difficulty = this.getDifficultySnapshot();
    const pressure = this.riftPressure + (this.breachSurgeTimer > 0 ? 0.16 : 0);
    const rubberBand = this.getEnemyRubberBand();
    const assist = this.getPlayerAssist();
    const enemyHasPuck = this.possession === "ENEMY";
    const chaos = clamp(
      this.monsterTeam.gateAggression * 0.18 +
        (enemyHasPuck ? 0.11 : 0) +
        Math.max(0, rubberBand) * 0.24 -
        assist * 0.14 +
        difficulty.gateChaosBonus +
        (enemyHasPuck ? difficulty.enemySurge * 0.16 : difficulty.enemySurge * 0.05),
      0,
      0.42
    );

    const radiusBase = enemyHasPuck ? 0.055 : 0.06;
    const radius = clamp(
      radiusBase + Math.random() * 0.03 - chaos * 0.025 + assist * 0.014 + difficulty.gateRadiusBias,
      0.041,
      0.092
    );

    const lifetimeScale = clamp(
      1 - Math.min(0.34, pressure * 0.2 + chaos * 0.32) + assist * 0.12 + difficulty.gateLifetimeBias,
      0.62,
      1.28
    );
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
        assist * 0.03 +
        difficulty.driftBias,
      0,
      0.2
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
    const hitAudioIntensity = clamp((grade === "PERFECT" ? 1 : grade === "GREAT" ? 0.82 : 0.7) + this.combo * 0.03, 0.6, 1.25);
    this.playPuckHitSfx(hitAudioIntensity);
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
    this.applyThreatSafetyRails();

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

  private getCurrentPeriodProgress(): number {
    if (this.periodDurationSec <= 0) {
      return 0;
    }
    const elapsedTotal = this.sessionDuration - this.timeRemaining;
    const periodStart = this.currentPeriodIndex * this.periodDurationSec;
    return clamp((elapsedTotal - periodStart) / this.periodDurationSec, 0, 1);
  }

  private getGoalDifferential(): number {
    return this.playerGoals - this.enemyGoals;
  }

  private isBreachMechanicEnabled(): boolean {
    return !this.trainingMode && this.threatProgression.breachEnabled;
  }

  private isRookieWardActive(): boolean {
    return !this.trainingMode && this.threatProgression.rookieWardActive;
  }

  private applyThreatSafetyRails(): void {
    if (this.trainingMode) {
      this.riftPressure = clamp(this.riftPressure, 0, 0.18);
      this.sealIntegrity = clamp(Math.max(this.sealIntegrity, 0.82), 0, 1);
      return;
    }
    if (this.isRookieWardActive()) {
      // Early matches teach offense/defense + timing first. Threat is visible but cannot end the run yet.
      this.riftPressure = clamp(this.riftPressure, 0.02, 0.58);
      this.sealIntegrity = clamp(Math.max(this.sealIntegrity, 0.38), 0, 1);
    }
  }

  private getDifficultySnapshot(): DifficultySnapshot {
    if (this.trainingMode) {
      return {
        pace: "OPENING",
        paceLabel: "Training • forgiving practice gates",
        paceShort: "Training",
        baseIntensity: 0,
        openingGrace: 0.4,
        finalPush: 0,
        playerMercy: 0.4,
        enemySurge: 0,
        gateChaosBonus: -0.08,
        gateRadiusBias: 0.024,
        gateLifetimeBias: 0.22,
        driftBias: -0.02,
        enemyAttackScale: 0,
        tensionScale: 0,
        playerShotChanceBias: 0.14,
        enemyShotChanceBias: -0.2,
        playerThresholdAssist: 0.16,
        enemyThresholdPressure: -0.12,
        missPenaltyScale: 0
      };
    }

    const periodProgress = this.getCurrentPeriodProgress();

    let pace: DifficultyPace = "OPENING";
    let baseIntensity = 0.1 + periodProgress * 0.18;
    if (this.currentPeriodIndex === 1) {
      pace = "PRESSURE";
      baseIntensity = 0.34 + periodProgress * 0.24;
    } else if (this.currentPeriodIndex >= 2) {
      pace = "FINAL_PUSH";
      baseIntensity = 0.62 + periodProgress * 0.3;
    }

    const openingGrace = this.currentPeriodIndex === 0 ? 0.2 + (1 - periodProgress) * 0.12 : 0;
    const finalPush =
      this.currentPeriodIndex >= 2 ? 0.16 + periodProgress * 0.2 : this.currentPeriodIndex === 1 ? 0.03 + periodProgress * 0.05 : 0;

    const lead = Math.max(0, this.getGoalDifferential());
    const trail = Math.max(0, -this.getGoalDifferential());
    const enemySurge = clamp(
      lead * (0.1 + 0.07 * this.monsterTeam.comebackBias) +
        Math.max(0, lead - 1) * 0.11 +
        finalPush * 0.55,
      0,
      0.46
    );
    const playerMercy = clamp(
      trail * 0.16 +
        Math.max(0, trail - 1) * 0.08 +
        openingGrace * 0.55 +
        (this.currentPeriodIndex === 0 ? 0.05 : 0),
      0,
      0.42
    );

    let paceLabel = "Opening Shift • Forgiving gates";
    let paceShort = "Opening";
    if (pace === "PRESSURE") {
      paceLabel = "Pressure Shift • Monster gates speed up";
      paceShort = "Pressure";
    } else if (pace === "FINAL_PUSH") {
      paceLabel = "Final Push • Smaller, faster gates";
      paceShort = "Final Push";
    }

    const snapshot: DifficultySnapshot = {
      pace,
      paceLabel,
      paceShort,
      baseIntensity: clamp(baseIntensity, 0, 1),
      openingGrace,
      finalPush,
      playerMercy,
      enemySurge,
      gateChaosBonus: baseIntensity * 0.14 + enemySurge * 0.28 - playerMercy * 0.18,
      gateRadiusBias:
        playerMercy * 0.018 +
        openingGrace * 0.012 -
        baseIntensity * 0.008 -
        enemySurge * 0.015 -
        finalPush * 0.008,
      gateLifetimeBias:
        playerMercy * 0.14 +
        openingGrace * 0.08 -
        baseIntensity * 0.1 -
        enemySurge * 0.14 -
        finalPush * 0.08,
      driftBias: baseIntensity * 0.02 + enemySurge * 0.06 - playerMercy * 0.03 + finalPush * 0.03,
      enemyAttackScale: clamp(
        0.9 + baseIntensity * 0.28 + enemySurge * 0.22 + finalPush * 0.16 - playerMercy * 0.1,
        0.8,
        1.55
      ),
      tensionScale: clamp(
        0.88 + baseIntensity * 0.34 + finalPush * 0.18 + enemySurge * 0.18 - playerMercy * 0.16,
        0.8,
        1.5
      ),
      playerShotChanceBias: clamp(playerMercy * 0.08 - enemySurge * 0.03, -0.04, 0.12),
      enemyShotChanceBias: clamp(baseIntensity * 0.03 + enemySurge * 0.09 + finalPush * 0.04 - playerMercy * 0.05, -0.04, 0.14),
      playerThresholdAssist: clamp(playerMercy * 0.22 + openingGrace * 0.06, 0, 0.14),
      enemyThresholdPressure: clamp(enemySurge * 0.2 + finalPush * 0.06 - playerMercy * 0.04, -0.03, 0.15),
      missPenaltyScale: clamp(
        0.9 + baseIntensity * 0.24 + enemySurge * 0.2 + finalPush * 0.12 - playerMercy * 0.12,
        0.82,
        1.5
      )
    };

    if (this.isRookieWardActive()) {
      const rookieEase = 1;
      snapshot.paceLabel = `${snapshot.paceLabel} • Rookie ward`;
      snapshot.gateChaosBonus -= 0.05 * rookieEase;
      snapshot.gateRadiusBias += 0.02 * rookieEase;
      snapshot.gateLifetimeBias += 0.18 * rookieEase;
      snapshot.driftBias -= 0.02 * rookieEase;
      snapshot.enemyAttackScale = clamp(snapshot.enemyAttackScale * 0.84, 0.65, 1.15);
      snapshot.tensionScale = clamp(snapshot.tensionScale * 0.52, 0.28, 0.9);
      snapshot.playerShotChanceBias = clamp(snapshot.playerShotChanceBias + 0.06, -0.04, 0.18);
      snapshot.enemyShotChanceBias = clamp(snapshot.enemyShotChanceBias - 0.05, -0.12, 0.14);
      snapshot.playerThresholdAssist = clamp(snapshot.playerThresholdAssist + 0.08, 0, 0.22);
      snapshot.enemyThresholdPressure = clamp(snapshot.enemyThresholdPressure - 0.08, -0.12, 0.15);
      snapshot.missPenaltyScale = clamp(snapshot.missPenaltyScale * 0.62, 0.45, 0.95);
      return snapshot;
    }

    const escalationTier = this.threatProgression.escalationTier;
    if (escalationTier > 0) {
      const step = Math.min(3, escalationTier);
      snapshot.paceLabel = `${snapshot.paceLabel} • Rift tier ${this.threatProgression.threatTier}`;
      snapshot.gateChaosBonus += 0.018 * step;
      snapshot.gateRadiusBias -= 0.004 * step;
      snapshot.gateLifetimeBias -= 0.035 * step;
      snapshot.driftBias += 0.01 * step;
      snapshot.enemyAttackScale = clamp(snapshot.enemyAttackScale + 0.06 * step, 0.8, 1.75);
      snapshot.tensionScale = clamp(snapshot.tensionScale + 0.08 * step, 0.8, 1.8);
      snapshot.enemyShotChanceBias = clamp(snapshot.enemyShotChanceBias + 0.02 * step, -0.04, 0.2);
      snapshot.enemyThresholdPressure = clamp(snapshot.enemyThresholdPressure + 0.02 * step, -0.03, 0.22);
      snapshot.missPenaltyScale = clamp(snapshot.missPenaltyScale + 0.06 * step, 0.82, 1.8);
    }

    return snapshot;
  }

  private getPeriodDifficultyCallout(period: number): string {
    if (period === 1) {
      return "opening shift • forgiving gates";
    }
    if (period === 2) {
      return "pressure rises • monsters speed up";
    }
    if (period === 3) {
      return "final push • smaller, faster gates";
    }
    return "pressure rising";
  }

  private getEnemyRubberBand(): number {
    const difficulty = this.getDifficultySnapshot();
    const lead = Math.max(0, this.getGoalDifferential());
    const trail = Math.max(0, -this.getGoalDifferential());
    const periodRamp = this.currentPeriodIndex * 0.08;
    const timeRamp = this.getMatchProgress() * 0.12;
    return clamp(
      lead * 0.16 * this.monsterTeam.comebackBias -
        trail * 0.1 +
        periodRamp +
        timeRamp +
        difficulty.enemySurge * 0.34 -
        difficulty.playerMercy * 0.12,
      -0.18,
      0.52
    );
  }

  private getPlayerAssist(): number {
    const difficulty = this.getDifficultySnapshot();
    const lead = Math.max(0, this.getGoalDifferential());
    const trail = Math.max(0, -this.getGoalDifferential());
    const openingEase = this.currentPeriodIndex === 0 ? 0.08 : 0;
    return clamp(trail * 0.12 + openingEase - lead * 0.06 + difficulty.playerMercy * 0.45, 0, 0.42);
  }

  private getPossessionLabel(): string {
    return this.possession === "PLAYER" ? "Offense" : "Defense";
  }

  private getPlayerShotThreshold(): number {
    const difficulty = this.getDifficultySnapshot();
    const assist = this.getPlayerAssist();
    return Math.max(0.62, this.monsterTeam.playerGoalThreshold - assist * 0.18 - difficulty.playerThresholdAssist);
  }

  private getPlayerTakeawayThreshold(): number {
    const difficulty = this.getDifficultySnapshot();
    const assist = this.getPlayerAssist();
    return Math.max(0.48, this.monsterTeam.playerTakeawayThreshold - assist * 0.16 - difficulty.playerThresholdAssist * 0.85);
  }

  private getEnemyShotThreshold(): number {
    const difficulty = this.getDifficultySnapshot();
    const rubberBand = this.getEnemyRubberBand();
    return clamp(this.monsterTeam.enemyGoalThreshold - rubberBand * 0.2 - difficulty.enemyThresholdPressure, 0.6, 1.2);
  }

  private changePossession(
    next: Possession,
    reason: "TURNOVER" | "TAKEAWAY" | "FACEOFF" | "SAVE",
    options?: { fromFaceoffResolution?: boolean }
  ): void {
    if (this.ended) {
      return;
    }
    if (reason === "FACEOFF" && !options?.fromFaceoffResolution) {
      this.startFaceoffSpell("GOAL_RESET", next);
      return;
    }
    if (this.trainingMode && next === "ENEMY") {
      // Practice mode keeps the player on offense to focus on tracking/hit timing.
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
    const difficulty = this.getDifficultySnapshot();
    const comboBoost = Math.min(0.3, this.combo * 0.035);
    const perfectBoost = Math.min(0.18, this.perfects * 0.006);
    const rubberBand = this.getEnemyRubberBand();
    const chaosPenalty = Math.max(0, rubberBand) * 0.16;
    const pressurePenalty = this.riftPressure * 0.08;
    const chance = clamp(
      0.54 +
        comboBoost +
        perfectBoost -
        chaosPenalty -
        pressurePenalty +
        difficulty.playerShotChanceBias -
        difficulty.enemySurge * 0.035,
      0.34,
      0.9
    );
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
    if (this.trainingMode || this.ended || this.possession !== "ENEMY") {
      return;
    }
    const difficulty = this.getDifficultySnapshot();
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
        defensiveChain +
        difficulty.enemyShotChanceBias -
        difficulty.playerMercy * 0.06,
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
      if (!this.trainingMode && !this.ended) {
        this.startFaceoffSpell("PERIOD", this.getPeriodFaceoffFavoredPossession());
      }
      this.flashCombo(`${this.getPeriodLabel(this.currentPeriod)} PERIOD`, "hit");
      this.showStatus(
        `${this.getPeriodLabel(this.currentPeriod)} period • ${this.getPeriodDifficultyCallout(this.currentPeriod)}`,
        this.possession === "PLAYER" ? "offense" : "defense",
        1.25
      );
      this.effects.triggerShake(0.28);
    }
  }

  private updateMomentumDifficultyCallout(): void {
    if (this.trainingMode || this.spellDemoMode || this.ended || this.preStartCountdownActive || this.momentumDifficultyCooldown > 0) {
      return;
    }
    const diff = this.getGoalDifferential();
    const nextBand: -1 | 0 | 1 = diff >= 2 ? 1 : diff <= -2 ? -1 : 0;
    if (nextBand === this.momentumDifficultyBand) {
      return;
    }
    this.momentumDifficultyBand = nextBand;

    if (nextBand === 1) {
      this.flashCombo("MONSTER SURGE", "miss");
      this.showStatus("Monster surge • gates accelerate while they defend", "danger", 1.15);
      this.playGameSfx("warning");
      this.momentumDifficultyCooldown = 3.8;
      return;
    }
    if (nextBand === -1) {
      this.flashCombo("COMEBACK WINDOW", "great");
      this.showStatus("Comeback window • gates widen and slow slightly", "offense", 1.15);
      this.momentumDifficultyCooldown = 3.2;
      return;
    }

    this.momentumDifficultyCooldown = 1.8;
  }

  private updateEnemyAttack(dt: number): void {
    const difficulty = this.getDifficultySnapshot();
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
      this.monsterTeam.offenseRate *
      difficulty.enemyAttackScale;

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
    this.triggerGuestEmote("ANGRY");
    this.playGameSfx("goal");
    this.flashCombo(`${this.playerGoals}-${this.enemyGoals} • GOAL`, "great");
    this.showStatus(`GOAL • ${this.playerGoals}-${this.enemyGoals} ${this.monsterTeam.shortName}`, "goal", 1.35);

    this.riftPressure = clamp(this.riftPressure - 0.12, 0, 1);
    this.sealIntegrity = clamp(this.sealIntegrity + 0.04, 0, 1);
    this.applyThreatSafetyRails();
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
    this.triggerGuestEmote("HAPPY");
    this.playGameSfx("goal_against");
    this.flashCombo(`${this.playerGoals}-${this.enemyGoals} • ${reason}`, "miss");
    this.showStatus(`GOAL AGAINST • ${this.playerGoals}-${this.enemyGoals}`, "danger", 1.35);

    this.riftPressure = clamp(this.riftPressure + 0.08, 0, 1);
    this.sealIntegrity = clamp(this.sealIntegrity - 0.03, 0, 1);
    this.applyThreatSafetyRails();
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

  private updateHud(force = false): void {
    if (!force && this.hudRefreshCooldown > 0) {
      return;
    }
    this.hudRefreshCooldown = HUD_REFRESH_INTERVAL_SEC;

    const inPreStartCountdown = this.preStartCountdownActive;
    const activeFaceoffSpell = this.faceoffSpell;
    const inFaceoffSpell = activeFaceoffSpell !== null;
    const activeInterlude = this.interludeChallenge;
    const inInterlude = activeInterlude !== null;
    const difficulty = this.getDifficultySnapshot();
    const elapsedTotal = this.sessionDuration - this.timeRemaining;
    const periodIndex = this.getCurrentPeriodIndex();
    const periodStart = periodIndex * this.periodDurationSec;
    const periodElapsed = clamp(elapsedTotal - periodStart, 0, this.periodDurationSec);
    const periodTimeRemaining = clamp(this.periodDurationSec - periodElapsed, 0, this.periodDurationSec);
    const periodTimeProgress = this.periodDurationSec > 0 ? clamp(periodTimeRemaining / this.periodDurationSec, 0, 1) : 0;
    const countdownLabel = inPreStartCountdown ? this.getPreStartCountdownLabel() : "";
    const countdownProgress =
      inPreStartCountdown && this.preStartCountdownDurationSec > 0
        ? clamp(this.preStartCountdownRemainingSec / this.preStartCountdownDurationSec, 0, 1)
        : 0;
    const faceoffTimeRemaining =
      activeFaceoffSpell === null
        ? 0
        : activeFaceoffSpell.stage === "APPROACH"
          ? activeFaceoffSpell.traceDurationSec
          : activeFaceoffSpell.timeRemainingSec;
    const faceoffTimeProgress =
      activeFaceoffSpell === null
        ? 0
        : activeFaceoffSpell.stage === "APPROACH"
          ? 1
          : clamp(faceoffTimeRemaining / Math.max(0.0001, activeFaceoffSpell.totalDurationSec), 0, 1);
    const interludeTimeRemaining =
      activeInterlude === null
        ? 0
        : activeInterlude.introRemainingSec > 0
          ? activeInterlude.introRemainingSec
          : activeInterlude.timeRemainingSec;
    const interludeTimeProgress =
      activeInterlude === null
        ? 0
        : activeInterlude.introRemainingSec > 0
          ? 1
          : clamp(activeInterlude.timeRemainingSec / Math.max(0.0001, activeInterlude.durationSec), 0, 1);
    const timeProgress = inPreStartCountdown
      ? countdownProgress
      : inFaceoffSpell
        ? faceoffTimeProgress
        : inInterlude
          ? interludeTimeProgress
          : periodTimeProgress;
    const timeUrgency = 1 - timeProgress;

    this.timerEl.textContent = inPreStartCountdown
      ? countdownLabel
      : inFaceoffSpell
        ? activeFaceoffSpell.stage === "APPROACH"
          ? "READY"
          : activeFaceoffSpell.stage === "SNAP" && activeFaceoffSpell.snapCueDelaySec <= 0.001
          ? "NOW"
          : formatClockMmSs(faceoffTimeRemaining)
        : inInterlude
          ? activeInterlude.introRemainingSec > 0
            ? String(Math.max(1, Math.ceil(activeInterlude.introRemainingSec)))
            : formatClockMmSs(interludeTimeRemaining)
          : formatClockMmSs(periodTimeRemaining);
    setArcaneScoreboardScore(this.scoreboardRefs, this.playerGoals, this.enemyGoals);
    this.comboEl.textContent = `x${this.combo}`;
    const possessionThreshold =
      this.possession === "PLAYER" ? this.getPlayerShotThreshold() : this.getPlayerTakeawayThreshold();
    const interludeCheckpointProgress =
      activeInterlude === null
        ? 0
        : clamp(activeInterlude.currentCheckpointIndex / Math.max(1, activeInterlude.checkpoints.length), 0, 1);
    const scoreBandProgress = inInterlude
      ? interludeCheckpointProgress
      : clamp(this.playerAttackCharge / Math.max(0.0001, possessionThreshold), 0, 1);
    const comboProgress = inInterlude ? clamp(1 - interludeTimeProgress, 0, 1) : clamp(this.combo / 8, 0, 1);
    const comboHeat = inInterlude ? clamp(interludeCheckpointProgress * 1.1, 0, 1) : clamp(this.combo / 12, 0, 1);

    this.timeDialEl.style.setProperty("--progress", timeProgress.toFixed(4));
    this.timeDialEl.style.setProperty("--urgency", timeUrgency.toFixed(4));
    this.scoreDialEl.style.setProperty("--progress", scoreBandProgress.toFixed(4));
    this.comboStatEl.style.setProperty("--progress", comboProgress.toFixed(4));
    this.comboStatEl.style.setProperty("--combo-heat", comboHeat.toFixed(4));

    this.timeDialEl.dataset.state =
      timeProgress <= 0.2 ? "critical" : timeProgress <= 0.45 ? "warning" : "stable";
    this.comboStatEl.dataset.state = inInterlude
      ? interludeCheckpointProgress >= 0.86
        ? "overdrive"
        : interludeCheckpointProgress >= 0.45
          ? "hot"
          : interludeCheckpointProgress >= 0.1
            ? "warm"
            : "idle"
      : this.combo >= 8
        ? "overdrive"
        : this.combo >= 4
          ? "hot"
          : this.combo >= 1
            ? "warm"
            : "idle";

    this.periodRailEl.textContent = inPreStartCountdown
      ? this.trainingMode
        ? "Training Start"
        : "Opening Faceoff"
      : this.spellDemoMode
        ? "Spell Demo"
      : inFaceoffSpell
        ? activeFaceoffSpell.trigger === "BREACH_SAVE"
          ? "Seal Ritual"
          : "Faceoff Rune"
      : inInterlude
        ? `${activeInterlude!.label} Challenge`
      : this.trainingMode
        ? "Training"
        : `Period ${this.currentPeriod}`;
    this.scoreLabelEl.textContent = inPreStartCountdown || inFaceoffSpell
      ? "Faceoff"
      : inInterlude
        ? "Interlude"
      : this.trainingMode
        ? "Practice"
      : this.ended
        ? "Final"
        : this.getPossessionLabel();

    this.timeDialSubEl.textContent = inPreStartCountdown
      ? this.introAudio
        ? "Intro call • Faceoff ready"
        : "Faceoff ready"
      : inFaceoffSpell
        ? activeFaceoffSpell.trigger === "BREACH_SAVE"
          ? activeFaceoffSpell.stage === "APPROACH"
            ? "Touch the ritual start glyph to begin"
            : activeFaceoffSpell.stage === "TRACE"
            ? `Seal ritual • trace ${activeFaceoffSpell.currentNodeIndex}/${activeFaceoffSpell.nodes.length}`
            : activeFaceoffSpell.snapCueDelaySec > 0.001
              ? "Seal ritual • cue incoming"
              : "Seal ritual • snap to center"
          : activeFaceoffSpell.stage === "APPROACH"
            ? "Touch the start glyph to begin tracing"
          : activeFaceoffSpell.stage === "TRACE"
            ? `Trace rune nodes • ${activeFaceoffSpell.currentNodeIndex}/${activeFaceoffSpell.nodes.length}`
            : activeFaceoffSpell.snapCueDelaySec > 0.001
              ? "Hold the channel • cue incoming"
              : "Snap to center now"
      : inInterlude
        ? activeInterlude!.introRemainingSec > 0
          ? `${activeInterlude!.label} starts • ${Math.max(1, Math.ceil(activeInterlude!.introRemainingSec))}s`
          : `${activeInterlude!.prompt} • ${activeInterlude!.timeRemainingSec.toFixed(1)}s`
      : this.spellDemoMode
        ? "Demo pacing • no score penalties"
      : this.trainingMode
        ? "Practice timer • no goals or breaches"
      : this.isRookieWardActive()
        ? `Rookie ward active • breach unlocks after ${BREACH_UNLOCK_RUNS} runs`
      : this.ended
        ? this.endReason === "breach"
          ? "Seal shattered"
          : "Final horn"
        : `${this.getPeriodLabel(this.currentPeriod)} • ${Math.round(periodTimeRemaining)}s left`;
    this.scoreDialSubEl.textContent = this.ended
      ? `${this.monsterTeam.shortName} • Runes ${this.score.toLocaleString()}`
      : inFaceoffSpell
        ? activeFaceoffSpell.trigger === "BREACH_SAVE"
          ? `Prevent breach • Runes ${this.score.toLocaleString()}`
          : activeFaceoffSpell.stage === "APPROACH"
            ? `Touch start glyph • Runes ${this.score.toLocaleString()}`
            : `Winner takes puck • Runes ${this.score.toLocaleString()}`
      : inInterlude
        ? `Nodes ${activeInterlude!.currentCheckpointIndex}/${activeInterlude!.checkpoints.length} • Runes ${this.score.toLocaleString()}`
      : this.spellDemoMode
        ? `Faceoff demo rounds • ${this.faceoffDemoRounds}`
      : this.trainingMode
        ? `Practice score • Runes ${this.score.toLocaleString()}`
      : inPreStartCountdown
        ? `Opening shift • Runes ${this.score.toLocaleString()}`
        : `${this.possession === "PLAYER" ? "Shot" : "Takeaway"} ${Math.round(scoreBandProgress * 100)}% • Runes ${this.score.toLocaleString()}`;
    this.comboDialSubEl.textContent = inPreStartCountdown
      ? "Track the gate • wait for GO!"
      : inFaceoffSpell
        ? activeFaceoffSpell.trigger === "BREACH_SAVE"
          ? activeFaceoffSpell.stage === "APPROACH"
            ? "Touch ritual start glyph"
            : activeFaceoffSpell.stage === "TRACE"
            ? `Seal trace ${Math.min(activeFaceoffSpell.currentNodeIndex, activeFaceoffSpell.nodes.length)}/${activeFaceoffSpell.nodes.length}`
            : activeFaceoffSpell.snapCueDelaySec > 0.001
              ? "Channel the seal..."
              : `Seal hold ${Math.round(clamp(activeFaceoffSpell.centerHoldSec / Math.max(0.0001, activeFaceoffSpell.centerHoldGoalSec), 0, 1) * 100)}%`
          : activeFaceoffSpell.stage === "APPROACH"
            ? "Touch start glyph"
          : activeFaceoffSpell.stage === "TRACE"
            ? `Trace ${Math.min(activeFaceoffSpell.currentNodeIndex, activeFaceoffSpell.nodes.length)}/${activeFaceoffSpell.nodes.length}`
            : activeFaceoffSpell.snapCueDelaySec > 0.001
              ? "Steady..."
              : `Center hold ${Math.round(clamp(activeFaceoffSpell.centerHoldSec / Math.max(0.0001, activeFaceoffSpell.centerHoldGoalSec), 0, 1) * 100)}%`
      : inInterlude
        ? activeInterlude!.introRemainingSec > 0
          ? "Move to the first rune node"
          : `${Math.max(0, activeInterlude!.checkpoints.length - activeInterlude!.currentCheckpointIndex)} nodes left • stay smooth`
      : this.spellDemoMode
        ? "Practice rune draw rhythm"
      : this.trainingMode
        ? this.combo > 0
          ? `Quick practice chain • x${this.combo}`
          : "Quick hits build combo"
      : this.combo > 0
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
    const comboPipsFill = inInterlude ? Math.round(interludeCheckpointProgress * 5) : Math.min(5, this.combo);
    this.comboStatEl.style.setProperty("--combo-pips-fill", String(comboPipsFill));
    for (let i = 0; i < this.comboPipsEls.length; i += 1) {
      const pip = this.comboPipsEls[i];
      pip.classList.toggle("is-active", i < comboPipsFill);
      pip.classList.toggle("is-overflow", !inInterlude && this.combo >= 6 && i === this.comboPipsEls.length - 1);
    }

    let phaseText = `Threat: Stable • ${this.getPossessionLabel()} • ${difficulty.paceShort}`;
    if (phase === "CRACKING") {
      phaseText = `Threat: Cracking Ice • ${this.getPossessionLabel()} • ${difficulty.paceShort}`;
    } else if (phase === "BREACH") {
      phaseText = `Threat: Breach Surge${this.breachCount > 0 ? ` • ${this.breachCount}` : ""} • ${this.getPossessionLabel()} • ${difficulty.paceShort}`;
    } else if (this.breachCount > 0) {
      phaseText = `Threat: Stable • Breaches ${this.breachCount} • ${this.getPossessionLabel()} • ${difficulty.paceShort}`;
    }
    if (this.trainingMode && !inPreStartCountdown) {
      phaseText = "Training • Forgiving gates • No taunts";
    } else if (this.spellDemoMode) {
      phaseText = inFaceoffSpell
        ? activeFaceoffSpell.stage === "APPROACH"
          ? "Spell Demo • Touch start glyph"
          : activeFaceoffSpell.stage === "TRACE"
          ? "Spell Demo • Trace rune path"
          : activeFaceoffSpell.snapCueDelaySec > 0.001
            ? "Spell Demo • Channeling"
            : "Spell Demo • Snap to center"
        : "Spell Demo • Next rune draw incoming";
    } else if (inInterlude) {
      const pendingCount = Math.max(0, this.interludeSchedule.length - this.nextInterludeScheduleIndex);
      phaseText = activeInterlude!.introRemainingSec > 0
        ? `Interlude • ${activeInterlude!.label} starts`
        : `Interlude • ${activeInterlude!.label} • ${activeInterlude!.currentCheckpointIndex}/${activeInterlude!.checkpoints.length}${
            pendingCount > 0 ? ` • ${pendingCount} later` : ""
          }`;
    } else if (this.isRookieWardActive() && !inPreStartCountdown) {
      const runsLeft = this.threatProgression.runsUntilBreachUnlock;
      phaseText =
        runsLeft > 0
          ? `Rookie Ward • Learn offense/defense • Breach unlocks in ${runsLeft}`
          : "Rookie Ward • Learn offense/defense";
    } else if (inFaceoffSpell) {
      phaseText = activeFaceoffSpell.trigger === "BREACH_SAVE"
        ? activeFaceoffSpell.stage === "APPROACH"
          ? "Seal Ritual • Touch start glyph"
          : activeFaceoffSpell.stage === "TRACE"
          ? "Seal Ritual • Trace to prevent breach"
          : activeFaceoffSpell.snapCueDelaySec > 0.001
            ? "Seal Ritual • Channeling"
            : "Seal Ritual • Snap to center"
        : activeFaceoffSpell.stage === "APPROACH"
          ? "Faceoff Spell • Touch start glyph"
          : activeFaceoffSpell.stage === "TRACE"
          ? "Faceoff Spell • Trace rune path"
          : activeFaceoffSpell.snapCueDelaySec > 0.001
            ? "Faceoff Spell • Channeling"
            : "Faceoff Spell • Snap to center";
    } else if (inPreStartCountdown) {
      phaseText = "Faceoff Countdown • Match intro";
    }
    this.phaseEl.textContent = phaseText;
    this.updateSidePortraitHud();
  }

  private renderInterludeChallenge(
    ctx: CanvasRenderingContext2D,
    padRect: Rect,
    timeSec: number,
    challenge: InterludeChallengeState
  ): void {
    const minDim = Math.min(padRect.width, padRect.height);
    const radius = minDim * 0.035;
    const intro = challenge.introRemainingSec > 0;
    const pulse = 0.5 + 0.5 * Math.sin(timeSec * 6.8);
    const total = Math.max(1, challenge.checkpoints.length);
    const completed = Math.min(total, challenge.currentCheckpointIndex);
    const activeIndex = Math.min(total - 1, challenge.currentCheckpointIndex);
    const hue = challenge.hue;

    ctx.save();
    ctx.beginPath();
    ctx.roundRect(padRect.x, padRect.y, padRect.width, padRect.height, radius);
    ctx.clip();

    const veil = ctx.createLinearGradient(padRect.x, padRect.y, padRect.x + padRect.width, padRect.y + padRect.height);
    veil.addColorStop(0, `hsla(${hue} 55% 16% / 0.2)`);
    veil.addColorStop(0.5, `hsla(${hue} 45% 11% / 0.24)`);
    veil.addColorStop(1, `hsla(${hue} 48% 14% / 0.2)`);
    ctx.fillStyle = veil;
    ctx.fillRect(padRect.x, padRect.y, padRect.width, padRect.height);

    const pointsPx = challenge.checkpoints.map((point) => padToPixel(padRect, point));
    if (pointsPx.length > 1) {
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.strokeStyle = `hsla(${hue} 30% 80% / 0.2)`;
      ctx.lineWidth = 2.2;
      ctx.beginPath();
      for (let i = 0; i < pointsPx.length; i += 1) {
        const point = pointsPx[i];
        if (!point) {
          continue;
        }
        if (i === 0) {
          ctx.moveTo(point.x, point.y);
        } else {
          ctx.lineTo(point.x, point.y);
        }
      }
      ctx.stroke();

      if (completed > 0) {
        ctx.strokeStyle = `hsla(${hue} 92% 72% / ${intro ? 0.3 : 0.9})`;
        ctx.shadowColor = `hsla(${hue} 92% 70% / ${intro ? 0.18 : 0.42})`;
        ctx.shadowBlur = 12;
        ctx.lineWidth = 3.2;
        ctx.beginPath();
        const first = pointsPx[0];
        if (first) {
          ctx.moveTo(first.x, first.y);
          for (let i = 1; i <= completed && i < pointsPx.length; i += 1) {
            const point = pointsPx[i];
            if (point) {
              ctx.lineTo(point.x, point.y);
            }
          }
        }
        ctx.stroke();
        ctx.shadowBlur = 0;
      }
    }

    const checkpointRadius = minDim * challenge.checkpointRadiusScale;
    for (let i = 0; i < pointsPx.length; i += 1) {
      const point = pointsPx[i];
      if (!point) {
        continue;
      }
      const visited = i < completed;
      const active = i === activeIndex;
      const alpha = intro ? 0.45 : visited ? 0.94 : active ? 0.82 : 0.44;
      const ringScale = active ? 1 + pulse * 0.18 : 1;

      ctx.strokeStyle = visited
        ? `hsla(${hue} 100% 82% / ${alpha.toFixed(3)})`
        : `hsla(${hue} 66% 74% / ${alpha.toFixed(3)})`;
      ctx.lineWidth = active ? 3.4 : 2;
      ctx.beginPath();
      ctx.arc(point.x, point.y, checkpointRadius * ringScale, 0, Math.PI * 2);
      ctx.stroke();

      ctx.fillStyle = visited
        ? `hsla(${hue} 100% 76% / ${(0.22 + pulse * 0.2).toFixed(3)})`
        : `hsla(${hue} 86% 72% / ${(active ? 0.24 + pulse * 0.2 : 0.08).toFixed(3)})`;
      ctx.beginPath();
      ctx.arc(point.x, point.y, checkpointRadius * (visited ? 0.44 : active ? 0.38 : 0.28), 0, Math.PI * 2);
      ctx.fill();

      if (active && !intro) {
        ctx.strokeStyle = `hsla(${hue} 100% 88% / ${(0.45 + pulse * 0.4).toFixed(3)})`;
        ctx.lineWidth = 1.8;
        ctx.setLineDash([7, 6]);
        ctx.lineDashOffset = -timeSec * 24;
        ctx.beginPath();
        ctx.arc(point.x, point.y, checkpointRadius * (1.26 + pulse * 0.1), 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);
      }
    }

    const heading = intro
      ? `${challenge.label.toUpperCase()} IN ${Math.max(1, Math.ceil(challenge.introRemainingSec))}`
      : `${challenge.label.toUpperCase()} • ${Math.min(challenge.currentCheckpointIndex, total)}/${total}`;
    const subtext = intro ? challenge.prompt : `Time ${challenge.timeRemainingSec.toFixed(1)}s • stay on rhythm`;
    const timeProgress = clamp(challenge.timeRemainingSec / Math.max(0.001, challenge.durationSec), 0, 1);
    const meterW = padRect.width * 0.36;
    const meterH = 8;
    const meterX = padRect.x + (padRect.width - meterW) * 0.5;
    const meterY = padRect.y + minDim * 0.11;

    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = "rgba(238, 246, 252, 0.94)";
    ctx.font = `${Math.max(14, Math.round(minDim * 0.036))}px "Cinzel", "Times New Roman", serif`;
    ctx.fillText(heading, padRect.x + padRect.width * 0.5, padRect.y + minDim * 0.06);
    ctx.fillStyle = "rgba(215, 230, 244, 0.84)";
    ctx.font = `${Math.max(11, Math.round(minDim * 0.022))}px "Merriweather", Georgia, serif`;
    ctx.fillText(subtext, padRect.x + padRect.width * 0.5, padRect.y + minDim * 0.09);

    ctx.fillStyle = "rgba(10, 16, 24, 0.4)";
    ctx.beginPath();
    ctx.roundRect(meterX, meterY, meterW, meterH, meterH * 0.5);
    ctx.fill();
    const fillW = meterW * (intro ? 1 : timeProgress);
    if (fillW > 0.5) {
      const fill = ctx.createLinearGradient(meterX, meterY, meterX + fillW, meterY);
      fill.addColorStop(0, `hsla(${hue} 85% 58% / 0.95)`);
      fill.addColorStop(1, `hsla(${hue} 100% 72% / 0.95)`);
      ctx.fillStyle = fill;
      ctx.beginPath();
      ctx.roundRect(meterX, meterY, fillW, meterH, meterH * 0.5);
      ctx.fill();
    }

    ctx.restore();
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

  private updateBreachVisualState(dt: number): void {
    const pressure = clamp(this.riftPressure, 0, 1);
    const fracture = clamp(1 - this.sealIntegrity, 0, 1);
    const surge = clamp(this.breachSurgeTimer / 2.6, 0, 1);
    const target = clamp(Math.max(fracture, pressure * 0.9, surge * 1.04), 0, 1);
    if (target > this.breachVisualPropagation) {
      const rise = Math.min(1, dt * (1.35 + target * 2.2));
      this.breachVisualPropagation = clamp(this.breachVisualPropagation + (target - this.breachVisualPropagation) * rise, 0, 1);
    } else {
      const fall = dt * (0.12 + (1 - target) * 0.18);
      this.breachVisualPropagation = clamp(this.breachVisualPropagation - Math.min(this.breachVisualPropagation - target, fall), 0, 1);
    }

    const step = Math.floor(this.breachVisualPropagation * 10);
    if (step > this.breachVisualStep) {
      const stepGain = step - this.breachVisualStep;
      const cueIntensity = clamp(0.45 + this.breachVisualPropagation * 0.45 + stepGain * 0.08, 0.45, 1);
      this.playCrackPropagationCue(cueIntensity);
    }
    this.breachVisualStep = step;

    this.breachRumbleCooldown = Math.max(0, this.breachRumbleCooldown - dt);
    if (
      this.breachVisualPropagation >= 0.78 &&
      this.breachRumbleCooldown <= 0 &&
      !this.trainingMode &&
      !this.spellDemoMode &&
      !this.preStartCountdownActive &&
      !this.ended
    ) {
      const rumbleStrength = clamp(0.09 + (this.breachVisualPropagation - 0.75) * 0.3 + surge * 0.18, 0.09, 0.24);
      this.effects.triggerShake(rumbleStrength);
      this.breachRumbleCooldown = 0.22;
    }
  }

  private updateTension(dt: number): void {
    const difficulty = this.getDifficultySnapshot();
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

    this.riftPressure = clamp(
      this.riftPressure + pressureGainRate * difficulty.tensionScale * dt - comboWardRate * 0.6 * dt,
      0,
      1
    );
    this.sealIntegrity = clamp(
      this.sealIntegrity - integrityDrainRate * difficulty.tensionScale * dt + comboWardRate * dt,
      0,
      1
    );
    this.applyThreatSafetyRails();
    this.lowestIntegrity = Math.min(this.lowestIntegrity, this.sealIntegrity);

    if (this.isBreachMechanicEnabled() && this.sealIntegrity <= 0.0001) {
      if (!this.tryStartBreachRitual()) {
        this.triggerBreach();
      }
    }
  }

  private applyMissPressure(): void {
    const onOffense = this.possession === "PLAYER";
    const difficulty = this.getDifficultySnapshot();
    const missScale = difficulty.missPenaltyScale;
    this.riftPressure = clamp(
      this.riftPressure + ((onOffense ? 0.11 : 0.15) + (this.breachSurgeTimer > 0 ? 0.04 : 0)) * missScale,
      0,
      1
    );
    this.sealIntegrity = clamp(this.sealIntegrity - (onOffense ? 0.07 : 0.095) * missScale, 0, 1);
    this.addEnemyAttackCharge((onOffense ? 0.14 : 0.28) * (0.92 + difficulty.enemySurge * 0.3));
    if (onOffense && !this.ended) {
      this.changePossession("ENEMY", "TURNOVER");
    } else if (!this.ended) {
      this.playGameSfx("warning");
      this.showStatus("Defensive miss • enemy rush", "danger", 1.05);
    }
    this.applyThreatSafetyRails();
    this.lowestIntegrity = Math.min(this.lowestIntegrity, this.sealIntegrity);
    if (this.isBreachMechanicEnabled() && this.sealIntegrity <= 0.0001) {
      if (!this.tryStartBreachRitual()) {
        this.triggerBreach();
      }
    }
  }

  private tryStartBreachRitual(): boolean {
    if (
      !this.isBreachMechanicEnabled() ||
      this.ended ||
      this.preStartCountdownActive ||
      this.faceoffSpell !== null ||
      this.trainingMode ||
      this.spellDemoMode ||
      this.breachRitualCooldown > 0
    ) {
      return false;
    }
    this.breachRitualCooldown = 2.8;
    this.startFaceoffSpell("BREACH_SAVE", this.possession);
    return true;
  }

  private triggerBreach(): void {
    if (this.ended || !this.isBreachMechanicEnabled()) {
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
    this.breachVisualPropagation = Math.max(this.breachVisualPropagation, 0.98);
    this.breachVisualStep = Math.max(this.breachVisualStep, 9);

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

  private renderFaceoffSpell(
    ctx: CanvasRenderingContext2D,
    padRect: Rect,
    timeSec: number,
    spell: FaceoffSpellState
  ): void {
    const minDim = Math.min(padRect.width, padRect.height);
    const anchorPx = padToPixel(padRect, spell.anchor);
    const cx = anchorPx.x;
    const cy = anchorPx.y;
    const breachRitual = spell.trigger === "BREACH_SAVE";
    const traceProgress = clamp(spell.currentNodeIndex / Math.max(1, spell.nodes.length), 0, 1);
    const snapReady = spell.stage === "SNAP" && spell.snapCueDelaySec <= 0.001;
    const snapHoldProgress =
      spell.stage === "SNAP" ? clamp(spell.centerHoldSec / Math.max(0.0001, spell.centerHoldGoalSec), 0, 1) : 0;

    ctx.save();
    ctx.beginPath();
    ctx.roundRect(padRect.x, padRect.y, padRect.width, padRect.height, minDim * 0.036);
    ctx.clip();

    const veil = ctx.createRadialGradient(cx, cy, minDim * 0.08, cx, cy, minDim * 0.86);
    veil.addColorStop(0, breachRitual ? "rgba(124, 62, 48, 0.22)" : "rgba(52, 88, 136, 0.16)");
    veil.addColorStop(0.6, breachRitual ? "rgba(84, 35, 30, 0.2)" : "rgba(28, 46, 72, 0.14)");
    veil.addColorStop(1, breachRitual ? "rgba(23, 10, 10, 0.36)" : "rgba(8, 14, 24, 0.3)");
    ctx.fillStyle = veil;
    ctx.fillRect(padRect.x, padRect.y, padRect.width, padRect.height);

    ctx.save();
    ctx.translate(cx, cy);
    const spin = timeSec * 0.45 + spell.runeSpinSeed * 0.01;

    ctx.strokeStyle = "rgba(143, 205, 255, 0.2)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(0, 0, minDim * 0.19, 0, Math.PI * 2);
    ctx.stroke();

    ctx.strokeStyle = "rgba(197, 226, 255, 0.15)";
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.arc(0, 0, minDim * 0.255, spin, spin + Math.PI * 1.55);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(0, 0, minDim * 0.255, spin + Math.PI, spin + Math.PI * 2.55);
    ctx.stroke();

    ctx.rotate(-spin * 1.45);
    ctx.strokeStyle = "rgba(215, 236, 255, 0.18)";
    ctx.lineWidth = 1.1;
    for (let i = 0; i < 10; i += 1) {
      const ang = (Math.PI * 2 * i) / 10;
      const inner = minDim * 0.112;
      const outer = minDim * 0.14;
      ctx.beginPath();
      ctx.moveTo(Math.cos(ang) * inner, Math.sin(ang) * inner);
      ctx.lineTo(Math.cos(ang) * outer, Math.sin(ang) * outer);
      ctx.stroke();
    }
    ctx.restore();

    const pointsPx = spell.nodes.map((node) => padToPixel(padRect, node));
    if (pointsPx.length > 1) {
      ctx.lineCap = "round";
      ctx.lineJoin = "round";

      ctx.strokeStyle = "rgba(104, 160, 220, 0.24)";
      ctx.lineWidth = minDim * 0.016;
      ctx.beginPath();
      ctx.moveTo(pointsPx[0].x, pointsPx[0].y);
      for (let i = 1; i < pointsPx.length; i += 1) {
        const p = pointsPx[i];
        ctx.lineTo(p.x, p.y);
      }
      ctx.stroke();

      const litStop = Math.min(pointsPx.length - 1, spell.currentNodeIndex);
      if (litStop >= 1) {
        ctx.strokeStyle = snapReady ? "rgba(255, 220, 142, 0.88)" : "rgba(135, 223, 255, 0.9)";
        ctx.shadowColor = snapReady ? "rgba(255, 206, 115, 0.35)" : "rgba(122, 220, 255, 0.35)";
        ctx.shadowBlur = 14;
        ctx.lineWidth = minDim * 0.012;
        ctx.beginPath();
        ctx.moveTo(pointsPx[0].x, pointsPx[0].y);
        for (let i = 1; i <= litStop; i += 1) {
          const p = pointsPx[i];
          ctx.lineTo(p.x, p.y);
        }
        ctx.stroke();
        ctx.shadowBlur = 0;
      }
    }

    const activeNodeIndex = Math.min(spell.currentNodeIndex, spell.nodes.length - 1);
    const startNodePx = pointsPx[0];
    for (let i = 0; i < pointsPx.length; i += 1) {
      const node = pointsPx[i];
      const isVisited = i < spell.currentNodeIndex;
      const isStartNode = spell.stage === "APPROACH" && i === 0;
      const isActive = isStartNode || (spell.stage === "TRACE" && i === activeNodeIndex);
      const radius = minDim * (isActive ? 0.024 : isVisited ? 0.017 : 0.014);
      const pulse = isActive ? 0.65 + 0.35 * Math.sin(timeSec * 10 + i * 0.8) : 0.35;
      const approachDim = spell.stage === "APPROACH" && !isStartNode ? 0.55 : 1;
      const alpha = (isVisited ? 0.9 : isActive ? 0.92 : 0.4) * approachDim;

      ctx.fillStyle = isVisited
        ? `rgba(176, 233, 255, ${alpha.toFixed(3)})`
        : `rgba(106, 166, 212, ${alpha.toFixed(3)})`;
      ctx.beginPath();
      ctx.arc(node.x, node.y, radius, 0, Math.PI * 2);
      ctx.fill();

      if (isActive) {
        ctx.strokeStyle = `rgba(205, 242, 255, ${(0.35 + pulse * 0.45).toFixed(3)})`;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(node.x, node.y, radius * (1.45 + pulse * 0.35), 0, Math.PI * 2);
        ctx.stroke();
      }
    }

    if (spell.stage === "APPROACH" && startNodePx) {
      const spotPulse = 0.5 + 0.5 * Math.sin(timeSec * 8.2);
      const approachRadius = minDim * 0.074;
      ctx.strokeStyle = breachRitual
        ? `rgba(255, 168, 128, ${(0.55 + spotPulse * 0.3).toFixed(3)})`
        : `rgba(150, 220, 255, ${(0.52 + spotPulse * 0.28).toFixed(3)})`;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(startNodePx.x, startNodePx.y, approachRadius * (1 + spotPulse * 0.08), 0, Math.PI * 2);
      ctx.stroke();

      ctx.strokeStyle = breachRitual
        ? `rgba(255, 196, 170, ${(0.22 + spotPulse * 0.2).toFixed(3)})`
        : `rgba(189, 234, 255, ${(0.2 + spotPulse * 0.2).toFixed(3)})`;
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.arc(startNodePx.x, startNodePx.y, approachRadius * 1.42, 0, Math.PI * 2);
      ctx.stroke();
    }

    const centerRadius = spell.snapTolerancePx;
    const centerPulse = 0.5 + 0.5 * Math.sin(timeSec * (snapReady ? 18 : 8));
    const centerColor = snapReady
      ? breachRitual
        ? "255, 163, 98"
        : "255, 198, 110"
      : breachRitual
        ? "255, 133, 108"
        : "136, 216, 255";
    const centerAlpha = spell.stage === "SNAP" ? 0.86 : 0.28;

    ctx.strokeStyle = `rgba(${centerColor}, ${centerAlpha.toFixed(3)})`;
    ctx.lineWidth = spell.stage === "SNAP" ? 3.5 : 2;
    ctx.beginPath();
    ctx.arc(cx, cy, centerRadius * (spell.stage === "SNAP" ? 1 + centerPulse * 0.08 : 1), 0, Math.PI * 2);
    ctx.stroke();

    if (spell.stage === "SNAP") {
      ctx.strokeStyle = `rgba(${centerColor}, ${(0.25 + centerPulse * 0.4).toFixed(3)})`;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(cx, cy, centerRadius * 1.42, 0, Math.PI * 2);
      ctx.stroke();

      if (snapHoldProgress > 0.001) {
        ctx.strokeStyle = `rgba(255, 221, 158, ${(0.62 + snapHoldProgress * 0.3).toFixed(3)})`;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(cx, cy, centerRadius * 1.06, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * snapHoldProgress);
        ctx.stroke();
      }
    }

    const cueText = breachRitual
      ? spell.stage === "APPROACH"
        ? "TOUCH THE SEAL START"
        : spell.stage === "TRACE"
        ? "TRACE TO SEAL"
        : snapReady
          ? "SEAL NOW"
          : "HOLD THE SEAL"
      : spell.stage === "APPROACH"
        ? "TOUCH THE START GLYPH"
        : spell.stage === "TRACE"
        ? "TRACE THE RUNE"
        : snapReady
          ? "SNAP TO CENTER"
          : "HOLD THE CHANNEL";
    const cueSubText = breachRitual
      ? spell.stage === "APPROACH"
        ? "Tracing starts the moment you reach the first node"
        : spell.stage === "TRACE"
        ? `Seal nodes ${Math.min(spell.currentNodeIndex, spell.nodes.length)}/${spell.nodes.length}`
        : snapReady
          ? "Center hold prevents breach"
          : "Wait for the ritual pulse"
      : spell.stage === "APPROACH"
        ? "Tracing starts the moment you reach the first node"
        : spell.stage === "TRACE"
        ? `Nodes ${Math.min(spell.currentNodeIndex, spell.nodes.length)}/${spell.nodes.length}`
        : snapReady
          ? "Center hold to win possession"
          : "Wait for the rune pulse";

    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = `700 ${clamp(minDim * 0.054, 18, 30)}px "Cinzel", "Trajan Pro", serif`;
    ctx.fillStyle = snapReady
      ? breachRitual
        ? "rgba(255, 208, 152, 0.97)"
        : "rgba(255, 226, 168, 0.96)"
      : breachRitual
        ? "rgba(255, 212, 196, 0.9)"
        : "rgba(220, 240, 255, 0.9)";
    ctx.fillText(cueText, cx, padRect.y + minDim * 0.14);
    ctx.font = `600 ${clamp(minDim * 0.028, 12, 16)}px "Cinzel", "Trajan Pro", serif`;
    ctx.fillStyle = "rgba(213, 229, 242, 0.78)";
    ctx.fillText(cueSubText, cx, padRect.y + minDim * 0.19);

    const meterWidth = padRect.width * 0.36;
    const meterHeight = Math.max(8, minDim * 0.014);
    const meterX = cx - meterWidth / 2;
    const meterY = padRect.y + padRect.height - minDim * 0.08;
    const remainingRatio =
      spell.stage === "TRACE"
        ? clamp(spell.timeRemainingSec / Math.max(0.0001, spell.totalDurationSec), 0, 1)
        : clamp((spell.snapCueDelaySec + spell.snapWindowRemainingSec) / Math.max(0.0001, spell.totalDurationSec), 0, 1);
    ctx.fillStyle = "rgba(12, 20, 34, 0.68)";
    ctx.strokeStyle = "rgba(152, 208, 255, 0.24)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(meterX, meterY, meterWidth, meterHeight, meterHeight * 0.5);
    ctx.fill();
    ctx.stroke();

    const fillWidth = meterWidth * remainingRatio;
    if (fillWidth > 0.5) {
      const bar = ctx.createLinearGradient(meterX, 0, meterX + meterWidth, 0);
      bar.addColorStop(
        0,
        snapReady
          ? breachRitual
            ? "rgba(255, 150, 98, 0.9)"
            : "rgba(255, 180, 104, 0.86)"
          : breachRitual
            ? "rgba(255, 130, 130, 0.86)"
            : "rgba(120, 210, 255, 0.84)"
      );
      bar.addColorStop(
        1,
        snapReady
          ? breachRitual
            ? "rgba(255, 218, 170, 0.96)"
            : "rgba(255, 231, 166, 0.94)"
          : breachRitual
            ? "rgba(255, 198, 178, 0.96)"
            : "rgba(192, 234, 255, 0.96)"
      );
      ctx.fillStyle = bar;
      ctx.beginPath();
      ctx.roundRect(meterX, meterY, fillWidth, meterHeight, meterHeight * 0.5);
      ctx.fill();
    }

    ctx.restore();
  }

  private getThreatPhase(): ThreatPhase {
    if (!this.isBreachMechanicEnabled()) {
      if (this.riftPressure >= 0.45 || this.sealIntegrity <= 0.58) {
        return "CRACKING";
      }
      return "STABLE";
    }
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
    const propagation = Math.max(this.breachVisualPropagation, Math.max(fracture, pressure * 0.9, breachPulse));
    if (pressure < 0.03 && fracture < 0.03 && breachPulse < 0.01 && propagation < 0.04) {
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

    const substrate = ctx.createRadialGradient(cx, cy, minDim * 0.05, cx, cy, minDim * 0.76);
    substrate.addColorStop(0, `rgba(212, 228, 240, ${(0.01 + propagation * 0.028).toFixed(3)})`);
    substrate.addColorStop(0.55, `rgba(188, 208, 224, ${(0.006 + propagation * 0.018).toFixed(3)})`);
    substrate.addColorStop(1, "rgba(188, 208, 224, 0)");
    ctx.fillStyle = substrate;
    ctx.fillRect(padRect.x, padRect.y, padRect.width, padRect.height);

    this.renderSurfaceFissureAmplification(ctx, padRect, timeSec, propagation, breachPulse);
    this.renderStressFractureLines(ctx, padRect, timeSec, propagation);
    this.renderArcaneGlowLeakage(ctx, padRect, timeSec, propagation, breachPulse);
    this.renderStructuralSeparation(ctx, padRect, timeSec, propagation, breachPulse);
    this.renderBreachCoreSink(ctx, padRect, timeSec, propagation, breachPulse);
    this.renderFrostDrift(ctx, padRect, timeSec, propagation, breachPulse);

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
      const palette = this.getBreachThemePalette();
      const flash = Math.sin(timeSec * 16) * 0.5 + 0.5;
      const pulseWash = ctx.createRadialGradient(cx, cy, minDim * 0.06, cx, cy, minDim * 0.92);
      pulseWash.addColorStop(
        0,
        `rgba(${palette.leakCore}, ${(breachPulse * (0.016 + flash * 0.028)).toFixed(3)})`
      );
      pulseWash.addColorStop(
        0.55,
        `rgba(${palette.leakOuter}, ${(breachPulse * (0.009 + flash * 0.014)).toFixed(3)})`
      );
      pulseWash.addColorStop(1, `rgba(${palette.leakOuter}, 0)`);
      ctx.fillStyle = pulseWash;
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
    const palette = this.getBreachThemePalette();
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
      ctx.strokeStyle = `rgba(${palette.leakCore}, ${alpha.toFixed(3)})`;
      ctx.lineWidth = 1.8 + (1 - t) * 1.4;
      ctx.shadowColor = `rgba(${palette.leakOuter}, ${(alpha * 0.75).toFixed(3)})`;
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
      `rgba(${palette.edgeLight}, ${(0.08 + progress * 0.28 + pulse * 0.08 + (power - 1) * 0.05).toFixed(3)})`
    );
    riftGlow.addColorStop(
      0.35,
      `rgba(${palette.leakCore}, ${(0.12 + progress * 0.22 + (power - 1) * 0.04).toFixed(3)})`
    );
    riftGlow.addColorStop(0.75, `rgba(${palette.leakOuter}, ${(0.05 + progress * 0.12 + (power - 1) * 0.02).toFixed(3)})`);
    riftGlow.addColorStop(1, `rgba(${palette.leakOuter}, 0)`);
    ctx.fillStyle = riftGlow;
    ctx.beginPath();
    ctx.arc(cx, cy, minDim * (0.18 + progress * 0.28), 0, Math.PI * 2);
    ctx.fill();

    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(Math.sin(timeSec * 3.6) * 0.04);
    ctx.shadowColor = `rgba(${palette.leakCore}, ${(0.22 + progress * 0.38).toFixed(3)})`;
    ctx.shadowBlur = 18 + progress * 18 + (power - 1) * 8;
    ctx.fillStyle = `rgba(${palette.depthDark}, ${(0.55 + progress * 0.35).toFixed(3)})`;
    ctx.beginPath();
    ctx.ellipse(0, 0, slitWidth, slitHeight, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = `rgba(${palette.edgeLight}, ${(0.12 + progress * 0.36 + pulse * 0.08).toFixed(3)})`;
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
      ctx.strokeStyle = `rgba(${palette.leakCore}, ${(0.1 + progress * 0.26).toFixed(3)})`;
      ctx.lineWidth = 1.4 + (i % 2) * 0.9;
      ctx.shadowColor = `rgba(${palette.leakOuter}, ${(0.08 + progress * 0.18).toFixed(3)})`;
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
        ctx.fillStyle = `rgba(${palette.edgeLight}, ${(whiteFlash * (0.16 + (power - 1) * 0.06)).toFixed(3)})`;
        ctx.fillRect(padRect.x, padRect.y, padRect.width, padRect.height);
      }
    }
  }

  private renderBreachCoreSink(
    ctx: CanvasRenderingContext2D,
    padRect: Rect,
    timeSec: number,
    propagation: number,
    breachPulse: number
  ): void {
    const strength = clamp((propagation - 0.42) * 1.6 + breachPulse * 0.6, 0, 1);
    if (strength <= 0.05) {
      return;
    }
    const palette = this.getBreachThemePalette();
    const minDim = Math.min(padRect.width, padRect.height);
    const cx = padRect.x + padRect.width * 0.5;
    const cy = padRect.y + padRect.height * 0.5;
    const pulse = 0.5 + 0.5 * Math.sin(timeSec * (4.2 + strength * 2.4));
    const sinkRadius = minDim * (0.07 + strength * 0.18);
    const ringRadius = minDim * (0.15 + strength * 0.22);

    const compression = ctx.createRadialGradient(cx, cy, sinkRadius * 0.2, cx, cy, ringRadius * 1.2);
    compression.addColorStop(0, `rgba(${palette.depthDark}, ${(0.08 + strength * 0.2).toFixed(3)})`);
    compression.addColorStop(0.45, `rgba(${palette.leakOuter}, ${(0.03 + strength * 0.08).toFixed(3)})`);
    compression.addColorStop(1, "rgba(0, 0, 0, 0)");
    ctx.fillStyle = compression;
    ctx.beginPath();
    ctx.arc(cx, cy, ringRadius * 1.2, 0, Math.PI * 2);
    ctx.fill();

    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(timeSec * 0.42);
    const ringCount = 3;
    for (let i = 0; i < ringCount; i += 1) {
      const r = ringRadius * (0.72 + i * 0.2);
      const alpha = (0.06 + strength * 0.16) * (1 - i * 0.24) * (0.7 + pulse * 0.3);
      ctx.strokeStyle = `rgba(${palette.edgeLight}, ${alpha.toFixed(3)})`;
      ctx.lineWidth = 1.1 + i * 0.35;
      ctx.beginPath();
      for (let s = 0; s < 10; s += 1) {
        const a0 = (Math.PI * 2 * s) / 10 + i * 0.06;
        const a1 = a0 + 0.14 + (pulse - 0.5) * 0.04;
        ctx.arc(0, 0, r, a0, a1);
      }
      ctx.stroke();
      ctx.rotate(i % 2 === 0 ? -0.2 : 0.17);
    }
    ctx.restore();

    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(Math.sin(timeSec * 2.8) * 0.05);
    ctx.fillStyle = `rgba(${palette.depthDark}, ${(0.28 + strength * 0.34).toFixed(3)})`;
    ctx.beginPath();
    ctx.ellipse(
      0,
      0,
      sinkRadius * (0.84 + pulse * 0.08),
      sinkRadius * (1.18 + pulse * 0.06),
      0,
      0,
      Math.PI * 2
    );
    ctx.fill();
    ctx.strokeStyle = `rgba(${palette.edgeLight}, ${(0.08 + strength * 0.2).toFixed(3)})`;
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.ellipse(0, 0, sinkRadius * 0.94, sinkRadius * 1.28, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
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

  private buildBreachFracturePaths(): BreachFracturePath[] {
    const paths: BreachFracturePath[] = [];
    const spokeCount = 16;
    const spokeNodeCount = 9;
    const spokes: Point[][] = [];

    for (let i = 0; i < spokeCount; i += 1) {
      const seed = i + 1;
      const angleJitter = (seededUnit(seed * 4.1) - 0.5) * 0.14;
      const angle = (Math.PI * 2 * i) / spokeCount + angleJitter;
      const nodes: Point[] = [];
      for (let nodeIndex = 0; nodeIndex < spokeNodeCount; nodeIndex += 1) {
        const t = nodeIndex / (spokeNodeCount - 1);
        const radial = 0.048 + t * (0.61 + (seededUnit(seed * 7.3) - 0.5) * 0.1);
        const wobble = (seededUnit(seed * 8.7 + nodeIndex * 0.97) - 0.5) * (0.008 + t * 0.03);
        const bend = Math.sin((t * 2.4 + seededUnit(seed * 1.9)) * Math.PI * 2) * (0.004 + t * 0.009);
        const x = 0.5 + Math.cos(angle) * radial + Math.cos(angle + Math.PI / 2) * (wobble + bend);
        const y = 0.5 + Math.sin(angle) * radial + Math.sin(angle + Math.PI / 2) * (wobble + bend * 1.08);
        nodes.push({
          x: clamp(x, 0.04, 0.96),
          y: clamp(y, 0.05, 0.95)
        });
      }
      spokes.push(nodes);

      paths.push({
        kind: "RADIAL",
        nodes,
        activation: clamp((i / spokeCount) * 0.52, 0, 0.68),
        major: i % 2 === 0,
        thickness: 0.88 + seededUnit(seed * 2.7) * 0.72,
        maskPhase: seededUnit(seed * 9.2) * Math.PI * 2
      });

      if (i % 2 === 0) {
        const anchorIndex = 2 + Math.floor(seededUnit(seed * 11.4) * 4);
        const anchor = nodes[Math.min(nodes.length - 2, anchorIndex)] ?? nodes[Math.max(0, nodes.length - 2)];
        const turn = seededUnit(seed * 12.8) > 0.5 ? 1 : -1;
        const branchAngle = angle + turn * (0.32 + seededUnit(seed * 13.7) * 0.3);
        const branchNodes: Point[] = [anchor];
        const branchNodeCount = 6;
        for (let nodeIndex = 1; nodeIndex < branchNodeCount; nodeIndex += 1) {
          const t = nodeIndex / (branchNodeCount - 1);
          const radial = 0.075 + t * (0.21 + seededUnit(seed * 14.3) * 0.12);
          const wobble = (seededUnit(seed * 15.8 + nodeIndex * 1.1) - 0.5) * (0.009 + t * 0.018);
          const x = anchor.x + Math.cos(branchAngle) * radial + Math.cos(branchAngle + Math.PI / 2) * wobble;
          const y = anchor.y + Math.sin(branchAngle) * radial + Math.sin(branchAngle + Math.PI / 2) * wobble * 1.06;
          branchNodes.push({
            x: clamp(x, 0.04, 0.96),
            y: clamp(y, 0.05, 0.95)
          });
        }
        paths.push({
          kind: "BRANCH",
          nodes: branchNodes,
          activation: clamp(0.2 + (i / spokeCount) * 0.52, 0.14, 0.88),
          major: false,
          thickness: 0.6 + seededUnit(seed * 17.4) * 0.46,
          maskPhase: seededUnit(seed * 18.2) * Math.PI * 2
        });
      }
    }

    // Circumferential links between radial spokes help the fracture look structural.
    const ringLevels = [2, 3, 4, 5, 6];
    for (let levelIndex = 0; levelIndex < ringLevels.length; levelIndex += 1) {
      const level = ringLevels[levelIndex] ?? 2;
      const levelRatio = ringLevels.length <= 1 ? 0 : levelIndex / (ringLevels.length - 1);
      for (let i = 0; i < spokeCount; i += 1) {
        const skipChance = 0.12 + levelRatio * 0.18;
        if (seededUnit((level + 1) * 37.1 + i * 4.7) < skipChance) {
          continue;
        }
        const fromSpoke = spokes[i];
        const toSpoke = spokes[(i + 1) % spokeCount];
        if (!fromSpoke || !toSpoke) {
          continue;
        }
        const from = fromSpoke[Math.min(level, fromSpoke.length - 1)];
        const to = toSpoke[Math.min(level, toSpoke.length - 1)];
        if (!from || !to) {
          continue;
        }

        const midX = (from.x + to.x) * 0.5;
        const midY = (from.y + to.y) * 0.5;
        const radialX = midX - 0.5;
        const radialY = midY - 0.5;
        const radialLen = Math.hypot(radialX, radialY) || 1;
        const normalX = -radialY / radialLen;
        const normalY = radialX / radialLen;
        const bendDir = seededUnit((level + 5) * 11.3 + i * 3.1) > 0.5 ? 1 : -1;
        const bendAmt = (0.008 + levelRatio * 0.02) * bendDir;
        const mid: Point = {
          x: clamp(midX + normalX * bendAmt, 0.04, 0.96),
          y: clamp(midY + normalY * bendAmt, 0.05, 0.95)
        };

        paths.push({
          kind: "RING",
          nodes: [from, mid, to],
          activation: clamp(0.14 + levelRatio * 0.58 + (i / spokeCount) * 0.08, 0.12, 0.92),
          major: false,
          thickness: 0.48 + seededUnit((level + 3) * 19.9 + i * 1.9) * 0.42,
          maskPhase: seededUnit((level + 4) * 13.7 + i * 2.3) * Math.PI * 2
        });
      }
    }

    return paths;
  }

  private buildBreachFrostSeeds(): BreachFrostSeed[] {
    const seeds: BreachFrostSeed[] = [];
    const count = 30;
    for (let i = 0; i < count; i += 1) {
      const seed = i + 1;
      seeds.push({
        lane: seededUnit(seed * 2.2),
        riseRate: 0.055 + seededUnit(seed * 3.7) * 0.095,
        drift: (seededUnit(seed * 4.9) - 0.5) * 0.035,
        size: 0.9 + seededUnit(seed * 6.4) * 2.2,
        phase: seededUnit(seed * 7.8)
      });
    }
    return seeds;
  }

  private getBreachThemePalette(): BreachThemePalette {
    switch (this.monsterTeam.archetype) {
      case "INFERNAL":
        return {
          hairline: "166, 186, 203",
          hairlineMask: "222, 233, 242",
          leakCore: "234, 116, 70",
          leakOuter: "138, 66, 44",
          depthDark: "136, 154, 168",
          edgeLight: "236, 246, 255",
          frost: "236, 232, 221"
        };
      case "FROST":
        return {
          hairline: "170, 194, 212",
          hairlineMask: "228, 241, 252",
          leakCore: "170, 203, 232",
          leakOuter: "96, 126, 156",
          depthDark: "142, 166, 184",
          edgeLight: "240, 248, 255",
          frost: "235, 243, 250"
        };
      case "SHADOW":
        return {
          hairline: "162, 176, 196",
          hairlineMask: "219, 226, 240",
          leakCore: "178, 132, 205",
          leakOuter: "102, 72, 128",
          depthDark: "134, 146, 168",
          edgeLight: "230, 236, 248",
          frost: "229, 227, 238"
        };
      case "UNDEAD":
      default:
        return {
          hairline: "165, 184, 201",
          hairlineMask: "222, 234, 245",
          leakCore: "219, 152, 96",
          leakOuter: "126, 82, 54",
          depthDark: "138, 154, 170",
          edgeLight: "235, 244, 252",
          frost: "223, 231, 236"
        };
    }
  }

  private getFractureReveal(path: BreachFracturePath, propagation: number): number {
    if (propagation <= path.activation) {
      return 0;
    }
    return clamp((propagation - path.activation) / Math.max(0.1, 1 - path.activation), 0, 1);
  }

  private tracePartialFracturePath(
    ctx: CanvasRenderingContext2D,
    padRect: Rect,
    path: BreachFracturePath,
    reveal: number,
    offsetX = 0,
    offsetY = 0
  ): void {
    if (reveal <= 0 || path.nodes.length < 2) {
      return;
    }
    const maxStep = clamp(reveal, 0, 0.999999) * (path.nodes.length - 1);
    const fullSteps = Math.floor(maxStep);
    const partial = maxStep - fullSteps;
    const first = padToPixel(padRect, path.nodes[0]);
    ctx.beginPath();
    ctx.moveTo(first.x + offsetX, first.y + offsetY);
    for (let i = 1; i <= fullSteps; i += 1) {
      const node = padToPixel(padRect, path.nodes[i] ?? path.nodes[path.nodes.length - 1]);
      ctx.lineTo(node.x + offsetX, node.y + offsetY);
    }
    if (fullSteps < path.nodes.length - 1) {
      const from = path.nodes[fullSteps] ?? path.nodes[path.nodes.length - 2];
      const to = path.nodes[fullSteps + 1] ?? path.nodes[path.nodes.length - 1];
      const partialNode: Point = {
        x: from.x + (to.x - from.x) * partial,
        y: from.y + (to.y - from.y) * partial
      };
      const pixel = padToPixel(padRect, partialNode);
      ctx.lineTo(pixel.x + offsetX, pixel.y + offsetY);
    }
  }

  private renderSurfaceFissureAmplification(
    ctx: CanvasRenderingContext2D,
    padRect: Rect,
    timeSec: number,
    propagation: number,
    breachPulse: number
  ): void {
    const strength = clamp((propagation - 0.04) * 1.12 + breachPulse * 0.46, 0, 1);
    if (strength <= 0.04) {
      return;
    }

    const minDim = Math.min(padRect.width, padRect.height);
    const cx = padRect.x + padRect.width * 0.5;
    const cy = padRect.y + padRect.height * 0.5;
    const revealRadius = minDim * (0.09 + propagation * 0.72);
    const drift = timeSec * (1.4 + strength * 2.1);
    const ringCount = 4;

    for (let ringIndex = 0; ringIndex < ringCount; ringIndex += 1) {
      const t0 = ringIndex / ringCount;
      const t1 = (ringIndex + 1) / ringCount;
      const innerRadius = revealRadius * t0;
      const outerRadius = revealRadius * t1;
      const ringFalloff = 1 - t0 * 0.78;
      const alphaBase = (0.014 + strength * 0.06) * ringFalloff;

      ctx.save();
      ctx.beginPath();
      ctx.arc(cx, cy, outerRadius, 0, Math.PI * 2);
      ctx.arc(cx, cy, innerRadius, 0, Math.PI * 2, true);
      ctx.clip("evenodd");

      drawTiledRuntimeTexture(ctx, padRect, BREACH_FISSURE_TEXTURE, {
        alpha: alphaBase,
        tileScale: clamp(padRect.width / 1320, 0.28, 0.52),
        driftX: drift * (0.42 + ringIndex * 0.07),
        driftY: -drift * (0.21 + ringIndex * 0.06),
        composite: "soft-light"
      });
      drawTiledRuntimeTexture(ctx, padRect, BREACH_ROUGH_TEXTURE, {
        alpha: alphaBase * 0.7,
        tileScale: clamp(padRect.width / 1780, 0.24, 0.44),
        driftX: -drift * (0.26 + ringIndex * 0.04),
        driftY: drift * 0.12,
        composite: "overlay"
      });
      drawTiledRuntimeTexture(ctx, padRect, BREACH_DISPLACE_TEXTURE, {
        alpha: alphaBase * 0.46,
        tileScale: clamp(padRect.width / 1840, 0.24, 0.44),
        driftX: drift * 0.1,
        driftY: -drift * 0.08,
        composite: "screen"
      });
      ctx.restore();
    }

    const coreCompression = ctx.createRadialGradient(
      cx,
      cy,
      minDim * 0.02,
      cx,
      cy,
      revealRadius * 1.14
    );
    coreCompression.addColorStop(0, `rgba(222, 236, 247, ${(0.014 + strength * 0.035).toFixed(3)})`);
    coreCompression.addColorStop(0.5, `rgba(197, 216, 232, ${(0.008 + strength * 0.02).toFixed(3)})`);
    coreCompression.addColorStop(1, "rgba(197, 216, 232, 0)");
    ctx.fillStyle = coreCompression;
    ctx.fillRect(padRect.x, padRect.y, padRect.width, padRect.height);
  }

  private renderStressFractureLines(
    ctx: CanvasRenderingContext2D,
    padRect: Rect,
    timeSec: number,
    propagation: number
  ): void {
    if (propagation < 0.06) {
      return;
    }
    const palette = this.getBreachThemePalette();
    const baseAlpha = clamp(0.04 + propagation * 0.2, 0, 0.26);

    ctx.save();
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    for (const path of this.breachFracturePaths) {
      const reveal = this.getFractureReveal(path, propagation);
      if (reveal <= 0.01) {
        continue;
      }
      const maskPulse = 0.5 + 0.5 * Math.sin(timeSec * (1.2 + path.thickness * 0.38) + path.maskPhase + reveal * 2.4);
      const kindScale = path.kind === "RADIAL" ? 1 : path.kind === "BRANCH" ? 0.85 : 0.72;
      const lineAlpha = baseAlpha * (0.35 + reveal * 0.64) * kindScale;
      const baseWidth =
        path.kind === "RADIAL"
          ? 0.56 + path.thickness * 0.48
          : path.kind === "BRANCH"
            ? 0.44 + path.thickness * 0.34
            : 0.34 + path.thickness * 0.24;

      this.tracePartialFracturePath(ctx, padRect, path, reveal);
      ctx.strokeStyle = `rgba(${palette.hairline}, ${lineAlpha.toFixed(3)})`;
      ctx.lineWidth = baseWidth * 0.88;
      ctx.stroke();

      // Chalky high edge to sell fresh stress on top of existing ice fissure texture.
      this.tracePartialFracturePath(ctx, padRect, path, reveal * (0.9 + maskPulse * 0.1));
      ctx.strokeStyle = `rgba(${palette.hairlineMask}, ${(lineAlpha * (0.22 + maskPulse * 0.3)).toFixed(3)})`;
      ctx.lineWidth = Math.max(0.25, baseWidth * 0.66);
      ctx.stroke();
    }
    ctx.restore();
  }

  private renderArcaneGlowLeakage(
    ctx: CanvasRenderingContext2D,
    padRect: Rect,
    timeSec: number,
    propagation: number,
    breachPulse: number
  ): void {
    const glowStrength = clamp(propagation * 0.7 + breachPulse * 0.9, 0, 1);
    if (glowStrength < 0.08) {
      return;
    }
    const palette = this.getBreachThemePalette();
    const pulse = 0.5 + 0.5 * Math.sin(timeSec * (2.2 + glowStrength * 3));

    ctx.save();
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.globalCompositeOperation = "screen";
    for (const path of this.breachFracturePaths) {
      const reveal = this.getFractureReveal(path, propagation);
      if (reveal < 0.12) {
        continue;
      }
      const kindScale = path.kind === "RADIAL" ? 1 : path.kind === "BRANCH" ? 0.72 : 0.54;
      const leak = clamp(glowStrength * (0.2 + reveal * 0.72) * (0.58 + pulse * 0.42) * kindScale, 0, 1);
      this.tracePartialFracturePath(ctx, padRect, path, reveal);
      ctx.strokeStyle = `rgba(${palette.leakOuter}, ${(0.01 + leak * 0.068).toFixed(3)})`;
      ctx.shadowColor = `rgba(${palette.leakCore}, ${(0.03 + leak * 0.12).toFixed(3)})`;
      ctx.shadowBlur = 4 + leak * 9;
      ctx.lineWidth = 0.92 + path.thickness * (path.kind === "RING" ? 0.48 : 0.72) + reveal * 0.54;
      ctx.stroke();
      ctx.shadowBlur = 0;
    }
    ctx.restore();
  }

  private renderStructuralSeparation(
    ctx: CanvasRenderingContext2D,
    padRect: Rect,
    timeSec: number,
    propagation: number,
    breachPulse: number
  ): void {
    const depthStrength = clamp((propagation - 0.16) * 1.35 + breachPulse * 0.56, 0, 1);
    if (depthStrength < 0.06) {
      return;
    }

    const palette = this.getBreachThemePalette();
    ctx.save();
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    for (const path of this.breachFracturePaths) {
      const reveal = this.getFractureReveal(path, propagation);
      if (reveal < 0.16) {
        continue;
      }
      if (path.kind === "RING" && reveal < 0.58) {
        continue;
      }
      if (!path.major && path.kind !== "RING" && reveal < 0.42) {
        continue;
      }

      const first = path.nodes[0];
      const last = path.nodes[path.nodes.length - 1];
      const dx = last.x - first.x;
      const dy = last.y - first.y;
      const length = Math.hypot(dx, dy) || 1;
      const normalX = -dy / length;
      const normalY = dx / length;
      const kindDepthScale = path.kind === "RADIAL" ? 1 : path.kind === "BRANCH" ? 0.78 : 0.58;
      const parallax = (0.5 + 0.5 * Math.sin(timeSec * 4.8 + path.maskPhase)) * (0.7 + depthStrength * 1.1);
      const shiftPx = (0.28 + depthStrength * 1.24) * (path.major ? 1 : 0.62) * kindDepthScale * parallax;
      const depthOffsetX = normalX * shiftPx;
      const depthOffsetY = normalY * shiftPx;
      const trenchWidth =
        (path.kind === "RADIAL" ? 0.85 : path.kind === "BRANCH" ? 0.72 : 0.56) +
        path.thickness * (path.kind === "RING" ? 0.42 : 0.62) +
        depthStrength * (path.major ? 1.15 : 0.7) * kindDepthScale;

      this.tracePartialFracturePath(ctx, padRect, path, reveal, depthOffsetX, depthOffsetY);
      ctx.strokeStyle = `rgba(${palette.depthDark}, ${(0.06 + depthStrength * 0.14 * kindDepthScale).toFixed(3)})`;
      ctx.lineWidth = trenchWidth;
      ctx.stroke();

      this.tracePartialFracturePath(ctx, padRect, path, reveal, normalX * (-0.65 - depthStrength * 1.1), normalY * (-0.65 - depthStrength * 1.1));
      ctx.strokeStyle = `rgba(${palette.edgeLight}, ${(0.08 + depthStrength * 0.16 * kindDepthScale).toFixed(3)})`;
      ctx.lineWidth = 0.62 + path.thickness * 0.28 * kindDepthScale;
      ctx.stroke();

      this.tracePartialFracturePath(ctx, padRect, path, reveal, depthOffsetX * 0.42, depthOffsetY * 0.42);
      ctx.strokeStyle = `rgba(${palette.hairline}, ${(0.05 + depthStrength * 0.08 * kindDepthScale).toFixed(3)})`;
      ctx.lineWidth = 0.56 + path.thickness * 0.26 * kindDepthScale + depthStrength * 0.3;
      ctx.stroke();
    }
    ctx.restore();
  }

  private renderFrostDrift(
    ctx: CanvasRenderingContext2D,
    padRect: Rect,
    timeSec: number,
    propagation: number,
    breachPulse: number
  ): void {
    const frostStrength = clamp((propagation - 0.1) * 0.95 + breachPulse * 0.4, 0, 1);
    if (frostStrength <= 0.04) {
      return;
    }
    const palette = this.getBreachThemePalette();
    const count = Math.max(6, Math.floor(8 + frostStrength * (this.breachFrostSeeds.length - 8)));

    ctx.save();
    for (let i = 0; i < count; i += 1) {
      const seed = this.breachFrostSeeds[i];
      if (!seed) {
        continue;
      }
      const progress = (timeSec * seed.riseRate + seed.phase) % 1;
      const driftWave = Math.sin(timeSec * (0.86 + Math.abs(seed.drift) * 18) + seed.phase * Math.PI * 2);
      const x =
        padRect.x +
        padRect.width * (0.08 + seed.lane * 0.84) +
        driftWave * padRect.width * (0.01 + Math.abs(seed.drift) * 0.55);
      const y = padRect.y + padRect.height * (0.96 - progress * 0.9);
      const alpha = clamp((0.03 + frostStrength * 0.12) * (0.35 + (1 - progress) * 0.9), 0.02, 0.18);
      const radius = seed.size * (0.6 + (1 - progress) * 0.42);

      ctx.fillStyle = `rgba(${palette.frost}, ${alpha.toFixed(3)})`;
      ctx.beginPath();
      ctx.arc(x, y, radius, 0, Math.PI * 2);
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
      trainingMode: this.trainingMode,
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
