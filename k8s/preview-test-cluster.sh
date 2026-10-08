#!/usr/bin/env bash
# Stands up a complete, separate preview pipeline in its own namespace of a kind cluster, for PreviewPipelineIT:
# Redis, an in-cluster MinIO with its read-only runner user, the warm runner pool and the preview proxy built from
# this checkout. CI runs this on a fresh kind cluster (.github/workflows/ci.yml, job `preview-pipeline`); locally it
# runs beside the `singularity-ai` namespace your own previews use, and touches nothing in it.
#
# Why its own namespace rather than the one local development already has: workspace-service's reaper releases every
# claimed runner pod that no preview row in ITS database owns. A test with a database of its own, sharing a namespace
# with a running workspace-service, has its pods deleted two minutes after it claims them - and a test that ran its
# own reaper would do the same to yours. A namespace apart shares no pods, no Redis and no proxy.
#
# The manifests are the ones local development applies (k8s/*.yml), with the namespace renamed and the proxy image
# swapped for one built here, so the test exercises the proxy in this checkout rather than whichever was loaded into
# the cluster last. Secrets are random, generated once per namespace and never printed; the test reads the ones it
# needs back from the cluster.
#
# --seed also builds the runner image that carries the starter template's node_modules and adds the init container
# that copies them into each warm pod, as production does (deploy/k8s/base/runner-pods.yaml). Without it every start
# is a full npm install, which is what `k8s/runner-pods.yml` gives local development today.
#
# Usage:
#   k8s/preview-test-cluster.sh --context kind-singularity            # create or update
#   k8s/preview-test-cluster.sh --context kind-singularity --seed     # the same, with pre-installed node_modules
#   k8s/preview-test-cluster.sh --context kind-singularity --down     # remove the namespace again
#
# --context is required and never defaulted: this applies manifests and creates secrets, and the cluster kubectl
# happens to point at is not a safe guess (docs/practices/gotchas/ci-and-tooling.md).
set -euo pipefail

# Git Bash rewrites arguments that start with a slash into Windows paths; nothing here wants that.
export MSYS_NO_PATHCONV=1

CONTEXT=""
NAMESPACE="singularity-it"
KIND_CLUSTER=""
DOWN=false
SEED=false

while [ $# -gt 0 ]; do
  case "$1" in
    --context) CONTEXT="$2"; shift 2 ;;
    --namespace) NAMESPACE="$2"; shift 2 ;;
    --kind-cluster) KIND_CLUSTER="$2"; shift 2 ;;
    --seed) SEED=true; shift ;;
    --down) DOWN=true; shift ;;
    *) echo "Unknown argument: $1" >&2; exit 2 ;;
  esac
done

if [ -z "$CONTEXT" ]; then
  echo "Pass --context explicitly, for example --context kind-singularity." >&2
  exit 2
fi
case "$CONTEXT" in
  kind-*) ;;
  *) echo "Refusing to run against '$CONTEXT': this is for kind clusters only." >&2; exit 2 ;;
esac
if [ "$NAMESPACE" = "singularity-ai" ] || [ "$NAMESPACE" = "singularity" ]; then
  echo "Refusing to use the '$NAMESPACE' namespace: that one belongs to the application." >&2
  exit 2
fi
KIND_CLUSTER="${KIND_CLUSTER:-${CONTEXT#kind-}}"

# With path conversion off, docker and kind - Windows programs under Git Bash - need a path they can read as it is;
# `pwd -W` gives one there and fails everywhere else, where plain `pwd` is already right.
ROOT="$(cd "$(dirname "$0")/.." && (pwd -W 2> /dev/null || pwd))"
K="kubectl --context $CONTEXT"
KN="$K -n $NAMESPACE"

if $DOWN; then
  $K delete namespace "$NAMESPACE" --ignore-not-found
  exit 0
fi

render() {
  sed -e "s/singularity-ai/$NAMESPACE/g" -e "s|image: singularity-proxy:latest|image: singularity-proxy:it|" "$1"
}

random_secret() {
  openssl rand -hex 20
}

ensure_secret() {
  local name="$1"; shift
  if $KN get secret "$name" > /dev/null 2>&1; then return; fi
  $KN create secret generic "$name" "$@" > /dev/null
  echo "Created secret $name"
}

echo "Building the preview proxy from this checkout"
docker build -q -t singularity-proxy:it "$ROOT/proxy" > /dev/null
kind load docker-image singularity-proxy:it --name "$KIND_CLUSTER" > /dev/null

if $SEED; then
  echo "Building the runner image with the starter template's node_modules (a few minutes the first time)"
  docker build -q -t singularity-preview-runner:local -f "$ROOT/docker/preview-runner.Dockerfile" \
    "$ROOT/workspace-service/src/main/resources/starter-templates/react-vite-tailwind-shadcn-starter" > /dev/null
  kind load docker-image singularity-preview-runner:local --name "$KIND_CLUSTER" > /dev/null
fi

render "$ROOT/k8s/infra.yml" | $K apply -f - > /dev/null

runner_password="$(random_secret)"
ensure_secret minio-root-credentials --from-literal=username=minio-it-root --from-literal=password="$(random_secret)"
ensure_secret minio-runner-credentials --from-literal=password="$runner_password" \
  --from-literal=host-uri="http://previewreader:${runner_password}@minio-service:9000"
ensure_secret preview-access-token --from-literal=secret="$(random_secret)"

render "$ROOT/k8s/minio.yml" | $K apply -f - > /dev/null
$KN rollout status statefulset/minio --timeout=180s
$KN wait --for=condition=complete job/minio-bootstrap-preview-reader --timeout=180s

render "$ROOT/k8s/runner-pods.yml" | $K apply -f - > /dev/null
if $SEED; then
  $KN patch deployment runner-pool --type=strategic -p '{"spec":{"template":{"spec":{"initContainers":[{
    "name":"seed-node-modules","image":"singularity-preview-runner:local","imagePullPolicy":"IfNotPresent",
    "command":["/bin/sh","-c","cp -a /opt/template-node-modules /app/node_modules"],
    "securityContext":{"allowPrivilegeEscalation":false,"capabilities":{"drop":["ALL"]}},
    "volumeMounts":[{"name":"workspace","mountPath":"/app"}],
    "resources":{"requests":{"cpu":"50m","memory":"64Mi","ephemeral-storage":"64Mi"},
                 "limits":{"cpu":"500m","memory":"256Mi","ephemeral-storage":"128Mi"}}}]}}}}' > /dev/null
else
  $KN patch deployment runner-pool --type=json \
    -p '[{"op":"remove","path":"/spec/template/spec/initContainers"}]' > /dev/null 2>&1 || true
fi
render "$ROOT/k8s/singularity-proxy.yml" | $K apply -f - > /dev/null
$KN rollout restart deployment/singularity-proxy > /dev/null

$KN rollout status deployment/redis-server --timeout=180s
$KN rollout status deployment/singularity-proxy --timeout=180s
$KN rollout status deployment/runner-pool --timeout=300s

echo "The preview test pipeline is ready in namespace $NAMESPACE of $CONTEXT."
echo "Run: ./mvnw -pl common-lib,workspace-service test -Dtest=PreviewPipelineIT -Dsurefire.failIfNoSpecifiedTests=false"
