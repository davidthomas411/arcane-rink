# Arcane Rink: Realm of the Puckbound

A Warcraft-style hockey practice game for a basement floor. An overhead camera tracks a
Green Biscuit puck; the TV shows a top-down map of the floor with quests, bosses and
dangers that exist only on screen. To play, you have to look up.

Built with Vite + TypeScript. No server, no accounts, works offline.

![A boss fight: the goblin boss throws bombs while the hero puck works in behind him](docs/img/boss-fight.jpg)

- **Plan, design and review of the first draft:** [docs/REALM_PLAN.md](docs/REALM_PLAN.md)
- **Original shooting-pad prototype:** still available at `/legacy.html`

## Run it

```bash
npm install
npm run dev      # then open the printed address in Chrome or Edge
npm test         # engine tests, including a bot that plays every encounter
npm run build
```

The camera needs `localhost` or https. Running the browser on the same computer that is
plugged into the TV and the camera is the simplest setup.

## What you need

- A clear patch of smooth floor (default 10 × 7 ft; any size works)
- A Green Biscuit (or any puck in a colour that stands out from the floor)
- A webcam mounted overhead or high on a wall, seeing the whole play area
- A TV the player can see while handling the puck
- Optional but recommended: one or more rebounders at the edge of the play area

## First-time setup

1. Open the game and choose **Camera & floor setup**.
2. **Start camera**, then drag the four gold corners onto the corners of the play area.
   "Far" is the edge nearest the TV.
3. Enter the play area's width and depth in feet.
4. Put the puck on the floor, choose **Click the puck to learn its colour**, and click it.
   It should be circled in yellow wherever you slide it.
5. Drag the blue bars in the top-down view onto your real rebounders.
6. **Save · play with camera.**

![Camera and floor setup screen](docs/img/camera-setup.jpg)

No camera handy? **Save · play with mouse** and the pointer stands in for the puck.

## How it plays

The puck is your hero. Creatures on the TV turn to face it, wind up and attack, and how
you handle the puck decides what your hero does:

| Do this with the puck | Your hero does this |
| --- | --- |
| Quick dribbles beside an enemy | Strikes it (harder from behind) |
| Wide dribbles | Cleaves everything in reach |
| Cut fast straight through an enemy | Dashes through it |
| Draw a loop around enemies | Freezes and damages all inside |
| Pass off a rebounder | Calls lightning: stuns, breaks shields and wards |

- Grunts swing at a red cone in front of them. Berserkers charge down a lane and stun
  themselves if they miss. Brutes block from the front. Shamans cast from range. Totems
  heal and only lightning hurts them. Wisps swarm. Bosses do all of it.
- **Quests** teach one enemy each. **Defend** quests have raiders coming at a ward from
  every side. **Dungeons** end in a boss. The **raid** is one long boss fight in shifts.
- Each kid creates a **hero** with a class and a challenge tier, so different ages can
  share a party. In dungeons and raids the game calls **TAG IN** every 40–45 seconds.
- Knocked down? Ten quick dribbles and you are back up.
- **The Five-Minute Vigil** is the daily routine with a streak counter.
- After each run a **practice report** shows touches, passes, clean catches, hardest pass
  and heads-up reactions.

![Defending the ward stone from raiders](docs/img/defend.jpg)

Controls during play: `Space` skips the start circle, `P` pauses, `Esc` leaves.

Want to see it before setting up? Turn on **Watch it play itself** on the first screen
and start any quest: a scripted player handles the puck.

## Status

The engine, tracking pipeline and screens are tested with automated players and a
synthetic camera feed. It has not yet been tuned with a real camera, puck and kids;
see the plan for what to adjust first.
