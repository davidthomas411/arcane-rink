import { DEFAULT_PROFILE_STORE, createProfile, type ClassId, type Profile, type ProfileStore } from "../models/Profile";

const STORAGE_KEY = "arcane-rink/profiles.v1";

function cloneStore(store: ProfileStore): ProfileStore {
  return {
    version: 1,
    activeProfileId: store.activeProfileId,
    profiles: store.profiles.map((profile) => ({
      ...profile,
      perks: [...profile.perks],
      unlockedCosmetics: [...profile.unlockedCosmetics],
      stats: { ...profile.stats }
    }))
  };
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function normalizeStore(raw: unknown): ProfileStore | null {
  if (!isObject(raw) || raw.version !== 1 || !Array.isArray(raw.profiles)) {
    return null;
  }

  const profiles: Profile[] = [];

  for (const entry of raw.profiles) {
    if (!isObject(entry)) {
      continue;
    }

    const stats = isObject(entry.stats) ? entry.stats : {};
    const profile: Profile = {
      id: typeof entry.id === "string" ? entry.id : `profile_${Math.random().toString(36).slice(2, 8)}`,
      displayName: typeof entry.displayName === "string" ? entry.displayName : "Rookie",
      jerseyNumber: typeof entry.jerseyNumber === "string" ? entry.jerseyNumber : "00",
      faceImageDataUrl: typeof entry.faceImageDataUrl === "string" ? entry.faceImageDataUrl : null,
      classId:
        entry.classId === "BLADEMASTER" || entry.classId === "FROST_WARDEN" || entry.classId === "SHADOW_ROGUE"
          ? entry.classId
          : "BLADEMASTER",
      stylePreset: entry.stylePreset === "FROST" || entry.stylePreset === "FEL" ? entry.stylePreset : "ARCANE",
      xp: typeof entry.xp === "number" && Number.isFinite(entry.xp) ? Math.max(0, Math.floor(entry.xp)) : 0,
      level: typeof entry.level === "number" && Number.isFinite(entry.level) ? Math.max(1, Math.floor(entry.level)) : 1,
      perkPoints:
        typeof entry.perkPoints === "number" && Number.isFinite(entry.perkPoints)
          ? Math.max(0, Math.floor(entry.perkPoints))
          : 0,
      perks: Array.isArray(entry.perks) ? entry.perks.filter((perk): perk is string => typeof perk === "string") : [],
      unlockedCosmetics: Array.isArray(entry.unlockedCosmetics)
        ? entry.unlockedCosmetics.filter((item): item is Profile["unlockedCosmetics"][number] => typeof item === "string")
        : [],
      stats: {
        runs: typeof stats.runs === "number" && Number.isFinite(stats.runs) ? Math.max(0, Math.floor(stats.runs)) : 0,
        bestScore:
          typeof stats.bestScore === "number" && Number.isFinite(stats.bestScore)
            ? Math.max(0, Math.floor(stats.bestScore))
            : 0,
        bestCombo:
          typeof stats.bestCombo === "number" && Number.isFinite(stats.bestCombo)
            ? Math.max(0, Math.floor(stats.bestCombo))
            : 0,
        totalHits:
          typeof stats.totalHits === "number" && Number.isFinite(stats.totalHits)
            ? Math.max(0, Math.floor(stats.totalHits))
            : 0,
        totalPerfects:
          typeof stats.totalPerfects === "number" && Number.isFinite(stats.totalPerfects)
            ? Math.max(0, Math.floor(stats.totalPerfects))
            : 0
      },
      createdAtMs:
        typeof entry.createdAtMs === "number" && Number.isFinite(entry.createdAtMs)
          ? Math.floor(entry.createdAtMs)
          : Date.now(),
      updatedAtMs:
        typeof entry.updatedAtMs === "number" && Number.isFinite(entry.updatedAtMs)
          ? Math.floor(entry.updatedAtMs)
          : Date.now()
    };

    profiles.push(profile);
  }

  const activeProfileId =
    typeof raw.activeProfileId === "string" && profiles.some((profile) => profile.id === raw.activeProfileId)
      ? raw.activeProfileId
      : profiles[0]?.id ?? null;

  return {
    version: 1,
    activeProfileId,
    profiles
  };
}

export class ProfileManager {
  private store: ProfileStore;

  constructor(private readonly storage: Storage = window.localStorage) {
    this.store = this.load();
  }

  listProfiles(): Profile[] {
    return this.store.profiles
      .slice()
      .sort((a, b) => b.updatedAtMs - a.updatedAtMs || a.displayName.localeCompare(b.displayName));
  }

  getActiveProfile(): Profile | null {
    if (!this.store.activeProfileId) {
      return null;
    }
    return this.store.profiles.find((profile) => profile.id === this.store.activeProfileId) ?? null;
  }

  getProfile(id: string): Profile | null {
    return this.store.profiles.find((profile) => profile.id === id) ?? null;
  }

  createAndSelectProfile(input: { displayName: string; jerseyNumber: string; classId: ClassId }): Profile {
    const profile = createProfile(input);
    this.store.profiles.push(profile);
    this.store.activeProfileId = profile.id;
    this.flush();
    return profile;
  }

  selectProfile(id: string): Profile | null {
    if (!this.store.profiles.some((profile) => profile.id === id)) {
      return null;
    }
    this.store.activeProfileId = id;
    this.touchProfile(id);
    this.flush();
    return this.getActiveProfile();
  }

  updateProfile(id: string, nextProfile: Profile): Profile {
    const index = this.store.profiles.findIndex((profile) => profile.id === id);
    if (index === -1) {
      throw new Error(`Profile not found: ${id}`);
    }

    this.store.profiles[index] = {
      ...nextProfile,
      id,
      updatedAtMs: Date.now(),
      perks: [...nextProfile.perks],
      unlockedCosmetics: [...nextProfile.unlockedCosmetics],
      stats: { ...nextProfile.stats }
    };

    this.flush();
    return this.store.profiles[index];
  }

  private touchProfile(id: string): void {
    const profile = this.store.profiles.find((entry) => entry.id === id);
    if (!profile) {
      return;
    }
    profile.updatedAtMs = Date.now();
  }

  private load(): ProfileStore {
    try {
      const raw = this.storage.getItem(STORAGE_KEY);
      if (!raw) {
        return cloneStore(DEFAULT_PROFILE_STORE);
      }
      const parsed = JSON.parse(raw) as unknown;
      return normalizeStore(parsed) ?? cloneStore(DEFAULT_PROFILE_STORE);
    } catch {
      return cloneStore(DEFAULT_PROFILE_STORE);
    }
  }

  private flush(): void {
    this.storage.setItem(STORAGE_KEY, JSON.stringify(this.store));
  }
}

