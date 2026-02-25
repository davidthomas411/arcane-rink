# ArcaneRink Cutscene Integration Plan

Based on `tmp/cutscene_story.md` and the current app/game architecture.

## Goals

- Add short, high-impact cutscenes without slowing the play loop.
- Keep cutscenes data-driven and skippable.
- Reuse the current fantasy HUD visual language (runes, glow, fog, vignette).
- Integrate cleanly with existing `Profiles -> Play -> Results` flow.

## Asset Inventory (tmp)

- `tmp/Gemini_Generated_Image_2boyrj2boyrj2boy.png` (`1184x864`)
  - Single player portrait on transparent background (dark helmet).
  - Best fit: Opening panel 3, Rank Up cutscene, Profile/hero spotlight.
- `tmp/Gemini_Generated_Image_fw3rb4fw3rb4fw3r.png` (`1184x864`)
  - Single player portrait on transparent background (white helmet).
  - Best fit: Alternate hero spotlight / class variant / daily challenge splash.
- `tmp/Gemini_Generated_Image_8kj6y38kj6y38kj6.png` (`1184x864`)
  - Two-player composition on dark background.
  - Best fit: Profile screen hero banner, Between-match interstitial, future versus-style event card.

## Recommended Integration Approach

## 1) Add a small cutscene system (data-driven)

Create a lightweight scene player rather than hardcoding cutscenes into `App.ts`.

Suggested files:

- `src/cutscenes/types.ts`
- `src/cutscenes/CutscenePlayer.ts`
- `src/cutscenes/cutsceneLibrary.ts`
- `src/cutscenes/CutsceneQueue.ts` (optional if multiple triggers can stack)

Core types:

- `CutsceneId` (`OPENING_FIRST_LAUNCH`, `BETWEEN_MATCH`, `BOSS_RUNE`, `RANK_UP`, `DAILY_CHALLENGE`)
- `CutscenePanel`:
  - `durationMs`
  - `textPrimary`
  - `textSecondary?`
  - `imageId?`
  - `bgVariant` (`arena_dim`, `rift`, `rankup_gold`, etc.)
  - `motionPreset` (`drift`, `zoom_in`, `rune_spin`, `pulse`)
- `CutsceneDefinition`:
  - `id`
  - `panels`
  - `skippable`
  - `buttonLabel?`
  - `autoAdvance`

Notes:

- Keep each cutscene to `1-3` panels and `<= 8s`, matching the guide.
- Preload all cutscene images at app startup or first use.
- Use CSS/Canvas transforms only (no heavy video pipeline).

## 2) Add a cutscene overlay layer to the app shell

Current app flow already separates gameplay canvas and screen overlays:

- Game starts in `src/app/App.ts:100`
- Run completion handled in `src/app/App.ts:133`
- Results screen rendered in `src/app/App.ts:314`

Add a dedicated cutscene layer above gameplay/background but below modal screens:

- New DOM mount under `App` shell, e.g. `this.cutsceneLayer`
- `CutscenePlayer` renders there
- `App` pauses transitions while a cutscene is active

Why here:

- Keeps gameplay code (`Game`, `RuneGatesHUD`) unaware of UI storytelling.
- Makes it easy to insert cutscenes before play, after results, and on level-up.

## 3) Persist cutscene state in profile/store (first-launch-only trigger)

The guide specifies the opening cutscene should play only the first time a profile enters the arena.

Current profile model has no cutscene flags yet:

- `src/models/Profile.ts:16`
- `src/models/Profile.ts:33`

Add a small profile-scoped field:

- `seenCutscenes?: string[]` or structured flags:
  - `introSeen: boolean`
  - `dailyIntroSeenOnDate?: string` (future)

Prefer:

- `seenCutscenes: string[]` for extensibility
- Keep store versioned migration from `ProfileStore.version = 1` to `2`

Migration notes:

- Existing profiles should default to no seen cutscenes.
- Opening cutscene should trigger once per profile, not once per browser.

## 4) Trigger hook plan (concrete)

### Opening Cutscene (First Launch Only)

Trigger:

- In `App.startPlay()` before creating `Game` (`src/app/App.ts:100`)
- If active profile has not seen `OPENING_FIRST_LAUNCH`

Flow:

1. Show opening cutscene overlay.
2. On complete, mark cutscene seen in profile.
3. Then continue `startPlay()` and instantiate `Game`.

Implementation detail:

- Split current `startPlay()` into:
  - `startPlay()`
  - `beginGameSession()` (existing `Game` creation body)

### Between-Match Cutscene

Trigger:

- After results screen actions (`Play Again`) from `src/app/App.ts:423`

Flow:

1. Click `Play Again`
2. Show short cutscene with `Begin Trial` button (3-4s max)
3. Start new run on confirm / auto-advance

This prevents immediate loop fatigue and matches the “gate stirs again” design intent.

### Boss Rune Cutscene

Trigger (future gameplay milestone):

- Emit a gameplay event from `RuneGatesHUD` when combo threshold/milestone is reached
- App receives event and shows a very short cutscene, then resumes/spawns boss gate

Recommendation:

- Do not directly pause the current run until a boss system exists.
- First implement the cutscene pathway as a no-op event integration hook.

### Rank Up Cutscene

Trigger:

- During `handleRunComplete()` after `applyRunXp()` in `src/app/App.ts:152`
- If `xpApplied.levelUps.length > 0`

Flow options (recommended):

- Queue rank-up cutscene before showing results, then results screen
- Or show rank-up cutscene after results if multiple rewards are present

Recommendation:

- Start with post-results rank-up cutscene to avoid adding latency to the run-end reward reveal.

### Daily Challenge Intro (future)

Trigger:

- App boot / profile select using local date stamp

State:

- Store a date key per profile (e.g., `YYYY-MM-DD`) to avoid replaying the same intro

## 5) Visual implementation plan (fits current style)

Reuse current visual language from the game:

- Dark gradient + fog + particles + vignette (already present in `Game.drawBackdrop()` in `src/game/Game.ts:143`)
- Rune circles / portals / bloom motifs (already in `RuneGatesHUD`)
- Bold condensed glowing type for impact lines

Cutscene rendering stack per panel:

1. Background gradient/fog/vignette
2. Rune circle / energy FX (CSS or canvas)
3. Portrait image layer (parallax drift + slow scale)
4. Text block (short line only)
5. CTA button (only on interactive cutscenes)

Motion presets (simple, cheap, effective):

- `drift`: ±8px translation over panel duration
- `push`: scale `1.00 -> 1.05`
- `rune-spin`: slow rotating ring behind portrait
- `pulse`: brief glow surge at panel transitions

## 6) Image usage mapping (initial)

### Opening Cutscene

- Panel 1: no portrait image (arena-only atmospheric panel)
- Panel 2: no portrait image (rune-circle ignition panel)
- Panel 3: use one transparent portrait (`2boy...png` or `fw3r...png`) with rim light and rotating runes

### Between-Match Cutscene

- Use `8kj6...png` dimmed + vignette for a strong “arena roster / challengers waiting” mood
- Text: `The gate stirs again...`
- CTA: `Begin Trial`

### Rank Up Cutscene

- Use active profile portrait when available (future customized face)
- Fallback to one of the transparent portraits from `tmp`

## 7) Technical rollout order (low risk)

1. Add `CutscenePlayer` with one simple full-screen panel and skip/advance
2. Add image preloading + asset manifest
3. Integrate `BETWEEN_MATCH` cutscene on `Play Again`
4. Add opening first-launch trigger + profile persistence flag
5. Add rank-up trigger queue
6. Add boss rune cutscene hook when boss gameplay exists

This order avoids touching core gameplay timing while proving the presentation layer first.

## 8) Performance / polish notes

- Convert final shipped cutscene assets to `webp` (keep `png` during iteration)
- Preload images once to avoid transition hitching on slower machines
- Respect reduced motion:
  - disable parallax drift
  - shorten fades
  - keep text readable
- Add `skip` on click / `Space` / `Enter`

## 9) Concrete next implementation target

Start with:

- `BETWEEN_MATCH` cutscene only
- 1 panel
- uses `tmp/Gemini_Generated_Image_8kj6y38kj6y38kj6.png`
- button: `Begin Trial`

That gives immediate visible value and validates the cutscene framework before adding first-launch/profile persistence rules.

