# N1 — Room-rent trap: deluxe room at 2.2× sub-limit + two mandatory documents missing

**Ground truth for the engine.** Upload every file in this folder *except* this one.

| Field | Value |
|---|---|
| Claimant | Vikram Sethi (45), Gurugram |
| Insurer (fictional) | Zenith Health Assurance Ltd. — Zenith Health Secure (Individual) |
| Policy | ZH/23/7788990 · inception 15-11-2023 · SI ₹5,00,000 |
| Room rent | 1% of SI/day = **₹5,000/day** |
| Co-pay | 0% |
| Episode | Symptomatic cholelithiasis with recurrent biliary colic → laparoscopic cholecystectomy |
| Hospital (fictional) | Crest Institute of Laparoscopic Surgery, Gurugram |
| Admission → discharge | 08-09-2026 → 15-09-2026 (7 days, incl. 1 ICU day) |
| Total bill | ₹3,97,100 |

## Documents provided (mapped to engine doc ids)

`claim-form` · `discharge-summary` · `final-bill` · `prescriptions` · `policy-copy` · `kyc`

**Missing:** `investigations` (mandatory), `neft` (mandatory), `pharmacy` (optional).

## Expected verdict

- **Readiness score: 57 (fair).**
  Missing 2 mandatory docs (−24) + 1 optional (−4) + room-rent breach (−15).
- **Room-rent trap:** billed ₹11,000/day vs allowed ₹5,000/day → ratio 5/11 ≈ 0.4545.
  - Room cut: 77,000 × (1 − 5/11) = **₹42,000**
  - Proportional cut on room-linked charges (surgeon 92,000 + OT 55,000 + anaesthesia
    22,000 = 1,69,000) × 6/11 ≈ **₹92,182**
  - **ICU day (₹18,000) must be exempt** from the proportional cut — engine `ICU_PATTERN`.
- **Waterfall:** 3,97,100 − 42,000 − 92,182 − 12,400 (non-payables) = **≈ ₹2,50,518**.
- Non-payables are 3.1% of the bill → **below the 4% threshold**, so no separate
  consumables flag (they are still deducted).

## Edge cases this fixture exercises

1. The flagship room-rent trap: room cut + proportional cut, priced to the rupee.
2. **ICU exemption** inside a breached-stay bill — the ratio must not touch the ICU line.
3. Diagnosis is *cholelithiasis*, while the specific-disease list has *Cholecystitis* —
   a near-miss that must **not** trip the specific-disease waiting period
   (`includes()` matching is exact-substring on the listed name).
4. Two mandatory documents missing → the *most common reversible rejection class*:
   deficiency. The grievance path (one consolidated deficiency call) applies.
5. Optional-doc penalty (pharmacy bills) is smaller than mandatory-doc penalty —
   engine weights 4 vs 12.
