# Phase 2: Container images

Eight arm64 images, built natively on [GitHub's free Arm runners](https://github.blog/changelog/2025-08-07-arm64-hosted-runners-for-public-repositories-are-now-generally-available/) (`ubuntu-24.04-arm`), each tagged with its commit SHA. Every base image already publishes an arm64 build (checked 2026-08-24).

| Image | Base | How it's built |
| --- | --- | --- |
| discovery, gateway, account, workspace, intelligence | `eclipse-temurin:25-jre-alpine` | One shared Dockerfile with a `MODULE` argument. Jars come from the tested reactor build, and Spring Boot's layered extraction means a deploy only pulls the small app layer. |
| frontend | `nginx-unprivileged` (alpine) | `npm run build` with the Firebase public config and `VITE_CSP_FRAME_ORIGINS=https://*.<domain>`, SPA fallback to `index.html`, long cache for hashed assets |
| preview-proxy | `node:20.20.2-alpine` (existing Dockerfile) | Add a `package-lock.json` and switch `npm install` to `npm ci` |
| preview runner (Phase 7) | `node:20.20.2-alpine` | Pre-installs the starter template's npm packages, so a preview starts in seconds instead of about a minute |

- **JVM memory settings:** `JAVA_TOOL_OPTIONS=-XX:MaxRAMPercentage=75 -XX:+UseSerialGC -Xss512k`, so each service stays inside its container limit.
- **Non-root:** every image runs as a non-root user, matching the existing proxy and preview-pod security settings.
- **Registry:** `ghcr.io/divyanshu2805/vibecraft-<name>:<sha>`, public. No secrets are baked into any image.
- **Time:** 3–5 hours.
