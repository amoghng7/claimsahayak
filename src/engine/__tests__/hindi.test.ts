import { describe, expect, it } from 'vitest'
import { buildVerdict } from '../rules'
import { hindiSummary } from '../hindi'
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
})
