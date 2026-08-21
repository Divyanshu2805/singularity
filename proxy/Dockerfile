# CODE_REVIEW.md OPS-01: pinned to the version this image was actually verified against, not the floating
# `20-alpine` major-version tag.
FROM node:20.20.2-alpine
WORKDIR /app
COPY package.json ./
RUN npm install
COPY index.js auth.js routing.js ./
# index.js's own default is 80 (root-only); k8s/vibecraft-proxy.yml overrides PORT to 8080 so the container can
# run as a non-root user (CODE_REVIEW.md OPS-01) - this EXPOSE reflects that actual deployment, not the code default.
EXPOSE 8080
CMD ["node", "index.js"]