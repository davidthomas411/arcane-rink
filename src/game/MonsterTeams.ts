export type MonsterTeam = {
  id: string;
  name: string;
  shortName: string;
  title: string;
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
    offenseRate: 1,
    counterSpikeOnMiss: 1,
    playerGoalThreshold: 1,
    enemyGoalThreshold: 1,
    playerTakeawayThreshold: 0.78,
    gateAggression: 0.9,
    comebackBias: 0.82
  }
] as const;

export const DEFAULT_MONSTER_TEAM: MonsterTeam = MONSTER_TEAMS[0];
