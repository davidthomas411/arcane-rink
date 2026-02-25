"use client"

import { useEffect, useRef, useState } from "react"

interface ComboCounterProps {
  combo: number
  maxPips?: number
}

export function ComboCounter({ combo, maxPips = 4 }: ComboCounterProps) {
  const [flash, setFlash] = useState(false)
  const prevCombo = useRef(combo)
  const filledPips = Math.min(combo, maxPips)

  useEffect(() => {
    if (combo !== prevCombo.current && combo > 0) {
      prevCombo.current = combo
      setFlash(true)
      const t = setTimeout(() => setFlash(false), 400)
      return () => clearTimeout(t)
    }
    prevCombo.current = combo
  }, [combo])

  return (
    <div className="flex items-center gap-2.5">
      <span
        className="text-[0.6rem] font-bold tracking-[0.15em] uppercase"
        style={{ color: "var(--arcane-gold)", textShadow: "0 0 4px rgba(200,170,80,0.3)" }}
      >
        COMBO
      </span>
      <div className="flex items-center gap-1">
        {Array.from({ length: maxPips }).map((_, i) => (
          <div
            key={i}
            className="rounded-[2px]"
            style={{
              width: 14,
              height: 10,
              background:
                i < filledPips ? "var(--arcane-gold)" : "rgba(200,170,80,0.15)",
              boxShadow:
                i < filledPips
                  ? "0 0 6px rgba(200,170,80,0.5), inset 0 1px 0 rgba(255,255,255,0.2)"
                  : "inset 0 1px 0 rgba(255,255,255,0.04)",
              transition: "background 0.2s, box-shadow 0.2s",
            }}
          />
        ))}
      </div>
      <span
        className="text-lg font-black"
        style={{
          color: "var(--arcane-gold)",
          textShadow: flash
            ? "0 0 16px var(--arcane-gold), 0 0 32px rgba(200,170,80,0.5)"
            : "0 0 6px rgba(200,170,80,0.3)",
          transition: "text-shadow 0.3s",
          fontVariantNumeric: "tabular-nums",
        }}
      >
        X{combo}
      </span>
    </div>
  )
}
