"use client"

interface TimeDialProps {
  minutes: number
  seconds: number
  periodSeconds?: number
  size?: "default" | "jumbotron"
}

// Pre-computed tick marks to avoid hydration mismatch from floating-point math
const TICK_MARKS = Array.from({ length: 12 }).map((_, i) => {
  const angle = (i * 30 * Math.PI) / 180
  return {
    x1: Math.round((50 + 36 * Math.cos(angle)) * 100) / 100,
    y1: Math.round((50 + 36 * Math.sin(angle)) * 100) / 100,
    x2: Math.round((50 + 40 * Math.cos(angle)) * 100) / 100,
    y2: Math.round((50 + 40 * Math.sin(angle)) * 100) / 100,
  }
})

export function TimeDial({ minutes, seconds, periodSeconds = 1200, size = "default" }: TimeDialProps) {
  const totalSeconds = minutes * 60 + seconds
  const progress = 1 - totalSeconds / periodSeconds
  const radius = 44
  const circumference = Math.round(2 * Math.PI * radius * 100) / 100
  const strokeDashoffset = Math.round(circumference * (1 - progress) * 100) / 100

  const timeStr = `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`

  const dim = size === "jumbotron" ? 180 : 100

  return (
    <div
      className="relative flex items-center justify-center"
      style={{ width: dim, height: dim }}
    >
      {/* Outer ring glow */}
      <div
        className="absolute inset-0 rounded-full"
        style={{
          boxShadow:
            "0 0 20px var(--arcane-ice), inset 0 0 12px rgba(0,200,255,0.15)",
          border: size === "jumbotron" ? "3px solid rgba(0,200,255,0.25)" : "2px solid rgba(0,200,255,0.2)",
        }}
      />

      <svg
        width={dim}
        height={dim}
        viewBox="0 0 100 100"
        className="absolute inset-0 -rotate-90"
      >
        {/* Background track */}
        <circle
          cx="50"
          cy="50"
          r={radius}
          fill="none"
          stroke="rgba(0,200,255,0.1)"
          strokeWidth="5"
        />
        {/* Progress arc */}
        <circle
          cx="50"
          cy="50"
          r={radius}
          fill="none"
          stroke="var(--arcane-ice)"
          strokeWidth="5"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={strokeDashoffset}
          style={{
            filter: "drop-shadow(0 0 6px var(--arcane-ice))",
            transition: "stroke-dashoffset 1s linear",
          }}
        />
        {/* Tick marks */}
        {TICK_MARKS.map((tick, i) => (
          <line
            key={i}
            x1={tick.x1}
            y1={tick.y1}
            x2={tick.x2}
            y2={tick.y2}
            stroke="rgba(0,200,255,0.3)"
            strokeWidth="1.5"
          />
        ))}
      </svg>

      {/* Center content */}
      <div className="relative z-10 flex flex-col items-center">
        <span
          className={`font-bold tracking-[0.2em] uppercase ${size === "jumbotron" ? "text-xs" : "text-[0.5rem]"}`}
          style={{
            color: "var(--arcane-ice)",
            textShadow: "0 0 8px var(--arcane-ice)",
          }}
        >
          TIME
        </span>
        <span
          className={`font-bold tracking-wider ${size === "jumbotron" ? "text-4xl" : "text-xl sm:text-2xl"}`}
          style={{
            color: "var(--arcane-ice)",
            textShadow:
              "0 0 12px var(--arcane-ice), 0 0 24px rgba(0,200,255,0.3)",
            fontVariantNumeric: "tabular-nums",
          }}
        >
          {timeStr}
        </span>
      </div>
    </div>
  )
}
