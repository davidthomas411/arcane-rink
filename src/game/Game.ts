import { MousePuckProvider } from "../providers/MousePuckProvider";
import { computePadBounds, type Rect } from "../tracking/PadRenderer2D";
import { TrackingHUD } from "../tracking/TrackingHUD";
import { Effects2D } from "../tracking/Effects2D";
import { RuneGatesHUD, type RuneGatesSessionSummary } from "./minigames/RuneGatesHUD";
import { DEFAULT_MONSTER_TEAM, type MonsterTeam } from "./MonsterTeams";

type GameElements = {
  mount: HTMLElement;
  canvas: HTMLCanvasElement;
  overlay: HTMLElement;
  playerDisplayName?: string;
  playerRunCount?: number;
  trainingMode?: boolean;
  spellDemoMode?: boolean;
  monsterTeam?: MonsterTeam;
  playerLoadoutSummary?: {
    helmet: string;
    stick: string;
    gloves: string;
  };
  onRunComplete?: (summary: RuneGatesSessionSummary) => void;
};

export type GameRunSummary = RuneGatesSessionSummary;

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export class Game {
  private readonly mount: HTMLElement;
  private readonly canvas: HTMLCanvasElement;
  private readonly overlay: HTMLElement;
  private readonly ctx: CanvasRenderingContext2D;

  private readonly effects = new Effects2D();
  private readonly provider: MousePuckProvider;
  private readonly trackingHud: TrackingHUD;
  private readonly runeGates: RuneGatesHUD;

  private rafId = 0;
  private running = false;
  private lastTimeMs = 0;
  private viewWidth = 0;
  private viewHeight = 0;
  private dpr = 1;
  private padBounds: Rect = { x: 0, y: 0, width: 1, height: 1 };
  private backdropCacheCanvas: HTMLCanvasElement | null = null;
  private backdropCacheKey = "";
  private backdropCacheDirty = true;
  private readonly arenaBackdrop = new Image();
  private arenaBackdropReady = false;

  private readonly onResizeBound = (): void => {
    this.resize();
  };

  constructor(elements: GameElements) {
    this.mount = elements.mount;
    this.canvas = elements.canvas;
    this.overlay = elements.overlay;

    const ctx = this.canvas.getContext("2d");
    if (!ctx) {
      throw new Error("2D canvas context unavailable");
    }
    this.ctx = ctx;

    this.arenaBackdrop.decoding = "async";
    this.loadPreferredArenaBackdrop();

    this.provider = new MousePuckProvider(this.canvas, () => this.getPadBounds());
    this.trackingHud = new TrackingHUD({
      provider: this.provider,
      overlayRoot: this.overlay,
      inputLabel: "Mouse (DEV)"
    });
    const monsterTeam = elements.monsterTeam ?? DEFAULT_MONSTER_TEAM;
    this.runeGates = new RuneGatesHUD({
      provider: this.provider,
      overlayRoot: this.overlay,
      getPadBounds: () => this.getPadBounds(),
      effects: this.effects,
      monsterTeam,
      playerDisplayName: elements.playerDisplayName,
      playerRunCount: elements.playerRunCount,
      trainingMode: elements.trainingMode,
      spellDemoMode: elements.spellDemoMode,
      playerLoadoutSummary: elements.playerLoadoutSummary,
      onSessionEnd: elements.onRunComplete
    });

    window.addEventListener("resize", this.onResizeBound);
    this.resize();
  }

  private loadPreferredArenaBackdrop(): void {
    const geminiA = new URL("../../tmp/Gemini_Generated_Image_tov9g9tov9g9tov9.png", import.meta.url).href;
    const geminiB = new URL("../../tmp/Gemini_Generated_Image_njabtmnjabtmnjab.png", import.meta.url).href;
    const rinkFallback = new URL("../../tmp/rink-style.png", import.meta.url).href;
    const first = Math.random() < 0.5 ? geminiA : geminiB;
    const second = first === geminiA ? geminiB : geminiA;
    const candidates = [first, second, rinkFallback];

    const tryLoad = (index: number): void => {
      if (index >= candidates.length) {
        return;
      }
      const url = candidates[index]!;
      this.arenaBackdropReady = false;
      this.arenaBackdrop.onload = () => {
        this.arenaBackdropReady = true;
        this.invalidateBackdropCache();
      };
      this.arenaBackdrop.onerror = () => {
        tryLoad(index + 1);
      };
      this.arenaBackdrop.src = url;
    };

    tryLoad(0);
  }

  start(): void {
    if (this.running) {
      return;
    }
    this.running = true;
    this.lastTimeMs = 0;
    this.rafId = requestAnimationFrame(this.frame);
  }

  destroy(): void {
    this.running = false;
    if (this.rafId) {
      cancelAnimationFrame(this.rafId);
      this.rafId = 0;
    }
    window.removeEventListener("resize", this.onResizeBound);
    this.provider.destroy();
    this.trackingHud.destroy();
    this.runeGates.destroy();
    this.backdropCacheCanvas = null;
    this.backdropCacheKey = "";
    this.backdropCacheDirty = true;
  }

  private readonly frame = (timeMs: number): void => {
    if (!this.running) {
      return;
    }

    const dt = this.lastTimeMs === 0 ? 1 / 60 : clamp((timeMs - this.lastTimeMs) / 1000, 1 / 240, 0.05);
    this.lastTimeMs = timeMs;
    const timeSec = timeMs / 1000;

    this.update(dt);
    if (!this.running) {
      return;
    }
    this.render(timeSec);
    if (!this.running) {
      return;
    }

    this.rafId = requestAnimationFrame(this.frame);
  };

  private update(dt: number): void {
    this.provider.update(dt);
    this.trackingHud.update(dt);
    this.runeGates.update(dt);
    this.effects.update(dt);
  }

  private render(timeSec: number): void {
    const ctx = this.ctx;
    const w = this.viewWidth;
    const h = this.viewHeight;

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);

    this.drawBackdrop(ctx, w, h, timeSec);

    const padRect = this.getPadBounds();
    const shake = this.effects.getShakeOffset(timeSec);

    ctx.save();
    ctx.translate(shake.x, shake.y);
    this.trackingHud.renderPad(ctx, padRect, timeSec);
    this.runeGates.renderWorld(ctx, padRect, timeSec);
    this.effects.render(ctx);
    this.trackingHud.renderReticle(ctx, padRect, timeSec);
    ctx.restore();

    this.runeGates.renderScreenOutroOverlay(ctx, w, h, timeSec);
  }

  private drawBackdrop(
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number,
    timeSec: number
  ): void {
    const hasRinkReferenceBackdrop =
      this.arenaBackdropReady &&
      this.arenaBackdrop.naturalWidth > 0 &&
      this.arenaBackdrop.naturalHeight > 0;

    const cache = this.getBackdropCacheCanvas(width, height, hasRinkReferenceBackdrop);
    if (cache) {
      ctx.drawImage(cache, 0, 0, width, height);
    } else {
      this.renderStaticBackdrop(ctx, width, height, hasRinkReferenceBackdrop);
    }

    this.renderAnimatedBackdrop(ctx, width, height, timeSec, hasRinkReferenceBackdrop);
  }

  private invalidateBackdropCache(): void {
    this.backdropCacheDirty = true;
  }

  private getBackdropCacheCanvas(
    width: number,
    height: number,
    hasRinkReferenceBackdrop: boolean
  ): HTMLCanvasElement | null {
    const cacheKey = `${Math.round(width)}x${Math.round(height)}:${hasRinkReferenceBackdrop ? this.arenaBackdrop.src : "procedural"}`;
    if (!this.backdropCacheDirty && this.backdropCacheCanvas && this.backdropCacheKey === cacheKey) {
      return this.backdropCacheCanvas;
    }

    const canvas = this.backdropCacheCanvas ?? document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(width));
    canvas.height = Math.max(1, Math.round(height));
    const cacheCtx = canvas.getContext("2d");
    if (!cacheCtx) {
      return null;
    }

    cacheCtx.setTransform(1, 0, 0, 1, 0, 0);
    cacheCtx.clearRect(0, 0, canvas.width, canvas.height);
    this.renderStaticBackdrop(cacheCtx, width, height, hasRinkReferenceBackdrop);
    this.backdropCacheCanvas = canvas;
    this.backdropCacheKey = cacheKey;
    this.backdropCacheDirty = false;
    return canvas;
  }

  private renderStaticBackdrop(
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number,
    hasRinkReferenceBackdrop: boolean
  ): void {
    const bg = ctx.createLinearGradient(0, 0, 0, height);
    bg.addColorStop(0, "#0f1113");
    bg.addColorStop(0.34, "#161617");
    bg.addColorStop(0.72, "#171311");
    bg.addColorStop(1, "#0d0c0c");
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, width, height);

    const horizonGlow = ctx.createRadialGradient(
      width * 0.5,
      height * 0.46,
      20,
      width * 0.5,
      height * 0.46,
      Math.max(width, height) * 0.78
    );
    horizonGlow.addColorStop(0, "rgba(212, 175, 55, 0.07)");
    horizonGlow.addColorStop(0.35, "rgba(177, 58, 26, 0.04)");
    horizonGlow.addColorStop(1, "rgba(177, 58, 26, 0)");
    ctx.fillStyle = horizonGlow;
    ctx.fillRect(0, 0, width, height);

    if (hasRinkReferenceBackdrop) {
      const img = this.arenaBackdrop;
      const scale = Math.max(width / img.naturalWidth, height / img.naturalHeight);
      const drawW = img.naturalWidth * scale;
      const drawH = img.naturalHeight * scale;
      const drawX = (width - drawW) * 0.5;
      const drawY = (height - drawH) * 0.54;
      ctx.save();
      ctx.globalAlpha = 0.9;
      ctx.drawImage(img, drawX, drawY, drawW, drawH);
      ctx.restore();

      // Keep the pad readable over the reference image.
      ctx.fillStyle = "rgba(8, 8, 8, 0.24)";
      ctx.fillRect(0, 0, width, height);

      const coolCenterLift = ctx.createRadialGradient(
        width * 0.5,
        height * 0.58,
        10,
        width * 0.5,
        height * 0.58,
        Math.max(width, height) * 0.52
      );
      coolCenterLift.addColorStop(0, "rgba(212, 175, 55, 0.05)");
      coolCenterLift.addColorStop(0.45, "rgba(143, 126, 93, 0.03)");
      coolCenterLift.addColorStop(1, "rgba(143, 126, 93, 0)");
      ctx.fillStyle = coolCenterLift;
      ctx.fillRect(0, 0, width, height);
    }

    if (!hasRinkReferenceBackdrop) {
      // Cathedral rink architecture silhouette (reference-inspired, kept subtle behind gameplay).
      const naveTop = height * 0.1;
      const naveBottom = height * 0.66;
      const naveCenterX = width * 0.5;
      const naveHalfWidth = width * 0.39;

      const vaultShade = ctx.createLinearGradient(0, naveTop, 0, naveBottom);
      vaultShade.addColorStop(0, "rgba(14, 18, 34, 0.75)");
      vaultShade.addColorStop(0.58, "rgba(9, 13, 25, 0.46)");
      vaultShade.addColorStop(1, "rgba(5, 8, 14, 0)");
      ctx.fillStyle = vaultShade;
      ctx.fillRect(0, naveTop, width, naveBottom - naveTop);

      ctx.save();
      ctx.strokeStyle = "rgba(106, 135, 182, 0.11)";
      ctx.lineCap = "round";
      for (let i = 0; i < 6; i += 1) {
        const t = i / 5;
        const spread = naveHalfWidth * (0.28 + t * 0.72);
        const archTop = naveTop + 8 + i * 18;
        const archBaseY = naveBottom - 18 + i * 2;

        ctx.lineWidth = 1.5 + i * 0.18;
        ctx.beginPath();
        ctx.moveTo(naveCenterX - spread, archBaseY);
        ctx.quadraticCurveTo(naveCenterX - spread * 0.55, archTop + 30, naveCenterX, archTop);
        ctx.quadraticCurveTo(naveCenterX + spread * 0.55, archTop + 30, naveCenterX + spread, archBaseY);
        ctx.stroke();

        if (i < 5) {
          ctx.strokeStyle = "rgba(80, 106, 150, 0.07)";
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(naveCenterX - spread * 0.86, archBaseY);
          ctx.lineTo(naveCenterX - spread * 0.68, archTop + 54);
          ctx.lineTo(naveCenterX - spread * 0.45, archTop + 32);
          ctx.stroke();
          ctx.beginPath();
          ctx.moveTo(naveCenterX + spread * 0.86, archBaseY);
          ctx.lineTo(naveCenterX + spread * 0.68, archTop + 54);
          ctx.lineTo(naveCenterX + spread * 0.45, archTop + 32);
          ctx.stroke();
          ctx.strokeStyle = "rgba(106, 135, 182, 0.11)";
        }
      }
      ctx.restore();

      // Stands / side walls
      ctx.save();
      const standGradL = ctx.createLinearGradient(0, height * 0.28, width * 0.3, height);
      standGradL.addColorStop(0, "rgba(15, 15, 22, 0.36)");
      standGradL.addColorStop(1, "rgba(6, 7, 10, 0.62)");
      ctx.fillStyle = standGradL;
      ctx.beginPath();
      ctx.moveTo(0, height * 0.38);
      ctx.lineTo(width * 0.2, height * 0.42);
      ctx.lineTo(width * 0.33, height * 0.85);
      ctx.lineTo(0, height);
      ctx.closePath();
      ctx.fill();

      const standGradR = ctx.createLinearGradient(width, height * 0.28, width * 0.7, height);
      standGradR.addColorStop(0, "rgba(15, 15, 22, 0.36)");
      standGradR.addColorStop(1, "rgba(6, 7, 10, 0.62)");
      ctx.fillStyle = standGradR;
      ctx.beginPath();
      ctx.moveTo(width, height * 0.38);
      ctx.lineTo(width * 0.8, height * 0.42);
      ctx.lineTo(width * 0.67, height * 0.85);
      ctx.lineTo(width, height);
      ctx.closePath();
      ctx.fill();
      ctx.restore();

      // Torch sconces and warm glows to create the cold/warm contrast from the reference.
      const torchRows = [0.3, 0.39, 0.49, 0.6];
      for (let i = 0; i < torchRows.length; i += 1) {
        const y = height * torchRows[i];
        const xL = width * (0.12 + i * 0.015);
        const xR = width - xL;
        for (const x of [xL, xR]) {
          const glow = ctx.createRadialGradient(x, y + 4, 2, x, y + 4, width * 0.08);
          glow.addColorStop(0, "rgba(255, 202, 124, 0.22)");
          glow.addColorStop(0.35, "rgba(255, 141, 84, 0.12)");
          glow.addColorStop(1, "rgba(255, 141, 84, 0)");
          ctx.fillStyle = glow;
          ctx.fillRect(x - width * 0.08, y - width * 0.08, width * 0.16, width * 0.16);

          ctx.save();
          ctx.strokeStyle = "rgba(70, 60, 52, 0.45)";
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(x - 7, y + 9);
          ctx.lineTo(x + 7, y + 9);
          ctx.stroke();
          ctx.fillStyle = "rgba(255, 155, 92, 0.85)";
          ctx.beginPath();
          ctx.moveTo(x, y - 5);
          ctx.quadraticCurveTo(x + 4, y + 1, x, y + 8);
          ctx.quadraticCurveTo(x - 4, y + 1, x, y - 5);
          ctx.fill();
          ctx.restore();
        }
      }

      // Subtle rink bowl / boards beneath the pad to anchor the scene.
      const rinkTopY = height * 0.63;
      const rinkBottomY = height * 0.95;
      const rinkLeftTop = width * 0.23;
      const rinkRightTop = width * 0.77;
      const rinkLeftBottom = width * 0.08;
      const rinkRightBottom = width * 0.92;

      ctx.save();
      const iceGlow = ctx.createLinearGradient(0, rinkTopY, 0, rinkBottomY);
      iceGlow.addColorStop(0, "rgba(111, 143, 175, 0.035)");
      iceGlow.addColorStop(0.45, "rgba(215, 198, 161, 0.075)");
      iceGlow.addColorStop(1, "rgba(143, 126, 93, 0.04)");
      ctx.fillStyle = iceGlow;
      ctx.beginPath();
      ctx.moveTo(rinkLeftTop, rinkTopY);
      ctx.lineTo(rinkRightTop, rinkTopY);
      ctx.lineTo(rinkRightBottom, rinkBottomY);
      ctx.lineTo(rinkLeftBottom, rinkBottomY);
      ctx.closePath();
      ctx.fill();

      ctx.strokeStyle = "rgba(215, 198, 161, 0.13)";
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(rinkLeftTop, rinkTopY);
      ctx.lineTo(rinkRightTop, rinkTopY);
      ctx.lineTo(rinkRightBottom, rinkBottomY);
      ctx.lineTo(rinkLeftBottom, rinkBottomY);
      ctx.closePath();
      ctx.stroke();

      ctx.strokeStyle = "rgba(255, 101, 92, 0.08)";
      ctx.beginPath();
      ctx.moveTo(width * 0.5, rinkTopY);
      ctx.lineTo(width * 0.5, rinkBottomY);
      ctx.stroke();
      ctx.restore();
    }

    // Soft vignette
    const vignette = ctx.createRadialGradient(
      width * 0.5,
      height * 0.52,
      Math.min(width, height) * 0.15,
      width * 0.5,
      height * 0.5,
      Math.max(width, height) * 0.72
    );
    vignette.addColorStop(0, "rgba(0,0,0,0)");
    vignette.addColorStop(0.62, "rgba(0,0,0,0.06)");
    vignette.addColorStop(1, "rgba(0,0,0,0.42)");
    ctx.fillStyle = vignette;
    ctx.fillRect(0, 0, width, height);
  }

  private renderAnimatedBackdrop(
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number,
    timeSec: number,
    hasRinkReferenceBackdrop: boolean
  ): void {
    const fogAlphaScale = hasRinkReferenceBackdrop ? 0.7 : 1;
    const particleAlphaScale = hasRinkReferenceBackdrop ? 0.78 : 1;

    // Animated fog layers (elliptical radial glows)
    for (let i = 0; i < 4; i += 1) {
      const x = width * (0.18 + i * 0.22) + Math.sin(timeSec * (0.06 + i * 0.02) + i * 1.7) * 40;
      const y = height * (0.25 + (i % 2) * 0.28) + Math.cos(timeSec * (0.05 + i * 0.015) + i * 0.9) * 24;
      const rx = width * (0.18 + (i % 3) * 0.04);
      const ry = height * (0.08 + ((i + 1) % 3) * 0.03);
      const alpha = (0.035 + (i % 2) * 0.015) * fogAlphaScale;

      ctx.save();
      ctx.translate(x, y);
      ctx.scale(rx, ry);
      const fog = ctx.createRadialGradient(0, 0, 0, 0, 0, 1);
      fog.addColorStop(0, `rgba(${i % 2 ? "143,126,93" : "111,143,175"}, ${alpha})`);
      fog.addColorStop(0.45, `rgba(${i % 2 ? "111,98,74" : "92,112,136"}, ${alpha * 0.55})`);
      fog.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = fog;
      ctx.beginPath();
      ctx.arc(0, 0, 1, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    // Slow floating background particles.
    const particleCount = 68;
    for (let i = 0; i < particleCount; i += 1) {
      const baseX = ((Math.sin(i * 71.83) * 0.5 + 0.5) * 0.94 + 0.03) * width;
      const baseY = ((Math.cos(i * 49.17) * 0.5 + 0.5) * 0.9 + 0.05) * height;
      const driftX = Math.sin(timeSec * (0.04 + (i % 7) * 0.01) + i * 1.27) * (8 + (i % 5) * 4);
      const driftY = Math.cos(timeSec * (0.03 + (i % 5) * 0.008) + i * 0.83) * (6 + (i % 4) * 3);
      const x = baseX + driftX;
      const y = baseY + driftY;
      const size = 0.8 + (i % 3) * 0.9;
      const alpha =
        (0.02 + (i % 6) * 0.008 + (Math.sin(timeSec * 0.5 + i) * 0.01 + 0.01)) * particleAlphaScale;

      ctx.save();
      ctx.fillStyle = i % 5 === 0 ? `rgba(255, 213, 153, ${alpha.toFixed(3)})` : `rgba(207, 195, 168, ${alpha.toFixed(3)})`;
      ctx.shadowColor = i % 5 === 0 ? "rgba(255, 198, 119, 0.12)" : "rgba(207, 195, 168, 0.08)";
      ctx.shadowBlur = 8;
      ctx.beginPath();
      ctx.arc(x, y, size, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }

  private resize(): void {
    const rect = this.mount.getBoundingClientRect();
    this.viewWidth = Math.max(1, Math.floor(rect.width));
    this.viewHeight = Math.max(1, Math.floor(rect.height));
    this.dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));

    this.canvas.width = Math.floor(this.viewWidth * this.dpr);
    this.canvas.height = Math.floor(this.viewHeight * this.dpr);
    this.invalidateBackdropCache();
    this.recomputePadBounds();
  }

  private recomputePadBounds(): void {
    const desktopHudLayout = this.viewWidth > 900;
    if (!desktopHudLayout) {
      const topInset = Math.min(136, Math.max(104, this.viewHeight * 0.14));
      const innerHeight = Math.max(120, this.viewHeight - topInset);
      const innerPad = computePadBounds(this.viewWidth, innerHeight);
      this.padBounds = {
        x: innerPad.x,
        y: innerPad.y + topInset,
        width: innerPad.width,
        height: innerPad.height
      };
      return;
    }

    // Keep the gameplay pad fully below the top HUD rail (tracking, jumbotron, profile/options).
    const hudMargin = 14;
    const padGap = 14;
    const leftInset = hudMargin;
    const rightInset = hudMargin;
    const topInset = this.getDesktopTopHudInset(hudMargin, padGap);
    const bottomInset = hudMargin;

    const innerWidth = Math.max(120, this.viewWidth - leftInset - rightInset);
    const innerHeight = Math.max(120, this.viewHeight - topInset - bottomInset);
    const innerPad = computePadBounds(innerWidth, innerHeight);

    this.padBounds = {
      x: innerPad.x + leftInset,
      y: innerPad.y + topInset,
      width: innerPad.width,
      height: innerPad.height
    };
  }

  private getPadBounds(): Rect {
    return this.padBounds;
  }

  private getDesktopTopHudInset(hudMargin: number, padGap: number): number {
    const mountRect = this.mount.getBoundingClientRect();
    let maxBottom = hudMargin;

    const candidates = this.mount.querySelectorAll<HTMLElement>(
      ".arcane-scoreboard--hud, .tracking-panel, .ui-float-bar"
    );

    for (const el of candidates) {
      if (!el.isConnected) {
        continue;
      }
      const rect = el.getBoundingClientRect();
      if (rect.width < 2 || rect.height < 2) {
        continue;
      }

      const relTop = rect.top - mountRect.top;
      const relBottom = rect.bottom - mountRect.top;
      if (relBottom <= 0 || relTop >= this.viewHeight) {
        continue;
      }

      // Only reserve space for elements docked in the top portion of the play view.
      if (relTop > this.viewHeight * 0.45) {
        continue;
      }

      maxBottom = Math.max(maxBottom, relBottom);
    }

    return clamp(Math.ceil(maxBottom + padGap), hudMargin + 84, Math.max(hudMargin + 84, this.viewHeight - 120));
  }
}
