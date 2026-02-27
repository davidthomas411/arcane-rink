export const THREAT_EVENT_INTERVAL_RUNS = 5;
export const BREACH_UNLOCK_RUNS = 5;

export type ThreatProgressionState = {
  completedRuns: number;
  threatTier: number;
  escalationTier: number;
  breachEnabled: boolean;
  rookieWardActive: boolean;
  nextThreatMilestoneRuns: number;
  runsUntilBreachUnlock: number;
};

export type ThreatEventMilestone = {
  completedRuns: number;
  threatTier: number;
  escalationTier: number;
  unlocksBreach: boolean;
};

function clampInt(value: number): number {
  return Math.max(0, Math.floor(Number.isFinite(value) ? value : 0));
}

export function getThreatProgressionState(completedRunsRaw: number): ThreatProgressionState {
  const completedRuns = clampInt(completedRunsRaw);
  const threatTier = Math.floor(completedRuns / THREAT_EVENT_INTERVAL_RUNS);
  const breachEnabled = completedRuns >= BREACH_UNLOCK_RUNS;
  const nextThreatMilestoneRuns = (Math.floor(completedRuns / THREAT_EVENT_INTERVAL_RUNS) + 1) * THREAT_EVENT_INTERVAL_RUNS;
  return {
    completedRuns,
    threatTier,
    escalationTier: Math.max(0, threatTier - 1),
    breachEnabled,
    rookieWardActive: !breachEnabled,
    nextThreatMilestoneRuns,
    runsUntilBreachUnlock: Math.max(0, BREACH_UNLOCK_RUNS - completedRuns)
  };
}

export function getThreatEventMilestone(completedRunsRaw: number): ThreatEventMilestone | null {
  const completedRuns = clampInt(completedRunsRaw);
  if (completedRuns <= 0 || completedRuns % THREAT_EVENT_INTERVAL_RUNS !== 0) {
    return null;
  }
  const threatTier = Math.floor(completedRuns / THREAT_EVENT_INTERVAL_RUNS);
  return {
    completedRuns,
    threatTier,
    escalationTier: Math.max(0, threatTier - 1),
    unlocksBreach: completedRuns === BREACH_UNLOCK_RUNS
  };
}

