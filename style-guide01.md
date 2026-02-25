# Arcane Rink — Warcraft-Style UI & Art Direction Guide (for Codex)

> Purpose: Keep visuals consistent with **Warcraft III / dark medieval fantasy** (carved wood, iron, gold, runes, candles) — NOT cyber/sci-fi HUD.
> Use this document as the **single source of truth** for UI styling, colors, typography, materials, and motion.

---

## 1) North Star

**If it looks like it belongs in a torchlit arena forged from iron and oak, it’s correct.**
If it looks like a modern esports overlay, Tron UI, or futuristic HUD, it’s wrong.

### Keywords (include in prompts/comments)

- Torchlit, carved, hammered, embossed, weathered
- Oak, iron, bronze, stone, parchment
- Runic engraving (etched), sigils, banners, rivets
- Blood Bowl brutality (controlled), Warcraft III readability

### Forbidden keywords

- Neon, cyber, sci-fi, hologram, glass UI, HUD, techno, Tron, “digital glow”

---

## 2) Visual System Rules

### Rule A — Physical Materials > Flat UI

Every panel should read as a **physical object**:

- carved wood base
- iron corner plates + rivets
- inset stone/parchment for text
- metallic bezel for dials
- engraved runes (etched, not glowing)

### Rule B — Warm Light + Cold Shadow (No Neon)

Lighting is **torch warm** with **cool ambient shadow**.

- Glows (if any) are **subtle** and **motivated** (ember, gold, rune faint).

### Rule C — Big Numbers, Thick Text

- Score numbers must be **bold, serif**, gold embossed.
- Labels are small but still thick and readable.
- No skinny fonts.

---

## 3) Color Palette (Tokens)

### Base Materials (global)

- `INK_900`  = #0F1113  (deep background)
- `IRON_800` = #1F2123  (dark iron)
- `IRON_700` = #2A2C2F  (main frame)
- `STEEL_600`= #4A4A48  (edge trim)
- `STONE_500`= #5C5346  (stone plate)
- `OAK_700`  = #3B2A1C  (wood panel)
- `PARCH_200`= #D7C6A1  (parchment)
- `BONE_200` = #CFC3A8  (bone text / icons)

### Accents (global)

- `GOLD_500` = #C8A12E  (primary highlight)
- `GOLD_600` = #D4AF37  (score / coins)
- `CRIM_600` = #7A1C1C  (danger / threat)
- `EMBER_600`= #B13A1A  (heat, warning)
- `MOSS_600` = #4A5E3B  (nature alt theme)
- `FROST_400`= #6F8FAF  (cold alt theme; muted only)
- `PURP_600` = #3F2A5A  (late-game arcane; regal)

### Core rule

**Do not use bright cyan/teal “neon” as a primary.**
If blue is needed, use muted `FROST_400` and keep it low saturation.

---

## 4) Arena Theme Palettes (by Level)

### 4.1 Frost Crypt (early)

- Primary: `FROST_400`, `STONE_500`, `STEEL_600`
- Accent: `GOLD_500` (small), `BONE_200`
- Glow: extremely faint, pale, never neon

### 4.2 Infernal Coliseum

- Primary: `IRON_800`, `OAK_700`, `CRIM_600`
- Accent: `EMBER_600`, `GOLD_600`
- “Threat” reads as ember/magma

### 4.3 Druidic Stone

- Primary: `MOSS_600`, `STONE_500`, `OAK_700`
- Accent: `GOLD_500` + desaturated green
- Organic carved motifs

### 4.4 Bloodfang War Pit (orc/brutal)

- Primary: `IRON_800`, `CRIM_600`, `OAK_700`
- Accent: `BONE_200`, `GOLD_500`
- Spikes/skulls allowed but restrained

### 4.5 High Arcane Citadel (late)

- Primary: `PURP_600`, `IRON_700`, marble greys
- Accent: `GOLD_600`
- “Magic” feels regal, not neon

---

## 5) Typography

### Goals

- Warcraft-like: **serif, carved, bold**
- Readable at distance: TV across living room

### Recommended font stack (web-safe + optional Google fonts)

**Primary Display (scores / headers):**

- `Cinzel`, `IM Fell English`, `Georgia`, `Times New Roman`, serif

**Body/labels (small):**

- `Inter`, `Arial`, sans-serif (but increase weight + spacing)

### Typography rules

- Scores: **700–900 weight**, gold, embossed effect
- Labels: **600 weight**, uppercase, letter-spacing 0.06–0.12em
- Avoid thin weights (<500). Avoid geometric sci-fi fonts.

---

## 6) UI Components — Required Look

### 6.1 Scoreboard Frame

- Thick outer frame with:
  - iron corners (plates)
  - rivets
  - bevel + inset shadow
- Inner panel: wood or stone plate
- Divider lines: etched metal, not glowing lines

### 6.2 Time Display (replace “digital HUD ring”)

- Prefer: **brass/iron clock bezel**
- Tick marks carved/etched
- Progress ring allowed but must look like **mechanical dial**, not neon LED

### 6.3 Combo / Chain (coins & runes)

Replace bars with:

- coin pips (fills up)
- rune medallions lighting faintly
- “xN” multiplier on a small plaque

### 6.4 Threat Level

Replace gradients with:

- skull totem + carved slots
- or iron spike column that fills with ember
- pulse only at high threat

### 6.5 Status / Shield

Shield should look like:

- engraved inset bar with gold/stone fill
- or rune wards “segments” filling
  No bright blue progress bars.

---

## 7) Materials & Texture (CSS/Canvas guidance)

### What to simulate in code

- Hammered metal: layered gradients + subtle noise
- Wood grain: linear gradients + noise overlay
- Scratches: repeating-linear-gradient overlay at low opacity
- Embossed gold: gradient + inner shadow + highlight

### Texture rules

- Texture opacity: 0.04–0.12 (subtle)
- Never use clean flat surfaces for major panels

---

## 8) Motion & Feedback

### Motion principles

- Short, weighty, tactile
- “Thunk” / “clack” feeling, not “whoosh neon”

### Allowed effects

- Score bump: scale 1.00 → 1.06 → 1.00 (120–180ms)
- Coin chime: small sparkle (gold)
- Threat pulse: slow 1.0 → 1.03 breathing at high threat
- Rune flicker: subtle brightness oscillation

### Avoid

- fast glow sweeps
- neon trails
- sci-fi scanlines (unless extremely subtle and medievalized)

---

## 9) Audio Coupling

When visuals trigger, audio should match:

- metal clink (coins)
- low drum hit (goal)
- rune hum (oracle line)
- crack/ice snap (shield break)
  No futuristic “beeps” as primary cues.

---

## 10) Implementation Notes for Codex (how to build in code)

### Approach

- Use DOM for text/layout (crisp)
- Use SVG for runes/dials
- Use CSS variables for theme tokens
- Provide theme packs: Frost/Infernal/Druidic/Bloodfang/Arcane

### Deliverables expected

- `ui-theme.css` with variables for tokens + level overrides
- `Scoreboard.ts` that consumes state and applies:
  - theme class on container: `theme-frost`, `theme-infernal`, etc.
  - anim classes: `score-bump`, `combo-flash`, `threat-pulse`

### Minimal required CSS variables

- `--ink`, `--iron`, `--steel`, `--stone`, `--oak`, `--parch`, `--gold`, `--crim`, `--ember`
- `--text-main`, `--text-muted`
- `--panel-bg`, `--frame-bg`, `--bevel-hi`, `--bevel-lo`

---

## 11) Quick Visual Checklist (pass/fail)

PASS if:

- Looks carved/forged/torchlit
- Score is gold embossed and legible
- Combo reads as coins/runes
- Threat reads as skull/ember/iron
- No neon cyan dominance
- Fonts are thick and readable

FAIL if:

- Looks like a clean sci-fi HUD
- Thin “cyber” typography
- Blue glow is the main accent
- Flat panels with minimal texture
- UI resembles modern esports broadcast

---

## 12) Example Theme Overrides (CSS)

```css
:root {
  --ink: #0F1113;
  --iron: #2A2C2F;
  --steel: #4A4A48;
  --stone: #5C5346;
  --oak: #3B2A1C;
  --parch: #D7C6A1;
  --gold: #D4AF37;
  --crim: #7A1C1C;
  --ember: #B13A1A;
  --frost: #6F8FAF;
  --purp: #3F2A5A;
}

/* Frost Crypt */
.theme-frost {
  --accent: var(--frost);
  --threat: #8C1F1F; /* keep danger red */
  --panel-bg: color-mix(in srgb, var(--iron) 80%, var(--frost) 20%);
}

/* Infernal */
.theme-infernal {
  --accent: var(--ember);
  --threat: var(--ember);
  --panel-bg: color-mix(in srgb, var(--iron) 70%, var(--crim) 30%);
}

/* Bloodfang */
.theme-bloodfang {
  --accent: var(--crim);
  --threat: var(--crim);
  --panel-bg: color-mix(in srgb, var(--iron) 75%, var(--oak) 25%);
}

/* Arcane Citadel */
.theme-arcane {
  --accent: var(--gold);
  --panel-bg: color-mix(in srgb, var(--iron) 70%, var(--purp) 30%);
}
```
