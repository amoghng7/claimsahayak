# Research Notes — verified 11 Oct 2026

Every regulatory or platform fact the plan relies on, with sources. Phases that
touch copy or engine constants must match these notes. If a source is updated,
edit this file and the dependent copy in the same commit.

## IRDAI / health-insurance regulations

### Moratorium period — 5 years (was 8)

After **five continuous years** of coverage an insurer cannot reject a health
claim or void a policy on grounds of non-disclosure or misrepresentation — only
proven fraud survives. Reduced from 8 years by the **IRDAI Master Circular on
Health Insurance Business, Ref. IRDAI/HLT/CIR/PRO/84/5/2024, dated 29 May
2024**. Continuity is preserved across portability/migration; for sum-insured
enhancements, a fresh five-year clock applies only to the enhanced portion.
Sources:
- https://www.actuariesindia.org/sites/default/files/inline-files/5.%20Master%20Circular%20on%20Health%20Insurance%20Business%202024.pdf
- https://www.indusindinsurance.com/health-insurance/moratorium-period-in-health-insurance
- https://nyvo.in/health-insurance/moratorium-period

App impact: `analyzeRejection` moratorium logic (already 5 years — correct);
disclaimer and explainer copy.

### PED waiting period — capped at 36 months (was 48)

Pre-existing-disease waiting periods are capped at **36 months** of continuous
coverage under the **IRDAI (Insurance Products) Regulations, 2024** (effective
1 April 2024). On sum-insured enhancement the wait applies afresh only to the
enhanced amount. Sources:
- https://nyvo.in/health-insurance/moratorium-period (cites both instruments)
- https://www.royalsundaram.in/assets/Websiteupdate-Healthregulations.pdf

App impact: Phase 03 PED scoring — default `pedWaitMonths = 36`; never allow an
extracted policy value above 36 without flagging it as non-compliant.

### Free-look period — 30 days (was 15)

**30 days from receipt of the policy document**, per the 29 May 2024 Master
Circular. The app's current copy says 15 — **this is a factual error fixed in
Phase 01**. Sources:
- https://www.actuariesindia.org/sites/default/files/inline-files/5.%20Master%20Circular%20on%20Health%20Insurance%20Business%202024.pdf (para 5)
- https://apacnewsnetwork.com/2024/05/irdai-mandates-30-day-free-look-period-and-3-hour-hospital-discharge-policy-in-new-master-circular-on-health-insurance-business/

### Grievance redressal — insurer TAT is 14 days

Per the **Master Circular on Protection of Policyholders' Interests, 2024**
(PPI): acknowledge immediately; **resolve and communicate the decision within
14 days**; if unresolved, the insurer must itself tell the policyholder about
the Ombudsman option within 14 days of the original complaint. The policyholder
may approach the Ombudsman if the complaint is not resolved within 30 days.
The app's current "15-day TAT" copy is stale — **fixed in Phase 01**. Source:
- https://www.caalley.com/irdai_mc/MC_Protection_of_Policyholders_interests_2024.pdf (Citizens' Charter, service standards table)

### Escalation channels

- Bima Bharosa portal: https://bimabharosa.irdai.gov.in
- Email: complaints@irdai.gov.in — Toll-free: 155255
- Source: https://www.pazcare.com/blog/how-does-the-irdai-grievance-process-work-for-group-health-insurance

### Insurance Ombudsman

- Compensation ceiling **₹50 lakh** including expenses, raised from ₹30 lakh by
  **G.S.R. 828(E), 9 November 2023** (amending the Insurance Ombudsman Rules,
  2017). Sources:
  - https://www.business-standard.com/finance/personal-finance/good-news-you-can-now-register-compensation-claim-complaints-of-rs-50-lakh-123112700222_1.html
  - https://www.cioins.co.in/notification/Insurance%20Ombudsman%20Rules,%202017(%20as%20amended%20till%2009.11.2023).pdf
- Award capped additionally at the actual direct loss suffered.
- Insurer must comply with an award **within 30 days**; per the 2024 PPI Master
  Circular, delay attracts a **₹5,000 per day penalty** payable to the
  complainant, in addition to penal interest under the 2017 Rules.
- Filing window: **within one year** of the insurer's rejection (or of one month
  passing without a reply); delay is condonable with reasons (Rule 14(4)).
  Source: https://www.cioins.co.in/Faqs
- No fee; no lawyer needed; hearings can be by video conference (Rule 15(5)).
- Rule 14(5): a matter pending before a court/consumer forum/arbitrator cannot
  simultaneously go to the Ombudsman.
- Source for Rule 14 conditions: https://blog.ipleaders.in/insurance-ombudsman-complaint-procedure-and-awards/

### Claims service TATs (PPI Master Circular 2024)

Cashless authorisation decision within **1 hour** of request; final discharge
authorisation within **3 hours**; reimbursement claim settlement within **15
days** of document submission. Source: Citizens' Charter table in the PPI
Master Circular (link above); also
https://apacnewsnetwork.com/2024/05/irdai-mandates-30-day-free-look-period-and-3-hour-hospital-discharge-policy-in-new-master-circular-on-health-insurance-business/

### Grace periods

15 days (monthly premium mode) / 30 days (quarterly, half-yearly, annual).
Coverage continues during grace; credits (waiting periods, moratorium, NCB) are
protected if renewed within grace. Source: 29 May 2024 Master Circular, para 8–9.

## Platform / technical notes

### Gemini Developer API — structured output

The API supports enforced JSON via `generationConfig.responseMimeType =
"application/json"` plus `generationConfig.responseSchema` (an OpenAPI-3-subset
schema). Phase 01 adds this so malformed model output is rejected at the API
level rather than parsed loosely. Keep `temperature: 0` for extraction.

### Production path (Phase 06)

- **Vertex AI Gemini** (same model family) uses Application Default Credentials
  — no API key in the proxy at all; IAM-scoped. This removes the key-leak and
  key-rotation class of problems.
- **Cloud Document AI** (OCR + form parsers) handles scanned PDFs where
  pdfjs-dist finds no text layer. Detect empty text layer client-side, route to
  the backend OCR path, then feed the OCR text into the same extraction schema.
- **Cloud Armor** in front of Cloud Run gives rate limiting at the edge; until
  then, nginx `limit_req` (Phase 02) is the interim control.
