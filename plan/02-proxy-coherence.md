# Phase 02 — Proxy Coherence

Fixes: AUD-04, AUD-05, AUD-06, AUD-07
Target: 12–13 Oct

## Objective

One Gemini access story that behaves identically in `npm run dev`, in the local
Docker container, and on Cloud Run — plus honest key-state UX and basic abuse
protection on the public proxy endpoint.

## Current failure modes (verify before changing)

1. `npm run dev` → upload a policy PDF without setting a key → POST to
   `/api/gemini/generate` → vite dev server returns `index.html` (SPA
   fallback) → "Unexpected token <" JSON parse error.
2. Production → Settings → paste a personal key → extraction fails because CSP
   `connect-src 'self'` blocks `generativelanguage.googleapis.com`.
3. Settings input shows the literal text `PROXY`; saving writes "PROXY" into
   localStorage as if it were a key.
4. `curl` the live `/api/gemini/generate` endpoint in a loop — it proxies
   unthrottled, spending the project's Gemini quota.

## Tasks

### 2.1 Dev parity for the proxy (AUD-04)

- [x] In `vite.config.ts`, add a `configureServer` middleware for
      `/api/gemini/generate` that mirrors the nginx behaviour: read
      `GEMINI_API_KEY` via `loadEnv`, forward the request body to
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=…`,
      stream the JSON response back. ~40 lines, no new dependencies (use
      global `fetch`).
- [x] If `GEMINI_API_KEY` is absent in dev, return HTTP 428 with a JSON body
      `{ "error": "no_dev_key" }` and have the app surface: "No managed key in
      local dev — add GEMINI_API_KEY to .env or paste your own key in
      Settings."
- [x] `.env.example`: document `GEMINI_API_KEY` for local dev parity.

### 2.2 CSP vs BYOK (AUD-05)

Decide explicitly and implement one:

- **Chosen:** keep BYOK as a deliberate feature. Extend the nginx CSP to
  `connect-src 'self' https://generativelanguage.googleapis.com` — still no
  wildcards, still a single fixed external host.
- [x] Update `nginx.conf.template` CSP accordingly, with a comment explaining
      why that one host is allowed.
- [x] In BYOK mode the browser talks to Google directly — add a one-line note
      in Settings copy: "With your own key, requests go straight from your
      browser to Google."

### 2.3 Honest key-state UX (AUD-06)

- [x] `loadGeminiKey()` keeps the `'PROXY'` sentinel, but the UI never shows
      it as a key. Header indicator becomes three-state: **Managed key** /
      **Your key** / **No key** (the last only when the dev 428 fired).
- [x] SettingsSheet: never pre-fill the input with `PROXY`. Empty input +
      placeholder "Leave blank to use the managed key". When a personal key
      is stored, show a masked hint (`••••abcd`) and a "Remove my key" button
      that clears localStorage.
- [x] Saving a blank input clears the override (never stores an empty or
      sentinel string).

### 2.4 Proxy hardening (AUD-07)

In `nginx.conf.template`:

- [x] `limit_req_zone $binary_remote_addr zone=gemini:1m rate=20r/m;` at http
      level; `limit_req zone=gemini burst=10 nodelay;` inside the
      `/api/gemini/generate` location. Return 429 with a JSON body.
- [x] `client_max_body_size 4m;` scoped to that location (PDF text payloads
      are small; 4 MB is generous headroom).
- [x] `proxy_read_timeout 60s;` and map upstream 5xx/timeout to a JSON 502.
- [x] Do not log request bodies; ensure the access log line for this location
      cannot include the upstream query string (the key lives in proxy_pass,
      never in the incoming URI — keep it that way).
- [x] App side: map 429 → "Too many requests — wait a minute and retry." and
      502 → "The analysis service is unavailable right now." in the upload
      error UI.
- [x] README: document the rate limit and the secret-rotation procedure
      (`gcloud secrets versions add gemini-api-key --data-file=-`).

## Acceptance criteria

- `npm run dev` with `GEMINI_API_KEY` set: full upload flow works through the
  dev middleware (check the network tab — request goes to the local origin).
- `npm run dev` without the key and without BYOK: the friendly 428 message, no
  raw parse errors.
- `docker build` + `docker run -e GEMINI_API_KEY=… -p 8080:8080`: flow works;
  21 rapid requests to the proxy trigger a 429.
- On Cloud Run: BYOK override works (CSP allows it); managed path still works.
- Settings never displays or stores the string `PROXY`.
- `npm run test` still green; add a vitest spec for the key-state helpers.

## Kickoff prompt for Kimi Code

```
Read plan/README.md, plan/00-current-state-audit.md and this phase file.
Execute Phase 02: add the vite dev middleware for /api/gemini/generate with the
428 fallback and app-side message; extend the nginx CSP for BYOK exactly as
specified; rework the key-state UX (three-state header, no PROXY literal,
remove-my-key flow); harden nginx with limit_req, body-size cap, JSON 429/502
and matching app error messages. Verify all four acceptance scenarios locally
(including the Docker run) before committing. Do not change the design system.
```
