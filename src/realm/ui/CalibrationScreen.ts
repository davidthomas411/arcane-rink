import { CameraTracker, floorHomography, PuckLocator } from "../input/CameraSource";
import { DEFAULT_COLOR, type Calibration } from "../input/calibration";
import { applyHomography, clamp, escapeHtml, uid, type Vec } from "../util";

const CORNER_LABELS = ["Far left", "Far right", "Near right", "Near left"];
const FLOOR_MARGIN_FT = 1;

/**
 * Parent-facing setup: point the camera at the floor, mark the play area,
 * teach the tracker the puck colour, and mark where the rebounders sit.
 */
export class CalibrationScreen {
  private readonly el: HTMLDivElement;
  private readonly cal: Calibration;
  private readonly cam: HTMLCanvasElement;
  private readonly floor: HTMLCanvasElement;
  private readonly status: HTMLElement;
  private readonly readout: HTMLElement;
  private locator: PuckLocator | null = null;
  private puck: Vec | null = null;
  private puckSeenAt = 0;
  private mode: "corners" | "color" = "corners";
  private showMask = false;
  private dragCorner = -1;
  private dragRebounder: { index: number; end: "a" | "b" } | null = null;
  private raf = 0;
  private frameCount = 0;
  private rectified: ImageData | null = null;
  private readonly maskCanvas = document.createElement("canvas");
  private readonly rectCanvas = document.createElement("canvas");
  private closed = false;

  constructor(
    root: HTMLElement,
    initial: Calibration,
    private readonly tracker: CameraTracker,
    private cameraRunning: boolean,
    private readonly onDone: (cal: Calibration | null, cameraRunning: boolean) => void
  ) {
    this.cal = JSON.parse(JSON.stringify(initial)) as Calibration;
    this.el = document.createElement("div");
    this.el.className = "screen calib";
    this.el.innerHTML = `
      <header class="screen-head">
        <div><h1>Camera &amp; Floor Setup</h1><p class="lede">A one-time job for a grown-up. Takes about two minutes.</p></div>
        <div class="row">
          <button class="btn" data-act="cancel" type="button">Cancel</button>
          <button class="btn" data-act="save-mouse" type="button">Save · play with mouse</button>
          <button class="btn btn-primary" data-act="save-camera" type="button">Save · play with camera</button>
        </div>
      </header>
      <div class="calib-grid">
        <section class="panel">
          <h2>1 · Camera</h2>
          <div class="row">
            <select data-ref="devices" aria-label="Camera"><option value="">Default camera</option></select>
            <button class="btn btn-small" data-act="start" type="button">Start camera</button>
          </div>
          <div class="cam-wrap"><canvas data-ref="cam" width="960" height="540"></canvas></div>
          <div class="row">
            <button class="btn btn-small is-on" data-act="mode-corners" type="button">Drag the 4 floor corners</button>
            <button class="btn btn-small" data-act="mode-color" type="button">Click the puck to learn its colour</button>
            <label class="check"><input type="checkbox" data-ref="mask" /> Show what the tracker sees</label>
          </div>
          <p class="hint" data-ref="status">Mount the camera overhead (or high on a wall) looking down at the whole play area, then press Start camera.</p>
          <ul class="tips">
            <li><b>Far</b> means the edge nearest the TV. Whatever you mark as “Far left” is drawn top-left on the TV, so the picture matches what the player sees when facing it.</li>
            <li>Put the Green Biscuit on the floor and click it. Bright, even light helps; avoid green clothing and green toys in view.</li>
            <li>The puck is found when it is circled in yellow.</li>
          </ul>
        </section>
        <section class="panel">
          <h2>2 · Floor and rebounders</h2>
          <div class="row">
            <label>Width (ft) <input type="number" data-ref="w" min="4" max="30" step="0.5" /></label>
            <label>Depth (ft) <input type="number" data-ref="d" min="4" max="30" step="0.5" /></label>
          </div>
          <canvas class="floor-canvas" data-ref="floor" width="460" height="340"></canvas>
          <div class="row">
            <button class="btn btn-small" data-act="add-reb" type="button">+ Add rebounder</button>
            <button class="btn btn-small" data-act="del-reb" type="button">− Remove last</button>
          </div>
          <p class="hint">Drag the blue bars so they sit on your real rebounders. Passes are counted when the puck is fired into a bar and comes back.</p>
          <h2>3 · Puck colour</h2>
          <label class="slider">Colour range <input type="range" data-ref="hTol" min="6" max="60" step="1" /></label>
          <label class="slider">Minimum colourfulness <input type="range" data-ref="sMin" min="0.05" max="0.9" step="0.01" /></label>
          <label class="slider">Minimum brightness <input type="range" data-ref="vMin" min="0.05" max="0.9" step="0.01" /></label>
          <div class="row"><button class="btn btn-small" data-act="reset-color" type="button">Reset to Green Biscuit default</button></div>
          <p class="readout" data-ref="readout">Puck: not seen yet</p>
        </section>
      </div>`;
    root.replaceChildren(this.el);

    const ref = <T extends HTMLElement>(name: string): T => this.el.querySelector<T>(`[data-ref="${name}"]`)!;
    this.cam = ref<HTMLCanvasElement>("cam");
    this.floor = ref<HTMLCanvasElement>("floor");
    this.status = ref("status");
    this.readout = ref("readout");

    const w = ref<HTMLInputElement>("w");
    const d = ref<HTMLInputElement>("d");
    w.value = `${this.cal.arenaW}`;
    d.value = `${this.cal.arenaD}`;
    const onSize = (): void => {
      const oldW = this.cal.arenaW;
      const oldD = this.cal.arenaD;
      this.cal.arenaW = clamp(Number(w.value) || oldW, 4, 30);
      this.cal.arenaD = clamp(Number(d.value) || oldD, 4, 30);
      // Keep rebounders in the same relative place when the floor is resized.
      for (const reb of this.cal.rebounders) {
        reb.ax *= this.cal.arenaW / oldW;
        reb.bx *= this.cal.arenaW / oldW;
        reb.ay *= this.cal.arenaD / oldD;
        reb.by *= this.cal.arenaD / oldD;
      }
      this.refreshLocator();
    };
    w.addEventListener("change", onSize);
    d.addEventListener("change", onSize);

    for (const key of ["hTol", "sMin", "vMin"] as const) {
      const input = ref<HTMLInputElement>(key);
      input.value = `${this.cal.color[key]}`;
      input.addEventListener("input", () => {
        this.cal.color[key] = Number(input.value);
        this.tracker.color = this.cal.color;
      });
    }
    ref<HTMLInputElement>("mask").addEventListener("change", (event) => {
      this.showMask = (event.target as HTMLInputElement).checked;
    });
    ref<HTMLSelectElement>("devices").addEventListener("change", (event) => {
      this.cal.deviceId = (event.target as HTMLSelectElement).value || null;
      if (this.cameraRunning) void this.startCamera();
    });

    this.el.addEventListener("click", (event) => {
      const act = (event.target as HTMLElement).closest<HTMLElement>("[data-act]")?.dataset.act;
      if (!act) return;
      if (act === "cancel") this.close(null);
      else if (act === "save-mouse") this.close("mouse");
      else if (act === "save-camera") this.close("camera");
      else if (act === "start") void this.startCamera();
      else if (act === "mode-corners" || act === "mode-color") {
        this.mode = act === "mode-corners" ? "corners" : "color";
        this.el.querySelector('[data-act="mode-corners"]')!.classList.toggle("is-on", this.mode === "corners");
        this.el.querySelector('[data-act="mode-color"]')!.classList.toggle("is-on", this.mode === "color");
      } else if (act === "add-reb") {
        if (this.cal.rebounders.length < 6) {
          const n = this.cal.rebounders.length + 1;
          this.cal.rebounders.push({ id: uid(), name: `Crystal ${n}`, ax: this.cal.arenaW, ay: this.cal.arenaD * 0.3, bx: this.cal.arenaW, by: this.cal.arenaD * 0.7 });
        }
      } else if (act === "del-reb") {
        this.cal.rebounders.pop();
      } else if (act === "reset-color") {
        this.cal.color = { ...DEFAULT_COLOR };
        this.tracker.color = this.cal.color;
        this.syncSliders();
      }
    });

    this.bindCameraPointer();
    this.bindFloorPointer();
    this.tracker.color = this.cal.color;
    this.tracker.onFrame = (timeSec) => this.onTrackerFrame(timeSec);
    if (this.cameraRunning) {
      this.refreshLocator();
      void this.listDevices();
      this.status.textContent = "Camera running. Drag the four corners onto the corners of your play area.";
    }
    this.raf = requestAnimationFrame(this.draw);
  }

  private syncSliders(): void {
    for (const key of ["hTol", "sMin", "vMin"] as const) {
      this.el.querySelector<HTMLInputElement>(`[data-ref="${key}"]`)!.value = `${this.cal.color[key]}`;
    }
  }

  private refreshLocator(): void {
    if (this.tracker.width < 2) return;
    if (this.locator) this.locator.setCalibration(this.cal, this.tracker.width, this.tracker.height);
    else this.locator = new PuckLocator(this.cal, this.tracker.width, this.tracker.height);
  }

  private async startCamera(): Promise<void> {
    this.status.textContent = "Starting camera…";
    try {
      await this.tracker.start(this.cal.deviceId);
      this.cameraRunning = true;
      this.refreshLocator();
      await this.listDevices();
      this.status.textContent = "Camera running. Drag the four corners onto the corners of your play area.";
    } catch (error) {
      this.cameraRunning = false;
      const message = error instanceof Error ? error.message : String(error);
      this.status.textContent = `Could not open the camera: ${message}. Check the browser's camera permission and that no other app is using it.`;
    }
  }

  private async listDevices(): Promise<void> {
    try {
      const devices = (await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === "videoinput");
      const select = this.el.querySelector<HTMLSelectElement>('[data-ref="devices"]')!;
      const active = this.tracker.activeDeviceId;
      select.innerHTML = devices
        .map((d, i) => `<option value="${escapeHtml(d.deviceId)}"${d.deviceId === active ? " selected" : ""}>${escapeHtml(d.label || `Camera ${i + 1}`)}</option>`)
        .join("");
    } catch {
      // Listing is optional; the default camera still works.
    }
  }

  private onTrackerFrame(timeSec: number): void {
    if (!this.locator) return;
    const p = this.locator.locate(this.tracker.blobs, timeSec);
    if (p) {
      this.puck = { x: this.locator.filter.x, y: this.locator.filter.y };
      this.puckSeenAt = performance.now();
    }
  }

  // ------------------------------------------------------------- pointers

  private camPoint(event: PointerEvent): Vec {
    const rect = this.cam.getBoundingClientRect();
    return { x: clamp((event.clientX - rect.left) / rect.width, 0, 1), y: clamp((event.clientY - rect.top) / rect.height, 0, 1) };
  }

  private bindCameraPointer(): void {
    this.cam.addEventListener("pointerdown", (event) => {
      const p = this.camPoint(event);
      if (this.mode === "color") {
        const color = this.tracker.sampleColor(p.x, p.y);
        if (color) {
          this.cal.color = color;
          this.tracker.color = color;
          this.syncSliders();
          this.status.textContent = "Colour learned. The puck should now be circled in yellow — slide it around to check it is followed everywhere.";
        }
        return;
      }
      let best = -1;
      let bestD = 0.08;
      this.cal.corners.forEach((c, i) => {
        const dd = Math.hypot(c.x - p.x, c.y - p.y);
        if (dd < bestD) {
          bestD = dd;
          best = i;
        }
      });
      if (best >= 0) {
        this.dragCorner = best;
        this.cam.setPointerCapture(event.pointerId);
      }
    });
    this.cam.addEventListener("pointermove", (event) => {
      if (this.dragCorner < 0) return;
      this.cal.corners[this.dragCorner] = this.camPoint(event);
      this.refreshLocator();
    });
    const end = (): void => {
      this.dragCorner = -1;
    };
    this.cam.addEventListener("pointerup", end);
    this.cam.addEventListener("pointercancel", end);
  }

  private floorScale(): number {
    return Math.min(this.floor.width / (this.cal.arenaW + FLOOR_MARGIN_FT * 2), this.floor.height / (this.cal.arenaD + FLOOR_MARGIN_FT * 2));
  }

  private floorPoint(event: PointerEvent): Vec {
    const rect = this.floor.getBoundingClientRect();
    const s = this.floorScale();
    return {
      x: ((event.clientX - rect.left) * (this.floor.width / rect.width)) / s - FLOOR_MARGIN_FT,
      y: ((event.clientY - rect.top) * (this.floor.height / rect.height)) / s - FLOOR_MARGIN_FT
    };
  }

  private bindFloorPointer(): void {
    this.floor.addEventListener("pointerdown", (event) => {
      const p = this.floorPoint(event);
      let bestD = 0.8;
      this.dragRebounder = null;
      this.cal.rebounders.forEach((reb, index) => {
        const da = Math.hypot(reb.ax - p.x, reb.ay - p.y);
        const db = Math.hypot(reb.bx - p.x, reb.by - p.y);
        if (da < bestD) {
          bestD = da;
          this.dragRebounder = { index, end: "a" };
        }
        if (db < bestD) {
          bestD = db;
          this.dragRebounder = { index, end: "b" };
        }
      });
      if (this.dragRebounder) this.floor.setPointerCapture(event.pointerId);
    });
    this.floor.addEventListener("pointermove", (event) => {
      const drag = this.dragRebounder;
      if (!drag) return;
      const p = this.floorPoint(event);
      const reb = this.cal.rebounders[drag.index];
      if (!reb) return;
      const x = clamp(Math.round(p.x * 4) / 4, -FLOOR_MARGIN_FT, this.cal.arenaW + FLOOR_MARGIN_FT);
      const y = clamp(Math.round(p.y * 4) / 4, -FLOOR_MARGIN_FT, this.cal.arenaD + FLOOR_MARGIN_FT);
      if (drag.end === "a") {
        reb.ax = x;
        reb.ay = y;
      } else {
        reb.bx = x;
        reb.by = y;
      }
    });
    const end = (): void => {
      this.dragRebounder = null;
    };
    this.floor.addEventListener("pointerup", end);
    this.floor.addEventListener("pointercancel", end);
  }

  // ---------------------------------------------------------------- draw

  private readonly draw = (): void => {
    if (this.closed) return;
    this.frameCount += 1;
    this.drawCamera();
    this.drawFloor();
    const fresh = performance.now() - this.puckSeenAt < 400;
    this.readout.textContent = this.cameraRunning
      ? fresh && this.puck
        ? `Puck found at ${this.puck.x.toFixed(1)} ft across, ${this.puck.y.toFixed(1)} ft from the far edge.`
        : "Puck: not found — click the puck in the camera view, or adjust the sliders."
      : "Camera is off. You can still set the floor size and rebounders for mouse play.";
    this.readout.classList.toggle("is-good", this.cameraRunning && fresh);
    this.raf = requestAnimationFrame(this.draw);
  };

  private drawCamera(): void {
    const ctx = this.cam.getContext("2d")!;
    const cw = this.cam.width;
    const ch = this.cam.height;
    ctx.fillStyle = "#0b0c0e";
    ctx.fillRect(0, 0, cw, ch);
    const tw = this.tracker.width;
    const th = this.tracker.height;
    if (this.cameraRunning && this.tracker.frame && tw > 2) {
      ctx.drawImage(this.tracker.proc, 0, 0, cw, ch);
      if (this.showMask) {
        this.maskCanvas.width = tw;
        this.maskCanvas.height = th;
        const mctx = this.maskCanvas.getContext("2d")!;
        const img = mctx.createImageData(tw, th);
        const mask = this.tracker.maskData;
        for (let i = 0; i < mask.length; i += 1) {
          if (mask[i] !== 0) {
            img.data[i * 4] = 255;
            img.data[i * 4 + 1] = 0;
            img.data[i * 4 + 2] = 255;
            img.data[i * 4 + 3] = 255;
          }
        }
        mctx.putImageData(img, 0, 0);
        ctx.fillStyle = "rgba(0,0,0,0.55)";
        ctx.fillRect(0, 0, cw, ch);
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(this.maskCanvas, 0, 0, cw, ch);
        ctx.imageSmoothingEnabled = true;
      }
      const hg = floorHomography(this.cal);
      if (hg && this.puck && performance.now() - this.puckSeenAt < 400) {
        const p = applyHomography(hg.toImage, this.puck.x, this.puck.y);
        ctx.beginPath();
        ctx.arc(p.x * cw, p.y * ch, 18, 0, Math.PI * 2);
        ctx.lineWidth = 4;
        ctx.strokeStyle = "#ffe14a";
        ctx.stroke();
      }
    } else {
      ctx.fillStyle = "#b7aa90";
      ctx.font = "600 22px Georgia, serif";
      ctx.textAlign = "center";
      ctx.fillText("Camera is off", cw / 2, ch / 2);
    }

    const pts = this.cal.corners.map((c) => ({ x: c.x * cw, y: c.y * ch }));
    ctx.beginPath();
    pts.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
    ctx.closePath();
    ctx.fillStyle = "rgba(212,175,55,0.08)";
    ctx.fill();
    ctx.lineWidth = 3;
    ctx.strokeStyle = "#d4af37";
    ctx.stroke();
    ctx.font = "700 18px Georgia, serif";
    ctx.textAlign = "center";
    pts.forEach((p, i) => {
      ctx.beginPath();
      ctx.arc(p.x, p.y, 13, 0, Math.PI * 2);
      ctx.fillStyle = i === this.dragCorner ? "#fff" : "#d4af37";
      ctx.fill();
      ctx.lineWidth = 3;
      ctx.strokeStyle = "#0f1113";
      ctx.stroke();
      const ly = p.y + (p.y < ch / 2 ? -22 : 34);
      ctx.lineWidth = 4;
      ctx.strokeText(CORNER_LABELS[i]!, clamp(p.x, 50, cw - 50), clamp(ly, 18, ch - 8));
      ctx.fillStyle = "#fff3c4";
      ctx.fillText(CORNER_LABELS[i]!, clamp(p.x, 50, cw - 50), clamp(ly, 18, ch - 8));
    });
  }

  /** Warp the camera picture into a top-down floor view so rebounders can be placed by eye. */
  private rectify(): void {
    const frame = this.tracker.frame;
    const hg = floorHomography(this.cal);
    if (!frame || !hg) {
      this.rectified = null;
      return;
    }
    const step = 2;
    const ow = Math.floor(this.floor.width / step);
    const oh = Math.floor(this.floor.height / step);
    const out = this.rectified && this.rectified.width === ow ? this.rectified : new ImageData(ow, oh);
    const s = this.floorScale() / step;
    for (let j = 0; j < oh; j += 1) {
      for (let i = 0; i < ow; i += 1) {
        const p = applyHomography(hg.toImage, i / s - FLOOR_MARGIN_FT, j / s - FLOOR_MARGIN_FT);
        const sx = Math.floor(p.x * frame.width);
        const sy = Math.floor(p.y * frame.height);
        const o = (j * ow + i) * 4;
        if (sx < 0 || sy < 0 || sx >= frame.width || sy >= frame.height) {
          out.data[o + 3] = 0;
          continue;
        }
        const q = (sy * frame.width + sx) * 4;
        out.data[o] = frame.data[q]!;
        out.data[o + 1] = frame.data[q + 1]!;
        out.data[o + 2] = frame.data[q + 2]!;
        out.data[o + 3] = 255;
      }
    }
    this.rectified = out;
  }

  private drawFloor(): void {
    const ctx = this.floor.getContext("2d")!;
    const s = this.floorScale();
    const m = FLOOR_MARGIN_FT * s;
    ctx.fillStyle = "#101214";
    ctx.fillRect(0, 0, this.floor.width, this.floor.height);
    if (this.cameraRunning) {
      if (this.frameCount % 6 === 0 || !this.rectified) this.rectify();
      if (this.rectified) {
        this.rectCanvas.width = this.rectified.width;
        this.rectCanvas.height = this.rectified.height;
        this.rectCanvas.getContext("2d")!.putImageData(this.rectified, 0, 0);
        ctx.drawImage(this.rectCanvas, 0, 0, this.rectCanvas.width * 2, this.rectCanvas.height * 2);
      }
    } else {
      ctx.fillStyle = "#1c2833";
      ctx.fillRect(m, m, this.cal.arenaW * s, this.cal.arenaD * s);
    }
    ctx.lineWidth = 2;
    ctx.strokeStyle = "#d4af37";
    ctx.strokeRect(m, m, this.cal.arenaW * s, this.cal.arenaD * s);
    ctx.fillStyle = "#b7aa90";
    ctx.font = "600 13px Georgia, serif";
    ctx.textAlign = "center";
    ctx.fillText("TV side (far)", m + (this.cal.arenaW * s) / 2, m - 8);
    ctx.fillText("Player side (near)", m + (this.cal.arenaW * s) / 2, m + this.cal.arenaD * s + 16);

    for (const reb of this.cal.rebounders) {
      ctx.beginPath();
      ctx.moveTo(m + reb.ax * s, m + reb.ay * s);
      ctx.lineTo(m + reb.bx * s, m + reb.by * s);
      ctx.lineWidth = 7;
      ctx.lineCap = "round";
      ctx.strokeStyle = "#6fa8dc";
      ctx.stroke();
      for (const [x, y] of [[reb.ax, reb.ay], [reb.bx, reb.by]] as const) {
        ctx.beginPath();
        ctx.arc(m + x * s, m + y * s, 8, 0, Math.PI * 2);
        ctx.fillStyle = "#fff";
        ctx.fill();
        ctx.lineWidth = 2;
        ctx.strokeStyle = "#1f2123";
        ctx.stroke();
      }
    }
    if (this.cameraRunning && this.puck && performance.now() - this.puckSeenAt < 400) {
      ctx.beginPath();
      ctx.arc(m + this.puck.x * s, m + this.puck.y * s, 8, 0, Math.PI * 2);
      ctx.fillStyle = "#59e07a";
      ctx.fill();
      ctx.lineWidth = 3;
      ctx.strokeStyle = "#ffe14a";
      ctx.stroke();
    }
  }

  private close(save: "mouse" | "camera" | null): void {
    if (save === "camera" && !this.cameraRunning) {
      this.status.textContent = "Start the camera first, or choose “Save · play with mouse”.";
      return;
    }
    this.closed = true;
    cancelAnimationFrame(this.raf);
    this.tracker.onFrame = null;
    if (!save) {
      this.onDone(null, this.cameraRunning);
      return;
    }
    this.cal.input = save;
    if (this.cameraRunning) {
      this.cal.cameraReady = true;
      this.cal.deviceId = this.tracker.activeDeviceId ?? this.cal.deviceId;
    }
    this.onDone(this.cal, this.cameraRunning);
  }
}
