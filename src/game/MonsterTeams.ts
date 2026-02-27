export type MonsterTeam = {
  id: string;
  name: string;
  shortName: string;
  title: string;
  minRun: number;
  archetype: "UNDEAD" | "INFERNAL" | "FROST" | "SHADOW";
  scoutingReport: string;
  gearLabel: string;
  offenseRate: number;
  counterSpikeOnMiss: number;
  playerGoalThreshold: number;
  enemyGoalThreshold: number;
  playerTakeawayThreshold: number;
  gateAggression: number;
  comebackBias: number;
};

export const MONSTER_TEAMS: readonly MonsterTeam[] = [
  {
    id: "CRYPTFANG_GHOULS",
    name: "Cryptfang Ghouls",
    shortName: "Ghouls",
    title: "Cryptfang",
    minRun: 0,
    archetype: "UNDEAD",
    scoutingReport: "Balanced pressure. Punishes late hits but gives readable gates.",
    gearLabel: "Bone mask • Hook stick",
    offenseRate: 1,
    counterSpikeOnMiss: 1,
    playerGoalThreshold: 1,
    enemyGoalThreshold: 1,
    playerTakeawayThreshold: 0.78,
    gateAggression: 0.9,
    comebackBias: 0.82
  },
  {
    id: "EMBERMAW_REAVERS",
    name: "Embermaw Reavers",
    shortName: "Reavers",
    title: "Embermaw",
    minRun: 3,
    archetype: "INFERNAL",
    scoutingReport: "High-tempo rush team. Gates drift faster when they gain momentum.",
    gearLabel: "Cinder visor • Serrated stick",
    offenseRate: 1.08,
    counterSpikeOnMiss: 1.08,
    playerGoalThreshold: 1.05,
    enemyGoalThreshold: 0.93,
    playerTakeawayThreshold: 0.84,
    gateAggression: 1.08,
    comebackBias: 0.96
  },
  {
    id: "FROSTVEIL_WARDENS",
    name: "Frostveil Wardens",
    shortName: "Wardens",
    title: "Frostveil",
    minRun: 7,
    archetype: "FROST",
    scoutingReport: "Disciplined defenders. Longer possessions and tougher goal windows.",
    gearLabel: "Rime helm • Guard stick",
    offenseRate: 0.94,
    counterSpikeOnMiss: 0.9,
    playerGoalThreshold: 1.11,
    enemyGoalThreshold: 1.03,
    playerTakeawayThreshold: 0.75,
    gateAggression: 0.84,
    comebackBias: 0.72
  },
  {
    id: "NIGHTVEIL_STALKERS",
    name: "Nightveil Stalkers",
    shortName: "Stalkers",
    title: "Nightveil",
    minRun: 11,
    archetype: "SHADOW",
    scoutingReport: "Trickster style. Swingy comeback surges and deceptive lane pressure.",
    gearLabel: "Shade cowl • Fang curve",
    offenseRate: 1.03,
    counterSpikeOnMiss: 1.12,
    playerGoalThreshold: 1.07,
    enemyGoalThreshold: 0.97,
    playerTakeawayThreshold: 0.82,
    gateAggression: 1.14,
    comebackBias: 1.06
  }
] as const;

export const DEFAULT_MONSTER_TEAM: MonsterTeam = MONSTER_TEAMS[0];

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function unlockedMonsterTeamsForRun(completedRuns: number): MonsterTeam[] {
  const safeRuns = Math.max(0, Math.floor(completedRuns));
  const unlocked = MONSTER_TEAMS.filter((team) => team.minRun <= safeRuns);
  return unlocked.length > 0 ? [...unlocked] : [DEFAULT_MONSTER_TEAM];
}

export function selectMonsterTeamForRun(
  completedRuns: number,
  options?: { trainingMode?: boolean; spellDemoMode?: boolean }
): MonsterTeam {
  if (options?.trainingMode || options?.spellDemoMode) {
    return DEFAULT_MONSTER_TEAM;
  }
  const unlocked = unlockedMonsterTeamsForRun(completedRuns);
  if (unlocked.length <= 1) {
    return unlocked[0] ?? DEFAULT_MONSTER_TEAM;
  }

  // Deterministic variety for run-to-run matchup rotation.
  const safeRuns = Math.max(0, Math.floor(completedRuns));
  const fractional = (safeRuns + 1) * 0.61803398875;
  const index = clamp(Math.floor((fractional - Math.floor(fractional)) * unlocked.length), 0, unlocked.length - 1);
  return unlocked[index] ?? DEFAULT_MONSTER_TEAM;
}
