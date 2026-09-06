#!/usr/bin/env bash
# Restores the app's data from one of deploy/k8s/base/backup.yaml's nightly backups: Postgres (all three service
# databases) and every MinIO bucket, replacing whatever is there now.
#
#   deploy/scripts/restore-backup.sh --context <kube-context> [--date YYYY-MM-DD|latest] --yes
#
# DESTRUCTIVE: everything written after the chosen backup is lost. Two deliberate speed bumps against restoring the
# wrong cluster - the kube context must be named explicitly (this script never falls back to the current context,
# so a `kubectl` left pointed at production after an afternoon on kind cannot be hit by accident), and it prints the
# API server it is about to act on before doing anything. `--yes` is required; without it the script only says what
# it would do.
#
# What it does: (1) scales account/workspace/intelligence to zero, so nothing is writing to a database that is about
# to be swapped; (2) renders restore-job.yaml.tmpl and runs it to completion; (3) scales the three services back to
# the replica counts they had. If the Job fails it does NOT scale them back up - bringing services up over a
# half-restored database is worse than an outage - and instead prints exactly what to do.
#
# Needs: kubectl, and the `r2-backup-credentials` Secret in the target cluster (apply-secrets.sh creates it on every
# deploy; on a fresh cluster run that first). Everything else it uses - the images, the credentials - it takes from
# the cluster's own nightly-backup CronJob and Secrets, so nothing here can drift from the backup job.
set -euo pipefail

usage() {
  sed -n '2,/^set -euo/p' "$0" | sed '$d' | sed 's/^# \{0,1\}//' >&2
  exit 2
}

CONTEXT=""
DATE="latest"
CONFIRM=""
while [ $# -gt 0 ]; do
  case "$1" in
    --context) CONTEXT="${2:?--context needs a value}"; shift 2 ;;
    --date) DATE="${2:?--date needs a value}"; shift 2 ;;
    --yes) CONFIRM="yes"; shift ;;
    -h | --help) usage ;;
    *) echo "Unknown argument: $1" >&2; usage ;;
  esac
done
[ -n "$CONTEXT" ] || { echo "--context is required (this script never uses your current context)." >&2; usage; }
case "$DATE" in
  latest | [0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]) ;;
  *) echo "--date must be YYYY-MM-DD or 'latest', got '$DATE'" >&2; exit 2 ;;
esac

KC=(kubectl --context "$CONTEXT")
K=("${KC[@]}" -n vibecraft)
SERVICES=(account-service workspace-service intelligence-service)

SERVER="$("${KC[@]}" config view --minify -o jsonpath='{.clusters[0].cluster.server}')"
echo "Target kube context : $CONTEXT"
echo "Target API server   : $SERVER"
echo "Backup to restore   : $DATE"
echo "This REPLACES all Postgres data and every MinIO bucket on that cluster with the backup's."
if [ "$CONFIRM" != "yes" ]; then
  echo
  echo "Dry run only - nothing was changed. Re-run with --yes to proceed." >&2
  exit 1
fi

"${K[@]}" get secret r2-backup-credentials > /dev/null \
  || { echo "The r2-backup-credentials Secret is missing in $CONTEXT - run deploy/scripts/apply-secrets.sh first." >&2; exit 1; }
PG_IMAGE="$("${K[@]}" get cronjob nightly-backup -o jsonpath='{.spec.jobTemplate.spec.template.spec.initContainers[0].image}')"
MC_IMAGE="$("${K[@]}" get cronjob nightly-backup -o jsonpath='{.spec.jobTemplate.spec.template.spec.containers[0].image}')"
[ -n "$PG_IMAGE" ] && [ -n "$MC_IMAGE" ] || { echo "Could not read the images from the nightly-backup CronJob." >&2; exit 1; }

REPLICAS=()
for svc in "${SERVICES[@]}"; do
  REPLICAS+=("$("${K[@]}" get deployment "$svc" -o jsonpath='{.spec.replicas}')")
done

scale_back_up() {
  for i in "${!SERVICES[@]}"; do
    "${K[@]}" scale deployment "${SERVICES[$i]}" --replicas="${REPLICAS[$i]:-1}"
  done
}

restore_failed() {
  echo >&2
  echo "RESTORE DID NOT COMPLETE. The three services are still scaled to ZERO on purpose - the databases may be" >&2
  echo "half-restored. Read the Job's logs, fix the cause, and either re-run this script, or, if you decide the" >&2
  echo "current data is what you want, bring the services back with:" >&2
  for i in "${!SERVICES[@]}"; do
    echo "  kubectl --context $CONTEXT -n vibecraft scale deployment ${SERVICES[$i]} --replicas=${REPLICAS[$i]:-1}" >&2
  done
}

echo "Scaling ${SERVICES[*]} to zero ..."
"${K[@]}" scale deployment "${SERVICES[@]}" --replicas=0
for _ in $(seq 1 60); do
  remaining="$("${K[@]}" get pods -o name | grep -c -E "/(account|workspace|intelligence)-service-" || true)"
  [ "$remaining" = "0" ] && break
  sleep 3
done
[ "$remaining" = "0" ] || { echo "The services did not stop within 3 minutes." >&2; scale_back_up; exit 1; }

JOB="restore-backup-$(date -u +%Y%m%d-%H%M%S)"
trap restore_failed ERR
sed -e "s#__NAME__#$JOB#" -e "s#__DATE__#$DATE#" -e "s#__PG_IMAGE__#$PG_IMAGE#" -e "s#__MC_IMAGE__#$MC_IMAGE#" \
  "$(dirname "$0")/restore-job.yaml.tmpl" | "${K[@]}" apply -f -

echo "Waiting for $JOB (up to 30 minutes) ..."
deadline=$((SECONDS + 1800))
while :; do
  succeeded="$("${K[@]}" get job "$JOB" -o jsonpath='{.status.succeeded}')"
  failed="$("${K[@]}" get job "$JOB" -o jsonpath='{.status.failed}')"
  [ "${succeeded:-0}" = "1" ] && break
  if [ "${failed:-0}" != "0" ] || [ "$SECONDS" -gt "$deadline" ]; then
    echo "--- fetch container log" >&2
    "${K[@]}" logs "job/$JOB" -c fetch >&2 || true
    echo "--- restore container log" >&2
    "${K[@]}" logs "job/$JOB" -c restore >&2 || true
    false
  fi
  sleep 3
done
"${K[@]}" logs "job/$JOB" -c fetch
"${K[@]}" logs "job/$JOB" -c restore
trap - ERR

echo "Scaling the services back up ..."
scale_back_up
for svc in "${SERVICES[@]}"; do
  "${K[@]}" rollout status "deployment/$svc" --timeout=5m
done
echo "Restore of the $DATE backup complete."
