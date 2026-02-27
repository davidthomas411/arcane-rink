import type { GameRunSummary } from "./Game";
import type { CosmeticId, EquippedCosmetics, Profile } from "../models/Profile";

export const TRAIL_COSMETICS = ["ARCANE_SPARK", "FROST_MIST", "FEL_FLAME"] as const;
export const TARGET_SKIN_COSMETICS = ["RUNE_RING", "ICE_SIGIL", "SHADOW_EYE"] as const;
export const HELMET_COSMETICS = [
  "HELMET_IRON_CAGE",
  "HELMET_FROST_CREST",
  "HELMET_FEL_SPIKES",
  "HELMET_WARDEN_VISOR"
] as const;
export const STICK_COSMETICS = ["STICK_OAK_RUNE", "STICK_FROSTBITE", "STICK_EMBERMAW", "STICK_STARFORGED"] as const;
export const GLOVES_COSMETICS = ["GLOVES_STANDARD", "GLOVES_FROSTBOUND", "GLOVES_EMBERGRIP", "GLOVES_WARDEN_PLATE"] as const;

export type CosmeticSlotKey = keyof EquippedCosmetics;

const COSMETIC_ORDER: CosmeticId[] = [
  "HELMET_FROST_CREST",
  "FROST_MIST",
  "STICK_FROSTBITE",
  "ICE_SIGIL",
  "GLOVES_FROSTBOUND",
  "HELMET_FEL_SPIKES",
  "FEL_FLAME",
  "STICK_EMBERMAW",
  "SHADOW_EYE",
  "GLOVES_EMBERGRIP",
  "HELMET_WARDEN_VISOR",
  "STICK_STARFORGED",
  "GLOVES_WARDEN_PLATE",
  "ARCANE_SPARK",
  "RUNE_RING"
];

export type LootReward = {
  id: CosmeticId;
  source: "level_unlock" | "run_drop";
};

export function cosmeticSlot(id: CosmeticId): CosmeticSlotKey {
  if ((TRAIL_COSMETICS as readonly string[]).includes(id)) {
    return "trail";
  }
  if ((TARGET_SKIN_COSMETICS as readonly string[]).includes(id)) {
    return "targetSkin";
  }
  if ((HELMET_COSMETICS as readonly string[]).includes(id)) {
    return "helmet";
  }
  if ((STICK_COSMETICS as readonly string[]).includes(id)) {
    return "stick";
  }
  return "gloves";
}

export function cosmeticsForSlot(slot: CosmeticSlotKey): CosmeticId[] {
  switch (slot) {
    case "trail":
      return [...TRAIL_COSMETICS];
    case "targetSkin":
      return [...TARGET_SKIN_COSMETICS];
    case "helmet":
      return [...HELMET_COSMETICS];
    case "stick":
      return [...STICK_COSMETICS];
    case "gloves":
      return [...GLOVES_COSMETICS];
    default:
      return [];
  }
}

export function cosmeticShortLabel(id: CosmeticId): string {
  switch (id) {
    case "ARCANE_SPARK":
      return "Arcane Spark";
    case "FROST_MIST":
      return "Frost Mist";
    case "FEL_FLAME":
      return "Fel Flame";
    case "RUNE_RING":
      return "Rune Ring";
    case "ICE_SIGIL":
      return "Ice Sigil";
    case "SHADOW_EYE":
      return "Shadow Eye";
    case "HELMET_IRON_CAGE":
      return "Iron Cage";
    case "HELMET_FROST_CREST":
      return "Frost Crest";
    case "HELMET_FEL_SPIKES":
      return "Fel Spikes";
    case "HELMET_WARDEN_VISOR":
      return "Warden Visor";
    case "STICK_OAK_RUNE":
      return "Oak Rune";
    case "STICK_FROSTBITE":
      return "Frostbite";
    case "STICK_EMBERMAW":
      return "Embermaw";
    case "STICK_STARFORGED":
      return "Starforged";
    case "GLOVES_STANDARD":
      return "Standard Gloves";
    case "GLOVES_FROSTBOUND":
      return "Frostbound";
    case "GLOVES_EMBERGRIP":
      return "Embergrip";
    case "GLOVES_WARDEN_PLATE":
      return "Warden Plate";
    default:
      return id;
  }
}

export function cosmeticLabel(id: CosmeticId): string {
  switch (cosmeticSlot(id)) {
    case "trail":
      return `Trail: ${cosmeticShortLabel(id)}`;
    case "targetSkin":
      return `Gate Skin: ${cosmeticShortLabel(id)}`;
    case "helmet":
      return `Helmet: ${cosmeticShortLabel(id)}`;
    case "stick":
      return `Stick: ${cosmeticShortLabel(id)}`;
    case "gloves":
      return `Gloves: ${cosmeticShortLabel(id)}`;
    default:
      return cosmeticShortLabel(id);
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
