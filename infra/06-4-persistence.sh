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

# Uniform access, public-access prevention, and a 30-day delete.
# PAP stops an allUsers binding from publishing uploaded schedules and bills.
gcloud storage buckets create "gs://$BUCKET" --location="$REGION" --uniform-bucket-level-access \
  --public-access-prevention --project="$PROJECT" 2>&1 | grep -v "already exists" || true

LIFECYCLE=$(mktemp)
cat > "$LIFECYCLE" <<'JSON'
{ "lifecycle": { "rule": [ { "action": { "type": "Delete" }, "condition": { "age": 30 } } ] } }
JSON
gcloud storage buckets update "gs://$BUCKET" --lifecycle-file="$LIFECYCLE"
rm -f "$LIFECYCLE"
gcloud storage buckets update "gs://$BUCKET" --uniform-bucket-level-access --public-access-prevention

gcloud projects add-iam-policy-binding "$PROJECT" \
  --member="serviceAccount:$RUNTIME_SA" --role="roles/datastore.user" > /dev/null

gcloud storage buckets add-iam-policy-binding "gs://$BUCKET" \
  --member="serviceAccount:$RUNTIME_SA" --role="roles/storage.objectAdmin" > /dev/null

# TTL on expireAt (savedAt + 30d). REST because gcloud beta/alpha
# is unavailable on installer-based SDKs.
TOKEN=$(gcloud auth print-access-token)
curl -s -X PATCH -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  "https://firestore.googleapis.com/v1/projects/$PROJECT/databases/(default)/collectionGroups/cases/fields/expireAt?updateMask=ttlConfig" \
  -d '{"ttlConfig":{}}' > /dev/null
echo "Firestore TTL enabling on cases.expireAt (async op — check field state in console)"

echo "Done. Set on the Cloud Run service:"
echo "  FIRESTORE_PROJECT=$PROJECT  GCS_BUCKET=$BUCKET"
