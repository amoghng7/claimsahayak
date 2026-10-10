import type { BillLine, CaseFile, HospitalEpisode, Policy, PolicyExclusion } from './types'
import { addMonths, daysBetween, formatDate, monthsBetween, yearsBetween } from './format'

/* ------------------------------------------------------------------ */
/* IRDAI-standard hospitalisation claim document checklist             */
/* ------------------------------------------------------------------ */

export interface DocSpec {
  id: string
  label: string
  mandatory: boolean
  why: string
  accidentOnly?: boolean
}

export const STANDARD_DOCS: DocSpec[] = [
  { id: 'claim-form', label: 'Claim form, Part A & Part B', mandatory: true, why: 'Part A is filled by you, Part B by the hospital. Without both, the claim never enters the queue.' },
  { id: 'discharge-summary', label: 'Discharge summary', mandatory: true, why: 'The primary proof of diagnosis, treatment and duration of stay.' },
  { id: 'final-bill', label: 'Itemised final bill with payment receipts', mandatory: true, why: 'Insurers settle against line items, not the lump sum.' },
  { id: 'investigations', label: 'Investigation reports (lab, imaging)', mandatory: true, why: 'Medical necessity is verified against these. Their absence is the single most common deficiency note.' },
  { id: 'prescriptions', label: "Treating doctor's prescriptions & admission advice", mandatory: true, why: 'Establishes that hospitalisation was advised, not elective.' },
  { id: 'pharmacy', label: 'Pharmacy bills mapped to prescriptions', mandatory: false, why: 'Unmapped pharmacy bills are routinely disallowed.' },
  { id: 'policy-copy', label: 'Policy schedule copy', mandatory: false, why: 'Speeds up verification of sub-limits and coverage.' },
  { id: 'kyc', label: 'Proposer KYC (PAN + address proof)', mandatory: true, why: 'Mandatory for settlement above ₹1 lakh under CKYC norms.' },
  { id: 'neft', label: 'Cancelled cheque / NEFT mandate', mandatory: true, why: 'Settlement is NEFT-only. A missing cancelled cheque stalls an otherwise approved claim.' },
  { id: 'fir', label: 'FIR / Medico-legal certificate', mandatory: true, accidentOnly: true, why: 'Accident claims are not processed without the MLC.' },
  { id: 'implant', label: 'Implant sticker / invoice', mandatory: false, why: 'Required only where an implant was used.' },
]

export interface MissingDoc extends DocSpec {
  applicable: boolean
}

export function missingDocs(c: CaseFile): MissingDoc[] {
  return STANDARD_DOCS
    .filter((d) => !d.accidentOnly || c.episode.accidentRelated)
    .filter((d) => !c.providedDocIds.includes(d.id))
    .map((d) => ({ ...d, applicable: true }))
}

/* ------------------------------------------------------------------ */
/* Room-rent sub-limit & proportional deduction                        */
/* ------------------------------------------------------------------ */

/** ₹/day the policy allows, or null when there is no effective cap. */
export function allowedRoomRent(policy: Policy): number | null {
  const r = policy.roomRent
  if (r.type === 'percent_si' && r.value) return (policy.sumInsured * r.value) / 100
  if (r.type === 'daily_cap' && r.value) return r.value
  return null // no_limit / single_room → eligibility rule, not an amount cap
}

export interface RoomRentAnalysis {
  allowed: number
  actual: number
  ratio: number
  /** excess room rent disallowed outright */
  roomCut: number
  /** proportional deduction on room-linked charges (surgeon, nursing…) */
  proportionalCut: number
}

/**
 * IRDAI convention: ICU / intensive-care / ventilator charges are not subject
 * to the room-rent sub-limit or the proportionate deduction that follows it.
 */
export const ICU_PATTERN = /icu|intensive care|ventilator/i

export function isIcuLine(l: BillLine): boolean {
  return ICU_PATTERN.test(l.head)
}

/**
 * The trap: pick a room above your sub-limit and the insurer doesn't just
 * cut the room rent — it scales down every charge linked to room category
 * by the same ratio. Deterministic arithmetic; no model involved.
 *
 * `omit` excludes lines already fully deducted elsewhere (permanent
 * exclusions, PED waits) so they are never cut twice.
 */
export function roomRentAnalysis(
  policy: Policy,
  ep: HospitalEpisode,
  omit?: (l: BillLine) => boolean,
): RoomRentAnalysis | null {
  const allowed = allowedRoomRent(policy)
  if (allowed === null) return null
  // The bill's room lines are the source of truth for the actual rent (the
  // ledger lets users correct them); episode fields are the fallback for
  // bills with no room line at all.
  const roomLines = ep.billLines.filter((l) => l.isRoomRent && !omit?.(l))
  const nonIcuRoom = roomLines.filter((l) => !isIcuLine(l))
  const actual =
    nonIcuRoom.length > 0
      ? nonIcuRoom.reduce((s, l) => s + l.amount, 0) / (ep.roomDays || 1)
      : ep.roomRentPerDay
  if (actual <= allowed) return null
  const ratio = allowed / actual
  const roomCut = nonIcuRoom.reduce((sum, l) => sum + l.amount * (1 - ratio), 0)
  const proportionalCut = ep.billLines
    .filter((l) => l.roomLinked && !l.isRoomRent && !isIcuLine(l) && !omit?.(l))
    .reduce((sum, l) => sum + l.amount * (1 - ratio), 0)
  return { allowed, actual, ratio, roomCut, proportionalCut }
}

/* ------------------------------------------------------------------ */
/* Keyword matching (exclusions, PEDs, sub-limits)                     */
/* ------------------------------------------------------------------ */

/** Case-insensitive word-boundary match — "Hernia" must not fire on "Herniated". */
function containsKeyword(text: string, keyword: string): boolean {
  const esc = keyword
    .trim()
    .toLowerCase()
    .replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  if (!esc) return false
  return new RegExp(`(?:^|[^a-z0-9])${esc}(?:[^a-z0-9]|$)`, 'i').test(text.toLowerCase())
}

/* ------------------------------------------------------------------ */
/* Permanent exclusions                                                */
/* ------------------------------------------------------------------ */

export interface ExclusionCheck {
  /** exclusion clause labels matched against the diagnosis / procedure */
  hits: string[]
  /** bill lines whose head matches an exclusion clause */
  excludedLines: BillLine[]
  excludedAmount: number
}

export function exclusionCheck(policy: Policy, ep: HospitalEpisode): ExclusionCheck {
  const keywordsOf = (e: PolicyExclusion) => [e.label, ...e.match]
  const treatmentText = `${ep.diagnosis} ${ep.procedure}`
  const hits = policy.exclusions
    .filter((e) => keywordsOf(e).some((k) => containsKeyword(treatmentText, k)))
    .map((e) => e.label)
  const excludedLines = ep.billLines.filter((l) =>
    policy.exclusions.some((e) => keywordsOf(e).some((k) => containsKeyword(l.head, k))),
  )
  return {
    hits,
    excludedLines,
    excludedAmount: excludedLines.reduce((s, l) => s + l.amount, 0),
  }
}

/* ------------------------------------------------------------------ */
/* PED waiting period                                                  */
/* ------------------------------------------------------------------ */

/** IRDAI (Insurance Products) Regulations 2024 — PED waits are capped at 36 months. */
export const PED_WAIT_CAP_MONTHS = 36

/** Colloquial ↔ clinical aliases for the PEDs most often declared. */
const PED_SYNONYMS: string[][] = [
  ['diabetes', 'diabetic', 'sugar'],
  ['hypertension', 'high blood pressure', 'bp'],
  ['thyroid'],
  ['asthma', 'asthmatic'],
  ['arthritis', 'arthritic'],
]

function pedVariants(declared: string): string[] {
  const variants = new Set<string>([declared])
  for (const group of PED_SYNONYMS) {
    if (group.some((v) => containsKeyword(declared, v))) group.forEach((v) => variants.add(v))
  }
  return [...variants]
}

export interface PedWaitingResult {
  matchedPed: string | null
  monthsSinceStart: number
  /** effective wait — an extracted value above the IRDAI cap is capped and flagged */
  waitMonths: number
  nonCompliant: boolean
  breach: boolean
  nearingCompletion: boolean
  completesOn: string | null
  excludedLines: BillLine[]
  excludedAmount: number
}

export function pedWaitingCheck(policy: Policy, ep: HospitalEpisode): PedWaitingResult {
  const extractedWait = policy.pedWaitMonths ?? PED_WAIT_CAP_MONTHS
  const nonCompliant = extractedWait > PED_WAIT_CAP_MONTHS
  const waitMonths = Math.min(extractedWait, PED_WAIT_CAP_MONTHS)
  const monthsSinceStart = monthsBetween(policy.inceptionDate, ep.admissionDate)

  const treatmentText = `${ep.diagnosis} ${ep.procedure}`
  let matchedPed: string | null = null
  let matchedVariants: string[] = []
  for (const declared of policy.pedsDeclared) {
    const variants = pedVariants(declared)
    if (variants.some((v) => containsKeyword(treatmentText, v))) {
      matchedPed = declared
      matchedVariants = variants
      break
    }
  }

  const breach = matchedPed !== null && monthsSinceStart < waitMonths
  // A breach in the wait's last 3 months is a timing problem, not a dead
  // claim — render it as the amber "completes on" note instead of crimson.
  const nearingCompletion = breach && waitMonths - monthsSinceStart <= 3
  const completesOn = matchedPed !== null ? addMonths(policy.inceptionDate, waitMonths) : null
  const excludedLines = breach
    ? ep.billLines.filter((l) => matchedVariants.some((v) => containsKeyword(l.head, v)))
    : []
  return {
    matchedPed,
    monthsSinceStart,
    waitMonths,
    nonCompliant,
    breach,
    nearingCompletion,
    completesOn,
    excludedLines,
    excludedAmount: excludedLines.reduce((s, l) => s + l.amount, 0),
  }
}

/* ------------------------------------------------------------------ */
/* Waiting periods                                                     */
/* ------------------------------------------------------------------ */

export interface WaitingFlag {
  breached: boolean
  label: string
  detail: string
}

export function waitingPeriodCheck(c: CaseFile): WaitingFlag[] {
  const flags: WaitingFlag[] = []
  const p = c.policy
  const ep = c.episode
  const daysSinceInception = daysBetween(p.inceptionDate, ep.admissionDate)
  const yearsSinceInception = yearsBetween(p.inceptionDate, ep.admissionDate)

  if (!ep.accidentRelated && daysSinceInception < p.initialWaitingDays) {
    flags.push({
      breached: true,
      label: 'Initial waiting period',
      detail: `Admission fell on day ${daysSinceInception} of the policy; the initial ${p.initialWaitingDays}-day wait (waived only for accidents) had not run out.`,
    })
  }
  const hit = p.specificDiseases.find((d) =>
    ep.diagnosis.toLowerCase().includes(d.toLowerCase()),
  )
  if (hit && yearsSinceInception < p.specificWaitingYears) {
    flags.push({
      breached: true,
      label: 'Specific-disease waiting period',
      detail: `"${hit}" carries a ${p.specificWaitingYears}-year wait; the policy was ${yearsSinceInception.toFixed(1)} years old at admission.`,
    })
  }
  return flags
}

/* ------------------------------------------------------------------ */
/* Payable waterfall                                                   */
/* ------------------------------------------------------------------ */

export interface SubLimitCut {
  label: string
  amount: number
}

export interface PayableEstimate {
  total: number
  roomCut: number
  proportionalCut: number
  exclusionCut: number
  pedCut: number
  subLimitCuts: SubLimitCut[]
  nonPayableCut: number
  copayCut: number
  expected: number
}

export function estimatePayable(c: CaseFile): PayableEstimate {
  const ep = c.episode
  const excl = exclusionCheck(c.policy, ep)
  const ped = pedWaitingCheck(c.policy, ep)
  const excluded = new Set([...excl.excludedLines, ...ped.excludedLines])
  const rr = roomRentAnalysis(c.policy, ep, (l) => excluded.has(l))
  const roomCut = rr?.roomCut ?? 0
  const proportionalCut = rr?.proportionalCut ?? 0
  const exclusionCut = excl.excludedAmount
  // A line hit by both a permanent exclusion and a PED breach is cut once.
  const pedCut = ped.excludedLines
    .filter((l) => !excl.excludedLines.includes(l))
    .reduce((s, l) => s + l.amount, 0)

  // Named sub-limits cap the (post-proportional) sum of their matched lines.
  const subLimitCuts: SubLimitCut[] = []
  for (const sl of c.policy.subLimits) {
    const limit =
      sl.type === 'fixed'
        ? sl.value
        : sl.type === 'percent_si'
          ? (sl.value / 100) * c.policy.sumInsured
          : (sl.value / 100) * ep.totalBill
    const effective = ep.billLines
      .filter((l) => !l.nonPayable && !excluded.has(l) && sl.match.some((k) => containsKeyword(l.head, k)))
      .reduce((s, l) => s + l.amount * (rr && l.roomLinked && !isIcuLine(l) ? rr.ratio : 1), 0)
    const cap = Math.max(0, effective - limit)
    if (cap > 0) {
      subLimitCuts.push({ label: `${sl.name} cap: ₹${Math.round(limit).toLocaleString('en-IN')} applied`, amount: cap })
    }
  }
  const subLimitCut = subLimitCuts.reduce((s, c) => s + c.amount, 0)

  const nonPayableCut = ep.billLines
    .filter((l) => l.nonPayable && !excluded.has(l))
    .reduce((s, l) => s + l.amount, 0)
  const admissible = Math.max(0, ep.totalBill - roomCut - proportionalCut - exclusionCut - pedCut - subLimitCut - nonPayableCut)
  const copayCut = (admissible * c.policy.copayPct) / 100
  return {
    total: ep.totalBill,
    roomCut,
    proportionalCut,
    exclusionCut,
    pedCut,
    subLimitCuts,
    nonPayableCut,
    copayCut,
    expected: Math.max(0, admissible - copayCut),
  }
}

/* ------------------------------------------------------------------ */
/* Claim-readiness score                                               */
/* ------------------------------------------------------------------ */

export type Band = 'strong' | 'fair' | 'weak'

export interface DeductionFlag {
  kind: 'room_rent' | 'proportional' | 'copay' | 'non_payable' | 'waiting' | 'exclusion' | 'ped'
  severity: 'high' | 'medium'
  title: string
  detail: string
  amountAtRisk: number
  clause: string
}

export interface Reason {
  ok: boolean
  label: string
}

export interface Verdict {
  score: number
  band: Band
  reasons: Reason[]
  missing: MissingDoc[]
  flags: DeductionFlag[]
  payable: PayableEstimate
  roomRent: RoomRentAnalysis | null
  waiting: WaitingFlag[]
  exclusions: ExclusionCheck
  ped: PedWaitingResult
}

export function buildVerdict(c: CaseFile): Verdict {
  const missing = missingDocs(c)
  const waiting = waitingPeriodCheck(c)
  const payable = estimatePayable(c)
  const exclusions = exclusionCheck(c.policy, c.episode)
  const ped = pedWaitingCheck(c.policy, c.episode)
  const rr = roomRentAnalysis(c.policy, c.episode)
  const flags: DeductionFlag[] = []
  const reasons: Reason[] = []

  let score = 100

  const missingMandatory = missing.filter((m) => m.mandatory)
  const missingOptional = missing.filter((m) => !m.mandatory)
  const docPenalty = Math.min(36, missingMandatory.length * 12) + Math.min(8, missingOptional.length * 4)
  score -= docPenalty
  reasons.push(
    missingMandatory.length === 0
      ? { ok: true, label: 'All mandatory documents are on file' }
      : { ok: false, label: `${missingMandatory.length} mandatory document${missingMandatory.length > 1 ? 's' : ''} missing` },
  )

  if (rr) {
    score -= 15
    flags.push({
      kind: 'room_rent',
      severity: 'high',
      title: 'Room-rent sub-limit exceeded',
      detail: `Room category allows ₹${rr.allowed.toLocaleString('en-IN')}/day; the bill shows ₹${rr.actual.toLocaleString('en-IN')}/day.`,
      amountAtRisk: rr.roomCut,
      clause: 'Policy schedule — Room Rent sub-limit. IRDAI (PPHI) Regulations 2024 require sub-limits to be prominently disclosed in the policy schedule.',
    })
    flags.push({
      kind: 'proportional',
      severity: 'high',
      title: 'Proportional deduction on linked charges',
      detail: `Choosing a room at ${Math.round((1 / rr.ratio) * 100) / 100}× the allowed rate lets the insurer scale every room-linked charge by ${Math.round(rr.ratio * 100)}%.`,
      amountAtRisk: rr.proportionalCut,
      clause: 'Policy T&C — "Proportionate Deduction": associated medical expenses are payable in the same proportion as the admissible room rent bears to the actual room rent.',
    })
    reasons.push({ ok: false, label: `Room-rent trap: ${Math.round((1 - rr.ratio) * 100)}% proportional cut exposure` })
  } else {
    reasons.push({ ok: true, label: 'Room category within sub-limit' })
  }

  if (exclusions.hits.length > 0) {
    flags.push({
      kind: 'exclusion',
      severity: 'high',
      title: "This treatment appears in the policy's permanent exclusions",
      detail: `The diagnosis or procedure matches: ${exclusions.hits.join(', ')}. Permanent exclusions are never payable, however old the policy.`,
      amountAtRisk: exclusions.excludedAmount,
      clause: 'Policy schedule — Permanent Exclusions; IRDAI HPR 2024 standardised exclusion wording.',
    })
    reasons.push({ ok: false, label: `Permanent exclusion hit: ${exclusions.hits[0]}` })
  }

  if (ped.nonCompliant) {
    flags.push({
      kind: 'ped',
      severity: 'medium',
      title: 'Non-compliant policy term: PED wait above the IRDAI cap',
      detail: `The schedule states a ${c.policy.pedWaitMonths}-month PED waiting period, but IRDAI caps it at 36 months — the excess is unenforceable. This estimate applies the 36-month cap.`,
      amountAtRisk: 0,
      clause: 'IRDAI (Insurance Products) Regulations, 2024 — PED waiting period capped at 36 months of continuous coverage.',
    })
  }

  if (ped.breach && !ped.nearingCompletion) {
    score -= 30
    flags.push({
      kind: 'ped',
      severity: 'high',
      title: `PED waiting period not served — ${ped.matchedPed}`,
      detail: `"${ped.matchedPed}" was declared at proposal and this admission (${ped.monthsSinceStart} months into the policy) falls inside its ${ped.waitMonths}-month wait. Treatment-linked lines are excluded from the estimate.`,
      amountAtRisk: ped.excludedAmount > 0 ? ped.excludedAmount : payable.expected,
      clause: 'Policy schedule — PED waiting period; IRDAI (Insurance Products) Regulations, 2024 (36-month cap).',
    })
    reasons.push({ ok: false, label: `PED wait breach: ${ped.matchedPed} at month ${ped.monthsSinceStart} of ${ped.waitMonths}` })
  } else if (ped.nearingCompletion && ped.completesOn) {
    flags.push({
      kind: 'ped',
      severity: 'medium',
      title: `Waiting period completes on ${formatDate(ped.completesOn)}`,
      detail: `"${ped.matchedPed}" is inside its PED wait window, but the wait ends within 3 months. If treatment can safely wait past that date, the claim clears this clause.`,
      amountAtRisk: 0,
      clause: 'Policy schedule — PED waiting period; IRDAI (Insurance Products) Regulations, 2024.',
    })
  }

  if (waiting.length > 0) {
    score -= 30
    for (const w of waiting) {
      flags.push({
        kind: 'waiting',
        severity: 'high',
        title: w.label,
        detail: w.detail,
        amountAtRisk: payable.expected,
        clause: 'Policy schedule — Waiting Periods; IRDAI HPR 2024 caps PED waits at 36 months.',
      })
    }
    reasons.push({ ok: false, label: `Waiting-period breach: ${waiting[0].label.toLowerCase()}` })
  } else {
    reasons.push({ ok: true, label: 'All waiting periods served' })
  }

  if (c.policy.copayPct > 0) {
    score -= 5
    flags.push({
      kind: 'copay',
      severity: 'medium',
      title: `${c.policy.copayPct}% co-payment applies`,
      detail: 'Co-pay is deducted from the admissible amount after all other deductions.',
      amountAtRisk: payable.copayCut,
      clause: 'Policy schedule — Co-payment clause.',
    })
    reasons.push({ ok: false, label: `${c.policy.copayPct}% co-pay on the admissible amount` })
  }

  if (payable.nonPayableCut > 0.04 * payable.total) {
    score -= 4
    flags.push({
      kind: 'non_payable',
      severity: 'medium',
      title: 'Non-payable consumables above 4% of bill',
      detail: 'Gloves, masks, syringes and similar consumables sit on the IRDAI non-payable list.',
      amountAtRisk: payable.nonPayableCut,
      clause: 'IRDAI non-payables list (2016 circular) — excluded items unless the policy has a consumables add-on.',
    })
  }

  score = Math.max(0, Math.min(100, Math.round(score)))
  const band: Band = score >= 75 ? 'strong' : score >= 50 ? 'fair' : 'weak'
  return { score, band, reasons, missing, flags, payable, roomRent: rr, waiting, exclusions, ped }
}

/* ------------------------------------------------------------------ */
/* Rejection-letter analyser                                           */
/* ------------------------------------------------------------------ */

export interface RejectionVerdict {
  patternId: string
  reason: string
  reversible: 'yes' | 'partial' | 'hard'
  explanation: string
  steps: string[]
  clauses: string[]
}

interface Pattern {
  id: string
  match: RegExp
  reason: string
  assess: (c: CaseFile) => Omit<RejectionVerdict, 'patternId' | 'reason'>
}

const PATTERNS: Pattern[] = [
  {
    id: 'ped-nondisclosure',
    match: /pre[- ]?existing|non[- ]?disclosure|not disclosed|misrepresentation|ped/i,
    reason: 'Pre-existing disease / non-disclosure',
    assess: (c) => {
      const years = yearsBetween(c.policy.inceptionDate, c.episode.admissionDate)
      if (years >= 5) {
        return {
          reversible: 'yes',
          explanation: `The policy had run ${years.toFixed(1)} continuous years at admission — past the 5-year moratorium in IRDAI's 2024 regulations. After the moratorium, a claim cannot be repudiated for non-disclosure except on proven fraud.`,
          steps: [
            'Reply in writing citing the moratorium: 5 continuous policy years completed.',
            'Attach the inception-to-date renewal continuity table (every renewal receipt).',
            'State that the claimed condition was never diagnosed before inception, with supporting medical history.',
            'Demand a specific fraud finding if they wish to persist — silence on this point is winnable at the Ombudsman.',
          ],
          clauses: [
            'IRDAI (Protection of Policyholders\' Interests, Operations and Allied Matters of Insurers) Regulations, 2024 — moratorium of 5 continuous years; no repudiation thereafter except proven fraud.',
            'IRDAI HPR 2024 — PED waiting period capped at 36 months; coverage cannot be denied beyond it.',
          ],
        }
      }
      return {
        reversible: 'partial',
        explanation: `The policy was ${years.toFixed(1)} years old — inside the moratorium window. The defence shifts to whether the undisclosed condition was (a) known at proposal time and (b) material to this claim. Unrelated non-disclosure does not void a claim.`,
        steps: [
          'Obtain a treating-doctor certificate that the hospitalised condition is unrelated to the alleged undisclosed ailment.',
          'Check proposal-form answers; if the question was ambiguous, note it — ambiguity reads against the insurer.',
          'If the PED waiting period (max 36 months) had run out, claim under it explicitly.',
        ],
        clauses: [
          'IRDAI HPR 2024 — PED waiting capped at 36 months.',
          'Established IRDAI/Ombudsman position: non-disclosure unrelated to the claimed condition is not a valid repudiation ground.',
        ],
      }
    },
  },
  {
    id: 'waiting',
    match: /waiting period/i,
    reason: 'Waiting period cited',
    assess: (c) => ({
      reversible: c.episode.accidentRelated ? 'yes' : 'partial',
      explanation: c.episode.accidentRelated
        ? 'Initial waiting periods are waived for accidental hospitalisation in almost every retail health policy. If the rejection leaned on the initial wait for an accident case, it contradicts the policy wording itself.'
        : 'Verify the exact waiting table in the schedule against the admission date. Off-by-a-few-days rejections do get overturned; a diagnosis outside the listed "specific diseases" cannot be held to the specific-disease wait.',
      steps: [
        'Tabulate policy inception, waiting period and admission date in one table.',
        'Quote the schedule clause verbatim in the reply.',
        c.episode.accidentRelated ? 'Attach the MLC/FIR to establish accidental origin.' : 'If the diagnosis is not in the specific-disease list, say so explicitly with the list attached.',
      ],
      clauses: ['Policy schedule — Waiting Periods clause.', 'IRDAI HPR 2024 — waiting-period definitions and 36-month PED cap.'],
    }),
  },
  {
    id: 'deficiency',
    match: /deficien|incomplete|documents? (not|were not)|required documents/i,
    reason: 'Document deficiency',
    assess: () => ({
      reversible: 'yes',
      explanation: 'Documentation rejections are the most reversible class: the claim is closed "for non-submission", not adjudicated on merits. Insurers are required to call for all deficiencies in one go, not piecemeal.',
      steps: [
        'Ask for the consolidated deficiency list in writing — piecemeal deficiency calls are themselves a violation.',
        'Resubmit the complete set within 15 days with a covering letter and acknowledgement.',
        'Reopen the same claim number; do not file a fresh claim.',
      ],
      clauses: ['IRDAI PPHI Regulations 2024 — insurer must raise all requirements at one time and decide within prescribed timelines.'],
    }),
  },
  {
    id: 'delay',
    match: /delay|intimation|notification|time[- ]?barred/i,
    reason: 'Delayed intimation / submission',
    assess: () => ({
      reversible: 'yes',
      explanation: 'Delay by itself is not a repudiation ground. IRDAI has directed insurers that claims cannot be denied merely for delayed intimation where the delay is explained and documents are otherwise in order.',
      steps: [
        'Explain the delay (treatment, recovery, hospitalisation of a family member) in one factual paragraph.',
        'Show no prejudice: the insurer could still verify all records.',
        'Cite IRDAI\'s position that delay alone is insufficient for repudiation.',
      ],
      clauses: ['IRDAI guidance on condonation of delay — delay alone is not a valid ground for rejection.'],
    }),
  },
  {
    id: 'room',
    match: /room rent|room category|sub[- ]?limit|proportional/i,
    reason: 'Room rent / sub-limit deduction',
    assess: (c) => {
      const rr = roomRentAnalysis(c.policy, c.episode)
      return {
        reversible: 'partial',
        explanation: rr
          ? `The deduction is contractual, but the math must be exact: allowed ₹${rr.allowed.toLocaleString('en-IN')}/day vs billed ₹${rr.actual.toLocaleString('en-IN')}/day (ratio ${rr.ratio.toFixed(2)}). Insurers frequently over-apply the ratio to heads it does not cover (implants, pharmacy).`
          : 'The deduction must match the schedule word-for-word. Errors in applying the ratio to non-linked heads are common and recoverable.',
        steps: [
          'Recompute the proportional deduction line-by-line; challenge any ratio applied to implants, medicines or package charges.',
          'Ask for the insurer\'s deduction worksheet — they are obliged to share the computation.',
          'Recover any excess over the contractual ratio.',
        ],
        clauses: ['Policy T&C — Proportionate Deduction clause.', 'IRDAI PPHI 2024 — deduction must be strictly per the disclosed schedule.'],
      }
    },
  },
  {
    id: 'exclusion',
    match: /exclusion|excluded|not covered/i,
    reason: 'Policy exclusion invoked',
    assess: () => ({
      reversible: 'partial',
      explanation: 'Exclusion-based rejections stand or fall on the exact policy wording. Permanent exclusions hold; but general exclusions are often misapplied to conditions that merely resemble them.',
      steps: [
        'Get the exclusion clause quoted verbatim in the rejection.',
        'Obtain a treating-doctor note differentiating the diagnosed condition from the excluded one.',
        'If the policy was sold with the condition accepted (PED declared), invoke the acceptance.',
      ],
      clauses: ['Policy schedule — Exclusions section.', 'IRDAI HPR 2024 — standardised exclusion wording applies.'],
    }),
  },
]

export function analyzeRejection(c: CaseFile, letter: string): RejectionVerdict {
  for (const p of PATTERNS) {
    if (p.match.test(letter)) {
      return { patternId: p.id, reason: p.reason, ...p.assess(c) }
    }
  }
  return {
    patternId: 'unknown',
    reason: 'Unclassified rejection ground',
    reversible: 'partial',
    explanation: 'The stated ground does not match the six common rejection patterns. The fallback playbook still applies: demand the specific clause relied upon, recompute any deductions, and build the written record.',
    steps: [
      'Demand the exact policy clause and computation relied upon, in writing.',
      'Prepare a point-by-point written rebuttal with documents annexed.',
      'Escalate to the insurer\'s Grievance Cell; then Bima Bharosa / Insurance Ombudsman if unresolved in 14 days.',
    ],
    clauses: ['IRDAI PPI Master Circular 2024 — grievance redressal timelines (14 days) and escalation route.'],
  }
}
