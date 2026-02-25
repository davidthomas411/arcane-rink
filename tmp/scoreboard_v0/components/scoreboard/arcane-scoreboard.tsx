"use client"

import { RuneText } from "./rune-text"
import { TimeDial } from "./time-dial"
import { ScoreDisplay } from "./score-display"
import { ThreatMeter } from "./threat-meter"
import { ComboCounter } from "./combo-counter"
import { ArcaneShield } from "./arcane-shield"
import { CornerBolt } from "./corner-bolt"

export interface ScoreboardState {
  minutes: number
  seconds: number
  home: number
  guest: number
  combo: number
  shieldPct: number
  threatPct: number
}

interface ArcaneScoreboardProps {
  state: ScoreboardState
}

export function ArcaneScoreboard({ state }: ArcaneScoreboardProps) {
  return (
    <div
      className="relative w-full max-w-[800px] mx-auto select-none"
      role="region"
      aria-label="Game Scoreboard"
    >
      {/* ===== OUTER FRAME ===== */}
      <div
        className="relative rounded-lg overflow-hidden"
        style={{
          background:
            "linear-gradient(180deg, #2e2e2e 0%, #1c1c1c 30%, #141414 100%)",
          boxShadow: `
            0 0 0 3px #0a0a0a,
            0 0 0 5px #333,
            0 0 0 6px #0a0a0a,
            0 8px 32px rgba(0,0,0,0.8),
            0 0 60px rgba(0,200,255,0.06),
            inset 0 1px 0 rgba(255,255,255,0.08)
          `,
        }}
      >
        {/* Steel frame border effect */}
        <div
          className="absolute inset-0 rounded-lg pointer-events-none z-10"
          style={{
            border: "3px solid transparent",
            borderImage:
              "linear-gradient(180deg, rgba(100,100,100,0.5) 0%, rgba(40,40,40,0.3) 50%, rgba(80,80,80,0.4) 100%) 1",
          }}
        />

        {/* Scratch texture overlay */}
        <div
          className="absolute inset-0 pointer-events-none z-[5] opacity-[0.03]"
          style={{
            backgroundImage: `
              repeating-linear-gradient(90deg, transparent, transparent 3px, rgba(255,255,255,0.5) 3px, transparent 4px),
              repeating-linear-gradient(0deg, transparent, transparent 7px, rgba(255,255,255,0.3) 7px, transparent 8px),
              repeating-linear-gradient(45deg, transparent, transparent 11px, rgba(255,255,255,0.2) 11px, transparent 12px)
            `,
          }}
        />

        {/* Corner Bolts */}
        <CornerBolt className="-top-2 -left-2" />
        <CornerBolt className="-top-2 -right-2" />
        <CornerBolt className="-bottom-2 -left-2" />
        <CornerBolt className="-bottom-2 -right-2" />

        {/* ===== RUNE TRIM TOP BAR ===== */}
        <div
          className="relative flex items-center justify-center gap-4 py-2 px-6"
          style={{
            background:
              "linear-gradient(180deg, rgba(20,20,20,0.9) 0%, rgba(15,15,15,0.95) 100%)",
            borderBottom: "1px solid rgba(0,200,255,0.1)",
          }}
        >
          <RuneText text={"\u16D7\u16C1\u16A8\u16C1\u16B2 \u16B2\u16DF\u16C1\u16D6\u16C9\u16A8\u16C8\u16B2\u16EC"} />

          {/* Center emblem */}
          <div className="relative mx-4">
            <svg viewBox="0 0 32 32" width="28" height="28" className="block">
              <path
                d="M16 4L8 12v8l8 8 8-8v-8L16 4z"
                fill="none"
                stroke="var(--arcane-ice)"
                strokeWidth="1.5"
                style={{ filter: "drop-shadow(0 0 4px var(--arcane-ice))" }}
              />
              <path
                d="M16 9l-4 5v4l4 4 4-4v-4l-4-5z"
                fill="var(--arcane-ice)"
                opacity="0.3"
              />
              <circle cx="16" cy="16" r="2" fill="var(--arcane-ice)" opacity="0.6" />
            </svg>
          </div>

          <RuneText text={"\u16C8\u16D6\u16C1\u16C1\u16B2 \u16B2\u16DF\u16C1\u16C8\u16D6\u16C1\u16B2\u16CF\u16DE\u16EC"} />
        </div>

        {/* ===== MAIN CONTENT ===== */}
        <div className="relative px-4 pt-3 pb-3 sm:px-6 sm:pt-4 sm:pb-4">
          {/* Inner dark panel */}
          <div
            className="relative rounded px-3 py-4 sm:px-5 sm:py-5"
            style={{
              background:
                "linear-gradient(180deg, #0f0f0f 0%, #0a0a0a 50%, #0d0d0d 100%)",
              boxShadow:
                "inset 0 2px 8px rgba(0,0,0,0.8), inset 0 -1px 4px rgba(0,0,0,0.4), 0 1px 0 rgba(255,255,255,0.04)",
            }}
          >
            {/* Noise overlay on inner panel */}
            <div
              className="absolute inset-0 rounded pointer-events-none opacity-[0.015]"
              style={{
                backgroundImage:
                  "repeating-linear-gradient(135deg, transparent, transparent 2px, rgba(255,255,255,1) 2px, transparent 3px)",
              }}
            />

            {/* Top row: Time | Score | Threat */}
            <div className="relative z-[1] flex items-center gap-3 sm:gap-5">
              {/* Left: Time Dial */}
              <div className="shrink-0">
                <TimeDial minutes={state.minutes} seconds={state.seconds} />
              </div>

              {/* Center: Score */}
              <div className="flex-1 flex items-center justify-center">
                <ScoreDisplay home={state.home} guest={state.guest} />
              </div>

              {/* Right side: diamond + Threat */}
              <div className="shrink-0 flex items-center gap-3">
                {/* Diamond separator */}
                <svg
                  viewBox="0 0 12 12"
                  width="10"
                  height="10"
                  className="opacity-40"
                >
                  <rect
                    x="6"
                    y="0"
                    width="6"
                    height="6"
                    transform="rotate(45 6 6)"
                    fill="var(--arcane-ice)"
                  />
                </svg>
                <ThreatMeter threatPct={state.threatPct} />
              </div>
            </div>

            {/* Horizontal divider */}
            <div
              className="relative z-[1] my-3 sm:my-4 h-px"
              style={{
                background:
                  "linear-gradient(90deg, transparent 0%, rgba(0,200,255,0.15) 20%, rgba(0,200,255,0.15) 80%, transparent 100%)",
              }}
            />

            {/* Bottom row: Combo | Status panel | Shield */}
            <div className="relative z-[1] flex items-center gap-4 sm:gap-6">
              {/* Combo */}
              <div className="shrink-0">
                <ComboCounter combo={state.combo} />
              </div>

              {/* Center status panel */}
              <div
                className="flex-1 h-12 rounded flex items-center justify-center"
                style={{
                  background: "rgba(255,255,255,0.02)",
                  border: "1px solid rgba(255,255,255,0.04)",
                  boxShadow: "inset 0 2px 6px rgba(0,0,0,0.4)",
                }}
              >
                <svg viewBox="0 0 40 40" width="24" height="24" opacity="0.15">
                  <path
                    d="M20 5L5 15v10l15 10 15-10V15L20 5z"
                    fill="var(--arcane-steel-2)"
                  />
                </svg>
              </div>

              {/* Arcane Shield */}
              <div className="w-44 sm:w-52">
                <ArcaneShield shieldPct={state.shieldPct} />
              </div>
            </div>
          </div>
        </div>

        {/* ===== SIDE RUNE STRIPS ===== */}
        {/* Left */}
        <div
          className="absolute left-0 top-12 bottom-12 w-5 flex flex-col items-center justify-center gap-2 pointer-events-none"
          style={{ opacity: 0.4 }}
        >
          {"\u16C9\u16D7\u16A8\u16A1\u16C1\u16D6".split("").map((c, i) => (
            <span
              key={i}
              className="text-[0.5rem] block"
              style={{
                color: "var(--arcane-ice)",
                textShadow: "0 0 4px var(--arcane-ice)",
                writingMode: "vertical-rl",
              }}
            >
              {c}
            </span>
          ))}
        </div>
        {/* Right */}
        <div
          className="absolute right-0 top-12 bottom-12 w-5 flex flex-col items-center justify-center gap-2 pointer-events-none"
          style={{ opacity: 0.4 }}
        >
          {"\u16C9\u16D7\u16C8\u16CF\u16B2\u16A8".split("").map((c, i) => (
            <span
              key={i}
              className="text-[0.5rem] block"
              style={{
                color: "var(--arcane-ice)",
                textShadow: "0 0 4px var(--arcane-ice)",
                writingMode: "vertical-rl",
              }}
            >
              {c}
            </span>
          ))}
        </div>
      </div>
    </div>
  )
}
