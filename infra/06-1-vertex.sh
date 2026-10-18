#!/usr/bin/env bash
# Phase 06 step 6.1 — enable Vertex AI and grant the Cloud Run runtime SA.
# Idempotent. Deploy itself is .github/workflows/deploy.yml on push to main.
set -euo pipefail

PROJECT=claim-sahayak
REGION=asia-south1
RUNTIME_SA=599879020255-compute@developer.gserviceaccount.com

gcloud services enable aiplatform.googleapis.com --project="$PROJECT"

gcloud projects add-iam-policy-binding "$PROJECT" \
  --member="serviceAccount:$RUNTIME_SA" \
  --role="roles/aiplatform.user"

echo "Done. Model config lives in deploy.yml env: VERTEX_LOCATION=global,"
echo "VERTEX_MODEL=gemini-3.8-flash (3.8-flash is not published in $REGION;"
echo "global endpoint verified live with a real generateContent call)."
echo "After the new revision is verified, retire the old key:"
echo "  gcloud secrets disable gemini-api-key --project=$PROJECT   # then delete when confident"
