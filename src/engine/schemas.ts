import { z } from 'zod'

/**
 * Validation boundary for Gemini's extraction output. The model may read the
 * documents, but nothing it produces enters the rules engine until it has
 * passed these schemas — money fields are non-negative numbers, enums match
 * the domain model in types.ts.
 */

export const roomRentSchema = z.object({
  type: z.enum(['percent_si', 'daily_cap', 'no_limit', 'single_room']),
  value: z.number().nonnegative().nullable(),
})

export const subLimitSchema = z.object({
  name: z.string(),
  match: z.array(z.string()),
  type: z.enum(['fixed', 'percent_si', 'percent_claim']),
  value: z.number().nonnegative(),
})

export const exclusionSchema = z.object({
  label: z.string(),
  match: z.array(z.string()),
})

export const policySchema = z.object({
  insurer: z.string(),
  product: z.string(),
  policyNo: z.string(),
  inceptionDate: z.string(),
  sumInsured: z.number().nonnegative(),
  roomRent: roomRentSchema,
  copayPct: z.number().nonnegative(),
  initialWaitingDays: z.number().nonnegative(),
  pedWaitMonths: z.number().nonnegative().nullable(),
  pedsDeclared: z.array(z.string()),
  specificWaitingYears: z.number().nonnegative(),
  specificDiseases: z.array(z.string()),
  exclusions: z.array(exclusionSchema),
  subLimits: z.array(subLimitSchema),
})

export const billLineSchema = z.object({
  head: z.string(),
  amount: z.number().nonnegative(),
  roomLinked: z.boolean(),
  isRoomRent: z.boolean(),
  nonPayable: z.boolean(),
})

export const episodeSchema = z.object({
  hospital: z.string(),
  city: z.string(),
  admissionDate: z.string(),
  dischargeDate: z.string(),
  diagnosis: z.string(),
  procedure: z.string(),
  accidentRelated: z.boolean(),
  roomCategory: z.string(),
  roomRentPerDay: z.number().nonnegative(),
  roomDays: z.number().nonnegative(),
  billLines: z.array(billLineSchema),
  totalBill: z.number().nonnegative(),
})

export const extractionSchema = z.object({
  claimant: z.string(),
  patientAge: z.number().nonnegative(),
  policy: policySchema,
  episode: episodeSchema,
  providedDocIds: z.array(z.string()),
  rejectionLetter: z.string().nullable(),
})

export type ExtractionPayload = z.infer<typeof extractionSchema>

/**
 * Rejection-letter classification output (fallback path in rejection.ts).
 * The model only classifies; the six known categories mirror the pattern ids
 * in rules.ts so the deterministic assess step can re-run for a match.
 */
export const REJECTION_CATEGORIES = [
  'ped-nondisclosure',
  'waiting',
  'deficiency',
  'delay',
  'room',
  'exclusion',
  'genuinely-other',
] as const

export const rejectionClassifySchema = z.object({
  category: z.enum(REJECTION_CATEGORIES),
  confidence: z.number().min(0).max(1),
  citedClause: z.string(),
  plainLanguageReason: z.string(),
})

export type RejectionClassification = z.infer<typeof rejectionClassifySchema>

/** Mirrors rejectionClassifySchema — keep the two in sync. */
export const REJECTION_RESPONSE_SCHEMA = {
  type: 'OBJECT',
  properties: {
    category: { type: 'STRING', enum: [...REJECTION_CATEGORIES] },
    confidence: { type: 'NUMBER' },
    citedClause: { type: 'STRING' },
    plainLanguageReason: { type: 'STRING' },
  },
  required: ['category', 'confidence', 'citedClause', 'plainLanguageReason'],
} as const

/**
 * OpenAPI-3-subset schema sent to Gemini as generationConfig.responseSchema,
 * so malformed output is rejected at the API level too. Mirrors the zod
 * schemas above — keep the two in sync.
 */
export const EXTRACTION_RESPONSE_SCHEMA = {
  type: 'OBJECT',
  properties: {
    claimant: { type: 'STRING' },
    patientAge: { type: 'NUMBER' },
    policy: {
      type: 'OBJECT',
      properties: {
        insurer: { type: 'STRING' },
        product: { type: 'STRING' },
        policyNo: { type: 'STRING' },
        inceptionDate: { type: 'STRING' },
        sumInsured: { type: 'NUMBER' },
        roomRent: {
          type: 'OBJECT',
          properties: {
            type: { type: 'STRING', enum: ['percent_si', 'daily_cap', 'no_limit', 'single_room'] },
            value: { type: 'NUMBER', nullable: true },
          },
          required: ['type', 'value'],
        },
        copayPct: { type: 'NUMBER' },
        initialWaitingDays: { type: 'NUMBER' },
        pedWaitMonths: { type: 'NUMBER', nullable: true },
        pedsDeclared: { type: 'ARRAY', items: { type: 'STRING' } },
        specificWaitingYears: { type: 'NUMBER' },
        specificDiseases: { type: 'ARRAY', items: { type: 'STRING' } },
        exclusions: {
          type: 'ARRAY',
          items: {
            type: 'OBJECT',
            properties: {
              label: { type: 'STRING' },
              match: { type: 'ARRAY', items: { type: 'STRING' } },
            },
            required: ['label', 'match'],
          },
        },
        subLimits: {
          type: 'ARRAY',
          items: {
            type: 'OBJECT',
            properties: {
              name: { type: 'STRING' },
              match: { type: 'ARRAY', items: { type: 'STRING' } },
              type: { type: 'STRING', enum: ['fixed', 'percent_si', 'percent_claim'] },
              value: { type: 'NUMBER' },
            },
            required: ['name', 'match', 'type', 'value'],
          },
        },
      },
      required: [
        'insurer', 'product', 'policyNo', 'inceptionDate', 'sumInsured', 'roomRent',
        'copayPct', 'initialWaitingDays', 'pedWaitMonths', 'pedsDeclared', 'specificWaitingYears', 'specificDiseases',
        'exclusions', 'subLimits',
      ],
    },
    episode: {
      type: 'OBJECT',
      properties: {
        hospital: { type: 'STRING' },
        city: { type: 'STRING' },
        admissionDate: { type: 'STRING' },
        dischargeDate: { type: 'STRING' },
        diagnosis: { type: 'STRING' },
        procedure: { type: 'STRING' },
        accidentRelated: { type: 'BOOLEAN' },
        roomCategory: { type: 'STRING' },
        roomRentPerDay: { type: 'NUMBER' },
        roomDays: { type: 'NUMBER' },
        billLines: {
          type: 'ARRAY',
          items: {
            type: 'OBJECT',
            properties: {
              head: { type: 'STRING' },
              amount: { type: 'NUMBER' },
              roomLinked: { type: 'BOOLEAN' },
              isRoomRent: { type: 'BOOLEAN' },
              nonPayable: { type: 'BOOLEAN' },
            },
            required: ['head', 'amount', 'roomLinked', 'isRoomRent', 'nonPayable'],
          },
        },
        totalBill: { type: 'NUMBER' },
      },
      required: [
        'hospital', 'city', 'admissionDate', 'dischargeDate', 'diagnosis', 'procedure',
        'accidentRelated', 'roomCategory', 'roomRentPerDay', 'roomDays', 'billLines', 'totalBill',
      ],
    },
    providedDocIds: { type: 'ARRAY', items: { type: 'STRING' } },
    rejectionLetter: { type: 'STRING', nullable: true },
  },
  required: ['claimant', 'patientAge', 'policy', 'episode', 'providedDocIds', 'rejectionLetter'],
} as const
