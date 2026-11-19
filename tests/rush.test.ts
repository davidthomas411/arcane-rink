import { describe, expect, it } from "vitest";
import { TIERS } from "../src/realm/game/classes";
import { defaultRebounders } from "../src/realm/input/calibration";
import { GestureDetector } from "../src/realm/input/Gestures";
import { emptySample, type PuckSample } from "../src/realm/input/PuckSource";
import { makeRng } from "../src/realm/util";
import { RINK, RushSim } from "../src/rush/RushSim";

const DT = 1 / 60;
const W = 10;
const D = 7;

function play(seed: number, rebounders = defaultRebounders(W, D), still = false) {
  const tier = TIERS.skilled;
  const sim = new RushSim({ w: W, d: D, rebounders }, tier, makeRng(seed));
  const g = new GestureDetector(rebounders, { passMinSpeed: tier.passMinSpeed });
  const puck: PuckSample = { ...emptySample(W / 2, D * 0.55), visible: true, conf: 1 };
  let t = 0;
  let farthest = sim.me.z;
  while (sim.phase !== "over" && t < 400) {
    const aim = still ? { x: W / 2, y: D * 0.55, speed: 0 } : sim.demoAim(puck, g.passing, t);
    const dx = aim.x - puck.x;
    const dy = aim.y - puck.y;
    const d = Math.hypot(dx, dy);
    const step = Math.min(d, aim.speed * DT);
    const nx = d > 1e-6 ? puck.x + (dx / d) * step : puck.x;
    const ny = d > 1e-6 ? puck.y + (dy / d) * step : puck.y;
    puck.vx = (nx - puck.x) / DT; puck.vy = (ny - puck.y) / DT; puck.speed = Math.hypot(puck.vx, puck.vy); puck.x = nx; puck.y = ny;
    g.update(DT, puck);
    sim.update(DT, puck, g);
    farthest = Math.min(farthest, sim.me.z);
    expect(Math.abs(sim.me.x)).toBeLessThanOrEqual(RINK.halfW);
    t += DT;
  }
  return { sim, t, farthest };
}

describe("rush", () => {
  it("a player who dekes, passes and shoots gets up the ice and scores over a match", () => {
    let goals = 0;
    let dekes = 0;
    let passes = 0;
    for (const seed of [1, 2, 3]) {
      const { sim, t, farthest } = play(seed);
      expect(sim.phase).toBe("over");
      expect(t).toBeGreaterThan(295);
      expect(farthest).toBeLessThan(-RINK.blueLine);
      goals += sim.score[0];
      dekes += sim.dekes;
      passes += sim.passes;
    }
    expect(goals).toBeGreaterThan(3);
    expect(dekes).toBeGreaterThan(10);
    expect(passes).toBeGreaterThan(3);
  });

  it("a player who just holds the puck still gets stripped", () => {
    const { sim } = play(5, defaultRebounders(W, D), true);
    expect(sim.score[0]).toBe(0);
    expect(sim.dekes).toBe(0);
  });

  it("still works with no rebounders set up", () => {
    const { sim } = play(7, []);
    expect(sim.phase).toBe("over");
  });
});
