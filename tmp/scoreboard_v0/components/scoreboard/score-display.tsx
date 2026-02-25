"use client"

import { useEffect, useRef, useState } from "react"

interface ScoreDisplayProps {
  home: number
  guest: number
  size?: "default" | "jumbotron"
}

export function ScoreDisplay({ home, guest, size = "default" }: ScoreDisplayProps) {
  const isJumbo = size === "jumbotron"
  const [homeBump, setHomeBump] = useState(false)
  const [guestBump, setGuestBump] = useState(false)
  const prevHome = useRef(home)
  const prevGuest = useRef(guest)

  useEffect(() => {
    if (home !== prevHome.current) {
      prevHome.current = home
      setHomeBump(true)
      const t = setTimeout(() => setHomeBump(false), 300)
      return () => clearTimeout(t)
    }
  }, [home])

  useEffect(() => {
    if (guest !== prevGuest.current) {
      prevGuest.current = guest
      setGuestBump(true)
      const t = setTimeout(() => setGuestBump(false), 300)
      return () => clearTimeout(t)
    }
  }, [guest])

  const goldGradient = {
    backgroundImage:
      "linear-gradient(180deg, #e8c34a 0%, #c9a820 40%, #9a7b15 100%)",
    WebkitBackgroundClip: "text" as const,
    WebkitTextFillColor: "transparent",
    backgroundClip: "text",
    fontVariantNumeric: "tabular-nums" as const,
  }

  return (
    <div className="flex flex-col items-center">
      {/* Labels */}
      <div className={`flex items-center justify-center w-full ${isJumbo ? "gap-32" : "gap-16 sm:gap-24"}`}>
        <span
          className={`font-bold tracking-[0.2em] uppercase ${isJumbo ? "text-xl" : "text-xs sm:text-sm"}`}
          style={{ color: "var(--arcane-gold)", textShadow: "0 0 6px rgba(200,170,80,0.3)" }}
        >
          HOME
        </span>
        <span
          className={`font-bold tracking-[0.2em] uppercase ${isJumbo ? "text-xl" : "text-xs sm:text-sm"}`}
          style={{ color: "var(--arcane-gold)", textShadow: "0 0 6px rgba(200,170,80,0.3)" }}
        >
          GUEST
        </span>
      </div>

      {/* Scores row */}
      <div className={`flex items-center justify-center ${isJumbo ? "gap-5" : "gap-2 sm:gap-3"}`}>
        <span
          className={`font-black leading-none ${isJumbo ? "text-[10rem]" : "text-5xl sm:text-7xl"}`}
          style={{
            ...goldGradient,
            filter: "drop-shadow(0 2px 4px rgba(0,0,0,0.6)) drop-shadow(0 0 10px rgba(200,170,80,0.2))",
            transform: homeBump ? "scale(1.12)" : "scale(1)",
            transition: "transform 0.2s cubic-bezier(0.34, 1.56, 0.64, 1)",
          }}
        >
          {home}
        </span>

        <span
          className={`font-bold pb-1 ${isJumbo ? "text-6xl" : "text-2xl sm:text-4xl"}`}
          style={{ ...goldGradient }}
        >
          -
        </span>

        <span
          className={`font-bold tracking-[0.15em] uppercase pb-1 ${isJumbo ? "text-5xl" : "text-xl sm:text-3xl"}`}
          style={{
            color: "var(--arcane-gold)",
            textShadow: "0 0 6px rgba(200,170,80,0.3)",
            opacity: 0.6,
          }}
        >
          GUEST
        </span>

        <span
          className={`font-black leading-none ${isJumbo ? "text-[10rem]" : "text-5xl sm:text-7xl"}`}
          style={{
            ...goldGradient,
            filter: "drop-shadow(0 2px 4px rgba(0,0,0,0.6)) drop-shadow(0 0 10px rgba(200,170,80,0.2))",
            transform: guestBump ? "scale(1.12)" : "scale(1)",
            transition: "transform 0.2s cubic-bezier(0.34, 1.56, 0.64, 1)",
          }}
        >
          {guest}
        </span>
      </div>
    </div>
  )
}
