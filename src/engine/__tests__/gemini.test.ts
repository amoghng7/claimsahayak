import { afterEach, describe, expect, it, vi } from 'vitest'
import { extractCaseWithGemini } from '../gemini'

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
    pedWaitingYears: 3,
    specificWaitingYears: 2,
    specificDiseases: ['Cataract'],
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
