# Phase 06 — Production Backend (stretch, post-deadline)

Fixes: AUD-18
Target: after the 18 Oct submission — do not start before Phase 07 ships.

## Objective

Replace the demo-grade seams with production-grade ones, in small independent
steps that each keep the app fully working. The demo path (managed proxy key,
sample cases, no login) must keep working throughout — judges and users land
on the same URL.

## Step 6.1 — Vertex AI instead of an API key

- Move Gemini calls from the Developer API (key in proxy URL) to **Vertex AI**
  with the Cloud Run service account (Application Default Credentials). No key
  material anywhere; IAM controls access; per-request audit in Cloud Logging.
- Shape: a tiny Cloud Run sidecar service (`/api/gemini/generate` re-implemented
  in Node/Express or Hono using `@google-cloud/vertexai`), with nginx
  proxying to it instead of Google. The SPA and CSP do not change.
- Acceptance: no `GEMINI_API_KEY` secret in use; `gcloud secrets` entry
  retired; same request/response contract as today.

## Step 6.2 — OCR for scanned documents

- Today `pdf.ts` extracts the text layer; a photographed/scanned bill yields
  nothing. Detect empty text layer → upload to a backend endpoint → **Cloud
  Document AI** OCR → feed the text into the existing extraction schema.
- Acceptance: a phone-photo hospital bill (sample fixture) produces the same
  structured extraction as a digital PDF; the UI shows an "image-based
  document, verifying quality" state.

## Step 6.3 — Edge protection

- **Cloud Armor** policy in front of Cloud Run: rate limiting (replaces the
  nginx `limit_req` interim), basic WAF rules. Budget alerts on the GCP
  project (₹/month cap with 50/90/100% notifications); Cloud Monitoring alert
  on 5xx rate and on Gemini token consumption spikes.

## Step 6.4 — Optional persistence (evaluate before building)

- Only if real users ask for it: Firestore case history keyed to an anonymous
  session or Kimi-style sign-in; uploaded documents to Cloud Storage with a
  30-day lifecycle rule; a visible "data is stored" consent toggle defaulting
  to off. The privacy posture ("documents never leave your browser") is a
  feature of the demo — persistence must not silently weaken it.

## Acceptance criteria

- Each step lands behind the same URL with zero downtime and the sample-case
  tests still green.
- README architecture diagram updated per step (Phase 07 owns the first
  version of that diagram).

## Kickoff prompt for Kimi Code

```
Read plan/README.md, plan/research-notes.md (platform notes section) and this
phase file. Execute Phase 06 step-by-step (6.1 → 6.4), one deployable commit
per step, keeping the managed-proxy demo path working at every step. Do not
start 6.4 without explicit confirmation.
```
