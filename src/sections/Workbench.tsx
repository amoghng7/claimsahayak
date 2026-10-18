import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { BillLine, CaseFile } from '../engine/types'
import {
  STANDARD_DOCS,
  analyzeRejection,
  buildVerdict,
  type DeductionFlag,
  type RejectionVerdict,
  type Verdict,
} from '../engine/rules'
import { analyzeRejectionWithFallback, parseRejectionDate } from '../engine/rejection'
import { buildEscalationLadder, buildGrievanceLetter, type EscalationStep } from '../engine/grievance'
import { hindiRejectionSummary, hindiSummary } from '../engine/hindi'
import { formatINR, formatDate } from '../engine/format'
import { fileToDocTextSmart, ocrFile } from '../engine/ocr'
import { pdfToText } from '../engine/pdf'
import { caseStore, type StoredCaseMeta } from '../engine/store'
import { extractCaseWithGemini, loadGeminiKey, storedPersonalKey } from '../engine/gemini'
import { CASE_LABELS, SAMPLE_CASES } from '../data/samples'
import { claimMoves, type ClaimMove } from '../engine/moves'
import { ClaimMoves } from '../components/ClaimMoves'
import { deskPanel, type DeskPane } from '../components/deskNav'
import { PanelTitle } from '../components/kit'
import { PreviousScans } from '../components/PreviousScans'
import { ProgressSteps, type DeskPhase } from '../components/ProgressSteps'
import { ScoreStamp } from '../components/ScoreStamp'

const BAND_CHIP: Record<string, string> = {
  strong: 'bg-mint text-ink',
  fair: 'bg-brick text-ink',
  weak: 'bg-crimson-deep text-paper',
}
const BAND_LABEL: Record<string, string> = {
  strong: 'Claim-ready',
  fair: 'File with fixes',
  weak: 'Do not file yet',
}

/* ---------- saved cases (consent-gated, 6.4) ---------- */

function SavedCases({ current, onPick }: { current: CaseFile; onPick: (c: CaseFile) => void }) {
  // Consent is read on every render — a cheap localStorage read that keeps the
  // panel in sync with the Settings toggle without an event bus.
  const consent = caseStore.loadConsent()
  const [cases, setCases] = useState<StoredCaseMeta[] | null>(null)
  const [note, setNote] = useState<string | null>(null)

  const refresh = useCallback(() => {
    caseStore.listCases().then(setCases, (e: Error) => setNote(e.message))
  }, [])
  useEffect(() => {
    if (!consent) return
    let cancelled = false
    caseStore.listCases().then(
      (c) => { if (!cancelled) setCases(c) },
      (e: Error) => { if (!cancelled) setNote(e.message) },
    )
    return () => { cancelled = true }
  }, [consent])

  if (!consent) return null

  const save = async () => {
    setNote(null)
    try {
      await caseStore.saveCase(current.id, current.claimant, JSON.stringify(current))
      setNote('Saved to your case history.')
      refresh()
    } catch (e) {
      setNote(e instanceof Error ? e.message : 'Save failed.')
    }
  }
  const load = async (id: string) => {
    setNote(null)
    try {
      const stored = await caseStore.loadCase(id)
      onPick(JSON.parse(stored.payload) as CaseFile)
    } catch (e) {
      setNote(e instanceof Error ? e.message : 'Load failed.')
    }
  }
  const remove = async (id: string) => {
    setNote(null)
    try {
      await caseStore.deleteCase(id)
      refresh()
    } catch (e) {
      setNote(e instanceof Error ? e.message : 'Delete failed.')
    }
  }

  return (
    <div>
      <PanelTitle
        right={
          <button onClick={save} className="min-h-11 font-mono text-[10px] uppercase tracking-[0.12em] text-ink-3 hover:text-ink">
            Save this case
          </button>
        }
      >
        Saved cases
      </PanelTitle>
      {cases && cases.length === 0 && (
        <p className="text-xs leading-relaxed text-ink-3">Nothing saved yet. Saved cases and their documents are stored for 30 days.</p>
      )}
      <ul className="space-y-1">
        {(cases ?? []).map((c) => (
          <li key={c.id} className="flex items-center justify-between gap-2 border border-line px-3 py-2">
            <button onClick={() => load(c.id)} className="min-h-11 min-w-0 flex-1 text-left">
              <span className="block truncate text-sm font-medium">{c.name}</span>
              <span className="block font-mono text-[10px] text-ink-3">{c.savedAt.slice(0, 10)}</span>
            </button>
            <button
              onClick={() => remove(c.id)}
              aria-label={`Delete saved case ${c.name}`}
              className="flex min-h-11 min-w-11 items-center justify-center font-mono text-[11px] text-crimson-deep hover:bg-paper-2"
            >
              ✕
            </button>
          </li>
        ))}
      </ul>
      {note && <p className="mt-2 text-xs leading-relaxed text-ink-3">{note}</p>}
    </div>
  )
}

/* ---------- left rail ---------- */

function extractionKeyNote(): string {
  return storedPersonalKey()
    ? 'Using your Gemini key. Live extraction is on.'
    : 'Using the site key. Add your own in Settings if you want.'
}

function CaseRail({
  current,
  onPick,
  onAskUpload,
  busy,
  busyNote,
  uploadNote,
  showSamples = true,
}: {
  current: CaseFile
  onPick: (c: CaseFile) => void
  onAskUpload: () => void
  busy: boolean
  busyNote: string | null
  uploadNote: string | null
  showSamples?: boolean
}) {
  return (
    <div className="space-y-6">
      {showSamples && (
        <nav aria-label="Sample case files">
          <PanelTitle>Case files</PanelTitle>
          <div className="flex gap-2 overflow-x-auto pb-1 lg:flex-col lg:gap-0 lg:space-y-1 lg:overflow-visible lg:pb-0">
            {SAMPLE_CASES.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => onPick(c)}
                className={`w-full min-w-[210px] lg:min-w-0 text-left px-3 py-2.5 border transition-colors duration-150 ${
                  current.id === c.id ? 'border-ink bg-paper-2' : 'border-line hover:bg-paper-2/60'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="font-medium text-sm">{c.claimant}</span>
                  {c.rejectionLetter && <span className="font-mono text-[10px] text-crimson-deep">REJECTED</span>}
                </div>
                <div className="font-mono text-[11px] text-ink-3 mt-0.5">
                  {CASE_LABELS[c.id]} · {formatINR(c.episode.totalBill)}
                </div>
              </button>
            ))}
          </div>
        </nav>
      )}

      <div id="your-documents" className="scroll-mt-24">
        <PanelTitle right={busy ? <span className="font-mono text-[10px] text-ink-3">{busyNote ?? 'reading…'}</span> : undefined}>
          Your documents
        </PanelTitle>
        <button
          type="button"
          onClick={onAskUpload}
          disabled={busy}
          className="w-full border border-dashed border-ink/40 px-4 py-6 text-center transition-colors duration-150 hover:bg-paper-2/60 disabled:opacity-50"
        >
          <div className="font-mono text-[11px] uppercase tracking-[0.14em] text-ink-3">
            Drop policy + bill PDFs
          </div>
          <div className="mt-1 text-xs text-ink-3">PDF, text, or a photo. Text stays in the browser. Scans go through OCR.</div>
        </button>
        {uploadNote && <p className="mt-2 text-xs leading-relaxed text-ink-3">{uploadNote}</p>}
        <p className="mt-2 font-mono text-[10px] leading-relaxed text-ink-3">{extractionKeyNote()}</p>
      </div>

      <SavedCases current={current} onPick={onPick} />

      <div>
        <PanelTitle>Policy terms</PanelTitle>
        <dl className="font-mono text-[12px] leading-relaxed">
          {[
            ['Insurer', current.policy.insurer],
            ['Product', current.policy.product],
            ['Sum insured', formatINR(current.policy.sumInsured)],
            [
              'Room rent cap',
              current.policy.roomRent.type === 'percent_si'
                ? `${current.policy.roomRent.value}% of SI / day`
                : current.policy.roomRent.type === 'daily_cap'
                  ? `${formatINR(current.policy.roomRent.value ?? 0)} / day`
                  : 'No cap stated',
            ],
            ['Co-pay', current.policy.copayPct > 0 ? `${current.policy.copayPct}%` : 'None'],
            ['PED wait', `${current.policy.pedWaitMonths ?? 36} mo`],
            ['Since', formatDate(current.policy.inceptionDate)],
          ].map(([k, v]) => (
            <div key={k} className="flex justify-between gap-3 border-b border-dashed border-line-faint py-1.5">
              <dt className="shrink-0 text-ink-3">{k}</dt>
              <dd className="min-w-0 text-right break-words">{v}</dd>
            </div>
          ))}
        </dl>
      </div>
    </div>
  )
}

/* ---------- center: verdict ---------- */

function FlagRow({ flag, delay }: { flag: DeductionFlag; delay: number }) {
  return (
    <div className={`flag${flag.severity === 'medium' ? ' warn' : ''} rise bg-paper-2/60 pl-4 pr-3 py-3`} style={{ animationDelay: `${delay}ms` }}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
        <div className="min-w-0">
          <div className="font-medium text-sm">{flag.title}</div>
          <p className="mt-1 text-[13px] leading-relaxed text-ink-3">{flag.detail}</p>
          <p className="mt-2 font-mono text-[10.5px] leading-relaxed text-ink-3/80">{flag.clause}</p>
        </div>
        <div className="shrink-0 sm:text-right">
          <div className="font-mono text-sm font-semibold text-crimson-deep">−{formatINR(flag.amountAtRisk)}</div>
          <div className="font-mono text-[10px] uppercase tracking-wider text-ink-3">at risk</div>
        </div>
      </div>
    </div>
  )
}

function Waterfall({ v }: { v: Verdict }) {
  const p = v.payable
  const crimsonAa = 'color-mix(in srgb, var(--crimson) 80%, var(--ink))'
  const rows: [string, number, string, boolean][] = [
    ['Total billed', p.total, 'var(--ink)', false],
    ['Room-rent excess', -p.roomCut, crimsonAa, true],
    ['Proportional cut on linked charges', -p.proportionalCut, crimsonAa, true],
  ]
  if (p.exclusionCut > 0) rows.push(['Permanent-exclusion cut', -p.exclusionCut, crimsonAa, true])
  if (p.pedCut > 0) rows.push(['PED waiting-period exclusion', -p.pedCut, crimsonAa, true])
  for (const cut of p.subLimitCuts) rows.push([cut.label, -cut.amount, crimsonAa, true])
  rows.push(
    ['Non-payable consumables', -p.nonPayableCut, 'var(--brick)', true],
    ['Co-payment', -p.copayCut, 'var(--brick)', true],
    ['Expected settlement', p.expected, 'color-mix(in srgb, var(--mint) 55%, var(--paper))', false],
  )
  return (
    <div role="region" aria-label="Settlement waterfall">
      <div className="ledger font-mono text-[12.5px]">
        {rows.map(([label, amount, color, signed], i) => {
          const last = i === rows.length - 1
          return (
            <div key={label} className="rise" style={{ animationDelay: `${i * 70}ms` }}>
              {i > 0 && <div className="waterfall-join ml-2 h-3" aria-hidden />}
              <div className="flex flex-col gap-1 border border-line py-2.5 pr-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4" style={{ background: last ? color : 'transparent' }}>
                <span
                  className={`pl-3 pr-2 ${last ? 'font-semibold' : 'text-ink-3'}`}
                  style={{ background: last ? color : 'transparent' }}
                >
                  {label}
                </span>
                <span className="flex items-center gap-3 whitespace-nowrap pl-3 sm:pl-0">
                  <span className="inline-block h-2 w-12 sm:w-16" aria-hidden>
                    <span
                      className="block h-full"
                      style={{ width: `${Math.max(2, (Math.abs(amount) / p.total) * 100)}%`, background: color }}
                    />
                  </span>
                  <span className="font-semibold tabular-nums">
                    {signed && amount !== 0 ? `−${formatINR(Math.abs(amount))}` : formatINR(amount)}
                  </span>
                </span>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function VerdictPanel({ c, v, moves }: { c: CaseFile; v: Verdict; moves: ClaimMove[] }) {
  return (
    <div className="space-y-10">
      <div id="verdict" className="flex scroll-mt-24 flex-col items-start gap-6 border-b border-line pb-8 sm:flex-row sm:flex-wrap sm:items-center sm:gap-8">
        <div aria-live="polite" className="h-[120px] w-[120px] shrink-0 overflow-hidden lg:h-[188px] lg:w-[188px]">
          <div className="origin-top-left scale-[0.64] lg:scale-100">
            <ScoreStamp score={v.score} band={v.band} />
          </div>
        </div>
        <div className="min-w-0 flex-1">
          <span aria-live="polite" className={`inline-block rounded-full px-3 py-1 font-mono text-[11px] font-semibold uppercase tracking-[0.12em] ${BAND_CHIP[v.band]}`}>
            {BAND_LABEL[v.band]}
          </span>
          <h2 className="mt-3 font-display text-3xl font-semibold leading-tight">{c.claimant}</h2>
          <p className="mt-1 break-words font-mono text-[12px] text-ink-3">
            {c.episode.hospital}, {c.episode.city} · {formatDate(c.episode.admissionDate)} → {formatDate(c.episode.dischargeDate)} · {c.episode.diagnosis}
          </p>
          <ul className="mt-4 space-y-1.5">
            {v.reasons.map((r, i) => (
              <li key={i} className="flex items-start gap-2.5 text-[13.5px]">
                <span
                  className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full"
                  style={{ background: r.ok ? 'color-mix(in srgb, var(--mint) 70%, var(--ink))' : 'var(--crimson)' }}
                />
                <span className={r.ok ? 'min-w-0 text-ink-3' : 'min-w-0'}>{r.label}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>

      <ClaimMoves moves={moves} />

      <div>
        <PanelTitle right={<span className="font-mono text-[10px] text-crimson-deep">{v.flags.length} flags</span>}>
          Deduction traps &amp; risks
        </PanelTitle>
        {v.flags.length === 0 ? (
          <p className="text-sm text-ink-3 border border-dashed border-line px-4 py-5">
            No deduction traps in this file.
          </p>
        ) : (
          <div className="space-y-2">
            {v.flags.map((f, i) => (
              <FlagRow key={f.kind + i} flag={f} delay={i * 90} />
            ))}
          </div>
        )}
      </div>

      <div>
        <PanelTitle>Expected settlement</PanelTitle>
        <Waterfall v={v} />
        <p className="mt-2 font-mono text-[10.5px] text-ink-3">
          Estimate from these papers. The insurer&apos;s figure is final.
        </p>
      </div>

      {c.policy.exclusions.length > 0 && (
        <div>
          <PanelTitle right={<span className="font-mono text-[10px] text-ink-3">{c.policy.exclusions.length} listed</span>}>
            Permanent exclusions in this policy
          </PanelTitle>
          <div className="border border-line">
            {c.policy.exclusions.map((e, i) => {
              const hit = v.exclusions.hits.includes(e.label)
              return (
                <div
                  key={i}
                  className="flex items-center justify-between gap-4 px-4 py-2.5 border-b border-line-faint last:border-0"
                >
                  <span className="text-[13px]">{e.label}</span>
                  {hit && (
                    <span className="font-mono text-[10px] uppercase tracking-wider text-crimson-deep">
                      matches this treatment
                    </span>
                  )}
                </div>
              )
            })}
          </div>
          <p className="mt-2 font-mono text-[10.5px] text-ink-3">
            Permanent exclusions are never payable, however long the policy has run.
          </p>
        </div>
      )}

      <div>
        <PanelTitle right={<span className="font-mono text-[10px] text-ink-3">{v.missing.length} gaps</span>}>
          Document checklist
        </PanelTitle>
        {v.missing.length === 0 ? (
          <p className="text-sm text-ink-3 border border-dashed border-line px-4 py-5">
            Nothing missing.
          </p>
        ) : (
          <div className="space-y-px border border-line">
            {v.missing.map((m) => (
              <div key={m.id} className="flex items-start gap-3 bg-paper px-4 py-3 border-b border-line-faint last:border-0">
                <span className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${m.mandatory ? 'bg-crimson' : 'bg-brick'}`} />
                <div>
                  <div className="text-sm font-medium">
                    {m.label}
                    {m.mandatory && <span className="ml-2 font-mono text-[10px] uppercase tracking-wider text-crimson-deep">mandatory</span>}
                  </div>
                  <p className="mt-0.5 text-[12.5px] text-ink-3">{m.why}</p>
                </div>
              </div>
            ))}
          </div>
        )}
        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 font-mono text-[10.5px] text-ink-3">
          {STANDARD_DOCS.filter((d) => c.providedDocIds.includes(d.id)).map((d) => (
            <span key={d.id} className="inline-flex items-center gap-1.5">
              <span className="h-1.5 w-1.5 rounded-full" style={{ background: 'color-mix(in srgb, var(--mint) 70%, var(--ink))' }} />
              {d.label}
            </span>
          ))}
        </div>
      </div>
    </div>
  )
}

/* ---------- right rail: rejection desk, letter, Hindi ---------- */

function EscalationLadder({ steps }: { steps: EscalationStep[] }) {
  return (
    <div>
      <PanelTitle>Escalation dates</PanelTitle>
      <ol className="space-y-2">
        {steps.map((s, i) => (
          <li key={s.title} className="rise border border-line bg-paper-2/60 px-3 py-2.5" style={{ animationDelay: `${i * 80}ms` }}>
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-[13px] font-medium">
                <span className="mr-1.5 font-mono text-[11px] text-ink-3">{i + 1}.</span>
                {s.title}
              </span>
              <span className="shrink-0 font-mono text-[10px] uppercase tracking-wider text-ink-3">{s.dateLabel}</span>
            </div>
            <p className="mt-1 text-[12px] leading-relaxed text-ink-3">{s.detail}</p>
          </li>
        ))}
      </ol>
    </div>
  )
}

function RejectionDesk({
  letter,
  setLetter,
  rejectionDate,
  setRejectionDate,
  analysis,
  aiBusy,
  onAnalyze,
  hindiLines,
  ladder,
}: {
  letter: string
  setLetter: (s: string) => void
  rejectionDate: string
  setRejectionDate: (s: string) => void
  analysis: RejectionVerdict | null
  aiBusy: boolean
  onAnalyze: () => void
  hindiLines: string[] | null
  ladder: EscalationStep[] | null
}) {
  return (
    <div className="space-y-6">
      <div>
        <PanelTitle>Rejection desk</PanelTitle>
        <textarea
          value={letter}
          aria-label="Rejection letter text"
          onChange={(e) => setLetter(e.target.value)}
          placeholder="Paste the insurer's repudiation letter here…"
          rows={5}
          className="w-full resize-y border border-line bg-paper px-3 py-2 font-mono text-[12px] leading-relaxed placeholder:text-ink-3/60 focus:outline-none focus:ring-2 focus:ring-brick"
        />
        <div className="mt-2 flex items-center gap-2.5">
          <label className="shrink-0 font-mono text-[10px] uppercase tracking-[0.14em] text-ink-3" htmlFor="rejection-date">
            Rejection date
          </label>
          <input
            id="rejection-date"
            type="date"
            value={rejectionDate}
            onChange={(e) => setRejectionDate(e.target.value)}
            className="flex-1 min-h-11 border border-line bg-paper px-2.5 py-2 font-mono text-[12px] focus:outline-none focus:ring-2 focus:ring-brick"
          />
        </div>
        <button
          onClick={onAnalyze}
          disabled={!letter.trim() || aiBusy}
          className="mt-2 min-h-11 w-full rounded-full bg-ink py-2.5 font-mono text-[11px] font-semibold uppercase tracking-[0.12em] text-paper transition-transform duration-150 hover:-translate-y-0.5 disabled:opacity-40 disabled:hover:translate-y-0"
        >
          {aiBusy ? 'Reading with AI…' : 'Classify the rejection'}
        </button>

        {analysis && (
          <div className="rise mt-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="font-medium text-sm">{analysis.reason}</span>
              <span
                className="rounded-full px-2.5 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-wider"
                style={{
                  background:
                    analysis.reversible === 'yes' ? 'var(--mint)' : analysis.reversible === 'partial' ? 'var(--brick)' : 'color-mix(in srgb, var(--crimson) 80%, var(--ink))',
                  color: analysis.reversible === 'hard' ? 'var(--paper)' : 'var(--ink)',
                }}
              >
                {analysis.reversible === 'yes' ? 'Reversible' : analysis.reversible === 'partial' ? 'Partly winnable' : 'Hard'}
              </span>
            </div>
            {analysis.aiAssisted && (
              <p className="font-mono text-[10px] uppercase tracking-wider text-ink-3/80">
                Check this against the letter
              </p>
            )}
            <p className="text-[13px] leading-relaxed text-ink-3">{analysis.explanation}</p>
            {analysis.advisory && (
              <p className="border-l-2 border-brick pl-3 text-[12.5px] italic leading-relaxed text-ink-3">
                From the letter: {analysis.advisory}
              </p>
            )}
            <ol className="list-decimal space-y-1.5 pl-5 text-[13px] leading-relaxed">
              {analysis.steps.map((s, i) => (
                <li key={i}>{s}</li>
              ))}
            </ol>
            <div className="border-t border-line pt-2">
              {analysis.clauses.map((cl, i) => (
                <p key={i} className="font-mono text-[10.5px] leading-relaxed text-ink-3/80">
                  § {cl}
                </p>
              ))}
            </div>
          </div>
        )}
      </div>

      {ladder && <EscalationLadder steps={ladder} />}
      {hindiLines && <HindiPanel lines={hindiLines} title="अस्वीकृति का हिंदी सारांश" />}
    </div>
  )
}

function GrievancePanel({ text }: { text: string | null }) {
  const [copied, setCopied] = useState(false)
  if (!text) return null
  return (
    <div>
      <PanelTitle
        right={
          <span className="flex gap-4">
            <button
              onClick={() => {
                navigator.clipboard.writeText(text).then(() => {
                  setCopied(true)
                  setTimeout(() => setCopied(false), 1600)
                })
              }}
              className="min-h-11 inline-flex items-center font-mono text-[10px] uppercase tracking-wider text-ink underline underline-offset-4 hover:text-crimson"
            >
              {copied ? 'copied ✓' : 'copy letter'}
            </button>
            <button
              onClick={() => window.print()}
              className="min-h-11 inline-flex items-center font-mono text-[10px] uppercase tracking-wider text-ink underline underline-offset-4 hover:text-crimson"
            >
              Print / Save as PDF
            </button>
          </span>
        }
      >
        Grievance letter
      </PanelTitle>
      <pre tabIndex={0} aria-label="Drafted grievance letter" className="max-h-96 overflow-auto whitespace-pre-wrap border border-line bg-paper-2/70 p-4 font-mono text-[11.5px] leading-relaxed">
        {text}
      </pre>
    </div>
  )
}

/** Print-only rendering of the grievance letter — a clean A4 document. */
function PrintLetter({ text }: { text: string }) {
  // The signature block is kept together so it never orphans onto a page.
  const sigStart = text.indexOf('Yours faithfully,')
  const footStart = text.indexOf('\nSources:')
  const body = sigStart >= 0 ? text.slice(0, sigStart) : text
  const signature = sigStart >= 0 ? text.slice(sigStart, footStart >= 0 ? footStart : undefined) : ''
  const foot = footStart >= 0 ? text.slice(footStart) : ''
  return (
    <div className="print-letter hidden print:block" aria-hidden>
      <div className="whitespace-pre-wrap">{body}</div>
      {signature && <div className="signature-block whitespace-pre-wrap">{signature}</div>}
      {foot && <div className="letter-foot whitespace-pre-wrap">{foot}</div>}
    </div>
  )
}

function HindiPanel({ lines, title = 'हिंदी सारांश' }: { lines: string[]; title?: string }) {
  return (
    <div>
      <PanelTitle>{title}</PanelTitle>
      <div className="space-y-2.5 border border-line bg-paper-2/70 p-4">
        {lines.map((l, i) => (
          <p key={i} className="text-[13.5px] leading-relaxed">
            {l}
          </p>
        ))}
      </div>
    </div>
  )
}

/* ---------- bill-line editor ---------- */

/** A bill line plus the UI-only "user touched this row" marker. */
type EditableLine = BillLine & { edited?: boolean }

function toEditable(lines: BillLine[]): EditableLine[] {
  return lines.map((l) => ({ ...l }))
}

function stripEdited(lines: EditableLine[]): BillLine[] {
  return lines.map((l) => ({
    head: l.head,
    amount: l.amount,
    roomLinked: l.roomLinked,
    isRoomRent: l.isRoomRent,
    nonPayable: l.nonPayable,
  }))
}

/** The sample tab and an uploaded file are different cases. Switching tabs restores the other. */
type DeskSnapshot = {
  baseline: CaseFile
  lines: EditableLine[]
  letter: string
  analysis: RejectionVerdict | null
  rejectionDate: string
}

function snapFromCase(c: CaseFile): DeskSnapshot {
  return {
    baseline: c,
    lines: toEditable(c.episode.billLines),
    letter: c.rejectionLetter ?? '',
    analysis: c.rejectionLetter ? analyzeRejection(c, c.rejectionLetter) : null,
    rejectionDate:
      (c.rejectionLetter ? parseRejectionDate(c.rejectionLetter) : null) ?? new Date().toISOString().slice(0, 10),
  }
}

/** Input guard: amounts are always finite, non-negative numbers. */
function clampAmount(raw: string): number {
  const n = Number(raw)
  return Number.isFinite(n) ? Math.max(0, n) : 0
}

function Toggle({ on, label, onClick }: { on: boolean; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={on}
      className={`min-h-11 inline-flex items-center border px-3 font-mono text-[9.5px] uppercase tracking-wider transition-colors duration-150 ${
        on ? 'border-ink bg-paper-2 text-ink' : 'border-line text-ink-3 hover:bg-paper-2/60'
      }`}
    >
      {label}
    </button>
  )
}

function BillLedger({
  lines,
  onChange,
  onReset,
  dirty,
}: {
  lines: EditableLine[]
  onChange: (lines: EditableLine[]) => void
  onReset: () => void
  dirty: boolean
}) {
  const total = lines.reduce((s, l) => s + l.amount, 0)
  const update = (i: number, patch: Partial<EditableLine>) =>
    onChange(lines.map((l, j) => (j === i ? { ...l, ...patch, edited: true } : l)))

  return (
    <div>
      <PanelTitle
        right={
          dirty ? (
            <button
              type="button"
              onClick={onReset}
              className="min-h-11 inline-flex items-center font-mono text-[10px] uppercase tracking-wider text-ink underline underline-offset-4 hover:text-crimson"
            >
              Reset to extracted values
            </button>
          ) : (
            <span className="font-mono text-[10px] text-ink-3">{lines.length} lines</span>
          )
        }
      >
        Bill lines
      </PanelTitle>
      <div className="border border-line" role="region" aria-label="Bill lines editor">
        {lines.map((l, i) => (
          <div
            key={i}
            className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2 border-b border-line-faint px-3 py-2 last:border-0 md:flex md:min-w-0 md:flex-wrap md:gap-2 md:pr-3"
          >
            <input
              value={l.head}
              aria-label="Line item"
              onChange={(e) => update(i, { head: e.target.value })}
              className="col-span-2 w-full min-w-0 bg-paper text-[13px] focus:outline-none focus:ring-1 focus:ring-brick md:w-44 md:flex-1 md:bg-transparent lg:min-w-40"
            />
            {l.edited && (
              <span className="col-span-2 font-mono text-[9px] uppercase tracking-wider text-brick md:col-span-1">edited</span>
            )}
            <div className="col-span-2 flex flex-wrap gap-2 md:contents">
              <Toggle on={l.roomLinked} label="room-linked" onClick={() => update(i, { roomLinked: !l.roomLinked })} />
              <Toggle on={!!l.nonPayable} label="non-payable" onClick={() => update(i, { nonPayable: !l.nonPayable })} />
            </div>
            <input
              type="number"
              min={0}
              value={l.amount}
              aria-label="Amount"
              onChange={(e) => update(i, { amount: clampAmount(e.target.value) })}
              className="w-full min-w-0 bg-transparent text-right font-mono text-[12.5px] tabular-nums focus:outline-none focus:ring-1 focus:ring-brick md:w-28"
            />
            <button
              type="button"
              aria-label="Delete line"
              onClick={() => onChange(lines.filter((_, j) => j !== i))}
              className="min-h-11 min-w-11 inline-flex items-center justify-center font-mono text-[13px] text-ink-3 transition-colors duration-150 hover:text-crimson"
            >
              ×
            </button>
          </div>
        ))}
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line bg-paper-2/60 px-3 py-2.5">
          <button
            type="button"
            onClick={() => onChange([...lines, { head: 'New charge', amount: 0, roomLinked: false, edited: true }])}
            className="min-h-11 inline-flex items-center font-mono text-[10px] uppercase tracking-wider text-ink underline underline-offset-4 hover:text-crimson"
          >
            + Add line
          </button>
          <span className="font-mono text-[12.5px] font-semibold tabular-nums">Total {formatINR(total)}</span>
        </div>
      </div>
      <p className="mt-2 font-mono text-[10.5px] text-ink-3">
        Edits update the score. The total is the sum of these rows.
      </p>
    </div>
  )
}

/* ---------- the desk ---------- */

export function Workbench({
  initialCaseId,
  pane,
  onPane,
  paneActionsRef,
}: {
  initialCaseId?: string
  pane: DeskPane
  onPane: (pane: DeskPane) => void
  paneActionsRef: { current: (next: DeskPane) => void }
}) {
  const [baseline, setBaseline] = useState<CaseFile>(
    () => SAMPLE_CASES.find((c) => c.id === initialCaseId) ?? SAMPLE_CASES[0],
  )
  const [lines, setLines] = useState<EditableLine[]>(() => toEditable(baseline.episode.billLines))
  const [letter, setLetter] = useState(baseline.rejectionLetter ?? '')
  const [analysis, setAnalysis] = useState<RejectionVerdict | null>(
    baseline.rejectionLetter ? analyzeRejection(baseline, baseline.rejectionLetter) : null,
  )
  const [rejectionDate, setRejectionDate] = useState<string>(
    () =>
      (baseline.rejectionLetter ? parseRejectionDate(baseline.rejectionLetter) : null) ??
      new Date().toISOString().slice(0, 10),
  )
  const [aiBusy, setAiBusy] = useState(false)
  const [busy, setBusy] = useState(false)
  const [uploadNote, setUploadNote] = useState<string | null>(null)
  const [busyNote, setBusyNote] = useState<string | null>(null)
  // The bar starts at Upload. A sample is an example, not a finished scan.
  const [phase, setPhase] = useState<DeskPhase>('upload')
  const [tab, setTab] = useState<DeskPhase>('upload')
  const [ownFile, setOwnFile] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const stashedUser = useRef<DeskSnapshot | null>(null)
  const stashedSample = useRef<DeskSnapshot | null>(null)

  // The editor owns bill lines; everything downstream (verdict, Hindi summary,
  // grievance, export) derives from this single recomputed CaseFile.
  const caseFile = useMemo<CaseFile>(
    () => ({
      ...baseline,
      episode: {
        ...baseline.episode,
        billLines: stripEdited(lines),
        totalBill: lines.reduce((s, l) => s + l.amount, 0),
      },
    }),
    [baseline, lines],
  )
  const linesDirty =
    lines.some((l) => l.edited) || lines.length !== baseline.episode.billLines.length

  const verdict = useMemo(() => buildVerdict(caseFile), [caseFile])
  const hindi = useMemo(() => hindiSummary(caseFile, verdict), [caseFile, verdict])
  const hindiRejection = useMemo(
    () => (analysis ? hindiRejectionSummary(caseFile, analysis) : null),
    [analysis, caseFile],
  )
  const ladder = useMemo(
    () => (analysis ? buildEscalationLadder(rejectionDate) : null),
    [analysis, rejectionDate],
  )
  const grievance = useMemo(
    () => (analysis ? buildGrievanceLetter(caseFile, analysis, rejectionDate) : null),
    [analysis, caseFile, rejectionDate],
  )
  const moves = useMemo(
    () => claimMoves(caseFile, verdict, analysis),
    [caseFile, verdict, analysis],
  )
  const stepStatus = useMemo(() => {
    if (busy) return busyNote ?? 'Reading your documents.'
    if (tab === 'scan') {
      return phase === 'results'
        ? 'This file is already scanned. Choose another set of papers to run it again.'
        : 'The scan starts once the files are in. Result opens when it finishes.'
    }
    if (tab === 'upload') return 'Choose the policy and the bill. The bar moves to Scan, then Result.'
    if (!ownFile) return 'The score shows up here when the scan finishes.'
    const raises = moves.filter((m) => m.impact === 'raise' && m.id !== 'ready')
    if (moves[0]?.id === 'ready') return 'Scan complete. This file is ready to submit.'
    if (raises.length > 0) {
      return `Scan complete. ${raises.length} suggestion${raises.length === 1 ? '' : 's'} below would raise the chance this claim is paid.`
    }
    return 'Scan complete. The result below shows what the policy will deduct.'
  }, [busy, busyNote, tab, phase, ownFile, moves])

  const capture = (): DeskSnapshot => ({ baseline, lines, letter, analysis, rejectionDate })

  const applySnap = (s: DeskSnapshot) => {
    setBaseline(s.baseline)
    setLines(s.lines)
    setLetter(s.letter)
    setAnalysis(s.analysis)
    setRejectionDate(s.rejectionDate)
  }

  const sampleSeed = () =>
    stashedSample.current ?? snapFromCase(SAMPLE_CASES.find((c) => c.id === initialCaseId) ?? SAMPLE_CASES[0])

  const onTab = (next: DeskPhase) => {
    if (busy || next === tab) return
    setTab(next)
  }

  // The header calls this. Switching to the example must not move the three-step bar.
  // Assigned after render so the click handler always closes over the latest desk.
  useEffect(() => {
    paneActionsRef.current = (next) => {
      if (busy || next === pane) return
      // Leave the example first, so Previous scans never overwrites the uploaded file.
      if (pane === 'sample' && next !== 'sample' && ownFile && stashedUser.current) {
        stashedSample.current = capture()
        applySnap(stashedUser.current)
      }
      if (next === 'sample' && ownFile && pane !== 'sample') {
        stashedUser.current = capture()
        applySnap(sampleSeed())
      }
      onPane(next)
    }
  })

  const pick = (c: CaseFile, source?: 'sample' | 'upload' | 'stored') => {
    const fromSample = source === 'sample' || (source === undefined && SAMPLE_CASES.some((s) => s.id === c.id))
    if (fromSample) {
      const snap = snapFromCase(c)
      stashedSample.current = snap
      if (ownFile && pane !== 'sample') stashedUser.current = capture()
      applySnap(snap)
      onPane('sample')
      return
    }
    if (!ownFile || pane === 'sample') stashedSample.current = capture()
    const snap = snapFromCase(c)
    stashedUser.current = snap
    applySnap(snap)
    setOwnFile(true)
    setPhase('results')
    setTab('results')
    onPane('claim')
  }

  const onAnalyze = async () => {
    const text = letter.trim()
    if (!text) return
    const instant = analyzeRejection(caseFile, text)
    setAnalysis(instant)
    const parsed = parseRejectionDate(text)
    if (parsed) setRejectionDate(parsed)
    // The regex classifier is primary; Gemini is consulted only on a miss.
    if (instant.patternId === 'unknown') {
      setAiBusy(true)
      try {
        setAnalysis(await analyzeRejectionWithFallback(caseFile, text, loadGeminiKey()))
      } finally {
        setAiBusy(false)
      }
    }
  }

  const onFiles = async (files: FileList) => {
    // Copy before the input is cleared. FileList is live and empties with the control.
    const chosen = Array.from(files)
    const key = loadGeminiKey()
    const startedOnSample = pane === 'sample'
    setBusy(true)
    setPhase('scan')
    setTab('scan')
    onPane('claim')
    setUploadNote(null)
    const finishFailed = () => {
      if (ownFile) {
        if (startedOnSample && stashedUser.current) {
          stashedSample.current = capture()
          applySnap(stashedUser.current)
        }
        setPhase('results')
        setTab('results')
        return
      }
      setPhase('upload')
      setTab('upload')
    }
    try {
      const docs = []
      for (const f of chosen) {
        const d = await fileToDocTextSmart(f, {
          extractPdfText: pdfToText,
          ocr: async (file) => {
            setBusyNote('image-based document, verifying quality…')
            return ocrFile(file)
          },
        })
        docs.push(d)
        setBusyNote(null)
        if (caseStore.loadConsent()) {
          // Best-effort archive of the raw document (30-day lifecycle bucket);
          // analysis must never block on the store.
          caseStore.uploadDocument(f).catch(() => {})
        }
      }
      const empty = docs.filter((d) => d.text.trim().length < 40)
      if (empty.length === docs.length) {
        setUploadNote('Could not read those files, even with OCR. Try a sharper photo or a text export.')
        finishFailed()
        return
      }
      const extracted = await extractCaseWithGemini(key, docs)
      pick(extracted, 'upload')
      if (caseStore.loadConsent()) {
        // Upsert sessions/{sessionId}/cases/{caseId}. The sidecar stamps savedAt and expireAt.
        caseStore.saveCase(extracted.id, extracted.claimant, JSON.stringify(extracted)).catch(() => {})
      }
      const ocrCount = docs.filter((d) => d.ocr).length
      setUploadNote(
        `Read ${docs.length} document${docs.length > 1 ? 's' : ''}${ocrCount ? ` (${ocrCount} via OCR)` : ''}. Score rebuilt from your file.`,
      )
    } catch (err) {
      setUploadNote(err instanceof Error ? err.message : 'Extraction failed. The sample files still work.')
      finishFailed()
    } finally {
      setBusy(false)
      setBusyNote(null)
    }
  }

  const exportJson = () => {
    const blob = new Blob([JSON.stringify({ caseFile, verdict }, null, 2)], { type: 'application/json' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `claimsahayak-${caseFile.id}.json`
    a.click()
    URL.revokeObjectURL(a.href)
  }

  const chooseFiles = () => {
    inputRef.current?.click()
  }

  const desk = (showSamples: boolean) => (
    <div className="grid gap-8 border-t border-line px-4 py-5 sm:px-5 sm:py-6 md:px-7 lg:grid-cols-[280px_minmax(0,1fr)_360px]">
      <aside aria-label="Case files and policy terms" className="min-w-0">
        <CaseRail
          current={caseFile}
          onPick={pick}
          onAskUpload={chooseFiles}
          busy={busy}
          busyNote={busyNote}
          uploadNote={uploadNote}
          showSamples={showSamples}
        />
      </aside>

      <main className={`min-w-0 space-y-10 transition-opacity motion-reduce:transition-none ${busy ? 'opacity-60' : ''}`} aria-busy={busy}>
        <VerdictPanel c={caseFile} v={verdict} moves={moves} />
        <BillLedger lines={lines} onChange={setLines} onReset={() => setLines(toEditable(baseline.episode.billLines))} dirty={linesDirty} />
      </main>

      <aside aria-label="Rejection desk, letter and summaries" className="min-w-0 space-y-8">
        <RejectionDesk
          letter={letter}
          setLetter={setLetter}
          rejectionDate={rejectionDate}
          setRejectionDate={setRejectionDate}
          analysis={analysis}
          aiBusy={aiBusy}
          onAnalyze={onAnalyze}
          hindiLines={hindiRejection}
          ladder={ladder}
        />
        <GrievancePanel text={grievance} />
        <HindiPanel lines={hindi} />
        <div>
          <PanelTitle>Export</PanelTitle>
          <button
            type="button"
            onClick={exportJson}
            className="min-h-11 w-full rounded-full border border-ink/40 py-2.5 font-mono text-[11px] uppercase tracking-[0.12em] transition-colors duration-150 hover:bg-paper-2"
          >
            Download case JSON
          </button>
          <p className="mt-3 font-mono text-[10px] leading-relaxed text-ink-3">
            Not insurance or legal advice. Check every figure against your papers.
          </p>
        </div>
      </aside>
    </div>
  )

  return (
    <div className="mx-auto max-w-shell px-4 py-6 sm:px-6 sm:py-8" data-pane={pane}>
      <input
        ref={inputRef}
        type="file"
        multiple
        accept=".pdf,.txt,.md,image/*"
        className="hidden"
        aria-label="Upload policy and bill"
        onChange={(e) => {
          if (e.target.files?.length) onFiles(e.target.files)
          e.target.value = ''
        }}
      />
      {pane === 'previous' ? (
        <PreviousScans onOpen={(c) => pick(c, 'stored')} />
      ) : pane === 'sample' ? (
        <section id={deskPanel('sample')} aria-label="Sample scan" data-print-hidden className="border border-line">
          <div className="bg-paper-2 px-4 py-5 sm:px-5 md:px-7">
            <h2 className="font-display text-2xl font-semibold leading-tight md:text-3xl">Sample scan</h2>
            <p className="mt-2 max-w-xl text-sm leading-relaxed text-ink-3">
              Three examples: a room-rent trap, a clean file, and a rejection. Your own upload still starts at step one.
            </p>
            <button
              type="button"
              onClick={() => paneActionsRef.current('claim')}
              className="mt-4 inline-flex min-h-11 items-center rounded-full bg-chart px-5 py-2 font-mono text-[11px] font-semibold uppercase tracking-[0.12em] text-ink shadow-[0_1px_0_var(--ink)] transition-transform duration-150 hover:-translate-y-0.5"
            >
              Upload your own
            </button>
          </div>
          {desk(true)}
        </section>
      ) : (
        <ProgressSteps
          mode="progress"
          phase={phase}
          tab={tab}
          onTab={onTab}
          status={stepStatus}
          uploadDisabled={busy}
          onUpload={chooseFiles}
        >
          {tab === 'upload' && (
            <div id="your-documents" className="scroll-mt-24 border-t border-line px-4 py-6 sm:px-5 md:px-7">
              <button
                type="button"
                onClick={chooseFiles}
                disabled={busy}
                className="w-full border border-dashed border-ink/40 px-4 py-10 text-center transition-colors duration-150 hover:bg-paper-2/60 disabled:opacity-50 sm:px-6 sm:py-14"
              >
                <div className="font-display text-2xl font-semibold sm:text-3xl">Drop the policy and the bill</div>
                <div className="mt-2 text-sm text-ink-3">PDF, text, or a photo.</div>
              </button>
              {uploadNote && <p className="mt-3 text-sm leading-relaxed text-ink-3">{uploadNote}</p>}
              <p className="mt-3 font-mono text-[10px] leading-relaxed text-ink-3">{extractionKeyNote()}</p>
            </div>
          )}
          {tab === 'results' && ownFile && desk(false)}
        </ProgressSteps>
      )}
      {grievance && <PrintLetter text={grievance} />}
    </div>
  )
}
