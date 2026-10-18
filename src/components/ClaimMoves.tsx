import type { ClaimMove } from '../engine/moves'
import { PanelTitle } from './kit'

/** The step-3 payoff: what to do with the scan, capped so the desk stays obvious. */
export function ClaimMoves({ moves }: { moves: ClaimMove[] }) {
  const shown = moves.slice(0, 4)
  const rest = moves.length - shown.length
  const raises = moves.filter((m) => m.impact === 'raise' && m.id !== 'ready').length
  const ready = moves.length === 1 && moves[0].id === 'ready'
  const status = ready
    ? 'Ready to file'
    : raises > 0
      ? `${raises} ${raises === 1 ? 'way' : 'ways'} to raise the chance`
      : 'Fixed by the policy'

  return (
    <div id="claim-moves" className="scroll-mt-24">
      <PanelTitle
        right={<span className="font-mono text-[10px] text-ink-3">{status}</span>}
      >
        Suggestions
      </PanelTitle>
      <ol className="space-y-2">
        {shown.map((m, i) => (
          <li
            key={m.id}
            className={`flag${m.impact === 'know' ? ' warn' : ' good'} bg-paper-2/60 px-4 py-3`}
          >
            <div className="flex items-baseline justify-between gap-3">
              <div className="text-sm font-medium">
                <span className="mr-1.5 font-mono text-[11px] text-ink-3">{i + 1}.</span>
                {m.title}
              </div>
              <span className="shrink-0 font-mono text-[10px] uppercase tracking-wider text-ink-3">
                {m.impact === 'raise' ? 'Raises the chance' : 'Fixed by the policy'}
              </span>
            </div>
            <p className="mt-1 text-[13px] leading-relaxed text-ink-3">{m.detail}</p>
          </li>
        ))}
      </ol>
      {rest > 0 && (
        <p className="mt-2 font-mono text-[10.5px] text-ink-3">
          {rest} more {rest === 1 ? 'is' : 'are'} in the checklist and the waterfall below.
        </p>
      )}
    </div>
  )
}
