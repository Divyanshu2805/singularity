#!/usr/bin/env bash
# Remembers which revision of each service was running before a deploy, and puts back only the ones the deploy
# changed.
#
#   deploy-revisions.sh record <file>     write "<namespace> <deployment> <revision>" for every service, one a line
#   deploy-revisions.sh rollback <file>   for every line whose deployment is now at a different revision, roll it
#                                         back to the recorded one
#
# The CI deploy runs `record` immediately before `kubectl apply` and `rollback` when any later step fails. A plain
# `kubectl rollout undo` on every service, which is what the workflow used to do, steps a deployment back one release
# whether or not this deploy touched it: a deploy that failed before applying anything took all of production back a
# release, and so did a service whose manifest had not changed. Rolling back to a recorded revision number cannot do
# that - an unchanged deployment is still at its recorded revision and is left alone.
#
# With no file (the deploy failed before `record` ran) `rollback` does nothing and succeeds. A deployment that did not
# exist before the deploy is recorded as "none" and left as the deploy made it; there is nothing to go back to.
#
# Uses whatever kubectl context is current, like the deploy itself. Pass KUBECTL to use a different binary.
set -euo pipefail

KUBECTL="${KUBECTL:-kubectl}"

SERVICES="singularity discovery-service
singularity account-service
singularity workspace-service
singularity intelligence-service
singularity gateway-service
singularity frontend
singularity-ai singularity-proxy
singularity-ai runner-pool"

revision_of() {
  "$KUBECTL" -n "$1" get deployment "$2" \
    -o jsonpath='{.metadata.annotations.deployment\.kubernetes\.io/revision}' 2>/dev/null || true
}

command="${1:-}"
file="${2:-}"
if [ -z "$command" ] || [ -z "$file" ]; then
  echo "usage: deploy-revisions.sh record|rollback <file>" >&2
  exit 2
fi

case "$command" in
  record)
    : > "$file"
    while read -r namespace name; do
      revision="$(revision_of "$namespace" "$name")"
      echo "$namespace $name ${revision:-none}" >> "$file"
    done <<< "$SERVICES"
    cat "$file"
    ;;
  rollback)
    if [ ! -s "$file" ]; then
      echo "Nothing was applied by this run, so there is nothing to roll back."
      exit 0
    fi
    failed=0
    while read -r namespace name before; do
      now="$(revision_of "$namespace" "$name")"
      if [ "$before" = "none" ]; then
        echo "$namespace/$name did not exist before this deploy - left as it is."
      elif [ -z "$now" ]; then
        echo "$namespace/$name could not be read - left as it is."
        failed=1
      elif [ "$now" = "$before" ]; then
        echo "$namespace/$name is still at revision $before - not touched by this deploy."
      else
        echo "$namespace/$name moved from revision $before to $now - rolling back."
        "$KUBECTL" -n "$namespace" rollout undo "deployment/$name" --to-revision="$before" || failed=1
      fi
    done < "$file"
    exit "$failed"
    ;;
  *)
    echo "usage: deploy-revisions.sh record|rollback <file>" >&2
    exit 2
    ;;
esac
