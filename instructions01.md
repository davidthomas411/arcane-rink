# Arcane Rink

## CV Puck-Tracking Fantasy Hockey Game (HUD-First Prototype)

You are Codex.

Build a runnable local prototype on macOS using Vite + TypeScript.

Internet may be unreliable.

Do NOT depend on external assets or APIs.

Use procedural visuals via Canvas when needed.

This is a  **computer vision puck tracking game** .

The flight build will use mouse input, but the architecture must explicitly support swapping in a real CV tracking provider later (webcam/iPhone overhead).

The key principle:

> The puck tracker IS the gameplay.

No fake joystick control.

All gameplay objects exist in the same coordinate system as the tracked puck.

---

# 🎯 Core Concept

Kids use a real puck on a shooting pad in the living room.

Later:

* Overhead camera tracks puck.
* CV outputs normalized (x,y) coordinates.
* The TV displays fantasy targets on the pad.
* Kids move puck to hit those targets.

For now:

* Mouse simulates puck tracking.
* Everything else must be architected exactly as if CV already exists.

---

# 🕹 What We Are Building (Flight Version)

A HUD-based fantasy mini-game system.

Gameplay takes place in a **2D tracked pad plane** rendered on screen.

* A visible pad bounds rectangle represents the real shooting pad.
* A glowing puck reticle moves 1:1 with tracking input.
* Targets spawn inside the pad bounds.
* Hits occur when puck enters target radius.
* Score, combo, timer, XP, rewards, and profiles exist.

3D backgrounds are optional and decorative only.

This is NOT:

* A platformer
* A forward runner
* A fake animated game

This IS:

* A puck tracking training game with fantasy presentation.

---

# 🧱 Tech Stack

* Vite
* TypeScript
* DOM + Canvas 2D for gameplay
* Three.js optional (background only, not required)

Install:

<pre class="overflow-visible! px-0!" data-start="1978" data-end="2072"><div class="relative w-full my-4"><div class=""><div class="relative"><div class="h-full min-h-0 min-w-0"><div class="h-full min-h-0 min-w-0"><div class="border corner-superellipse/1.1 border-token-border-light bg-token-bg-elevated-secondary rounded-3xl"><div class="pointer-events-none absolute inset-x-4 top-12 bottom-4"><div class="pointer-events-none sticky z-40 shrink-0 z-1!"><div class="sticky bg-token-border-light"></div></div></div><div class="pointer-events-none absolute inset-x-px top-6 bottom-6"><div class="sticky z-1!"><div class="bg-token-bg-elevated-secondary sticky"></div></div></div><div class="corner-superellipse/1.1 rounded-3xl bg-token-bg-elevated-secondary"><div class="relative z-0 flex max-w-full"><div id="code-block-viewer" dir="ltr" class="q9tKkq_viewer cm-editor z-10 light:cm-light dark:cm-light flex h-full w-full flex-col items-stretch ͼd ͼr"><div class="cm-scroller"><div class="cm-content q9tKkq_readonly"><span>npm create vite@latest arcane-rink -- --template vanilla-ts</span><br/><span>cd arcane-rink</span><br/><span>npm install</span></div></div></div></div></div></div></div></div><div class=""><div class=""></div></div></div></div></div></pre>

Optional:

<pre class="overflow-visible! px-0!" data-start="2084" data-end="2109"><div class="relative w-full my-4"><div class=""><div class="relative"><div class="h-full min-h-0 min-w-0"><div class="h-full min-h-0 min-w-0"><div class="border corner-superellipse/1.1 border-token-border-light bg-token-bg-elevated-secondary rounded-3xl"><div class="pointer-events-none absolute inset-x-4 top-12 bottom-4"><div class="pointer-events-none sticky z-40 shrink-0 z-1!"><div class="sticky bg-token-border-light"></div></div></div><div class="pointer-events-none absolute inset-x-px top-6 bottom-6"><div class="sticky z-1!"><div class="bg-token-bg-elevated-secondary sticky"></div></div></div><div class="corner-superellipse/1.1 rounded-3xl bg-token-bg-elevated-secondary"><div class="relative z-0 flex max-w-full"><div id="code-block-viewer" dir="ltr" class="q9tKkq_viewer cm-editor z-10 light:cm-light dark:cm-light flex h-full w-full flex-col items-stretch ͼd ͼr"><div class="cm-scroller"><div class="cm-content q9tKkq_readonly"><span>npm install three</span></div></div></div></div></div></div></div></div><div class=""><div class=""></div></div></div></div></div></pre>

Run:

<pre class="overflow-visible! px-0!" data-start="2116" data-end="2135"><div class="relative w-full my-4"><div class=""><div class="relative"><div class="h-full min-h-0 min-w-0"><div class="h-full min-h-0 min-w-0"><div class="border corner-superellipse/1.1 border-token-border-light bg-token-bg-elevated-secondary rounded-3xl"><div class="pointer-events-none absolute inset-x-4 top-12 bottom-4"><div class="pointer-events-none sticky z-40 shrink-0 z-1!"><div class="sticky bg-token-border-light"></div></div></div><div class="pointer-events-none absolute inset-x-px top-6 bottom-6"><div class="sticky z-1!"><div class="bg-token-bg-elevated-secondary sticky"></div></div></div><div class="corner-superellipse/1.1 rounded-3xl bg-token-bg-elevated-secondary"><div class="relative z-0 flex max-w-full"><div id="code-block-viewer" dir="ltr" class="q9tKkq_viewer cm-editor z-10 light:cm-light dark:cm-light flex h-full w-full flex-col items-stretch ͼd ͼr"><div class="cm-scroller"><div class="cm-content q9tKkq_readonly"><span>npm run dev</span></div></div></div></div></div></div></div></div><div class=""><div class=""></div></div></div></div></div></pre>

---

# 🏗 Architecture Overview

Everything revolves around the PuckProvider interface.

All gameplay logic reads from it.

Never read mouse directly inside gameplay.

---

# 📦 Project Structure

<pre class="overflow-visible! px-0!" data-start="2334" data-end="3083"><div class="relative w-full my-4"><div class=""><div class="relative"><div class="h-full min-h-0 min-w-0"><div class="h-full min-h-0 min-w-0"><div class="border corner-superellipse/1.1 border-token-border-light bg-token-bg-elevated-secondary rounded-3xl"><div class="pointer-events-none absolute inset-x-4 top-12 bottom-4"><div class="pointer-events-none sticky z-40 shrink-0 z-1!"><div class="sticky bg-token-border-light"></div></div></div><div class="pointer-events-none absolute inset-x-px top-6 bottom-6"><div class="sticky z-1!"><div class="bg-token-bg-elevated-secondary sticky"></div></div></div><div class="corner-superellipse/1.1 rounded-3xl bg-token-bg-elevated-secondary"><div class="relative z-0 flex max-w-full"><div id="code-block-viewer" dir="ltr" class="q9tKkq_viewer cm-editor z-10 light:cm-light dark:cm-light flex h-full w-full flex-col items-stretch ͼd ͼr"><div class="cm-scroller"><div class="cm-content q9tKkq_readonly"><span>/src</span><br/><span>  main.ts</span><br/><br/><span>  /app</span><br/><span>    App.ts</span><br/><span>    Router.ts</span><br/><br/><span>  /providers</span><br/><span>    PuckProvider.ts</span><br/><span>    MousePuckProvider.ts</span><br/><span>    WebSocketPuckProvider.ts   (stub only)</span><br/><br/><span>  /tracking</span><br/><span>    TrackingHUD.ts</span><br/><span>    PadRenderer2D.ts</span><br/><span>    Effects2D.ts</span><br/><br/><span>  /game</span><br/><span>    Game.ts</span><br/><span>    ScoreSystem.ts</span><br/><span>    PerkSystem.ts</span><br/><span>    ProgressionSystem.ts</span><br/><span>    DailyChallenge.ts</span><br/><span>    Rewards.ts</span><br/><br/><span>    /minigames</span><br/><span>      Minigame.ts</span><br/><span>      RuneGatesHUD.ts</span><br/><br/><span>  /profiles</span><br/><span>    ProfileManager.ts</span><br/><br/><span>  /models</span><br/><span>    Profile.ts</span><br/><br/><span>  /ui</span><br/><span>    UI.ts</span><br/><span>    screens/</span><br/><span>      ScreenProfileSelect.ts</span><br/><span>      ScreenCustomizeHero.ts</span><br/><span>      ScreenPerks.ts</span><br/><span>      ScreenPlay.ts</span><br/><span>      ScreenResults.ts</span><br/><span>    widgets/</span><br/><span>      HeroCard.ts</span><br/><span>      XPBar.ts</span><br/><span>      LootReveal.ts</span><br/><br/><span>  /util</span><br/><span>    Storage.ts</span><br/><span>    Math.ts</span><br/><span>    CanvasTex.ts</span><br/><br/><span>  styles.css</span></div></div></div></div></div></div></div></div><div class=""><div class=""></div></div></div></div></div></pre>

---

# 🔁 INPUT SYSTEM (CRITICAL)

Define interface:

<pre class="overflow-visible! px-0!" data-start="3139" data-end="3359"><div class="relative w-full my-4"><div class=""><div class="relative"><div class="h-full min-h-0 min-w-0"><div class="h-full min-h-0 min-w-0"><div class="border corner-superellipse/1.1 border-token-border-light bg-token-bg-elevated-secondary rounded-3xl"><div class="pointer-events-none absolute inset-x-4 top-12 bottom-4"><div class="pointer-events-none sticky z-40 shrink-0 z-1!"><div class="sticky bg-token-border-light"></div></div></div><div class="pointer-events-none absolute inset-x-px top-6 bottom-6"><div class="sticky z-1!"><div class="bg-token-bg-elevated-secondary sticky"></div></div></div><div class="corner-superellipse/1.1 rounded-3xl bg-token-bg-elevated-secondary"><div class="relative z-0 flex max-w-full"><div id="code-block-viewer" dir="ltr" class="q9tKkq_viewer cm-editor z-10 light:cm-light dark:cm-light flex h-full w-full flex-col items-stretch ͼd ͼr"><div class="cm-scroller"><div class="cm-content q9tKkq_readonly"><span>interface PuckProvider {</span><br/><span>  update(dt: number): void</span><br/><span>  getPosition(): { x: number; y: number }   // normalized [0..1]</span><br/><span>  getVelocity(): { x: number; y: number }</span><br/><span>  getConfidence(): number                   // 0..1</span><br/><span>}</span></div></div></div></div></div></div></div></div><div class=""><div class=""></div></div></div></div></div></pre>

## MousePuckProvider (used now)

* Maps mouse position over canvas → normalized pad coordinates
* Smooth movement with lerp
* Computes velocity
* Confidence always returns 1.0

## WebSocketPuckProvider (future CV)

Stub implementation only.

Must accept messages:

<pre class="overflow-visible! px-0!" data-start="3625" data-end="3658"><div class="relative w-full my-4"><div class=""><div class="relative"><div class="h-full min-h-0 min-w-0"><div class="h-full min-h-0 min-w-0"><div class="border corner-superellipse/1.1 border-token-border-light bg-token-bg-elevated-secondary rounded-3xl"><div class="pointer-events-none absolute inset-x-4 top-12 bottom-4"><div class="pointer-events-none sticky z-40 shrink-0 z-1!"><div class="sticky bg-token-border-light"></div></div></div><div class="pointer-events-none absolute inset-x-px top-6 bottom-6"><div class="sticky z-1!"><div class="bg-token-bg-elevated-secondary sticky"></div></div></div><div class="corner-superellipse/1.1 rounded-3xl bg-token-bg-elevated-secondary"><div class="relative z-0 flex max-w-full"><div id="code-block-viewer" dir="ltr" class="q9tKkq_viewer cm-editor z-10 light:cm-light dark:cm-light flex h-full w-full flex-col items-stretch ͼd ͼr"><div class="cm-scroller"><div class="cm-content q9tKkq_readonly"><span>{ t, x, y, vx, vy, conf }</span></div></div></div></div></div></div></div></div><div class=""><div class=""></div></div></div></div></div></pre>

Not used in this build.

---

# 🧭 TRACKING HUD (CORE GAMEPLAY LAYER)

This must always be visible during gameplay.

Render using DOM + Canvas overlay.

Must display:

1. Pad Bounds Rectangle
   * Represents the real shooting pad.
2. Puck Reticle
   * Glowing rune dot or crosshair.
   * Maps 1:1 to PuckProvider normalized coordinates.
3. Reticle Trail
   * Short fading trail based on velocity.
4. Input Label
   * "Input: Mouse (DEV)"
5. Confidence Bar
   * Visual bar representing provider confidence.
6. Optional Debug
   * x,y text display small.

All gameplay objects use normalized [0..1] pad coordinates.

TrackingHUD converts to pixel coordinates inside pad bounds.

---

# 🎮 Gameplay: Minigame #1 — Rune Gates (HUD)

This is the first playable slice.

## Rules

* 60 second session
* Spawn a ring target at random pad coordinate
* Player moves puck into ring to score
* Ring disappears on hit
* New ring spawns quickly

## Scoring

* Base points per hit
* Perfect bonus if near center
* Combo multiplier increases per hit
* Combo resets on miss

## Miss

* If ring times out without hit
* Or if player leaves ring early (optional)

## Boss Event

Every ~20 seconds spawn:

* Larger ring
* Worth double points
* Special animation

---

# 🎨 Visual Style

Fantasy-themed HUD.

No external assets.

Use Canvas to generate:

* Rune background grid
* Glowing ring targets
* Particle bursts
* Trail effects

Style presets for rings:

* ARCANE (purple glow)
* FROST (blue icy)
* FEL (green flame)

---

# 🧙 Classes & Perks

Three classes, rank 1 only.

## BLADEMASTER

Perk: Wider Perfect Radius (+20%)

## FROST_WARDEN

Perk: Ignore 1 miss per run

## SHADOW_ROGUE

Perk: One late hit counts as valid per run

Perk effects must visibly change outcomes.

---

# 📈 Progression System

XP formula:

<pre class="overflow-visible! px-0!" data-start="5475" data-end="5535"><div class="relative w-full my-4"><div class=""><div class="relative"><div class="h-full min-h-0 min-w-0"><div class="h-full min-h-0 min-w-0"><div class="border corner-superellipse/1.1 border-token-border-light bg-token-bg-elevated-secondary rounded-3xl"><div class="pointer-events-none absolute inset-x-4 top-12 bottom-4"><div class="pointer-events-none sticky z-40 shrink-0 z-1!"><div class="sticky bg-token-border-light"></div></div></div><div class="pointer-events-none absolute inset-x-px top-6 bottom-6"><div class="sticky z-1!"><div class="bg-token-bg-elevated-secondary sticky"></div></div></div><div class="corner-superellipse/1.1 rounded-3xl bg-token-bg-elevated-secondary"><div class="relative z-0 flex max-w-full"><div id="code-block-viewer" dir="ltr" class="q9tKkq_viewer cm-editor z-10 light:cm-light dark:cm-light flex h-full w-full flex-col items-stretch ͼd ͼr"><div class="cm-scroller"><div class="cm-content q9tKkq_readonly"><span>base + hits*2 + perfects*3 + bestCombo*5 + score/100</span></div></div></div></div></div></div></div></div><div class=""><div class=""></div></div></div></div></div></pre>

Level threshold:

<pre class="overflow-visible! px-0!" data-start="5554" data-end="5573"><div class="relative w-full my-4"><div class=""><div class="relative"><div class="h-full min-h-0 min-w-0"><div class="h-full min-h-0 min-w-0"><div class="border corner-superellipse/1.1 border-token-border-light bg-token-bg-elevated-secondary rounded-3xl"><div class="pointer-events-none absolute inset-x-4 top-12 bottom-4"><div class="pointer-events-none sticky z-40 shrink-0 z-1!"><div class="sticky bg-token-border-light"></div></div></div><div class="pointer-events-none absolute inset-x-px top-6 bottom-6"><div class="sticky z-1!"><div class="bg-token-bg-elevated-secondary sticky"></div></div></div><div class="corner-superellipse/1.1 rounded-3xl bg-token-bg-elevated-secondary"><div class="relative z-0 flex max-w-full"><div id="code-block-viewer" dir="ltr" class="q9tKkq_viewer cm-editor z-10 light:cm-light dark:cm-light flex h-full w-full flex-col items-stretch ͼd ͼr"><div class="cm-scroller"><div class="cm-content q9tKkq_readonly"><span>100 * level</span></div></div></div></div></div></div></div></div><div class=""><div class=""></div></div></div></div></div></pre>

On level up:

* perkPoints += 1
* unlock cosmetic every 2 levels
* first 3 levels unlock every level

---

# 🎁 Cosmetics

## Trails

* ARCANE_SPARK
* FROST_MIST
* FEL_FLAME

## Target Skins

* RUNE_RING
* ICE_SIGIL
* SHADOW_EYE

Rewards revealed on Results screen.

Persist in profile.

---

# 📅 Daily Challenge (Offline)

Deterministic based on date (YYYY-MM-DD).

Examples:

* Hit N targets
* Get N perfects
* Reach combo N

Completion gives bonus XP and higher drop chance.

---

# 👤 Profiles

Persist in localStorage.

Profile fields:

* id
* displayName
* jerseyNumber
* faceImageDataUrl
* classId
* stylePreset
* xp
* level
* perkPoints
* perks
* unlocked cosmetics
* stats (runs, bestScore, bestCombo)

---

# 🎨 Customization Screen

User can:

* Enter hockey name
* Enter jersey number
* Upload face image
* Apply canvas stylization filter:
  * ARCANE (posterize + purple tint)
  * FROST (cool tint)
  * FEL (green contrast)
* Select class

Display HeroCard preview.

---

# 🖥 UI Screens

1. Profile Select
2. Customize Hero
3. Perks
4. Play (Tracking HUD + minigame)
5. Results (XP bar + loot reveal)

---

# 🔧 Implementation Order (Gameplay First)

1. Scaffold Vite + full-screen canvas
2. Implement PuckProvider + MousePuckProvider
3. Implement TrackingHUD (bounds + reticle + label + confidence)
4. Implement RuneGatesHUD minigame
5. Add scoring + combo + timer
6. Add particles + visual feedback
7. Add Results screen
8. Add Profile persistence
9. Add Customize Hero
10. Add perks
11. Add progression + daily challenge + rewards

Gameplay must be working before profile systems.

---

# ✅ Acceptance Criteria

* Puck reticle maps 1:1 to PuckProvider
* Targets spawn and can be hit
* 60 second session playable
* Score and combo visible
* Profiles persist
* Perks affect gameplay
* XP and loot persist

---

# END

<pre class="overflow-visible! px-0!" data-start="7404" data-end="7695" data-is-last-node=""><div class="relative w-full my-4"><div class=""><div class="relative"><div class="h-full min-h-0 min-w-0"><div class="h-full min-h-0 min-w-0"><div class="border corner-superellipse/1.1 border-token-border-light bg-token-bg-elevated-secondary rounded-3xl"><div class="pointer-events-none absolute inset-x-4 top-12 bottom-4"><div class="pointer-events-none sticky z-40 shrink-0 z-1!"><div class="sticky bg-token-border-light"></div></div></div></div></div></div></div></div></div></pre>
