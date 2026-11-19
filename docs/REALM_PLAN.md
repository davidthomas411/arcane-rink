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

## 1b. Where the design went next: a hockey match

Feedback on the quest game was that it still was not a hockey game. The answer is a
**turn-based fantasy hockey match in 3D** where each dice roll is a real drill.

Why turn-based rather than real-time:

- The body tracker returns about 7 poses a second, about 150 ms late. That is fine for
  an avatar and for judging posture, and too slow to steer fast action.
- A kid on a 10 × 7 ft floor cannot skate a rink, but can coach one and perform its key moments.
- Turns give natural rest, let siblings tag in, and make every rep matter: a failed roll is a turnover.

How the pieces of existing work are used:

| Existing piece | Role in the match |
| --- | --- |
| Overhead puck tracking | Cursor on the rink (hold on a square to choose); the puck in drills |
| Stickhandling and pass recognition | The drills that produce each roll |
| Rebounders | Pass and shot rolls |
| Fast SAM 3D Body server | The player as a 3D figure; head-up bonus on rolls; knee bend readout |
| Original art, sounds, style | Standee pieces, rink, scoreboard |

Rules in brief (`src/league/rules.ts`): 11 × 7 rink; four skaters a side with move,
strength, agility, passing and shooting numbers; three activations a turn; leaving a
square next to an opponent needs a deke; passes, shots and checks roll against a target
with modifiers for range, angle and pressure; a failed deke, pass or shot is a turnover;
knocked-down skaters miss a turn; two periods; faceoffs after goals and at each period.

Not built yet: stick detection (the avatar's stick is inferred from hand positions, and
only when the server sends 3D joints), a league or season, player advancement between
matches, a second human coach, and more creature art.

## 1c. Then: real-time hockey with the player as the skater

Next feedback: use full body tracking for the main player (a few poses a second is
responsive enough), drop the dice so the avatar is driven directly, and make the rink
much bigger. That is **Play hockey** (`src/rush/`).

- **Big rink, small floor.** The rink is 26 × 60 m. The player's floor is a patch that
  rides along with their skater, so the puck's place on the floor is its place at the
  skater's feet. Averaged over half a second, that offset also steers: forward is faster,
  sideways drifts. Quick dribbles average out, so stickhandling does not jerk the skater about.
- **Dekes are real.** A defender winds up a poke-check at where the puck is; a red ring
  marks the spot. Move the puck out of it in time or lose it.
- **Passing is real.** A pass off a side rebounder sends the puck to a winger. The puck
  really does come back off the rebounder; catching it clean is the return pass.
- **Shooting is real.** In their zone, a pass off the far rebounder is a shot, and which
  end of the rebounder it strikes picks the corner. The goalie leans toward the puck's side.
- **The skater is the player.** With the body server connected, the tracked mesh stands on
  the rink in place of the built-in figure. It is updated a few times a second and blended
  between poses. Without the server, the built-in figure's stick still follows the real puck.

Simplifications in this first cut: after a turnover there is a puck battle rather than a
full goblin rush to defend; no offside or line changes; wingers hold formation rather
than reading the play; one human skater.

## 2. The core idea

**The floor is blank. Everything the player needs to know is on the TV.**

The TV shows a top-down map of the real floor. **The puck is the hero.** Creatures stand
on that map, turn to face the puck, wind up attacks and move. How the puck is handled
decides what the hero does. The only way to play is to look at the TV while the puck is
on the stick, so heads-up puck control is not a rule the kids are told to follow; it is
the only way to win.

The first version of this rebuild was a set of drills with a health bar on top: go to the
circle, alternate between two circles. That was rightly called out as still "chasing a
circle", so combat was redesigned around enemies that behave.

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

| Action | How it is detected |
| --- | --- |
| Dribble touch | Direction reversal of 0.3 ft or more; 1.4 ft or more counts as wide |
| Dash | Puck path crosses an enemy above a speed threshold |
| Loop | Heading turns through 360°; its centre and radius say what was encircled |
| Pass | Puck above a speed threshold aimed at a rebounder, travelling and reaching it |
| Clean catch | Puck settles under control after the rebound |

Pass speed is measured in real units and shown in mph in the practice report.

## 4. Game design

### The hero's moves

All five come from how the puck is handled. Nothing is a button.

| Move | How to do it | Effect | Trains |
| --- | --- | --- | --- |
| Strike | Quick dribbles right beside an enemy | Steady damage | Narrow, soft, fast touches |
| Cleave | Wide dribbles near enemies | Hits everything in reach | Wide dribble, full extension |
| Dash | Cut the puck fast straight through an enemy | Heavy hit | Pulls, pushes, toe-drag-style cuts |
| Ring | Draw a loop around enemies | Damages and freezes all inside | Circles, figure-eights |
| Bolt | Pass off a rebounder | Lightning: stuns, breaks shields and wards. A clean catch empowers the next hit | Passing and receiving |

### The enemies

Each one asks for a different piece of hockey, and several at once ask for decisions.

| Enemy | What it does | What beats it |
| --- | --- | --- |
| Imp | Runs from the puck | Chase it down: carrying with eyes up |
| Grunt | Turns to face you and swings at a red cone in front of it | Dribble beside it, step around the swing. Its back takes extra damage |
| Berserker | Paints a lane, then charges down it | Leave the lane. If it misses it hits the boards and is stunned |
| Shield brute | Blocks everything from the front | Get the puck behind it, or crack the shield with a pass |
| Shaman | Stays at range and casts bolts | Hit it mid-cast to interrupt, or dodge sideways |
| Totem | Heals the others; sticks cannot hurt it | Only a pass off a rebounder |
| Wisps | A swarm that dives at the puck | Loop around the pack, or dash through |
| Bosses | Cycle through swings, charges, bombs, volleys, summons, and a ward only lightning breaks | All of the above, in whatever order the boss demands |

Positioning matters (which side of an enemy the puck is on), target choice matters (the
shaman at the back, the totem healing everyone), and timing matters (punish the stun).

### Quest types

- **Slay**: clear waves of mixed enemies.
- **Defend**: raiders march on a ward stone from every side. Hitting one pulls it onto
  you instead, so the job is to scan, pick the most urgent one and get there.
- **Dungeon**: three fights ending in a boss. **Raid**: one long boss fight in shifts.
- **Daily routine**: five one-minute blocks on training posts that only one move can hurt.

### Heroes, classes, progression

Each kid makes a hero (with their painted portrait from the original game) and picks a
class that leans on one move: Blademaster (bolts and cleaves), Frost Mage (rings),
Shadow Rogue (backstabs and dashes), Rune Ranger (chain lightning, empowered catches).
A power bar fills as they fight; when full, a class gesture fires a signature move.

Each hero has a challenge tier (Rookie / Skilled / Elite) that slows enemies and lowers
the pass and dash speeds needed, so siblings of different ages share a party fairly.

No dead ends: at zero health the hero is knocked down and gets up with 10 quick dribbles.
Enemies drop gold and health to pick up. XP, levels, loot with rarities, and three hockey
skill bars (Stickhandling, Passing, Heads-Up) carry over. A practice report follows every run.

### Party play with one puck

One player is on the floor at a time. Dungeons and raids call **TAG IN** every 40–45
seconds; the next hero starts by bringing the puck to the start circle.

### Look

The rink uses the original game's ice texture, cathedral hall, goblin art and player
portraits, plus its recorded puck hits and music. Enemy types are tinted variants of the
one goblin painting, because that is the only creature art in the repo. New art dropped
into `src/realm/assets/` can replace them one line each in `render/ArenaRenderer.ts`.

## 5. What is built now

Code lives in `src/realm/`:

| Area | Files |
| --- | --- |
| Tracking | `input/CameraSource.ts`, `input/vision.ts`, `input/MouseSource.ts`, `input/calibration.ts` |
| Action recognition | `input/Gestures.ts` |
| Combat engine | `game/encounter.ts` |
| Content (data only) | `game/content.ts` — 3 zones, 11 quests, 2 dungeons, 1 raid, the daily routine |
| Heroes, loot, rewards | `game/classes.ts`, `game/save.ts`, `game/loot.ts`, `game/rewards.ts` |
| Screens | `app.ts`, `ui/PlaySession.ts`, `ui/CalibrationScreen.ts`, `render/ArenaRenderer.ts` |
| Demo player | `input/BotSource.ts` — plays the game itself; used by tests and "Watch it play itself" |
| Tests | `tests/realm.test.ts` — the demo player beats every encounter as every class |

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

To see the game before setting anything up, turn on **Watch it play itself** on the first screen.

## 8. Next steps, in rough priority

1. Tune from real play (section 6).
2. Puck-driven menus, so kids never touch the keyboard between fights.
3. More creature art (boar, shaman, dragon, lich) to replace the tinted goblins; goblin videos and announcer lines.
4. More zones and bosses; talents per class; cosmetic rewards.
5. A shooting target zone and shot-speed challenges.
6. Toe-drag and backhand-specific recognition (needs the player's side to be known).
7. Two pucks of different colours for true simultaneous co-op.
8. Weekly progress page per kid.
9. Repo clean-up: move live assets out of `tmp/`, drop the unused scaffold.
