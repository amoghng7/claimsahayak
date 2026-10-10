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

    subgraph cloudrun["Cloud Run — asia-south1 (single container)"]
        NGINX["nginx\nSPA static + security headers/CSP\nPOST-only proxy /api/gemini/generate\nrate limit 20 req/min/IP, 4 MB cap"]
    end

    subgraph google["Google APIs"]
        GEMINI["Gemini Developer API\ngemini-3.8-flash, JSON mode\nextraction ONLY — temperature 0,\nzod-validated response schema"]
    end

    subgraph ci["Deploy pipeline (GitHub Actions)"]
        WIF["Workload Identity Federation\n(no JSON keys)"]
        AR["Artifact Registry\n(docker image)"]
        SM["Secret Manager\ngemini-api-key"]
        WIF --> AR
    end

    UI -->|"POST /api/gemini/generate\n(same-origin, no key in browser)"| NGINX
    NGINX -->|"key injected from env\n(never in client, never in logs)"| GEMINI
    GEMINI -->|"structured JSON facts"| NGINX --> UI
    UI -.->|"engine recomputes score,\nwaterfall, verdict from facts"| ENGINE
    SM -.->|"env at deploy"| NGINX
    AR -.->|deploy| cloudrun

    style ENGINE stroke-width:3px
```

## Trust boundaries

1. **Engine boundary (in the browser).** `src/engine/` has no React imports and no
   network calls. Gemini's output is validated with zod and reduced to typed facts
   (`Policy`, `HospitalEpisode`, `BillLine`); every score, deduction and payout is
   recomputed from those facts by deterministic code covered by vitest.
2. **Key boundary (in the container).** The managed Gemini key exists only as a
   Secret Manager secret injected into nginx's environment at deploy time. It appears
   in exactly one place — the `proxy_pass` directive — so it is never sent to the
   browser, never in a URL the user can see, and never in access logs. A user-supplied
   key (Settings → API key) is the deliberate demo override and stays in that browser's
   localStorage.

## Request flow (upload path)

1. Browser extracts PDF text locally with pdf.js (scanned PDFs yield nothing and the
   UI says so — OCR is Phase 06).
2. Browser POSTs the extraction prompt to the same-origin `/api/gemini/generate`.
3. nginx rate-limits, caps body size, and forwards to Gemini with the key injected.
4. Gemini returns schema-constrained JSON; the browser validates it with zod (one
   retry with validation errors appended), then maps it to a `CaseFile`.
5. The rules engine computes score, flags, waterfall, rejection class, grievance
   letter and Hindi summary — all in `useMemo`, all reproducible.

## State

Stateless. No accounts, no database, no server-side sessions; nothing persists beyond
the user's own localStorage (API-key override, UI prefs). Persistence, if ever added,
is Phase 06 step 6.4 and must be consent-gated.
