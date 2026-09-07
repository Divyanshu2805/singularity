# Pre-installs the starter template's npm packages, so a fresh preview pod's first `npm install` finds every package
# already in node_modules and has nothing to download - the difference between a ~30-90s install and a preview
# starting in seconds (docs/deployment/phase-2-container-images.md Phase 2's spec for this image, Phase 7's "Faster previews").
#
# Wired in by deploy/k8s/base/runner-pods.yaml: an initContainer running THIS image copies /opt/template-node-modules
# into the pod's (still-empty) workspace volume as /app/node_modules before the runner container starts. A plain
# volumeMount over /app would not work - the workspace emptyDir mounts over that path and would shadow anything baked
# in there - hence the copy. It happens while the pod sits idle in the warm pool, so no user waits for it; and
# PreviewBootstrapper's mirror already excludes node_modules, so the syncing of project files leaves it alone.
#
# The npm download cache is deliberately not kept in the image (`--cache` to a directory removed in the same layer):
# left in, it more than doubled the image (1.08 GB against ~0.5 GB), and CI pushes a fresh image for every commit,
# so the node would pull that extra half-gigabyte on every deploy for a cache nothing reads.
#
# No package-lock.json exists for the starter template (CLAUDE.md/deployment plan: checked in without one), so this
# is a plain `npm install` against its package.json's semver ranges, not a reproducible `npm ci` - acceptable here
# since this image only seeds a head start, it never runs the app itself; the real `npm install` at preview time
# still runs against whatever the project's actual (possibly AI-modified) package.json is, and adds or fixes only
# what differs from the seed.
#
# Build context is the starter template's own directory, not the repo root:
#   docker build -f docker/preview-runner.Dockerfile \
#     workspace-service/src/main/resources/starter-templates/react-vite-tailwind-daisyui-starter
FROM node:20.20.2-alpine
WORKDIR /opt/template
COPY package.json ./
RUN npm install --no-audit --no-fund --cache /tmp/npm-cache \
 && rm -rf /tmp/npm-cache \
 && mv node_modules /opt/template-node-modules
USER node
