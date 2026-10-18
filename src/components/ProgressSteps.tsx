import { useId, useRef, type KeyboardEvent, type ReactNode } from 'react'
import { deskPanel } from './deskNav'
import { Kicker } from './kit'

export type DeskPhase = 'upload' | 'scan' | 'results'

const DESK_PANEL_ID = 'desk-tab-panel'

const STEPS: { id: DeskPhase; no: string; short: string; title: string; detail: string }[] = [
  {
    id: 'upload',
    no: '01',
    short: 'Upload',
    title: 'Upload documents',
    detail: 'Policy schedule, discharge summary, and the itemised hospital bill.',
  },
  {
    id: 'scan',
    no: '02',
    short: 'Scan',
    title: 'Run the scan',
    detail: 'The desk reads the file and prices each trap.',
  },
  {
    id: 'results',
    no: '03',
    short: 'Result',
    title: 'Get the result',
    detail: 'The score, and what you can still do before you file.',
  },
]

const PHASE_INDEX: Record<DeskPhase, number> = { upload: 0, scan: 1, results: 2 }

/** Centres the travelling marker on the live station; the rule fills through it. */
const TRACK: Record<DeskPhase, { fill: string; marker: string }> = {
  upload: { fill: '16.666%', marker: '16.666%' },
  scan: { fill: '50%', marker: '50%' },
  results: { fill: '100%', marker: '83.333%' },
}

function reveal(id: string) {
  const el = document.getElementById(id)
  if (!el) return
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  el.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' })
  el.classList.remove('desk-flash')
  void el.offsetWidth // restart the flash when the same panel is revealed again
  el.classList.add('desk-flash')
}

const TAB_ORDER: DeskPhase[] = ['upload', 'scan', 'results']

/**
 * Desk only. The landing keeps the static three-station promise.
 * The bar follows the live phase. Sample scan lives in the page header.
 */
function DeskProgress({
  phase,
  tab,
  onTab,
  status,
  uploadDisabled,
  onUpload,
  children,
}: {
  phase: DeskPhase
  tab: DeskPhase
  onTab: (tab: DeskPhase) => void
  status?: string
  uploadDisabled: boolean
  onUpload?: () => void
  children?: ReactNode
}) {
  const tabs = useRef<Partial<Record<DeskPhase, HTMLButtonElement | null>>>({})
  const baseId = useId()
  const live = PHASE_INDEX[phase]
  const track = TRACK[phase]

  const open = (id: DeskPhase, focus = false) => {
    onTab(id)
    if (focus) tabs.current[id]?.focus()
  }

  const onKeyDown = (e: KeyboardEvent) => {
    const i = TAB_ORDER.indexOf(tab)
    const next =
      e.key === 'ArrowRight' || e.key === 'ArrowDown'
        ? (i + 1) % TAB_ORDER.length
        : e.key === 'ArrowLeft' || e.key === 'ArrowUp'
          ? (i + TAB_ORDER.length - 1) % TAB_ORDER.length
          : e.key === 'Home'
            ? 0
            : e.key === 'End'
              ? TAB_ORDER.length - 1
              : -1
    if (next < 0) return
    e.preventDefault()
    open(TAB_ORDER[next], true)
  }

  const step = STEPS[PHASE_INDEX[tab]]
  const kicker = phase === 'scan' ? 'Scan running' : phase === 'upload' ? 'Start here' : 'Three steps'

  return (
    <section
      id={deskPanel('claim')}
      aria-label="Three steps to a claim result"
      className="border border-line"
      data-phase={phase}
      data-tab={tab}
      data-print-hidden
    >
      <div className="px-4 pt-5 sm:px-5 md:px-7">
        <Kicker ok={phase === 'results'}>{kicker}</Kicker>
      </div>

      <div role="tablist" aria-label="How a claim moves through the desk" onKeyDown={onKeyDown}>
        <div className="relative mt-5">
          <div className="h-1.5 overflow-hidden bg-line" aria-hidden>
            <div className="step-fill relative h-full overflow-hidden bg-chart" style={{ width: track.fill }}>
              {phase === 'scan' && <span className="desk-sheen absolute inset-y-0 left-0 w-1/3 bg-ink/30" />}
            </div>
          </div>
          <span
            className="step-marker pointer-events-none absolute top-1/2 z-10 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rotate-45 border border-ink bg-chart"
            style={{ left: track.marker }}
            aria-hidden
          />
        </div>
        <div className="mt-2 grid grid-cols-3">
          {STEPS.map((item, i) => {
            const isSelected = item.id === tab
            const state = i < live ? 'done' : i === live ? 'current' : 'next'
            const mark = state === 'done' ? 'Done' : state === 'current' ? (phase === 'results' ? 'Ready' : 'Now') : 'Next'
            return (
              <button
                key={item.id}
                ref={(node) => {
                  tabs.current[item.id] = node
                }}
                type="button"
                role="tab"
                id={`${baseId}-tab-${item.id}`}
                aria-controls={DESK_PANEL_ID}
                aria-selected={isSelected}
                aria-current={item.id === phase ? 'step' : undefined}
                tabIndex={isSelected ? 0 : -1}
                onClick={() => open(item.id)}
                className={`group relative min-w-0 px-2 py-3 text-left transition-colors duration-150 motion-reduce:transition-none sm:px-4 sm:py-4 ${
                  isSelected ? 'bg-paper-2' : 'hover:bg-paper-2/70 active:bg-paper-3'
                } ${i > 0 ? 'border-l border-line' : ''}`}
              >
                <span className="font-display text-3xl leading-none text-ink sm:text-4xl md:text-5xl">
                  <span className="relative inline-block">
                    {(isSelected || state === 'current') && (
                      <span className="absolute -inset-x-1 bottom-[0.12em] top-[58%] bg-chart transition-opacity" aria-hidden />
                    )}
                    <span className="relative">{item.no}</span>
                  </span>
                </span>
                <span className="mt-2 flex items-center gap-1.5 font-mono text-[10px] font-semibold uppercase tracking-[0.08em] sm:text-[11px] sm:tracking-[0.14em]">
                  {state === 'current' && phase === 'scan' && <span className="pulse-dot" aria-hidden />}
                  <span className="sm:hidden">{item.short}</span>
                  <span className="hidden sm:inline">{item.title}</span>
                </span>
                <span className="mt-1 block font-mono text-[10px] uppercase tracking-[0.12em] text-ink-3">{mark}</span>
                <span
                  className={`mt-3 block h-0.5 origin-left bg-chart transition-transform duration-200 motion-reduce:transition-none ${
                    isSelected ? 'scale-x-100' : 'scale-x-0 group-hover:scale-x-100'
                  }`}
                  aria-hidden
                />
              </button>
            )
          })}
        </div>
      </div>

      {status && (
        <p aria-live="polite" className="border-t border-line px-4 py-3.5 text-sm leading-relaxed text-ink-3 sm:px-5 md:px-7">
          {status}
        </p>
      )}

      <div role="tabpanel" id={DESK_PANEL_ID} aria-labelledby={`${baseId}-tab-${tab}`} key={tab} className="rise border-t border-line">
        <div className="bg-paper-2 px-4 py-5 sm:px-5 md:px-7">
          <h3 className="font-display text-2xl font-semibold leading-tight md:text-3xl">{step.title}</h3>
          <p className="mt-2 max-w-xl text-sm leading-relaxed text-ink-3">{panelCopy(tab, phase)}</p>
          <div className="mt-4 flex flex-wrap gap-3">
            {tab === 'upload' && (
              <button type="button" onClick={() => onUpload?.()} disabled={uploadDisabled} className={primaryBtn}>
                Choose files
              </button>
            )}
            {tab === 'scan' && phase !== 'scan' && (
              <button type="button" onClick={() => onUpload?.()} disabled={uploadDisabled} className={primaryBtn}>
                {phase === 'results' ? 'Scan another file' : 'Choose files to scan'}
              </button>
            )}
            {tab === 'scan' && phase === 'scan' && (
              <div className="relative h-1.5 w-full max-w-xs overflow-hidden bg-line" aria-hidden>
                <span className="desk-sheen absolute inset-y-0 left-0 w-1/3 bg-chart" />
              </div>
            )}
            {tab === 'results' && phase === 'results' && (
              <>
                <button type="button" onClick={() => reveal('verdict')} className={primaryBtn}>
                  See the score
                </button>
                <button type="button" onClick={() => reveal('claim-moves')} className={secondaryBtn}>
                  See the suggestions
                </button>
              </>
            )}
          </div>
        </div>
        {children}
      </div>
    </section>
  )
}

function panelCopy(tab: DeskPhase, phase: DeskPhase): string {
  if (tab === 'upload') return 'Policy schedule, discharge summary, and the itemised hospital bill.'
  if (tab === 'scan') {
    return phase === 'scan'
      ? 'Reading the documents. Result opens when the read finishes.'
      : phase === 'results'
        ? 'This file is already scanned. Choose another set of papers to run it again.'
        : 'The scan starts once the files are in. Result opens when it finishes.'
  }
  return phase === 'results'
    ? STEPS[2].detail
    : 'The score and the suggestions show up here when the scan finishes.'
}

const primaryBtn =
  'inline-flex min-h-11 items-center rounded-full bg-chart px-5 py-2 font-mono text-[11px] font-semibold uppercase tracking-[0.12em] text-ink shadow-[0_1px_0_var(--ink)] transition-transform duration-150 hover:-translate-y-0.5 disabled:translate-y-0 disabled:opacity-40'
const secondaryBtn =
  'inline-flex min-h-11 items-center rounded-full border border-ink/40 bg-paper px-5 py-2 font-mono text-[11px] uppercase tracking-[0.12em] transition-colors duration-150 hover:bg-paper-3'

type ProgressStepsProps =
  | { mode: 'promise'; headingId?: string }
  | {
      mode: 'progress'
      phase?: DeskPhase
      tab?: DeskPhase
      onTab?: (tab: DeskPhase) => void
      status?: string
      uploadDisabled?: boolean
      onUpload?: () => void
      children?: ReactNode
    }

/**
 * The whole product, in three stations.
 * `promise` is the landing: every step is the offer, none is pending.
 * `progress` is the desk: a bar you can open and act on.
 */
export function ProgressSteps(props: ProgressStepsProps) {
  if (props.mode === 'progress') {
    const phase = props.phase ?? 'results'
    return (
      <DeskProgress
        phase={phase}
        tab={props.tab ?? phase}
        onTab={props.onTab ?? (() => {})}
        status={props.status}
        uploadDisabled={props.uploadDisabled ?? false}
        onUpload={props.onUpload}
      >
        {props.children}
      </DeskProgress>
    )
  }

  const { headingId } = props
  return (
    <section aria-labelledby={headingId} aria-label={headingId ? undefined : 'Three steps to a claim result'}>
      <div>
        <Kicker ok>Three steps</Kicker>
      </div>

      <div className="mt-5 max-w-2xl">
        <h2 id={headingId} className="font-display text-4xl font-semibold leading-tight md:text-5xl">
          Upload, scan, result.
        </h2>
        <p className="mt-3 max-w-xl text-base leading-relaxed text-ink-3 md:text-lg">
          Upload the papers. Run the scan. Read the score and what to fix.
        </p>
      </div>

      <div className="relative mt-10">
        <div className="absolute bottom-3 left-[4px] top-3 w-px bg-line md:hidden" aria-hidden />
        <ol aria-label="How a claim moves through the desk" className="grid gap-6 md:grid-cols-3 md:gap-0">
          {STEPS.map((step) => (
            <li key={step.id} className="relative flex gap-4 md:block md:border-t-2 md:border-chart md:pt-6 md:pr-8">
              <span className="relative z-10 mt-3 h-2.5 w-2.5 shrink-0 rounded-full border border-ink bg-ink md:hidden" aria-hidden />
              <div>
                <div className="font-display text-5xl leading-none text-ink">
                  <span className="relative inline-block">
                    <span className="absolute -inset-x-1 bottom-[0.12em] top-[58%] bg-chart" aria-hidden />
                    <span className="relative">{step.no}</span>
                  </span>
                </div>
                <h3 className="mt-3 font-mono text-[11px] font-semibold uppercase tracking-[0.14em] text-ink">{step.title}</h3>
                <p className="mt-2 max-w-xs text-sm leading-relaxed text-ink-3">{step.detail}</p>
              </div>
            </li>
          ))}
        </ol>
      </div>
    </section>
  )
}
