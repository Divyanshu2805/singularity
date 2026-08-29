# Pre-installs the starter template's npm packages, so a fresh preview pod's first install mostly resolves from a
# warm local cache instead of hitting npm's registry cold - the difference between a ~30-90s install and a preview
# starting in seconds (docs/deployment/phase-2-container-images.md Phase 2's spec for this image).
#
# Built now; NOT yet wired into k8s/runner-pods.yml - that's Phase 7 ("Faster previews: switch the preview pool to
# the pre-baked runner image from Phase 2"), because runner-pods.yml's `runner` container currently mounts an
# *empty* emptyDir volume over /app, which would shadow anything baked in at that same path. Phase 7's wiring needs
# to copy this image's /opt/template-node-modules into the (still-empty) workspace volume before the backend execs
# `npm install` for a preview - an initContainer or postStart hook, not a plain volumeMount over /app.
#
# No package-lock.json exists for the starter template (CLAUDE.md/deployment plan: checked in without one), so this
# is a plain `npm install` against its package.json's semver ranges, not a reproducible `npm ci` - acceptable here
# since this image only warms npm's cache, it never runs the app itself; the real `npm install` at preview time
# still runs against whatever the project's actual (possibly AI-modified) package.json is.
#
# Build context is the starter template's own directory, not the repo root:
#   docker build -f docker/preview-runner.Dockerfile \
#     workspace-service/src/main/resources/starter-templates/react-vite-tailwind-daisyui-starter
FROM node:20.20.2-alpine
WORKDIR /opt/template
COPY package.json ./
RUN npm install && mv node_modules /opt/template-node-modules
USER node
