#!/usr/bin/env bash
# Drive the load-test stack. See loadtest/README.md.
#
#   ./run.sh up                       build and start the prod-shaped API and database
#   ./run.sh seed                     fill the database with synthetic tenants
#   ./run.sh run NAME USERS DURATION  run Locust (e.g. ./run.sh run u1000 1000 10m)
#   ./run.sh stats                    slowest queries since the last reset
#   ./run.sh reset-stats              clear pg_stat_statements
#   ./run.sh down                     stop everything and delete the data
set -euo pipefail
cd "$(dirname "$0")"

COMPOSE=(docker-compose -f docker-compose.loadtest.yml)
PSQL=("${COMPOSE[@]}" exec -T db psql -U local -d backend -v ON_ERROR_STOP=1)

# Seeded users' password: a local-only test value, never used outside this stack.
export LT_PASSWORD="${LT_PASSWORD:-loadtest-only}"
export LT_COMPANIES="${LT_COMPANIES:-100}"
export LT_USERS="${LT_USERS:-100}"

case "${1:-}" in
  up)
    "${COMPOSE[@]}" up -d --build db migrate web
    ;;
  seed)
    hash=$("${COMPOSE[@]}" exec -T -e PW="$LT_PASSWORD" web \
      python -c 'import bcrypt, os; print(bcrypt.hashpw(os.environ["PW"].encode(), bcrypt.gensalt()).decode())')
    "${PSQL[@]}" -c "CREATE EXTENSION IF NOT EXISTS pg_stat_statements"
    "${PSQL[@]}" \
      -v companies="$LT_COMPANIES" -v users="$LT_USERS" \
      -v customers="${LT_CUSTOMERS:-1000}" -v days="${LT_DAYS:-90}" \
      -v trips_per_day="${LT_TRIPS_PER_DAY:-20}" -v stops_per_trip="${LT_STOPS_PER_TRIP:-10}" \
      -v tracked_users="${LT_TRACKED_USERS:-30}" -v ping_days="${LT_PING_DAYS:-2}" \
      -v trip_ping_days="${LT_TRIP_PING_DAYS:-1}" -v password_hash="$hash" \
      -f /seed.sql
    ;;
  run)
    name="${2:?run NAME USERS DURATION}"
    mkdir -p results
    LT_RUN="$name" LT_CONCURRENT="${3:?USERS}" LT_DURATION="${4:?DURATION}" \
      LT_SPAWN_RATE="${LT_SPAWN_RATE:-10}" \
      "${COMPOSE[@]}" --profile run run --rm locust
    ;;
  stats)
    "${PSQL[@]}" -c "
      SELECT calls, round(mean_exec_time::numeric, 1) AS mean_ms, round(total_exec_time::numeric / 1000, 1) AS total_s,
             left(regexp_replace(query, '\s+', ' ', 'g'), 160) AS query
      FROM pg_stat_statements ORDER BY total_exec_time DESC LIMIT 20"
    ;;
  reset-stats)
    "${PSQL[@]}" -c "SELECT pg_stat_statements_reset()"
    ;;
  down)
    "${COMPOSE[@]}" --profile run down -v
    ;;
  *)
    sed -n 2,10p "$0"
    exit 1
    ;;
esac
