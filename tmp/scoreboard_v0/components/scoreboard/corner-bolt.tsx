"use client"

export function CornerBolt({ className = "" }: { className?: string }) {
  return (
    <div
      className={`absolute z-20 ${className}`}
      style={{ width: 32, height: 32 }}
    >
      {/* Outer ring */}
      <div
        className="absolute inset-0 rounded-full"
        style={{
          background:
            "radial-gradient(circle at 40% 35%, #4a4a4a 0%, #2a2a2a 50%, #1a1a1a 100%)",
          boxShadow:
            "0 0 8px rgba(0,200,255,0.3), inset 0 1px 0 rgba(255,255,255,0.15), inset 0 -1px 0 rgba(0,0,0,0.5)",
        }}
      />
      {/* Inner skull */}
      <div className="absolute inset-0 flex items-center justify-center">
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none">
          <path
            d="M12 3C8.5 3 6 6 6 9c0 1.8.7 3.3 1.8 4.5V16a.8.8 0 00.8.8h.8v.8a.8.8 0 00.8.8h3.6a.8.8 0 00.8-.8v-.8h.8a.8.8 0 00.8-.8v-2.5C17.3 12.3 18 10.8 18 9c0-3-2.5-6-6-6z"
            fill="var(--arcane-ice)"
            opacity="0.7"
            style={{ filter: "drop-shadow(0 0 3px var(--arcane-ice))" }}
          />
          <circle cx="10" cy="9" r="1.2" fill="var(--arcane-ink)" />
          <circle cx="14" cy="9" r="1.2" fill="var(--arcane-ink)" />
        </svg>
      </div>
    </div>
  )
}
