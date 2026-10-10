import { afterEach, describe, expect, it, vi } from 'vitest'
import { analyzeRejection } from '../rules'
import { analyzeRejectionWithFallback, parseRejectionDate } from '../rejection'
import { SAMPLE_CASES } from '../../data/samples'

const arvind = SAMPLE_CASES[2]
// Matches none of the six regex patterns — forces the Gemini fallback path.
const NOVEL_LETTER =
  'We regret to inform you that your claim is repudiated on account of circumstances peculiar to the risk as underwritten.'

function geminiResponse(payload: unknown) {
  return {
    ok: true,
    json: async () => ({
      candidates: [{ content: { parts: [{ text: JSON.stringify(payload) }] } }],
    }),
  } as Response
}

function mockFetchSequence(...responses: (Response | (() => Promise<Response>))[]) {
  let i = 0
  const spy = vi.fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>(async () => {
    const next = responses[Math.min(i++, responses.length - 1)]
    if (typeof next === 'function') return next()
    return next
  })
  vi.stubGlobal('fetch', spy)
  return spy
}

const HIGH_CONFIDENCE = {
  category: 'exclusion',
  confidence: 0.9,
  citedClause: 'Clause 4.2 — permanent exclusions',
  plainLanguageReason: 'The insurer says the treatment is not covered under the policy.',
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('analyzeRejectionWithFallback — routing', () => {
  it('regex hit → no API call', async () => {
    const spy = mockFetchSequence(geminiResponse(HIGH_CONFIDENCE))
    const v = await analyzeRejectionWithFallback(arvind, arvind.rejectionLetter!, 'test-key')
    expect(v.patternId).toBe('ped-nondisclosure')
    expect(v.aiAssisted).toBeUndefined()
    expect(spy).not.toHaveBeenCalled()
  })

  it('regex miss + high-confidence category → deterministic verdict, flagged AI-assisted', async () => {
    const spy = mockFetchSequence(geminiResponse(HIGH_CONFIDENCE))
    const v = await analyzeRejectionWithFallback(arvind, NOVEL_LETTER, 'test-key')
    expect(spy).toHaveBeenCalledTimes(1)
    expect(v.patternId).toBe('exclusion')
    expect(v.reason).toBe('Policy exclusion invoked')
    expect(v.aiAssisted).toBe(true)
    // steps/clauses come from the deterministic pattern, not the model
    expect(v).toEqual({ ...analyzeRejectionFromPattern(arvind), aiAssisted: true })
  })

  it('low confidence → unknown preserved, advisory attached', async () => {
    mockFetchSequence(geminiResponse({ ...HIGH_CONFIDENCE, confidence: 0.4 }))
    const v = await analyzeRejectionWithFallback(arvind, NOVEL_LETTER, 'test-key')
    expect(v.patternId).toBe('unknown')
    expect(v.aiAssisted).toBe(true)
    expect(v.advisory).toContain('not covered')
  })

  it('genuinely-other → unknown preserved with advisory', async () => {
    mockFetchSequence(
      geminiResponse({ ...HIGH_CONFIDENCE, category: 'genuinely-other', confidence: 0.95 }),
    )
    const v = await analyzeRejectionWithFallback(arvind, NOVEL_LETTER, 'test-key')
    expect(v.patternId).toBe('unknown')
    expect(v.advisory).toBeTruthy()
  })

  it('network failure → plain unknown verdict, no throw', async () => {
    mockFetchSequence(() => Promise.reject(new Error('offline')))
    const v = await analyzeRejectionWithFallback(arvind, NOVEL_LETTER, 'test-key')
    expect(v.patternId).toBe('unknown')
    expect(v.aiAssisted).toBeUndefined()
    expect(v.advisory).toBeUndefined()
  })

  it('HTTP error → plain unknown verdict, no throw', async () => {
    mockFetchSequence({ ok: false, status: 429, text: async () => '' } as Response)
    const v = await analyzeRejectionWithFallback(arvind, NOVEL_LETTER, 'test-key')
    expect(v.patternId).toBe('unknown')
  })

  it('schema-invalid payload → one corrective retry, then degrade', async () => {
    const bad = geminiResponse({ category: 'exclusion', confidence: 'high' })
    const spy = mockFetchSequence(bad, bad)
    const v = await analyzeRejectionWithFallback(arvind, NOVEL_LETTER, 'test-key')
    expect(spy).toHaveBeenCalledTimes(2)
    expect(v.patternId).toBe('unknown')

    const retryBody = JSON.parse(spy.mock.calls[1][1]?.body as string)
    expect(retryBody.contents[0].parts[0].text).toContain('failed schema validation')
  })

  it('sends the rejection responseSchema at temperature 0', async () => {
    const spy = mockFetchSequence(geminiResponse(HIGH_CONFIDENCE))
    await analyzeRejectionWithFallback(arvind, NOVEL_LETTER, 'test-key')
    const body = JSON.parse(spy.mock.calls[0][1]?.body as string)
    expect(body.generationConfig.temperature).toBe(0)
    expect(body.generationConfig.responseMimeType).toBe('application/json')
    expect(body.generationConfig.responseSchema.properties.category.enum).toContain('genuinely-other')
  })
})

function analyzeRejectionFromPattern(c: typeof arvind) {
  // What the deterministic classifier would say if the letter had matched 'exclusion'.
  const v = analyzeRejection(c, 'claim not covered under policy exclusion clause')
  expect(v.patternId).toBe('exclusion')
  return v
}

describe('parseRejectionDate', () => {
  it('parses an explicit letterhead date', () => {
    expect(parseRejectionDate('Ref: CL/998\nDate: 12-10-2026\n\nDear Sir,')).toBe('2026-10-12')
    expect(parseRejectionDate('Dated: 20-Sep-2026')).toBe('2026-09-20')
    expect(parseRejectionDate('Date: 12 October 2026')).toBe('2026-10-12')
    expect(parseRejectionDate('Date: 2026-10-12')).toBe('2026-10-12')
    expect(parseRejectionDate('Date: October 12, 2026')).toBe('2026-10-12')
  })

  it('ignores date ranges in the body (hospitalisation dates)', () => {
    // Arvind Rao's letter has 20-Sep-2026 → 26-Sep-2026 in the body and no letterhead date.
    expect(parseRejectionDate(arvind.rejectionLetter!)).toBeNull()
  })

  it('rejects impossible dates', () => {
    expect(parseRejectionDate('Date: 31-02-2026')).toBeNull()
  })
})
