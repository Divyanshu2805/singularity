# Handles: building the Vite SPA and serving the static output from an unprivileged nginx.
#
# Firebase's public config and the preview-frame CSP origins are baked into the bundle at build time - Vite inlines
# `import.meta.env.VITE_*` into the JS, there is no runtime env for a static build - so they're Docker build args,
# supplied from the GitHub `production` environment's VITE_FIREBASE_*/APP_DOMAIN values (docs/deployment/
# Phase 0/2). None of them are secrets: see .env.example's own comment. VITE_PAYMENTS_TEST_MODE is the one that
# isn't a value from that environment: CI sets it to `true` while the deployed app uses Stripe's test keys, which
# makes the pricing and billing pages say so (src/lib/payments-mode.ts); it goes when the app moves to live keys.
FROM node:20.20.2-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
ARG VITE_FIREBASE_API_KEY
ARG VITE_FIREBASE_AUTH_DOMAIN
ARG VITE_FIREBASE_PROJECT_ID
ARG VITE_FIREBASE_APP_ID
ARG VITE_CSP_FRAME_ORIGINS
ARG VITE_PAYMENTS_TEST_MODE
RUN npm run build

# nginx-unprivileged already runs as a non-root user (uid 101) and listens on 8080 by default - no extra
# securityContext work needed here beyond what k8s/*.yml sets for every other pod.
FROM nginxinc/nginx-unprivileged:1.27-alpine
COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 8080
