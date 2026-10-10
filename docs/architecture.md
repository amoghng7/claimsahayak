# ClaimSahayak — Architecture

One diagram, two trust boundaries. Everything left of the engine boundary is
deterministic TypeScript; the only AI in the system reads documents, it never
computes a rupee.

```mermaid
flowchart LR
    subgraph browser["Browser (client-side SPA — React 19 + Vite)"]
        UI["Workbench UI\n(three-column claims desk)"]
        PDF["pdf.js text-layer extraction\n(local — documents never leave the browser)"]
        ENGINE["Rules engine — src/engine/rules.ts\nDETERMINISTIC: score, room-rent math,\nwaterfall, rejection classifier\nNO AI"]
        HINDI["Hindi summary +\ngrievance drafter\n(templates)"]
        UI --> PDF
        PDF -->|"raw text (≤30k chars)"| UI
        UI --> ENGINE
        ENGINE --> HINDI --> UI
    end

    subgraph cloudrun["Cloud Run — asia-south1 (single container, two processes)"]
        NGINX["nginx\nSPA static + security headers/CSP\nPOST-only proxies /api/gemini/generate, /api/ocr\nrate limit 20 req/min/IP"]
        SIDECAR["Node sidecar — server/\nVertex AI + Document AI via ADC\n(service account) — no API key material"]
        NGINX -->|"127.0.0.1:8081"| SIDECAR
    end

    subgraph google["Google Cloud"]
        VERTEX["Vertex AI — Gemini\ngemini-3.8-flash, global endpoint, JSON mode\nextraction ONLY — temperature 0,\nzod-validated response schema"]
        DOCAI["Document AI — OCR processor\n(us multi-region)\nscanned/photographed bills only"]
        LOGS["Cloud Logging\nper-request audit (IAM-governed)"]
    end

    subgraph ci["Deploy pipeline (GitHub Actions)"]
        WIF["Workload Identity Federation\n(no JSON keys)"]
        AR["Artifact Registry\n(docker image)"]
        IAM["IAM: runtime SA\nroles/aiplatform.user"]
        WIF --> AR
    end

    UI -->|"POST /api/gemini/generate\n(same-origin, no key in browser)"| NGINX
    PDF -.->|"scanned/photo only:\nPOST /api/ocr"| NGINX
    SIDECAR -->|"ADC access token"| VERTEX
    SIDECAR -->|"ADC access token"| DOCAI
    DOCAI -->|"OCR text"| SIDECAR
    VERTEX -->|"structured JSON facts"| SIDECAR --> NGINX --> UI
    SIDECAR -.-> LOGS
    UI -.->|"engine recomputes score,\nwaterfall, verdict from facts"| ENGINE
    IAM -.->|"granted by infra/06-1-vertex.sh"| SIDECAR
    AR -.->|deploy| cloudrun

    style ENGINE stroke-width:3px
```

## Trust boundaries

1. **Engine boundary (in the browser).** `src/engine/` has no React imports and no
   network calls. Gemini's output is validated with zod and reduced to typed facts
   (`Policy`, `HospitalEpisode`, `BillLine`); every score, deduction and payout is
   recomputed from those facts by deterministic code covered by vitest.
2. **Key boundary (removed).** Phase 06 step 6.1 eliminated the managed API key: the
   sidecar authenticates to Vertex AI with the Cloud Run service account (Application
   Default Credentials), so there is no key material in the container, the image, or the
   client — access is IAM-governed and audited in Cloud Logging. A user-supplied key
   (Settings → API key) remains as the deliberate demo override and stays in that
   browser's localStorage.

## Request flow (upload path)

1. Browser extracts PDF text locally with pdf.js. If the text layer is empty (scan) or
   the file is a photo, the browser POSTs it to same-origin `/api/ocr`; the sidecar runs
   Cloud Document AI OCR and returns text, which then follows the same extraction path.
2. Browser POSTs the extraction prompt to the same-origin `/api/gemini/generate`.
3. nginx rate-limits, caps body size, and forwards to the sidecar (127.0.0.1:8081),
   which calls Vertex AI with an ADC token.
4. Gemini returns schema-constrained JSON; the browser validates it with zod (one
   retry with validation errors appended), then maps it to a `CaseFile`.
5. The rules engine computes score, flags, waterfall, rejection class, grievance
   letter and Hindi summary — all in `useMemo`, all reproducible.

## State

Stateless. No accounts, no database, no server-side sessions; nothing persists beyond
the user's own localStorage (API-key override, UI prefs). Persistence, if ever added,
is Phase 06 step 6.4 and must be consent-gated.
