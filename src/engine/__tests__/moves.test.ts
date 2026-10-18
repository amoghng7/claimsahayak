import { describe, expect, it } from 'vitest'
import type { CaseFile } from '../types'
import { SAMPLE_CASES } from '../../data/samples'
import { claimMoves } from '../moves'
import { analyzeRejection, buildVerdict } from '../rules'

const [ramesh, meera, arvind] = SAMPLE_CASES

describe('claimMoves', () => {
  it('Ramesh: the papers he can still add, then the room-rent fact he cannot unwind', () => {
    const moves = claimMoves(ramesh, buildVerdict(ramesh))
    expect(moves.map((m) => m.id)).toEqual(['docs', 'pharmacy', 'room'])
    expect(moves[0].impact).toBe('raise')
    expect(moves[0].detail).toContain('Investigation reports (lab, imaging)')
    expect(moves[0].detail).toContain('Cancelled cheque / NEFT mandate')
    expect(moves[2].impact).toBe('know')
  })

  it('Meera: a clean appendectomy is one suggestion — file it — and does not ask for an implant invoice', () => {
    const moves = claimMoves(meera, buildVerdict(meera))
    expect(moves.map((m) => m.id)).toEqual(['ready'])
    expect(moves[0].title).toBe('File it')
    expect(moves[0].detail).toMatch(/implant invoice/i)
  })

  it('does not tell you to file a permanently excluded treatment', () => {
    const dental: CaseFile = {
      ...meera,
      episode: { ...meera.episode, diagnosis: 'Dental abscess', procedure: 'Extraction' },
    }
    const ids = claimMoves(dental, buildVerdict(dental)).map((m) => m.id)
    expect(ids).toContain('exclusion')
    expect(ids).not.toContain('ready')
  })

  it('Arvind: the repudiation is the move that can still be won, then the co-pay', () => {
    const letter = arvind.rejectionLetter ?? ''
    const moves = claimMoves(arvind, buildVerdict(arvind), analyzeRejection(arvind, letter))
    expect(moves.map((m) => m.id)).toEqual(['rejection', 'copay'])
    expect(moves[0].impact).toBe('raise')
    expect(moves[0].title).toMatch(/non-disclosure/i)
    expect(moves[1].impact).toBe('know')
  })
})
