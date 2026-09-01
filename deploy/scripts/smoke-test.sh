#!/usr/bin/env bash
# Docs/deployment-plan.md Phase 5's smoke test: three checks that prove the site, the API and the preview route are
# all actually serving traffic through the real public path (Cloudflare -> tunnel -> Service), not just that the
# pods are Ready. Takes the app domain as $1 (docs/deployment/phase-0-accounts-setup.md Phase 0's APP_DOMAIN variable) and the
# preview-hosting root domain as $2 (the same domain, minus the `app.` prefix). Exits non-zero on the first failure
# so the workflow step it's called from can trigger a rollback.
set -euo pipefail

APP_DOMAIN="${1:?usage: smoke-test.sh <app-domain> <preview-root-domain>}"
PREVIEW_ROOT_DOMAIN="${2:?usage: smoke-test.sh <app-domain> <preview-root-domain>}"

fail() {
  echo "SMOKE TEST FAILED: $1" >&2
  exit 1
}

echo "Checking https://${APP_DOMAIN}/ ..."
status=$(curl -s -o /dev/null -w '%{http_code}' --max-time 15 "https://${APP_DOMAIN}/")
[ "$status" = "200" ] || fail "https://${APP_DOMAIN}/ returned $status, expected 200"

echo "Checking https://${APP_DOMAIN}/api/plans ..."
body=$(curl -s --max-time 15 "https://${APP_DOMAIN}/api/plans")
echo "$body" | grep -q '"name"' || fail "/api/plans did not return the plan catalogue: $body"

# A random hostname under the preview wildcard - no real preview is running under it, so the proxy's own
# `routing.js` "not running" 404 is the expected, healthy response. A 502/timeout instead means the tunnel or the
# proxy pod itself is the problem, not a missing preview.
random_preview="p-smoketest-$(date +%s).${PREVIEW_ROOT_DOMAIN}"
echo "Checking https://${random_preview} (expect the proxy's 'not running' 404) ..."
status=$(curl -s -o /dev/null -w '%{http_code}' --max-time 15 "https://${random_preview}")
[ "$status" = "404" ] || fail "https://${random_preview} returned $status, expected 404 (preview-proxy's own 'not running' page)"

echo "Smoke test passed."
