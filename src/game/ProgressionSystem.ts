import type { GameRunSummary } from "./Game";
import type { Profile } from "../models/Profile";

export type LevelProgress = {
  level: number;
  xpIntoLevel: number;
  xpToNextLevel: number;
  totalXpAtLevelStart: number;
};

export type AppliedRunXp = {
  profile: Profile;
  xpGained: number;
  previousLevel: number;
  newLevel: number;
  levelUps: number[];
};

const RUN_XP_BASE = 20;

export function getLevelThreshold(level: number): number {
  return 100 * Math.max(1, level);
}

export function calculateRunXp(
  summary: Pick<GameRunSummary, "score" | "hits" | "perfects" | "bestCombo"> &
    Partial<Pick<GameRunSummary, "matchResult" | "playerGoals" | "enemyGoals" | "endReason">>
): number {
  const matchBonus =
    summary.matchResult === "win" ? 28 : summary.matchResult === "tie" ? 12 : summary.matchResult === "loss" ? 0 : 0;
  const goalBonus = Math.max(0, (summary.playerGoals ?? 0) * 7);
  const shutoutBonus =
    summary.matchResult === "win" && (summary.enemyGoals ?? 0) === 0 && (summary.playerGoals ?? 0) > 0 ? 12 : 0;
  const breachPenalty = summary.endReason === "breach" ? 10 : 0;

  return Math.max(
    0,
    Math.round(
      RUN_XP_BASE +
        summary.hits * 2 +
        summary.perfects * 3 +
        summary.bestCombo * 5 +
        summary.score / 100 +
        matchBonus +
        goalBonus +
        shutoutBonus -
        breachPenalty
    )
  );
}

export function getLevelProgress(totalXp: number): LevelProgress {
  let remaining = Math.max(0, Math.floor(totalXp));
  let level = 1;
  let totalXpAtLevelStart = 0;

  while (remaining >= getLevelThreshold(level)) {
    const threshold = getLevelThreshold(level);
    remaining -= threshold;
    totalXpAtLevelStart += threshold;
    level += 1;
  }

  return {
    level,
    xpIntoLevel: remaining,
    xpToNextLevel: getLevelThreshold(level),
    totalXpAtLevelStart
  };
}

export function applyRunXp(profile: Profile, xpGained: number): AppliedRunXp {
  const safeXp = Math.max(0, Math.floor(xpGained));
  const previousLevel = profile.level;
  const totalXp = profile.xp + safeXp;
  const resolved = getLevelProgress(totalXp);
  const newLevel = resolved.level;
  const levelUps: number[] = [];

  for (let level = previousLevel + 1; level <= newLevel; level += 1) {
    levelUps.push(level);
  }

  return {
    profile: {
      ...profile,
      xp: totalXp,
      level: newLevel,
      perkPoints: profile.perkPoints + levelUps.length
    },
    xpGained: safeXp,
    previousLevel,
    newLevel,
    levelUps
  };
}
