"use client"

interface ThreatMeterProps {
  threatPct: number
  size?: "default" | "jumbotron"
}

export function ThreatMeter({ threatPct, size = "default" }: ThreatMeterProps) {
  const segments = 5
  const filledSegments = Math.round((threatPct / 100) * segments)
  const isHigh = threatPct > 70
  const isJumbo = size === "jumbotron"

  return (
    <div className="flex flex-col items-center gap-1.5">
      <span
        className={`font-bold tracking-[0.15em] uppercase text-center leading-tight ${isJumbo ? "text-sm" : "text-[0.5rem] sm:text-[0.55rem]"}`}
        style={{
          color: "var(--arcane-gold)",
          textShadow: "0 0 4px rgba(200,170,80,0.4)",
        }}
      >
        THREAT
        <br />
        LEVEL
      </span>

      {/* Skull icon */}
      <div className={`relative flex items-center justify-center ${isJumbo ? "w-12 h-12" : "w-7 h-7"}`}>
        <svg viewBox="0 0 24 24" width={isJumbo ? 40 : 22} height={isJumbo ? 40 : 22} fill="none">
          <path
            d="M12 2C8 2 5 5.5 5 9c0 2 .8 3.7 2 5v3a1 1 0 001 1h1v1a1 1 0 001 1h4a1 1 0 001-1v-1h1a1 1 0 001-1v-3c1.2-1.3 2-3 2-5 0-3.5-3-7-7-7z"
            fill="var(--arcane-crimson)"
            opacity={isHigh ? 1 : 0.6}
            style={{
              filter: isHigh
                ? "drop-shadow(0 0 6px var(--arcane-crimson))"
                : "none",
            }}
          />
          <circle cx="9.5" cy="9" r="1.5" fill="var(--arcane-ink)" />
          <circle cx="14.5" cy="9" r="1.5" fill="var(--arcane-ink)" />
          <rect
            x="10"
            y="13"
            width="1"
            height="2"
            rx="0.5"
            fill="var(--arcane-ink)"
          />
          <rect
            x="13"
            y="13"
            width="1"
            height="2"
            rx="0.5"
            fill="var(--arcane-ink)"
          />
        </svg>
      </div>

      {/* Segments */}
      <div className="flex flex-col-reverse gap-[3px]">
        {Array.from({ length: segments }).map((_, i) => {
          const isFilled = i < filledSegments
          const colors = [
            "#2a6e1e",
            "#6e8e1e",
            "#c9a820",
            "#d46a1a",
            "#c42020",
          ]
          return (
            <div
              key={i}
              className="rounded-sm"
              style={{
                width: 24,
                height: 10,
                background: isFilled
                  ? colors[i]
                  : "rgba(255,255,255,0.06)",
                boxShadow: isFilled
                  ? `0 0 8px ${colors[i]}80, inset 0 1px 0 rgba(255,255,255,0.15)`
                  : "inset 0 1px 0 rgba(255,255,255,0.04)",
                transition: "background 0.3s, box-shadow 0.3s",
                animation:
                  isFilled && isHigh
                    ? "threatPulse 1.5s ease-in-out infinite"
                    : "none",
              }}
            />
          )
        })}
      </div>
    </div>
  )
}
