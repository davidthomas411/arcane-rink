import { describe, expect, it } from "vitest";
import { applyHomography, clamp, makeRng, solveHomography, TAU } from "../src/realm/util";
import { BotSource } from "../src/realm/input/BotSource";
import { GestureDetector } from "../src/realm/input/Gestures";
import { emptySample, type PuckSample } from "../src/realm/input/PuckSource";
import { defaultCalibration, defaultRebounders } from "../src/realm/input/calibration";
import { findBlobs, PuckFilter } from "../src/realm/input/vision";
import { PuckLocator } from "../src/realm/input/CameraSource";
import { Encounter, makeHeroRuntime } from "../src/realm/game/encounter";
import { allAdventures, ZONES } from "../src/realm/game/content";
import { completeDaily, createHero, grantSkill, grantXp, type Save } from "../src/realm/game/save";
import { rollItem } from "../src/realm/game/loot";

const DT = 1 / 60;
const W = 10;
const D = 7;

/** Moves a simulated puck toward a goal at a set speed and reports velocity like a tracker would. */
class Bot {
  s: PuckSample = { ...emptySample(5, 5), visible: true, conf: 1 };
  moveTo(x: number, y: number, speed: number): boolean {
    const dx = x - this.s.x;
    const dy = y - this.s.y;
    const d = Math.hypot(dx, dy);
    const step = Math.min(d, speed * DT);
    const nx = d > 0 ? this.s.x + (dx / d) * step : x;
    const ny = d > 0 ? this.s.y + (dy / d) * step : y;
    this.s.vx = (nx - this.s.x) / DT;
    this.s.vy = (ny - this.s.y) / DT;
    this.s.speed = Math.hypot(this.s.vx, this.s.vy);
    this.s.x = nx;
    this.s.y = ny;
    return d <= step + 1e-9;
  }
}

describe("homography", () => {
  it("maps a skewed camera quad onto the floor rectangle and back", () => {
    const corners = [{ x: 0.2, y: 0.1 }, { x: 0.8, y: 0.15 }, { x: 0.95, y: 0.9 }, { x: 0.05, y: 0.85 }];
    const floor = [{ x: 0, y: 0 }, { x: W, y: 0 }, { x: W, y: D }, { x: 0, y: D }];
    const h = solveHomography(corners, floor)!;
    const back = solveHomography(floor, corners)!;
    corners.forEach((c, i) => {
      const p = applyHomography(h, c.x, c.y);
      expect(p.x).toBeCloseTo(floor[i]!.x, 6);
      expect(p.y).toBeCloseTo(floor[i]!.y, 6);
    });
    const mid = applyHomography(h, 0.5, 0.5);
    const again = applyHomography(back, mid.x, mid.y);
    expect(again.x).toBeCloseTo(0.5, 6);
    expect(again.y).toBeCloseTo(0.5, 6);
  });
});

describe("vision", () => {
  it("finds a green puck and ignores other colours and specks", () => {
    const w = 160;
    const h = 90;
    const data = new Uint8ClampedArray(w * h * 4);
    const paint = (cx: number, cy: number, r: number, rgb: [number, number, number]) => {
      for (let y = 0; y < h; y += 1) for (let x = 0; x < w; x += 1) {
        if (Math.hypot(x - cx, y - cy) <= r) data.set([...rgb, 255], (y * w + x) * 4);
      }
    };
    data.fill(120); // grey floor
    paint(40, 30, 1.6, [40, 190, 150]); // puck
    paint(120, 60, 8, [220, 40, 40]); // red toy
    paint(80, 20, 4, [90, 200, 60]); // grass-green toy: not the puck's teal
    paint(10, 80, 0.5, [40, 190, 150]); // 1px green speck
    const cal = defaultCalibration();
    const blobs = findBlobs(data, w, h, cal.color, new Uint8Array(w * h), new Int32Array(w * h));
    expect(blobs).toHaveLength(1);
    expect(blobs[0]!.cx).toBeCloseTo(40.5, 0);
    expect(blobs[0]!.cy).toBeCloseTo(30.5, 0);

    const locator = new PuckLocator(cal, w, h);
    const p = locator.locate(blobs, 0)!;
    // Default corners span 0.15..0.85 of the frame.
    expect(p.x).toBeCloseTo(((40.5 / w - 0.15) / 0.7) * cal.arenaW, 1);
    expect(p.y).toBeCloseTo(((30.5 / h - 0.15) / 0.7) * cal.arenaD, 1);
  });

  it("estimates velocity", () => {
    const f = new PuckFilter();
    for (let i = 0; i < 30; i += 1) f.push(1 + i * 0.1, 2, 1 / 30);
    expect(f.vx).toBeCloseTo(3, 0);
    expect(Math.abs(f.vy)).toBeLessThan(0.01);
  });
});

describe("gestures", () => {
  const rebs = defaultRebounders(W, D);
  it("counts dribble touches", () => {
    const g = new GestureDetector(rebs, { passMinSpeed: 6 });
    const bot = new Bot();
    let touches = 0;
    for (let rep = 0; rep < 10; rep += 1) {
      const tx = rep % 2 === 0 ? 4.5 : 5.5;
      while (!bot.moveTo(tx, 5, 4)) {
        g.update(DT, bot.s);
        touches += g.events.filter((e) => e.type === "touch").length;
      }
    }
    expect(touches).toBeGreaterThanOrEqual(8);
    expect(touches).toBeLessThanOrEqual(10);
  });

  it("detects a pass off a rebounder and its reception", () => {
    const g = new GestureDetector(rebs, { passMinSpeed: 6 });
    const bot = new Bot();
    const seen: string[] = [];
    const run = (x: number, y: number, speed: number) => {
      while (!bot.moveTo(x, y, speed)) {
        g.update(DT, bot.s);
        for (const e of g.events) seen.push(e.type);
      }
    };
    run(5, 0.2, 14); // fire at the north crystal
    run(5, 4.5, 9); // rebound
    for (let i = 0; i < 30; i += 1) { bot.moveTo(5, 4.5, 0); g.update(DT, bot.s); for (const e of g.events) seen.push(e.type); }
    expect(seen).toContain("passHit");
    expect(seen).toContain("passReceived");
    expect(g.stats.topPassSpeed).toBeGreaterThan(10);
  });

  it("does not call a slow carry toward a rebounder a pass", () => {
    const g = new GestureDetector(rebs, { passMinSpeed: 6 });
    const bot = new Bot();
    let passes = 0;
    while (!bot.moveTo(5, 0.2, 3)) { g.update(DT, bot.s); passes += g.events.filter((e) => e.type === "passHit").length; }
    expect(passes).toBe(0);
  });

  it("detects a full circle", () => {
    const g = new GestureDetector(rebs, { passMinSpeed: 6 });
    const bot = new Bot();
    let circles = 0;
    for (let i = 0; i <= 80; i += 1) {
      const a = (i / 60) * TAU;
      bot.moveTo(5 + Math.cos(a), 4 + Math.sin(a), 20);
      g.update(DT, bot.s);
      circles += g.events.filter((e) => e.type === "circle").length;
    }
    expect(circles).toBe(1);
  });
});

/** Runs an encounter with the scripted player until it ends or the clock runs out. */
function play(enc: Encounter, limitSec: number, rebounders = defaultRebounders(W, D)): BotSource {
  const g = new GestureDetector(rebounders, { passMinSpeed: enc.hero.tier.passMinSpeed });
  const bot = new BotSource(W, D, rebounders);
  for (let t = 0; t < limitSec && !enc.done; t += DT) {
    bot.drive({ encounter: enc, ready: null, passing: g.passing });
    bot.update(DT);
    g.update(DT, bot.sample);
    enc.update(DT, bot.sample, g);
  }
  return bot;
}

const still = (): PuckSample => ({ ...emptySample(5, 5), visible: true, conf: 1 });

describe("encounters", () => {
  const arena = { w: W, d: D, rebounders: defaultRebounders(W, D) };
  const hero = (classId: "warrior" | "mage" | "rogue" | "ranger" = "mage", tier: "rookie" | "skilled" | "elite" = "skilled") =>
    makeHeroRuntime(createHero("Bot", "9", classId, tier));
  const find = (id: string) => allAdventures().flatMap((a) => a.encounters).find((e) => e.id === id)!;

  it("every quest, pull and boss can be beaten by each class", () => {
    for (const adventure of ZONES.flatMap((z) => z.adventures)) {
      for (const def of adventure.encounters) {
        for (const classId of ["warrior", "mage", "rogue", "ranger"] as const) {
          const enc = new Encounter(def, arena, makeRng(7), hero(classId));
          play(enc, 900);
          expect(enc.done, `${def.id} as ${classId}`).toBe(true);
          expect(enc.time, `${def.id} as ${classId} took ${enc.time.toFixed(0)}s vs par ${def.par}`).toBeLessThan(def.par * 2.5);
        }
      }
    }
  });

  it("stays beatable on every difficulty tier and without rebounders", () => {
    for (const tier of ["rookie", "elite"] as const) {
      for (const id of ["sparring-yard", "crystal-charge", "grukk"]) {
        const enc = new Encounter(find(id), arena, makeRng(11), hero("warrior", tier));
        play(enc, 900);
        expect(enc.done, `${id} on ${tier}`).toBe(true);
      }
    }
    for (const id of ["crystal-charge", "grukk"]) {
      const enc = new Encounter(find(id), { w: W, d: D, rebounders: [] }, makeRng(2), hero("ranger"));
      play(enc, 900, []);
      expect(enc.done, `${id} without rebounders`).toBe(true);
      expect(enc.signatureKind).toBe("flurry");
    }
  });

  it("daily blocks end on the clock and score reps of the right move only", () => {
    const daily = allAdventures().find((a) => a.kind === "daily")!;
    for (const def of daily.encounters) {
      const enc = new Encounter(def, arena, makeRng(3), hero("mage", "rookie"));
      play(enc, 120);
      expect(enc.done).toBe(true);
      expect(enc.time).toBeGreaterThanOrEqual(def.timeLimit!);
      expect(enc.damageDone, def.id).toBeGreaterThan(40);
    }
  });

  it("a shield blocks the front, and the back takes extra", () => {
    const def = { ...find("shieldbreakers"), waves: [[{ kind: "brute" as const }]] };
    const run = (side: 1 | -1): number => {
      const enc = new Encounter(def, arena, makeRng(1), hero("rogue"));
      const g = new GestureDetector(arena.rebounders, { passMinSpeed: 6 });
      const puck = still();
      for (let t = 0; t < 3; t += DT) enc.update(DT, puck, g);
      const brute = enc.enemies[0]!;
      brute.stun = 0;
      brute.cd = 99;
      // Dribble directly in front of it or directly behind it.
      const bx = brute.x + Math.cos(brute.facing) * (brute.r + 0.5) * side;
      const by = brute.y + Math.sin(brute.facing) * (brute.r + 0.5) * side;
      const facing = brute.facing;
      for (let t = 0; t < 1.2; t += DT) {
        const flip = Math.floor(t / 0.14) % 2 === 0 ? 1 : -1;
        const nx = bx - Math.sin(facing) * 0.35 * flip;
        const ny = by + Math.cos(facing) * 0.35 * flip;
        puck.vx = (nx - puck.x) / DT; puck.vy = (ny - puck.y) / DT; puck.speed = Math.min(4, Math.hypot(puck.vx, puck.vy)); puck.x = nx; puck.y = ny;
        brute.facing = facing;
        brute.cd = 99;
        g.update(DT, puck);
        enc.update(DT, puck, g);
      }
      return enc.damageDone;
    };
    expect(run(1)).toBe(0);
    expect(run(-1)).toBeGreaterThan(10);
  });

  it("a charger that misses is stunned, and standing in a swing hurts", () => {
    const enc = new Encounter({ ...find("tusk-chargers"), waves: [[{ kind: "berserker" as const }]] }, arena, makeRng(4), hero());
    const g = new GestureDetector(arena.rebounders, { passMinSpeed: 6 });
    const puck = still();
    let stunned = false;
    for (let t = 0; t < 30 && !stunned; t += DT) {
      const e = enc.enemies[0];
      // Step well out of the lane once it commits.
      if (e && e.state === "charge") { puck.x = e.x + Math.sin(e.facing) * 3; puck.y = clamp(e.y - Math.cos(e.facing) * 3, 0.5, D - 0.5); }
      g.update(DT, puck);
      enc.update(DT, puck, g);
      stunned = !!e && e.stun > 1;
    }
    expect(stunned).toBe(true);
    expect(enc.dodges).toBeGreaterThan(0);

    const rt = hero();
    const enc2 = new Encounter({ ...find("sparring-yard"), waves: [[{ kind: "grunt" as const }]] }, arena, makeRng(4), rt);
    const p2 = still();
    for (let t = 0; t < 40 && enc2.reviveLeft === 0; t += DT) { g.update(DT, p2); enc2.update(DT, p2, g); }
    expect(rt.tally.hitsTaken).toBeGreaterThan(3);
    expect(enc2.reviveLeft).toBe(10);
  });

  it("totems shrug off the stick but not lightning, and a loop freezes what it encloses", () => {
    const enc = new Encounter({ ...find("crystal-charge"), waves: [[{ kind: "totem" as const }]] }, arena, makeRng(5), hero("ranger"));
    const bot = play(enc, 60);
    expect(enc.done).toBe(true);
    expect(bot.sample.visible).toBe(true);

    const enc2 = new Encounter({ ...find("wisps"), waves: [[{ kind: "grunt" as const, count: 2 }]] }, arena, makeRng(6), hero("mage"));
    const g = new GestureDetector(arena.rebounders, { passMinSpeed: 6 });
    const puck = still();
    for (let t = 0; t < 1.5; t += DT) enc2.update(DT, puck, g);
    const a = enc2.enemies[0]!;
    a.cd = 99;
    for (let i = 0; i <= 70; i += 1) {
      const ang = (i / 60) * TAU;
      const nx = a.x + Math.cos(ang) * 1.2;
      const ny = a.y + Math.sin(ang) * 1.2;
      puck.vx = (nx - puck.x) / DT; puck.vy = (ny - puck.y) / DT; puck.speed = Math.min(8, Math.hypot(puck.vx, puck.vy)); puck.x = nx; puck.y = ny;
      const ax = a.x; const ay = a.y;
      g.update(DT, puck);
      enc2.update(DT, puck, g);
      a.x = ax; a.y = ay; a.cd = 99;
    }
    expect(a.frozen || a.state === "dead").toBe(true);
  });

  it("a ward that is not defended breaks and costs a star", () => {
    const enc = new Encounter(find("hold-the-gate"), arena, makeRng(8), hero());
    const g = new GestureDetector(arena.rebounders, { passMinSpeed: 6 });
    const puck = { ...still(), x: 0.5, y: 6.5 };
    for (let t = 0; t < 90 && !enc.wardBroken; t += DT) { g.update(DT, puck); enc.update(DT, puck, g); }
    expect(enc.wardBroken).toBe(true);
    const defended = new Encounter(find("hold-the-gate"), arena, makeRng(8), hero("warrior"));
    play(defended, 600);
    expect(defended.done).toBe(true);
    expect(defended.wardBroken).toBe(false);
  });
});

describe("progression", () => {
  it("levels up, raises skills with diminishing returns, and rolls loot", () => {
    const hero = createHero("Ava", "7", "rogue", "rookie");
    expect(grantXp(hero, 350)).toEqual([2, 3]);
    expect(hero.level).toBe(3);
    expect(hero.xp).toBe(50);
    const first = grantSkill(hero, "stick", 100);
    const second = grantSkill(hero, "stick", 100);
    expect(first).toBeGreaterThan(second);
    const item = rollItem(makeRng(5), 3, 2);
    expect(item.name.length).toBeGreaterThan(5);
    expect(item.value).toBeGreaterThan(0);
  });

  it("tracks the daily streak", () => {
    const save: Save = { version: 1, heroes: [], party: [], daily: { lastDate: null, streak: 0, best: 0 } };
    expect(completeDaily(save, new Date(2026, 0, 1))).toBe(1);
    expect(completeDaily(save, new Date(2026, 0, 1))).toBe(1);
    expect(completeDaily(save, new Date(2026, 0, 2))).toBe(2);
    expect(completeDaily(save, new Date(2026, 0, 5))).toBe(1);
    expect(save.daily.best).toBe(2);
  });
});
