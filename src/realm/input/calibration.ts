import type { Vec } from "../util";

/** A rebounder is a straight bumper on the floor, stored in feet. */
export type Rebounder = { id: string; name: string; ax: number; ay: number; bx: number; by: number };

export type PuckColor = {
  /** Hue in degrees 0..360. */
  h: number;
  hTol: number;
  sMin: number;
  vMin: number;
};

export type Calibration = {
  /** Play area size in feet. */
  arenaW: number;
  arenaD: number;
  /** Floor corners in normalised camera coordinates: far-left, far-right, near-right, near-left. */
  corners: [Vec, Vec, Vec, Vec];
  color: PuckColor;
  rebounders: Rebounder[];
  deviceId: string | null;
  /** True once someone has walked through camera setup. */
  cameraReady: boolean;
  input: "mouse" | "camera";
};

const KEY = "arcane-rink/realm-calibration.v1";

/**
 * Green Biscuit default. The puck is teal rather than pure green (hue about 168 in
 * photos under warm basement light), so the window is centred there.
 */
export const DEFAULT_COLOR: PuckColor = { h: 165, hTol: 25, sMin: 0.25, vMin: 0.2 };

export function defaultRebounders(arenaW: number, arenaD: number): Rebounder[] {
  return [
    { id: "north", name: "North Crystal", ax: arenaW * 0.32, ay: 0, bx: arenaW * 0.68, by: 0 },
    { id: "west", name: "West Crystal", ax: 0, ay: arenaD * 0.3, bx: 0, by: arenaD * 0.7 }
  ];
}

export function defaultCalibration(): Calibration {
  const arenaW = 10;
  const arenaD = 7;
  return {
    arenaW,
    arenaD,
    corners: [
      { x: 0.15, y: 0.15 },
      { x: 0.85, y: 0.15 },
      { x: 0.85, y: 0.85 },
      { x: 0.15, y: 0.85 }
    ],
    color: { ...DEFAULT_COLOR },
    rebounders: defaultRebounders(arenaW, arenaD),
    deviceId: null,
    cameraReady: false,
    input: "mouse"
  };
}

function num(value: unknown, fallback: number, lo: number, hi: number): number {
  return typeof value === "number" && Number.isFinite(value) ? Math.max(lo, Math.min(hi, value)) : fallback;
}

export function loadCalibration(storage: Storage = window.localStorage): Calibration {
  const base = defaultCalibration();
  try {
    const raw = storage.getItem(KEY);
    if (!raw) return base;
    const data = JSON.parse(raw) as Partial<Calibration>;
    const arenaW = num(data.arenaW, base.arenaW, 3, 40);
    const arenaD = num(data.arenaD, base.arenaD, 3, 40);
    const corners = Array.isArray(data.corners) && data.corners.length === 4
      ? (data.corners.map((c, i) => ({ x: num(c?.x, base.corners[i]!.x, 0, 1), y: num(c?.y, base.corners[i]!.y, 0, 1) })) as Calibration["corners"])
      : base.corners;
    const rebounders = Array.isArray(data.rebounders)
      ? data.rebounders
          .filter((r) => r && typeof r.id === "string")
          .map((r) => ({
            id: r.id,
            name: typeof r.name === "string" ? r.name : "Crystal",
            ax: num(r.ax, 0, -2, arenaW + 2),
            ay: num(r.ay, 0, -2, arenaD + 2),
            bx: num(r.bx, 1, -2, arenaW + 2),
            by: num(r.by, 0, -2, arenaD + 2)
          }))
      : base.rebounders;
    return {
      arenaW,
      arenaD,
      corners,
      color: {
        h: num(data.color?.h, base.color.h, 0, 360),
        hTol: num(data.color?.hTol, base.color.hTol, 4, 90),
        sMin: num(data.color?.sMin, base.color.sMin, 0, 1),
        vMin: num(data.color?.vMin, base.color.vMin, 0, 1)
      },
      rebounders,
      deviceId: typeof data.deviceId === "string" ? data.deviceId : null,
      cameraReady: data.cameraReady === true,
      input: data.input === "camera" ? "camera" : "mouse"
    };
  } catch {
    return base;
  }
}

export function saveCalibration(cal: Calibration, storage: Storage = window.localStorage): void {
  try {
    storage.setItem(KEY, JSON.stringify(cal));
  } catch {
    // Storage full or blocked: the game still runs with the in-memory copy.
  }
}
