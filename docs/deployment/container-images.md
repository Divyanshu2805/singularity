# Container Images

Eight arm64 images, built natively on GitHub's Arm runners (`ubuntu-24.04-arm`), tagged with the commit SHA, and published to `ghcr.io/divyanshu2805/vibecraft-<name>`. No secret is baked into any image, and every image runs as a non-root user.

| Image | Dockerfile | Base | Notes |
|---|---|---|---|
| `discovery`, `gateway`, `account`, `workspace`, `intelligence` | `docker/java-service.Dockerfile` (`MODULE` build argument) | `eclipse-temurin:25-jre-alpine` | Built from the exact jars the test job produced. Spring Boot's layered extraction (`-Djarmode=tools extract --layers`) puts dependencies and application code in separate layers, so a typical deploy pulls only the small application layer. Runs as user `spring` (uid 1000). |
| `frontend` | `frontend/Dockerfile` | `nginxinc/nginx-unprivileged:1.27-alpine` | `npm ci` and `vite build` with the public `VITE_*` values as build arguments. Hashed `/assets/*` are cached for a year; everything else, including deep links, falls back to `index.html` with `no-cache`, so a deploy is visible on the next load. |
| `preview-proxy` | `proxy/Dockerfile` | `node:20-alpine` | `npm ci --omit=dev` from the lockfile; runs as `node`. |
| `preview-runner` | `docker/preview-runner.Dockerfile` | `node:20-alpine` | Pre-installs the starter template's npm packages at `/opt/template-node-modules`. The runner pool's init container copies them into each warm pod, so a preview's `npm install` finds everything already present. |

`.dockerignore` files at the repository root, in `frontend/` and in `proxy/` keep each build context to what its Dockerfile needs.

## Building locally

```bash
./mvnw clean package
for m in discovery gateway account workspace intelligence; do
  docker build -f docker/java-service.Dockerfile --build-arg MODULE=${m}-service -t vibecraft-${m}:local .
done
docker build -t vibecraft-frontend:local frontend/
docker build -t vibecraft-preview-proxy:local proxy/
docker build -f docker/preview-runner.Dockerfile -t vibecraft-preview-runner:local \
  workspace-service/src/main/resources/starter-templates/react-vite-tailwind-daisyui-starter
```

The [kind rehearsal README](../../deploy/k8s/overlays/kind/README.md) lists the build arguments the frontend needs and how to load the images into a cluster.

## Registry visibility

A newly pushed GHCR package can default to private even from a public repository. If a deploy can't pull an image, set that package's visibility to public in its settings.
