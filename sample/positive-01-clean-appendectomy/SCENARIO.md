# P1 — Clean claim: emergency appendectomy (young adult, no sub-limit policy)

**Ground truth for the engine.** Upload every file in this folder *except* this one.

| Field | Value |
|---|---|
| Claimant | Ananya Deshpande (29), Bengaluru |
| Insurer (fictional) | Bharat Swasthya Assurance Ltd. — Swasthya Shield Plus |
| Policy | BS/24/3390125 · inception 2023-07-10 · SI ₹5,00,000 |
| Room rent | No limit (any category up to single AC) |
| Co-pay | 0% |
| Episode | Acute appendicitis → emergency laparoscopic appendectomy |
| Hospital (fictional) | Kaveri Nursing Home & Multispeciality Centre, Bengaluru |
| Admission → discharge | 2026-08-19 → 2026-08-22 (3 days) |
| Total bill | ₹1,43,550 |

## Documents provided (mapped to engine doc ids)

`claim-form` (Part A + Part B) · `discharge-summary` · `final-bill` · `investigations` ·
`prescriptions` · `pharmacy` · `policy-copy` · `kyc` · `neft`

→ **All mandatory documents on file.** Nothing missing from the checklist.

## Expected verdict

- **Readiness score: 100 (strong).** No deductions to score except nothing —
  room rent is uncapped, all waiting periods served (policy 3.1 years old,
  appendicitis not on the specific-disease list), no co-pay, no PED.
- **Flags:** none with financial impact above threshold. Non-payable consumables
  ₹3,200 = 2.2% of bill → below the 4% flag threshold, so even that stays silent
  (it is still deducted in the waterfall).
- **Expected settlement waterfall:** 1,43,550 − 3,200 (non-payables) = **₹1,40,350**.

## Edge cases this fixture exercises

1. `no_limit` room rent → `allowedRoomRent()` returns null → no room analysis at all.
2. Non-payable consumables **under** the 4%-of-bill threshold → no `non_payable` flag.
3. Accident-related = false → FIR not required; checklist must not demand it.
4. Admission on day ~1,135 of the policy → initial 30-day wait trivially served.
5. Pharmacy bills present and mapped to prescriptions (the optional-doc boxes all ticked).
