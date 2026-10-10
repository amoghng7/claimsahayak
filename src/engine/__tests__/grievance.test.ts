import { describe, expect, it } from 'vitest'
import { analyzeRejection } from '../rules'
import { buildGrievanceLetter } from '../grievance'
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
