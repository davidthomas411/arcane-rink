"use client"

interface ArcaneShieldProps {
  shieldPct: number
}

export function ArcaneShield({ shieldPct }: ArcaneShieldProps) {
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center justify-between">
        <span
          className="text-[0.5rem] sm:text-[0.55rem] font-bold tracking-[0.12em] uppercase"
          style={{ color: "var(--arcane-steel-2)" }}
        >
          STATUS
        </span>
        <span
          className="text-[0.5rem] sm:text-[0.55rem] font-bold tracking-[0.12em] uppercase"
          style={{
            color: "var(--arcane-gold)",
            textShadow: "0 0 4px rgba(200,170,80,0.3)",
          }}
        >
          ARCANE SHIELD
        </span>
      </div>
      <div
        className="relative overflow-hidden rounded-sm"
        style={{
          height: 8,
          background: "rgba(0,200,255,0.08)",
          boxShadow: "inset 0 1px 3px rgba(0,0,0,0.5)",
        }}
      >
        <div
          className="absolute inset-y-0 left-0 rounded-sm"
          style={{
            width: `${Math.max(0, Math.min(100, shieldPct))}%`,
            background: "linear-gradient(90deg, var(--arcane-ice), #00d4ff)",
            boxShadow:
              "0 0 10px var(--arcane-ice), 0 0 20px rgba(0,200,255,0.3)",
            transition: "width 0.5s ease",
          }}
        />
      </div>
    </div>
  )
}
