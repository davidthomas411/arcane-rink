"use client"

export function RuneText({
  text,
  className = "",
}: {
  text: string
  className?: string
}) {
  return (
    <span
      className={`inline-block tracking-[0.35em] text-[0.55rem] sm:text-[0.65rem] opacity-70 ${className}`}
      style={{
        fontFamily: "serif",
        color: "var(--arcane-ice)",
        textShadow: "0 0 6px var(--arcane-ice)",
      }}
      aria-hidden="true"
    >
      {text}
    </span>
  )
}
