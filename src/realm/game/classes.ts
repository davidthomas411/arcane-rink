export type ClassId = "warrior" | "mage" | "rogue" | "ranger";

export type SignatureKind = "hardPass" | "circle" | "flurry" | "quickPass";

export type ClassDef = {
  id: ClassId;
  name: string;
  glyph: string;
  color: string;
  /** The hockey habit this class rewards. */
  focus: string;
  powerName: string;
  signature: { name: string; kind: SignatureKind; hint: string };
  passive: string;
  /** Damage multipliers per verb, plus health and the bonus for striking from behind. */
  mods: { strike: number; dash: number; bolt: number; ring: number; hp: number; backstab: number };
};

export const CLASSES: Record<ClassId, ClassDef> = {
  warrior: {
    id: "warrior",
    name: "Blademaster",
    glyph: "⚔️",
    color: "#c8553d",
    focus: "Hard passes and strong, wide dribbles",
    powerName: "Rage",
    signature: { name: "Thunder Shot", kind: "hardPass", hint: "Rip a HARD pass off a crystal" },
    passive: "Bolts and wide cleaves hit hard. Extra health.",
    mods: { strike: 1.15, dash: 1, bolt: 1.4, ring: 1, hp: 1.25, backstab: 1.5 }
  },
  mage: {
    id: "mage",
    name: "Frost Mage",
    glyph: "🔮",
    color: "#6fa8dc",
    focus: "Circles, figure-eights and smooth patterns",
    powerName: "Mana",
    signature: { name: "Blizzard", kind: "circle", hint: "Draw a full circle with the puck" },
    passive: "Rings hit harder and freeze longer.",
    mods: { strike: 1, dash: 1, bolt: 1.15, ring: 1.7, hp: 0.95, backstab: 1.5 }
  },
  rogue: {
    id: "rogue",
    name: "Shadow Rogue",
    glyph: "🗡️",
    color: "#b58bd6",
    focus: "Fast hands and getting around a defender",
    powerName: "Energy",
    signature: { name: "Shadow Flurry", kind: "flurry", hint: "7 lightning-quick dribbles" },
    passive: "Strikes from behind hit far harder. Dashes cut deeper.",
    mods: { strike: 1.1, dash: 1.4, bolt: 1, ring: 1, hp: 1, backstab: 2.2 }
  },
  ranger: {
    id: "ranger",
    name: "Rune Ranger",
    glyph: "🏹",
    color: "#7fb069",
    focus: "Give-and-go: pass, catch clean, move",
    powerName: "Focus",
    signature: { name: "Volley", kind: "quickPass", hint: "Pass and catch it clean, fast" },
    passive: "Bolts chain to more enemies. A clean catch empowers the next hit.",
    mods: { strike: 1, dash: 1.1, bolt: 1.3, ring: 1.1, hp: 1, backstab: 1.5 }
  }
};

export const CLASS_LIST: readonly ClassDef[] = [CLASSES.warrior, CLASSES.mage, CLASSES.rogue, CLASSES.ranger];

export type TierId = "rookie" | "skilled" | "elite";

export type TierDef = {
  id: TierId;
  name: string;
  blurb: string;
  targetRadius: number;
  fuse: number;
  chaserSpeed: number;
  castTime: number;
  passMinSpeed: number;
  enemyHp: number;
};

/** Difficulty is per hero so siblings of different ages can share a party. */
export const TIERS: Record<TierId, TierDef> = {
  rookie: { id: "rookie", name: "Rookie", blurb: "Bigger targets, more time", targetRadius: 0.8, fuse: 2.4, chaserSpeed: 2.2, castTime: 7, passMinSpeed: 4, enemyHp: 0.8 },
  skilled: { id: "skilled", name: "Skilled", blurb: "Standard challenge", targetRadius: 0.62, fuse: 1.8, chaserSpeed: 3.2, castTime: 5.5, passMinSpeed: 6, enemyHp: 1 },
  elite: { id: "elite", name: "Elite", blurb: "Small targets, fast enemies", targetRadius: 0.48, fuse: 1.35, chaserSpeed: 4.4, castTime: 4.2, passMinSpeed: 8, enemyHp: 1.25 }
};

export const TIER_LIST: readonly TierDef[] = [TIERS.rookie, TIERS.skilled, TIERS.elite];
