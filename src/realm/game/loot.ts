import { pick, uid } from "../util";

export type Slot = "stick" | "gloves" | "helm" | "skates" | "charm";
export type Rarity = "common" | "uncommon" | "rare" | "epic" | "legendary";
export type StatId = "power" | "stamina" | "haste" | "focus";

export type Item = {
  id: string;
  name: string;
  slot: Slot;
  rarity: Rarity;
  ilvl: number;
  stat: StatId;
  value: number;
};

export const SLOTS: readonly Slot[] = ["stick", "gloves", "helm", "skates", "charm"];

export const SLOT_LABEL: Record<Slot, string> = { stick: "Stick", gloves: "Gloves", helm: "Helm", skates: "Skates", charm: "Charm" };
export const SLOT_GLYPH: Record<Slot, string> = { stick: "🏒", gloves: "🧤", helm: "⛑️", skates: "⛸️", charm: "📿" };

export const RARITY_COLOR: Record<Rarity, string> = {
  common: "#b9b3a4",
  uncommon: "#5fd35f",
  rare: "#4d9bf0",
  epic: "#b660f0",
  legendary: "#ff9a2e"
};

export const STAT_LABEL: Record<StatId, string> = {
  power: "Power (damage)",
  stamina: "Stamina (health)",
  haste: "Haste (signature charges faster)",
  focus: "Focus (more time on targets)"
};

const RARITY_ORDER: readonly Rarity[] = ["common", "uncommon", "rare", "epic", "legendary"];
const RARITY_MULT: Record<Rarity, number> = { common: 1, uncommon: 1.35, rare: 1.8, epic: 2.4, legendary: 3.2 };

const PREFIX: Record<Rarity, readonly string[]> = {
  common: ["Worn", "Scuffed", "Plain", "Rookie's"],
  uncommon: ["Sturdy", "Frosted", "Oiled", "Keen"],
  rare: ["Runed", "Stormforged", "Glacial", "Wolfhide"],
  epic: ["Dragonbone", "Starforged", "Voidwoven", "Emberheart"],
  legendary: ["Mythic", "Kingslayer's", "Eternal", "Worldbreaker"]
};

const BASE: Record<Slot, readonly string[]> = {
  stick: ["Twig", "Stick", "Warblade", "Greatstick"],
  gloves: ["Mitts", "Gauntlets", "Grips"],
  helm: ["Cage", "Helm", "Crown"],
  skates: ["Blades", "Skates", "Striders"],
  charm: ["Puck Charm", "Rune Lace", "Talisman"]
};

const SUFFIX: Record<StatId, readonly string[]> = {
  power: ["of the Bear", "of Might"],
  stamina: ["of the Mammoth", "of Grit"],
  haste: ["of the Hare", "of Quick Hands"],
  focus: ["of the Owl", "of Clear Eyes"]
};

function rollRarity(rng: () => number, luck: number): Rarity {
  const r = rng() / Math.max(0.2, luck);
  if (r < 0.01) return "legendary";
  if (r < 0.06) return "epic";
  if (r < 0.22) return "rare";
  if (r < 0.58) return "uncommon";
  return "common";
}

/** Roll one drop. `luck` above 1 shifts the roll toward better rarities (bosses, three stars). */
export function rollItem(rng: () => number, level: number, luck = 1): Item {
  const slot = pick(rng, SLOTS);
  const rarity = rollRarity(rng, luck);
  const stat = pick(rng, ["power", "stamina", "haste", "focus"] as const);
  const ilvl = Math.max(1, Math.round(level * 5 * RARITY_MULT[rarity] + rng() * 4));
  return {
    id: uid(),
    name: `${pick(rng, PREFIX[rarity])} ${pick(rng, BASE[slot])} ${pick(rng, SUFFIX[stat])}`,
    slot,
    rarity,
    ilvl,
    stat,
    value: Math.max(1, Math.round(ilvl * 0.35))
  };
}

export function rarityRank(rarity: Rarity): number {
  return RARITY_ORDER.indexOf(rarity);
}

export type GearBonus = { power: number; stamina: number; haste: number; focus: number; gearScore: number };

export function gearBonus(gear: Partial<Record<Slot, Item>>): GearBonus {
  const out: GearBonus = { power: 0, stamina: 0, haste: 0, focus: 0, gearScore: 0 };
  for (const slot of SLOTS) {
    const item = gear[slot];
    if (!item) continue;
    out[item.stat] += item.value;
    out.gearScore += item.ilvl;
  }
  return out;
}
