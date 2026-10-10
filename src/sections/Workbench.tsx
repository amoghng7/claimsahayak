import { useMemo, useRef, useState } from 'react'
import type { CaseFile } from '../engine/types'
import {
  STANDARD_DOCS,
  analyzeRejection,
  buildVerdict,
  type DeductionFlag,
  type RejectionVerdict,
  type Verdict,
} from '../engine/rules'
import { buildGrievanceLetter } from '../engine/grievance'
import { hindiSummary } from '../engine/hindi'
import { formatINR, formatDate } from '../engine/format'
import { fileToDocText } from '../engine/pdf'
import { extractCaseWithGemini, loadGeminiKey, storedPersonalKey } from '../engine/gemini'
import { CASE_LABELS, SAMPLE_CASES } from '../data/samples'
import { PanelTitle } from '../components/kit'
import { ScoreStamp } from '../components/ScoreStamp'

const BAND_CHIP: Record<string, string> = {
  strong: 'bg-mint text-ink',
  fair: 'bg-brick text-ink',
  weak: 'bg-crimson text-paper',
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
      <div>
        <PanelTitle>Case files</PanelTitle>
        <div className="space-y-1">
          {SAMPLE_CASES.map((c) => (
            <button
              key={c.id}
              onClick={() => onPick(c)}
              className={`w-full text-left px-3 py-2.5 border transition-colors duration-150 ${
                current.id === c.id ? 'border-ink bg-paper-2' : 'border-line hover:bg-paper-2/60'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="font-medium text-sm">{c.claimant}</span>
                {c.rejectionLetter && <span className="font-mono text-[10px] text-crimson">REJECTED</span>}
              </div>
              <div className="font-mono text-[11px] text-ink-3 mt-0.5">
                {CASE_LABELS[c.id]} · {formatINR(c.episode.totalBill)}
              </div>
            </button>
          ))}
        </div>
      </div>

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
          <div className="font-mono text-sm font-semibold text-crimson">−{formatINR(flag.amountAtRisk)}</div>
          <div className="font-mono text-[10px] uppercase tracking-wider text-ink-3">at risk</div>
        </div>
      </div>
    </div>
  )
}

function Waterfall({ v }: { v: Verdict }) {
  const p = v.payable
  const rows: [string, number, string, boolean][] = [
    ['Total billed', p.total, 'var(--ink)', false],
    ['Room-rent excess', -p.roomCut, 'var(--crimson)', true],
    ['Proportional cut on linked charges', -p.proportionalCut, 'var(--crimson)', true],
  ]
  if (p.exclusionCut > 0) rows.push(['Permanent-exclusion cut', -p.exclusionCut, 'var(--crimson)', true])
  if (p.pedCut > 0) rows.push(['PED waiting-period exclusion', -p.pedCut, 'var(--crimson)', true])
  for (const cut of p.subLimitCuts) rows.push([cut.label, -cut.amount, 'var(--crimson)', true])
  rows.push(
    ['Non-payable consumables', -p.nonPayableCut, 'var(--brick)', true],
    ['Co-payment', -p.copayCut, 'var(--brick)', true],
    ['Expected settlement', p.expected, 'color-mix(in srgb, var(--mint) 55%, var(--paper))', false],
  )
  return (
    <div className="ledger font-mono text-[12.5px]">
      {rows.map(([label, amount, color, signed], i) => (
        <div key={label} className="rise" style={{ animationDelay: `${i * 70}ms` }}>
          {i > 0 && <div className="waterfall-join ml-2 h-3" aria-hidden />}
          <div className="flex items-center justify-between gap-4 px-3 py-2.5 border border-line" style={{ background: i === rows.length - 1 ? color : 'transparent' }}>
            <span className={i === rows.length - 1 ? 'font-semibold' : 'text-ink-3'}>{label}</span>
            <span className="flex items-center gap-3">
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
      ))}
    </div>
  )
}

function VerdictPanel({ c, v }: { c: CaseFile; v: Verdict }) {
  return (
    <div className="space-y-10">
      <div className="flex flex-wrap items-center gap-8 border-b border-line pb-8">
        <ScoreStamp score={v.score} band={v.band} />
        <div className="min-w-56 flex-1">
          <span className={`inline-block rounded-full px-3 py-1 font-mono text-[11px] font-semibold uppercase tracking-[0.12em] ${BAND_CHIP[v.band]}`}>
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
        <PanelTitle right={<span className="font-mono text-[10px] text-crimson">{v.flags.length} flags</span>}>
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
              const hit = v.exclusions.hits.includes(e)
              return (
                <div
                  key={i}
                  className="flex items-center justify-between gap-4 px-4 py-2.5 border-b border-line-faint last:border-0"
                >
                  <span className="text-[13px]">{e}</span>
                  {hit && (
                    <span className="font-mono text-[10px] uppercase tracking-wider text-crimson">
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
                    {m.mandatory && <span className="ml-2 font-mono text-[10px] uppercase tracking-wider text-crimson">mandatory</span>}
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

function RejectionDesk({
  letter,
  setLetter,
  analysis,
  onAnalyze,
}: {
  letter: string
  setLetter: (s: string) => void
  analysis: RejectionVerdict | null
  onAnalyze: () => void
}) {
  return (
    <div>
      <PanelTitle>Rejection desk</PanelTitle>
      <textarea
        value={letter}
        onChange={(e) => setLetter(e.target.value)}
        placeholder="Paste the insurer's repudiation letter here…"
        rows={5}
        className="w-full resize-y border border-line bg-paper px-3 py-2 font-mono text-[12px] leading-relaxed placeholder:text-ink-3/60 focus:outline-none focus:ring-2 focus:ring-brick"
      />
      <button
        onClick={onAnalyze}
        disabled={!letter.trim()}
        className="mt-2 w-full rounded-full bg-ink py-2.5 font-mono text-[11px] font-semibold uppercase tracking-[0.12em] text-paper transition-transform duration-150 hover:-translate-y-0.5 disabled:opacity-40 disabled:hover:translate-y-0"
      >
        Classify the rejection
      </button>

      {analysis && (
        <div className="rise mt-4 space-y-3">
          <div className="flex items-center justify-between">
            <span className="font-medium text-sm">{analysis.reason}</span>
            <span
              className="rounded-full px-2.5 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-wider"
              style={{
                background:
                  analysis.reversible === 'yes' ? 'var(--mint)' : analysis.reversible === 'partial' ? 'var(--brick)' : 'var(--crimson)',
                color: analysis.reversible === 'hard' ? 'var(--paper)' : 'var(--ink)',
              }}
            >
              {analysis.reversible === 'yes' ? 'Reversible' : analysis.reversible === 'partial' ? 'Partly winnable' : 'Hard'}
            </span>
          </div>
          <p className="text-[13px] leading-relaxed text-ink-3">{analysis.explanation}</p>
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
  )
}

function GrievancePanel({ text }: { text: string | null }) {
  const [copied, setCopied] = useState(false)
  if (!text) return null
  return (
    <div>
      <PanelTitle
        right={
          <button
            onClick={() => {
              navigator.clipboard.writeText(text).then(() => {
                setCopied(true)
                setTimeout(() => setCopied(false), 1600)
              })
            }}
            className="font-mono text-[10px] uppercase tracking-wider text-ink underline underline-offset-4 hover:text-crimson"
          >
            {copied ? 'copied ✓' : 'copy letter'}
          </button>
        }
      >
        Grievance letter — drafted
      </PanelTitle>
      <pre className="max-h-96 overflow-auto whitespace-pre-wrap border border-line bg-paper-2/70 p-4 font-mono text-[11.5px] leading-relaxed">
        {text}
      </pre>
    </div>
  )
}

function HindiPanel({ lines }: { lines: string[] }) {
  return (
    <div>
      <PanelTitle>हिंदी सारांश</PanelTitle>
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

/* ---------- the desk ---------- */

export function Workbench({ initialCaseId }: { initialCaseId?: string }) {
  const [caseFile, setCaseFile] = useState<CaseFile>(
    () => SAMPLE_CASES.find((c) => c.id === initialCaseId) ?? SAMPLE_CASES[0],
  )
  const [letter, setLetter] = useState(caseFile.rejectionLetter ?? '')
  const [analysis, setAnalysis] = useState<RejectionVerdict | null>(
    caseFile.rejectionLetter ? analyzeRejection(caseFile, caseFile.rejectionLetter) : null,
  )
  const [busy, setBusy] = useState(false)
  const [uploadNote, setUploadNote] = useState<string | null>(null)

  const verdict = useMemo(() => buildVerdict(caseFile), [caseFile])
  const hindi = useMemo(() => hindiSummary(caseFile, verdict), [caseFile, verdict])
  const grievance = useMemo(
    () => (analysis ? buildGrievanceLetter(caseFile, analysis) : null),
    [analysis, caseFile],
  )

  const pick = (c: CaseFile) => {
    setCaseFile(c)
    setLetter(c.rejectionLetter ?? '')
    setAnalysis(c.rejectionLetter ? analyzeRejection(c, c.rejectionLetter) : null)
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
      <div className="grid gap-8 lg:grid-cols-[280px_1fr_360px]">
        <aside>
          <CaseRail current={caseFile} onPick={pick} onFiles={onFiles} busy={busy} uploadNote={uploadNote} />
        </aside>

        <main>
          <VerdictPanel c={caseFile} v={verdict} />
        </main>

        <aside className="space-y-8">
          <RejectionDesk
            letter={letter}
            setLetter={setLetter}
            analysis={analysis}
            onAnalyze={() => letter.trim() && setAnalysis(analyzeRejection(caseFile, letter))}
          />
          <GrievancePanel text={grievance} />
          <HindiPanel lines={hindi} />
          <div>
            <PanelTitle>Export</PanelTitle>
            <button
              onClick={exportJson}
              className="w-full rounded-full border border-ink/40 py-2.5 font-mono text-[11px] uppercase tracking-[0.12em] transition-colors duration-150 hover:bg-paper-2"
            >
              Download case JSON
            </button>
            <p className="mt-3 font-mono text-[10px] leading-relaxed text-ink-3">
              Assistive analysis, not insurance or legal advice. Verify every figure against your own documents.
            </p>
          </div>
        </aside>
      </div>
    </div>
  )
}
