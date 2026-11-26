# Load tests

Measures how many people the API serves on prod-sized hardware before it slows
down, and which queries give out first.

## What runs

`docker-compose.loadtest.yml` starts a separate stack, independent of the local
dev stack:

- `db`: PostGIS with the prod settings (including `pg_stat_statements`).
- `web`: the API image built from `backend/Dockerfile`, with the prod gunicorn
  command.

Both are pinned to the same two CPUs with memory limits that add up to the prod
droplet's RAM, so they compete the way they do in prod. Locust runs on the
other CPUs.

`seed.sql` creates synthetic tenants (`LT Company <n>`) with users, customers,
trips, stops, orders, invoices, payments, expenses and location history. The
`LT_*` variables in `run.sh` set the sizes; the defaults model 100 companies of
100 users (10,000 users). Every seeded user is `lt-<company>-<n>` with the
local-only password `loadtest-only`.

`locustfile.py` mixes field staff on the mobile app (9 in 10) with admins on the
web dashboards (1 in 10), each signed in as a different seeded user.

## Running

```bash
cd loadtest
./run.sh up            # build and start
./run.sh seed          # tens of millions of rows: takes a while
./run.sh reset-stats
./run.sh run u500 500 10m
./run.sh stats         # slowest queries during the run
./run.sh down          # stop and delete the data
```

Results land in `loadtest/results/` (`<name>_stats.csv` and an HTML report).

## Reading the results

"Concurrent users" in Locust means people with the app open and working, each
pausing between screens. It is not the number of registered users: of 10,000
accounts, only a fraction are active at the same moment.

The local CPUs are faster than a DigitalOcean droplet's vCPUs, so these numbers
are an upper bound for prod.

Location pings travel over MQTT and are not part of the HTTP load. Their
database writes come on top.
