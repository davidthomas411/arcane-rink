/**
 * All quests, dungeons and raids are data. Each one is a list of "offense" tasks
 * (how the hero deals damage — these are the hockey reps) and "hazards"
 * (things on the TV the hero must react to — these keep the head up).
 */
export type OffenseDef =
  /** Carry the puck to runes that appear around the floor. */
  | { kind: "runes"; count: number }
  /** Dribble between two pads. Small spacing = quick hands, large = wide reach, axis y = pull/push. */
  | { kind: "twin"; reps: number; spacing: number; axis: "x" | "y" | "diag" }
  /** Figure-eight around two pillars. */
  | { kind: "weave"; loops: number }
  /** Pass off the lit rebounder. */
  | { kind: "bolt"; count: number }
  /** Settle the puck dead still inside a small circle. */
  | { kind: "hold"; count: number };

export type HazardDef =
  /** A blast lands where the puck is: move it out. */
  | { kind: "fire"; every: number }
  /** A wall sweeps the floor: get the puck into the gap. */
  | { kind: "wave"; every: number }
  /** A wisp hunts the puck: keep it moving. */
  | { kind: "chaser"; every: number }
  /** The enemy shows a symbol on its cast bar: find the matching stone. */
  | { kind: "cast"; every: number };

export type EncounterKind = "quest" | "pull" | "boss" | "raid" | "daily";

export type EncounterDef = {
  id: string;
  name: string;
  kind: EncounterKind;
  level: number;
  enemy: { name: string; glyph: string; hp: number };
  /** Quest text shown to the kids. */
  story: string;
  /** What this is really training, shown small for the grown-ups. */
  drill: string;
  offense: OffenseDef[];
  hazards: HazardDef[];
  /** Target clear time for three stars. */
  par: number;
  /** If set, the encounter is a timed rep block instead of a health race. */
  timeLimit?: number;
};

export type Adventure = {
  id: string;
  name: string;
  kind: "quest" | "dungeon" | "raid" | "daily";
  level: number;
  blurb: string;
  encounters: EncounterDef[];
  /** With more than one hero, swap who is on the floor this often (seconds). */
  shiftSeconds?: number;
};

export type Zone = { id: string; name: string; levels: string; blurb: string; adventures: Adventure[] };

function quest(def: Omit<EncounterDef, "kind">): Adventure {
  return { id: def.id, name: def.name, kind: "quest", level: def.level, blurb: def.story, encounters: [{ ...def, kind: "quest" }] };
}

const FROSTMERE: Zone = {
  id: "frostmere",
  name: "Frostmere Vale",
  levels: "Levels 1–4",
  blurb: "A frozen valley where young heroes learn to keep their eyes on the horizon.",
  adventures: [
    quest({
      id: "rat-catcher",
      name: "Rat Catcher",
      level: 1,
      enemy: { name: "Cellar Rats", glyph: "🐀", hp: 240 },
      story: "Rats are raiding the tavern cellar! Chase each one down before it scurries off.",
      drill: "Carrying the puck to a spot while watching the screen, not the puck.",
      offense: [{ kind: "runes", count: 6 }],
      hazards: [],
      par: 40
    }),
    quest({
      id: "quick-hands",
      name: "Quick Hands",
      level: 1,
      enemy: { name: "Training Dummy", glyph: "🪵", hp: 290 },
      story: "The weapon master wants to see fast hands. Strike the twin runes, back and forth!",
      drill: "Narrow side-to-side dribble: soft, quick touches in front of the body.",
      offense: [{ kind: "twin", reps: 12, spacing: 1.1, axis: "x" }, { kind: "runes", count: 2 }],
      hazards: [],
      par: 45
    }),
    quest({
      id: "wide-reach",
      name: "The Long Reach",
      level: 2,
      enemy: { name: "Frost Boar", glyph: "🐗", hp: 370 },
      story: "A boar is charging through the snow. Swing wide to turn it aside!",
      drill: "Wide dribble: full reach to each side, rolling the wrists.",
      offense: [{ kind: "twin", reps: 10, spacing: 3.2, axis: "x" }, { kind: "runes", count: 3 }],
      hazards: [{ kind: "fire", every: 9 }],
      par: 60
    }),
    quest({
      id: "pull-push",
      name: "Pull and Push",
      level: 2,
      enemy: { name: "Ice Imp", glyph: "😈", hp: 370 },
      story: "The imp only fears the pull-and-push. Drag it close, shove it away!",
      drill: "Front-to-back dribble: pull the puck in toward the feet and push it out.",
      offense: [{ kind: "twin", reps: 10, spacing: 2.2, axis: "y" }, { kind: "hold", count: 1 }],
      hazards: [{ kind: "fire", every: 8 }],
      par: 60
    }),
    quest({
      id: "crystal-charge",
      name: "Crystal Charge",
      level: 3,
      enemy: { name: "Wandering Wisp", glyph: "👻", hp: 420 },
      story: "The wisp can only be struck by crystal lightning. Charge the crystals with a pass!",
      drill: "Passing off the rebounder and catching the return cleanly.",
      offense: [{ kind: "bolt", count: 4 }, { kind: "runes", count: 2 }],
      hazards: [{ kind: "fire", every: 10 }],
      par: 65
    }),
    quest({
      id: "serpent-path",
      name: "Serpent's Path",
      level: 3,
      enemy: { name: "Ice Serpent", glyph: "🐍", hp: 440 },
      story: "Bind the serpent by weaving a knot around the two standing stones.",
      drill: "Figure-eights: forehand and backhand turns around two points.",
      offense: [{ kind: "weave", loops: 4 }, { kind: "runes", count: 2 }],
      hazards: [{ kind: "chaser", every: 14 }],
      par: 70
    }),
    {
      id: "goblin-deeps",
      name: "Dungeon: The Goblin Deeps",
      kind: "dungeon",
      level: 3,
      blurb: "Grukk the Puck-Thief has stolen the village's enchanted puck. Fight through his tunnels to win it back.",
      shiftSeconds: 45,
      encounters: [
        {
          id: "goblin-scouts",
          name: "Goblin Scouts",
          kind: "pull",
          level: 3,
          enemy: { name: "Goblin Scouts", glyph: "👺", hp: 370 },
          story: "Scouts guard the tunnel mouth.",
          drill: "Carry + react: move the puck out of danger on a visual cue.",
          offense: [{ kind: "runes", count: 5 }, { kind: "twin", reps: 8, spacing: 1.2, axis: "x" }],
          hazards: [{ kind: "fire", every: 6 }],
          par: 55
        },
        {
          id: "goblin-shaman",
          name: "Goblin Shaman",
          kind: "pull",
          level: 3,
          enemy: { name: "Goblin Shaman", glyph: "🧙", hp: 440 },
          story: "The shaman is chanting — read his spell and break it!",
          drill: "Scanning: read a symbol on the screen, then find it while handling.",
          offense: [{ kind: "twin", reps: 8, spacing: 2.6, axis: "x" }, { kind: "bolt", count: 2 }],
          hazards: [{ kind: "cast", every: 13 }],
          par: 65
        },
        {
          id: "grukk",
          name: "Grukk the Puck-Thief",
          kind: "boss",
          level: 4,
          enemy: { name: "Grukk the Puck-Thief", glyph: "👹", hp: 1000 },
          story: "Grukk roars and raises the stolen puck!",
          drill: "Everything together: carry, dribble, pass, dodge and scan.",
          offense: [
            { kind: "runes", count: 4 },
            { kind: "bolt", count: 2 },
            { kind: "twin", reps: 8, spacing: 3, axis: "x" },
            { kind: "weave", loops: 2 }
          ],
          hazards: [{ kind: "fire", every: 7 }, { kind: "cast", every: 17 }, { kind: "wave", every: 23 }],
          par: 130
        }
      ]
    }
  ]
};

const EMBERFALL: Zone = {
  id: "emberfall",
  name: "Emberfall Wastes",
  levels: "Levels 4–8",
  blurb: "Rivers of fire and clever enemies. Nothing here waits for you to look down.",
  adventures: [
    quest({
      id: "lava-hop",
      name: "Lava Hop",
      level: 4,
      enemy: { name: "Magma Slimes", glyph: "🌋", hp: 510 },
      story: "The ground is splitting! Dash between the safe stones as the lava rolls in.",
      drill: "Carrying at speed with constant scanning for the next safe lane.",
      offense: [{ kind: "runes", count: 5 }, { kind: "hold", count: 1 }],
      hazards: [{ kind: "wave", every: 9 }, { kind: "fire", every: 6 }],
      par: 75
    }),
    quest({
      id: "ember-duel",
      name: "Ember Duel",
      level: 5,
      enemy: { name: "Cinder Duelist", glyph: "🤺", hp: 550 },
      story: "The duelist mirrors every move. Cross him up with diagonal cuts!",
      drill: "Diagonal dribbles: forehand-out to backhand-in and back.",
      offense: [{ kind: "twin", reps: 10, spacing: 2.6, axis: "diag" }, { kind: "twin", reps: 10, spacing: 1.1, axis: "x" }],
      hazards: [{ kind: "cast", every: 12 }],
      par: 75
    }),
    quest({
      id: "forge-bellows",
      name: "Forge Bellows",
      level: 5,
      enemy: { name: "Forge Golem", glyph: "🗿", hp: 570 },
      story: "Pump the crystals to overheat the golem — then stand perfectly still as it cools.",
      drill: "Pass, receive, and settle the puck dead: soft hands on the catch.",
      offense: [{ kind: "bolt", count: 3 }, { kind: "hold", count: 1 }],
      hazards: [{ kind: "fire", every: 7 }],
      par: 80
    }),
    quest({
      id: "cinder-hounds",
      name: "Cinder Hounds",
      level: 6,
      enemy: { name: "Cinder Hounds", glyph: "🐺", hp: 620 },
      story: "The hounds never stop hunting. Weave through the stones and never let them catch you.",
      drill: "Puck protection: keep the puck moving away from pressure.",
      offense: [{ kind: "weave", loops: 3 }, { kind: "runes", count: 4 }],
      hazards: [{ kind: "chaser", every: 8 }, { kind: "fire", every: 9 }],
      par: 85
    }),
    {
      id: "embermaw-forge",
      name: "Dungeon: Embermaw Forge",
      kind: "dungeon",
      level: 6,
      blurb: "Deep in the forge sleeps Embermaw, the dragon who melts goalposts for fun.",
      shiftSeconds: 45,
      encounters: [
        {
          id: "forge-guards",
          name: "Forge Guards",
          kind: "pull",
          level: 6,
          enemy: { name: "Forge Guards", glyph: "🛡️", hp: 570 },
          story: "Two guards block the gate.",
          drill: "Wide dribbles under pressure.",
          offense: [{ kind: "twin", reps: 10, spacing: 3.2, axis: "x" }, { kind: "runes", count: 4 }],
          hazards: [{ kind: "chaser", every: 9 }, { kind: "fire", every: 7 }],
          par: 70
        },
        {
          id: "flame-caller",
          name: "Flame Caller",
          kind: "pull",
          level: 6,
          enemy: { name: "Flame Caller", glyph: "🧝", hp: 620 },
          story: "She is summoning something. Break every spell!",
          drill: "Read-and-react while passing.",
          offense: [{ kind: "bolt", count: 3 }, { kind: "twin", reps: 8, spacing: 2.2, axis: "y" }],
          hazards: [{ kind: "cast", every: 10 }, { kind: "wave", every: 15 }],
          par: 75
        },
        {
          id: "embermaw",
          name: "Embermaw",
          kind: "boss",
          level: 7,
          enemy: { name: "Embermaw the Molten", glyph: "🐲", hp: 1500 },
          story: "The dragon wakes.",
          drill: "Full routine at game pace with every hazard live.",
          offense: [
            { kind: "bolt", count: 3 },
            { kind: "weave", loops: 3 },
            { kind: "twin", reps: 10, spacing: 2.6, axis: "diag" },
            { kind: "runes", count: 5 },
            { kind: "hold", count: 1 }
          ],
          hazards: [{ kind: "fire", every: 5.5 }, { kind: "cast", every: 14 }, { kind: "wave", every: 17 }, { kind: "chaser", every: 21 }],
          par: 170
        }
      ]
    }
  ]
};

const CITADEL: Zone = {
  id: "citadel",
  name: "Frostveil Citadel",
  levels: "Level 6+ · Party raid",
  blurb: "Bring the whole party. Heroes tag in and out while the boss never rests.",
  adventures: [
    {
      id: "lich-goalie",
      name: "Raid: The Lich Goalie",
      kind: "raid",
      level: 6,
      blurb: "No one has scored on the Lich Goalie in a thousand years. Take shifts, wear him down, and end the shutout.",
      shiftSeconds: 40,
      encounters: [
        {
          id: "lich-goalie-boss",
          name: "The Lich Goalie",
          kind: "raid",
          level: 8,
          enemy: { name: "The Lich Goalie", glyph: "💀", hp: 3200 },
          story: "A thousand-year shutout ends tonight.",
          drill: "Hard 40-second shifts with full rest, like a real game.",
          offense: [
            { kind: "bolt", count: 3 },
            { kind: "runes", count: 5 },
            { kind: "twin", reps: 10, spacing: 3.2, axis: "x" },
            { kind: "weave", loops: 3 },
            { kind: "twin", reps: 10, spacing: 2.2, axis: "y" }
          ],
          hazards: [{ kind: "fire", every: 5 }, { kind: "cast", every: 13 }, { kind: "wave", every: 16 }, { kind: "chaser", every: 19 }],
          par: 300
        }
      ]
    }
  ]
};

export const ZONES: readonly Zone[] = [FROSTMERE, EMBERFALL, CITADEL];

function rep(id: string, name: string, drill: string, offense: OffenseDef[]): EncounterDef {
  return {
    id,
    name,
    kind: "daily",
    level: 1,
    enemy: { name: "Training Golem", glyph: "🗿", hp: 9999 },
    story: name,
    drill,
    offense,
    hazards: [],
    par: 55,
    timeLimit: 55
  };
}

/**
 * The daily routine: five one-minute blocks covering the staples of a short
 * at-home stickhandling session. No hazards — just clean reps with eyes on the screen.
 */
export const DAILY: Adventure = {
  id: "daily-vigil",
  name: "The Five-Minute Vigil",
  kind: "daily",
  level: 1,
  blurb: "Five one-minute blocks. Do it every day to keep your streak burning.",
  shiftSeconds: undefined,
  encounters: [
    rep("daily-narrow", "Quick Hands", "Narrow dribble, as many soft touches as you can.", [{ kind: "twin", reps: 999, spacing: 1.1, axis: "x" }]),
    rep("daily-wide", "Wide Reach", "Wide dribble, full extension both sides.", [{ kind: "twin", reps: 999, spacing: 3.2, axis: "x" }]),
    rep("daily-pull", "Pull and Push", "Front-to-back on forehand and backhand side.", [{ kind: "twin", reps: 999, spacing: 2.2, axis: "y" }]),
    rep("daily-eight", "Figure Eights", "Figure-eights around the two stones.", [{ kind: "weave", loops: 999 }]),
    rep("daily-pass", "Give and Go", "Pass off the crystal, catch, carry to the rune.", [{ kind: "bolt", count: 1 }, { kind: "runes", count: 1 }])
  ]
};

export function allAdventures(): Adventure[] {
  return [...ZONES.flatMap((zone) => zone.adventures), DAILY];
}
