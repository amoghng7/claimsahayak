# N3 — Permanent exclusion: septorhinoplasty billed to a policy with a cosmetic-surgery exclusion

**Ground truth for the engine.** Upload every file in this folder *except* this one.
(For the full pipeline, upload all documents AND paste the repudiation letter into the
rejection desk.)

| Field | Value |
|---|---|
| Claimant | Rohan Kapoor (38), New Delhi — advertising professional |
| Insurer (fictional) | Bharat Swasthya Assurance Ltd. — Swasthya Shield Plus |
| Policy | BS/23/4455667 · inception 14-02-2023 · SI ₹3,00,000 |
| Room rent | No limit |
| Co-pay | 0% |
| Episode | Deviated nasal septum with dorsal hump → **septorhinoplasty** (functional + cosmetic) |
| Hospital (fictional) | Nakshatra ENT & Cosmetic Surgery Centre, New Delhi |
| Admission → discharge | 30-09-2026 → 02-10-2026 (2 days) |
| Total bill | ₹2,04,000 |

## Documents provided (mapped to engine doc ids)

`claim-form` · `discharge-summary` · `final-bill` · `investigations` · `prescriptions` ·
`policy-copy` · `kyc` · `neft` · **repudiation letter** (insurer, dated 09-10-2026)

→ **Every checklist document is on file** — this is the scenario where the claim fails on
*merits*, not on paperwork. That is the point: a perfect file can still lose.

## Expected verdict

- **Readiness score: high on paper** (all documents present; room rent uncapped;
  waiting periods served). **But the exclusion flag fires at high severity:** the
  procedure wording "septorhinoplasty" matches the exclusion keyword `rhinoplasty` /
  `cosmetic` — the engine reports the exclusion as printed, without adjudicating intent.
- Note the known engine limit this fixture documents: the exclusion check matches
  keywords, so the *functional* part of a combined procedure is not auto-split. The
  counter-strategy below is exactly what the rejection desk's `exclusion` pattern says.
- **Rejection desk (paste the repudiation letter):** pattern `exclusion` —
  "Policy exclusion invoked", reversible: **partial**. Expected steps: demand the
  exclusion clause quoted verbatim; obtain a treating-doctor note separating the
  functional (septoplasty) component from the cosmetic (rhinoplasty) component;
  recover the functional component's cost share.

## Edge cases this fixture exercises

1. Exclusion keyword match against **procedure** wording (not just diagnosis).
2. A completely documented claim that still fails — score and merits diverge, which
   is the pedagogical point of the whole app.
3. Rejection-letter regex path → `exclusion` pattern (no Gemini fallback needed).
4. Realistic partial-win strategy: functional-vs-cosmetic split of a combined
   procedure — a common Ombudsman outcome.
5. Small-ticket but high-signal claim (₹2.04 lakh) where the letter-and-escalation
   path costs matter to the user.
