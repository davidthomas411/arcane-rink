export type CutsceneId = "OPENING_FIRST_LAUNCH" | "BETWEEN_MATCH";

export type CutsceneTone = "OMEN" | "TRIAL" | "PRESSURE" | "VICTORY";

export type CutscenePanel = {
  eyebrow: string;
  title: string;
  rsvpText: string;
  supportText?: string;
  tone: CutsceneTone;
  wpmStart?: number;
  wpmEnd?: number;
};

export type CutsceneDefinition = {
  id: CutsceneId;
  skippable: boolean;
  autoAdvanceFinalPanel: boolean;
  finalButtonLabel?: string;
  baseWpm: number;
  panels: readonly CutscenePanel[];
};

export type StoryContext = {
  playerName: string;
  monsterName: string;
  runCount: number;
  matchWins: number;
  lastMatchResult: "win" | "loss" | "tie" | "breach" | null;
};
