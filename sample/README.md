# Sample claim scenarios

Five realistic, end-to-end Indian health-insurance claim document sets for testing
ClaimSahayak's ingestion, rules engine, rejection desk and grievance drafter.

> **All people, hospitals, insurers, policy numbers, account numbers and registration
> numbers are fictional.** Any resemblance to real entities is coincidental. Dates are
> consistent with a "today" of **October 2026**.

Each scenario folder contains the actual paperwork a claimant would assemble
(policy schedule, claim form, discharge summary, itemised bill, investigation reports,
prescriptions, pharmacy bills, KYC, NEFT mandate, FIR/MLC, implant invoice) plus a
`SCENARIO.md` that states the *ground truth* — what a correct engine pass should find.
Use these as golden fixtures: extract each folder, compare the verdict against
`SCENARIO.md` → expected outcome.

| # | Folder | Scenario | Expected engine outcome |
|---|--------|----------|--------------------------|
| P1 | `positive-01-clean-appendectomy` | Young adult, emergency appendectomy, no sub-limit, all mandatory docs on file | Score ~100 (strong). Only deduction: non-payable consumables (below the 4% flag threshold). Expected payout ₹1,40,350 of ₹1,43,550 billed. |
| P2 | `positive-02-accident-fracture-orif` | Senior citizen, accidental femur fracture, ORIF with implant; 20% co-pay policy | Score ~95 (strong). Only flag: contractual 20% co-pay. Room rent within 1% sub-limit, FIR + implant sticker on file. Expected payout ₹2,35,440 of ₹3,02,200 billed. |
| N1 | `negative-01-room-rent-trap` | Deluxe room at 2.2× the 1% sub-limit; ICU day correctly exempt; two mandatory docs missing | Score ~57 (fair). Room cut ₹42,000 + proportional cut ~₹92,182 on room-linked charges. Missing: investigation reports, NEFT mandate (+ pharmacy bills, optional). Expected payout ~₹2,50,518 of ₹3,97,100 billed. |
| N2 | `negative-02-waiting-period-breach` | Knee replacement at month ~17 of a 24-month specific-disease wait; claim form Part B and KYC missing | Score ~46 (weak). Specific-disease waiting-period breach (whole expected payout at risk). Two mandatory documents missing. |
| N3 | `negative-03-exclusion-cosmetic-rhinoplasty` | Septorhinoplasty billed to a policy with a cosmetic-surgery exclusion; complete paperwork; insurer repudiation letter included | Exclusion flag fires (procedure matches exclusion keyword). Rejection desk should classify the repudiation letter as `exclusion` → reversible "partial" (functional-vs-cosmetic split is winnable in part). |

## Edge cases deliberately covered

- ICU charges alongside a room-rent breach — ICU must **not** attract the proportional cut (IRDAI convention, engine `ICU_PATTERN`).
- Non-payable consumables **below** the 4%-of-bill flag threshold (P1, P2) vs. present-but-unflagged (N1, N2) — threshold behaviour.
- Senior-citizen co-pay applied **after** all other deductions (P2).
- Accident claim: FIR/MLC mandatory-doc branch, implant invoice (P2).
- Specific-disease waiting list: a diagnosis that merely *resembles* a listed disease ("cholelithiasis" vs listed "Cholecystitis") must **not** trip the wait (N1).
- Optional-document penalty vs mandatory-document penalty (N1: pharmacy bills optional; investigations/NEFT mandatory).
- Exclusion keyword match on the procedure wording (N3).
- Rejection-letter pipeline: repudiation text → regex classification → escalation ladder dates (N3).

## Generated files

Each scenario folder contains the **generated binary files** (what the app actually
ingests), committed to the repo. The Markdown authoring sources are not committed;
`sample/generate-files.mjs` (kept for reference) produced the binaries from them with
`pdfkit` text-layer PDFs and `@napi-rs/canvas` simulated scans
(`npm run generate-samples` — regenerating requires restoring the sources).

### Format mapping

The same rule is applied across every scenario folder. Document type drives the format
— not the file number — so N1/N2's non-standard numbering is handled correctly.

| Document type | Format | Pipeline exercised |
|---|---|---|
| Policy schedule | PDF (text-layer) | `pdf.ts` → pdfjs |
| Claim form (Part A + B) | PDF (text-layer) | `pdf.ts` → pdfjs |
| Discharge summary | JPEG (simulated phone-photo) | `ocr.ts` → Document AI |
| Itemised final bill | PDF (text-layer, multi-page) | `pdf.ts` → pdfjs |
| Investigation / lab reports | PNG (simulated flatbed scan) | `ocr.ts` → Document AI |
| Prescriptions | JPEG (simulated photo) | `ocr.ts` → Document AI |
| Pharmacy bills | JPEG (simulated photo) | `ocr.ts` → Document AI |
| KYC / PAN / Aadhaar | JPEG (simulated photo) | `ocr.ts` → Document AI |
| NEFT mandate / cancelled cheque | PDF (text-layer) | `pdf.ts` → pdfjs |
| FIR / MLC (P2 only) | PDF (text-layer) | `pdf.ts` → pdfjs |
| Implant sticker / invoice (P2 only) | JPEG (simulated photo) | `ocr.ts` → Document AI |
| Repudiation letter (N3 only) | PDF (text-layer) | `pdf.ts` → pdfjs |

JPEG/PNG files include mild grain noise, slight rotation (< 0.5°), and corner vignetting
to realistically simulate handheld camera capture. `SCENARIO.md` is never converted.

## Usage

The app ingests PDFs (text-layer via pdf.js, scans via Document AI). To test with these
fixtures, upload one scenario folder's PDFs and photos through the desk's file picker.
Keep one scenario per case. `SCENARIO.md` is ground truth for the verdict — never
upload it as a claim document.
