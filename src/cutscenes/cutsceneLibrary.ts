import type { CutsceneDefinition, StoryContext } from "./types";

export const ESCAPE_SEAL_GOAL = 7;

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function escapeProgressLine(matchWins: number): string {
  const seals = clamp(matchWins, 0, ESCAPE_SEAL_GOAL);
  const remaining = Math.max(0, ESCAPE_SEAL_GOAL - seals);
  if (remaining <= 0) {
    return `Escape seals forged ${seals}/${ESCAPE_SEAL_GOAL}. The arena lock is weakening.`;
  }
  return `Escape seals forged ${seals}/${ESCAPE_SEAL_GOAL}. ${remaining} more win${remaining === 1 ? "" : "s"} to break the lock.`;
}

function betweenMatchLeadLine(context: StoryContext): string {
  if (context.lastMatchResult === "win") {
    return "You carved another seal into the ice gate.";
  }
  if (context.lastMatchResult === "breach") {
    return "The seal shattered and the gate fed on fear.";
  }
  if (context.lastMatchResult === "loss") {
    return "The monsters held this shift, but the pact still stands.";
  }
  if (context.lastMatchResult === "tie") {
    return "No side claimed the horn. The gate remains restless.";
  }
  return "The gate stirs again beneath the rink.";
}

export function createOpeningCutscene(context: StoryContext): CutsceneDefinition {
  return {
    id: "OPENING_FIRST_LAUNCH",
    skippable: true,
    autoAdvanceFinalPanel: true,
    baseWpm: 200,
    panels: [
      {
        eyebrow: "After Practice",
        title: "How The Lock Began",
        rsvpText: "The lights died, the horn sounded, and the arena sealed itself around you.",
        supportText: "The monsters are not a team. They are the lock-keepers.",
        tone: "OMEN",
        wpmStart: 170,
        wpmEnd: 198
      },
      {
        eyebrow: "Rinkbound Pact",
        title: "Why The Trials Matter",
        rsvpText: `${context.playerName}, every clean rune-gate hit carves seal marks. Misses feed pressure. If Arcane Shield breaks, the gate feeds and resets your climb.`,
        supportText: "Offense forges escape marks. Defense protects the shield.",
        tone: "TRIAL",
        wpmStart: 196,
        wpmEnd: 236
      },
      {
        eyebrow: "Escape Condition",
        title: "Break The Arena Lock",
        rsvpText: `Win matches against ${context.monsterName} and forge seven escape seals. When the seventh seal ignites, the doors open and you get out.`,
        supportText: `${escapeProgressLine(context.matchWins)} Stay sharp as the pace rises.`,
        tone: "VICTORY",
        wpmStart: 230,
        wpmEnd: 292
      }
    ]
  };
}

export function createBetweenMatchCutscene(context: StoryContext): CutsceneDefinition {
  return {
    id: "BETWEEN_MATCH",
    skippable: true,
    autoAdvanceFinalPanel: false,
    finalButtonLabel: "Begin Trial",
    baseWpm: 210,
    panels: [
      {
        eyebrow: "Intermission",
        title: "The Gate Stirs Again",
        rsvpText: `${betweenMatchLeadLine(context)} Another horn. Another seal on the line.`,
        supportText: `${escapeProgressLine(context.matchWins)} Next up: ${context.monsterName}.`,
        tone: context.lastMatchResult === "win" ? "VICTORY" : context.lastMatchResult === "breach" ? "PRESSURE" : "TRIAL",
        wpmStart: 198,
        wpmEnd: 252
      }
    ]
  };
}
