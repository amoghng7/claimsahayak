import { useMemo, useRef, useState } from 'react'
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
import { fileToDocText } from '../engine/pdf'
import { extractCaseWithGemini, loadGeminiKey, storedPersonalKey } from '../engine/gemini'
import { CASE_LABELS, SAMPLE_CASES } from '../data/samples'
import { PanelTitle } from '../components/kit'
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

/* ---------- left rail ---------- */

function CaseRail({
  current,
  onPick,
  onFiles,
  busy,
  uploadNote,
}: {
  current: CaseFile
  onPick: (c: CaseFile) => void
  onFiles: (files: FileList) => void
  busy: boolean
  uploadNote: string | null
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  return (
    <div className="space-y-6">
      <nav aria-label="Sample case files">
        <PanelTitle>Case files</PanelTitle>
        <div className="flex gap-2 overflow-x-auto pb-1 lg:flex-col lg:gap-0 lg:space-y-1 lg:overflow-visible lg:pb-0">
          {SAMPLE_CASES.map((c) => (
            <button
              key={c.id}
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

      <div>
        <PanelTitle right={busy ? <span className="font-mono text-[10px] text-ink-3">reading…</span> : undefined}>
          Your documents
        </PanelTitle>
        <button
          onClick={() => inputRef.current?.click()}
          disabled={busy}
          className="w-full border border-dashed border-ink/40 px-4 py-6 text-center transition-colors duration-150 hover:bg-paper-2/60 disabled:opacity-50"
        >
          <div className="font-mono text-[11px] uppercase tracking-[0.14em] text-ink-3">
            Drop policy + bill PDFs
          </div>
          <div className="mt-1 text-xs text-ink-3">or .txt exports — read locally, extracted with Gemini</div>
        </button>
        <input
          ref={inputRef}
          type="file"
          multiple
          accept=".pdf,.txt,.md"
          className="hidden"
          onChange={(e) => {
            if (e.target.files?.length) onFiles(e.target.files)
            e.target.value = ''
          }}
        />
        {uploadNote && <p className="mt-2 text-xs leading-relaxed text-ink-3">{uploadNote}</p>}
        <p className="mt-2 font-mono text-[10px] leading-relaxed text-ink-3">
          {storedPersonalKey()
            ? 'Using your Gemini key — live extraction on.'
            : 'Managed key — live extraction on. Add your own in Settings (top right) to override.'}
        </p>
      </div>

      <div>
        <PanelTitle>Policy terms read</PanelTitle>
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
              <dt className="text-ink-3">{k}</dt>
              <dd className="text-right">{v}</dd>
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
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="font-medium text-sm">{flag.title}</div>
          <p className="mt-1 text-[13px] leading-relaxed text-ink-3">{flag.detail}</p>
          <p className="mt-2 font-mono text-[10.5px] leading-relaxed text-ink-3/80">{flag.clause}</p>
        </div>
        <div className="shrink-0 text-right">
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
    <div className="overflow-x-auto" tabIndex={0} role="region" aria-label="Settlement waterfall — scroll horizontally">
      <div className="ledger font-mono text-[12.5px]">
        {rows.map(([label, amount, color, signed], i) => {
          const last = i === rows.length - 1
          return (
            <div key={label} className="rise min-w-[560px]" style={{ animationDelay: `${i * 70}ms` }}>
              {i > 0 && <div className="waterfall-join ml-2 h-3" aria-hidden />}
              <div className="flex items-center justify-between gap-4 px-3 py-2.5 border border-line" style={{ background: last ? color : 'transparent' }}>
                <span
                  className={`sticky left-0 pr-2 ${last ? 'font-semibold' : 'text-ink-3'}`}
                  style={{ background: last ? color : 'var(--paper)' }}
                >
                  {label}
                </span>
                <span className="flex items-center gap-3 whitespace-nowrap">
                  <span className="inline-block h-2 w-16" aria-hidden>
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

function VerdictPanel({ c, v }: { c: CaseFile; v: Verdict }) {
  return (
    <div className="space-y-10">
      <div className="flex flex-wrap items-center gap-8 border-b border-line pb-8">
        <div aria-live="polite" className="h-[120px] w-[120px] overflow-hidden lg:h-[188px] lg:w-[188px]">
          <div className="origin-top-left scale-[0.64] lg:scale-100">
            <ScoreStamp score={v.score} band={v.band} />
          </div>
        </div>
        <div className="min-w-56 flex-1">
          <span aria-live="polite" className={`inline-block rounded-full px-3 py-1 font-mono text-[11px] font-semibold uppercase tracking-[0.12em] ${BAND_CHIP[v.band]}`}>
            {BAND_LABEL[v.band]}
          </span>
          <h2 className="mt-3 font-display text-3xl font-semibold leading-tight">{c.claimant}</h2>
          <p className="mt-1 font-mono text-[12px] text-ink-3">
            {c.episode.hospital}, {c.episode.city} · {formatDate(c.episode.admissionDate)} → {formatDate(c.episode.dischargeDate)} · {c.episode.diagnosis}
          </p>
          <ul className="mt-4 space-y-1.5">
            {v.reasons.map((r, i) => (
              <li key={i} className="flex items-center gap-2.5 text-[13.5px]">
                <span
                  className="h-1.5 w-1.5 shrink-0 rounded-full"
                  style={{ background: r.ok ? 'color-mix(in srgb, var(--mint) 70%, var(--ink))' : 'var(--crimson)' }}
                />
                <span className={r.ok ? 'text-ink-3' : ''}>{r.label}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div>
        <PanelTitle right={<span className="font-mono text-[10px] text-crimson-deep">{v.flags.length} flags</span>}>
          Deduction traps &amp; risks
        </PanelTitle>
        {v.flags.length === 0 ? (
          <p className="text-sm text-ink-3 border border-dashed border-line px-4 py-5">
            No deduction traps detected in this file — the exposures below are clean.
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
        <PanelTitle>Expected settlement — the waterfall</PanelTitle>
        <Waterfall v={v} />
        <p className="mt-2 font-mono text-[10.5px] text-ink-3">
          Estimate from extracted figures. The insurer&apos;s computation is final; the point is to know the number before they tell you.
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
          Document checklist vs IRDAI standard
        </PanelTitle>
        {v.missing.length === 0 ? (
          <p className="text-sm text-ink-3 border border-dashed border-line px-4 py-5">
            Nothing missing — every applicable document is on file.
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
      <PanelTitle>Escalation ladder — dated</PanelTitle>
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
                classified with AI assistance — verify against the letter
              </p>
            )}
            <p className="text-[13px] leading-relaxed text-ink-3">{analysis.explanation}</p>
            {analysis.advisory && (
              <p className="border-l-2 border-brick pl-3 text-[12.5px] italic leading-relaxed text-ink-3">
                AI interpretation of the letter: {analysis.advisory}
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
      {hindiLines && <HindiPanel lines={hindiLines} title="सरल हिंदी सारांश (प्रायोगिक)" />}
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
        Grievance letter — drafted
      </PanelTitle>
      <pre tabIndex={0} aria-label="Drafted grievance letter — scrollable" className="max-h-96 overflow-auto whitespace-pre-wrap border border-line bg-paper-2/70 p-4 font-mono text-[11.5px] leading-relaxed">
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
        Bill lines — check the extraction
      </PanelTitle>
      <div className="border border-line overflow-x-auto" tabIndex={0} role="region" aria-label="Bill lines editor — scroll horizontally">
        {lines.map((l, i) => (
          <div
            key={i}
            className="flex flex-nowrap items-center gap-2 px-3 py-2 min-w-[640px] border-b border-line-faint last:border-0"
          >
            <input
              value={l.head}
              aria-label="Line item"
              onChange={(e) => update(i, { head: e.target.value })}
              className="sticky left-0 w-44 shrink-0 bg-paper text-[13px] focus:outline-none focus:ring-1 focus:ring-brick lg:w-auto lg:min-w-40 lg:flex-1"
            />
            {l.edited && (
              <span className="font-mono text-[9px] uppercase tracking-wider text-brick">edited</span>
            )}
            <Toggle on={l.roomLinked} label="room-linked" onClick={() => update(i, { roomLinked: !l.roomLinked })} />
            <Toggle on={!!l.nonPayable} label="non-payable" onClick={() => update(i, { nonPayable: !l.nonPayable })} />
            <input
              type="number"
              min={0}
              value={l.amount}
              aria-label="Amount"
              onChange={(e) => update(i, { amount: clampAmount(e.target.value) })}
              className="w-28 bg-transparent text-right font-mono text-[12.5px] tabular-nums focus:outline-none focus:ring-1 focus:ring-brick"
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
        <div className="flex items-center justify-between gap-4 border-t border-line bg-paper-2/60 px-3 py-2.5 min-w-[640px]">
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
        Corrections recompute the verdict instantly through the same engine. The total always equals the sum of the rows above.
      </p>
    </div>
  )
}

/* ---------- the desk ---------- */

export function Workbench({ initialCaseId }: { initialCaseId?: string }) {
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

  const pick = (c: CaseFile) => {
    setBaseline(c)
    setLines(toEditable(c.episode.billLines))
    setLetter(c.rejectionLetter ?? '')
    setAnalysis(c.rejectionLetter ? analyzeRejection(c, c.rejectionLetter) : null)
    setRejectionDate(
      (c.rejectionLetter ? parseRejectionDate(c.rejectionLetter) : null) ??
        new Date().toISOString().slice(0, 10),
    )
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
    const key = loadGeminiKey()
    setBusy(true)
    setUploadNote(null)
    try {
      const docs = await Promise.all(Array.from(files).map(fileToDocText))
      const empty = docs.filter((d) => d.text.trim().length < 40)
      if (empty.length === docs.length) {
        setUploadNote('Those PDFs look like scanned images with no text layer. Export text (or photograph → OCR) and try again.')
        return
      }
      const extracted = await extractCaseWithGemini(key, docs)
      pick({ ...extracted, rejectionLetter: extracted.rejectionLetter })
      setUploadNote(`Read ${docs.length} document${docs.length > 1 ? 's' : ''} — verdict rebuilt from your file.`)
    } catch (err) {
      setUploadNote(err instanceof Error ? err.message : 'Extraction failed — the sample files still work.')
    } finally {
      setBusy(false)
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

  return (
    <div className="mx-auto max-w-shell px-6 py-8">
      <div className="grid gap-8 lg:grid-cols-[280px_1fr_360px]" data-print-hidden>
        <aside aria-label="Case files and policy terms" className="min-w-0">
          <CaseRail current={caseFile} onPick={pick} onFiles={onFiles} busy={busy} uploadNote={uploadNote} />
        </aside>

        <main className="min-w-0 space-y-10">
          <VerdictPanel c={caseFile} v={verdict} />
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
              onClick={exportJson}
              className="min-h-11 w-full rounded-full border border-ink/40 py-2.5 font-mono text-[11px] uppercase tracking-[0.12em] transition-colors duration-150 hover:bg-paper-2"
            >
              Download case JSON
            </button>
            <p className="mt-3 font-mono text-[10px] leading-relaxed text-ink-3">
              Assistive analysis, not insurance or legal advice. Verify every figure against your own documents.
            </p>
          </div>
        </aside>
      </div>
      {grievance && <PrintLetter text={grievance} />}
    </div>
  )
}
