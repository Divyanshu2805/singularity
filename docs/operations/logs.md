# Logs

- **Reading logs:** `kubectl logs`. There is no log shipping or aggregation.
- **Retention:** container logs are size-capped by the kubelet's defaults — 10 Mi and 5 rotated files per container.
- **Correlating a user report:** every error response carries a `requestId`, and the full error is logged with it. Search the owning service's log for the id the user quotes.

## What is not logged

- **SQL** — `SPRING_JPA_SHOW_SQL=false` in the deployed manifests.
- **AI prompts and responses** — no service enables the Spring AI `chat.client` debug logging that would record them in full.
- **Credentials** — log lines about tokens report counts only, and the preview proxy logs hostnames and error messages, never access tokens.
