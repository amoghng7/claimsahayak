/** Domain model for ClaimSahayak — everything the desk reasons over. */

export interface RoomRentLimit {
  type: 'percent_si' | 'daily_cap' | 'no_limit' | 'single_room'
  /** percent of sum insured (percent_si) or absolute ₹/day (daily_cap) */
  value?: number
}

/** A named sub-limit: caps the sum of bill lines whose heads match `match`. */
export interface SubLimit {
  name: string
  /** keywords matched against bill-line heads (word-boundary, case-insensitive) */
  match: string[]
  /** fixed ₹ | % of sum insured | % of the claimed amount */
  type: 'fixed' | 'percent_si' | 'percent_claim'
  value: number
}

/** Permanent exclusion. `label` is the schedule wording shown on the desk.
 * `match` holds lay and clinical keywords so a diagnosis hits without quoting the clause. */
export interface PolicyExclusion {
  label: string
  match: string[]
}

export interface Policy {
  insurer: string
  product: string
  policyNo: string
  inceptionDate: string // ISO
  sumInsured: number
  roomRent: RoomRentLimit
  copayPct: number
  initialWaitingDays: number
  /** PED waiting period in months; absent → the 36-month IRDAI cap applies */
  pedWaitMonths?: number
  /** pre-existing diseases declared on the proposal form */
  pedsDeclared: string[]
  specificWaitingYears: number
  specificDiseases: string[]
  /** permanent exclusions as printed in the policy schedule */
  exclusions: PolicyExclusion[]
  /** named sub-limits beyond room rent (cataract caps, modern treatments…) */
  subLimits: SubLimit[]
}

export interface BillLine {
  head: string
  amount: number
  /** charges contractually linked to the chosen room category */
  roomLinked: boolean
  isRoomRent?: boolean
  /** typically non-payable consumables (gloves, masks, syringes…) */
  nonPayable?: boolean
}

export interface HospitalEpisode {
  hospital: string
  city: string
  admissionDate: string // ISO
  dischargeDate: string // ISO
  diagnosis: string
  procedure: string
  accidentRelated: boolean
  roomCategory: string
  roomRentPerDay: number
  roomDays: number
  billLines: BillLine[]
  totalBill: number
}

export interface CaseFile {
  id: string
  claimant: string
  patientAge: number
  policy: Policy
  episode: HospitalEpisode
  providedDocIds: string[]
  rejectionLetter?: string
}
