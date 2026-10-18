import type { CaseFile } from './types'
import { EXTRACTION_RESPONSE_SCHEMA, extractionSchema } from './schemas'
import type { z } from 'zod'

/** Document text → CaseFile via Gemini JSON mode. PROXY calls Vertex through the sidecar;
 * a saved personal key calls the Developer API. Sample cases still run with no key. */

const MODEL = 'gemini-3.8-flash'
const ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`

const PROMPT = `You are the extraction layer of an Indian health-insurance claim-readiness tool.
From the document texts below, produce ONE JSON object with EXACTLY this shape
(no markdown, no commentary):

{
  "claimant": string,
  "patientAge": number,
  "policy": {
    "insurer": string, "product": string, "policyNo": string,
    "inceptionDate": "YYYY-MM-DD" | null, "sumInsured": number,
    "roomRent": { "type": "percent_si" | "daily_cap" | "no_limit" | "single_room", "value": number | null },
    "copayPct": number, "initialWaitingDays": number,
    "pedWaitMonths": number | null, "pedsDeclared": string[],
    "specificWaitingYears": number,
    "specificDiseases": string[],
    "exclusions": [{ "label": string, "match": string[] }],
    "subLimits": [{ "name": string, "match": string[], "type": "fixed" | "percent_si" | "percent_claim", "value": number }]
  },
  "episode": {
    "hospital": string, "city": string,
    "admissionDate": "YYYY-MM-DD", "dischargeDate": "YYYY-MM-DD",
    "diagnosis": string, "procedure": string, "accidentRelated": boolean,
    "roomCategory": string, "roomRentPerDay": number, "roomDays": number,
    "billLines": [{ "head": string, "amount": number, "roomLinked": boolean, "isRoomRent": boolean, "nonPayable": boolean }],
    "totalBill": number
  },
  "providedDocIds": string[],
  "rejectionLetter": string | null
}

Rules:
- inceptionDate: null when no policy schedule is visible. Never invent a date for it.
- Use null or an empty value when a field is absent; never invent policy terms you cannot see.
- providedDocIds must use ids from: claim-form, discharge-summary, final-bill, investigations, prescriptions, pharmacy, policy-copy, kyc, neft, fir, implant.
- roomLinked = true for heads that insurers tie to room category (surgeon/ consultant fees, nursing, OT charges); isRoomRent = true for the room & nursing rent line itself; nonPayable = true for consumables (gloves, masks, syringes, etc.).
- exclusions = the policy schedule's permanent exclusions: label is the clause in short form (e.g. "Cosmetic or aesthetic surgery"), match holds lowercase keyword variants that a diagnosis or bill line would actually use (lay + clinical, e.g. ["cosmetic", "aesthetic", "rhinoplasty"]).
- pedWaitMonths = the PED waiting period in months (null if the document does not state one); pedsDeclared = pre-existing diseases declared on the proposal form.
- subLimits = named caps beyond room rent (e.g. "Cataract ₹40,000 per eye" → { name: "Cataract (per eye)", match: ["cataract"], type: "fixed", value: 40000 }). match holds lowercase keywords that would appear in bill-line heads; percent_si value is the percent of sum insured, percent_claim the percent of the claimed amount. Empty array if none stated.
- All money in INR numbers, dates ISO.

DOCUMENTS:
`

export interface DocText {
  label: string
  text: string
}

const UNREADABLE_ERROR =
  'The document could not be read reliably. Try a clearer scan or enter the details manually.'

/** JSON-mode call. The caller supplies the response schema and validates the text. */
export async function requestGeminiJson(
  apiKey: string,
  prompt: string,
  responseSchema: object,
): Promise<string> {
  const json = await callGemini(apiKey, {
    contents: [
      {
        role: 'user',
        parts: [{ text: prompt }],
      },
    ],
    generationConfig: {
      responseMimeType: 'application/json',
      responseSchema,
      temperature: 0,
    },
  })
  const text = candidateText(json)
  if (!text) throw new Error('Gemini returned no content. Try clearer scans, or use a sample case.')
  return text
}

/** Prose call for the help clerk. Same key routing as JSON mode, with no schema,
 * because the clerk must never return a figure the rules engine would trust. */
export async function requestGeminiText(
  apiKey: string,
  body: {
    systemInstruction: { parts: { text: string }[] }
    contents: { role: 'user' | 'model'; parts: { text: string }[] }[]
    generationConfig: { temperature: number; maxOutputTokens: number }
  },
): Promise<string> {
  const json = await callGemini(apiKey, body)
  const text = candidateText(json)
  if (!text) throw new Error('The help clerk returned no answer. Try rephrasing the question.')
  return text
}

async function callGemini(apiKey: string, body: object): Promise<unknown> {
  const url = apiKey === 'PROXY'
    ? '/api/gemini/generate'
    : `${ENDPOINT}?key=${encodeURIComponent(apiKey)}`

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })

  if (!res.ok) {
    const detail = await res.text().catch(() => '')
    if (res.status === 428) {
      markDevKeyMissing()
      throw new Error('No managed key in local dev. Add GEMINI_API_KEY to .env or paste your own key in Settings.')
    }
    if (res.status === 400 || res.status === 403) {
      throw new Error('Gemini rejected the request. Check the API key. The samples still work without one.')
    }
    if (res.status === 402) {
      throw new Error('The managed key is out of Gemini credits. Add credits in AI Studio, or use your own key in Settings.')
    }
    if (res.status === 429) {
      throw new Error('Too many requests. Wait a minute and retry.')
    }
    if (res.status === 502) {
      throw new Error('The analysis service is unavailable right now.')
    }
    throw new Error(`Gemini request failed (${res.status}). ${detail.slice(0, 160)}`)
  }

  return res.json()
}

function candidateText(json: unknown): string | undefined {
  if (!json || typeof json !== 'object') return undefined
  const candidates = (json as { candidates?: unknown }).candidates
  if (!Array.isArray(candidates)) return undefined
  const first = candidates[0]
  if (!first || typeof first !== 'object') return undefined
  const parts = (first as { content?: { parts?: { text?: unknown }[] } }).content?.parts
  if (!Array.isArray(parts)) return undefined
  const text = parts.map((part) => (typeof part?.text === 'string' ? part.text : '')).join('').trim()
  return text || undefined
}

/** Extraction may hand back an epoch sentinel when no schedule was visible
 * (the model's fallback shape); anything at or before 1970-01-01T00:00:00Z
 * means "no date was read", so it becomes null before the engine sees it. */
function scrubInceptionDate(iso: string | null): string | null {
  if (!iso) return null
  const t = new Date(iso).getTime()
  return Number.isFinite(t) && t > 0 ? iso : null
}

function toCaseFile(data: z.infer<typeof extractionSchema>): CaseFile {
  return {
    id: `live-${Date.now()}`,
    claimant: data.claimant || 'Unnamed claimant',
    patientAge: data.patientAge,
    policy: {
      ...data.policy,
      inceptionDate: scrubInceptionDate(data.policy.inceptionDate),
      pedWaitMonths: data.policy.pedWaitMonths ?? undefined,
      roomRent: { type: data.policy.roomRent.type, value: data.policy.roomRent.value ?? undefined },
    },
    episode: data.episode,
    providedDocIds: data.providedDocIds,
    rejectionLetter: data.rejectionLetter ?? undefined,
  }
}

export async function extractCaseWithGemini(apiKey: string, docs: DocText[]): Promise<CaseFile> {
  const basePrompt = PROMPT + docs.map((d) => `\n--- ${d.label} ---\n${d.text}`).join('\n')
  let prompt = basePrompt

  for (let attempt = 0; attempt < 2; attempt++) {
    const text = await requestGeminiJson(apiKey, prompt, EXTRACTION_RESPONSE_SCHEMA)
    let raw: unknown
    try {
      raw = JSON.parse(text)
    } catch {
      raw = undefined
    }
    const parsed = extractionSchema.safeParse(raw)
    if (parsed.success) return toCaseFile(parsed.data)

    if (attempt === 0) {
      const issues = parsed.error.issues
        .map((i) => `${i.path.join('.')}: ${i.message}`)
        .join('; ')
      prompt = `${basePrompt}\nYour previous response failed schema validation (${issues}). Return corrected JSON only.`
      continue
    }
    throw new Error(UNREADABLE_ERROR)
  }
  throw new Error(UNREADABLE_ERROR)
}

const KEY_STORAGE = 'claimsahayak.geminiKey'
const PROXY_SENTINEL = 'PROXY'
const KEY_STATE_EVENT = 'claimsahayak:keystate'

let devKeyMissing = false

function markDevKeyMissing() {
  if (devKeyMissing) return
  devKeyMissing = true
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event(KEY_STATE_EVENT))
  }
}

export function isDevKeyMissing(): boolean {
  return devKeyMissing
}

export function onKeyStateChange(listener: () => void): () => void {
  if (typeof window === 'undefined') return () => {}
  window.addEventListener(KEY_STATE_EVENT, listener)
  return () => window.removeEventListener(KEY_STATE_EVENT, listener)
}

export type KeyState = 'managed' | 'personal' | 'none'

export function resolveKeyState(personal: string | null, missingDevKey: boolean): KeyState {
  if (personal) return 'personal'
  return missingDevKey ? 'none' : 'managed'
}

export function maskKey(key: string): string {
  return `••••${key.slice(-4)}`
}

export function storedPersonalKey(): string | null {
  try {
    const stored = localStorage.getItem(KEY_STORAGE)
    return stored && stored !== PROXY_SENTINEL ? stored : null
  } catch {
    return null
  }
}

export function loadGeminiKey(): string {
  return storedPersonalKey() ?? PROXY_SENTINEL
}

export function saveGeminiKey(key: string) {
  try {
    // The sentinel is routing state, not a credential — never persist it.
    if (key && key !== PROXY_SENTINEL) localStorage.setItem(KEY_STORAGE, key)
    else localStorage.removeItem(KEY_STORAGE)
  } catch {
    /* private mode — key simply won't persist */
  }
}
