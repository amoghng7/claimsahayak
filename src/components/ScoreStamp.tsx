import type { Band } from '../engine/rules'

const BAND_META: Record<Band, { label: string; tone: string; ring: string }> = {
  strong: { label: 'Claim-ready', tone: 'var(--ink)', ring: 'color-mix(in srgb, var(--mint) 70%, var(--ink))' },
  fair: { label: 'File with fixes', tone: 'var(--ink)', ring: 'var(--brick)' },
  weak: { label: 'Do not file yet', tone: 'var(--crimson)', ring: 'var(--crimson)' },
}

/**
 * The verdict stamp: a rotating circular-text ring around a big serif
 * score numeral — like the stamp a claims assessor slams on a dossier.
 */
export function ScoreStamp({ score, band, size = 188 }: { score: number; band: Band; size?: number }) {
  const meta = BAND_META[band]
  const r = 44
  const text = 'CLAIM READINESS · CLAIMSAHAYAK VERDICT · '
  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      <svg viewBox="0 0 120 120" className="stamp-ring absolute inset-0 h-full w-full" aria-hidden>
        <defs>
          <path id="stamp-circle" d={`M 60,60 m -${r},0 a ${r},${r} 0 1,1 ${2 * r},0 a ${r},${r} 0 1,1 -${2 * r},0`} />
        </defs>
        <circle cx="60" cy="60" r="57" fill="none" stroke={meta.ring} strokeWidth="1" strokeDasharray="3 3" />
        <circle cx="60" cy="60" r="32" fill="none" stroke="var(--line)" strokeWidth="1" />
        <text fill="var(--ink-3)" fontSize="8.2" letterSpacing="1.6" fontFamily="IBM Plex Mono, monospace">
          <textPath href="#stamp-circle">{text}</textPath>
        </text>
      </svg>
      <div className="relative text-center">
        <div className="font-display font-black leading-none" style={{ fontSize: size * 0.34, color: meta.tone }}>
          {score}
        </div>
        <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink-3 mt-1">/ 100</div>
      </div>
    </div>
  )
}
