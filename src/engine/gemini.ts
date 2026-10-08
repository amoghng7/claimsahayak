import type { CaseFile } from './types'

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

export async function extractCaseWithGemini(apiKey: string, docs: DocText[]): Promise<CaseFile> {
  const body = {
    contents: [
      {
        role: 'user',
        parts: [{ text: PROMPT + docs.map((d) => `\n--- ${d.label} ---\n${d.text}`).join('\n') }],
      },
    ],
    generationConfig: {
      responseMimeType: 'application/json',
      temperature: 0,
    },
  }

  const res = await fetch(`${ENDPOINT}?key=${encodeURIComponent(apiKey)}`, {
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

  const parsed = JSON.parse(text)
  return {
    id: `live-${Date.now()}`,
    claimant: parsed.claimant ?? 'Unnamed claimant',
    patientAge: Number(parsed.patientAge) || 0,
    policy: parsed.policy,
    episode: parsed.episode,
    providedDocIds: Array.isArray(parsed.providedDocIds) ? parsed.providedDocIds : [],
    rejectionLetter: parsed.rejectionLetter ?? undefined,
  }
}

const KEY_STORAGE = 'claimsahayak.geminiKey'

export function loadGeminiKey(): string {
  try {
    return localStorage.getItem(KEY_STORAGE) ?? ''
  } catch {
    return ''
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
