/**
 * Client for the Fast SAM 3D Body webcam server (the 3d-mesh-demo-webcam repo).
 *
 * Protocol, as that server defines it: over a WebSocket at /stream, send a JSON
 * text frame of metadata followed by a binary JPEG; receive a JSON text frame
 * (keypoints, camera translation) followed by a binary float32 array of mesh
 * vertices in camera coordinates (x right, y down, z forward, metres).
 * GET /topology returns the triangle list.
 *
 * It uses a SECOND camera that faces the player (the puck camera looks down at
 * the floor and cannot see a body). Expect roughly 7 poses a second and about
 * 150 ms of delay: fine for showing the player as an avatar and for judging
 * posture, too slow to steer fast action.
 */

/** Keypoint indices in the server's 70-point layout (the first 17 follow the usual body order). */
const KP = { nose: 0, earL: 3, earR: 4, shoulderL: 5, shoulderR: 6, hipL: 9, hipR: 10, kneeL: 11, kneeR: 12, ankleL: 13, ankleR: 14, wristR: 41, wristL: 62 };

export type BodyFrame = {
  /** Mesh vertices, xyz triples, camera coordinates. */
  vertices: Float32Array;
  keypoints2d: number[][];
  /** Present only if the server has been patched to send them. */
  keypoints3d: number[][] | null;
  camT: number[];
  inferenceMs: number;
  /** Capture-to-result delay in milliseconds. */
  latencyMs: number;
};

export type BodyStatus = "off" | "connecting" | "live" | "no-person" | "error";

function httpBase(address: string): string {
  const trimmed = address.trim().replace(/\/+$/, "");
  // A path such as "/body" means "through this page's own server", which the dev server forwards.
  if (trimmed.startsWith("/")) return `${window.location.origin}${trimmed}`;
  return /^https?:\/\//.test(trimmed) ? trimmed : `http://${trimmed}`;
}

export class BodyTracker {
  status: BodyStatus = "off";
  error = "";
  faces: Uint32Array | null = null;
  vertexCount = 0;
  latest: BodyFrame | null = null;
  /** Bumps each time a new pose arrives. */
  frameId = 0;
  fps = 0;
  /** 0..1 smoothed share of recent poses with the head up. */
  headsUp = 1;
  /** How far the head is tipped down right now (larger = looking at the floor). */
  headDrop = 0;
  /** 0 (standing tall) .. 1 (deep hockey crouch). */
  kneeBend = 0;
  readonly video: HTMLVideoElement;

  private socket: WebSocket | null = null;
  private stream: MediaStream | null = null;
  private readonly capture = document.createElement("canvas");
  private running = false;
  private pendingMeta: Record<string, unknown> | null = null;
  private waiting: ((ok: boolean) => void) | null = null;
  private baseline: number | null = null;
  private lastFrameAt = 0;
  private dropSmooth = 0;

  constructor() {
    this.video = document.createElement("video");
    this.video.playsInline = true;
    this.video.muted = true;
  }

  get active(): boolean {
    return this.status === "live" || this.status === "no-person";
  }

  async start(address: string, deviceId: string | null): Promise<void> {
    this.stop();
    this.status = "connecting";
    this.error = "";
    try {
      const base = httpBase(address);
      const topo = (await (await fetch(`${base}/topology`)).json()) as { ready?: boolean; vertex_count?: number; faces?: number[] };
      if (!topo.ready || !topo.faces || !topo.vertex_count) throw new Error("The body-tracking server is not ready yet");
      this.faces = Uint32Array.from(topo.faces);
      this.vertexCount = topo.vertex_count;

      const video: MediaTrackConstraints = { width: { ideal: 1280 }, height: { ideal: 720 } };
      if (deviceId) video.deviceId = { exact: deviceId };
      this.stream = await navigator.mediaDevices.getUserMedia({ video, audio: false });
      this.video.srcObject = this.stream;
      await this.video.play();

      const socket = new WebSocket(`${base.replace(/^http/, "ws")}/stream`);
      socket.binaryType = "arraybuffer";
      this.socket = socket;
      await new Promise<void>((resolve, reject) => {
        socket.onopen = () => resolve();
        socket.onerror = () => reject(new Error("Could not open the stream to the body-tracking server"));
      });
      socket.onmessage = (event) => this.onMessage(event);
      socket.onclose = () => {
        if (this.running) {
          this.status = "error";
          this.error = "The body-tracking server closed the connection";
        }
        this.waiting?.(false);
      };
      this.running = true;
      this.status = "no-person";
      void this.loop();
    } catch (error) {
      this.stop();
      this.status = "error";
      this.error = error instanceof Error ? error.message : String(error);
      throw error;
    }
  }

  get activeDeviceId(): string | null {
    return this.stream?.getVideoTracks()[0]?.getSettings().deviceId ?? null;
  }

  /** Call while the player is looking at the TV: this pose becomes "head up". */
  calibrateHeadsUp(): void {
    this.baseline = this.dropSmooth;
  }

  private async loop(): Promise<void> {
    const ctx = this.capture.getContext("2d")!;
    while (this.running && this.socket?.readyState === WebSocket.OPEN) {
      const vw = this.video.videoWidth;
      const vh = this.video.videoHeight;
      if (vw < 2) {
        await new Promise((r) => setTimeout(r, 100));
        continue;
      }
      this.capture.width = 640;
      this.capture.height = Math.round((640 * vh) / vw);
      const t0 = performance.now();
      ctx.drawImage(this.video, 0, 0, this.capture.width, this.capture.height);
      const blob = await new Promise<Blob | null>((resolve) => this.capture.toBlob(resolve, "image/jpeg", 0.8));
      if (!blob || !this.running || this.socket?.readyState !== WebSocket.OPEN) continue;
      this.socket.send(JSON.stringify({ capture_timestamp_ms: t0, encode_ms: performance.now() - t0 }));
      this.socket.send(await blob.arrayBuffer());
      // One frame in flight at a time: wait for this one's answer before sending the next.
      await new Promise<boolean>((resolve) => {
        this.waiting = resolve;
        setTimeout(() => resolve(false), 5000);
      });
      this.waiting = null;
    }
  }

  private onMessage(event: MessageEvent): void {
    if (typeof event.data === "string") {
      const meta = JSON.parse(event.data) as Record<string, unknown>;
      if (meta.error) {
        this.error = String(meta.error);
        this.waiting?.(false);
        return;
      }
      if (meta.type === "config") return;
      if (meta.no_person) {
        this.status = "no-person";
        this.waiting?.(true);
        return;
      }
      this.pendingMeta = meta;
      return;
    }
    const meta = this.pendingMeta;
    this.pendingMeta = null;
    if (!meta || !(event.data instanceof ArrayBuffer)) return;
    const now = performance.now();
    const keypoints2d = (meta.pred_keypoints_2d as number[][]) ?? [];
    const keypoints3d = Array.isArray(meta.pred_keypoints_3d) ? (meta.pred_keypoints_3d as number[][]) : null;
    this.latest = {
      vertices: new Float32Array(event.data),
      keypoints2d,
      keypoints3d,
      camT: (meta.pred_cam_t as number[]) ?? [0, 0, 3],
      inferenceMs: Number(meta.inference_ms ?? 0),
      latencyMs: now - Number(meta.capture_timestamp_ms ?? now)
    };
    this.frameId += 1;
    this.status = "live";
    if (this.lastFrameAt > 0) this.fps = this.fps * 0.8 + (1000 / Math.max(1, now - this.lastFrameAt)) * 0.2;
    this.lastFrameAt = now;
    this.measure(keypoints2d, keypoints3d);
    this.waiting?.(true);
  }

  /** Posture read from the skeleton: is the head up, are the knees bent? */
  private measure(k2: number[][], k3: number[][] | null): void {
    const p = (i: number): number[] | undefined => k2[i];
    const nose = p(KP.nose);
    const earL = p(KP.earL);
    const earR = p(KP.earR);
    const shL = p(KP.shoulderL);
    const shR = p(KP.shoulderR);
    let drop: number | null = null;
    if (k3 && k3[KP.nose] && k3[KP.earL] && k3[KP.earR]) {
      // With 3D joints: the angle of the face below level. Camera y points down, z away from the camera.
      const n = k3[KP.nose]!;
      const ex = (k3[KP.earL]![0]! + k3[KP.earR]![0]!) / 2;
      const ey = (k3[KP.earL]![1]! + k3[KP.earR]![1]!) / 2;
      const ez = (k3[KP.earL]![2]! + k3[KP.earR]![2]!) / 2;
      drop = Math.atan2(n[1]! - ey, Math.hypot(n[0]! - ex, n[2]! - ez));
    } else if (nose && earL && earR && shL && shR) {
      // From the picture alone: how far the nose sits below the line of the ears, in shoulder-widths.
      const width = Math.hypot(shL[0]! - shR[0]!, shL[1]! - shR[1]!);
      if (width > 4) drop = (nose[1]! - (earL[1]! + earR[1]!) / 2) / width;
    }
    if (drop !== null && Number.isFinite(drop)) {
      this.dropSmooth = this.dropSmooth * 0.6 + drop * 0.4;
      const base = this.baseline ?? this.dropSmooth;
      if (this.baseline === null) this.baseline = base;
      this.headDrop = this.dropSmooth - base;
      const up = this.headDrop < (k3 ? 0.3 : 0.14) ? 1 : 0;
      this.headsUp = this.headsUp * 0.8 + up * 0.2;
    }
    const hip = p(KP.hipL);
    const knee = p(KP.kneeL);
    const ankle = p(KP.ankleL);
    if (hip && knee && ankle) {
      const a = Math.atan2(hip[1]! - knee[1]!, hip[0]! - knee[0]!);
      const b = Math.atan2(ankle[1]! - knee[1]!, ankle[0]! - knee[0]!);
      let bend = Math.abs(a - b);
      if (bend > Math.PI) bend = Math.PI * 2 - bend;
      this.kneeBend = this.kneeBend * 0.7 + Math.max(0, Math.min(1, (Math.PI - bend) / 1.2)) * 0.3;
    }
  }

  stop(): void {
    this.running = false;
    this.waiting?.(false);
    this.socket?.close();
    this.socket = null;
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
    this.video.srcObject = null;
    this.status = "off";
    this.latest = null;
  }
}

export const BODY_KEYPOINTS = KP;
