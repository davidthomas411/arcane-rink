import { describe, expect, it } from "vitest";
import { applyHomography, makeRng, solveHomography, TAU } from "../src/realm/util";
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

/** Plays an encounter the way a kid would: do the objective, dodge what the screen shows. */
function playEncounter(enc: Encounter, limitSec: number): void {
  const rebs = defaultRebounders(W, D);
  const g = new GestureDetector(rebs, { passMinSpeed: enc.hero.tier.passMinSpeed });
  const bot = new Bot();
  let boltPhase = 0;
  for (let t = 0; t < limitSec && !enc.done; t += DT) {
    const o = enc.objective;
    const fire = enc.hazards.find((h) => h.kind === "fire" && Math.hypot(h.x - bot.s.x, h.y - bot.s.y) < h.r + 0.3);
    const sigil = enc.hazards.find((h) => h.kind === "sigil" && h.correct);
    if (enc.reviveLeft > 0) {
      bot.moveTo(Math.floor(t * 4) % 2 === 0 ? 4.4 : 5.6, 4, 6);
    } else if (sigil && sigil.kind === "sigil") {
      bot.moveTo(sigil.x, sigil.y, 6);
    } else if (fire && fire.kind === "fire") {
      const away = bot.s.x < W / 2 ? 1 : -1;
      bot.moveTo(fire.x + away * (fire.r + 1), fire.y, 7);
    } else if (!o) {
      bot.moveTo(bot.s.x, bot.s.y, 0);
    } else if (o.kind === "runes" || o.kind === "hold") {
      bot.moveTo(o.x, o.y, 5);
    } else if (o.kind === "twin") {
      const target = o.next === 0 ? o.a : o.b;
      bot.moveTo(target.x, target.y, 6);
    } else if (o.kind === "weave") {
      const p = o.cur === 0 ? o.a : o.b;
      const a = Math.atan2(bot.s.y - p.y, bot.s.x - p.x) + 0.35;
      bot.moveTo(p.x + Math.cos(a) * 1, p.y + Math.sin(a) * 1, 6);
    } else if (o.kind === "bolt") {
      const reb = rebs.find((r) => r.id === o.rebounderId)!;
      const mx = (reb.ax + reb.bx) / 2;
      const my = (reb.ay + reb.by) / 2;
      if (boltPhase === 0) { if (bot.moveTo(mx, my, 14)) boltPhase = 1; }
      else if (boltPhase === 1) { if (bot.moveTo(5, 4, 8)) boltPhase = 2; }
      else { bot.moveTo(5, 4, 0); if (!g.passing) boltPhase = 0; }
    }
    g.update(DT, bot.s);
    enc.update(DT, bot.s, g);
  }
}

describe("encounters", () => {
  const arena = { w: W, d: D, rebounders: defaultRebounders(W, D) };

  it("every quest, pull and boss can be beaten by each class", () => {
    for (const adventure of ZONES.flatMap((z) => z.adventures)) {
      for (const def of adventure.encounters) {
        for (const classId of ["warrior", "mage", "rogue", "ranger"] as const) {
          const enc = new Encounter(def, arena, makeRng(7), makeHeroRuntime(createHero("Bot", "9", classId, "skilled")));
          playEncounter(enc, 600);
          expect(enc.done, `${def.id} as ${classId}`).toBe(true);
          expect(enc.stars).toBeGreaterThanOrEqual(1);
          expect(enc.time, `${def.id} as ${classId} took ${enc.time.toFixed(0)}s vs par ${def.par}`).toBeLessThan(def.par * 2.5);
        }
      }
    }
  });

  it("daily blocks end on the clock and score reps", () => {
    const daily = allAdventures().find((a) => a.kind === "daily")!;
    for (const def of daily.encounters) {
      const enc = new Encounter(def, arena, makeRng(3), makeHeroRuntime(createHero("Bot", "9", "mage", "rookie")));
      playEncounter(enc, 120);
      expect(enc.done).toBe(true);
      expect(enc.time).toBeGreaterThanOrEqual(def.timeLimit!);
      expect(enc.damageDone, def.id).toBeGreaterThan(20);
    }
  });

  it("standing in fire knocks the hero down, and dribbling revives them", () => {
    const def = { ...ZONES[0]!.adventures[2]!.encounters[0]!, hazards: [{ kind: "fire" as const, every: 1 }] };
    const rt = makeHeroRuntime(createHero("Bot", "9", "mage", "skilled"));
    const enc = new Encounter(def, arena, makeRng(1), rt);
    const g = new GestureDetector(arena.rebounders, { passMinSpeed: 6 });
    const bot = new Bot();
    for (let t = 0; t < 60 && enc.reviveLeft === 0; t += DT) { bot.moveTo(5, 5, 0); g.update(DT, bot.s); enc.update(DT, bot.s, g); }
    expect(enc.reviveLeft).toBe(10);
    expect(rt.tally.downs).toBe(1);
    for (let t = 0; t < 20 && enc.reviveLeft > 0; t += DT) { bot.moveTo(Math.floor(t * 4) % 2 === 0 ? 4.4 : 5.6, 5, 6); g.update(DT, bot.s); enc.update(DT, bot.s, g); }
    expect(enc.reviveLeft).toBe(0);
    expect(rt.hp).toBeGreaterThan(0);
  });

  it("falls back to carries when no rebounder is set up", () => {
    const def = ZONES[0]!.adventures[4]!.encounters[0]!;
    const enc = new Encounter(def, { w: W, d: D, rebounders: [] }, makeRng(2), makeHeroRuntime(createHero("Bot", "9", "ranger", "skilled")));
    playEncounter(enc, 300);
    expect(enc.done).toBe(true);
    expect(enc.signatureKind).toBe("flurry");
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
