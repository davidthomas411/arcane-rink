import type { CutsceneDefinition } from "./types";

type RsvpToken = {
  raw: string;
};

type LiveRun = {
  token: number;
  root: HTMLDivElement;
  onComplete: () => void;
  def: CutsceneDefinition;
  panelIndex: number;
  tokens: RsvpToken[];
  tokenIndex: number;
  panelDone: boolean;
  paused: boolean;
  panelWpmStart: number;
  panelWpmEnd: number;
  wordEl: HTMLDivElement;
  supportEl: HTMLParagraphElement;
  titleEl: HTMLHeadingElement;
  eyebrowEl: HTMLDivElement;
  panelProgressEl: HTMLDivElement;
  tempoEl: HTMLDivElement;
  streamProgressFillEl: HTMLSpanElement;
  pauseBtn: HTMLButtonElement;
  replayBtn: HTMLButtonElement;
  skipBtn: HTMLButtonElement;
  continueBtn: HTMLButtonElement;
  timerId: number | null;
  panelDoneTimerId: number | null;
  keyHandler: (event: KeyboardEvent) => void;
};

const MIN_DELAY_MS = 70;
const MAX_DELAY_MS = 1500;

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function splitWordForPivot(raw: string): { prefix: string; pivot: string; suffix: string } {
  const match = raw.match(/^([^A-Za-z0-9']*)([A-Za-z0-9']+)([^A-Za-z0-9']*)$/);
  if (!match) {
    return { prefix: "", pivot: raw || " ", suffix: "" };
  }
  const [, leading, core, trailing] = match;
  const len = core.length;
  const pivotIndex = len <= 2 ? 0 : len <= 5 ? 1 : len <= 9 ? 2 : len <= 13 ? 3 : 4;
  const safePivotIndex = clamp(pivotIndex, 0, Math.max(0, len - 1));
  return {
    prefix: `${leading}${core.slice(0, safePivotIndex)}`,
    pivot: core.charAt(safePivotIndex) || " ",
    suffix: `${core.slice(safePivotIndex + 1)}${trailing}`
  };
}

function tokenDelayMs(rawToken: string, wpm: number): number {
  const baseMs = 60000 / Math.max(120, wpm);
  const core = rawToken.replace(/[^A-Za-z0-9']/g, "");
  let delay = baseMs;

  if (core.length >= 8) {
    delay *= 1.16;
  }
  if (core.length >= 12) {
    delay *= 1.12;
  }
  if (/[,:;]/.test(rawToken)) {
    delay *= 1.45;
  }
  if (/[.!?]/.test(rawToken)) {
    delay *= 1.95;
  }
  if (/\.{3}/.test(rawToken) || /…/.test(rawToken)) {
    delay *= 2.1;
  }
  if (/^[A-Z]{3,}$/.test(core)) {
    delay *= 1.1;
  }

  return clamp(delay, MIN_DELAY_MS, MAX_DELAY_MS);
}

function tokenizeRsvpText(text: string): RsvpToken[] {
  return text
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .filter((token) => token.length > 0)
    .map((raw) => ({
      raw
    }));
}

export class CutscenePlayer {
  private activeRun: LiveRun | null = null;
  private nextRunToken = 0;

  constructor(private readonly mount: HTMLElement) {}

  destroy(): void {
    this.cancel();
  }

  cancel(): void {
    const run = this.activeRun;
    if (!run) {
      return;
    }
    this.clearRunTimers(run);
    window.removeEventListener("keydown", run.keyHandler);
    run.root.remove();
    this.activeRun = null;
  }

  play(def: CutsceneDefinition, onComplete: () => void): { cancel: () => void } {
    this.cancel();
    const runToken = ++this.nextRunToken;
    const root = this.createMarkup();
    this.mount.replaceChildren(root);

    const wordEl = this.query<HTMLDivElement>(root, "[data-cutscene-word]");
    const supportEl = this.query<HTMLParagraphElement>(root, "[data-cutscene-support]");
    const titleEl = this.query<HTMLHeadingElement>(root, "[data-cutscene-title]");
    const eyebrowEl = this.query<HTMLDivElement>(root, "[data-cutscene-eyebrow]");
    const panelProgressEl = this.query<HTMLDivElement>(root, "[data-cutscene-panel-progress]");
    const tempoEl = this.query<HTMLDivElement>(root, "[data-cutscene-tempo]");
    const streamProgressFillEl = this.query<HTMLSpanElement>(root, "[data-cutscene-stream-fill]");
    const pauseBtn = this.query<HTMLButtonElement>(root, '[data-action="cutscene-pause"]');
    const replayBtn = this.query<HTMLButtonElement>(root, '[data-action="cutscene-replay"]');
    const skipBtn = this.query<HTMLButtonElement>(root, '[data-action="cutscene-skip"]');
    const continueBtn = this.query<HTMLButtonElement>(root, '[data-action="cutscene-continue"]');

    const keyHandler = (event: KeyboardEvent): void => {
      if (!this.activeRun || this.activeRun.token !== runToken) {
        return;
      }
      if (event.key === " " || event.key.toLowerCase() === "k") {
        event.preventDefault();
        this.togglePause();
        return;
      }
      if (event.key.toLowerCase() === "r") {
        event.preventDefault();
        this.replayPanel();
        return;
      }
      if (event.key === "Enter") {
        event.preventDefault();
        this.fastForwardPanel();
        return;
      }
      if (event.key === "Escape" && def.skippable) {
        event.preventDefault();
        this.finishRun();
      }
    };

    const run: LiveRun = {
      token: runToken,
      root,
      onComplete,
      def,
      panelIndex: 0,
      tokens: [],
      tokenIndex: 0,
      panelDone: false,
      paused: false,
      panelWpmStart: clamp(Math.round(def.baseWpm), 160, 420),
      panelWpmEnd: clamp(Math.round(def.baseWpm), 160, 420),
      wordEl,
      supportEl,
      titleEl,
      eyebrowEl,
      panelProgressEl,
      tempoEl,
      streamProgressFillEl,
      pauseBtn,
      replayBtn,
      skipBtn,
      continueBtn,
      timerId: null,
      panelDoneTimerId: null,
      keyHandler
    };
    this.activeRun = run;

    window.addEventListener("keydown", keyHandler);
    pauseBtn.addEventListener("click", () => {
      this.togglePause();
    });
    replayBtn.addEventListener("click", () => {
      this.replayPanel();
    });
    skipBtn.addEventListener("click", () => {
      this.finishRun();
    });
    continueBtn.addEventListener("click", () => {
      this.finishRun();
    });

    this.applyPanel(run, 0);
    return { cancel: () => this.cancel() };
  }

  private query<T extends Element>(root: ParentNode, selector: string): T {
    const element = root.querySelector<T>(selector);
    if (!element) {
      throw new Error(`CutscenePlayer missing element: ${selector}`);
    }
    return element;
  }

  private createMarkup(): HTMLDivElement {
    const root = document.createElement("div");
    root.className = "screen-backdrop screen-backdrop--cutscene";
    root.innerHTML = `
      <section class="cutscene-panel" role="dialog" aria-modal="true" aria-label="Story cutscene">
        <div class="cutscene-panel__frame" aria-hidden="true"></div>
        <div class="cutscene-panel__mist" aria-hidden="true"></div>
        <header class="cutscene-head">
          <div class="screen-eyebrow cutscene-head__eyebrow" data-cutscene-eyebrow></div>
          <div class="cutscene-head__progress" data-cutscene-panel-progress></div>
        </header>
        <h2 class="cutscene-title" data-cutscene-title></h2>
        <div class="cutscene-rsvp">
          <div class="cutscene-rsvp__word" data-cutscene-word aria-live="polite"></div>
          <div class="cutscene-rsvp__tempo" data-cutscene-tempo></div>
          <div class="cutscene-rsvp__stream">
            <span class="cutscene-rsvp__stream-fill" data-cutscene-stream-fill></span>
          </div>
          <p class="cutscene-rsvp__support" data-cutscene-support></p>
        </div>
        <div class="cutscene-controls">
          <div class="cutscene-actions">
            <button type="button" class="ui-btn ui-btn-ghost" data-action="cutscene-pause">Pause</button>
            <button type="button" class="ui-btn ui-btn-ghost" data-action="cutscene-replay">Replay</button>
            <button type="button" class="ui-btn ui-btn-ghost" data-action="cutscene-skip">Skip</button>
            <button type="button" class="ui-btn" data-action="cutscene-continue" hidden>Continue</button>
          </div>
        </div>
      </section>
    `;
    return root;
  }

  private clearRunTimers(run: LiveRun): void {
    if (run.timerId !== null) {
      window.clearTimeout(run.timerId);
      run.timerId = null;
    }
    if (run.panelDoneTimerId !== null) {
      window.clearTimeout(run.panelDoneTimerId);
      run.panelDoneTimerId = null;
    }
  }

  private applyPanel(run: LiveRun, panelIndex: number): void {
    const panel = run.def.panels[panelIndex];
    if (!panel) {
      this.finishRun();
      return;
    }

    this.clearRunTimers(run);
    run.panelIndex = panelIndex;
    run.tokens = tokenizeRsvpText(panel.rsvpText);
    run.tokenIndex = 0;
    run.panelDone = false;
    run.paused = false;
    const base = clamp(Math.round(run.def.baseWpm), 160, 420);
    run.panelWpmStart = clamp(Math.round(panel.wpmStart ?? base), 160, 420);
    run.panelWpmEnd = clamp(Math.round(panel.wpmEnd ?? run.panelWpmStart), 160, 420);
    run.root.dataset.tone = panel.tone.toLowerCase();
    run.eyebrowEl.textContent = panel.eyebrow;
    run.titleEl.textContent = panel.title;
    run.supportEl.textContent = panel.supportText ?? "";
    run.panelProgressEl.textContent = `${panelIndex + 1}/${run.def.panels.length}`;
    run.pauseBtn.textContent = "Pause";
    run.continueBtn.hidden = true;
    run.skipBtn.hidden = !run.def.skippable;

    this.updateStreamProgress(run);
    this.updateTempoLabel(run);
    this.renderWord(run, "...");
    this.scheduleNextTokenStep(run, 90);
  }

  private getCurrentPanelWpm(run: LiveRun): number {
    const total = Math.max(1, run.tokens.length);
    const progress = clamp(run.tokenIndex / total, 0, 1);
    const start = run.panelWpmStart;
    const end = run.panelWpmEnd;
    return start + (end - start) * progress;
  }

  private updateTempoLabel(run: LiveRun): void {
    const wpm = Math.round(this.getCurrentPanelWpm(run));
    const direction = run.panelWpmEnd > run.panelWpmStart ? "rising" : run.panelWpmEnd < run.panelWpmStart ? "falling" : "steady";
    run.tempoEl.textContent = `Tempo ${direction} • ${wpm} WPM`;
  }

  private scheduleNextTokenStep(run: LiveRun, delayMs: number): void {
    this.clearRunTimers(run);
    run.timerId = window.setTimeout(() => {
      if (!this.activeRun || this.activeRun.token !== run.token) {
        return;
      }
      run.timerId = null;
      this.stepToken(run);
    }, delayMs);
  }

  private stepToken(run: LiveRun): void {
    if (run.paused) {
      return;
    }
    if (run.tokenIndex >= run.tokens.length) {
      this.finishPanel(run);
      return;
    }

    const token = run.tokens[run.tokenIndex];
    const tokenWpm = this.getCurrentPanelWpm(run);
    run.tokenIndex += 1;
    this.renderWord(run, token.raw);
    this.updateStreamProgress(run);
    this.updateTempoLabel(run);
    this.scheduleNextTokenStep(run, tokenDelayMs(token.raw, tokenWpm));
  }

  private renderWord(run: LiveRun, word: string): void {
    const { prefix, pivot, suffix } = splitWordForPivot(word);
    const safePrefix = escapeHtml(prefix || " ");
    const safePivot = escapeHtml(pivot || " ");
    const safeSuffix = escapeHtml(suffix || " ");
    run.wordEl.innerHTML = `
      <span class="cutscene-rsvp-token">
        <span class="cutscene-rsvp-token__pre">${safePrefix}</span>
        <span class="cutscene-rsvp-token__pivot">${safePivot}</span>
        <span class="cutscene-rsvp-token__post">${safeSuffix}</span>
      </span>
    `;
  }

  private updateStreamProgress(run: LiveRun): void {
    const total = Math.max(1, run.tokens.length);
    const progress = clamp(run.tokenIndex / total, 0, 1);
    run.streamProgressFillEl.style.width = `${(progress * 100).toFixed(1)}%`;
  }

  private finishPanel(run: LiveRun): void {
    if (run.panelDone) {
      return;
    }
    run.panelDone = true;
    const isFinalPanel = run.panelIndex >= run.def.panels.length - 1;

    if (isFinalPanel && !run.def.autoAdvanceFinalPanel) {
      run.continueBtn.hidden = false;
      run.continueBtn.textContent = run.def.finalButtonLabel ?? "Continue";
      return;
    }

    run.panelDoneTimerId = window.setTimeout(() => {
      if (!this.activeRun || this.activeRun.token !== run.token) {
        return;
      }
      run.panelDoneTimerId = null;
      if (isFinalPanel) {
        this.finishRun();
        return;
      }
      this.applyPanel(run, run.panelIndex + 1);
    }, isFinalPanel ? 380 : 260);
  }

  private finishRun(): void {
    const run = this.activeRun;
    if (!run) {
      return;
    }
    this.clearRunTimers(run);
    window.removeEventListener("keydown", run.keyHandler);
    run.root.remove();
    this.activeRun = null;
    run.onComplete();
  }

  private replayPanel(): void {
    const run = this.activeRun;
    if (!run) {
      return;
    }
    this.applyPanel(run, run.panelIndex);
  }

  private fastForwardPanel(): void {
    const run = this.activeRun;
    if (!run) {
      return;
    }
    if (run.panelDone) {
      if (run.panelIndex >= run.def.panels.length - 1) {
        this.finishRun();
        return;
      }
      this.applyPanel(run, run.panelIndex + 1);
      return;
    }

    if (run.tokenIndex < run.tokens.length) {
      run.tokenIndex = run.tokens.length;
      this.updateStreamProgress(run);
    }
    this.finishPanel(run);
  }

  private togglePause(): void {
    const run = this.activeRun;
    if (!run) {
      return;
    }
    run.paused = !run.paused;
    run.pauseBtn.textContent = run.paused ? "Resume" : "Pause";
    run.root.classList.toggle("is-paused", run.paused);
    if (!run.paused) {
      this.scheduleNextTokenStep(run, 60);
    } else {
      this.clearRunTimers(run);
    }
  }
}
