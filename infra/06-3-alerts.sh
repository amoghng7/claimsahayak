#!/usr/bin/env bash
# Phase 06 step 6.3 — Cloud Monitoring alerts for ClaimSahayak.
# Uses the Monitoring REST API directly (gcloud alpha requires the alpha
# component, which installer-based Windows SDKs cannot update).
# 1. 5xx rate on the Cloud Run service (any 5xx over 5 min → alert).
# 2. Gemini usage spike: log-based metric counting /api/gemini/generate calls,
#    alerting above SPIKE_PER_HOUR (default 100) per hour.
# ALERT_EMAIL set → email notification channel attached; else policies are
# created channel-less (visible in the console).
set -euo pipefail

PROJECT=claim-sahayak
SPIKE_PER_HOUR=${SPIKE_PER_HOUR:-100}
TOKEN=$(gcloud auth print-access-token)
API=https://monitoring.googleapis.com/v3/projects/$PROJECT

# --- log-based metric for Gemini proxy calls ---
gcloud logging metrics create gemini_proxy_calls \
  --project="$PROJECT" \
  --description="POSTs to /api/gemini/generate (sidecar Gemini calls)" \
  --log-filter='resource.type="cloud_run_revision" AND resource.labels.service_name="claimsahayak" AND "POST /api/gemini/generate"' \
  2>/dev/null || echo "metric gemini_proxy_calls already exists"

CHANNELS_JSON="[]"
if [ "${ALERT_EMAIL:-}" != "" ]; then
  CH=$(curl -s -X POST -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
    -d "{\"displayName\":\"claimsahayak alerts\",\"type\":\"email\",\"labels\":{\"email_address\":\"$ALERT_EMAIL\"}}" \
    "$API/notificationChannels")
  CH_NAME=$(echo "$CH" | grep -o '"name": *"[^"]*"' | head -1 | cut -d'"' -f4)
  if [ -n "$CH_NAME" ]; then
    CHANNELS_JSON="[\"$CH_NAME\"]"
    echo "notification channel: $CH_NAME"
  else
    echo "channel creation failed, continuing without: $CH"
  fi
fi

post_policy() { # file
  curl -s -X POST -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
    -d @"$1" "$API/alertPolicies" | grep -oE '"displayName": *"[^"]*"|"message": *"[^"]*"' | head -2
}

WORKDIR=$(mktemp -d)

cat > "$WORKDIR/5xx.json" <<JSON
{
  "displayName": "claimsahayak 5xx responses",
  "combiner": "OR",
  "notificationChannels": $CHANNELS_JSON,
  "conditions": [{
    "displayName": "any 5xx in 5m",
    "conditionThreshold": {
      "filter": "resource.type=\"cloud_run_revision\" AND resource.labels.service_name=\"claimsahayak\" AND metric.type=\"run.googleapis.com/request_count\" AND metric.labels.response_code_class=\"5xx\"",
      "comparison": "COMPARISON_GT",
      "thresholdValue": 0,
      "duration": "300s",
      "aggregations": [{ "alignmentPeriod": "60s", "perSeriesAligner": "ALIGN_DELTA" }],
      "trigger": { "count": 1 }
    }
  }],
  "alertStrategy": { "autoClose": "86400s" }
}
JSON

cat > "$WORKDIR/spike.json" <<JSON
{
  "displayName": "claimsahayak Gemini call spike",
  "combiner": "OR",
  "notificationChannels": $CHANNELS_JSON,
  "conditions": [{
    "displayName": "> ${SPIKE_PER_HOUR} proxy calls/hour",
    "conditionThreshold": {
      "filter": "resource.type=\"cloud_run_revision\" AND metric.type=\"logging.googleapis.com/user/gemini_proxy_calls\"",
      "comparison": "COMPARISON_GT",
      "thresholdValue": ${SPIKE_PER_HOUR},
      "duration": "3600s",
      "aggregations": [{ "alignmentPeriod": "3600s", "perSeriesAligner": "ALIGN_DELTA" }],
      "trigger": { "count": 1 }
    }
  }],
  "alertStrategy": { "autoClose": "86400s" }
}
JSON

post_policy "$WORKDIR/5xx.json"
post_policy "$WORKDIR/spike.json"
rm -rf "$WORKDIR"
echo "Done. Review: console → Monitoring → Alerting (project $PROJECT)"
