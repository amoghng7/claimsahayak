import { describe, expect, it } from 'vitest'
import type { CaseFile, Policy } from '../types'
import {
  allowedRoomRent,
  analyzeRejection,
  buildVerdict,
  estimatePayable,
  exclusionCheck,
  isPolicyScheduleKnown,
  missingDocs,
  pedWaitingCheck,
  roomRentAnalysis,
  verifiedInception,
  waitingPeriodCheck,
} from '../rules'
import { SAMPLE_CASES } from '../../data/samples'

const [ramesh, meera, arvind] = SAMPLE_CASES

function makePolicy(overrides: Partial<Policy> = {}): Policy {
  return {
    insurer: 'Test Insurance Co.',
    product: 'Test Health Plan',
    policyNo: 'TEST/00/000001',
    inceptionDate: '2021-01-01',
    sumInsured: 500000,
    roomRent: { type: 'no_limit' },
    copayPct: 0,
    initialWaitingDays: 30,
    pedWaitMonths: 36,
    pedsDeclared: [],
    specificWaitingYears: 2,
    specificDiseases: ['Cataract'],
    exclusions: [],
    subLimits: [],
    ...overrides,
  }
}

function makeCase(overrides: Partial<CaseFile> = {}): CaseFile {
  return {
    id: 'test-case',
    claimant: 'Test Claimant',
    patientAge: 40,
    policy: makePolicy(),
    episode: {
      hospital: 'Test Hospital',
      city: 'Pune',
      admissionDate: '2026-06-01',
      dischargeDate: '2026-06-04',
      diagnosis: 'Viral fever',
      procedure: 'Supportive care',
      accidentRelated: false,
      roomCategory: 'Single AC',
      roomRentPerDay: 4000,
      roomDays: 3,
      billLines: [
        { head: 'Room & nursing charges', amount: 12000, roomLinked: false, isRoomRent: true },
        { head: 'Medicines', amount: 8000, roomLinked: false },
      ],
      totalBill: 20000,
    },
    providedDocIds: ['claim-form', 'discharge-summary', 'final-bill', 'investigations', 'prescriptions', 'kyc', 'neft'],
    ...overrides,
  }
}

describe('allowedRoomRent', () => {
  it('percent_si → percentage of sum insured per day', () => {
    expect(allowedRoomRent(makePolicy({ roomRent: { type: 'percent_si', value: 1 } }))).toBe(5000)
  })

  it('daily_cap → the absolute cap', () => {
    expect(allowedRoomRent(makePolicy({ roomRent: { type: 'daily_cap', value: 3500 } }))).toBe(3500)
  })

  it('no_limit → null (no effective cap)', () => {
    expect(allowedRoomRent(makePolicy({ roomRent: { type: 'no_limit' } }))).toBeNull()
  })

  it('single_room → null (eligibility rule, not an amount cap)', () => {
    expect(allowedRoomRent(makePolicy({ roomRent: { type: 'single_room' } }))).toBeNull()
  })

  it('percent_si on an unread (zero) sum insured → null — no verified cap, not ₹0', () => {
    expect(allowedRoomRent(makePolicy({ sumInsured: 0, roomRent: { type: 'percent_si', value: 1 } }))).toBeNull()
  })
})

describe('roomRentAnalysis — Ramesh Iyer proportional-deduction trap', () => {
  const rr = roomRentAnalysis(ramesh.policy, ramesh.episode)!

  it('allowed 1% of ₹5L SI = ₹5,000/day against ₹8,000 actual → ratio 0.625', () => {
    expect(rr.allowed).toBe(5000)
    expect(rr.actual).toBe(8000)
    expect(rr.ratio).toBe(0.625)
  })

  it('excess room rent disallowed: (8000 − 5000) × 4 nights', () => {
    expect(rr.roomCut).toBe(12000)
  })

  it('proportional cut on room-linked heads only: ₹1,70,000 × (1 − 0.625)', () => {
    expect(rr.proportionalCut).toBe(63750)
  })

  it('no trap when the room is within the limit', () => {
    expect(roomRentAnalysis(meera.policy, meera.episode)).toBeNull()
    expect(roomRentAnalysis(arvind.policy, arvind.episode)).toBeNull()
  })
})

describe('estimatePayable — waterfall ordering', () => {
  it('room cut and proportional cut precede non-payables (Ramesh)', () => {
    const p = estimatePayable(ramesh)
    expect(p.total).toBe(435000)
    expect(p.roomCut).toBe(12000)
    // ₹1,70,000 room-linked × (1 − 0.625); the ₹15,000 ICU line is exempt
    expect(p.proportionalCut).toBe(63750)
    expect(p.nonPayableCut).toBe(9500)
    // 435000 − 12000 − 63750 − 9500 = 349750
    expect(p.expected).toBe(349750)
  })

  it('co-pay applies last, on the admissible amount after non-payables (Arvind)', () => {
    const p = estimatePayable(arvind)
    expect(p.nonPayableCut).toBe(8000)
    // (360000 − 8000) × 20% = 70400 — would be 72000 if applied pre-non-payables
    expect(p.copayCut).toBe(70400)
    expect(p.expected).toBe(281600)
  })

  it('clean case: only non-payables deducted (Meera)', () => {
    const p = estimatePayable(meera)
    expect(p.roomCut).toBe(0)
    expect(p.copayCut).toBe(0)
    expect(p.expected).toBe(180500)
  })
})

describe('waitingPeriodCheck', () => {
  it('day 30 of a 30-day initial wait is not a breach', () => {
    const c = makeCase({
      policy: makePolicy({ inceptionDate: '2026-01-01' }),
    })
    c.episode.admissionDate = '2026-01-31'
    expect(waitingPeriodCheck(c)).toHaveLength(0)
  })

  it('day 29 of a 30-day initial wait breaches', () => {
    const c = makeCase({
      policy: makePolicy({ inceptionDate: '2026-01-01' }),
    })
    c.episode.admissionDate = '2026-01-30'
    const flags = waitingPeriodCheck(c)
    expect(flags).toHaveLength(1)
    expect(flags[0].label).toBe('Initial waiting period')
  })

  it('initial wait is waived for accidents', () => {
    const c = makeCase({
      policy: makePolicy({ inceptionDate: '2026-01-01' }),
    })
    c.episode.admissionDate = '2026-01-10'
    c.episode.accidentRelated = true
    expect(waitingPeriodCheck(c)).toHaveLength(0)
  })
})

describe('unread policy schedule — unknown is never certified as served', () => {
  it('verifiedInception keeps a real date and rejects null and the epoch sentinel', () => {
    expect(verifiedInception(makePolicy())).toBe('2021-01-01')
    expect(verifiedInception(makePolicy({ inceptionDate: null }))).toBeNull()
    // pre-fix saved cases carry the model's epoch fallback as a literal string
    expect(verifiedInception(makePolicy({ inceptionDate: '1970-01-01' }))).toBeNull()
    expect(isPolicyScheduleKnown(makePolicy({ inceptionDate: '1970-01-01' }))).toBe(false)
  })

  it('roomRentAnalysis: percent_si on a zero sum insured is no trap, not a 100% cut', () => {
    const c = makeCase({ policy: makePolicy({ sumInsured: 0, roomRent: { type: 'percent_si', value: 1 } }) })
    expect(roomRentAnalysis(c.policy, c.episode)).toBeNull()
  })

  it('waitingPeriodCheck: an unread policy raises no flag — a breach cannot be established', () => {
    expect(waitingPeriodCheck(makeCase({ policy: makePolicy({ inceptionDate: null }) }))).toEqual([])
    expect(waitingPeriodCheck(makeCase({ policy: makePolicy({ inceptionDate: '1970-01-01' }) }))).toEqual([])
  })

  it('pedWaitingCheck: unread policy with a declared matching PED → clean result, no breach', () => {
    const c = makeCase({
      policy: makePolicy({ inceptionDate: null, pedsDeclared: ['Diabetes mellitus (Type 2)'] }),
    })
    c.episode.diagnosis = 'Diabetic foot ulcer'
    const ped = pedWaitingCheck(c.policy, c.episode)
    expect(ped.breach).toBe(false)
    expect(ped.matchedPed).toBeNull()
    expect(ped.completesOn).toBeNull()
    expect(ped.excludedAmount).toBe(0)
  })

  it('buildVerdict: unread policy — caveat reasons, −10, no "served" positives, band capped at fair', () => {
    const v = buildVerdict(makeCase({ policy: makePolicy({ inceptionDate: null }) }))
    const labels = v.reasons.map((r) => r.label)
    expect(labels).toContain('No policy schedule read — waiting periods and sub-limits are unverified')
    expect(labels).toContain('Room-rent cap unverified — no policy schedule on file')
    expect(labels).not.toContain('All waiting periods served')
    expect(labels).not.toContain('Room category within sub-limit')
    expect(v.waiting).toEqual([])
    expect(v.flags.filter((f) => f.kind === 'policy_unverified')).toHaveLength(1)
    expect(v.flags.find((f) => f.kind === 'policy_unverified')?.severity).toBe('medium')
    // 100 − 8 (optional-doc cap) − 10 (unread policy) = 82
    expect(v.score).toBe(82)
    // 82 ≥ 75 would be strong, but "Claim-ready" is impossible without a schedule
    expect(v.band).toBe('fair')
  })

  it('buildVerdict: unread policy with mandatory gaps lands in the weak band', () => {
    const c = makeCase({
      policy: makePolicy({ inceptionDate: null }),
      providedDocIds: ['claim-form', 'discharge-summary', 'final-bill'],
    })
    const v = buildVerdict(c)
    // 100 − 36 (mandatory cap) − 8 (optional cap) − 10 = 46
    expect(v.score).toBe(46)
    expect(v.band).toBe('weak')
  })

  it('buildVerdict: an epoch inception (old saved-case shape) is treated as unread', () => {
    const v = buildVerdict(makeCase({ policy: makePolicy({ inceptionDate: '1970-01-01' }) }))
    expect(v.reasons.map((r) => r.label)).not.toContain('All waiting periods served')
    expect(v.score).toBe(82)
  })

  it('buildVerdict: a known policy still gets the positive reasons', () => {
    const v = buildVerdict(makeCase())
    const labels = v.reasons.map((r) => r.label)
    expect(labels).toContain('All waiting periods served')
    expect(labels).toContain('Room category within sub-limit')
    expect(v.flags.filter((f) => f.kind === 'policy_unverified')).toHaveLength(0)
  })

  it('analyzeRejection: PED non-disclosure over an unread policy → partial, no NaN years', () => {
    const c = makeCase({ policy: makePolicy({ inceptionDate: null }) })
    const rej = analyzeRejection(c, 'Your claim stands repudiated for non-disclosure of a pre-existing disease.')
    expect(rej.patternId).toBe('ped-nondisclosure')
    expect(rej.reversible).toBe('partial')
    expect(rej.explanation).not.toContain('NaN')
    expect(rej.explanation).toContain('moratorium clock cannot be verified')
  })

  it('estimatePayable: a percent_si sub-limit on a zero sum insured is skipped, not a 100% cut', () => {
    const c = makeCase({
      policy: makePolicy({
        sumInsured: 0,
        subLimits: [{ name: 'Cataract', match: ['cataract'], type: 'percent_si', value: 10 }],
      }),
    })
    c.episode.billLines.push({ head: 'Cataract surgery', amount: 50000, roomLinked: false })
    expect(estimatePayable(c).subLimitCuts).toEqual([])
  })
})

describe('exclusionCheck — permanent exclusions (AUD-11)', () => {
  it('matches the episode diagnosis/procedure against the exclusion list, case-insensitive', () => {
    const c = makeCase({
      policy: makePolicy({ exclusions: [{ label: 'Cosmetic surgery', match: ['cosmetic', 'aesthetic', 'rhinoplasty'] }] }),
    })
    c.episode.diagnosis = 'Rhinoplasty — COSMETIC SURGERY'
    c.episode.procedure = 'Cosmetic surgery — rhinoplasty'
    const chk = exclusionCheck(c.policy, c.episode)
    expect(chk.hits).toContain('Cosmetic surgery')
  })

  it('fires on real-world wording — "Dental abscess" under a dental exclusion, no verbatim clause needed', () => {
    const c = makeCase({
      policy: makePolicy({ exclusions: [{ label: 'Dental treatment unless accidental', match: ['dental'] }] }),
    })
    c.episode.diagnosis = 'Dental abscess'
    c.episode.procedure = 'Extraction'
    expect(exclusionCheck(c.policy, c.episode).hits).toContain('Dental treatment unless accidental')
  })

  it('keyword variants fire — a rhinoplasty bill under a cosmetic-surgery exclusion', () => {
    const c = makeCase({
      policy: makePolicy({ exclusions: [{ label: 'Cosmetic or aesthetic surgery', match: ['cosmetic', 'aesthetic', 'rhinoplasty'] }] }),
    })
    c.episode.diagnosis = 'Nasal deformity'
    c.episode.procedure = 'Rhinoplasty'
    const chk = exclusionCheck(c.policy, c.episode)
    expect(chk.hits).toContain('Cosmetic or aesthetic surgery')
  })

  it('respects word boundaries — "Hernia" does not match "Herniated disc"', () => {
    const c = makeCase({ policy: makePolicy({ exclusions: [{ label: 'Hernia', match: [] }] }) })
    c.episode.diagnosis = 'Herniated disc prolapse'
    c.episode.procedure = 'Discectomy'
    expect(exclusionCheck(c.policy, c.episode).hits).toHaveLength(0)
  })

  it('does not fire on generic clause words when nothing specific matches', () => {
    // "accidental" in the diagnosis must not fire the dental exclusion
    const c = makeCase({
      policy: makePolicy({ exclusions: [{ label: 'Dental treatment unless accidental', match: ['dental'] }] }),
    })
    c.episode.diagnosis = 'Fracture of neck of femur after accidental fall'
    c.episode.procedure = 'ORIF'
    expect(exclusionCheck(c.policy, c.episode).hits).toHaveLength(0)
  })

  it('excludes matching bill lines from the payable estimate', () => {
    const c = makeCase({
      policy: makePolicy({ exclusions: [{ label: 'Cosmetic surgery', match: ['cosmetic', 'rhinoplasty'] }] }),
    })
    c.episode.diagnosis = 'Cosmetic surgery — rhinoplasty'
    c.episode.billLines = [
      { head: 'Room & nursing charges', amount: 12000, roomLinked: false, isRoomRent: true },
      { head: 'Cosmetic surgery package (rhinoplasty)', amount: 60000, roomLinked: false },
      { head: 'Medicines', amount: 8000, roomLinked: false },
    ]
    c.episode.totalBill = 80000
    const chk = exclusionCheck(c.policy, c.episode)
    expect(chk.excludedLines).toHaveLength(1)
    expect(chk.excludedAmount).toBe(60000)
    const p = estimatePayable(c)
    expect(p.exclusionCut).toBe(60000)
    // 80000 − 60000 = 20000; excluded line is not double-counted elsewhere
    expect(p.expected).toBe(20000)
  })

  it('a line matched by both a permanent exclusion and a PED breach is cut exactly once', () => {
    const c = makeCase({
      policy: makePolicy({
        inceptionDate: '2025-04-01',
        exclusions: [{ label: 'Bronchial asthma', match: ['asthma'] }],
        pedsDeclared: ['Asthma'],
      }),
    })
    c.episode.admissionDate = '2026-06-01' // month 14 → PED breach
    c.episode.diagnosis = 'Acute asthma exacerbation'
    c.episode.billLines = [
      { head: 'Room & nursing charges', amount: 12000, roomLinked: false, isRoomRent: true },
      { head: 'Asthma management charges', amount: 5000, roomLinked: false },
      { head: 'Medicines', amount: 8000, roomLinked: false },
    ]
    c.episode.totalBill = 25000
    const p = estimatePayable(c)
    expect(p.exclusionCut + p.pedCut).toBe(5000)
    expect(p.expected).toBe(20000)
  })

  it('buildVerdict raises a crimson exclusion flag', () => {
    const c = makeCase({
      policy: makePolicy({ exclusions: [{ label: 'Cosmetic surgery', match: ['cosmetic', 'rhinoplasty'] }] }),
    })
    c.episode.diagnosis = 'Cosmetic surgery — rhinoplasty'
    const v = buildVerdict(c)
    const flag = v.flags.find((f) => f.kind === 'exclusion')
    expect(flag).toBeDefined()
    expect(flag!.severity).toBe('high')
    expect(flag!.title).toBe("This treatment appears in the policy's permanent exclusions")
  })

  it('clean policy: no hits, no excluded lines, zero exclusion cut', () => {
    const c = makeCase({
      policy: makePolicy({
        exclusions: [
          { label: 'Cosmetic surgery', match: ['cosmetic'] },
          { label: 'Dental treatment', match: ['dental'] },
        ],
      }),
    })
    const chk = exclusionCheck(c.policy, c.episode)
    expect(chk.hits).toHaveLength(0)
    expect(chk.excludedAmount).toBe(0)
    expect(estimatePayable(c).exclusionCut).toBe(0)
  })
})

describe('pedWaitingCheck — PED waiting-period scoring (AUD-12)', () => {
  function diabeticCase(inceptionDate: string, pedWaitMonths = 36) {
    const c = makeCase({
      policy: makePolicy({ inceptionDate, pedWaitMonths, pedsDeclared: ['Diabetes mellitus'] }),
    })
    c.episode.admissionDate = '2026-06-01'
    c.episode.diagnosis = 'Diabetic foot ulcer'
    c.episode.procedure = 'Wound debridement'
    c.episode.billLines = [
      { head: 'Room & nursing charges', amount: 12000, roomLinked: false, isRoomRent: true },
      { head: 'Diabetic wound care kit', amount: 5000, roomLinked: false },
      { head: 'Medicines', amount: 8000, roomLinked: false },
    ]
    c.episode.totalBill = 25000
    return c
  }

  it('declared PED admitted at month 14 of a 36-month wait → breach, treatment lines excluded, score −30', () => {
    const c = diabeticCase('2025-04-01')
    const ped = pedWaitingCheck(c.policy, c.episode)
    expect(ped.matchedPed).toBe('Diabetes mellitus')
    expect(ped.monthsSinceStart).toBe(14)
    expect(ped.breach).toBe(true)
    expect(ped.excludedAmount).toBe(5000)
    const p = estimatePayable(c)
    expect(p.pedCut).toBe(5000)
    expect(p.expected).toBe(20000)
    const v = buildVerdict(c)
    // 100 − 8 (3 optional docs) − 30 (PED breach) = 62
    expect(v.score).toBe(62)
    expect(v.flags.some((f) => f.kind === 'ped' && f.severity === 'high')).toBe(true)
  })

  it('the same admission at month 37 is clean', () => {
    const c = diabeticCase('2023-05-01')
    const ped = pedWaitingCheck(c.policy, c.episode)
    expect(ped.monthsSinceStart).toBe(37)
    expect(ped.breach).toBe(false)
    expect(ped.excludedAmount).toBe(0)
    expect(estimatePayable(c).expected).toBe(25000)
    expect(buildVerdict(c).score).toBe(92)
  })

  it('synonyms match — declared "Hypertension" fires on "high blood pressure"', () => {
    const c = makeCase({
      policy: makePolicy({ inceptionDate: '2025-04-01', pedsDeclared: ['Hypertension'] }),
    })
    c.episode.admissionDate = '2026-06-01'
    c.episode.diagnosis = 'High blood pressure crisis'
    const ped = pedWaitingCheck(c.policy, c.episode)
    expect(ped.matchedPed).toBe('Hypertension')
    expect(ped.breach).toBe(true)
  })

  it('synonyms match — declared "Diabetes" fires on "sugar"', () => {
    const c = makeCase({
      policy: makePolicy({ inceptionDate: '2025-04-01', pedsDeclared: ['Diabetes'] }),
    })
    c.episode.admissionDate = '2026-06-01'
    c.episode.diagnosis = 'Uncontrolled sugar with ketoacidosis'
    expect(pedWaitingCheck(c.policy, c.episode).breach).toBe(true)
  })

  it('breach in the wait’s last 3 months → amber "completes on" note instead of the crimson flag, no score penalty', () => {
    const c = diabeticCase('2023-08-01') // month 34 of 36
    const ped = pedWaitingCheck(c.policy, c.episode)
    expect(ped.breach).toBe(true)
    expect(ped.nearingCompletion).toBe(true)
    expect(ped.completesOn).toBe('2026-08-01')
    // filing today still loses the treatment-linked lines
    expect(estimatePayable(c).pedCut).toBe(5000)
    const v = buildVerdict(c)
    expect(v.flags.some((f) => f.kind === 'ped' && f.severity === 'medium')).toBe(true)
    expect(v.flags.some((f) => f.kind === 'ped' && f.severity === 'high')).toBe(false)
    expect(v.score).toBe(92) // no score penalty for a timing note
  })

  it('no declared PEDs → nothing to check', () => {
    const c = makeCase({ policy: makePolicy({ inceptionDate: '2025-04-01' }) })
    const ped = pedWaitingCheck(c.policy, c.episode)
    expect(ped.matchedPed).toBeNull()
    expect(ped.breach).toBe(false)
  })

  it('an extracted wait above 36 months is non-compliant and capped at 36', () => {
    const c = diabeticCase('2023-06-01', 48) // month 36 of a stated 48
    const ped = pedWaitingCheck(c.policy, c.episode)
    expect(ped.nonCompliant).toBe(true)
    expect(ped.waitMonths).toBe(36)
    expect(ped.breach).toBe(false) // the unlawful extra 12 months do not bind
  })

  it('missing pedWaitMonths defaults to the 36-month IRDAI cap', () => {
    const policy = makePolicy({ inceptionDate: '2025-04-01', pedsDeclared: ['Asthma'] })
    delete policy.pedWaitMonths
    const c = makeCase({ policy })
    c.episode.admissionDate = '2026-06-01'
    c.episode.diagnosis = 'Acute asthma exacerbation'
    const ped = pedWaitingCheck(c.policy, c.episode)
    expect(ped.waitMonths).toBe(36)
    expect(ped.breach).toBe(true)
  })
})

describe('sub-limits beyond room rent + ICU nuance (AUD-13)', () => {
  it('a fixed sub-limit caps the sum of matched bill lines, with its own waterfall row', () => {
    const c = makeCase({
      policy: makePolicy({
        subLimits: [{ name: 'Cataract (per eye)', match: ['cataract'], type: 'fixed', value: 40000 }],
      }),
    })
    c.episode.diagnosis = 'Cataract (right eye)'
    c.episode.procedure = 'Phacoemulsification with IOL'
    c.episode.billLines = [
      { head: 'Room & nursing charges', amount: 12000, roomLinked: false, isRoomRent: true },
      { head: 'Cataract surgery package', amount: 45000, roomLinked: false },
      { head: 'Cataract lens implant', amount: 10000, roomLinked: false },
    ]
    c.episode.totalBill = 67000
    const p = estimatePayable(c)
    expect(p.subLimitCuts).toHaveLength(1)
    expect(p.subLimitCuts[0].amount).toBe(15000)
    expect(p.subLimitCuts[0].label).toContain('Cataract')
    expect(p.expected).toBe(52000)
  })

  it('a percent_si sub-limit resolves against the sum insured', () => {
    const c = makeCase({
      policy: makePolicy({
        subLimits: [{ name: 'Modern treatments', match: ['robotic'], type: 'percent_si', value: 10 }],
      }),
    })
    c.episode.billLines = [
      { head: 'Room & nursing charges', amount: 12000, roomLinked: false, isRoomRent: true },
      { head: 'Robotic surgery charges', amount: 80000, roomLinked: false },
    ]
    c.episode.totalBill = 92000
    const p = estimatePayable(c)
    // 10% of ₹5,00,000 SI = ₹50,000 limit; matched ₹80,000 → cap ₹30,000
    expect(p.subLimitCuts[0].amount).toBe(30000)
    expect(p.expected).toBe(62000)
  })

  it('no cap row when the matched spend is within the limit', () => {
    const c = makeCase({
      policy: makePolicy({
        subLimits: [{ name: 'Cataract (per eye)', match: ['cataract'], type: 'fixed', value: 40000 }],
      }),
    })
    const p = estimatePayable(c)
    expect(p.subLimitCuts).toHaveLength(0)
    expect(p.expected).toBe(20000)
  })

  it('ICU lines are never proportionally reduced; non-ICU room-linked lines still are', () => {
    const c = makeCase({ policy: makePolicy({ roomRent: { type: 'daily_cap', value: 2000 } }) })
    c.episode.roomRentPerDay = 4000
    c.episode.roomDays = 3
    c.episode.billLines = [
      { head: 'Room & nursing charges', amount: 12000, roomLinked: false, isRoomRent: true },
      { head: 'ICU & ventilator charges', amount: 30000, roomLinked: true },
      { head: 'Surgeon fees', amount: 20000, roomLinked: true },
    ]
    c.episode.totalBill = 62000
    const rr = roomRentAnalysis(c.policy, c.episode)!
    expect(rr.ratio).toBe(0.5)
    // room cut applies to the non-ICU room line only: 12000 × (1 − 0.5)
    expect(rr.roomCut).toBe(6000)
    // proportional cut on surgeon fees only — the ICU line is exempt
    expect(rr.proportionalCut).toBe(10000)
    const p = estimatePayable(c)
    expect(p.expected).toBe(62000 - 6000 - 10000)
  })

  it('an ICU room-rent line is exempt from the room cap itself', () => {
    const c = makeCase({ policy: makePolicy({ roomRent: { type: 'daily_cap', value: 2000 } }) })
    c.episode.roomRentPerDay = 4000
    c.episode.roomDays = 3
    c.episode.billLines = [
      { head: 'ICU (intensive care) room rent', amount: 12000, roomLinked: false, isRoomRent: true },
      { head: 'Surgeon fees', amount: 20000, roomLinked: true },
    ]
    c.episode.totalBill = 32000
    const rr = roomRentAnalysis(c.policy, c.episode)!
    expect(rr.roomCut).toBe(0)
    expect(rr.proportionalCut).toBe(10000)
  })

  it('an edited room line within the cap clears the trap even if episode fields disagree', () => {
    // Extraction read ₹8,000/day into the episode fields, but the user corrects
    // the room line to ₹20,000 over 4 days = ₹5,000/day = the cap.
    const c = makeCase({ policy: makePolicy({ roomRent: { type: 'daily_cap', value: 5000 } }) })
    c.episode.roomRentPerDay = 8000
    c.episode.roomDays = 4
    c.episode.billLines = [
      { head: 'Room & nursing charges', amount: 20000, roomLinked: false, isRoomRent: true },
      { head: 'Surgeon fees', amount: 20000, roomLinked: true },
    ]
    c.episode.totalBill = 40000
    expect(roomRentAnalysis(c.policy, c.episode)).toBeNull()
    expect(estimatePayable(c).expected).toBe(40000)
  })

  it('deleting the room line removes the room cut but keeps the proportional deduction', () => {
    const c = makeCase({ policy: makePolicy({ roomRent: { type: 'daily_cap', value: 5000 } }) })
    c.episode.roomRentPerDay = 8000
    c.episode.roomDays = 4
    c.episode.billLines = [{ head: 'Surgeon fees', amount: 20000, roomLinked: true }]
    c.episode.totalBill = 20000
    const rr = roomRentAnalysis(c.policy, c.episode)!
    // no room charge in the bill → nothing to cut; the ratio still applies to linked heads
    expect(rr.roomCut).toBe(0)
    expect(rr.proportionalCut).toBe(7500) // 20000 × (1 − 5000/8000)
  })
})

describe('buildVerdict — score bands and stacking', () => {
  it('score 75 is the strong/fair boundary (strong)', () => {
    // 100 − 12 (1 mandatory doc) − 8 (2 optional docs) − 5 (co-pay) = 75
    const c = makeCase({
      policy: makePolicy({ copayPct: 10 }),
      providedDocIds: ['discharge-summary', 'final-bill', 'investigations', 'prescriptions', 'kyc', 'neft'],
    })
    const v = buildVerdict(c)
    expect(v.score).toBe(75)
    expect(v.band).toBe('strong')
  })

  it('score 50 is the fair/weak boundary (fair)', () => {
    // 100 − 8 (optional docs) − 12 (1 mandatory doc) − 30 (waiting breach) = 50
    const c = makeCase({
      policy: makePolicy({ inceptionDate: '2026-05-20' }),
      providedDocIds: ['discharge-summary', 'final-bill', 'investigations', 'prescriptions', 'kyc', 'neft'],
    })
    const v = buildVerdict(c)
    expect(v.score).toBe(50)
    expect(v.band).toBe('fair')
  })

  it('score 49 drops to weak', () => {
    // 100 − 4 (1 optional doc) − 12 (1 mandatory doc) − 30 (waiting breach) − 5 (co-pay) = 49
    const c = makeCase({
      policy: makePolicy({ inceptionDate: '2026-05-20', copayPct: 10 }),
      providedDocIds: ['discharge-summary', 'final-bill', 'investigations', 'prescriptions', 'kyc', 'neft', 'pharmacy', 'policy-copy'],
    })
    const v = buildVerdict(c)
    expect(v.score).toBe(49)
    expect(v.band).toBe('weak')
  })

  it('deductions stack: docs + room trap + co-pay all subtract', () => {
    const c = makeCase({
      policy: makePolicy({ roomRent: { type: 'daily_cap', value: 2000 }, copayPct: 10 }),
      providedDocIds: ['claim-form', 'discharge-summary'],
    })
    const v = buildVerdict(c)
    // 100 − 36 (mandatory docs, capped) − 8 (optional docs) − 15 (room) − 5 (copay) = 36
    expect(v.score).toBe(36)
    expect(v.flags.map((f) => f.kind)).toEqual(
      expect.arrayContaining(['room_rent', 'proportional', 'copay']),
    )
  })
})

describe('analyzeRejection — pattern matching', () => {
  it('PED / non-disclosure (Arvind letter) → reversible past the moratorium', () => {
    const v = analyzeRejection(arvind, arvind.rejectionLetter!)
    expect(v.patternId).toBe('ped-nondisclosure')
    expect(v.reversible).toBe('yes')
  })

  it('waiting period', () => {
    expect(analyzeRejection(makeCase(), 'Claim repudiated: waiting period not completed.').patternId).toBe('waiting')
  })

  it('document deficiency', () => {
    expect(
      analyzeRejection(makeCase(), 'Claim closed due to deficiency — required documents were not submitted.').patternId,
    ).toBe('deficiency')
  })

  it('delayed intimation', () => {
    expect(analyzeRejection(makeCase(), 'Claim is time-barred due to delayed intimation.').patternId).toBe('delay')
  })

  it('room rent / sub-limit', () => {
    expect(analyzeRejection(makeCase(), 'Deduction applied as per room rent sub-limit clause.').patternId).toBe('room')
  })

  it('policy exclusion', () => {
    expect(analyzeRejection(makeCase(), 'The treatment is excluded under policy exclusions.').patternId).toBe('exclusion')
  })

  it('unrecognised ground falls into the unknown bucket', () => {
    const v = analyzeRejection(makeCase(), 'Your claim has been repudiated. Good day.')
    expect(v.patternId).toBe('unknown')
    expect(v.steps.length).toBeGreaterThan(0)
  })
})

describe('line-item editor recompute path (AUD-14)', () => {
  it('an edited amount flows through the same engine and changes the payout', () => {
    // Meera: Medicines & pharmacy ₹21,000 → ₹31,000; totalBill ₹1,85,000 → ₹1,95,000
    const edited: CaseFile = {
      ...meera,
      episode: {
        ...meera.episode,
        billLines: meera.episode.billLines.map((l) =>
          l.head === 'Medicines & pharmacy' ? { ...l, amount: 31000 } : l,
        ),
        totalBill: 195000,
      },
    }
    const p = estimatePayable(edited)
    expect(p.total).toBe(195000)
    // 195000 − 4500 non-payables = 190500
    expect(p.expected).toBe(190500)
  })

  it('toggling a line non-payable deducts it in full', () => {
    // Meera: Investigations & imaging ₹23,000 flagged non-payable
    const edited: CaseFile = {
      ...meera,
      episode: {
        ...meera.episode,
        billLines: meera.episode.billLines.map((l) =>
          l.head === 'Investigations & imaging' ? { ...l, nonPayable: true } : l,
        ),
      },
    }
    const p = estimatePayable(edited)
    // 185000 − (4500 + 23000) = 157500
    expect(p.nonPayableCut).toBe(27500)
    expect(p.expected).toBe(157500)
  })

  it('deleting a line and reconciling the total drops the payout by that amount', () => {
    // Meera: drop Other services ₹30,000 → totalBill ₹1,55,000
    const edited: CaseFile = {
      ...meera,
      episode: {
        ...meera.episode,
        billLines: meera.episode.billLines.filter((l) => l.head !== 'Other services'),
        totalBill: 155000,
      },
    }
    expect(estimatePayable(edited).expected).toBe(150500)
  })
})

describe('bundled sample cases — documented results', () => {
  it('Ramesh Iyer: score 53 (fair), expected payout ₹3,49,750', () => {
    const v = buildVerdict(ramesh)
    expect(v.score).toBe(53)
    expect(v.band).toBe('fair')
    expect(v.payable.expected).toBe(349750)
  })

  it('Meera Kulkarni: score 96 (strong), expected payout ₹1,80,500', () => {
    const v = buildVerdict(meera)
    expect(v.score).toBe(96)
    expect(v.band).toBe('strong')
    expect(v.payable.expected).toBe(180500)
  })

  it('Arvind Rao: 20% co-pay ₹70,400, expected ₹2,81,600', () => {
    const v = buildVerdict(arvind)
    expect(v.payable.copayCut).toBe(70400)
    expect(v.payable.expected).toBe(281600)
  })

  it('missingDocs reflects the accident-only FIR rule', () => {
    expect(missingDocs(ramesh).some((d) => d.id === 'fir')).toBe(false)
    expect(missingDocs(makeCase({ providedDocIds: [] })).some((d) => d.id === 'fir')).toBe(false)
    const accident = makeCase({ providedDocIds: [] })
    accident.episode.accidentRelated = true
    expect(missingDocs(accident).some((d) => d.id === 'fir')).toBe(true)
  })
})
