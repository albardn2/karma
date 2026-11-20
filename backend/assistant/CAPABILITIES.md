# Karma Assistant — question checklist

Every kind of question users of a distribution company can be expected to ask,
grouped by area, with the tool(s) that answer it and the current status.
This list doubles as the backlog and the source for eval cases.

**Status:** ✅ supported (the tools exist and are covered by unit tests) · 🟡 works with
limits (see note) · ❌ not possible yet (reason given). Items marked **(live)** were also
asked end to end on local data — through the model, or by running the helper directly
— and the answer was checked (see "Verified end to end" below).

**Tools referred to** (see `README.md` for details):
`query_data` (filter/group/aggregate one list, with **joins**, **spatial joins** to
service areas, **computed fields** and **having**), `show_chart`, `show_map`,
`list_users`, `ar_aging`, `customer_statement`, `stock_position`,
`compare_periods`, `trip_metrics`, dashboards (`dashboard__*`), and any endpoint tool.

---

## A. Customers & CRM

| # | Example question | How | Status |
|---|---|---|---|
| A1 | How many customers do we have? By category? | `query_data` customers, group category | ✅ |
| A2 | Find customer "Al-Noor" / phone 09… | `customer__list_customers` search | ✅ |
| A3 | Show everything about customer X (balance, last orders, last visit, tags) | customer + orders + trip-stop history | ✅ |
| A4 | Customers added this week/month, by who | `query_data` created_at + join users | ✅ |
| A5 | Customers not visited in 30 days | `query_data` customers where last_stop < now-30d | ✅ |
| A6 | Customers who haven't ordered in 60 days but used to order monthly | join orders (many) → max created_at, count | ✅ |
| A7 | Customers with no coordinates / incomplete data | where coordinates is_null | ✅ |
| A8 | Top customers by revenue (per currency), this month vs last | join orders (many) sum / `compare_periods` | ✅ |
| A9 | Which customers buy material X? | invoice items where material → join invoice → customer | ✅ |
| A10 | Customer lifetime value / average order value | join orders (many): sum, avg | ✅ |
| A11 | Duplicate customers (same phone / name) | `query_data` group by phone_number having count>1 | ✅ |
| A12 | Customers near a point / within 2 km of a warehouse or another customer | compute `distance_km` + where | ✅ |
| A13 | Customer tag funnel: how many moved from interested → sale this quarter | `dashboard__tag_funnels`, tag-transitions endpoints | ✅ |
| A14 | Why did customer X stop buying? | facts only (orders, visits, outcomes, notes); cause is a judgement | 🟡 |

## B. Sales & revenue

| # | Example question | How | Status |
|---|---|---|---|
| B1 | Revenue today / this week / this month (SYP and USD separately) | `query_data` orders, where created_at, sum by currency | ✅ |
| B2 | Revenue per month trend, chart it | group `created_at:month` + `show_chart` line | ✅ |
| B3 | Revenue this month vs last month, % change | `compare_periods` | ✅ |
| B4 | Revenue per salesperson / per creator name | orders join users on created_by_uuid | ✅ (live) |
| B5 | Revenue per driver / per trip | trips (cash_from_trip_sales) or orders via trip stops | ✅ |
| B6 | Revenue per **service area** | orders → join customer → **spatial join** service areas | ✅ (live) |
| B7 | Revenue per customer category | orders join customer.category | ✅ |
| B8 | Best-selling materials (qty, value) this month | invoice items group material, sum | ✅ |
| B9 | Materials sold per area / per category | invoice items → invoice → customer → area | ✅ |
| B10 | Average order size per category / per rep | join + avg | ✅ |
| B11 | Orders that are fulfilled but unpaid | `query_data` orders where is_fulfilled & !is_paid | ✅ |
| B12 | Sales by weekday × hour | `show_chart` heatmap with `:weekday`/`:hour` | ✅ |
| B13 | Conversion: stops visited vs stops with a sale, per driver | trip stops group assigned_username, outcome | ✅ |
| B14 | Forecast next month's revenue | trend only (no forecasting model); the assistant can extrapolate and must say so | 🟡 |

## C. Materials, pricing & margin

| # | Example question | How | Status |
|---|---|---|---|
| C1 | List materials / units / types | `material__list_materials` | ✅ |
| C2 | Price of material X (per currency) | `pricing__list_pricings` | ✅ |
| C3 | Margin per material / most profitable materials | `dashboard__material_profitability` | ✅ |
| C4 | Profit per vehicle / overall profitability | `dashboard__vehicle_profitability`, `dashboard__profitability` | ✅ |
| C5 | Materials whose selling price is below cost | material profitability dashboard (margin < 0) | 🟡 depends on cost data per lot |

## D. Accounting: receivables, payments, cash, expenses

| # | Example question | How | Status |
|---|---|---|---|
| D1 | Who owes us the most (per currency)? | customers balance_per_currency | ✅ |
| D2 | **Aging report**: debt by 0–30 / 31–60 / 61–90 / 90+ days | `ar_aging` | ✅ (live) |
| D3 | **Statement** for customer X (invoices, payments, notes, running balance) | `customer_statement` | ✅ (live) |
| D4 | Overdue invoices, by customer | invoices where is_overdue + join customer | ✅ |
| D5 | Payments collected today / per method / per account | `query_data` payments | ✅ |
| D6 | Payments collected per driver (cash collected on trips) | trips cash_from_* or payments with trip_stop_uuid → stop → assigned_username | ✅ |
| D7 | Cash position: balance of each financial account | `financial_account__list_accounts` | ✅ |
| D8 | Transfers / currency exchanges between accounts and rates used | `query_data` transactions | ✅ |
| D9 | Expenses this month by category / by vehicle / by trip | `query_data` expenses group | ✅ |
| D10 | Unpaid expenses / payouts to vendors | expenses / payouts where !is_paid | ✅ |
| D11 | Debit & credit notes outstanding | notes where amount_due > 0 | ✅ |
| D12 | P&L for a period (revenue − cost − expenses) | `dashboard__profitability` (+ expenses breakdown) | 🟡 period granularity follows the dashboard |
| D13 | USD/SYP exchange rate history | `exchange_rate__*` | ✅ |
| D14 | Totals across currencies (“everything in USD”) | only with an explicit rate; never silently mixed | 🟡 |

## E. Trips, field operations & drivers

| # | Example question | How | Status |
|---|---|---|---|
| E1 | Today's trips and their status | trips where created_at today | ✅ |
| E2 | Trip X: sales, cash, skipped stops, expenses | `trip__get_trip_activity` | ✅ |
| E3 | **Trip metrics**: km driven, duration, time per stop | `trip_metrics` | ✅ (live) |
| E4 | Stops per driver per day, completion rate | trip stops group assigned_username, status | ✅ |
| E5 | Visit outcomes breakdown (sale/interested/competitor…) | trip stops group outcome | ✅ |
| E6 | Which trips are not audited yet? | trips where is_audited false | ✅ |
| E7 | Where is driver X now / today's route | `show_map` routes (user_uuid + time window) | ✅ |
| E8 | Expected cash vs handed in, per trip | trips expected_cash / net_expected_cash | ✅ |
| E9 | Average stops per trip, per service area | trips + `service_area_uuid` or spatial join of stops | ✅ |
| E10 | Plan tomorrow's route for X | routing strategy endpoints (write: needs confirmation) | 🟡 preview read-only; creating a trip is an action |

## F. Geospatial

| # | Example question | How | Status |
|---|---|---|---|
| F1 | Map of all customers, coloured by category | `show_map` pins | ✅ |
| F2 | Debt / sales density heat map | `show_map` heat with value | ✅ |
| F3 | **Which service area is each customer in?** | `query_data` spatial join | ✅ (live) |
| F4 | **Customers outside every service area** | spatial join + where area is_null | ✅ (live) |
| F5 | Customers / revenue / debt **per service area** | spatial join + group | ✅ (live) |
| F6 | Customers within X km of a point / nearest N to a customer | compute `distance_km` | ✅ |
| F7 | Visits per service area this month | trip stops spatial join | ✅ |
| F8 | Area coverage: % of customers visited in last 30 days, per area | spatial join + compute + group | ✅ |
| F9 | Route of a trip / a driver's track | `show_map` routes | ✅ |
| F10 | Show service area boundaries on the map | — polygons are not drawn yet | ❌ map layer for polygons not built |
| F11 | Road distance / drive time between points | straight-line distance only (no routing engine access) | 🟡 |

## G. Inventory, purchasing & vendors

| # | Example question | How | Status |
|---|---|---|---|
| G1 | Stock on hand per material (warehouse + vehicles) | `stock_position` | ✅ (live) |
| G2 | What will run out soon (days of cover at current sales rate)? | `stock_position` (flags negative stock) | ✅ (live) |
| G3 | What's on vehicle X right now? | `vehicle_inventory__list_*` | ✅ |
| G4 | Stock value (cost) per warehouse | inventory current_quantity × cost_per_unit (`compute`) | ✅ |
| G5 | Inventory movements of material X | inventory events | ✅ |
| G6 | Expiring lots | inventory where expiration_date < now+30d | ✅ |
| G7 | Open purchase orders / vendor balances | purchase orders / notes | ✅ |
| G8 | Which vendor supplies material X cheapest? | purchase order items group vendor | 🟡 depends on PO history |

## H. Team, users & performance

| # | Example question | How | Status |
|---|---|---|---|
| H1 | **List users with names, roles, active status** | `list_users` (admins) | ✅ (live) |
| H2 | Who created order / customer / payment X? | join users on created_by_uuid | ✅ |
| H3 | Sales / collections / new customers per user this month | join users + group | ✅ |
| H4 | Leaderboard of reps (revenue, visits, conversion) | combine B4 + B13 | ✅ |
| H5 | Which users have location tracking on? | `list_users` track_location | ✅ |
| H6 | Employees (HR records) | `employee__list_employees` | ✅ |
| H7 | What can user X do (permissions)? | not exposed to the assistant (account security) | ❌ by design |

## I. Time, trends & comparisons

| # | Example question | How | Status |
|---|---|---|---|
| I1 | This month vs last month (any metric) | `compare_periods` | ✅ (live) |
| I2 | Same month last year | `compare_periods` with explicit dates | ✅ |
| I3 | Busiest weekday / hour | `:weekday` / `:hour` buckets | ✅ |
| I4 | Weekly trend of new customers | group `:week` + chart | ✅ |
| I5 | Growth rate per area / per rep | `compare_periods` with group_by | ✅ |

## J. Actions (always confirmed by the user)

| # | Example | How | Status |
|---|---|---|---|
| J1 | Create / update a customer, add a tag | write tools | ✅ |
| J2 | Create an order (with invoice), checkout | write tools (strong confirm for checkout) | ✅ |
| J3 | Record a payment | write tool (strong confirm) | ✅ |
| J4 | Mark a trip audited, cancel a trip | write tools (strong confirm) | ✅ |
| J5 | Bulk actions ("tag all customers in area X as …") | one confirmation per write today | 🟡 no "approve all" yet |
| J6 | Send a WhatsApp/SMS reminder | no messaging integration | ❌ |

## K. Mixed / complex (examples the toolkit is built for)

| # | Example question | How | Status |
|---|---|---|---|
| K1 | Revenue per service area per month, chart it | invoice/order → customer → area, group area × month, `show_chart` | ✅ |
| K2 | In which area do we have the most debt and the fewest visits last month? | customers spatial join (sum debt) + stops spatial join (count) | ✅ |
| K3 | Customers in area X who owe money and weren't visited in 3 weeks, on a map | spatial join + where + `show_map` | ✅ |
| K4 | Which rep's customers pay slowest (avg invoice age)? | invoices → customer → created_by user, compute days, avg | 🟡 "rep" = order creator; no customer↔rep assignment field |
| K5 | Top 5 materials per area | invoice items → … → area, group area × material | ✅ |
| K6 | Plan a collection trip for the 10 biggest overdue debtors near Damascus centre | read + distance; trip creation is an action | 🟡 |

## Verified end to end (local data, 2026-11-20)

Through the model (questions typed in the CLI or the web panel):
A1 count/categories · D1 top debtors · B2/B12 monthly + weekday×hour charts ·
F2 debt heat map · F9 + E2 trip route and activity · **B6 revenue per service area
(chart)** · **H1 users with names and roles + sales per user this year** · 12-question eval.

By running the helper directly (no model): B4 revenue per salesperson name ·
F3/F4/F5 customers per area incl. outside · D2 aging · D3 statement (matches Karma's
balance) · G1/G2 stock position · I1 last 30 days vs prior · E3 trip metrics.

## What the live runs revealed about the data

- **43% of customers (1,130) and 413 orders (1.73M SYP) are outside every service
  area.** Either the areas don't cover where you sell, or those coordinates are off.
- **Some materials show negative stock** (e.g. −706 of كريك ٢٥ غ): more fulfilled than
  received. `stock_position` flags these instead of computing a cover figure.
- **Partly-paid invoices keep status `pending`** (never `partially_paid`). Aging and
  statements use amounts due, so they are unaffected, but status filters are misleading.

## Known limits (apply everywhere)

- Lists are fetched page by page (100 rows) and processed in memory: up to 5,000
  rows per list by default, 20,000 max. Bigger tenants need server-side
  aggregation endpoints.
- Most list endpoints only filter by equality; date ranges are applied after
  fetching (`where` with `now-30d` etc.).
- Currencies are never added together without an explicit exchange rate.
