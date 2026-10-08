#!/usr/bin/env bash
# Checks that the projects a build benchmark wrote really compile.
#
#   scripts/bench-verify.sh <the benchmark's output folder>
#
# BuildBenchmarkIT writes, under <folder>/projects/<scenario>/, the project as each turn left it. The pipeline itself
# can only say that a turn's files parse and that their imports resolve; this says whether the TypeScript compiler
# and the bundler accept them, which is the difference between "the turn was saved" and "the app builds". The result
# is printed and written to <folder>/verify.md, one row per scenario.
#
# Everything runs in one throwaway container. The projects are AI-generated code, and building one runs its
# vite.config.js, so nothing of it is ever installed, compiled or run on this machine: the folder is mounted
# read-only, each project is copied inside the container, and the container is removed when it finishes. Only npm's
# download cache is kept, in a named Docker volume, so a second run does not download the packages again.
#
# Packages are installed once per distinct package.json, not once per project: most projects of a run share the
# starter template's, and the install is most of the time. A project that added a package gets its own install.
#
# It needs Docker and network access to the npm registry. It does not start the app in a browser: a project that
# compiles and bundles can still fail when it runs.
set -euo pipefail

if [ "$#" -ne 1 ] || [ ! -d "$1/projects" ]; then
  echo "usage: scripts/bench-verify.sh <benchmark output folder holding a projects/ directory>" >&2
  exit 2
fi

OUT="$(cd "$1" && pwd)"
MOUNT="$OUT/projects"
if command -v cygpath >/dev/null 2>&1; then
  MOUNT="$(cygpath -w "$MOUNT")"
fi

INNER='
set -u
echo "| Scenario | Installs | Type-checks | Bundles | First problem |"
echo "|---|---|---|---|---|"
total=0; good=0
for project in /projects/*/; do
  name=$(basename "$project")
  total=$((total + 1))
  rm -rf /work && mkdir -p /work && cp -R "$project". /work/ && cd /work
  key=$(sha1sum package.json | cut -c1-12)
  installed=ok
  if [ ! -d "/modules/$key/node_modules" ]; then
    mkdir -p "/modules/$key" && cp package.json "/modules/$key/" && \
      (cd "/modules/$key" && npm install --no-audit --no-fund --loglevel=error --cache /npm-cache > /tmp/install.log 2>&1) \
      || installed=FAILED
  fi
  types=-; bundle=-; problem=""
  if [ "$installed" = ok ]; then
    ln -s "/modules/$key/node_modules" node_modules
    if node_modules/.bin/tsc --noEmit --pretty false > /tmp/tsc.log 2>&1; then types=ok; else types=FAILED; problem=$(grep -m1 "error TS" /tmp/tsc.log); fi
    if node_modules/.bin/vite build --logLevel error > /tmp/build.log 2>&1; then bundle=ok; else bundle=FAILED; [ -z "$problem" ] && problem=$(grep -m1 -i "error" /tmp/build.log); fi
  else
    problem=$(grep -m1 -i "err" /tmp/install.log)
  fi
  [ "$installed" = ok ] && [ "$types" = ok ] && [ "$bundle" = ok ] && good=$((good + 1))
  echo "| $name | $installed | $types | $bundle | $(printf "%s" "$problem" | tr "|" "/" | cut -c1-160) |"
done
echo
echo "$good of $total projects install, type-check and bundle."
'

MSYS_NO_PATHCONV=1 docker run --rm \
  -v "$MOUNT:/projects:ro" \
  -v singularity-bench-npm-cache:/npm-cache \
  node:20.20.2-alpine sh -c "$INNER" | tee "$OUT/verify.md"
