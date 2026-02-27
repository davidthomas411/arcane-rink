# Arcane Rink: Trials of the Puckbound

Fantasy hockey pad game prototype built with Vite + TypeScript.

## Screenshot

![Arcane Rink gameplay screenshot](image/style-guide01/1772095491674.png)

## Current Vertical Slice

- Mouse puck tracking provider (`MousePuckProvider`), with provider abstraction for CV/WebSocket swap later
- Arcane rink pad rendering with ice textures and rune gate target system
- Hockey-style 3-period match loop (offense/defense possession, goals, momentum)
- Threat/seal system with breach fail state + cinematic outro
- Rune faceoff spell mechanic (trace path, snap to center)
- Spell Demo mode for practicing faceoff pacing
- Profiles, XP, loot unlocks, and equipment customization
- In-game announcer/audio hooks and transition screens

## Run Locally

```bash
npm install
npm run dev
```

## Build

```bash
npm run build
```

## Controls

- Move mouse on the game canvas to control reticle/puck
- Hit rune gates to build offense/defense charge
- Use top controls for `Training`, `Spell Demo`, `Customize`, and `Restart`
- Press `R` to restart after a completed run
