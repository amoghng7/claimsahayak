import { describe, expect, it } from 'vitest'
import { analyzeRejection } from '../rules'
import { buildEscalationLadder, buildGrievanceLetter } from '../grievance'
import { SAMPLE_CASES } from '../../data/samples'

const arvind = SAMPLE_CASES[2]
const verdict = analyzeRejection(arvind, arvind.rejectionLetter!)
const letter = buildGrievanceLetter(arvind, verdict)

describe('buildGrievanceLetter', () => {
  it('names the policyholder, policy number and insurer', () => {
    expect(letter).toContain('Arvind Rao')
    expect(letter).toContain('NA/SC/19/223411')
    expect(letter).toContain('National Arogya Insurance Co.')
  })

  it('cites the regulatory positions from the rejection analysis', () => {
    for (const clause of verdict.clauses) {
      expect(letter).toContain(clause)
    }
  })

  it('lists every counter-step from the analysis', () => {
    for (const step of verdict.steps) {
      expect(letter).toContain(step)
    }
  })

  it('leaves no template placeholders behind', () => {
    expect(letter).not.toMatch(/\{\{/)
    expect(letter).not.toMatch(/__/)
  })

  it('closes with the assistive-draft disclaimer', () => {
    expect(letter).toContain('not legal advice')
  })

  it('states the current regulatory positions (14-day TAT, ₹50L Ombudsman cap)', () => {
    expect(letter).toContain('within 14 days')
    expect(letter).toContain('₹50 lakh')
    expect(letter).toContain('G.S.R. 828(E)')
    expect(letter).toContain('₹5,000 per day')
    expect(letter).toContain('bimabharosa.irdai.gov.in')
    expect(letter).toContain('complaints@irdai.gov.in')
    expect(letter).toContain('155255')
    expect(letter).not.toContain('within 15 days')
  })

  it('lists its sources at the end', () => {
    expect(letter).toContain('IRDAI/HLT/CIR/PRO/84/5/2024')
    expect(letter).toContain('Insurance Ombudsman Rules, 2017')
  })
})

describe('buildGrievanceLetter — dated variant', () => {
  const dated = buildGrievanceLetter(arvind, verdict, '2026-10-01')

  it('computes the 14-day deadline from the rejection date', () => {
    expect(dated).toContain('within 14 days')
    expect(dated).toContain('15 Oct 2026')
    expect(dated).toContain('repudiation dated 1 Oct 2026')
  })

  it('carries the grievance-cell header and claim/policy reference lines', () => {
    expect(dated).toContain('Grievance Cell, National Arogya Insurance Co.')
    expect(dated).toContain('Claim No.:')
    expect(dated).toContain('Policy No.: NA/SC/19/223411')
  })

  it('keeps the sources footer and leaves no placeholders', () => {
    expect(dated).toContain('IRDAI/HLT/CIR/PRO/84/5/2024')
    expect(dated).not.toMatch(/\{\{/)
    expect(dated).not.toMatch(/__/)
  })
})

describe('buildEscalationLadder', () => {
  const ladder = buildEscalationLadder('2026-10-01')

  it('has four rungs in order', () => {
    expect(ladder).toHaveLength(4)
    expect(ladder[0].title).toContain('GRO')
    expect(ladder[1].title).toContain('Bima Bharosa')
    expect(ladder[2].title).toContain('Ombudsman')
    expect(ladder[3].title).toContain('Consumer forum')
  })

  it('computes dates from the rejection date', () => {
    expect(ladder[0].date).toBe('2026-10-15') // GRO: 14 days
    expect(ladder[1].date).toBe('2026-10-31') // Bima Bharosa: unresolved in 30 days
    expect(ladder[2].date).toBe('2027-10-01') // Ombudsman: within 1 year
    expect(ladder[3].date).toBeNull() // consumer forum: alternative, no computed date
  })

  it('carries the verified regulatory positions', () => {
    const text = ladder.map((s) => s.detail).join('\n')
    expect(text).toContain('₹50 lakh')
    expect(text).toContain('₹5,000/day')
    expect(text).toContain('bimabharosa.irdai.gov.in')
    expect(text).toContain('155255')
    expect(text).toContain('Rule 14(5)')
  })
})
