-- Synthetic tenant data at production scale, for load tests only.
--
-- Every id is derived from its position (md5 of a label), so rows can reference
-- each other by arithmetic instead of lookups, and a re-run of a step is a
-- no-op (ON CONFLICT DO NOTHING).
--
-- psql variables (all required, see run.sh):
--   companies, users, customers, days, trips_per_day, stops_per_trip,
--   tracked_users, ping_days, trip_ping_days, password_hash

\set ON_ERROR_STOP on
\timing on

CREATE OR REPLACE FUNCTION lt_id(label text) RETURNS varchar
LANGUAGE sql IMMUTABLE AS $$ SELECT md5(label)::uuid::varchar $$;

-- A point in greater Damascus, stable for a given seed.
CREATE OR REPLACE FUNCTION lt_point(seed bigint) RETURNS geometry
LANGUAGE sql IMMUTABLE AS $$
  SELECT ST_SetSRID(ST_MakePoint(36.22 + ((seed * 7919) % 1400) / 10000.0,
                                 33.45 + ((seed * 104729) % 1200) / 10000.0), 4326)
$$;

INSERT INTO account (uuid, company_name, email, created_at, is_deleted, is_blocked, subscription_type,
                     is_verified, verified_at)
SELECT lt_id('acct' || a), 'LT Company ' || a, 'lt-company-' || a || '@loadtest.local',
       now() - make_interval(days => :days + 30), false, false, 'flat', true,
       now() - make_interval(days => :days + 30)
FROM generate_series(1, :companies) a
ON CONFLICT DO NOTHING;

-- User 1 of each company is its admin; the rest are field staff. All share one
-- password hash: bcrypt per row would dominate the seed's run time.
INSERT INTO "user" (uuid, username, first_name, last_name, password, email, permission_scope, created_at,
                    is_deleted, track_location, account_uuid, is_active, language)
SELECT lt_id('user' || a || '-' || u), 'lt-' || a || '-' || u, 'User', a || '-' || u, :'password_hash',
       'lt-' || a || '-' || u || '@loadtest.local', 'admin', now() - interval '200 days',
       false, u <= :tracked_users, lt_id('acct' || a), true, 'en'
FROM generate_series(1, :companies) a, generate_series(1, :users) u
ON CONFLICT DO NOTHING;

INSERT INTO exchange_rate (uuid, account_uuid, created_at, from_currency, to_currency, rate, rate_date, source,
                           is_deleted)
SELECT lt_id('fx' || a), lt_id('acct' || a), now(), 'USD', 'SYP', 13000, date '2020-01-01', 'manual', false
FROM generate_series(1, :companies) a
ON CONFLICT DO NOTHING;

INSERT INTO financial_account (uuid, account_name, created_at, currency, is_deleted, is_external, account_uuid)
SELECT lt_id('fin' || a), 'Cash', now(), 'USD', false, false, lt_id('acct' || a)
FROM generate_series(1, :companies) a
ON CONFLICT DO NOTHING;

INSERT INTO warehouse (uuid, name, address, created_at, is_deleted, coordinates, account_uuid)
SELECT lt_id('wh' || a || '-' || w), 'LT Warehouse ' || a || '-' || w, 'Damascus', now(), false,
       lt_point(a * 10 + w), lt_id('acct' || a)
FROM generate_series(1, :companies) a, generate_series(1, 3) w
ON CONFLICT DO NOTHING;

INSERT INTO vehicle (uuid, created_at, plate_number, model, make, year, color, is_deleted, status, account_uuid)
SELECT lt_id('veh' || a || '-' || v), now(), 'LT-' || a || '-' || v, 'Hilux', 'Toyota', 2020, 'white', false,
       'active', lt_id('acct' || a)
FROM generate_series(1, :companies) a, generate_series(1, 20) v
ON CONFLICT DO NOTHING;

INSERT INTO material (uuid, name, measure_unit, created_at, sku, type, is_deleted, account_uuid)
SELECT lt_id('mat' || a || '-' || m), 'Product ' || m, 'kg', now(), 'LT-' || a || '-' || m, 'product', false,
       lt_id('acct' || a)
FROM generate_series(1, :companies) a, generate_series(1, 20) m
ON CONFLICT DO NOTHING;

INSERT INTO customer (uuid, created_by_uuid, created_at, company_name, full_name, phone_number, full_address,
                      category, is_deleted, coordinates, account_uuid, tags)
SELECT lt_id('cust' || a || '-' || c), lt_id('user' || a || '-1'), now() - make_interval(days => c % :days),
       'Shop ' || c, 'Owner ' || c, '+9639' || lpad(c::text, 8, '0'), 'Damascus',
       (ARRAY['restaurant','minimarket','supermarket','roastery','distributer'])[1 + c % 5], false,
       lt_point(a * 100000 + c), lt_id('acct' || a), '{}'
FROM generate_series(1, :companies) a, generate_series(1, :customers) c
ON CONFLICT DO NOTHING;

-- Trips: one per (company, day, slot), driven by a rotating staff member.
INSERT INTO trip (uuid, created_by_uuid, created_at, vehicle_uuid, status, start_warehouse_uuid,
                  end_warehouse_uuid, start_time, end_time, is_deleted, account_uuid, name)
SELECT lt_id('trip' || a || '-' || d || '-' || t),
       lt_id('user' || a || '-' || (1 + t % :users)),
       date_trunc('day', now()) - make_interval(days => d) + interval '7 hours',
       lt_id('veh' || a || '-' || (1 + t % 20)),
       CASE WHEN d = 0 THEN 'in_progress' ELSE 'completed' END,
       lt_id('wh' || a || '-1'), lt_id('wh' || a || '-1'),
       date_trunc('day', now()) - make_interval(days => d) + interval '8 hours',
       CASE WHEN d = 0 THEN NULL ELSE date_trunc('day', now()) - make_interval(days => d) + interval '16 hours' END,
       false, lt_id('acct' || a), 'Trip ' || d || '-' || t
FROM generate_series(1, :companies) a, generate_series(0, :days - 1) d, generate_series(1, :trips_per_day) t
ON CONFLICT DO NOTHING;

INSERT INTO trip_stop (uuid, created_by_uuid, created_at, trip_uuid, coordinates, status, customer_uuid, index,
                       account_uuid)
SELECT lt_id('stop' || a || '-' || d || '-' || t || '-' || s),
       lt_id('user' || a || '-' || (1 + t % :users)),
       date_trunc('day', now()) - make_interval(days => d) + make_interval(hours => 8, mins => s * 40),
       lt_id('trip' || a || '-' || d || '-' || t),
       lt_point(a * 100000 + (d * 131 + t * 17 + s) % :customers),
       CASE WHEN d = 0 THEN 'planned' WHEN s % 7 = 0 THEN 'skipped' ELSE 'completed' END,
       lt_id('cust' || a || '-' || (1 + (d * 131 + t * 17 + s) % :customers)),
       s, lt_id('acct' || a)
FROM generate_series(1, :companies) a, generate_series(0, :days - 1) d, generate_series(1, :trips_per_day) t,
     generate_series(1, :stops_per_trip) s
ON CONFLICT DO NOTHING;

-- Two of every five completed stops end in a sale: an order of two items, its
-- invoice, and (for four in five invoices) a cash payment.
CREATE TEMP TABLE lt_sale AS
SELECT a, d, t, s, a || '-' || d || '-' || t || '-' || s AS k,
       lt_id('cust' || a || '-' || (1 + (d * 131 + t * 17 + s) % :customers)) AS customer_uuid,
       lt_id('user' || a || '-' || (1 + t % :users)) AS user_uuid,
       date_trunc('day', now()) - make_interval(days => d) + make_interval(hours => 8, mins => s * 40) AS at
FROM generate_series(1, :companies) a, generate_series(1, :days - 1) d, generate_series(1, :trips_per_day) t,
     generate_series(1, :stops_per_trip) s
WHERE s % 5 < 2 AND s % 7 <> 0;

INSERT INTO customer_order (uuid, created_by_uuid, customer_uuid, created_at, is_deleted, trip_stop_uuid,
                            account_uuid)
SELECT lt_id('ord' || k), user_uuid, customer_uuid, at, false, lt_id('stop' || k), lt_id('acct' || a)
FROM lt_sale
ON CONFLICT DO NOTHING;

INSERT INTO customer_order_item (uuid, created_by_uuid, customer_order_uuid, quantity, unit, material_uuid,
                                 is_fulfilled, fulfilled_at, created_at, is_deleted, account_uuid)
SELECT lt_id('item' || k || '-' || i), user_uuid, lt_id('ord' || k), 1 + (d + i) % 9, 'kg',
       lt_id('mat' || a || '-' || (1 + (t + s + i) % 20)), true, at, at, false, lt_id('acct' || a)
FROM lt_sale, generate_series(1, 2) i
ON CONFLICT DO NOTHING;

INSERT INTO invoice (uuid, created_by_uuid, customer_uuid, customer_order_uuid, created_at, currency, due_date,
                     is_deleted, account_uuid)
SELECT lt_id('inv' || k), user_uuid, customer_uuid, lt_id('ord' || k), at, 'USD', at + interval '30 days', false,
       lt_id('acct' || a)
FROM lt_sale
ON CONFLICT DO NOTHING;

INSERT INTO invoice_item (uuid, created_by_uuid, invoice_uuid, customer_order_item_uuid, price_per_unit, created_at,
                          unit, is_deleted, account_uuid)
SELECT lt_id('invi' || k || '-' || i), user_uuid, lt_id('inv' || k), lt_id('item' || k || '-' || i),
       5 + (t + s + i) % 20, at, 'kg', false, lt_id('acct' || a)
FROM lt_sale, generate_series(1, 2) i
ON CONFLICT DO NOTHING;

INSERT INTO payment (uuid, created_by_uuid, invoice_uuid, financial_account_uuid, amount, currency, payment_method,
                     created_at, is_deleted, trip_stop_uuid, account_uuid)
SELECT lt_id('pay' || k), user_uuid, lt_id('inv' || k), lt_id('fin' || a), 20, 'USD', 'cash', at, false,
       lt_id('stop' || k), lt_id('acct' || a)
FROM lt_sale
WHERE (d + s) % 5 <> 0
ON CONFLICT DO NOTHING;

DROP TABLE lt_sale;

INSERT INTO expense (uuid, created_by_uuid, amount, currency, created_at, category, is_deleted, account_uuid,
                     trip_uuid, vehicle_uuid)
SELECT lt_id('exp' || a || '-' || d || '-' || t), lt_id('user' || a || '-' || (1 + t % :users)), 15, 'USD',
       date_trunc('day', now()) - make_interval(days => d) + interval '12 hours', 'travel', false, lt_id('acct' || a),
       lt_id('trip' || a || '-' || d || '-' || t), lt_id('veh' || a || '-' || (1 + t % 20))
FROM generate_series(1, :companies) a, generate_series(1, :days - 1) d, generate_series(1, :trips_per_day) t
WHERE t % 4 = 0
ON CONFLICT DO NOTHING;

-- Location history: every tracked user, every 120 s across a 10-hour working day.
INSERT INTO location_ping (uuid, user_uuid, coordinates, recorded_at, speed, heading, accuracy, created_at,
                           account_uuid)
SELECT lt_id('hp' || a || '-' || u || '-' || d || '-' || n), lt_id('user' || a || '-' || u),
       lt_point(a * 1000000 + u * 1000 + n),
       date_trunc('day', now()) - make_interval(days => d) + make_interval(hours => 7, secs => n * 120),
       8, 90, 10, now(), lt_id('acct' || a)
FROM generate_series(1, :companies) a, generate_series(1, :tracked_users) u,
     generate_series(0, :ping_days - 1) d, generate_series(0, 299) n
ON CONFLICT DO NOTHING;

-- Trip tracks, kept for good: a point every 30 s across the trip's 8 hours.
INSERT INTO location_ping (uuid, user_uuid, trip_uuid, coordinates, recorded_at, speed, heading, accuracy,
                           created_at, account_uuid)
SELECT lt_id('tp' || a || '-' || d || '-' || t || '-' || n), lt_id('user' || a || '-' || (1 + t % :users)),
       lt_id('trip' || a || '-' || d || '-' || t), lt_point(a * 1000000 + t * 1000 + n),
       date_trunc('day', now()) - make_interval(days => d) + make_interval(hours => 8, secs => n * 30),
       8, 90, 10, now(), lt_id('acct' || a)
FROM generate_series(1, :companies) a, generate_series(0, :trip_ping_days - 1) d,
     generate_series(1, :trips_per_day) t, generate_series(0, 959) n
ON CONFLICT DO NOTHING;

ANALYZE;
