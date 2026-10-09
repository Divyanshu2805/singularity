#!/usr/bin/env bash
# Starts, and stops, the whole application on ports of its own for the browser journey test (e2e/tests): a throwaway
# Postgres, the Firebase Auth emulator, the five services from their packaged jars with the scripted AI model, the
# production build of the frontend, and a preview pipeline in a namespace of its own on a kind cluster. CI runs this
# on a fresh cluster (.github/workflows/ci.yml, job `journey`); locally it runs beside whatever you have running and
# touches none of it - different ports, a different database server, a different namespace.
#
# What is real and what is not. Real: every service, the Gateway in front of them, discovery, the session cookie and
# CSRF token, the database migrations, object storage, the runner pod, the npm install and dev server inside it, the
# preview proxy, and the frontend as it is built for production, content security policy included. Not real: the AI
# provider (intelligence-service runs with its `stub-ai` profile, so no key is needed and nothing is spent), Firebase
# (the Auth emulator stands in, reached through the same SDK calls), and Stripe (dummy keys; the journey never pays).
#
# Nothing here is a secret worth keeping: the internal shared secret is random per run, the Firebase "service account"
# is a key generated on the spot for a project that does not exist, and the storage and token secrets are the random
# ones k8s/preview-test-cluster.sh made for the namespace, read back from it and never printed.
#
# The namespace must not be shared with any other database. workspace-service releases every claimed runner pod its
# own database has not heard of, so this stack gets `singularity-e2e`, apart from both your own previews
# (`singularity-ai`) and PreviewPipelineIT (`singularity-it`). See docs/practices/gotchas/kubernetes.md.
#
# Usage:
#   ./mvnw -DskipTests package                              # once, and again after changing a service
#   e2e/stack.sh up --context kind-singularity              # prepare the namespace, start everything, wait until ready
#   (cd e2e && npm ci && npx playwright install chromium && npm test)
#   e2e/stack.sh down --context kind-singularity            # stop everything, keeping the database and namespace
#   e2e/stack.sh down --context kind-singularity --namespace-too    # and remove both
#
# A later `up` reuses the database and namespace of the last one (see "one unit" below), so it is quick; add
# --skip-cluster to also skip re-applying the manifests and rebuilding the proxy when neither has changed.
#
# --real-ai <env file> runs the configured model instead of the scripted one, for measuring (e2e/real, `npm run
# numbers`). It spends tokens. Only the provider's lines - the key and the spring.ai / ai settings - are copied out of
# the file, into the run folder that `down` leaves and the next `up` deletes; the journey test itself expects the
# scripted model and will fail against a real one.
#
# --context is required and never defaulted, as in every script here that changes a cluster.
set -euo pipefail

export MSYS_NO_PATHCONV=1

COMMAND="${1:-}"
[ $# -gt 0 ] && shift
CONTEXT=""
SEED=true
NAMESPACE_TOO=false
SKIP_CLUSTER=false
REAL_AI_ENV=""
while [ $# -gt 0 ]; do
  case "$1" in
    --context) CONTEXT="$2"; shift 2 ;;
    --no-seed) SEED=false; shift ;;
    --skip-cluster) SKIP_CLUSTER=true; shift ;;
    --real-ai) REAL_AI_ENV="$2"; shift 2 ;;
    --namespace-too) NAMESPACE_TOO=true; shift ;;
    *) echo "Unknown argument: $1" >&2; exit 2 ;;
  esac
done

case "$COMMAND" in
  up|down) ;;
  *) echo "Usage: e2e/stack.sh up|down --context kind-<cluster> [--no-seed] [--skip-cluster] [--real-ai <env file>] [--namespace-too]" >&2; exit 2 ;;
esac
if [ -z "$CONTEXT" ]; then
  echo "Pass --context explicitly, for example --context kind-singularity." >&2
  exit 2
fi
case "$CONTEXT" in
  kind-*) ;;
  *) echo "Refusing to run against '$CONTEXT': this is for kind clusters only." >&2; exit 2 ;;
esac

# `pwd -W` gives a path Windows programs (java, node, docker) can read under Git Bash, and fails everywhere else.
ROOT="$(cd "$(dirname "$0")/.." && (pwd -W 2> /dev/null || pwd))"
E2E="$ROOT/e2e"
RUN="$E2E/.run"
LOGS="$RUN/logs"
PIDS="$RUN/pids"

export E2E_NAMESPACE="${E2E_NAMESPACE:-singularity-e2e}"
export E2E_KUBE_CONTEXT="$CONTEXT"
export E2E_DISCOVERY_PORT="${E2E_DISCOVERY_PORT:-18761}"
export E2E_GATEWAY_PORT="${E2E_GATEWAY_PORT:-18000}"
export E2E_ACCOUNT_PORT="${E2E_ACCOUNT_PORT:-18081}"
export E2E_WORKSPACE_PORT="${E2E_WORKSPACE_PORT:-18082}"
export E2E_INTELLIGENCE_PORT="${E2E_INTELLIGENCE_PORT:-18083}"
export E2E_FRONTEND_PORT="${E2E_FRONTEND_PORT:-14173}"
export E2E_POSTGRES_PORT="${E2E_POSTGRES_PORT:-15432}"
export E2E_AUTH_PORT="${E2E_AUTH_PORT:-19099}"
export E2E_REDIS_PORT="${E2E_REDIS_PORT:-16379}"
export E2E_MINIO_PORT="${E2E_MINIO_PORT:-19000}"
export E2E_PROXY_PORT="${E2E_PROXY_PORT:-18090}"
export E2E_FRONTEND_URL="http://localhost:$E2E_FRONTEND_PORT"
MANAGEMENT_BASE="${E2E_MANAGEMENT_BASE:-19400}"
POSTGRES_CONTAINER="singularity-e2e-pg"
FIREBASE_PROJECT="demo-singularity-e2e"
KN="kubectl --context $CONTEXT -n $E2E_NAMESPACE"

stop_all() {
  if [ -d "$PIDS" ]; then
    for file in "$PIDS"/*; do
      [ -f "$file" ] || continue
      kill "$(cat "$file")" 2> /dev/null || true
      rm -f "$file"
    done
  fi
  docker stop "$POSTGRES_CONTAINER" > /dev/null 2>&1 || true
}

if [ "$COMMAND" = "down" ]; then
  stop_all
  if $NAMESPACE_TOO; then
    docker rm -f "$POSTGRES_CONTAINER" > /dev/null 2>&1 || true
    bash "$ROOT/k8s/preview-test-cluster.sh" --context "$CONTEXT" --namespace "$E2E_NAMESPACE" --down
  fi
  echo "The journey stack is stopped."
  exit 0
fi

background() {
  local name="$1"; shift
  "$@" > "$LOGS/$name.log" 2>&1 &
  echo $! > "$PIDS/$name"
}

wait_for() {
  local what="$1" url="$2" seconds="${3:-180}" log="${4:-}"
  local deadline=$(( $(date +%s) + seconds ))
  until curl -fsS --max-time 5 "$url" > /dev/null 2>&1; do
    if [ "$(date +%s)" -ge "$deadline" ]; then
      echo "$what did not come up within ${seconds}s ($url)." >&2
      [ -n "$log" ] && [ -f "$log" ] && tail -40 "$log" >&2
      exit 1
    fi
    sleep 2
  done
  echo "  $what is up"
}

secret() {
  $KN get secret "$1" -o "jsonpath={.data.$2}" | base64 -d
}

for module in discovery-service gateway-service account-service workspace-service intelligence-service; do
  if ! ls "$ROOT/$module/target/$module-"*.jar > /dev/null 2>&1; then
    echo "No jar for $module. Run ./mvnw -DskipTests package first." >&2
    exit 1
  fi
done
if [ ! -d "$E2E/node_modules/firebase-tools" ]; then
  echo "The test's own packages are not installed. Run: (cd e2e && npm ci)" >&2
  exit 1
fi

stop_all
rm -rf "$RUN"
mkdir -p "$LOGS" "$PIDS"

# The database and the namespace are one unit, made together and thrown away together. Project ids come from the
# database, and the namespace is full of things named after them - stored files, runner pods, routes - so a fresh
# database beside a used namespace hands project 1 the files and the pod of some earlier project 1. Each pairing gets
# a random name, kept in a ConfigMap in the namespace and as a label on the Postgres container; they are reused only
# when the two agree, and otherwise both are made again.
namespace_pairing="$($KN get configmap journey-stack -o 'jsonpath={.data.pairing}' 2> /dev/null || true)"
database_pairing="$(docker inspect -f '{{ index .Config.Labels "journey.pairing" }}' "$POSTGRES_CONTAINER" 2> /dev/null || true)"
if [ -n "$namespace_pairing" ] && [ "$namespace_pairing" = "$database_pairing" ]; then
  FRESH=false
else
  FRESH=true
fi

if $SKIP_CLUSTER && $FRESH; then
  echo "--skip-cluster needs the namespace and database of an earlier run, and they are missing or do not match. Run without it." >&2
  exit 1
fi

cluster_script() {
  if $SEED; then
    bash "$ROOT/k8s/preview-test-cluster.sh" --context "$CONTEXT" --namespace "$E2E_NAMESPACE" --seed "$@"
  else
    bash "$ROOT/k8s/preview-test-cluster.sh" --context "$CONTEXT" --namespace "$E2E_NAMESPACE" "$@"
  fi
}

if $FRESH; then
  docker rm -f "$POSTGRES_CONTAINER" > /dev/null 2>&1 || true
  if kubectl --context "$CONTEXT" get namespace "$E2E_NAMESPACE" > /dev/null 2>&1; then
    echo "Removing namespace $E2E_NAMESPACE, which no database here goes with"
    cluster_script --down > "$LOGS/cluster-down.log" 2>&1
    kubectl --context "$CONTEXT" wait --for=delete "namespace/$E2E_NAMESPACE" --timeout=180s > /dev/null 2>&1 || true
  fi
fi
if ! $SKIP_CLUSTER; then
  echo "Preparing the preview pipeline in namespace $E2E_NAMESPACE of $CONTEXT"
  cluster_script > "$LOGS/cluster.log" 2>&1
fi

echo "Starting Postgres, the Auth emulator and the storage port-forward"
if $FRESH; then
  pairing="$(openssl rand -hex 8)"
  docker run -d --name "$POSTGRES_CONTAINER" --label "journey.pairing=$pairing" -p "127.0.0.1:$E2E_POSTGRES_PORT:5432" \
    -e POSTGRES_DB=postgres -e POSTGRES_USER=e2e -e POSTGRES_PASSWORD=e2e-local-only \
    -v "$ROOT/infra/postgres-init:/docker-entrypoint-initdb.d:ro" \
    pgvector/pgvector:0.8.1-pg18-trixie > /dev/null
  $KN create configmap journey-stack "--from-literal=pairing=$pairing" > /dev/null
else
  docker start "$POSTGRES_CONTAINER" > /dev/null
fi

cat > "$RUN/firebase.json" << JSON
{
  "emulators": {
    "auth": { "host": "127.0.0.1", "port": $E2E_AUTH_PORT },
    "hub": { "host": "127.0.0.1", "port": $(( E2E_AUTH_PORT + 1 )) },
    "logging": { "host": "127.0.0.1", "port": $(( E2E_AUTH_PORT + 2 )) },
    "ui": { "enabled": false },
    "singleProjectMode": true
  }
}
JSON
( cd "$RUN" && exec node "$E2E/node_modules/firebase-tools/lib/bin/firebase.js" emulators:start \
    --only auth --project "$FIREBASE_PROJECT" --config "$RUN/firebase.json" ) > "$LOGS/auth-emulator.log" 2>&1 &
echo $! > "$PIDS/auth-emulator"

minio_pod="$($KN get pods -l app=minio --field-selector=status.phase=Running -o 'jsonpath={.items[0].metadata.name}')"
background minio-forward kubectl --context "$CONTEXT" -n "$E2E_NAMESPACE" port-forward "pod/$minio_pod" "$E2E_MINIO_PORT:9000"

openssl genpkey -algorithm RSA -pkeyopt rsa_keygen_bits:2048 -out "$RUN/firebase-key.pem" 2> /dev/null
node -e '
  const fs = require("fs");
  const [out, key, project] = process.argv.slice(1);
  fs.writeFileSync(out, JSON.stringify({
    type: "service_account",
    project_id: project,
    private_key_id: "e2e",
    private_key: fs.readFileSync(key, "utf8"),
    client_email: "e2e@" + project + ".iam.gserviceaccount.com",
    client_id: "1",
    token_uri: "https://oauth2.googleapis.com/token",
  }));
' "$RUN/firebase-credentials.json" "$RUN/firebase-key.pem" "$FIREBASE_PROJECT"

deadline=$(( $(date +%s) + 90 ))
until docker exec "$POSTGRES_CONTAINER" psql -U e2e -d singularity-intelligence-db -c 'select 1' > /dev/null 2>&1; do
  [ "$(date +%s)" -lt "$deadline" ] || { echo "Postgres did not come up." >&2; docker logs --tail 30 "$POSTGRES_CONTAINER" >&2; exit 1; }
  sleep 2
done
echo "  Postgres is up"
wait_for "The Auth emulator" "http://127.0.0.1:$E2E_AUTH_PORT/" 300 "$LOGS/auth-emulator.log"

# Two people to sign in as by hand, since the emulator starts empty every time and the app refuses an unverified
# email: an owner and someone to share a project with. Their passwords are made here and written to a file in the run
# folder, never printed. Each is given the same Firebase id every time, because the database outlives the emulator: a
# new id for an address the database already knows is refused as "linked to a different sign-in".
emulator="http://127.0.0.1:$E2E_AUTH_PORT/identitytoolkit.googleapis.com/v1"
: > "$RUN/sign-in.txt"
for who in owner friend; do
  password="$(openssl rand -hex 6)-Aa1!"
  curl -fsS -X POST -H 'Content-Type: application/json' -H 'Authorization: Bearer owner'     "$emulator/projects/$FIREBASE_PROJECT/accounts"     -d "{\"localId\":\"local-$who\",\"email\":\"$who@example.com\",\"password\":\"$password\",\"displayName\":\"Local $who\",\"emailVerified\":true}" > /dev/null
  echo "$who@example.com  $password" >> "$RUN/sign-in.txt"
done

export DB_USERNAME=e2e
export DB_PASSWORD=e2e-local-only
export EUREKA_SERVER_URL="http://localhost:$E2E_DISCOVERY_PORT/eureka/"
export INTERNAL_SERVICE_SHARED_SECRET="$(openssl rand -hex 24)"
export FIREBASE_PROJECT_ID="$FIREBASE_PROJECT"
export FIREBASE_CREDENTIALS_PATH="$RUN/firebase-credentials.json"
export FIREBASE_AUTH_EMULATOR_HOST="127.0.0.1:$E2E_AUTH_PORT"
export STRIPE_SECRET="sk_test_journey_never_calls_stripe"
export STRIPE_WEBHOOK_SECRET="whsec_journey_never_calls_stripe"
export STRIPE_PRICE_PRO="price_journey_pro"
export STRIPE_PRICE_BUSINESS="price_journey_business"
export OPENROUTER_API_KEY="not-used-by-the-stub"
export MINIO_ACCESS_KEY="$(secret minio-root-credentials username)"
export MINIO_SECRET_KEY="$(secret minio-root-credentials password)"
export PREVIEW_ACCESS_TOKEN_SECRET="$(secret preview-access-token secret)"
export SPRING_CONFIG_ADDITIONAL_LOCATION="file:$E2E/config/"
export DISCOVERY_SERVICE_PORT="$E2E_DISCOVERY_PORT"
export GATEWAY_SERVICE_PORT="$E2E_GATEWAY_PORT"
export ACCOUNT_SERVICE_PORT="$E2E_ACCOUNT_PORT"
export WORKSPACE_SERVICE_PORT="$E2E_WORKSPACE_PORT"
export INTELLIGENCE_SERVICE_PORT="$E2E_INTELLIGENCE_PORT"

# Each service runs from a folder of its own so none of them reads a .env that happens to sit in the repository.
service() {
  local module="$1" number="$2"; shift 2
  local jar
  jar="$(ls "$ROOT/$module/target/$module-"*.jar | grep -v -- '-sources' | head -1)"
  mkdir -p "$RUN/$module"
  ( cd "$RUN/$module" && MANAGEMENT_SERVER_PORT=$(( MANAGEMENT_BASE + number )) exec env "$@" java -jar "$jar" ) \
    > "$LOGS/$module.log" 2>&1 &
  echo $! > "$PIDS/$module"
}
health() {
  wait_for "$1" "http://127.0.0.1:$(( MANAGEMENT_BASE + $2 ))/actuator/health" 240 "$LOGS/$1.log"
}

echo "Starting the services"
service discovery-service 1 E2E=1
health discovery-service 1
database="jdbc:postgresql://127.0.0.1:$E2E_POSTGRES_PORT"
service account-service 2 "SPRING_DATASOURCE_URL=$database/singularity-account-db"
service workspace-service 3 "SPRING_DATASOURCE_URL=$database/singularity-workspace-db"
if [ -n "$REAL_AI_ENV" ]; then
  [ -f "$REAL_AI_ENV" ] || { echo "No env file at $REAL_AI_ENV." >&2; exit 1; }
  mkdir -p "$RUN/intelligence-service"
  grep -E '^(OPENROUTER_API_KEY|spring\.ai\.|ai\.)' "$REAL_AI_ENV" > "$RUN/intelligence-service/.env"
  echo "  intelligence-service will call the configured model: this run spends tokens"
  service intelligence-service 4 -u OPENROUTER_API_KEY "SPRING_DATASOURCE_URL=$database/singularity-intelligence-db"
else
  service intelligence-service 4 "SPRING_DATASOURCE_URL=$database/singularity-intelligence-db" SPRING_PROFILES_ACTIVE=stub-ai
fi
service gateway-service 5 E2E=1
health account-service 2
health workspace-service 3
health intelligence-service 4
health gateway-service 5

# A service being up is not the Gateway knowing where it is: that takes one more round of discovery.
wait_for "The Gateway's route to account-service" "http://127.0.0.1:$E2E_GATEWAY_PORT/api/plans" 180 "$LOGS/gateway-service.log"

echo "Building and serving the frontend"
(
  cd "$ROOT/frontend"
  [ -d node_modules ] || npm ci --no-audit --no-fund > "$LOGS/frontend-install.log" 2>&1
  VITE_FIREBASE_API_KEY=journey-key \
  VITE_FIREBASE_AUTH_DOMAIN="$FIREBASE_PROJECT.firebaseapp.com" \
  VITE_FIREBASE_PROJECT_ID="$FIREBASE_PROJECT" \
  VITE_FIREBASE_APP_ID=journey-app \
  VITE_FIREBASE_AUTH_EMULATOR_URL="http://127.0.0.1:$E2E_AUTH_PORT" \
  VITE_CSP_FRAME_ORIGINS="http://*.localhost:$E2E_PROXY_PORT" \
  node node_modules/vite/bin/vite.js build --outDir "$RUN/frontend-dist" --emptyOutDir > "$LOGS/frontend-build.log" 2>&1
)
(
  cd "$ROOT/frontend"
  API_PROXY_TARGET="http://127.0.0.1:$E2E_GATEWAY_PORT" exec node node_modules/vite/bin/vite.js preview \
    --outDir "$RUN/frontend-dist" --port "$E2E_FRONTEND_PORT" --strictPort --host 127.0.0.1
) > "$LOGS/frontend.log" 2>&1 &
echo $! > "$PIDS/frontend"
wait_for "The frontend" "http://127.0.0.1:$E2E_FRONTEND_PORT/" 60 "$LOGS/frontend.log"

cat > "$RUN/stack.json" << JSON
{
  "frontend": "http://localhost:$E2E_FRONTEND_PORT",
  "gateway": "http://127.0.0.1:$E2E_GATEWAY_PORT",
  "authEmulator": "http://127.0.0.1:$E2E_AUTH_PORT",
  "firebaseProject": "$FIREBASE_PROJECT",
  "previewPort": $E2E_PROXY_PORT,
  "ai": "$([ -n "$REAL_AI_ENV" ] && echo real || echo stub)"
}
JSON

echo "The journey stack is ready at http://localhost:$E2E_FRONTEND_PORT (logs in e2e/.run/logs)."
echo "To look around by hand, sign in as one of the two people in e2e/.run/sign-in.txt."
