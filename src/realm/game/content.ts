/**
 * Quests, dungeons and raids are data: which creatures appear, in what waves.
 * The creatures' behaviour (and so the hockey each one demands) lives in encounter.ts.
 *
 *  runner     flees the puck; catch it                      -> carrying with eyes up
 *  grunt      swings at what is in front of it              -> dribble beside it, step around the swing
 *  berserker  charges down a lane, stunned if it misses     -> read the lane, move, punish
 *  brute      shield blocks the front                       -> get the puck behind a defender
 *  shaman     casts bolts from range, can be interrupted    -> close the gap, dodge sideways
 *  totem      heals others, immune to the stick             -> pass off a rebounder
 *  wisp       small swarm that dives at the puck            -> loop around them, or dash through
 *  dummy      training post that only one move can hurt     -> clean reps
 */
export type EnemyKind = "runner" | "grunt" | "berserker" | "brute" | "shaman" | "totem" | "wisp" | "dummy" | "boss";

/** The player's moves. A dummy can be limited to one of them. */
export type Move = "strike" | "cleave" | "dash" | "ring" | "bolt";

export type Spawn = { kind: EnemyKind; count?: number; only?: Move };

export type BossAbility = "swing" | "charge" | "bombs" | "volley" | "ward" | "grunts" | "wisps" | "totem";

export type BossDef = { name: string; hp: number; abilities: BossAbility[] };

export type EncounterKind = "quest" | "pull" | "boss" | "raid" | "daily";

export type EncounterDef = {
  id: string;
  name: string;
  kind: EncounterKind;
  level: number;
  /** Shown on the map card. */
  enemy: { name: string; glyph: string };
  story: string;
  /** What this is really training, shown small for the grown-ups. */
  drill: string;
  /** slay: clear every wave. defend: keep the ward alive while clearing them. timed: score reps on the clock. */
  mode: "slay" | "defend" | "timed";
  waves: Spawn[][];
  /** Joins the final wave. */
  boss?: BossDef;
  /** Target clear time for three stars. */
  par: number;
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
  blurb: "A frozen valley where young heroes learn each enemy's tricks.",
  adventures: [
    quest({
      id: "rat-catcher",
      name: "Rat Catcher",
      level: 1,
      enemy: { name: "Cellar Imps", glyph: "🐀" },
      story: "Imps are loose in the tavern cellar and they run from anything. Chase them down!",
      drill: "Carrying the puck after a moving target with eyes on the screen.",
      mode: "slay",
      waves: [[{ kind: "runner", count: 4 }], [{ kind: "runner", count: 6 }]],
      par: 45
    }),
    quest({
      id: "sparring-yard",
      name: "The Sparring Yard",
      level: 1,
      enemy: { name: "Goblin Recruit", glyph: "👺" },
      story: "Warm up on the posts, then the weapon master sends in a live goblin. Hit it — and don't stand in front of its swing.",
      drill: "Quick dribbles beside a target, then moving the puck out of a swing you can see coming.",
      mode: "slay",
      waves: [[{ kind: "dummy", only: "strike" }], [{ kind: "dummy", count: 2, only: "cleave" }], [{ kind: "grunt" }], [{ kind: "grunt", count: 2 }]],
      par: 70
    }),
    quest({
      id: "tusk-chargers",
      name: "Tusk Chargers",
      level: 2,
      enemy: { name: "Goblin Berserkers", glyph: "🐗" },
      story: "Berserkers line you up and charge. Get out of the lane, and they crash into the boards — then make them pay.",
      drill: "Reading a lane and making one quick lateral move, then attacking.",
      mode: "slay",
      waves: [[{ kind: "berserker" }], [{ kind: "berserker", count: 2 }], [{ kind: "berserker" }, { kind: "grunt", count: 2 }]],
      par: 80
    }),
    quest({
      id: "shieldbreakers",
      name: "Shieldbreakers",
      level: 2,
      enemy: { name: "Shield Brutes", glyph: "🛡️" },
      story: "Their shields stop everything from the front. Work the puck around behind them.",
      drill: "Getting the puck around a defender: wide moves and quick changes of side.",
      mode: "slay",
      waves: [[{ kind: "brute" }], [{ kind: "brute" }, { kind: "grunt" }], [{ kind: "brute", count: 2 }]],
      par: 85
    }),
    quest({
      id: "crystal-charge",
      name: "Crystal Charge",
      level: 3,
      enemy: { name: "Mending Totems", glyph: "🗿" },
      story: "The totems heal every goblin near them and no stick can scratch them. Charge the crystals with a pass and let the lightning do it.",
      drill: "Passing off the rebounder under pressure, and catching the return cleanly.",
      mode: "slay",
      waves: [[{ kind: "totem" }, { kind: "grunt" }], [{ kind: "totem" }, { kind: "grunt", count: 2 }], [{ kind: "totem", count: 2 }, { kind: "brute" }]],
      par: 90
    }),
    quest({
      id: "wisps",
      name: "Will-o'-Wisps",
      level: 3,
      enemy: { name: "Marsh Wisps", glyph: "👻" },
      story: "Wisps swarm in packs. Draw a ring around the pack to snuff them all at once — or cut straight through.",
      drill: "Circles and figure-eights around a moving group; fast pulls through a target.",
      mode: "slay",
      waves: [[{ kind: "wisp", count: 5 }], [{ kind: "wisp", count: 7 }], [{ kind: "shaman" }, { kind: "wisp", count: 6 }]],
      par: 75
    }),
    quest({
      id: "hold-the-gate",
      name: "Hold the Gate",
      level: 3,
      enemy: { name: "Goblin Raiders", glyph: "🚪" },
      story: "Raiders are coming for the ward stone from every side. Cut them off before they break it!",
      drill: "Scanning the whole floor, choosing the most urgent threat, and getting there fast.",
      mode: "defend",
      waves: [[{ kind: "grunt", count: 3 }], [{ kind: "grunt", count: 3 }, { kind: "berserker" }], [{ kind: "grunt", count: 4 }, { kind: "shaman" }]],
      par: 90
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
          id: "tunnel-mouth",
          name: "The Tunnel Mouth",
          kind: "pull",
          level: 3,
          enemy: { name: "Tunnel Guards", glyph: "👺" },
          story: "Guards at the tunnel mouth — and a shaman behind them.",
          drill: "Choosing a target: the caster at the back is the real danger.",
          mode: "slay",
          waves: [[{ kind: "grunt", count: 2 }, { kind: "shaman" }], [{ kind: "berserker" }, { kind: "grunt", count: 2 }]],
          par: 75
        },
        {
          id: "shamans-den",
          name: "The Shaman's Den",
          kind: "pull",
          level: 3,
          enemy: { name: "Den Shamans", glyph: "🧙" },
          story: "A totem keeps them alive. Break it first.",
          drill: "Pass under pressure, then get behind a shielded defender.",
          mode: "slay",
          waves: [[{ kind: "totem" }, { kind: "shaman", count: 2 }], [{ kind: "brute" }, { kind: "shaman" }, { kind: "wisp", count: 4 }]],
          par: 90
        },
        {
          id: "grukk",
          name: "Grukk the Puck-Thief",
          kind: "boss",
          level: 4,
          enemy: { name: "Grukk the Puck-Thief", glyph: "👹" },
          story: "Grukk roars and raises the stolen puck!",
          drill: "Everything together: strike, dodge, pass and scan, for two minutes straight.",
          mode: "slay",
          waves: [[]],
          boss: { name: "Grukk the Puck-Thief", hp: 800, abilities: ["swing", "bombs", "swing", "grunts", "charge", "ward"] },
          par: 150
        }
      ]
    }
  ]
};

const EMBERFALL: Zone = {
  id: "emberfall",
  name: "Emberfall Wastes",
  levels: "Levels 4–8",
  blurb: "Bigger packs, smarter enemies. Nothing here waits for you to look down.",
  adventures: [
    quest({
      id: "ambush",
      name: "Ambush at the Ford",
      level: 4,
      enemy: { name: "Ember Raiders", glyph: "🔥" },
      story: "Chargers from the flanks and casters on the ridge. Keep your head on a swivel.",
      drill: "Dodging two kinds of attack at once while keeping the puck moving.",
      mode: "slay",
      waves: [[{ kind: "berserker", count: 2 }, { kind: "shaman" }], [{ kind: "shaman", count: 2 }, { kind: "grunt", count: 2 }], [{ kind: "berserker", count: 2 }, { kind: "shaman", count: 2 }]],
      par: 100
    }),
    quest({
      id: "shield-wall",
      name: "The Shield Wall",
      level: 5,
      enemy: { name: "Iron Brutes", glyph: "🛡️" },
      story: "Three shields and a totem behind them. Lightning cracks a shield wide open.",
      drill: "Pass to break the shield, then attack from behind while it is down.",
      mode: "slay",
      waves: [[{ kind: "brute", count: 2 }, { kind: "totem" }], [{ kind: "brute", count: 3 }, { kind: "totem" }]],
      par: 110
    }),
    quest({
      id: "swarm",
      name: "The Swarm",
      level: 5,
      enemy: { name: "Cinder Wisps", glyph: "✨" },
      story: "The wisps never stop coming. Ring them, cut them, keep moving.",
      drill: "Continuous circles and cuts at speed.",
      mode: "slay",
      waves: [[{ kind: "wisp", count: 8 }], [{ kind: "wisp", count: 8 }, { kind: "berserker" }], [{ kind: "wisp", count: 10 }, { kind: "shaman", count: 2 }]],
      par: 95
    }),
    quest({
      id: "last-stand",
      name: "Last Stand at the Forge",
      level: 6,
      enemy: { name: "Forge Raiders", glyph: "⚒️" },
      story: "They want the forge ward. Four waves. Not one of them gets through.",
      drill: "Sustained scanning and sprint-to-intercept under fatigue.",
      mode: "defend",
      waves: [
        [{ kind: "grunt", count: 4 }],
        [{ kind: "grunt", count: 3 }, { kind: "brute" }],
        [{ kind: "grunt", count: 4 }, { kind: "shaman", count: 2 }],
        [{ kind: "brute", count: 2 }, { kind: "berserker", count: 2 }]
      ],
      par: 130
    }),
    {
      id: "embermaw-forge",
      name: "Dungeon: Embermaw Forge",
      kind: "dungeon",
      level: 6,
      blurb: "Deep in the forge waits Warlord Embermaw, who melts goalposts for fun.",
      shiftSeconds: 45,
      encounters: [
        {
          id: "forge-guards",
          name: "Forge Guards",
          kind: "pull",
          level: 6,
          enemy: { name: "Forge Guards", glyph: "🛡️" },
          story: "Shields at the gate, chargers behind.",
          drill: "Getting behind defenders while a charger lines you up.",
          mode: "slay",
          waves: [[{ kind: "brute", count: 2 }, { kind: "berserker" }], [{ kind: "brute" }, { kind: "berserker", count: 2 }, { kind: "grunt", count: 2 }]],
          par: 95
        },
        {
          id: "flame-callers",
          name: "The Flame Callers",
          kind: "pull",
          level: 6,
          enemy: { name: "Flame Callers", glyph: "🧝" },
          story: "Three casters, two totems. Break the totems or this never ends.",
          drill: "Passing while dodging ranged attacks.",
          mode: "slay",
          waves: [[{ kind: "totem", count: 2 }, { kind: "shaman", count: 3 }], [{ kind: "shaman", count: 2 }, { kind: "wisp", count: 8 }]],
          par: 100
        },
        {
          id: "embermaw",
          name: "Warlord Embermaw",
          kind: "boss",
          level: 7,
          enemy: { name: "Warlord Embermaw", glyph: "🐲" },
          story: "The warlord wakes.",
          drill: "Full routine at game pace with every attack live.",
          mode: "slay",
          waves: [[]],
          boss: { name: "Warlord Embermaw", hp: 1200, abilities: ["volley", "charge", "bombs", "wisps", "swing", "ward", "charge", "totem"] },
          par: 190
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
          enemy: { name: "The Lich Goalie", glyph: "💀" },
          story: "A thousand-year shutout ends tonight.",
          drill: "Hard 40-second shifts with full rest, like a real game.",
          mode: "slay",
          waves: [[{ kind: "grunt", count: 2 }]],
          boss: { name: "The Lich Goalie", hp: 2600, abilities: ["volley", "grunts", "swing", "ward", "bombs", "charge", "totem", "wisps", "volley", "charge"] },
          par: 330
        }
      ]
    }
  ]
};

export const ZONES: readonly Zone[] = [FROSTMERE, EMBERFALL, CITADEL];

function rep(id: string, name: string, drill: string, wave: Spawn[]): EncounterDef {
  return {
    id,
    name,
    kind: "daily",
    level: 1,
    enemy: { name: "Training Posts", glyph: "🪵" },
    story: name,
    drill,
    mode: "timed",
    waves: [wave],
    par: 55,
    timeLimit: 55
  };
}

/**
 * The daily routine: five one-minute blocks on training posts that can only be
 * hurt by one move each, so every block is clean reps of one pattern.
 */
export const DAILY: Adventure = {
  id: "daily-vigil",
  name: "The Five-Minute Vigil",
  kind: "daily",
  level: 1,
  blurb: "Five one-minute blocks on the training posts. Do it every day to keep your streak burning.",
  encounters: [
    rep("daily-narrow", "Quick Hands", "Narrow dribble right beside the post: as many soft touches as you can.", [{ kind: "dummy", only: "strike" }]),
    rep("daily-wide", "Wide Reach", "Wide dribble between the two posts: full extension, hit both.", [{ kind: "dummy", count: 2, only: "cleave" }]),
    rep("daily-pull", "Pull and Push", "Pull the puck through the post and push it back, fast.", [{ kind: "dummy", only: "dash" }]),
    rep("daily-eight", "Figure Eights", "Loop the puck around each post in turn.", [{ kind: "dummy", count: 2, only: "ring" }]),
    rep("daily-pass", "Give and Go", "Pass off a crystal, catch it clean, go again.", [{ kind: "dummy", only: "bolt" }])
  ]
};

export function allAdventures(): Adventure[] {
  return [...ZONES.flatMap((zone) => zone.adventures), DAILY];
}
