import type { ReactNode } from 'react'

/** Uppercase mono kicker with live pulse dot — the desk's label language. */
export function Kicker({ children, ok = false }: { children: ReactNode; ok?: boolean }) {
  return (
    <span className="kicker">
      <span className={`pulse-dot${ok ? ' ok' : ''}`} aria-hidden />
      {children}
    </span>
  )
}

/** Numbered editorial section heading — big serif numeral as graphic. */
export function NumberedSection({
  no,
  title,
  id,
  children,
}: {
  no: string
  title: string
  id?: string
  children: ReactNode
}) {
  return (
    <section aria-labelledby={id} className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-3 md:gap-x-10">
      <div className="font-display text-5xl md:text-7xl leading-none text-ink/25 select-none" aria-hidden>
        {no}
      </div>
      <div>
        <h2 id={id} className="font-display text-2xl md:text-4xl leading-tight mb-3">{title}</h2>
        <div className="text-ink-3 leading-relaxed max-w-2xl">{children}</div>
      </div>
    </section>
  )
}

/** Panel heading row used across the workbench. */
export function PanelTitle({ children, right }: { children: ReactNode; right?: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-line pb-2 mb-3">
      <h3 className="font-mono text-[11px] uppercase tracking-[0.14em] text-ink-3">{children}</h3>
      {right}
    </div>
  )
}
