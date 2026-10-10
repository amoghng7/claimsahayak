#!/usr/bin/env bash
# Phase 06 step 6.4 — consent-gated persistence: Firestore (case history,
# Native mode) + Cloud Storage bucket (uploaded documents, 30-day lifecycle).
set -euo pipefail

PROJECT=claim-sahayak
PROJECT_NUMBER=599879020255
REGION=asia-south1
BUCKET="claimsahayak-docs-${PROJECT_NUMBER}"
RUNTIME_SA=599879020255-compute@developer.gserviceaccount.com

gcloud services enable firestore.googleapis.com storage.googleapis.com --project="$PROJECT"

# Firestore (default) database — skips silently if it already exists
gcloud firestore databases create --location="$REGION" --type=firestore-native --project="$PROJECT" \
  2>&1 | grep -v "already exists" || true

# Bucket with uniform bucket-level access + 30-day auto-delete
gcloud storage buckets create "gs://$BUCKET" --location="$REGION" --uniform-bucket-level-access \
  --project="$PROJECT" 2>&1 | grep -v "already exists" || true

LIFECYCLE=$(mktemp)
cat > "$LIFECYCLE" <<'JSON'
{ "lifecycle": { "rule": [ { "action": { "type": "Delete" }, "condition": { "age": 30 } } ] } }
JSON
gcloud storage buckets update "gs://$BUCKET" --lifecycle-file="$LIFECYCLE"
rm -f "$LIFECYCLE"

gcloud projects add-iam-policy-binding "$PROJECT" \
  --member="serviceAccount:$RUNTIME_SA" --role="roles/datastore.user" > /dev/null

gcloud storage buckets add-iam-policy-binding "gs://$BUCKET" \
  --member="serviceAccount:$RUNTIME_SA" --role="roles/storage.objectAdmin" > /dev/null

echo "Done. Set on the Cloud Run service:"
echo "  FIRESTORE_PROJECT=$PROJECT  GCS_BUCKET=$BUCKET"
