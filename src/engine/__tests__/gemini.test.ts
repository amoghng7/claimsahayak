import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  extractCaseWithGemini,
  loadGeminiKey,
  maskKey,
  resolveKeyState,
  saveGeminiKey,
  storedPersonalKey,
} from '../gemini'

const VALID_PAYLOAD = {
  claimant: 'Test Claimant',
  patientAge: 42,
  policy: {
    insurer: 'Test Insurance Co.',
    product: 'Test Plan',
    policyNo: 'TEST/00/000001',
    inceptionDate: '2021-01-01',
    sumInsured: 500000,
    roomRent: { type: 'percent_si', value: 1 },
    copayPct: 0,
    initialWaitingDays: 30,
    pedWaitMonths: 36,
    pedsDeclared: ['Diabetes'],
    specificWaitingYears: 2,
    specificDiseases: ['Cataract'],
    exclusions: [{ label: 'Cosmetic surgery', match: ['cosmetic', 'rhinoplasty'] }],
    subLimits: [],
  },
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
      { head: 'Room & nursing charges', amount: 12000, roomLinked: false, isRoomRent: true, nonPayable: false },
      { head: 'Medicines', amount: 8000, roomLinked: false, isRoomRent: false, nonPayable: false },
    ],
    totalBill: 20000,
  },
  providedDocIds: ['claim-form', 'final-bill'],
  rejectionLetter: null,
}

function geminiResponse(payload: unknown) {
  return {
    ok: true,
    json: async () => ({
      candidates: [{ content: { parts: [{ text: JSON.stringify(payload) }] } }],
    }),
  } as Response
}

function mockFetchSequence(...responses: Response[]) {
  let i = 0
  const spy = vi.fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>(
    async () => responses[Math.min(i++, responses.length - 1)],
  )
  vi.stubGlobal('fetch', spy)
  return spy
}

function requestBodyOf(spy: ReturnType<typeof mockFetchSequence>, call: number) {
  const init = spy.mock.calls[call][1]
  if (!init?.body || typeof init.body !== 'string') throw new Error('expected a JSON body')
  return JSON.parse(init.body)
}

const DOCS = [{ label: 'Policy schedule', text: 'dummy document text' }]

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('extractCaseWithGemini — schema validation', () => {
  it('accepts a schema-valid payload', async () => {
    const spy = mockFetchSequence(geminiResponse(VALID_PAYLOAD))
    const c = await extractCaseWithGemini('test-key', DOCS)
    expect(c.claimant).toBe('Test Claimant')
    expect(c.episode.totalBill).toBe(20000)
    expect(spy).toHaveBeenCalledTimes(1)
  })

  it('sends responseMimeType and responseSchema to the API', async () => {
    const spy = mockFetchSequence(geminiResponse(VALID_PAYLOAD))
    await extractCaseWithGemini('test-key', DOCS)
    const body = requestBodyOf(spy, 0)
    expect(body.generationConfig.responseMimeType).toBe('application/json')
    expect(body.generationConfig.responseSchema).toBeTruthy()
    expect(body.generationConfig.temperature).toBe(0)
  })

  it('rejects a payload with a string amount', async () => {
    const bad = structuredClone(VALID_PAYLOAD)
    // @ts-expect-error — deliberately malformed
    bad.episode.billLines[0].amount = 'twelve thousand'
    mockFetchSequence(geminiResponse(bad), geminiResponse(bad))
    await expect(extractCaseWithGemini('test-key', DOCS)).rejects.toThrow(
      'The document could not be read reliably',
    )
  })

  it('retries once with the validation errors appended, then succeeds', async () => {
    const bad = structuredClone(VALID_PAYLOAD)
    // @ts-expect-error — deliberately malformed
    bad.patientAge = 'forty-two'
    const spy = mockFetchSequence(geminiResponse(bad), geminiResponse(VALID_PAYLOAD))

    const c = await extractCaseWithGemini('test-key', DOCS)
    expect(c.claimant).toBe('Test Claimant')
    expect(spy).toHaveBeenCalledTimes(2)

    const retryBody = requestBodyOf(spy, 1)
    expect(retryBody.contents[0].parts[0].text).toContain('failed schema validation')
    expect(retryBody.contents[0].parts[0].text).toContain('patientAge')
  })

  it('unparseable JSON also goes through the retry path', async () => {
    const notJson = {
      ok: true,
      json: async () => ({ candidates: [{ content: { parts: [{ text: 'not json at all' }] } }] }),
    } as Response
    const spy = mockFetchSequence(notJson, geminiResponse(VALID_PAYLOAD))
    const c = await extractCaseWithGemini('test-key', DOCS)
    expect(c.patientAge).toBe(42)
    expect(spy).toHaveBeenCalledTimes(2)
  })
})

function errorResponse(status: number) {
  return { ok: false, status, text: async () => '' } as Response
}

describe('extractCaseWithGemini — proxy error mapping', () => {
  it('428 from the dev middleware explains the missing managed key', async () => {
    mockFetchSequence(errorResponse(428))
    await expect(extractCaseWithGemini('PROXY', DOCS)).rejects.toThrow(
      'No managed key in local dev',
    )
  })

  it('429 maps to a rate-limit message', async () => {
    mockFetchSequence(errorResponse(429))
    await expect(extractCaseWithGemini('PROXY', DOCS)).rejects.toThrow(
      'Too many requests. Wait a minute and retry.',
    )
  })

  it('402 maps to a credits-exhausted message', async () => {
    mockFetchSequence(errorResponse(402))
    await expect(extractCaseWithGemini('PROXY', DOCS)).rejects.toThrow(
      'The managed key is out of Gemini credits',
    )
  })

  it('502 maps to a service-unavailable message', async () => {
    mockFetchSequence(errorResponse(502))
    await expect(extractCaseWithGemini('PROXY', DOCS)).rejects.toThrow(
      'The analysis service is unavailable right now.',
    )
  })
})

describe('key-state helpers', () => {
  function stubLocalStorage() {
    const store = new Map<string, string>()
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
      setItem: (k: string, v: string) => void store.set(k, v),
      removeItem: (k: string) => void store.delete(k),
      clear: () => store.clear(),
    })
    return store
  }

  it('loadGeminiKey defaults to the PROXY sentinel', () => {
    stubLocalStorage()
    expect(loadGeminiKey()).toBe('PROXY')
    expect(storedPersonalKey()).toBeNull()
  })

  it('returns a stored personal key', () => {
    stubLocalStorage()
    saveGeminiKey('AIza-personal-key')
    expect(loadGeminiKey()).toBe('AIza-personal-key')
    expect(storedPersonalKey()).toBe('AIza-personal-key')
  })

  it('never stores an empty key or the PROXY sentinel', () => {
    const store = stubLocalStorage()
    saveGeminiKey('AIza-personal-key')
    saveGeminiKey('')
    expect(loadGeminiKey()).toBe('PROXY')
    saveGeminiKey('PROXY')
    expect(storedPersonalKey()).toBeNull()
    expect(store.size).toBe(0)
  })

  it('maskKey reveals only the last four characters', () => {
    expect(maskKey('AIzaSySecret1234')).toBe('••••1234')
    expect(maskKey('abcd')).toBe('••••abcd')
  })

  it('resolveKeyState covers managed, personal and none', () => {
    expect(resolveKeyState(null, false)).toBe('managed')
    expect(resolveKeyState('AIza-x', false)).toBe('personal')
    expect(resolveKeyState('AIza-x', true)).toBe('personal')
    expect(resolveKeyState(null, true)).toBe('none')
  })
})
