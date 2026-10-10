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
})
