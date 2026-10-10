import type { CaseFile } from './types'
import { EXTRACTION_RESPONSE_SCHEMA, extractionSchema } from './schemas'
import type { z } from 'zod'

/**
 * Live extraction path: raw document text → structured CaseFile via the
 * Gemini Developer API (gemini-2.5-flash, JSON mode). The browser talks to
 * Gemini directly with the user's own key; in a production deployment this
 * call moves server-side to Vertex AI on Google Cloud (see README).
 *
 * No key configured → the app stays fully usable in demo mode on the
 * bundled synthetic case files.
 */

const MODEL = 'gemini-2.5-flash'
const ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`

const PROMPT = `You are the extraction layer of an Indian health-insurance claim-readiness tool.
From the document texts below, produce ONE JSON object with EXACTLY this shape
(no markdown, no commentary):

{
  "claimant": string,
  "patientAge": number,
  "policy": {
    "insurer": string, "product": string, "policyNo": string,
    "inceptionDate": "YYYY-MM-DD", "sumInsured": number,
    "roomRent": { "type": "percent_si" | "daily_cap" | "no_limit" | "single_room", "value": number | null },
    "copayPct": number, "initialWaitingDays": number,
    "pedWaitingYears": number, "specificWaitingYears": number,
    "specificDiseases": string[]
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
- Use null or a sensible default when a field is absent; never invent policy terms you cannot see.
- providedDocIds must use ids from: claim-form, discharge-summary, final-bill, investigations, prescriptions, pharmacy, policy-copy, kyc, neft, fir, implant.
- roomLinked = true for heads that insurers tie to room category (surgeon/ consultant fees, nursing, OT charges); isRoomRent = true for the room & nursing rent line itself; nonPayable = true for consumables (gloves, masks, syringes, etc.).
- All money in INR numbers, dates ISO.

DOCUMENTS:
`

export interface DocText {
  label: string
  text: string
}

const UNREADABLE_ERROR =
  'The document could not be read reliably — try a clearer scan or enter the details manually.'

async function requestGemini(apiKey: string, prompt: string): Promise<string> {
  const body = {
    contents: [
      {
        role: 'user',
        parts: [{ text: prompt }],
      },
    ],
    generationConfig: {
      responseMimeType: 'application/json',
      responseSchema: EXTRACTION_RESPONSE_SCHEMA,
      temperature: 0,
    },
  }

  const url = apiKey === 'PROXY'
    ? '/api/gemini/generate'
    : `${ENDPOINT}?key=${encodeURIComponent(apiKey)}`;

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })

  if (!res.ok) {
    const detail = await res.text().catch(() => '')
    if (res.status === 400 || res.status === 403) {
      throw new Error('Gemini rejected the request — check the API key. Demo mode still works without one.')
    }
    if (res.status === 429) {
      throw new Error('Gemini quota exhausted for now — retry shortly, or keep exploring the bundled sample cases.')
    }
    throw new Error(`Gemini request failed (${res.status}). ${detail.slice(0, 160)}`)
  }

  const json = await res.json()
  const text: string | undefined = json?.candidates?.[0]?.content?.parts?.[0]?.text
  if (!text) throw new Error('Gemini returned no content — try clearer scans, or use a sample case.')
  return text
}

function toCaseFile(data: z.infer<typeof extractionSchema>): CaseFile {
  return {
    id: `live-${Date.now()}`,
    claimant: data.claimant || 'Unnamed claimant',
    patientAge: data.patientAge,
    policy: {
      ...data.policy,
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
    const text = await requestGemini(apiKey, prompt)
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

export function loadGeminiKey(): string {
  try {
    return localStorage.getItem(KEY_STORAGE) || 'PROXY'
  } catch {
    return 'PROXY'
  }
}

export function saveGeminiKey(key: string) {
  try {
    if (key) localStorage.setItem(KEY_STORAGE, key)
    else localStorage.removeItem(KEY_STORAGE)
  } catch {
    /* private mode — key simply won't persist */
  }
}
