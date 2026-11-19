export type Vec = { x: number; y: number };

export const TAU = Math.PI * 2;

export function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export function dist(ax: number, ay: number, bx: number, by: number): number {
  return Math.hypot(ax - bx, ay - by);
}

/** Smallest signed difference between two angles, in (-PI, PI]. */
export function angleDelta(from: number, to: number): number {
  let d = (to - from) % TAU;
  if (d > Math.PI) d -= TAU;
  if (d <= -Math.PI) d += TAU;
  return d;
}

/** Distance from point p to segment a-b, plus the parametric position along it. */
export function pointSegment(px: number, py: number, ax: number, ay: number, bx: number, by: number): { d: number; t: number } {
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy;
  const t = len2 > 0 ? clamp(((px - ax) * dx + (py - ay) * dy) / len2, 0, 1) : 0;
  return { d: Math.hypot(px - (ax + dx * t), py - (ay + dy * t)), t };
}

/** Deterministic RNG (mulberry32) so encounters can be replayed in tests. */
export function makeRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function pick<T>(rng: () => number, items: readonly T[]): T {
  return items[Math.min(items.length - 1, Math.floor(rng() * items.length))]!;
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function uid(): string {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

/** 3x3 homography stored row-major. */
export type Homography = [number, number, number, number, number, number, number, number, number];

/**
 * Solve the homography that maps four source points onto four destination points.
 * Used to turn camera pixels into feet on the floor (and back).
 */
export function solveHomography(src: readonly Vec[], dst: readonly Vec[]): Homography | null {
  if (src.length !== 4 || dst.length !== 4) return null;
  const m: number[][] = [];
  for (let i = 0; i < 4; i += 1) {
    const { x, y } = src[i]!;
    const { x: u, y: v } = dst[i]!;
    m.push([x, y, 1, 0, 0, 0, -u * x, -u * y, u]);
    m.push([0, 0, 0, x, y, 1, -v * x, -v * y, v]);
  }
  // Gaussian elimination with partial pivoting on the 8x9 augmented matrix.
  for (let col = 0; col < 8; col += 1) {
    let pivot = col;
    for (let row = col + 1; row < 8; row += 1) {
      if (Math.abs(m[row]![col]!) > Math.abs(m[pivot]![col]!)) pivot = row;
    }
    if (Math.abs(m[pivot]![col]!) < 1e-10) return null;
    [m[col], m[pivot]] = [m[pivot]!, m[col]!];
    const lead = m[col]![col]!;
    for (let k = col; k < 9; k += 1) m[col]![k]! /= lead;
    for (let row = 0; row < 8; row += 1) {
      if (row === col) continue;
      const factor = m[row]![col]!;
      if (factor === 0) continue;
      for (let k = col; k < 9; k += 1) m[row]![k]! -= factor * m[col]![k]!;
    }
  }
  return [m[0]![8]!, m[1]![8]!, m[2]![8]!, m[3]![8]!, m[4]![8]!, m[5]![8]!, m[6]![8]!, m[7]![8]!, 1];
}

export function applyHomography(h: Homography, x: number, y: number): Vec {
  const w = h[6] * x + h[7] * y + h[8];
  return { x: (h[0] * x + h[1] * y + h[2]) / w, y: (h[3] * x + h[4] * y + h[5]) / w };
}
