export type ClassId = "BLADEMASTER" | "FROST_WARDEN" | "SHADOW_ROGUE";
export type StylePreset = "ARCANE" | "FROST" | "FEL";

export type TrailCosmetic = "ARCANE_SPARK" | "FROST_MIST" | "FEL_FLAME";
export type TargetSkinCosmetic = "RUNE_RING" | "ICE_SIGIL" | "SHADOW_EYE";
export type CosmeticId = TrailCosmetic | TargetSkinCosmetic;

export type ProfileStats = {
  runs: number;
  bestScore: number;
  bestCombo: number;
  totalHits: number;
  totalPerfects: number;
};

export type Profile = {
  id: string;
  displayName: string;
  jerseyNumber: string;
  faceImageDataUrl: string | null;
  classId: ClassId;
  stylePreset: StylePreset;
  xp: number;
  level: number;
  perkPoints: number;
  perks: string[];
  unlockedCosmetics: CosmeticId[];
  stats: ProfileStats;
  createdAtMs: number;
  updatedAtMs: number;
};

export type ProfileStore = {
  version: 1;
  activeProfileId: string | null;
  profiles: Profile[];
};

export const DEFAULT_PROFILE_STORE: ProfileStore = {
  version: 1,
  activeProfileId: null,
  profiles: []
};

export const CLASS_OPTIONS: ReadonlyArray<{ id: ClassId; label: string }> = [
  { id: "BLADEMASTER", label: "Blademaster" },
  { id: "FROST_WARDEN", label: "Frost Warden" },
  { id: "SHADOW_ROGUE", label: "Shadow Rogue" }
];

export function classLabel(classId: ClassId): string {
  return CLASS_OPTIONS.find((option) => option.id === classId)?.label ?? classId;
}

export function defaultStyleForClass(classId: ClassId): StylePreset {
  switch (classId) {
    case "BLADEMASTER":
      return "ARCANE";
    case "FROST_WARDEN":
      return "FROST";
    case "SHADOW_ROGUE":
      return "FEL";
    default:
      return "ARCANE";
  }
}

function createId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }

  return `profile_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

export function createProfile(input: {
  displayName: string;
  jerseyNumber: string;
  classId: ClassId;
}): Profile {
  const now = Date.now();

  return {
    id: createId(),
    displayName: input.displayName.trim() || "Rookie",
    jerseyNumber: input.jerseyNumber.trim() || "00",
    faceImageDataUrl: null,
    classId: input.classId,
    stylePreset: defaultStyleForClass(input.classId),
    xp: 0,
    level: 1,
    perkPoints: 0,
    perks: [],
    unlockedCosmetics: ["RUNE_RING", "ARCANE_SPARK"],
    stats: {
      runs: 0,
      bestScore: 0,
      bestCombo: 0,
      totalHits: 0,
      totalPerfects: 0
    },
    createdAtMs: now,
    updatedAtMs: now
  };
}

