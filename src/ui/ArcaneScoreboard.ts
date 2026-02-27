export type ArcaneScoreboardVariant = "hud" | "results";

export type ArcaneScoreboardRefs = {
  root: HTMLDivElement;
  timerEl: HTMLSpanElement;
  homeScoreEl: HTMLSpanElement;
  guestScoreEl: HTMLSpanElement;
  comboEl: HTMLSpanElement;
  timeDialEl: HTMLDivElement;
  scoreDialEl: HTMLDivElement;
  comboStatEl: HTMLDivElement;
  comboPipsEls: HTMLSpanElement[];
  timeDialSubEl: HTMLSpanElement;
  scoreDialSubEl: HTMLSpanElement;
  comboDialSubEl: HTMLSpanElement;
  integrityFillEl: HTMLDivElement;
  pressureFillEl: HTMLDivElement;
  phaseEl: HTMLDivElement;
  periodRailEl: HTMLSpanElement;
  enemyRailEl: HTMLSpanElement;
  guestLabelEl: HTMLSpanElement;
  scoreLabelEl: HTMLSpanElement;
};

function createCornerBolts(): string {
  const positions = [
    "top-left",
    "top-right",
    "bottom-left",
    "bottom-right"
  ] as const;
  return positions
    .map(
      (pos) => `
        <div class="arcane-sb-bolt arcane-sb-bolt-${pos}" aria-hidden="true">
          <div class="arcane-sb-bolt-ring"></div>
        </div>
      `
    )
    .join("");
}

function runeGlyphs(text: string): string {
  return text
    .split("")
    .map((char) => `<span>${char}</span>`)
    .join("");
}

function scoreboardHtml(variant: ArcaneScoreboardVariant): string {
  const isHud = variant === "hud";
  return `
    <div class="arcane-scoreboard-shell">
      <div class="arcane-scoreboard-frame">
        <div class="arcane-scoreboard-scratches" aria-hidden="true"></div>
        ${createCornerBolts()}
        <div class="arcane-sb-title-banner">
          <span>Arcane Rink: Trials of the Puckbound</span>
        </div>

        <div class="arcane-scoreboard-top-trim" aria-hidden="true">
          <div class="arcane-scoreboard-runes">${runeGlyphs("ᛗᛁᚨᛁᚲ ᚲᛟᛁᛖᛉᚨᛈᛉ")}</div>
          <div class="arcane-scoreboard-emblem">
            <svg viewBox="0 0 32 32" aria-hidden="true">
              <path d="M16 4L8 12v8l8 8 8-8v-8L16 4z"></path>
              <path d="M16 9l-4 5v4l4 4 4-4v-4l-4-5z" class="is-fill"></path>
              <circle cx="16" cy="16" r="2"></circle>
            </svg>
          </div>
          <div class="arcane-scoreboard-runes">${runeGlyphs("ᚺᛁᛁᚲ ᚲᚾᚺᛁᛁᚹᚺᚷ")}</div>
        </div>

        <div class="arcane-scoreboard-rail">
          <span class="arcane-sb-rail-glyph" data-value="period-rail">Period 1</span>
          <span class="arcane-sb-rail-glyph" data-value="enemy-rail">Cryptfang</span>
          <div class="arcane-sb-phase">Threat: Stable</div>
        </div>

        <div class="arcane-scoreboard-main">
          <div class="arcane-scoreboard-inner">
            <div class="arcane-scoreboard-row arcane-scoreboard-row-top">
              <div class="arcane-sb-module arcane-sb-time" data-dial="time" style="--progress:1">
                <div class="arcane-sb-time-ring" aria-hidden="true">
                  <div class="arcane-sb-time-ring-core"></div>
                  <svg viewBox="0 0 100 100" class="arcane-sb-time-ticks" aria-hidden="true">
                    <g>
                      <line x1="86" y1="50" x2="90" y2="50"></line>
                      <line x1="81.18" y1="68" x2="84.64" y2="70"></line>
                      <line x1="68" y1="81.18" x2="70" y2="84.64"></line>
                      <line x1="50" y1="86" x2="50" y2="90"></line>
                      <line x1="32" y1="81.18" x2="30" y2="84.64"></line>
                      <line x1="18.82" y1="68" x2="15.36" y2="70"></line>
                      <line x1="14" y1="50" x2="10" y2="50"></line>
                      <line x1="18.82" y1="32" x2="15.36" y2="30"></line>
                      <line x1="32" y1="18.82" x2="30" y2="15.36"></line>
                      <line x1="50" y1="14" x2="50" y2="10"></line>
                      <line x1="68" y1="18.82" x2="70" y2="15.36"></line>
                      <line x1="81.18" y1="32" x2="84.64" y2="30"></line>
                    </g>
                  </svg>
                  <div class="arcane-sb-time-content">
                    <span class="arcane-sb-mini-label">Time</span>
                    <strong class="arcane-sb-time-value" data-value="time">20:00</strong>
                  </div>
                </div>
                <div class="arcane-sb-time-meta">
                  <span data-sub="time">${isHud ? "Period clock" : "Final clock"}</span>
                </div>
              </div>

              <div class="arcane-sb-module arcane-sb-score" data-dial="score" style="--progress:0">
                <div class="arcane-sb-score-labels">
                  <span>Home</span>
                  <span data-value="guest-label">Guest</span>
                </div>
                <div class="arcane-sb-score-values">
                  <strong data-value="score-home">0</strong>
                  <span class="arcane-sb-score-dash">-</span>
                  <span class="arcane-sb-score-mid-label">Guest</span>
                  <strong data-value="score-guest">0</strong>
                </div>
                <div class="arcane-sb-score-meta">
                  <span class="arcane-sb-score-state" data-value="score-label">${isHud ? "Offense" : "Final"}</span>
                  <span class="arcane-sb-score-sub" data-sub="score">${isHud ? "Shot Charge 0% • Runes 0" : "Runes 0"}</span>
                </div>
              </div>

              <div class="arcane-sb-meter arcane-sb-threat arcane-sb-threat-meter" data-meter="pressure">
                <span>Threat Level</span>
                <div class="arcane-sb-threat-skull" aria-hidden="true">
                  <svg viewBox="0 0 24 24">
                    <path d="M12 2C8 2 5 5.5 5 9c0 2 .8 3.7 2 5v3a1 1 0 001 1h1v1a1 1 0 001 1h4a1 1 0 001-1v-1h1a1 1 0 001-1v-3c1.2-1.3 2-3 2-5 0-3.5-3-7-7-7z"></path>
                    <circle cx="9.5" cy="9" r="1.5"></circle>
                    <circle cx="14.5" cy="9" r="1.5"></circle>
                    <rect x="10" y="13" width="1" height="2" rx=".5"></rect>
                    <rect x="13" y="13" width="1" height="2" rx=".5"></rect>
                  </svg>
                </div>
                <div class="arcane-sb-meter-track arcane-sb-threat-track">
                  <div class="arcane-sb-meter-fill arcane-sb-pressure-fill"></div>
                </div>
              </div>
            </div>

            <div class="arcane-sb-divider" aria-hidden="true"></div>

            <div class="arcane-scoreboard-row arcane-scoreboard-row-bottom">
              <div class="arcane-sb-module arcane-sb-combo" data-dial="combo" style="--progress:0">
                <div class="arcane-sb-combo-head">
                  <span class="arcane-sb-combo-label">Combo</span>
                  <span class="arcane-sb-combo-state">Chain</span>
                </div>
                <div class="arcane-sb-combo-body">
                  <div class="combo-pips" data-combo-pips>
                    <span></span><span></span><span></span><span></span><span></span>
                  </div>
                  <strong class="arcane-sb-combo-value" data-value="combo">x0</strong>
                </div>
                <div class="arcane-sb-combo-meta">
                  <span data-sub="combo">Land a quick hit</span>
                </div>
              </div>

              <div class="arcane-sb-centerplate" aria-hidden="true">
                <svg viewBox="0 0 40 40">
                  <path d="M20 5L5 15v10l15 10 15-10V15L20 5z"></path>
                </svg>
              </div>

              <div class="arcane-sb-meter arcane-sb-shield arcane-sb-shield-meter">
                <div class="arcane-sb-shield-head">
                  <span>Status</span>
                  <strong>Arcane Shield</strong>
                </div>
                <div class="arcane-sb-meter-track arcane-sb-shield-track"><div class="arcane-sb-meter-fill arcane-sb-integrity-fill"></div></div>
              </div>
            </div>
          </div>
        </div>

        <div class="arcane-scoreboard-side arcane-scoreboard-side-left" aria-hidden="true">
          ${runeGlyphs("ᛉᛗᚨᚡᛁᛖ")}
        </div>
        <div class="arcane-scoreboard-side arcane-scoreboard-side-right" aria-hidden="true">
          ${runeGlyphs("ᛉᛗᚲᛏᚲᚨ")}
        </div>
      </div>
    </div>
  `;
}

function requireEl<T extends Element>(root: ParentNode, selector: string): T {
  const el = root.querySelector(selector);
  if (!el) {
    throw new Error(`ArcaneScoreboard missing selector: ${selector}`);
  }
  return el as T;
}

export function createArcaneScoreboard(variant: ArcaneScoreboardVariant): ArcaneScoreboardRefs {
  const root = document.createElement("div");
  root.className =
    variant === "hud"
      ? "hud-card arcane-scoreboard arcane-scoreboard--hud"
      : "arcane-scoreboard arcane-scoreboard--results";
  root.innerHTML = scoreboardHtml(variant);

  const refs: ArcaneScoreboardRefs = {
    root,
    timerEl: requireEl<HTMLSpanElement>(root, '[data-value="time"]'),
    homeScoreEl: requireEl<HTMLSpanElement>(root, '[data-value="score-home"]'),
    guestScoreEl: requireEl<HTMLSpanElement>(root, '[data-value="score-guest"]'),
    comboEl: requireEl<HTMLSpanElement>(root, '[data-value="combo"]'),
    timeDialEl: requireEl<HTMLDivElement>(root, '.arcane-sb-time[data-dial="time"]'),
    scoreDialEl: requireEl<HTMLDivElement>(root, '.arcane-sb-score[data-dial="score"]'),
    comboStatEl: requireEl<HTMLDivElement>(root, '.arcane-sb-combo[data-dial="combo"]'),
    comboPipsEls: Array.from(root.querySelectorAll('[data-combo-pips] > span')) as HTMLSpanElement[],
    timeDialSubEl: requireEl<HTMLSpanElement>(root, '[data-sub="time"]'),
    scoreDialSubEl: requireEl<HTMLSpanElement>(root, '[data-sub="score"]'),
    comboDialSubEl: requireEl<HTMLSpanElement>(root, '[data-sub="combo"]'),
    integrityFillEl: requireEl<HTMLDivElement>(root, ".arcane-sb-integrity-fill"),
    pressureFillEl: requireEl<HTMLDivElement>(root, ".arcane-sb-pressure-fill"),
    phaseEl: requireEl<HTMLDivElement>(root, ".arcane-sb-phase"),
    periodRailEl: requireEl<HTMLSpanElement>(root, '[data-value="period-rail"]'),
    enemyRailEl: requireEl<HTMLSpanElement>(root, '[data-value="enemy-rail"]'),
    guestLabelEl: requireEl<HTMLSpanElement>(root, '[data-value="guest-label"]'),
    scoreLabelEl: requireEl<HTMLSpanElement>(root, '[data-value="score-label"]')
  };
  return refs;
}

export function setArcaneScoreboardScore(refs: ArcaneScoreboardRefs, home: number, guest: number): void {
  const prevHome = Number.parseInt(refs.homeScoreEl.textContent || "0", 10);
  const prevGuest = Number.parseInt(refs.guestScoreEl.textContent || "0", 10);
  refs.homeScoreEl.textContent = String(home);
  refs.guestScoreEl.textContent = String(guest);
  if (home !== prevHome) {
    refs.homeScoreEl.classList.remove("is-bump");
    void refs.homeScoreEl.offsetWidth;
    refs.homeScoreEl.classList.add("is-bump");
  }
  if (guest !== prevGuest) {
    refs.guestScoreEl.classList.remove("is-bump");
    void refs.guestScoreEl.offsetWidth;
    refs.guestScoreEl.classList.add("is-bump");
  }
}
