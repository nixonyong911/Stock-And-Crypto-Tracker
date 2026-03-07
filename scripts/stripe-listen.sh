#!/bin/bash
# Forward Stripe webhooks to localhost for local development.
# Usage: ./scripts/stripe-listen.sh [staging|prod]

set -euo pipefail

ENV="${1:-staging}"

EVENTS="customer.subscription.created,customer.subscription.updated,customer.subscription.deleted,customer.subscription.trial_will_end,customer.subscription.paused,invoice.paid,invoice.payment_failed,checkout.session.completed"

case "$ENV" in
  staging)
    echo "Forwarding Stripe webhooks (staging/test mode) to localhost:3000..."
    stripe listen \
      --forward-to localhost:3000/api/webhooks/stripe \
      --events "$EVENTS"
    ;;
  prod)
    if [ -z "${STRIPE_SECRET_KEY_PROD:-}" ]; then
      echo "Error: STRIPE_SECRET_KEY_PROD is not set"
      exit 1
    fi
    echo "Forwarding Stripe webhooks (production/live mode) to localhost:3000..."
    stripe listen \
      --forward-to localhost:3000/api/webhooks/stripe \
      --api-key "$STRIPE_SECRET_KEY_PROD" \
      --events "$EVENTS"
    ;;
  *)
    echo "Usage: $0 [staging|prod]"
    exit 1
    ;;
esac
