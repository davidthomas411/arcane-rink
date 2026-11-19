import { uid } from "../util";
import type { ClassId, TierId } from "./classes";
import { CLASSES, TIERS } from "./classes";
import { SLOTS, type Item, type Slot } from "./loot";

export type SkillId = "stick" | "pass" | "aware";

export const SKILL_LABEL: Record<SkillId, string> = {
  stick: "Stickhandling",
  pass: "Passing",
  aware: "Heads-Up"
};

export const SKILL_MAX = 300;

export type HeroStats = {
  encounters: number;
  touches: number;
  passes: number;
  receptions: number;
  /** Fastest pass seen, ft/s. */
  topPassSpeed: number;
  distanceFt: number;
  seconds: number;
};

export type Hero = {
  id: string;
  name: string;
  jersey: string;
  classId: ClassId;
  tier: TierId;
  /** "class" for the class crest, or the key of one of the painted player portraits. */
  portrait: string;
  gold: number;
  xp: number;
  level: number;
  gear: Partial<Record<Slot, Item>>;
  skills: Record<SkillId, number>;
  stats: HeroStats;
  /** Best star rating per encounter id. */
  stars: Record<string, number>;
};

export type Save = {
  version: 1;
  heroes: Hero[];
  /** Hero ids currently in the party, in play order. */
  party: string[];
  daily: { lastDate: string | null; streak: number; best: number };
};

const KEY = "arcane-rink/realm-save.v1";
export const MAX_PARTY = 4;
export const MAX_LEVEL = 20;

export function xpForLevel(level: number): number {
  return 100 * Math.max(1, level);
}

export function createHero(name: string, jersey: string, classId: ClassId, tier: TierId, portrait = "class"): Hero {
  return {
    id: uid(),
    name: name.trim().slice(0, 14) || "Rookie",
    jersey: jersey.trim().slice(0, 2) || "00",
    classId,
    tier,
    portrait,
    gold: 0,
    xp: 0,
    level: 1,
    gear: {},
    skills: { stick: 1, pass: 1, aware: 1 },
    stats: { encounters: 0, touches: 0, passes: 0, receptions: 0, topPassSpeed: 0, distanceFt: 0, seconds: 0 },
    stars: {}
  };
}

/** Add XP and return the levels gained. `hero.xp` is progress within the current level. */
export function grantXp(hero: Hero, amount: number): number[] {
  const gained: number[] = [];
  hero.xp += Math.max(0, Math.round(amount));
  while (hero.level < MAX_LEVEL && hero.xp >= xpForLevel(hero.level)) {
    hero.xp -= xpForLevel(hero.level);
    hero.level += 1;
    gained.push(hero.level);
  }
  if (hero.level >= MAX_LEVEL) hero.xp = Math.min(hero.xp, xpForLevel(hero.level));
  return gained;
}

/**
 * Skills climb with use, quickly at first and slowly near the cap,
 * like a profession bar. Returns the points gained.
 */
export function grantSkill(hero: Hero, skill: SkillId, actions: number): number {
  const before = hero.skills[skill];
  let value = before;
  let budget = actions;
  while (budget > 0 && value < SKILL_MAX) {
    const cost = 2 + value / 12;
    if (budget < cost) break;
    budget -= cost;
    value += 1;
  }
  hero.skills[skill] = value;
  return value - before;
}

function num(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function normalizeHero(raw: unknown): Hero | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Partial<Hero>;
  if (typeof r.id !== "string" || typeof r.name !== "string") return null;
  const base = createHero(r.name, typeof r.jersey === "string" ? r.jersey : "00", r.classId && r.classId in CLASSES ? r.classId : "warrior", r.tier && r.tier in TIERS ? r.tier : "skilled");
  const gear: Partial<Record<Slot, Item>> = {};
  for (const slot of SLOTS) {
    const item = r.gear?.[slot];
    if (item && typeof item.name === "string" && typeof item.ilvl === "number") gear[slot] = item;
  }
  const stars: Record<string, number> = {};
  if (r.stars && typeof r.stars === "object") {
    for (const [key, value] of Object.entries(r.stars)) {
      if (typeof value === "number") stars[key] = Math.max(0, Math.min(3, Math.round(value)));
    }
  }
  return {
    ...base,
    id: r.id,
    portrait: typeof r.portrait === "string" ? r.portrait : "class",
    gold: Math.max(0, num(r.gold, 0)),
    xp: Math.max(0, num(r.xp, 0)),
    level: Math.max(1, Math.min(MAX_LEVEL, Math.round(num(r.level, 1)))),
    gear,
    skills: {
      stick: Math.max(1, Math.min(SKILL_MAX, num(r.skills?.stick, 1))),
      pass: Math.max(1, Math.min(SKILL_MAX, num(r.skills?.pass, 1))),
      aware: Math.max(1, Math.min(SKILL_MAX, num(r.skills?.aware, 1)))
    },
    stats: {
      encounters: num(r.stats?.encounters, 0),
      touches: num(r.stats?.touches, 0),
      passes: num(r.stats?.passes, 0),
      receptions: num(r.stats?.receptions, 0),
      topPassSpeed: num(r.stats?.topPassSpeed, 0),
      distanceFt: num(r.stats?.distanceFt, 0),
      seconds: num(r.stats?.seconds, 0)
    },
    stars
  };
}

export function loadSave(storage: Storage = window.localStorage): Save {
  const empty: Save = { version: 1, heroes: [], party: [], daily: { lastDate: null, streak: 0, best: 0 } };
  try {
    const raw = storage.getItem(KEY);
    if (!raw) return empty;
    const data = JSON.parse(raw) as Partial<Save>;
    const heroes = Array.isArray(data.heroes) ? data.heroes.map(normalizeHero).filter((h): h is Hero => h !== null) : [];
    const ids = new Set(heroes.map((h) => h.id));
    const party = Array.isArray(data.party) ? data.party.filter((id) => typeof id === "string" && ids.has(id)).slice(0, MAX_PARTY) : [];
    return {
      version: 1,
      heroes,
      party,
      daily: {
        lastDate: typeof data.daily?.lastDate === "string" ? data.daily.lastDate : null,
        streak: Math.max(0, num(data.daily?.streak, 0)),
        best: Math.max(0, num(data.daily?.best, 0))
      }
    };
  } catch {
    return empty;
  }
}

export function persistSave(save: Save, storage: Storage = window.localStorage): void {
  try {
    storage.setItem(KEY, JSON.stringify(save));
  } catch {
    // Ignore: progress simply will not survive a reload.
  }
}

export function partyHeroes(save: Save): Hero[] {
  return save.party.map((id) => save.heroes.find((h) => h.id === id)).filter((h): h is Hero => h !== undefined);
}

export function localDateKey(date = new Date()): string {
  const m = `${date.getMonth() + 1}`.padStart(2, "0");
  const d = `${date.getDate()}`.padStart(2, "0");
  return `${date.getFullYear()}-${m}-${d}`;
}

/** Mark today's routine done. Returns the new streak. */
export function completeDaily(save: Save, today = new Date()): number {
  const key = localDateKey(today);
  if (save.daily.lastDate === key) return save.daily.streak;
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  save.daily.streak = save.daily.lastDate === localDateKey(yesterday) ? save.daily.streak + 1 : 1;
  save.daily.best = Math.max(save.daily.best, save.daily.streak);
  save.daily.lastDate = key;
  return save.daily.streak;
}

export function dailyDoneToday(save: Save, today = new Date()): boolean {
  return save.daily.lastDate === localDateKey(today);
}
