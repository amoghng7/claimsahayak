#!/usr/bin/env bash
# Phase 06 step 6.3 — budget alert for the claim-sahayak project.
# Usage: BUDGET_INR=1000 bash infra/06-3-budgets.sh
# Emails billing account admins at 50/90/100% of actual spend.
set -euo pipefail

PROJECT=claim-sahayak
AMOUNT=${BUDGET_INR:-1000}

BILLING_ACCOUNT=$(gcloud billing projects describe "$PROJECT" --format='value(billingAccountName)' | sed 's|billingAccounts/||')
if [ -z "$BILLING_ACCOUNT" ]; then
  echo "No billing account linked to $PROJECT — cannot create a budget." >&2
  exit 1
fi
echo "Billing account: $BILLING_ACCOUNT — creating ₹$AMOUNT/month budget"

gcloud billing budgets create \
  --billing-account="$BILLING_ACCOUNT" \
  --display-name="claimsahayak-monthly" \
  --budget-amount="${AMOUNT}" \
  --filter-projects="projects/599879020255" \
  --threshold-rule=percent=0.5 \
  --threshold-rule=percent=0.9 \
  --threshold-rule=percent=1.0 \
  || echo "Budget may already exist — check: gcloud billing budgets list --billing-account=$BILLING_ACCOUNT"
