# Logs

- Read them with `kubectl logs`; there is no log shipping. Container logs are size-capped by the kubelet's defaults (10 Mi and 5 rotated files per container - k3s is not configured to change them, checked on the node), and at the last check all pod logs together were a few megabytes.
- SQL logging is off in production (`SPRING_JPA_SHOW_SQL=false` in the three service manifests). No service sets the Spring AI `chat.client` DEBUG level that would log every prompt in full.
- The code does not log credentials: the log lines that mention tokens report counts, and the proxy logs hostnames and error messages only. Preview access tokens are never logged.
