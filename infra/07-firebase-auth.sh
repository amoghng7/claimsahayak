#!/usr/bin/env bash
# Phase 07 — Firebase Auth provisioning for ClaimSahayak.
# Adds Firebase to the GCP project, creates the web app, and enables the
# Email/Password + Google providers. Idempotent — safe to re-run.
#
# Two steps are NOT scriptable and must be done once in the Firebase console:
#   1. Accepting the Firebase Terms of Service (the Management API 403s until
#      the account has visited console.firebase.google.com once).
#   2. Authentication bootstrap: console → project → Authentication →
#      "Get started" creates the Identity Toolkit config; PATCH below 404s
#      before that. Enabling the Google provider there also auto-creates the
#      OAuth client and prompts for the project public-facing name + support
#      email — the API path needs a client_id up front.
set -euo pipefail

PROJECT=claim-sahayak
RUN_URL=claimsahayak-tvghig4oya-el.a.run.app   # gcloud run services describe claimsahayak --region asia-south1

gcloud services enable firebase.googleapis.com identitytoolkit.googleapis.com --project="$PROJECT"

TOKEN=$(gcloud auth print-access-token)
AUTH=(-H "Authorization: Bearer $TOKEN" -H "x-goog-user-project: $PROJECT")

# Firebase project + web app. addFirebase is a long-running operation — this
# polls it to completion. A 409/already-exists response is fine; anything else fails.
ADD_OUT=$(curl -s -X POST "${AUTH[@]}" -H "Content-Type: application/json" -d '{}' \
  "https://firebase.googleapis.com/v1beta1/projects/$PROJECT:addFirebase")
if echo "$ADD_OUT" | grep -q '"name": "operations/'; then
  OP=$(echo "$ADD_OUT" | python -c 'import sys,json; print(json.load(sys.stdin)["name"])')
  for _ in $(seq 1 30); do
    sleep 5
    DONE=$(curl -s "${AUTH[@]}" "https://firebase.googleapis.com/v1beta1/$OP" \
      | python -c 'import sys,json; print(json.load(sys.stdin).get("done", False))')
    [ "$DONE" = "True" ] && break
  done
elif ! curl -sf "${AUTH[@]}" "https://firebase.googleapis.com/v1beta1/projects/$PROJECT" >/dev/null; then
  echo "addFirebase failed and no Firebase project exists: $ADD_OUT" >&2
  exit 1
fi

if ! curl -sf "${AUTH[@]}" "https://firebase.googleapis.com/v1beta1/projects/$PROJECT/webApps" \
  | grep -q '"appId"'; then
  curl -sf -X POST "${AUTH[@]}" -H "Content-Type: application/json" \
    -d '{"displayName":"ClaimSahayak Web"}' \
    "https://firebase.googleapis.com/v1beta1/projects/$PROJECT/webApps"
fi

# Email/Password provider
curl -sf -X PATCH "${AUTH[@]}" -H "Content-Type: application/json" \
  "https://identitytoolkit.googleapis.com/v2/projects/$PROJECT/config?updateMask=signIn.email.enabled,signIn.email.passwordRequired" \
  -d '{"signIn":{"email":{"enabled":true,"passwordRequired":true}}}'

# Authorized domains: localhost + firebaseapp/web.app are defaults; add Cloud Run
curl -sf -X PATCH "${AUTH[@]}" -H "Content-Type: application/json" \
  "https://identitytoolkit.googleapis.com/v2/projects/$PROJECT/config?updateMask=authorizedDomains" \
  -d "{\"authorizedDomains\":[\"localhost\",\"$PROJECT.firebaseapp.com\",\"$PROJECT.web.app\",\"$RUN_URL\"]}"

# The client config (non-secret) lives in src/engine/auth.ts; refresh it with:
#   curl "${AUTH[@]}" "https://firebase.googleapis.com/v1beta1/projects/$PROJECT/webApps/<APP_ID>/config"
echo "Done. Verify providers: Authentication → Sign-in method should list Email/Password and Google."
