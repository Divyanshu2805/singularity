#!/usr/bin/env bash
# Recreates every Kubernetes Secret the oracle overlay's Deployments reference, from the GitHub `production`
# environment's own secrets (docs/deployment/phase-0-accounts-setup.md Phase 0's table) - run on every deploy, so the server itself
# never needs a hand-edited secret file (Phase 5's own spec). Idempotent: `--dry-run=client -o yaml | kubectl apply`
# creates a Secret that doesn't exist yet and reconciles one that does, without ever needing to know which case
# it's in.
#
# Expects every GitHub secret name below as an already-exported env var (the CI workflow's `env:` block does this
# with `${{ secrets.X }}`) and a working kubectl context already pointed at the Oracle cluster. Never run this
# against kind - minio-runner-credentials/preview-access-token both need writing to `vibecraft-ai` too, a namespace
# kind's own rehearsal already creates through deploy/k8s/base, not through this script.
#
# Two secrets need the SAME value in both `vibecraft` and `vibecraft-ai` (base/minio.yaml's and
# base/preview-proxy.yaml's own comments explain why - Kubernetes Secrets don't cross namespaces).
set -euo pipefail

for var in DB_PASSWORD MINIO_ROOT_PASSWORD MINIO_RUNNER_SECRET INTERNAL_SERVICE_SHARED_SECRET \
           PREVIEW_ACCESS_TOKEN_SECRET FIREBASE_SERVICE_ACCOUNT_JSON OPENROUTER_API_KEY STRIPE_SECRET \
           STRIPE_WEBHOOK_SECRET STRIPE_PRICE_PRO STRIPE_PRICE_BUSINESS CLOUDFLARE_TUNNEL_CREDENTIALS \
           R2_ACCESS_KEY_ID R2_SECRET_ACCESS_KEY R2_ENDPOINT; do
  if [ -z "${!var:-}" ]; then
    echo "Missing required env var: $var" >&2
    exit 1
  fi
done

apply() {
  kubectl create secret generic "$@" --dry-run=client -o yaml | kubectl apply -f -
}

apply db-credentials -n vibecraft --from-literal=password="$DB_PASSWORD"

apply minio-root-credentials -n vibecraft \
  --from-literal=username=minioadmin \
  --from-literal=password="$MINIO_ROOT_PASSWORD"

MINIO_RUNNER_HOST_URI="http://previewreader:${MINIO_RUNNER_SECRET}@minio-service.vibecraft.svc.cluster.local:9000"
apply minio-runner-credentials -n vibecraft \
  --from-literal=password="$MINIO_RUNNER_SECRET" \
  --from-literal=host-uri="$MINIO_RUNNER_HOST_URI"
apply minio-runner-credentials -n vibecraft-ai \
  --from-literal=password="$MINIO_RUNNER_SECRET" \
  --from-literal=host-uri="$MINIO_RUNNER_HOST_URI"

apply internal-service-secret -n vibecraft --from-literal=shared-secret="$INTERNAL_SERVICE_SHARED_SECRET"

apply preview-access-token -n vibecraft --from-literal=secret="$PREVIEW_ACCESS_TOKEN_SECRET"
apply preview-access-token -n vibecraft-ai --from-literal=secret="$PREVIEW_ACCESS_TOKEN_SECRET"

FIREBASE_SA_FILE="$(mktemp)"
trap 'rm -f "$FIREBASE_SA_FILE"' EXIT
printf '%s' "$FIREBASE_SERVICE_ACCOUNT_JSON" > "$FIREBASE_SA_FILE"
apply firebase-service-account -n vibecraft --from-file=sa.json="$FIREBASE_SA_FILE"

apply openrouter-api-key -n vibecraft --from-literal=api-key="$OPENROUTER_API_KEY"

apply stripe-credentials -n vibecraft \
  --from-literal=secret="$STRIPE_SECRET" \
  --from-literal=webhook-secret="$STRIPE_WEBHOOK_SECRET" \
  --from-literal=price-pro="$STRIPE_PRICE_PRO" \
  --from-literal=price-business="$STRIPE_PRICE_BUSINESS"

CLOUDFLARE_CREDS_FILE="$(mktemp)"
trap 'rm -f "$FIREBASE_SA_FILE" "$CLOUDFLARE_CREDS_FILE"' EXIT
printf '%s' "$CLOUDFLARE_TUNNEL_CREDENTIALS" > "$CLOUDFLARE_CREDS_FILE"
apply cloudflared-credentials -n vibecraft --from-file=credentials.json="$CLOUDFLARE_CREDS_FILE"

# The nightly backup job's target (deploy/k8s/base/backup.yaml). R2_ENDPOINT is the bucket's S3 API URL,
# `https://<cloudflare account id>.r2.cloudflarestorage.com` - it embeds the account id, so like the other private
# identifiers it lives in the GitHub environment as a secret, not in a committed file. The bucket name is not
# sensitive and defaults to the one Phase 0 created; export R2_BUCKET to override it.
apply r2-backup-credentials -n vibecraft \
  --from-literal=endpoint="$R2_ENDPOINT" \
  --from-literal=access-key-id="$R2_ACCESS_KEY_ID" \
  --from-literal=secret-access-key="$R2_SECRET_ACCESS_KEY" \
  --from-literal=bucket="${R2_BUCKET:-vibecraft-backups}"

echo "All secrets reconciled."
