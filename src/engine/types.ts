/** Domain model for ClaimSahayak — everything the desk reasons over. */

export interface RoomRentLimit {
  type: 'percent_si' | 'daily_cap' | 'no_limit' | 'single_room'
  /** percent of sum insured (percent_si) or absolute ₹/day (daily_cap) */
  value?: number
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
  exclusions: string[]
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
