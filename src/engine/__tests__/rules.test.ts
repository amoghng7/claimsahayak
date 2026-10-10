import { describe, expect, it } from 'vitest'
import type { CaseFile, Policy } from '../types'
import {
  allowedRoomRent,
  analyzeRejection,
  buildVerdict,
  estimatePayable,
  missingDocs,
  roomRentAnalysis,
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
    pedWaitingYears: 3,
    specificWaitingYears: 2,
    specificDiseases: ['Cataract'],
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
    expect(p.roomCut).toBe(12000)
    expect(p.proportionalCut).toBe(63750)
    expect(p.nonPayableCut).toBe(9500)
    // 420000 − 12000 − 63750 − 9500 = 334750
    expect(p.expected).toBe(334750)
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

describe('bundled sample cases — documented results', () => {
  it('Ramesh Iyer: score 53 (fair), expected payout ₹3,34,750', () => {
    const v = buildVerdict(ramesh)
    expect(v.score).toBe(53)
    expect(v.band).toBe('fair')
    expect(v.payable.expected).toBe(334750)
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
