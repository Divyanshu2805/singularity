#!/usr/bin/env sh
# The backend does this itself while it runs (PreviewPortForwarder); only needed when preview.port-forward is disabled.
# Same as dev-port-forward.ps1, for macOS/Linux/Git Bash: the preview proxy on 8090 and Redis on 6379, each
# restarted if it drops. Ctrl+C stops both.
NAMESPACE=vibecraft-ai

forward() {
  while true; do
    echo "[$1] forwarding $3"
    kubectl -n "$NAMESPACE" port-forward "$2" "$3" --address 127.0.0.1
    echo "[$1] dropped, reconnecting in 2s"
    sleep 2
  done
}

trap 'kill 0' INT TERM EXIT
forward "preview proxy" svc/vibecraft-proxy-svc 8090:80 &
forward "redis" svc/redis-service 6379:6379 &
echo "Previews: http://<preview>.localhost:8090   Redis: localhost:6379   (Ctrl+C to stop)"
wait
