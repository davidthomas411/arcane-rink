import type { PracticeStats } from "../input/Gestures";
import type { Adventure, EncounterDef } from "./content";
import type { HeroTally } from "./encounter";
import { rarityRank, rollItem, type Item } from "./loot";
import { completeDaily, grantSkill, grantXp, type Hero, type Save, type SkillId } from "./save";

export type RewardInput = {
  adventure: Adventure;
  completed: boolean;
  encounters: { def: EncounterDef; stars: number }[];
  heroes: { hero: Hero; tally: HeroTally; practice: PracticeStats }[];
};

export type HeroReward = {
  hero: Hero;
  xp: number;
  levelUps: number[];
  loot: Item | null;
  /** True if the drop was better than what the hero wore and was put on. */
  equipped: boolean;
  skillUps: Record<SkillId, number>;
};

export type RewardSummary = {
  stars: number;
  rewards: HeroReward[];
  /** New daily streak if this was the daily routine, otherwise null. */
  streak: number | null;
};

/**
 * Turn a finished adventure into XP, loot, skill points and career stats.
 * Leaving early still banks the practice (skills and stats) but not XP or loot.
 */
export function applyRewards(save: Save, input: RewardInput, rng: () => number): RewardSummary {
  const { adventure, completed, encounters } = input;
  const stars = completed && encounters.length > 0 ? Math.round(encounters.reduce((sum, e) => sum + e.stars, 0) / encounters.length) : 0;
  const starMult = stars >= 3 ? 1.25 : stars === 2 ? 1 : 0.75;
  // A raid is one long fight, so it pays like several.
  const kindMult = adventure.kind === "raid" ? 2.5 : 1;
  const baseXp = encounters.reduce((sum, e) => sum + 30 + e.def.level * 12, 0) * kindMult;

  let streak: number | null = null;
  if (completed && adventure.kind === "daily") streak = completeDaily(save);

  const rewards: HeroReward[] = [];
  for (const entry of input.heroes) {
    const { hero, tally, practice } = entry;
    if (tally.seconds <= 0) continue;

    hero.stats.encounters += encounters.length;
    hero.stats.touches += practice.touches;
    hero.stats.passes += practice.passes;
    hero.stats.receptions += practice.receptions;
    hero.stats.topPassSpeed = Math.max(hero.stats.topPassSpeed, practice.topPassSpeed);
    hero.stats.distanceFt += practice.distanceFt;
    hero.stats.seconds += tally.seconds;

    const skillUps: Record<SkillId, number> = {
      stick: grantSkill(hero, "stick", tally.stick),
      pass: grantSkill(hero, "pass", tally.pass * 3),
      aware: grantSkill(hero, "aware", tally.aware * 3)
    };

    let xp = 0;
    let levelUps: number[] = [];
    let loot: Item | null = null;
    let equipped = false;
    if (completed) {
      const firstClear = hero.stars[adventure.id] === undefined;
      xp = Math.round(baseXp * starMult * (firstClear ? 1.5 : 1) + (streak !== null ? 20 * Math.min(streak, 7) : 0));
      levelUps = grantXp(hero, xp);
      hero.stars[adventure.id] = Math.max(hero.stars[adventure.id] ?? 0, stars);

      const guaranteed = adventure.kind !== "quest" || firstClear;
      if (guaranteed || rng() < 0.5) {
        const luck = (adventure.kind === "quest" ? 1 : adventure.kind === "raid" ? 2.2 : 1.6) * (stars >= 3 ? 1.3 : 1);
        loot = rollItem(rng, Math.max(hero.level, adventure.level), luck);
        const current = hero.gear[loot.slot];
        if (!current || loot.ilvl > current.ilvl || (loot.ilvl === current.ilvl && rarityRank(loot.rarity) > rarityRank(current.rarity))) {
          hero.gear[loot.slot] = loot;
          equipped = true;
        }
      }
    }
    rewards.push({ hero, xp, levelUps, loot, equipped, skillUps });
  }
  return { stars, rewards, streak };
}
