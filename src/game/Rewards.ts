import type { GameRunSummary } from "./Game";
import type { CosmeticId, Profile } from "../models/Profile";

export const TRAIL_COSMETICS = ["ARCANE_SPARK", "FROST_MIST", "FEL_FLAME"] as const;
export const TARGET_SKIN_COSMETICS = ["RUNE_RING", "ICE_SIGIL", "SHADOW_EYE"] as const;

const COSMETIC_ORDER: CosmeticId[] = [
  "FROST_MIST",
  "ICE_SIGIL",
  "FEL_FLAME",
  "SHADOW_EYE",
  "ARCANE_SPARK",
  "RUNE_RING"
];

export type LootReward = {
  id: CosmeticId;
  source: "level_unlock" | "run_drop";
};

export function cosmeticLabel(id: CosmeticId): string {
  switch (id) {
    case "ARCANE_SPARK":
      return "Trail: Arcane Spark";
    case "FROST_MIST":
      return "Trail: Frost Mist";
    case "FEL_FLAME":
      return "Trail: Fel Flame";
    case "RUNE_RING":
      return "Target Skin: Rune Ring";
    case "ICE_SIGIL":
      return "Target Skin: Ice Sigil";
    case "SHADOW_EYE":
      return "Target Skin: Shadow Eye";
    default:
      return id;
  }
}

function hasCosmetic(profile: Profile, id: CosmeticId): boolean {
  return profile.unlockedCosmetics.includes(id);
}

function nextLockedCosmetic(profile: Profile): CosmeticId | null {
  for (const id of COSMETIC_ORDER) {
    if (!hasCosmetic(profile, id)) {
      return id;
    }
  }
  return null;
}

function shouldUnlockCosmeticOnLevel(level: number): boolean {
  if (level <= 4) {
    return true;
  }
  return level % 2 === 0;
}

export function collectLevelUnlockRewards(previousLevel: number, newLevel: number, profile: Profile): LootReward[] {
  const rewards: LootReward[] = [];
  const tempProfile: Profile = {
    ...profile,
    unlockedCosmetics: [...profile.unlockedCosmetics]
  };

  for (let level = previousLevel + 1; level <= newLevel; level += 1) {
    if (!shouldUnlockCosmeticOnLevel(level)) {
      continue;
    }
    const next = nextLockedCosmetic(tempProfile);
    if (!next) {
      break;
    }
    tempProfile.unlockedCosmetics.push(next);
    rewards.push({ id: next, source: "level_unlock" });
  }

  return rewards;
}

export function rollRunDropReward(profile: Profile, summary: GameRunSummary): LootReward | null {
  const locked = COSMETIC_ORDER.filter((id) => !hasCosmetic(profile, id));
  if (locked.length === 0) {
    return null;
  }

  const chance =
    0.1 +
    Math.min(0.25, summary.bestCombo * 0.015) +
    Math.min(0.15, summary.perfects * 0.006) +
    Math.min(0.1, summary.score / 8000);

  if (Math.random() > chance) {
    return null;
  }

  const index = Math.floor(Math.random() * locked.length);
  const id = locked[index] ?? locked[0];
  if (!id) {
    return null;
  }

  return { id, source: "run_drop" };
}

export function applyLootRewards(profile: Profile, rewards: LootReward[]): Profile {
  if (rewards.length === 0) {
    return profile;
  }

  const nextUnlocked = new Set(profile.unlockedCosmetics);
  for (const reward of rewards) {
    nextUnlocked.add(reward.id);
  }

  return {
    ...profile,
    unlockedCosmetics: [...nextUnlocked]
  };
}

