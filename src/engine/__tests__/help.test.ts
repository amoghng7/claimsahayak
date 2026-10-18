import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  askHelp,
  HELP_DISCLAIMER,
  HELP_HISTORY_MAX,
  HELP_QUESTION_MAX,
  HELP_STARTERS,
  helpRequestBody,
  prepareHelpTurns,
  type HelpTurn,
} from '../help'

afterEach(() => {
  vi.unstubAllGlobals()
})

function reply(text: string) {
  return {
    ok: true,
    json: async () => ({ candidates: [{ content: { parts: [{ text }] } }] }),
  } as Response
}

describe('help clerk request', () => {
  it('stamps a cross-verify disclaimer and offers starter questions', () => {
    expect(HELP_DISCLAIMER).toMatch(/AI response/i)
    expect(HELP_DISCLAIMER).toMatch(/cross-verify/i)
    expect(HELP_STARTERS.length).toBeGreaterThan(2)
  })

  it('rejects an empty or over-long question', () => {
    expect(() => prepareHelpTurns([], '   ')).toThrow('Ask a question first.')
    expect(() => prepareHelpTurns([], 'a'.repeat(HELP_QUESTION_MAX + 1))).toThrow(
      `${HELP_QUESTION_MAX} characters`,
    )
  })

  it('keeps a short alternating history and drops a dangling user turn', () => {
    const history: HelpTurn[] = []
    for (let i = 0; i < 10; i++) {
      history.push({ role: 'user', text: `q${i}` })
      history.push({ role: 'model', text: `a${i}` })
    }
    history.push({ role: 'user', text: 'unanswered' })
    const turns = prepareHelpTurns(history, '  latest   question  ')
    expect(turns).toHaveLength(HELP_HISTORY_MAX + 1)
    expect(turns[0].role).toBe('user')
    expect(turns[turns.length - 1]).toEqual({ role: 'user', text: 'latest question' })
    expect(turns.some((turn) => turn.text === 'unanswered')).toBe(false)
    expect(turns.some((turn) => turn.text === 'q0')).toBe(false)
    for (let i = 1; i < turns.length; i++) {
      expect(turns[i].role).not.toBe(turns[i - 1].role)
    }
  })

  it('asks in prose through the managed proxy and forbids invented arithmetic', async () => {
    const spy = vi.fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>(
      async () => reply('  The score is on the desk.  '),
    )
    vi.stubGlobal('fetch', spy)

    const answer = await askHelp('PROXY', [{ role: 'user', text: 'earlier' }, { role: 'model', text: 'noted' }], 'What is the score?')

    expect(answer).toBe('The score is on the desk.')
    expect(spy.mock.calls[0][0]).toBe('/api/gemini/generate')
    const body = JSON.parse(String(spy.mock.calls[0][1]?.body))
    expect(body.generationConfig.responseMimeType).toBeUndefined()
    expect(body.generationConfig.temperature).toBe(0.2)
    expect(body.systemInstruction.parts[0].text).toMatch(/Never calculate/)
    expect(body.systemInstruction.parts[0].text).toMatch(/AI assistant/)
    expect(body.contents.map((turn: { role: string }) => turn.role)).toEqual(['user', 'model', 'user'])
    expect(body.contents.at(-1).parts[0].text).toBe('What is the score?')
  })

  it('builds a one-turn body that names the product', () => {
    const body = helpRequestBody(prepareHelpTurns([], 'How do I upload?'))
    expect(body.contents).toHaveLength(1)
    expect(body.systemInstruction.parts[0].text).toContain('ClaimSahayak')
  })

  it('routes a personal key browser-direct and surfaces an empty reply', async () => {
    const spy = vi.fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>(async () => reply(''))
    vi.stubGlobal('fetch', spy)
    await expect(askHelp('AIza-personal', [], 'Hello')).rejects.toThrow('no answer')
    expect(String(spy.mock.calls[0][0])).toContain('generativelanguage.googleapis.com')
    expect(String(spy.mock.calls[0][0])).toContain('key=AIza-personal')
  })
})
