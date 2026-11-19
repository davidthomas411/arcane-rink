import { describe, expect, it } from "vitest";
import { chooseAction } from "../src/league/ai";
import { COLS, Match, ROWS, type CheckSpec, type MatchEvent } from "../src/league/rules";
import { makeRng } from "../src/realm/util";

const names: [string[], string[]] = [["A", "B", "C", "D"], ["W", "X", "Y", "Z"]];
const config = { turnsPerPeriod: 5, periods: 2, names };

function dice(seed: number) {
  const rng = makeRng(seed);
  return async (_spec: CheckSpec) => 1 + Math.floor(rng() * 6);
}

describe("league rules", () => {
  it("plays whole matches between two computer coaches without getting stuck or breaking the board", async () => {
    let goals = 0;
    for (let seed = 1; seed <= 25; seed += 1) {
      const match = new Match(config, makeRng(seed));
      const roll = dice(seed * 7);
      const events: MatchEvent[] = [];
      match.onEvent = async (e) => {
        events.push(e);
        const seen = new Set<string>();
        for (const s of match.skaters) {
          expect(s.x >= 0 && s.x < COLS && s.y >= 0 && s.y < ROWS).toBe(true);
          const key = `${s.x},${s.y}`;
          expect(seen.has(key), `two skaters on ${key}`).toBe(false);
          seen.add(key);
        }
      };
      await match.start(roll);
      let steps = 0;
      while (!match.over && steps < 600) {
        await match.act(chooseAction(match, match.team), roll);
        steps += 1;
      }
      expect(match.over, `seed ${seed} finished`).toBe(true);
      expect(events.filter((e) => e.type === "turn").length).toBe(20);
      goals += match.score[0] + match.score[1];
    }
    // The game should produce scoring, but not a goal every turn.
    expect(goals).toBeGreaterThan(10);
    expect(goals).toBeLessThan(25 * 12);
  });

  it("leaving a defender needs a deke; failing it is a knock-down and a turnover", async () => {
    const match = new Match(config, makeRng(1));
    const rolls: CheckSpec[] = [];
    await match.start(async (spec) => (spec.kind === "faceoff" ? (spec.team === 0 ? 6 : 1) : 1));
    expect(match.team).toBe(0);
    const carrier = match.carrier!;
    const foe = match.skaters.find((s) => s.team === 1 && s.role === "playmaker")!;
    foe.x = carrier.x + 1;
    foe.y = carrier.y;
    const move = match.options(carrier.id).moves[0]!;
    expect(move.deke).toBe(true);
    await match.act({ type: "move", id: carrier.id, x: move.x, y: move.y }, async (spec) => { rolls.push(spec); return 1; });
    expect(rolls[0]!.kind).toBe("deke");
    expect(carrier.down).toBe(true);
    expect(match.puck.carrier).toBe(null);
    expect(match.team).toBe(1);
  });

  it("a made shot scores and a made pass moves the puck", async () => {
    const match = new Match(config, makeRng(2));
    await match.start(async (spec) => (spec.team === 0 ? 6 : 1));
    const carrier = match.carrier!;
    const mate = match.skaters.find((s) => s.team === 0 && s.role === "sniper")!;
    await match.act({ type: "pass", id: carrier.id, to: mate.id }, async () => 6);
    expect(match.puck.carrier).toBe(mate.id);
    mate.x = COLS - 2;
    mate.y = 3;
    expect(match.options(mate.id).shot).not.toBe(null);
    await match.act({ type: "shoot", id: mate.id }, async () => 6);
    expect(match.score[0]).toBe(1);
    expect(match.team).toBe(1);
    expect(match.carrier!.team).toBe(1);
  });

  it("gives each side three activations a turn", async () => {
    const match = new Match(config, makeRng(3));
    await match.start(async (spec) => (spec.team === 0 ? 6 : 1));
    const mine = match.skaters.filter((s) => s.team === 0);
    for (const s of mine.slice(0, 2)) await match.act({ type: "rest", id: s.id }, async () => 4);
    expect(match.team).toBe(0);
    expect(match.actionsLeft).toBe(1);
    await match.act({ type: "rest", id: mine[2]!.id }, async () => 4);
    expect(match.team).toBe(1);
  });
});
