# N2 — Waiting-period breach: knee replacement at month 17 of a 24-month wait

**Ground truth for the engine.** Upload every file in this folder *except* this one.

| Field | Value |
|---|---|
| Claimant | Kavita Joshi (52), Nagpur — homemaker, on husband's floater as member |
| Insurer (fictional) | Trishul General Insurance Ltd. — Family Secure Floater Gold |
| Policy | TF/25/1029384 · inception 20-04-2025 · SI ₹10,00,000 (floater) |
| Room rent | 1% of SI/day = **₹10,000/day** |
| Co-pay | 0% |
| Episode | Severe primary osteoarthritis of right knee — admitted for **total knee replacement** |
| Hospital (fictional) | Sanjeevani Institute of Orthopaedics & Joint Replacement, Nagpur |
| Admission → discharge | 05-10-2026 → 12-10-2026 (7 days) |
| Total bill | ₹5,75,800 |

## Documents provided (mapped to engine doc ids)

`discharge-summary` · `final-bill` · `investigations` · `prescriptions` · `pharmacy` ·
`neft` · `policy-copy` (in family papers)

**Missing:** `claim-form` (Part B not yet returned by the hospital desk), `kyc`
(claimant PAN copy misplaced — re-issue requested; claim is above ₹1 lakh, so this is
mandatory under CKYC norms).

## Expected verdict

- **Readiness score: 46 (weak).**
  2 mandatory docs missing (−24) + specific-disease waiting breach (−30).
- **Waiting breach:** policy is ~1.46 years old at admission; "Knee replacement"
  carries a 24-month specific-disease wait in this schedule. The whole expected payout
  is flagged as at risk.
- **Timing nuance worth teaching:** the wait completes ~20-04-2027. If the surgery
  could safely be deferred past that date the claim clears this clause — the engine
  renders only a hard breach here (it is >3 months away).
- Room rent ₹9,500/day ≤ ₹10,000/day → no room trap (the fixture deliberately keeps
  the room clean so the score collapse is attributable to the wait + docs alone).

## Edge cases this fixture exercises

1. Specific-disease waiting list matched against the **diagnosis wording**
   ("admitted for total knee replacement") — not the procedure field.
2. Young policy (2nd year) with an elective procedure — the classic "took the policy
   and scheduled surgery too early" pattern.
3. Claim-form deficiency where **Part A exists but Part B (hospital) is pending** —
   the engine counts the whole `claim-form` doc id missing.
4. KYC mandatory threshold: claim ₹5.76 lakh > ₹1 lakh → `kyc` mandatory.
5. Floater policy claimed by a member other than the proposer — claimant ≠ proposer
   (kyc hole is realistic here).
6. Non-payable consumables at 2.6% — below threshold, silently deducted.
