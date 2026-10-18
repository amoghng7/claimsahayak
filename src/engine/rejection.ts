import type { CaseFile } from './types'
import { analyzeRejection, assessPattern, type RejectionVerdict } from './rules'
import { REJECTION_RESPONSE_SCHEMA, rejectionClassifySchema } from './schemas'
import { requestGeminiJson } from './gemini'

/** Gemini classifies a rejection only when no regex pattern matches.
 * It picks a category; explanation, steps, and clauses stay deterministic. */

/** Below this confidence the model's category is treated as advisory only. */
const MIN_CONFIDENCE = 0.6

const PROMPT = `You are the classification layer of an Indian health-insurance claim-readiness tool.
Read the insurer's repudiation letter below and classify the stated ground for
rejection into EXACTLY ONE category:

- ped-nondisclosure  — pre-existing disease, non-disclosure, misrepresentation, void ab initio
- waiting            — initial / specific-disease / PED waiting period cited
- deficiency         — documents missing, claim closed for non-submission, incomplete proposal
- delay              — late intimation, delayed submission, time-barred
- room               — room rent, room category, sub-limit, proportionate deduction
- exclusion          — a policy exclusion invoked; treatment "not covered"
- genuinely-other    — none of the above fits

Produce ONE JSON object (no markdown, no commentary):
{
  "category": one of the ids above,
  "confidence": number 0..1 — how sure you are the category is the letter's real ground,
  "citedClause": the exact policy clause or wording the letter relies on ("" if none quoted),
  "plainLanguageReason": one or two plain sentences restating what the insurer said. No em dashes.
}

LETTER:
`

async function classifyLetter(apiKey: string, letter: string) {
  const basePrompt = PROMPT + letter
  let prompt = basePrompt
  for (let attempt = 0; attempt < 2; attempt++) {
    const text = await requestGeminiJson(apiKey, prompt, REJECTION_RESPONSE_SCHEMA)
    let raw: unknown
    try {
      raw = JSON.parse(text)
    } catch {
      raw = undefined
    }
    const parsed = rejectionClassifySchema.safeParse(raw)
    if (parsed.success) return parsed.data
    if (attempt === 0) {
      const issues = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')
      prompt = `${basePrompt}\nYour previous response failed schema validation (${issues}). Return corrected JSON only.`
      continue
    }
    throw new Error('classification output failed validation')
  }
  throw new Error('classification output failed validation')
}

export async function analyzeRejectionWithFallback(
  c: CaseFile,
  letter: string,
  apiKey: string,
): Promise<RejectionVerdict> {
  const base = analyzeRejection(c, letter)
  if (base.patternId !== 'unknown') return base

  // No key, proxy down, model nonsense — degrade silently to the regex
  // classifier's unknown verdict. The desk must never break on this path.
  const cls = await classifyLetter(apiKey, letter).catch(() => null)
  if (!cls) return base

  if (cls.confidence >= MIN_CONFIDENCE && cls.category !== 'genuinely-other') {
    const verdict = assessPattern(c, cls.category)
    if (verdict) return { ...verdict, aiAssisted: true }
  }
  return { ...base, aiAssisted: true, advisory: cls.plainLanguageReason }
}

const MONTHS: Record<string, number> = {
  jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
  jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11,
}

function toIso(y: number, m: number, d: number): string | null {
  const date = new Date(Date.UTC(y, m, d))
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== m || date.getUTCDate() !== d) return null
  return date.toISOString().slice(0, 10)
}

function parseDateText(text: string): string | null {
  const t = text.trim()
  let m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(t)
  if (m) return toIso(+m[1], +m[2] - 1, +m[3])
  m = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/.exec(t)
  if (m) return toIso(+m[3], +m[2] - 1, +m[1])
  m = /^(\d{1,2})[- ]([A-Za-z]{3,9})[- ,](\d{4})$/.exec(t)
  if (m && MONTHS[m[2].slice(0, 3).toLowerCase()] !== undefined) {
    return toIso(+m[3], MONTHS[m[2].slice(0, 3).toLowerCase()], +m[1])
  }
  m = /^([A-Za-z]{3,9})\s+(\d{1,2}),?\s+(\d{4})$/.exec(t)
  if (m && MONTHS[m[1].slice(0, 3).toLowerCase()] !== undefined) {
    return toIso(+m[3], MONTHS[m[1].slice(0, 3).toLowerCase()], +m[2])
  }
  return null
}

/** Repudiation date from a letterhead line only ("Date:" / "Dated").
 * Dates in the body are ignored; null means the desk should ask. */
export function parseRejectionDate(letter: string): string | null {
  for (const line of letter.split('\n')) {
    const m = /^\s*(?:date|dated)\s*[:\-.]?\s+(.+?)\s*$/i.exec(line)
    if (m) {
      const iso = parseDateText(m[1])
      if (iso) return iso
    }
  }
  return null
}