import type { PuckColor } from "./calibration";

export type Blob = {
  /** Centroid in pixels of the processed frame. */
  cx: number;
  cy: number;
  area: number;
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
};

export function rgbToHsv(r: number, g: number, b: number): { h: number; s: number; v: number } {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  let h = 0;
  if (d > 0) {
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  return { h, s: max === 0 ? 0 : d / max, v: max / 255 };
}

/**
 * Threshold an RGBA frame for the puck colour and return connected blobs.
 * `mask` is scratch space (w*h bytes) and is left holding 1 for every matching pixel.
 */
export function findBlobs(
  data: Uint8ClampedArray,
  w: number,
  h: number,
  color: PuckColor,
  mask: Uint8Array,
  stack: Int32Array,
  minArea = 3
): Blob[] {
  const vMin255 = color.vMin * 255;
  const n = w * h;
  for (let i = 0, p = 0; i < n; i += 1, p += 4) {
    const r = data[p]!;
    const g = data[p + 1]!;
    const b = data[p + 2]!;
    const max = r > g ? (r > b ? r : b) : g > b ? g : b;
    if (max < vMin255) {
      mask[i] = 0;
      continue;
    }
    const min = r < g ? (r < b ? r : b) : g < b ? g : b;
    const d = max - min;
    if (d < color.sMin * max) {
      mask[i] = 0;
      continue;
    }
    let hue: number;
    if (max === r) hue = ((g - b) / d) * 60;
    else if (max === g) hue = ((b - r) / d + 2) * 60;
    else hue = ((r - g) / d + 4) * 60;
    if (hue < 0) hue += 360;
    let diff = Math.abs(hue - color.h);
    if (diff > 180) diff = 360 - diff;
    mask[i] = diff <= color.hTol ? 1 : 0;
  }

  const blobs: Blob[] = [];
  for (let start = 0; start < n; start += 1) {
    if (mask[start] !== 1) continue;
    // Flood fill; visited pixels are marked 2 so the mask stays usable for previews.
    let top = 0;
    stack[top++] = start;
    mask[start] = 2;
    let area = 0;
    let sx = 0;
    let sy = 0;
    let minX = w;
    let maxX = 0;
    let minY = h;
    let maxY = 0;
    while (top > 0) {
      const idx = stack[--top]!;
      const x = idx % w;
      const y = (idx - x) / w;
      area += 1;
      sx += x;
      sy += y;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
      if (x > 0 && mask[idx - 1] === 1) {
        mask[idx - 1] = 2;
        stack[top++] = idx - 1;
      }
      if (x < w - 1 && mask[idx + 1] === 1) {
        mask[idx + 1] = 2;
        stack[top++] = idx + 1;
      }
      if (y > 0 && mask[idx - w] === 1) {
        mask[idx - w] = 2;
        stack[top++] = idx - w;
      }
      if (y < h - 1 && mask[idx + w] === 1) {
        mask[idx + w] = 2;
        stack[top++] = idx + w;
      }
    }
    if (area >= minArea) {
      blobs.push({ cx: sx / area + 0.5, cy: sy / area + 0.5, area, minX, maxX, minY, maxY });
    }
  }
  return blobs;
}

/** Alpha-beta filter: smooths the measured position and estimates velocity without much lag. */
export class PuckFilter {
  x = 0;
  y = 0;
  vx = 0;
  vy = 0;
  private ready = false;

  reset(): void {
    this.ready = false;
    this.vx = 0;
    this.vy = 0;
  }

  push(mx: number, my: number, dt: number): void {
    if (!this.ready || dt <= 0 || dt > 0.5) {
      this.x = mx;
      this.y = my;
      this.vx = 0;
      this.vy = 0;
      this.ready = true;
      return;
    }
    const px = this.x + this.vx * dt;
    const py = this.y + this.vy * dt;
    const rx = mx - px;
    const ry = my - py;
    this.x = px + 0.8 * rx;
    this.y = py + 0.8 * ry;
    this.vx += (0.5 * rx) / dt;
    this.vy += (0.5 * ry) / dt;
  }
}
