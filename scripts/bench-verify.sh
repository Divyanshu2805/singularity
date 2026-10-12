#!/usr/bin/env bash
# Checks that the projects a build benchmark wrote really compile.
#
#   scripts/bench-verify.sh <the benchmark's output folder>
#
# BuildBenchmarkIT writes, under <folder>/projects/<scenario>/, the project as each turn left it. The pipeline itself
# can only say that a turn's files parse and that their imports resolve; this says whether the TypeScript compiler
# and the bundler accept them, which is the difference between "the turn was saved" and "the app builds". A project
# that holds a server of its own (server/index.ts) is also started the way a host would start it - `npm start` after
# the build, on a port given in PORT - and counts only if it is listening there within twenty seconds, answers a
# request for the page with the built page, and passes a request under /api on to the project's own server, which is
# what lets the project be hosted as one program. A project with no server shows "-" in both columns. The result is
# printed and written to <folder>/verify.md, one row per scenario.
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
# compiles and bundles can still fail when it runs, and a server that listens can still answer a route wrongly.
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
echo "| Scenario | Installs | Type-checks | Bundles | Runs as one program on PORT | Serves its pages and its API | First problem |"
echo "|---|---|---|---|---|---|---|"
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
  types=-; bundle=-; server=-; pages=-; problem=""
  if [ "$installed" = ok ]; then
    ln -s "/modules/$key/node_modules" node_modules
    if node_modules/.bin/tsc --noEmit --pretty false > /tmp/tsc.log 2>&1; then types=ok; else types=FAILED; problem=$(grep -m1 "error TS" /tmp/tsc.log); fi
    if node_modules/.bin/vite build --logLevel error > /tmp/build.log 2>&1; then bundle=ok; else bundle=FAILED; [ -z "$problem" ] && problem=$(grep -m1 -i "error" /tmp/build.log); fi
    if [ -f server/index.ts ]; then
      server=FAILED; pages=FAILED
      if [ -x node_modules/.bin/tsx ] && [ -f start.mjs ]; then
        PORT=4777 NODE_NO_WARNINGS=1 node start.mjs > /tmp/server.log 2>&1 &
        pid=$!
        for _ in 1 2 3 4 5 6 7 8 9 10 11 12 13 14 15 16 17 18 19 20; do
          if nc -z 127.0.0.1 4777 2> /dev/null && nc -z 127.0.0.1 3001 2> /dev/null; then server=ok; break; fi
          kill -0 "$pid" 2> /dev/null || break
          sleep 1
        done
        if [ "$server" = ok ] && [ "$bundle" = ok ]; then
          page=no; api=no
          if wget -q -T 5 -O - http://127.0.0.1:4777/ 2> /dev/null | grep -q "id=\"root\""; then page=yes; fi
          status=$(wget -S -T 5 -O /dev/null http://127.0.0.1:4777/api/ 2>&1 | grep -m1 "HTTP/" | tr -dc "0-9 " | cut -d" " -f3)
          if [ -n "$status" ] && [ "$status" != 502 ]; then api=yes; fi
          if [ $page = yes ] && [ $api = yes ]; then pages=ok; fi
          [ "$pages" != ok ] && [ -z "$problem" ] && problem="page served: $page, /api reached the server: $api"
        fi
        kill "$pid" 2> /dev/null; wait "$pid" 2> /dev/null
      elif [ ! -f start.mjs ]; then
        echo "the project has no start.mjs" > /tmp/server.log
      else
        echo "tsx is not installed" > /tmp/server.log
      fi
      [ "$server" = ok ] || { [ -z "$problem" ] && problem=$(grep -m1 -v "^$" /tmp/server.log); }
    fi
  else
    problem=$(grep -m1 -i "err" /tmp/install.log)
  fi
  [ "$installed" = ok ] && [ "$types" = ok ] && [ "$bundle" = ok ] && [ "$server" != FAILED ] && [ "$pages" != FAILED ] && good=$((good + 1))
  echo "| $name | $installed | $types | $bundle | $server | $pages | $(printf "%s" "$problem" | tr "|" "/" | cut -c1-160) |"
done
echo
echo "$good of $total projects install, type-check and bundle, and - when they have a server - start it on the port they are given and serve their pages from it."
'

MSYS_NO_PATHCONV=1 docker run --rm \
  -v "$MOUNT:/projects:ro" \
  -v singularity-bench-npm-cache:/npm-cache \
  node:22.22.0-alpine sh -c "$INNER" | tee "$OUT/verify.md"
