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
  mods: { touch: number; carry: number; pass: number; pattern: number; hp: number; fuse: number };
};

export const CLASSES: Record<ClassId, ClassDef> = {
  warrior: {
    id: "warrior",
    name: "Blademaster",
    glyph: "⚔️",
    color: "#c8553d",
    focus: "Hard, flat passes and wide, strong dribbles",
    powerName: "Rage",
    signature: { name: "Thunder Shot", kind: "hardPass", hint: "Rip a HARD pass off a crystal" },
    passive: "Passes hit 40% harder. Extra health.",
    mods: { touch: 1, carry: 1, pass: 1.4, pattern: 1, hp: 1.2, fuse: 1 }
  },
  mage: {
    id: "mage",
    name: "Frost Mage",
    glyph: "🔮",
    color: "#6fa8dc",
    focus: "Figure-eights, circles and smooth puck patterns",
    powerName: "Mana",
    signature: { name: "Arcane Ring", kind: "circle", hint: "Draw a full circle with the puck" },
    passive: "Weaves and twin runes hit 40% harder.",
    mods: { touch: 1, carry: 1, pass: 1, pattern: 1.4, hp: 0.95, fuse: 1 }
  },
  rogue: {
    id: "rogue",
    name: "Shadow Rogue",
    glyph: "🗡️",
    color: "#b58bd6",
    focus: "Fast hands and quick escapes",
    powerName: "Energy",
    signature: { name: "Flurry", kind: "flurry", hint: "7 lightning-quick dribbles" },
    passive: "Every dribble hits twice as hard. More time to dodge.",
    mods: { touch: 2, carry: 1, pass: 1, pattern: 1, hp: 1, fuse: 1.25 }
  },
  ranger: {
    id: "ranger",
    name: "Rune Ranger",
    glyph: "🏹",
    color: "#7fb069",
    focus: "Give-and-go: pass, catch clean, move",
    powerName: "Focus",
    signature: { name: "Volley", kind: "quickPass", hint: "Pass and catch it clean, fast" },
    passive: "Rune hits and clean catches hit 30% harder.",
    mods: { touch: 1, carry: 1.3, pass: 1.15, pattern: 1, hp: 1, fuse: 1 }
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
