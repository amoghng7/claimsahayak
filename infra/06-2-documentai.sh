#!/usr/bin/env bash
# Phase 06 step 6.2 — Cloud Document AI OCR for scanned bills.
# Creates an OCR processor and grants the Cloud Run runtime SA access.
# Idempotent-ish: re-running prints the existing processor id instead of
# creating duplicates when DOCAI_PROCESSOR_ID is already known (pass it).
set -euo pipefail

PROJECT=claim-sahayak
LOCATION=us   # Document AI processors live in us/eu multi-regions only
RUNTIME_SA=599879020255-compute@developer.gserviceaccount.com

gcloud services enable documentai.googleapis.com --project="$PROJECT"

if [ "${DOCAI_PROCESSOR_ID:-}" = "" ]; then
  echo "Creating OCR processor in $LOCATION..."
  curl -s -X POST \
    -H "Authorization: Bearer $(gcloud auth print-access-token)" \
    -H "Content-Type: application/json" \
    -d '{"displayName":"claimsahayak-ocr","type":"OCR_PROCESSOR"}' \
    "https://$LOCATION-documentai.googleapis.com/v1/projects/$PROJECT/locations/$LOCATION/processors" \
    | tee /dev/stderr | grep -o '"name": *"[^"]*"' | head -1
  echo "Re-run with DOCAI_PROCESSOR_ID=<id> to grant IAM (or grant below manually)."
fi

PROCESSOR_ID=${DOCAI_PROCESSOR_ID:-}
if [ -n "$PROCESSOR_ID" ]; then
  # IAM on Document AI is project-level for processors
  gcloud projects add-iam-policy-binding "$PROJECT" \
    --member="serviceAccount:$RUNTIME_SA" \
    --role="roles/documentai.apiUser"
  echo "Granted documentai.apiUser to $RUNTIME_SA"
  echo "Set on the Cloud Run service: DOCAI_PROCESSOR=$PROCESSOR_ID DOCAI_LOCATION=$LOCATION"
fi
