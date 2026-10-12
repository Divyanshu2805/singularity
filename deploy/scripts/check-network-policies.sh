#!/usr/bin/env bash
# Proves deploy/k8s/network-policies on a real cluster without the real services: every connection the application
# makes is let through, and every other connection between its pods is refused.
#
# It stands a small pod in for each workload - the same namespace, the same labels, a small web server on each of the
# same ports, since many pods connect at once - and then tries every pod against every port, twice. Before the policies are applied every attempt must connect, which
# shows the check can see an open door; after, the outcome must match the table below exactly. A rule that is missing
# shows as a connection the app needs being refused, and a rule that is too wide as one nobody needs being let in.
#
# The table is written here from what the application does (the manifests in deploy/k8s/base, each service's
# application.yaml and the proxy), not read out of policies.yaml, so that the two can disagree. A new workload, or a
# new connection between two of them, goes in both.
#
# What this does not prove: that the table is complete. It is the list of connections someone found by reading; only
# the real services running under the policies can show one that was missed, which is why applying them to
# production is still done by hand with the app open (see policies.yaml).
#
# It needs a cluster of its own: it creates the namespaces `singularity` and `singularity-ai`, refuses to run where
# either already exists, and deletes both when it is done. It is for kind only, whose network plugin enforces
# NetworkPolicy:
#
#   kind create cluster --name netpol-check          # this also switches kubectl's current context - switch it back
#   deploy/scripts/check-network-policies.sh --context kind-netpol-check
#   kind delete cluster --name netpol-check
#
# --context is required and never defaulted, as in every script here that changes a cluster. --keep leaves the
# namespaces in place afterwards, for looking at a failure.
set -euo pipefail

export MSYS_NO_PATHCONV=1

CONTEXT=""
KEEP=false
while [ $# -gt 0 ]; do
  case "$1" in
    --context) CONTEXT="$2"; shift 2 ;;
    --keep) KEEP=true; shift ;;
    *) echo "Unknown argument: $1" >&2; exit 2 ;;
  esac
done
if [ -z "$CONTEXT" ]; then
  echo "Pass --context explicitly, for example --context kind-netpol-check." >&2
  exit 2
fi
case "$CONTEXT" in
  kind-*) ;;
  *) echo "Refusing to run against '$CONTEXT': this is for kind clusters only." >&2; exit 2 ;;
esac

ROOT="$(cd "$(dirname "$0")/../.." && (pwd -W 2> /dev/null || pwd))"
K="kubectl --context $CONTEXT"
IMAGE="${CHECK_IMAGE:-busybox:1.36}"
APP=singularity
AI=singularity-ai

for namespace in "$APP" "$AI"; do
  if $K get namespace "$namespace" > /dev/null 2>&1; then
    echo "Namespace $namespace already exists in $CONTEXT. This check needs a cluster of its own." >&2
    exit 2
  fi
done

# namespace | pod | label | the ports it listens on (none for a pod that only connects out)
WORKLOADS="
$APP|cloudflared|app=cloudflared|
$APP|frontend|app=frontend|8080
$APP|gateway-service|app=gateway-service|8000 9404
$APP|discovery-service|app=discovery-service|8761
$APP|account-service|app=account-service|8081
$APP|workspace-service|app=workspace-service|8082
$APP|intelligence-service|app=intelligence-service|8083
$APP|postgres|app=postgres|5432
$APP|minio|app=minio|9000 9001
$APP|nightly-backup|app=nightly-backup|
$APP|restore-backup|app=restore-backup|
$APP|preview-reader-job|job-name=minio-bootstrap-preview-reader|
$APP|published-reader-job|job-name=minio-bootstrap-published-reader|
$APP|stranger|app=something-else|
$AI|redis|app=redis|6379
$AI|singularity-proxy|app=singularity-proxy|8080
$AI|runner|app=runner|
$AI|stranger|app=something-else|
"

# target (namespace/pod:port) | who may connect (namespace/pod, space separated). Everyone else must be refused.
ALLOWED="
$APP/gateway-service:8000|$APP/cloudflared $APP/frontend
$APP/gateway-service:9404|
$APP/frontend:8080|$APP/cloudflared
$APP/discovery-service:8761|$APP/gateway-service $APP/account-service $APP/workspace-service $APP/intelligence-service
$APP/account-service:8081|$APP/gateway-service $APP/workspace-service $APP/intelligence-service
$APP/workspace-service:8082|$APP/gateway-service $APP/account-service $APP/intelligence-service
$APP/intelligence-service:8083|$APP/gateway-service $APP/account-service $APP/workspace-service
$APP/postgres:5432|$APP/account-service $APP/workspace-service $APP/intelligence-service $APP/nightly-backup $APP/restore-backup
$APP/minio:9000|$APP/workspace-service $APP/nightly-backup $APP/restore-backup $APP/preview-reader-job $APP/published-reader-job $AI/runner $AI/singularity-proxy
$APP/minio:9001|
$AI/redis:6379|$AI/singularity-proxy $APP/workspace-service
$AI/singularity-proxy:8080|$APP/cloudflared
"

cleanup() {
  if $KEEP; then
    echo "Left the namespaces in place (--keep)."
  else
    $K delete namespace "$APP" "$AI" --wait=false > /dev/null 2>&1 || true
  fi
}
trap cleanup EXIT

echo "Standing a pod in for each workload"
$K create namespace "$APP" > /dev/null
$K create namespace "$AI" > /dev/null
echo "$WORKLOADS" | while IFS='|' read -r namespace pod label ports; do
  [ -n "$namespace" ] || continue
  listen="sleep 86400"
  if [ -n "$ports" ]; then
    listen="for p in $ports; do httpd -p \$p -h /tmp; done; sleep 86400"
  fi
  $K -n "$namespace" run "$pod" --image="$IMAGE" --labels="$label" --restart=Never \
    --command -- /bin/sh -c "$listen" > /dev/null
done
$K -n "$APP" wait --for=condition=Ready pod --all --timeout=180s > /dev/null
$K -n "$AI" wait --for=condition=Ready pod --all --timeout=180s > /dev/null

WORK="$(mktemp -d)"
ip_of() {
  $K -n "${1%%/*}" get pod "${1##*/}" -o 'jsonpath={.status.podIP}'
}

# Every source tries every target once; the sources run side by side, since a refused connection is a timeout.
attempt_all() {
  local round="$1"
  mkdir -p "$WORK/$round"
  local script=""
  while IFS='|' read -r target _; do
    [ -n "$target" ] || continue
    local where="${target%%:*}" port="${target##*:}"
    script="$script if nc -z -w 3 $(ip_of "$where") $port > /dev/null 2>&1; then echo '$target open'; else echo '$target refused'; fi;"
  done << TABLE
$ALLOWED
TABLE
  echo "$WORKLOADS" | {
    while IFS='|' read -r namespace pod _ _; do
      [ -n "$namespace" ] || continue
      $K -n "$namespace" exec "$pod" -- /bin/sh -c "$script" > "$WORK/$round/$namespace.$pod" 2> /dev/null < /dev/null &
    done
    wait
  }
}

# Each of the pods must have reported on each of the targets, or a round that was cut short would pass as a quiet one.
EXPECTED_ATTEMPTS=$(( $(echo "$WORKLOADS" | grep -c '|') * $(echo "$ALLOWED" | grep -c '|') ))
complete() {
  local round="$1" got
  got="$(cat "$WORK/$round"/* | wc -l | tr -d ' ')"
  if [ "$got" != "$EXPECTED_ATTEMPTS" ]; then
    echo "CHECK FAILED: $got of $EXPECTED_ATTEMPTS attempts reported in the round $round the policies." >&2
    exit 1
  fi
}

may_connect() {
  local source="$1" target="$2" line
  line="$(echo "$ALLOWED" | grep -F "$target|" || true)"
  case " ${line#*|} " in
    *" $source "*) return 0 ;;
    *) return 1 ;;
  esac
}

echo "Before the policies: every connection must open"
attempt_all before
complete before
refused_before="$(cat "$WORK"/before/* | grep -c ' refused$' || true)"
tried="$EXPECTED_ATTEMPTS"
if [ "$refused_before" != "0" ]; then
  echo "CHECK FAILED before any policy was applied: $refused_before of $tried connections did not open, so a refusal later would prove nothing." >&2
  grep -H ' refused$' "$WORK"/before/* >&2 || true
  exit 1
fi
echo "  $tried of $tried opened"

echo "Applying deploy/k8s/network-policies"
$K apply -k "$ROOT/deploy/k8s/network-policies" > /dev/null
sleep 10

echo "After the policies: only what the application needs may open"
attempt_all after
complete after
wrong=0
let_through=0
turned_away=0
for file in "$WORK"/after/*; do
  name="$(basename "$file")"
  source="${name%%.*}/${name#*.}"
  while read -r target outcome; do
    # A pod is never tested against itself: a connection to its own address does not leave the pod.
    [ "${target%%:*}" = "$source" ] && continue
    if may_connect "$source" "$target"; then
      expected=open
    else
      expected=refused
    fi
    if [ "$outcome" = "$expected" ]; then
      if [ "$outcome" = open ]; then let_through=$((let_through + 1)); else turned_away=$((turned_away + 1)); fi
    else
      wrong=$((wrong + 1))
      echo "  WRONG: $source -> $target was $outcome, expected $expected" >&2
    fi
  done < "$file"
done

if [ "$wrong" != "0" ]; then
  echo "CHECK FAILED: $wrong connection(s) did not match the table." >&2
  exit 1
fi
echo "  $let_through connections the application needs were let through"
echo "  $turned_away others were refused"
echo "The network policies match the table."
