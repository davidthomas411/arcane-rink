import { applyHomography, solveHomography, type Homography, type Vec } from "../util";
import type { Calibration, PuckColor } from "./calibration";
import { emptySample, type PuckSample, type PuckSource } from "./PuckSource";
import { findBlobs, PuckFilter, rgbToHsv, type Blob } from "./vision";

const PROC_WIDTH = 480;
/** Green Biscuit diameter in feet (3 inches). */
const PUCK_DIAMETER_FT = 0.25;


export function floorHomography(cal: Calibration): { toFloor: Homography; toImage: Homography } | null {
  const floor: Vec[] = [
    { x: 0, y: 0 },
    { x: cal.arenaW, y: 0 },
    { x: cal.arenaW, y: cal.arenaD },
    { x: 0, y: cal.arenaD }
  ];
  const toFloor = solveHomography(cal.corners, floor);
  const toImage = solveHomography(floor, cal.corners);
  return toFloor && toImage ? { toFloor, toImage } : null;
}

/**
 * Owns the webcam stream and finds the puck in each frame.
 * Shared by the calibration screen (which needs previews) and the in-game puck source.
 */
export class CameraTracker {
  readonly video: HTMLVideoElement;
  /** Per-frame callbacks give exact frame times; older browsers fall back to polling. */
  private readonly perFrame: boolean;
  readonly proc: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private stream: MediaStream | null = null;
  private mask = new Uint8Array(0);
  private stack = new Int32Array(0);
  private frameHandle = 0;
  private lastVideoTime = -1;
  private stopped = false;

  /** Latest frame pixels (processing resolution). */
  frame: ImageData | null = null;
  blobs: Blob[] = [];
  onFrame: ((timeSec: number) => void) | null = null;

  constructor(public color: PuckColor) {
    this.video = document.createElement("video");
    this.video.playsInline = true;
    this.video.muted = true;
    this.perFrame = "requestVideoFrameCallback" in this.video;
    this.proc = document.createElement("canvas");
    const ctx = this.proc.getContext("2d", { willReadFrequently: true });
    if (!ctx) throw new Error("2D canvas unavailable");
    this.ctx = ctx;
  }

  get width(): number {
    return this.proc.width;
  }

  get height(): number {
    return this.proc.height;
  }

  get maskData(): Uint8Array {
    return this.mask;
  }

  async start(deviceId: string | null): Promise<void> {
    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error("This browser cannot open a camera. Use Chrome or Edge over https or localhost.");
    }
    this.stopStream();
    const video: MediaTrackConstraints = {
      width: { ideal: 1280 },
      height: { ideal: 720 },
      frameRate: { ideal: 60 }
    };
    if (deviceId) video.deviceId = { exact: deviceId };
    this.stream = await navigator.mediaDevices.getUserMedia({ video, audio: false });
    this.video.srcObject = this.stream;
    await this.video.play();
    const vw = this.video.videoWidth || 1280;
    const vh = this.video.videoHeight || 720;
    this.proc.width = PROC_WIDTH;
    this.proc.height = Math.max(2, Math.round((PROC_WIDTH * vh) / vw));
    this.mask = new Uint8Array(this.proc.width * this.proc.height);
    this.stack = new Int32Array(this.proc.width * this.proc.height);
    this.stopped = false;
    this.schedule();
  }

  get activeDeviceId(): string | null {
    return this.stream?.getVideoTracks()[0]?.getSettings().deviceId ?? null;
  }

  private schedule(): void {
    if (this.stopped) return;
    if (this.perFrame) {
      this.frameHandle = this.video.requestVideoFrameCallback((_now, meta) => {
        this.process(meta.mediaTime);
        this.schedule();
      });
    } else {
      this.frameHandle = requestAnimationFrame(() => {
        if (this.video.currentTime !== this.lastVideoTime) {
          this.lastVideoTime = this.video.currentTime;
          this.process(this.video.currentTime);
        }
        this.schedule();
      });
    }
  }

  private process(timeSec: number): void {
    const w = this.proc.width;
    const h = this.proc.height;
    if (w < 2 || this.video.readyState < 2) return;
    this.ctx.drawImage(this.video, 0, 0, w, h);
    this.frame = this.ctx.getImageData(0, 0, w, h);
    this.blobs = findBlobs(this.frame.data, w, h, this.color, this.mask, this.stack);
    this.onFrame?.(timeSec);
  }

  /** Read the colour under a point (normalised frame coords) and derive thresholds from it. */
  sampleColor(nx: number, ny: number): PuckColor | null {
    const frame = this.frame;
    if (!frame) return null;
    const cx = Math.round(nx * frame.width);
    const cy = Math.round(ny * frame.height);
    let r = 0;
    let g = 0;
    let b = 0;
    let count = 0;
    for (let y = cy - 2; y <= cy + 2; y += 1) {
      for (let x = cx - 2; x <= cx + 2; x += 1) {
        if (x < 0 || y < 0 || x >= frame.width || y >= frame.height) continue;
        const p = (y * frame.width + x) * 4;
        r += frame.data[p]!;
        g += frame.data[p + 1]!;
        b += frame.data[p + 2]!;
        count += 1;
      }
    }
    if (count === 0) return null;
    const hsv = rgbToHsv(r / count, g / count, b / count);
    return {
      h: hsv.h,
      hTol: 24,
      sMin: Math.max(0.18, hsv.s * 0.5),
      vMin: Math.max(0.12, hsv.v * 0.4)
    };
  }

  private stopStream(): void {
    this.stream?.getTracks().forEach((track) => track.stop());
    this.stream = null;
  }

  stop(): void {
    this.stopped = true;
    if (this.perFrame) {
      this.video.cancelVideoFrameCallback(this.frameHandle);
    } else {
      cancelAnimationFrame(this.frameHandle);
    }
    this.stopStream();
    this.video.srcObject = null;
  }
}

/** Picks the blob most likely to be the puck and converts it to feet. */
export class PuckLocator {
  private homography: { toFloor: Homography; toImage: Homography } | null;
  private expectedArea = 40;
  readonly filter = new PuckFilter();
  private lastSeen = -1;
  private lastTime = -1;

  constructor(private cal: Calibration, private frameW: number, private frameH: number) {
    this.homography = floorHomography(cal);
    this.recompute();
  }

  setCalibration(cal: Calibration, frameW: number, frameH: number): void {
    this.cal = cal;
    this.frameW = frameW;
    this.frameH = frameH;
    this.homography = floorHomography(cal);
    this.recompute();
  }

  private recompute(): void {
    const hg = this.homography;
    if (!hg) return;
    const cx = this.cal.arenaW / 2;
    const cy = this.cal.arenaD / 2;
    const a = applyHomography(hg.toImage, cx - PUCK_DIAMETER_FT / 2, cy);
    const b = applyHomography(hg.toImage, cx + PUCK_DIAMETER_FT / 2, cy);
    const diameterPx = Math.max(2, Math.hypot((b.x - a.x) * this.frameW, (b.y - a.y) * this.frameH));
    this.expectedArea = Math.PI * (diameterPx / 2) ** 2;
  }

  get expectedAreaPx(): number {
    return this.expectedArea;
  }

  /** Returns the measured floor position for this frame, or null if the puck was not found. */
  locate(blobs: readonly Blob[], timeSec: number): Vec | null {
    const hg = this.homography;
    if (!hg) return null;
    const dt = this.lastTime < 0 ? 0 : timeSec - this.lastTime;
    this.lastTime = timeSec;
    const sinceSeen = this.lastSeen < 0 ? Infinity : timeSec - this.lastSeen;
    const havePrediction = sinceSeen < 0.6;
    const predX = this.filter.x + this.filter.vx * Math.min(sinceSeen, 0.3);
    const predY = this.filter.y + this.filter.vy * Math.min(sinceSeen, 0.3);
    // How far the puck could plausibly have travelled since we last saw it.
    const gate = 1 + Math.hypot(this.filter.vx, this.filter.vy) * 0.12 + sinceSeen * 25;

    const minArea = Math.max(3, this.expectedArea * 0.12);
    const maxArea = this.expectedArea * 8;
    const margin = 1.5;
    let best: Vec | null = null;
    let bestScore = Infinity;
    for (const blob of blobs) {
      if (blob.area < minArea || blob.area > maxArea) continue;
      const p = applyHomography(hg.toFloor, blob.cx / this.frameW, blob.cy / this.frameH);
      if (p.x < -margin || p.y < -margin || p.x > this.cal.arenaW + margin || p.y > this.cal.arenaD + margin) continue;
      const sizeError = Math.abs(Math.log(blob.area / this.expectedArea));
      let score = sizeError;
      if (havePrediction) {
        const d = Math.hypot(p.x - predX, p.y - predY);
        if (d > gate) continue;
        score += d * 2;
      }
      if (score < bestScore) {
        bestScore = score;
        best = p;
      }
    }
    if (best) {
      this.filter.push(best.x, best.y, havePrediction ? Math.max(dt, 1 / 240) : 0);
      this.lastSeen = timeSec;
    }
    return best;
  }
}

/** Live puck position from the overhead camera. */
export class CameraSource implements PuckSource {
  readonly label = "Overhead camera";
  readonly sample: PuckSample = emptySample();
  private readonly locator: PuckLocator;
  private sinceMeasurement = 10;

  constructor(readonly tracker: CameraTracker, cal: Calibration) {
    this.locator = new PuckLocator(cal, tracker.width, tracker.height);
    this.sample.x = cal.arenaW / 2;
    this.sample.y = cal.arenaD / 2;
    tracker.onFrame = (timeSec) => {
      if (this.locator.locate(tracker.blobs, timeSec)) {
        this.sinceMeasurement = 0;
      }
    };
  }

  update(dt: number): void {
    const s = this.sample;
    const f = this.locator.filter;
    this.sinceMeasurement += dt;
    if (this.sinceMeasurement < 0.12) {
      s.x = f.x;
      s.y = f.y;
      s.vx = f.vx;
      s.vy = f.vy;
      s.conf = 1;
      s.visible = true;
    } else {
      // Coast briefly on the last known position, then report the puck as lost.
      s.vx *= Math.exp(-8 * dt);
      s.vy *= Math.exp(-8 * dt);
      s.conf = Math.max(0, 1 - (this.sinceMeasurement - 0.12) / 0.5);
      s.visible = this.sinceMeasurement < 0.6;
    }
    s.speed = Math.hypot(s.vx, s.vy);
  }

  destroy(): void {
    this.tracker.onFrame = null;
  }
}
