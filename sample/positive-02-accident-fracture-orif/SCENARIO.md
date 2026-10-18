# P2 — Clean claim: accidental femur fracture with ORIF (senior citizen, co-pay policy)

**Ground truth for the engine.** Upload every file in this folder *except* this one.

| Field | Value |
|---|---|
| Claimant | Suresh Menon (67), Bengaluru |
| Insurer (fictional) | National Arogya Insurance Co. — Senior Citizen Suraksha |
| Policy | NA/SC/21/556677 · inception 05-04-2021 · SI ₹7,00,000 |
| Room rent | 1% of SI/day = **₹7,000/day** |
| Co-pay | **20%** (senior-citizen plan) |
| PED declared | Hypertension (declared at proposal; waiting period long served) |
| Episode | Fall from two-wheeler → fracture shaft of right femur → ORIF with PFN |
| Hospital (fictional) | Kaveri Nursing Home & Multispeciality Centre, Bengaluru |
| Admission → discharge | 27-09-2026 → 03-10-2026 (6 days) |
| Total bill | ₹3,02,200 |

## Documents provided (mapped to engine doc ids)

`claim-form` (Part A + Part B) · `discharge-summary` · `final-bill` · `investigations` ·
`prescriptions` · `pharmacy` · `policy-copy` · `kyc` · `neft` · `fir` (MLC + FIR, accident) ·
`implant` (sticker + invoice)

→ **All mandatory documents on file, including the accident-only FIR/MLC.** This is the
scenario that proves the checklist's `accidentOnly` branch works: FIR is demanded because
`accidentRelated=true`, and it is present.

## Expected verdict

- **Readiness score: 95 (strong).** The only score deduction is the contractual 20%
  co-pay flag (−5).
- **Room rent:** billed ₹5,800/day ≤ ₹7,000/day allowed → **no room-rent analysis, no
  proportional cut.** The surgeon/OT/anaesthesia lines are payable in full.
- **Waiting periods:** all served (5.5 years in; fracture is not on the specific-disease
  list; the declared PED — hypertension — is unrelated to this accident claim).
- **Non-payable consumables:** ₹7,900 = 2.6% of bill → below the 4% flag threshold
  (deducted in the waterfall, no flag).
- **Expected settlement waterfall:** 3,02,200 − 7,900 (non-payables) = 2,94,300
  admissible; 20% co-pay − 58,860 → **₹2,35,440**.

## Edge cases this fixture exercises

1. Accident claim → FIR/MLC becomes *mandatory* and is present (no deficiency).
2. `percent_si` room rent where the actual room is **within** the sub-limit → engine must
   return null from `roomRentAnalysis` and not invent a trap.
3. Co-pay applied **after** the non-payable deduction (order of operations in
   `estimatePayable`), not on the gross bill.
4. Implant invoice on file — the `implant` optional doc satisfied.
5. Senior-citizen plan with a declared, served PED — the PED must *not* be conflated with
   the accidental injury.
