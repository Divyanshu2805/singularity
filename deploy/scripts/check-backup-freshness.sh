#!/usr/bin/env bash
# Fails (non-zero) when the newest complete backup in R2 is older than MAX_AGE_HOURS, or when there is none at all.
# This is the alarm for deploy/k8s/base/backup.yaml: a CronJob that fails does so silently - nothing emails anyone
# when a pod errors at 02:30 - so a backup that has quietly stopped working would otherwise be discovered on the
# day the data is needed. Run daily by .github/workflows/uptime.yml, where a failed run is what sends the email.
#
# It reads the `LATEST` object the backup job writes as its very last step, and only after every dump and mirror
# succeeded, so a night whose upload half-finished leaves LATEST at the previous good night and this check goes red
# after MAX_AGE_HOURS instead of trusting a partial backup. The default of 30 hours is one nightly period plus slack
# for a slow run or a delayed start; the CronJob's own `startingDeadlineSeconds` is 2 hours.
#
# Uses `curl --aws-sigv4` (curl >= 7.75, present on the GitHub runners) rather than an AWS CLI, so there is nothing
# to install and it runs the same on a laptop. Expects, as env vars:
#   R2_ENDPOINT, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY      (the same three the GitHub `production` environment holds)
# and optionally:
#   R2_BUCKET         default vibecraft-backups
#   R2_REGION         default `auto`, which is what R2 wants; a MinIO used as a stand-in wants `us-east-1`
#   MAX_AGE_HOURS     default 30
set -euo pipefail

for var in R2_ENDPOINT R2_ACCESS_KEY_ID R2_SECRET_ACCESS_KEY; do
  [ -n "${!var:-}" ] || { echo "Missing required env var: $var" >&2; exit 2; }
done
BUCKET="${R2_BUCKET:-vibecraft-backups}"
REGION="${R2_REGION:-auto}"
MAX_AGE_HOURS="${MAX_AGE_HOURS:-30}"

if ! stamp="$(curl -sS --fail --max-time 30 \
    --aws-sigv4 "aws:amz:${REGION}:s3" --user "${R2_ACCESS_KEY_ID}:${R2_SECRET_ACCESS_KEY}" \
    "${R2_ENDPOINT%/}/${BUCKET}/LATEST")"; then
  echo "BACKUP CHECK FAILED: could not read LATEST from ${BUCKET} - no backup has ever completed, or R2 is unreachable." >&2
  exit 1
fi
stamp="$(printf '%s' "$stamp" | tr -d '[:space:]')"

if ! then_epoch="$(date -u -d "$stamp" +%s 2> /dev/null)"; then
  echo "BACKUP CHECK FAILED: LATEST holds '$stamp', which is not a timestamp." >&2
  exit 1
fi
age_hours=$(( ($(date -u +%s) - then_epoch) / 3600 ))

if [ "$age_hours" -gt "$MAX_AGE_HOURS" ]; then
  echo "BACKUP CHECK FAILED: the newest complete backup is from $stamp, ${age_hours}h ago (limit ${MAX_AGE_HOURS}h)." >&2
  echo "Look at the CronJob: kubectl -n vibecraft get jobs -l app=nightly-backup, then logs of the newest failed one." >&2
  exit 1
fi
echo "Backup is fresh: newest complete backup $stamp (${age_hours}h ago, limit ${MAX_AGE_HOURS}h)."
