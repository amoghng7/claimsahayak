import { describe, expect, it } from 'vitest'
import { analyzeRejection, buildVerdict } from '../rules'
import { hindiRejectionSummary, hindiSummary } from '../hindi'
import { SAMPLE_CASES } from '../../data/samples'
import type { CaseFile } from '../types'

const DEVANAGARI = /[ऀ-ॿ]/

describe('hindiSummary', () => {
  it.each(SAMPLE_CASES.map((c) => [c.claimant, c] as const))(
    'renders for %s without throwing',
    (_name, c) => {
      const lines = hindiSummary(c, buildVerdict(c))
      expect(lines.length).toBeGreaterThan(0)
      expect(lines.join('\n')).toMatch(DEVANAGARI)
    },
  )

  it('renders the weak band', () => {
    // Strip all documents from the room-rent-trap case → score drops below 50
    const weak: CaseFile = { ...SAMPLE_CASES[0], providedDocIds: [] }
    const v = buildVerdict(weak)
    expect(v.band).toBe('weak')
    const lines = hindiSummary(weak, v)
    expect(lines[0]).toMatch(DEVANAGARI)
    expect(lines.join('\n')).toContain('जोखिम')
  })

  it('covers all three bands across sample + weak variant', () => {
    const bands = new Set(
      [...SAMPLE_CASES, { ...SAMPLE_CASES[0], providedDocIds: [] }].map(
        (c) => buildVerdict(c).band,
      ),
    )
    expect(bands).toEqual(new Set(['strong', 'fair', 'weak']))
  })

  it('unread policy: says the schedule is missing, makes no waiting-period claim', () => {
    const unread: CaseFile = { ...SAMPLE_CASES[1], policy: { ...SAMPLE_CASES[1].policy, inceptionDate: null } }
    const v = buildVerdict(unread)
    const text = hindiSummary(unread, v).join('\n')
    expect(text).toContain('पॉलिसी शेड्यूल नहीं मिली')
    expect(text).toContain('पॉलिसी की कॉपी जोड़ें')
    // no claim that a waiting period was breached or served
    expect(text).not.toContain('पूरी नहीं हुई')
  })
})

describe('hindiRejectionSummary', () => {
  const arvind = SAMPLE_CASES[2]
  const verdict = analyzeRejection(arvind, arvind.rejectionLetter!)
  const lines = hindiRejectionSummary(arvind, verdict)
  const text = lines.join('\n')

  it('states the insurer\'s ground and the rejected amount', () => {
    expect(text).toContain(verdict.reason)
    expect(text).toContain('₹3,60,000')
  })

  it('says the rejection is reversible and names the next step', () => {
    expect(text).toContain('उलटा जा सकता')
    expect(text).toContain('अगला कदम')
    expect(text).toContain(verdict.steps[0])
  })

  it('carries the escalation timeline and the disclaimer', () => {
    expect(text).toContain('14 दिनों')
    expect(text).toContain('बीमा लोकपाल')
    expect(text).toContain('सलाह नहीं')
  })

  it('renders in Devanagari with Latin numerals', () => {
    expect(text).toMatch(DEVANAGARI)
    expect(text).not.toMatch(/[०-९]/) // no Devanagari digits
  })
})
