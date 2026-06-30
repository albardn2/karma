#!/usr/bin/env bash
#
# Dump the PRODUCTION database and restore it into the local docker-compose stack.
#
#   - Prod is only READ (pg_dump inside the prod DB container).
#   - Only your LOCAL "backend" database is dropped and replaced.
#
# Config comes from env vars, or from an untracked file next to this script
# (scripts/.prod-db.env). Copy .prod-db.env.example to get started.
#
# Usage:
#   scripts/dump_prod_to_local.sh [--yes] [--no-keep-dump] [--file PATH]
#
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# --- load untracked config ---------------------------------------------------
ENV_FILE="${PROD_DB_ENV_FILE:-$SCRIPT_DIR/.prod-db.env}"
if [[ -f "$ENV_FILE" ]]; then
  set -a; # shellcheck disable=SC1090
  source "$ENV_FILE"; set +a
fi

# --- prod (source) -----------------------------------------------------------
PROD_HOST="${PROD_HOST:-}"                  # droplet IP / hostname (required)
PROD_USER="${PROD_USER:-root}"
PROD_PASS="${PROD_PASS:-}"                  # root password (required)
PROD_SSH_PORT="${PROD_SSH_PORT:-22}"
PROD_DB_USER="${PROD_DB_USER:-local}"
PROD_DB_NAME="${PROD_DB_NAME:-backend}"
PROD_DB_CONTAINER="${PROD_DB_CONTAINER:-}"  # auto-detected if empty

# --- local (target) ----------------------------------------------------------
COMPOSE_FILE="${COMPOSE_FILE:-$REPO_ROOT/docker-compose.local.yml}"
LOCAL_DB_SERVICE="${LOCAL_DB_SERVICE:-db}"
LOCAL_BACKEND_SERVICE="${LOCAL_BACKEND_SERVICE:-backend}"
LOCAL_DB_USER="${LOCAL_DB_USER:-local}"
LOCAL_DB_NAME="${LOCAL_DB_NAME:-backend}"

# --- behaviour ---------------------------------------------------------------
STAMP="$(date +%Y%m%d-%H%M%S)"
DUMP_FILE="${DUMP_FILE:-$REPO_ROOT/prod-dump-$STAMP.sql.gz}"
ASSUME_YES="${ASSUME_YES:-0}"
KEEP_DUMP="${KEEP_DUMP:-1}"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --yes|-y)        ASSUME_YES=1 ;;
    --no-keep-dump)  KEEP_DUMP=0 ;;
    --keep-dump)     KEEP_DUMP=1 ;;
    --file)          DUMP_FILE="$2"; shift ;;
    -h|--help)       grep '^#' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) echo "Unknown arg: $1" >&2; exit 2 ;;
  esac
  shift
done

log()  { printf '\033[1;34m[dump]\033[0m %s\n' "$*"; }
die()  { printf '\033[1;31m[dump] ERROR:\033[0m %s\n' "$*" >&2; exit 1; }

# --- preflight ---------------------------------------------------------------
[[ -n "$PROD_HOST" ]] || die "PROD_HOST is not set. Create $ENV_FILE (see .prod-db.env.example)."
[[ -n "$PROD_PASS" ]] || die "PROD_PASS is not set. Create $ENV_FILE (see .prod-db.env.example)."
[[ -f "$COMPOSE_FILE" ]] || die "Compose file not found: $COMPOSE_FILE"
command -v docker  >/dev/null || die "docker not found."
command -v gzip    >/dev/null || die "gzip not found."
command -v sshpass >/dev/null || die "sshpass not found. Install it: brew install hudochenkov/sshpass/sshpass"

SSH_OPTS=(-p "$PROD_SSH_PORT" -o StrictHostKeyChecking=accept-new \
  -o ConnectTimeout=15 -o ServerAliveInterval=10 -o ServerAliveCountMax=3 \
  -o NumberOfPasswordPrompts=1)
ssh_exec() { sshpass -p "$PROD_PASS" ssh "${SSH_OPTS[@]}" "$PROD_USER@$PROD_HOST" "$@"; }
dc()       { docker compose -f "$COMPOSE_FILE" "$@"; }

# --- locate prod DB container ------------------------------------------------
if [[ -z "$PROD_DB_CONTAINER" ]]; then
  log "Detecting prod DB container on $PROD_HOST ..."
  PROD_DB_CONTAINER="$(ssh_exec "docker ps --format '{{.Names}} {{.Image}}' | grep -i postgis | head -n1 | cut -d' ' -f1" || true)"
  [[ -n "$PROD_DB_CONTAINER" ]] || die "Could not auto-detect a postgis container on prod. Set PROD_DB_CONTAINER in $ENV_FILE."
fi
log "Prod DB container: $PROD_DB_CONTAINER  (db='$PROD_DB_NAME', user='$PROD_DB_USER')"

# --- confirm destructive local step ------------------------------------------
if [[ "$ASSUME_YES" != "1" ]]; then
  printf '\033[1;33mThis DROPS and replaces your local "%s" database with prod data. Continue? [y/N] \033[0m' "$LOCAL_DB_NAME"
  read -r ans
  [[ "$ans" =~ ^[Yy]$ ]] || die "Aborted."
fi

# --- dump prod ---------------------------------------------------------------
# spatial_ref_sys is excluded: it is repopulated identically by CREATE EXTENSION
# postgis on restore, so dumping its rows would only cause PK conflicts.
log "Dumping prod database (this may take a moment) ..."
ssh_exec "docker exec -i '$PROD_DB_CONTAINER' pg_dump -U '$PROD_DB_USER' -d '$PROD_DB_NAME' \
  --no-owner --no-privileges --exclude-table-data='public.spatial_ref_sys' | gzip -c" > "$DUMP_FILE"
[[ -s "$DUMP_FILE" ]] || die "Dump file is empty — check host/credentials/container."
log "Dump saved: $DUMP_FILE ($(du -h "$DUMP_FILE" | cut -f1))"

# --- prepare local db --------------------------------------------------------
log "Ensuring local '$LOCAL_DB_SERVICE' service is up ..."
dc up -d "$LOCAL_DB_SERVICE" >/dev/null
dc exec -T "$LOCAL_DB_SERVICE" sh -c "until pg_isready -U '$LOCAL_DB_USER' >/dev/null 2>&1; do sleep 1; done"

log "Stopping local '$LOCAL_BACKEND_SERVICE' to release DB connections ..."
dc stop "$LOCAL_BACKEND_SERVICE" >/dev/null 2>&1 || true

log "Recreating local database '$LOCAL_DB_NAME' ..."
dc exec -T "$LOCAL_DB_SERVICE" psql -U "$LOCAL_DB_USER" -d postgres -v ON_ERROR_STOP=1 <<SQL
SELECT pg_terminate_backend(pid) FROM pg_stat_activity
 WHERE datname = '$LOCAL_DB_NAME' AND pid <> pg_backend_pid();
DROP DATABASE IF EXISTS "$LOCAL_DB_NAME";
CREATE DATABASE "$LOCAL_DB_NAME" OWNER "$LOCAL_DB_USER";
SQL

# --- restore -----------------------------------------------------------------
log "Restoring into local '$LOCAL_DB_NAME' ..."
gunzip -c "$DUMP_FILE" | dc exec -T "$LOCAL_DB_SERVICE" \
  psql -U "$LOCAL_DB_USER" -d "$LOCAL_DB_NAME" -v ON_ERROR_STOP=1 -q

log "Starting local '$LOCAL_BACKEND_SERVICE' ..."
dc start "$LOCAL_BACKEND_SERVICE" >/dev/null 2>&1 || dc up -d "$LOCAL_BACKEND_SERVICE" >/dev/null

# --- cleanup -----------------------------------------------------------------
if [[ "$KEEP_DUMP" != "1" ]]; then
  rm -f "$DUMP_FILE"
  log "Removed dump file."
fi

log "Done — local DB now mirrors prod."
log "Note: the local 'admin/admin' seed user no longer exists; log in with real prod credentials."
