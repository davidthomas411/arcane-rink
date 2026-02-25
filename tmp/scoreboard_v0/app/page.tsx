"use client"

import { useState, useEffect, useCallback } from "react"
import { ArcaneScoreboard, type ScoreboardState } from "@/components/scoreboard/arcane-scoreboard"

export default function Page() {
  const [state, setState] = useState<ScoreboardState>({
    minutes: 8,
    seconds: 32,
    home: 3,
    guest: 2,
    combo: 4,
    shieldPct: 72,
    threatPct: 80,
  })

  console.log("[v0] Scoreboard state:", state)

  // Live clock countdown
  useEffect(() => {
    console.log("[v0] Clock effect mounted")
    const interval = setInterval(() => {
      setState((prev) => {
        let m = prev.minutes
        let s = prev.seconds - 1
        if (s < 0) {
          s = 59
          m = m - 1
        }
        if (m < 0) {
          m = 20
          s = 0
        }
        return { ...prev, minutes: m, seconds: s }
      })
    }, 1000)
    return () => clearInterval(interval)
  }, [])

  // Random game events
  useEffect(() => {
    console.log("[v0] Events effect mounted")
    const eventInterval = setInterval(() => {
      setState((prev) => {
        const roll = Math.random()
        if (roll < 0.08) {
          return { ...prev, home: prev.home + 1, combo: Math.min(prev.combo + 1, 8) }
        } else if (roll < 0.14) {
          return { ...prev, guest: prev.guest + 1, threatPct: Math.min(prev.threatPct + 15, 100) }
        } else if (roll < 0.3) {
          return {
            ...prev,
            shieldPct: Math.max(0, Math.min(100, prev.shieldPct + (Math.random() > 0.5 ? 8 : -12))),
            threatPct: Math.max(0, Math.min(100, prev.threatPct + (Math.random() > 0.6 ? 10 : -8))),
          }
        }
        return prev
      })
    }, 3000)
    return () => clearInterval(eventInterval)
  }, [])

  const handleHomeGoal = useCallback(() => {
    console.log("[v0] Home goal clicked")
    setState((prev) => ({
      ...prev,
      home: prev.home + 1,
      combo: Math.min(prev.combo + 1, 8),
      shieldPct: Math.min(100, prev.shieldPct + 10),
    }))
  }, [])

  const handleGuestGoal = useCallback(() => {
    console.log("[v0] Guest goal clicked")
    setState((prev) => ({
      ...prev,
      guest: prev.guest + 1,
      threatPct: Math.min(100, prev.threatPct + 15),
      shieldPct: Math.max(0, prev.shieldPct - 15),
    }))
  }, [])

  const handleReset = useCallback(() => {
    console.log("[v0] Reset clicked")
    setState({
      minutes: 20,
      seconds: 0,
      home: 0,
      guest: 0,
      combo: 0,
      shieldPct: 100,
      threatPct: 0,
    })
  }, [])

  return (
    <div
      className="relative min-h-screen flex flex-col items-center justify-center overflow-hidden"
      style={{
        background:
          "radial-gradient(ellipse at 50% 30%, #1a1a2e 0%, #0f0f1a 40%, #080812 100%)",
      }}
    >
      {/* Atmospheric background elements */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          backgroundImage: `
            radial-gradient(ellipse at 50% 20%, rgba(0,200,255,0.03) 0%, transparent 60%),
            radial-gradient(ellipse at 30% 70%, rgba(0,100,200,0.02) 0%, transparent 50%),
            radial-gradient(ellipse at 70% 60%, rgba(0,150,200,0.02) 0%, transparent 50%)
          `,
        }}
      />

      {/* Dark castle silhouette hint */}
      <div
        className="absolute top-0 left-1/2 -translate-x-1/2 w-[600px] h-[400px] pointer-events-none opacity-[0.04]"
        style={{
          background: "linear-gradient(180deg, #1a2a3a 0%, transparent 80%)",
          clipPath:
            "polygon(20% 100%, 20% 40%, 25% 35%, 25% 20%, 30% 15%, 30% 40%, 40% 40%, 40% 10%, 45% 5%, 50% 0%, 55% 5%, 60% 10%, 60% 40%, 70% 40%, 70% 15%, 75% 20%, 75% 35%, 80% 40%, 80% 100%)",
        }}
      />

      {/* Scoreboard */}
      <div className="relative z-10 w-full max-w-[860px] px-4">
        <ArcaneScoreboard state={state} />
      </div>

      {/* Controls */}
      <div className="relative z-10 mt-10 flex items-center gap-3">
        <button
          type="button"
          onClick={handleHomeGoal}
          className="px-5 py-2.5 rounded text-xs font-bold uppercase tracking-wider cursor-pointer transition-all hover:scale-105 active:scale-95"
          style={{
            background: "linear-gradient(180deg, #2a2a2a, #1a1a1a)",
            color: "var(--arcane-ice)",
            border: "1px solid rgba(0,200,255,0.3)",
            boxShadow:
              "0 0 12px rgba(0,200,255,0.15), inset 0 1px 0 rgba(255,255,255,0.06)",
            textShadow: "0 0 8px var(--arcane-ice)",
          }}
        >
          Home Goal
        </button>
        <button
          type="button"
          onClick={handleGuestGoal}
          className="px-5 py-2.5 rounded text-xs font-bold uppercase tracking-wider cursor-pointer transition-all hover:scale-105 active:scale-95"
          style={{
            background: "linear-gradient(180deg, #2a2a2a, #1a1a1a)",
            color: "var(--arcane-crimson)",
            border: "1px solid rgba(200,50,50,0.3)",
            boxShadow:
              "0 0 12px rgba(200,50,50,0.15), inset 0 1px 0 rgba(255,255,255,0.06)",
            textShadow: "0 0 8px var(--arcane-crimson)",
          }}
        >
          Guest Goal
        </button>
        <button
          type="button"
          onClick={handleReset}
          className="px-5 py-2.5 rounded text-xs font-bold uppercase tracking-wider cursor-pointer transition-all hover:scale-105 active:scale-95"
          style={{
            background: "linear-gradient(180deg, #2a2a2a, #1a1a1a)",
            color: "var(--arcane-steel-2)",
            border: "1px solid rgba(255,255,255,0.1)",
            boxShadow: "inset 0 1px 0 rgba(255,255,255,0.06)",
          }}
        >
          Reset
        </button>
      </div>

      <p
        className="relative z-10 mt-4 text-[0.6rem] tracking-[0.3em] uppercase"
        style={{ color: "var(--arcane-steel-2)", opacity: 0.5 }}
      >
        Live demo - scores update randomly
      </p>
    </div>
  )
}
