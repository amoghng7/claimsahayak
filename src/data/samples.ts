import type { CaseFile } from '../engine/types'

/**
 * Three synthetic case files powering demo mode.
 * All insurers, hospitals, policies and people are fictional; the policy
 * mechanics (1% SI room-rent cap, proportional deduction, moratorium,
 * 20% senior co-pay) mirror real Indian retail health policies.
 */

export const SAMPLE_CASES: CaseFile[] = [
  {
    id: 'ramesh-iyer',
    claimant: 'Ramesh Iyer',
    patientAge: 58,
    policy: {
      insurer: 'National Arogya Insurance Co.',
      product: 'Arogya Suraksha Gold',
      policyNo: 'NA/HC/21/884532',
      inceptionDate: '2021-03-12',
      sumInsured: 500000,
      roomRent: { type: 'percent_si', value: 1 },
      copayPct: 0,
      initialWaitingDays: 30,
      pedWaitingYears: 3,
      specificWaitingYears: 2,
      specificDiseases: ['Cataract', 'Hernia', 'Hydrocele', 'Cholecystitis', 'Knee replacement'],
      exclusions: [
        'Cosmetic or aesthetic surgery',
        'Dental treatment unless accidental',
        'Refractive error correction',
        'Infertility treatment',
      ],
    },
    episode: {
      hospital: 'Sagar Multispeciality Hospital',
      city: 'Pune',
      admissionDate: '2026-09-14',
      dischargeDate: '2026-09-18',
      diagnosis: 'Acute cholecystitis',
      procedure: 'Laparoscopic cholecystectomy',
      accidentRelated: false,
      roomCategory: 'Deluxe single AC',
      roomRentPerDay: 8000,
      roomDays: 4,
      billLines: [
        { head: 'Room & nursing charges', amount: 32000, roomLinked: false, isRoomRent: true },
        { head: 'Surgeon & consultant fees', amount: 85000, roomLinked: true },
        { head: 'Operation theatre charges', amount: 60000, roomLinked: true },
        { head: 'Anaesthesia charges', amount: 25000, roomLinked: true },
        { head: 'Medicines & pharmacy', amount: 28500, roomLinked: false },
        { head: 'Consumables (gloves, syringes, PPE)', amount: 9500, roomLinked: false, nonPayable: true },
        { head: 'Investigations & imaging', amount: 42000, roomLinked: false },
        { head: 'Laparoscopic equipment & sundries', amount: 68000, roomLinked: false },
        { head: 'Other services', amount: 70000, roomLinked: false },
      ],
      totalBill: 420000,
    },
    providedDocIds: ['claim-form', 'discharge-summary', 'final-bill', 'prescriptions', 'policy-copy', 'kyc'],
  },
  {
    id: 'meera-kulkarni',
    claimant: 'Meera Kulkarni',
    patientAge: 34,
    policy: {
      insurer: 'Bharat Swasthya Assurance',
      product: 'Swasthya Shield Plus',
      policyNo: 'BS/22/1109876',
      inceptionDate: '2022-06-01',
      sumInsured: 1000000,
      roomRent: { type: 'no_limit' },
      copayPct: 0,
      initialWaitingDays: 30,
      pedWaitingYears: 3,
      specificWaitingYears: 2,
      specificDiseases: ['Cataract', 'Hernia', 'Knee replacement'],
      exclusions: [
        'Cosmetic or aesthetic surgery',
        'Dental treatment unless accidental',
        'Refractive error correction',
      ],
    },
    episode: {
      hospital: 'Deenanath City Hospital',
      city: 'Bengaluru',
      admissionDate: '2026-08-02',
      dischargeDate: '2026-08-05',
      diagnosis: 'Acute appendicitis',
      procedure: 'Emergency appendectomy',
      accidentRelated: false,
      roomCategory: 'Single AC',
      roomRentPerDay: 6500,
      roomDays: 3,
      billLines: [
        { head: 'Room & nursing charges', amount: 19500, roomLinked: false, isRoomRent: true },
        { head: 'Surgeon & consultant fees', amount: 45000, roomLinked: true },
        { head: 'Operation theatre charges', amount: 30000, roomLinked: true },
        { head: 'Anaesthesia charges', amount: 12000, roomLinked: true },
        { head: 'Medicines & pharmacy', amount: 21000, roomLinked: false },
        { head: 'Consumables (gloves, dressings)', amount: 4500, roomLinked: false, nonPayable: true },
        { head: 'Investigations & imaging', amount: 23000, roomLinked: false },
        { head: 'Other services', amount: 30000, roomLinked: false },
      ],
      totalBill: 185000,
    },
    providedDocIds: [
      'claim-form',
      'discharge-summary',
      'final-bill',
      'investigations',
      'prescriptions',
      'pharmacy',
      'policy-copy',
      'kyc',
      'neft',
    ],
  },
  {
    id: 'arvind-rao',
    claimant: 'Arvind Rao',
    patientAge: 61,
    policy: {
      insurer: 'National Arogya Insurance Co.',
      product: 'Senior Citizen Suraksha',
      policyNo: 'NA/SC/19/223411',
      inceptionDate: '2019-01-20',
      sumInsured: 700000,
      roomRent: { type: 'percent_si', value: 1 },
      copayPct: 20,
      initialWaitingDays: 30,
      pedWaitingYears: 3,
      specificWaitingYears: 2,
      specificDiseases: ['Cataract', 'Hernia', 'Hydrocele', 'Joint replacement'],
      exclusions: [
        'Cosmetic or aesthetic surgery',
        'Dental treatment unless accidental',
        'Domiciliary treatment',
      ],
    },
    episode: {
      hospital: 'Mercy General Hospital',
      city: 'Mysuru',
      admissionDate: '2026-09-20',
      dischargeDate: '2026-09-26',
      diagnosis: 'Fracture of neck of femur (right) after accidental fall',
      procedure: 'Open reduction and internal fixation (DHS)',
      accidentRelated: true,
      roomCategory: 'Single non-AC',
      roomRentPerDay: 6000,
      roomDays: 6,
      billLines: [
        { head: 'Room & nursing charges', amount: 36000, roomLinked: false, isRoomRent: true },
        { head: 'Surgeon & consultant fees', amount: 90000, roomLinked: true },
        { head: 'Operation theatre charges', amount: 40000, roomLinked: true },
        { head: 'Anaesthesia charges', amount: 18000, roomLinked: true },
        { head: 'Implant — DHS plate & screws', amount: 78000, roomLinked: false },
        { head: 'Medicines & pharmacy', amount: 22000, roomLinked: false },
        { head: 'Consumables (gloves, syringes)', amount: 8000, roomLinked: false, nonPayable: true },
        { head: 'Investigations & imaging', amount: 28000, roomLinked: false },
        { head: 'Other services', amount: 40000, roomLinked: false },
      ],
      totalBill: 360000,
    },
    providedDocIds: [
      'claim-form',
      'discharge-summary',
      'final-bill',
      'investigations',
      'prescriptions',
      'pharmacy',
      'policy-copy',
      'kyc',
      'neft',
      'fir',
      'implant',
    ],
    rejectionLetter: `Dear Sir/Madam,

We acknowledge receipt of your claim under Policy No. NA/SC/19/223411 for hospitalisation at Mercy General Hospital, Mysuru from 20-Sep-2026 to 26-Sep-2026.

Upon review of the submitted records, it is observed that the insured has a history of hypertension which was not disclosed at the time of submitting the proposal form. This constitutes material non-disclosure of a pre-existing disease under the terms and conditions of the policy.

In view of the above, we regret to inform you that your claim amounting to Rs. 3,60,000/- stands repudiated and the policy is liable to be treated as void ab initio.

This decision is final and binding.

Yours faithfully,
Claims Department
National Arogya Insurance Co.`,
  },
]

export const CASE_LABELS: Record<string, string> = {
  'ramesh-iyer': 'Room-rent trap',
  'meera-kulkarni': 'Clean claim',
  'arvind-rao': 'Rejected — PED ground',
}
