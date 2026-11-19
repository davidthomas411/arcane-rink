# Arcane Rink: Realm of the Puckbound — review, design and plan

## 1. Review of the original draft

What was good and is kept:

- The Warcraft-style art direction and style guide (`style-guide01.md`), reused for the new UI.
- The loop of profiles → XP → loot. The new game keeps the idea and widens it.
- The `PuckProvider` idea: gameplay never reads the mouse directly.

What held it back:

| Finding | Detail |
| --- | --- |
| No real puck tracking | Only `MousePuckProvider` existed and `Game.ts` hard-coded it. The camera/WebSocket provider in the brief was never written. |
| One verb | The only action was "move the puck into a ring" on a small pad, so play collapsed to side-to-side. |
| No real-world units | The pad was normalised 0..1. Without feet and feet-per-second you cannot tell a pass from a carry. |
| Single player | One profile per run, no way for siblings to play together. |
| Hard to extend | `RuneGatesHUD.ts` is one 5,400-line class, `App.ts` 1,600 lines, `styles.css` 6,700 lines. |
| Build was broken | `npm run build` failed type-checking (`AudioContext` typing). Fixed. |
| Repo weight | 141 MB, mostly `tmp/` scratch files (including an unused Next.js scaffold), and the game imports images from `tmp/`. Not cleaned up here; worth doing separately. |

The original game still runs, untouched apart from the build fix, at `/legacy.html`.

## 2. The core idea

**The floor is blank. Everything the player needs to know is on the TV.**

Targets, dangers and enemy spells exist only on screen, drawn on a top-down map of the
real floor. The only way to play is to look at the TV while the puck is on the stick.
Heads-up puck control is not a rule the kids are told to follow; it is the only way to win.

Three things reinforce it:

1. **Don't stand in the fire.** Blasts land where the puck is. Move it or get burned.
2. **Interrupts.** The boss shows a symbol on its cast bar (top of the screen). The
   matching stone is one of three on the floor map. Read, scan, go.
3. **Chasers and waves.** Things that move, so one glance is never enough.

## 3. Setup this is built for

- Basement vinyl floor, default play area 10 × 7 ft (set your own size).
- Green Biscuit puck, tracked by colour.
- One camera overhead (or high on a wall), plugged into the computer that drives the TV.
- One or more rebounders at the edges.
- Runs in Chrome/Edge. No install, no server, works offline.

### How tracking works

1. Each camera frame is shrunk to 480 px wide and thresholded for the puck's colour (HSV).
2. Connected blobs are found; the one that is puck-sized and nearest the predicted
   position wins. Green shirts and toys are rejected by size and distance.
3. Four floor corners marked in setup give a homography from camera pixels to **feet on
   the floor**, so the camera does not have to be perfectly overhead or square.
4. An alpha-beta filter smooths position and estimates velocity in ft/s.
5. If the puck is hidden (behind a body or the blade) the game coasts briefly, then
   **freezes the fight** rather than punishing the player.

### What the game can recognise from the puck track

| Action | How it is detected | Trains |
| --- | --- | --- |
| Carry | Puck reaches a spot | Moving the puck with eyes up |
| Dribble touch | Direction reversal of 0.3 ft or more | Hand speed, soft touches |
| Narrow / wide / pull-push / diagonal | Alternating between two pads at a set spacing and angle | The staple stickhandling patterns |
| Figure-eight | Winding angle around two pillars | Forehand and backhand turns |
| Circle | Heading turns through 360° | Around-the-world control |
| Pass | Puck above a speed threshold aimed at a rebounder, reaching it | Hard, flat passes |
| Clean catch | Puck settles under control after the rebound | Receiving, soft hands |
| Hold | Puck dead still in a small circle | Control after a move |

Pass speed is measured in real units and shown in mph in the practice report.

## 4. Game design

### Heroes and classes

Each kid makes a hero. Up to four heroes form a party. Each class rewards a different habit:

| Class | Rewards | Signature move (when the power bar is full) |
| --- | --- | --- |
| Blademaster | Hard passes, strong wide dribbles | Thunder Shot: rip a hard pass off a rebounder |
| Frost Mage | Figure-eights and patterns | Arcane Ring: draw a full circle |
| Shadow Rogue | Fast hands, quick escapes | Flurry: 7 lightning-quick dribbles |
| Rune Ranger | Give-and-go | Volley: pass and catch it clean, fast |

Each hero also has a **challenge tier** (Rookie / Skilled / Elite) that sets target size,
reaction time and pass-speed threshold, so siblings of different ages share a party fairly.

### Combat

- **Offense** is the reps: runes to carry to, twin pads to dribble between, pillars to
  weave, crystals (rebounders) to pass off, circles to settle the puck in. Each one hits the enemy.
- **Every dribble touch chips the enemy**, so there is never a reason to stand still.
- **Hazards** are the heads-up checks: fire, sweeping waves with a safe gap, hunting wisps,
  and interruptible spells.
- **No dead ends.** At zero health the hero is knocked down and gets up with
  10 quick dribbles. Failing costs stars, not the session.
- Combos, floating damage numbers, a boss health bar and a cast bar give it the MMO feel.

### Progression

- **Quests** (about a minute) each teach one pattern. **Dungeons** chain three fights and a boss.
  The **raid** is one huge boss the party wears down in 40-second shifts.
- **XP and levels** unlock zones. **Loot** has rarities and item levels and auto-equips upgrades.
- **Hockey skills** (Stickhandling, Passing, Heads-Up) rise with real reps, like profession bars.
- **The Five-Minute Vigil**: five one-minute blocks (narrow, wide, pull-push, figure-eight,
  give-and-go) with a daily streak. This is the "do it every day" habit builder.
- **Practice report** after every run: touches, passes, clean catches, hardest pass, puck
  travel, dodges, and average time to read a spell and reach the right stone.

### Party play with one puck

One player is on the floor at a time. In dungeons and raids the game calls
**TAG IN** every 45 or 40 seconds, and the next hero starts by bringing the puck to the
start circle. Work, rest, work — like shifts.

## 5. What is built now

Code lives in `src/realm/`:

| Area | Files |
| --- | --- |
| Tracking | `input/CameraSource.ts`, `input/vision.ts`, `input/MouseSource.ts`, `input/calibration.ts` |
| Action recognition | `input/Gestures.ts` |
| Combat engine | `game/encounter.ts` |
| Content (data only) | `game/content.ts` — 3 zones, 10 quests, 2 dungeons, 1 raid, the daily routine |
| Heroes, loot, rewards | `game/classes.ts`, `game/save.ts`, `game/loot.ts`, `game/rewards.ts` |
| Screens | `app.ts`, `ui/PlaySession.ts`, `ui/CalibrationScreen.ts`, `render/ArenaRenderer.ts` |
| Tests | `tests/realm.test.ts` — includes a bot that beats every encounter as every class |

Adding a quest is a few lines of data in `content.ts`.

## 6. What has and has not been tested

Tested: unit tests for the homography, colour tracker, action recognition, combat and
progression; a scripted player completing quests and a party dungeon in a real browser;
the camera pipeline end to end against a synthetic video of a green dot.

**Not yet tested: a real camera, a real Green Biscuit, real kids.** Expect to tune these
on the first evening:

1. Colour thresholds under basement lighting (setup screen: click the puck, then sliders).
   The default was checked against two phone photos of the real puck on the real floor:
   it was the only thing detected in both, including a cluttered wide shot. That is
   still photos, not a moving puck on a webcam.
2. Pass-speed thresholds per tier (`TIERS` in `game/classes.ts`).
3. Fight length and hazard timing (`game/content.ts`).
4. Camera and TV latency. A game-mode TV setting and a 60 fps camera help.

## 7. First-evening checklist

1. `npm install`, `npm run dev`, open the address on the computer driving the TV.
2. Create heroes. Try a quest with the mouse to learn the screens.
3. **Camera & floor setup**: start the camera, drag the four corners onto the play area
   (Far = TV side), enter the size in feet, click the puck, drag the blue bars onto the rebounders.
4. Save, play Rat Catcher, then Crystal Charge to check passes register.

## 8. Next steps, in rough priority

1. Tune from real play (section 6).
2. Puck-driven menus, so kids never touch the keyboard between fights.
3. Bring the original art, goblin videos and announcer audio into the new game.
4. More zones and bosses; talents per class; cosmetic rewards.
5. A shooting target zone and shot-speed challenges.
6. Toe-drag and backhand-specific recognition (needs the player's side to be known).
7. Two pucks of different colours for true simultaneous co-op.
8. Weekly progress page per kid.
9. Repo clean-up: move live assets out of `tmp/`, drop the unused scaffold.
