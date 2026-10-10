import type { CaseFile, HospitalEpisode, Policy } from './types'
import { daysBetween, yearsBetween } from './format'

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
 * The trap: pick a room above your sub-limit and the insurer doesn't just
 * cut the room rent — it scales down every charge linked to room category
 * by the same ratio. Deterministic arithmetic; no model involved.
 */
export function roomRentAnalysis(policy: Policy, ep: HospitalEpisode): RoomRentAnalysis | null {
  const allowed = allowedRoomRent(policy)
  if (allowed === null || ep.roomRentPerDay <= allowed) return null
  const ratio = allowed / ep.roomRentPerDay
  const roomCut = (ep.roomRentPerDay - allowed) * ep.roomDays
  const proportionalCut = ep.billLines
    .filter((l) => l.roomLinked && !l.isRoomRent)
    .reduce((sum, l) => sum + l.amount * (1 - ratio), 0)
  return { allowed, actual: ep.roomRentPerDay, ratio, roomCut, proportionalCut }
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

export interface PayableEstimate {
  total: number
  roomCut: number
  proportionalCut: number
  nonPayableCut: number
  copayCut: number
  expected: number
}

export function estimatePayable(c: CaseFile): PayableEstimate {
  const ep = c.episode
  const rr = roomRentAnalysis(c.policy, ep)
  const roomCut = rr?.roomCut ?? 0
  const proportionalCut = rr?.proportionalCut ?? 0
  const nonPayableCut = ep.billLines.filter((l) => l.nonPayable).reduce((s, l) => s + l.amount, 0)
  const admissible = Math.max(0, ep.totalBill - roomCut - proportionalCut - nonPayableCut)
  const copayCut = (admissible * c.policy.copayPct) / 100
  return {
    total: ep.totalBill,
    roomCut,
    proportionalCut,
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
  kind: 'room_rent' | 'proportional' | 'copay' | 'non_payable' | 'waiting'
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
}

export function buildVerdict(c: CaseFile): Verdict {
  const missing = missingDocs(c)
  const waiting = waitingPeriodCheck(c)
  const payable = estimatePayable(c)
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
  return { score, band, reasons, missing, flags, payable, roomRent: rr, waiting }
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
