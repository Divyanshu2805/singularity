#!/usr/bin/env bash
# One-shot copy of legacy-monolith's data into the three services' databases (Phase 4 cutover).
#
#   ./infra/data-migration/legacy-to-services.sh             # DRY RUN: does everything, then rolls back
#   ./infra/data-migration/legacy-to-services.sh --execute   # same, but commits
#
# What it does, per target database (account -> workspace -> intelligence), in ONE transaction:
#   1. TRUNCATE every table the script owns (never flyway_schema_history) - this wipes whatever the services
#      accumulated while being verified standalone (a test user, seeded plans, a test usage row).
#   2. COPY each table from the legacy database, parents before children.
#   3. Assert every table's row count equals the legacy count. A mismatch aborts the whole transaction.
#   4. --execute only: setval() every id sequence to max(id), then COMMIT.
#
# The legacy database is only ever SELECTed from. Nothing here writes to it.
#
# WHY IT IS SHAPED THIS WAY
#   * The column list of each COPY is read from the TARGET database's information_schema, so the script can't
#     drift from the Flyway migrations. A column that exists in legacy but not in the target (users.google_subject,
#     project_files.created_by/updated_by - dropped on purpose in Phases 1-2) is simply not copied. A target column
#     with no legacy source is an error, not a silent NULL.
#   * Legacy timestamps are timestamptz; the services' columns are `timestamp without time zone` and hold UTC
#     wall-clock (verified: the services write and read them as UTC). So those columns are copied as
#     `col AT TIME ZONE 'UTC'`, which is independent of any session time zone. Only applied when the legacy column
#     is timestamptz AND the target is plain timestamp, so it stays correct if a target column is ever widened.
#   * Legacy ids are identity columns, the services' are BIGSERIAL. COPY writes explicit ids without advancing the
#     sequence, so every sequence is reset afterwards or the first real insert would collide. setval() is not
#     transactional, which is why a dry run skips it.
#   * The services and legacy-monolith must be STOPPED first (their connection pools keep sessions open). The
#     script refuses to run otherwise: it guarantees a quiescent source and lets TRUNCATE take its locks.
#   * Re-running --execute after the new services have taken real writes DESTROYS those writes (it truncates).
#     That is the point of the dry-run default.
#
# Needs: bash, docker, and the Postgres container from docker-compose (override the names below if yours differ).

set -euo pipefail
export MSYS_NO_PATHCONV=1   # Git Bash on Windows otherwise rewrites arguments that start with a slash

PG_CONTAINER="${PG_CONTAINER:-pgvector-vibecraft}"
PG_USER="${PG_USER:-user}"
LEGACY_DB="${LEGACY_DB:-vibecraft-db}"
ACCOUNT_DB="${ACCOUNT_DB:-vibecraft-account-db}"
WORKSPACE_DB="${WORKSPACE_DB:-vibecraft-workspace-db}"
INTELLIGENCE_DB="${INTELLIGENCE_DB:-vibecraft-intelligence-db}"

# Parents before children (the services' databases enforce these foreign keys).
ACCOUNT_TABLES=(plans users subscriptions revoked_sessions auth_audit_events password_reset_tokens)
WORKSPACE_TABLES=(projects project_members project_files previews preview_sessions)
INTELLIGENCE_TABLES=(chat_sessions chat_messages chat_events code_notes usage_events usage_logs)

EXECUTE=false
case "${1:-}" in
  --execute) EXECUTE=true ;;
  "") ;;
  *) echo "usage: $0 [--execute]" >&2; exit 2 ;;
esac

# `query DB SQL` -> unaligned tuples only. `pg DB` -> a psql session that reads its script from stdin.
query() { docker exec -e PGCLIENTENCODING=UTF8 "$PG_CONTAINER" psql -U "$PG_USER" -d "$1" -X -At -v ON_ERROR_STOP=1 -c "$2"; }
pg()    { docker exec -i -e PGCLIENTENCODING=UTF8 "$PG_CONTAINER" psql -U "$PG_USER" -d "$1" -X -At -q -v ON_ERROR_STOP=1; }
say()   { printf '\n== %s\n' "$*"; }
die()   { printf '\nERROR: %s\n' "$*" >&2; exit 1; }

say "legacy-to-services: $($EXECUTE && echo 'EXECUTE (will commit)' || echo 'DRY RUN (will roll back)')"

# ---- 1. preflight ---------------------------------------------------------------------------------------------

say "Preflight: nothing may be connected to the databases involved"
sessions=$(query postgres "select datname||' ('||coalesce(nullif(application_name,''),'?')||', '||state||')'
  from pg_stat_activity where datname in ('$LEGACY_DB','$ACCOUNT_DB','$WORKSPACE_DB','$INTELLIGENCE_DB')
  and pid <> pg_backend_pid()")
if [ -n "$sessions" ]; then
  printf '%s\n' "$sessions" >&2
  die "the sessions above are still open. Stop legacy-monolith and account/workspace/intelligence-service first."
fi
echo "ok - no open sessions"

say "Preflight: every table on both sides is accounted for"
mapped=$(printf '%s\n' "${ACCOUNT_TABLES[@]}" "${WORKSPACE_TABLES[@]}" "${INTELLIGENCE_TABLES[@]}" | sort)
legacy_tables=$(query "$LEGACY_DB" "select tablename from pg_tables where schemaname='public' order by 1")
[ "$mapped" == "$legacy_tables" ] || die "legacy has tables this script doesn't map (or vice versa):
$(diff <(echo "$legacy_tables") <(echo "$mapped") || true)"
check_target_tables() { # db tables...
  local db=$1; shift
  local expected actual
  expected=$(printf '%s\n' "$@" | sort)
  actual=$(query "$db" "select tablename from pg_tables where schemaname='public' and tablename <> 'flyway_schema_history' order by 1")
  [ -n "$actual" ] || die "$db has no tables - start its service once so Flyway creates the schema."
  [ "$expected" == "$actual" ] || die "$db's tables don't match this script's list:
$(diff <(echo "$actual") <(echo "$expected") || true)"
}
check_target_tables "$ACCOUNT_DB" "${ACCOUNT_TABLES[@]}"
check_target_tables "$WORKSPACE_DB" "${WORKSPACE_TABLES[@]}"
check_target_tables "$INTELLIGENCE_DB" "${INTELLIGENCE_TABLES[@]}"
echo "ok - all legacy tables map to exactly one service database"

say "Legacy-side dangling ids (warn only - they are copied 1:1 either way)"
# Copied ids stay identical, so referential problems can be read straight off the legacy database. The services
# hold these references as plain columns with no foreign key, so a dangling one is copied, not rejected.
# usage_events / usage_logs / previews had no foreign keys in legacy either, so those are the ones that can dangle.
orphans=$(query "$LEGACY_DB" "
  select 'project_members.user_id -> users', count(*) from project_members m where not exists (select 1 from users u where u.id = m.user_id)
  union all select 'chat_sessions.user_id -> users', count(*) from chat_sessions c where not exists (select 1 from users u where u.id = c.user_id)
  union all select 'chat_sessions.project_id -> projects', count(*) from chat_sessions c where not exists (select 1 from projects p where p.id = c.project_id)
  union all select 'code_notes.user_id -> users', count(*) from code_notes n where not exists (select 1 from users u where u.id = n.user_id)
  union all select 'code_notes.project_id -> projects', count(*) from code_notes n where not exists (select 1 from projects p where p.id = n.project_id)
  union all select 'usage_events.user_id -> users', count(*) from usage_events e where not exists (select 1 from users u where u.id = e.user_id)
  union all select 'usage_events.project_id -> projects', count(*) from usage_events e where e.project_id is not null and not exists (select 1 from projects p where p.id = e.project_id)
  union all select 'usage_logs.user_id -> users', count(*) from usage_logs l where not exists (select 1 from users u where u.id = l.user_id)
  union all select 'previews.project_id -> projects', count(*) from previews v where not exists (select 1 from projects p where p.id = v.project_id)")
while IFS='|' read -r what n; do
  printf '  %-40s %s\n' "$what" "$([ "$n" = 0 ] && echo 0 || echo "$n  <-- WARNING")"
done <<< "$orphans"

# ---- 2. plan the copy (main shell, so any mapping problem stops us before a single row moves) ------------------

declare -A COLS SEL LEGACY_COUNT HAS_ID

plan_table() { # target_db table
  local db=$1 t=$2 tcols lcols col ttype ltype
  tcols=$(query "$db" "select column_name||'|'||data_type from information_schema.columns
    where table_schema='public' and table_name='$t' order by ordinal_position")
  lcols=$(query "$LEGACY_DB" "select column_name||'|'||data_type from information_schema.columns
    where table_schema='public' and table_name='$t'")
  COLS[$t]=""; SEL[$t]=""; HAS_ID[$t]=""
  while IFS='|' read -r col ttype; do
    ltype=$(grep -m1 "^${col}|" <<< "$lcols" | cut -d'|' -f2 || true)
    [ -n "$ltype" ] || die "$db.$t.$col has no source column in legacy - refusing to guess a value."
    COLS[$t]+="\"$col\", "
    if [ "$ltype" = "timestamp with time zone" ] && [ "$ttype" = "timestamp without time zone" ]; then
      SEL[$t]+="\"$col\" AT TIME ZONE 'UTC', "
    else
      SEL[$t]+="\"$col\", "
    fi
    if [ "$col" = "id" ]; then HAS_ID[$t]=1; fi
  done <<< "$tcols"
  COLS[$t]=${COLS[$t]%, }; SEL[$t]=${SEL[$t]%, }
  LEGACY_COUNT[$t]=$(query "$LEGACY_DB" "select count(*) from \"$t\"")
}

for t in "${ACCOUNT_TABLES[@]}"; do plan_table "$ACCOUNT_DB" "$t"; done
for t in "${WORKSPACE_TABLES[@]}"; do plan_table "$WORKSPACE_DB" "$t"; done
for t in "${INTELLIGENCE_TABLES[@]}"; do plan_table "$INTELLIGENCE_DB" "$t"; done

# ---- 3. one transaction per target database -------------------------------------------------------------------

migrate() { # target_db tables...
  local db=$1; shift
  local tables=("$@") t list D='$$'   # D: dollar-quote delimiter for the DO blocks, in a variable so the shell never expands it
  list=$(printf '"%s", ' "${tables[@]}"); list=${list%, }
  say "$db"

  {
    echo "BEGIN;"
    echo "TRUNCATE $list RESTART IDENTITY;"
    for t in "${tables[@]}"; do
      echo "COPY \"$t\" (${COLS[$t]}) FROM STDIN;"
      docker exec -e PGCLIENTENCODING=UTF8 "$PG_CONTAINER" psql -U "$PG_USER" -d "$LEGACY_DB" -X -q -v ON_ERROR_STOP=1 \
        -c "COPY (SELECT ${SEL[$t]} FROM \"$t\") TO STDOUT"
      echo '\.'
      echo "DO $D BEGIN IF (SELECT count(*) FROM \"$t\") <> ${LEGACY_COUNT[$t]} THEN RAISE EXCEPTION 'row count mismatch for $t: legacy has ${LEGACY_COUNT[$t]}, copied %', (SELECT count(*) FROM \"$t\"); END IF; END $D;"
    done
    if $EXECUTE; then
      for t in "${tables[@]}"; do
        if [ -n "${HAS_ID[$t]}" ]; then
          echo "SELECT 'SEQ', '$t', setval(pg_get_serial_sequence('\"$t\"', 'id'), coalesce((SELECT max(id) FROM \"$t\"), 1), (SELECT max(id) IS NOT NULL FROM \"$t\"));"
        fi
      done
    fi
    for t in "${tables[@]}"; do echo "SELECT 'REPORT', '$t', count(*) FROM \"$t\";"; done
    if $EXECUTE; then echo "COMMIT;"; else echo "ROLLBACK;"; fi
  } | pg "$db" | while IFS='|' read -r kind t n; do
    case "$kind" in
      REPORT) printf '  %-24s legacy %6s   copied %6s   %s\n' "$t" "${LEGACY_COUNT[$t]}" "$n" \
                "$([ "${LEGACY_COUNT[$t]}" = "$n" ] && echo ok || echo MISMATCH)" ;;
      SEQ)    printf '  %-24s sequence reset -> %s\n' "$t" "$n" ;;
    esac
  done
}

migrate "$ACCOUNT_DB" "${ACCOUNT_TABLES[@]}"
migrate "$WORKSPACE_DB" "${WORKSPACE_TABLES[@]}"
migrate "$INTELLIGENCE_DB" "${INTELLIGENCE_TABLES[@]}"

if $EXECUTE; then
  say "Done - committed. Start discovery, account, workspace, intelligence, then gateway."
else
  say "DRY RUN complete - everything above was rolled back. Re-run with --execute to commit."
fi
