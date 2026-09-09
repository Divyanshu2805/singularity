# 0003. Run generated code only in Kubernetes runner pods

**Status:** Accepted

## Context

The product's promise is a live, running preview of an AI-generated project. That means installing arbitrary npm packages and running arbitrary code that neither the user nor the platform has reviewed. Running it anywhere near the backend — in a request thread, a background job, or a local shell — would give that code access to secrets, databases and the network the services use.

## Decision

Generated and user-authored code executes **only** inside disposable runner pods in a dedicated `vibecraft-ai` namespace, reached through the Kubernetes `exec` API. workspace-service claims a warm pod from a pool, syncs the project's files in, runs `npm install` and the Vite dev server there, and routes a preview hostname to it through Redis and a standalone Node proxy.

Runner pods are non-root with every capability dropped, have no service-account token, are bound by resource quotas and a PID limit, and sit behind a `NetworkPolicy` that admits only the preview proxy and blocks private cluster ranges and cloud metadata. They read project files with a MinIO user scoped to read-only access on one bucket.

## Consequences

- Live previews need a real Kubernetes cluster, locally as well as in production; every other feature works without one.
- The pipeline is almost entirely stack-agnostic, but the pod image, boot script, readiness probe and port are specific to React + Vite today.
- Preview capacity is bounded by cluster resources, not by the services: when every runner is claimed, users see a distinct "every runner is busy" response.
- Preview URLs need their own access control, since a hostname alone would be a permanent unauthenticated link. See [preview access tokens](../security-model.md#preview-access-tokens).
