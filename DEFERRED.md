# Deferred items

Things we **deliberately skipped**, with the reason and a rough size for the eventual lift. An entry earns its place here by being a known, located gap — not a vague worry. Each one names the file so the next person can start reading instead of re-deriving.

Mark shipped items with ~~strikethrough~~ + **DONE** rather than deleting them, so they don't get re-pitched.

---

## From PR #62 — trip expenses (merged 2026-07-27, `485f109`)

Found by an adversarial pre-merge review. The one merge blocker it turned up (unguarded `trip_uuid` on `PUT /expense/<uuid>`, which would have let a foreign tenant's trip absorb an expense) was fixed before merge. These are what was consciously left.

- **An unpaid trip expense deflates `net_expected_cash`.** `Trip.trip_expenses` ([backend/models/common.py:2050](backend/models/common.py#L2050)) sums `Expense.amount` filtered only on `is_deleted` — it never checks whether the money actually left. So the driver is credited for cash they still hold. Not reachable through today's UI (both clients hardcode `should_pay: true`), but reachable by a raw `POST`/`PUT /expense/` without a payout, or by soft-deleting the auto-created payout via `DELETE /payout/<uuid>` (an unconditional soft delete that leaves the expense counted in full). Fix is probably to sum live `payout` rows per expense instead of `Expense.amount`, or to surface paid vs unpaid separately. Keep the per-currency invariant. **Medium lift** — touches the two properties, `TripRead`, the web cash table, and the app cash block.

  Detection query for rows already in this state:
  ```sql
  SELECT e.uuid, e.trip_uuid, e.amount, e.currency,
         COALESCE((SELECT SUM(p.amount) FROM payout p
                   WHERE p.expense_uuid = e.uuid AND NOT p.is_deleted), 0) AS paid
  FROM expense e
  WHERE e.trip_uuid IS NOT NULL AND NOT e.is_deleted
    AND COALESCE((SELECT SUM(p.amount) FROM payout p
                  WHERE p.expense_uuid = e.uuid AND NOT p.is_deleted), 0) < e.amount;
  ```

- **The web "Create expense" dialog is a dead end when the execution has no trip.** It resolves the trip via `GET /trip/?workflow_execution_uuid=…&per_page=1` ([CreateTripExpenseDialog.tsx:51](frontend/client/src/components/expenses/CreateTripExpenseDialog.tsx#L51)); with zero items the trip line shows `common.loading` forever ([:141](frontend/client/src/components/expenses/CreateTripExpenseDialog.tsx#L141)) and Submit stays disabled ([:70](frontend/client/src/components/expenses/CreateTripExpenseDialog.tsx#L70)). It is rendered ungated at [WorkflowExecutionTaskDetail.tsx:1224](frontend/client/src/pages/WorkflowExecutionTaskDetail.tsx#L1224), unlike the `AddStopDialog` beside it. **This is guaranteed, not edge-case, for accountants:** `role_presets.json` gives `accountant` `expense: [create, read, update]` but **no `trip` grant at all**, so their trip lookup is always denied. Needs a product call — hide the button when there's no trip / no `trip` grant, or show a real message ("this run has no trip") and distinguish it from a permission denial. **Small lift** once the behavior is decided.

- **The map's Expense chip can sit under the armed-stop card.** `expenseBtn` is `top: 12, left: 12` ([distribution/[uuid].tsx:571](expo_app/app/distribution/[uuid].tsx#L571)); TripMap's armed card is `top: 12, left: 0, right: 0, alignItems: 'center'` with `maxWidth: '90%'` ([TripMap.tsx:206](expo_app/components/TripMap.tsx#L206)), so on a narrow screen they overlap while a stop is armed. Note this is a **pre-existing pattern, not new**: `trackingBtn` (`top: 12, right: 12`) and `stopsLoading` (`top: 12`, centered) already share that row. Worth fixing as one layout pass over the whole top row rather than nudging a single button and making the corner look lopsided. **Small lift.**

- **`GET /trip/` walks the lazy `expenses` relationship once per row.** `TripRead` now serializes two properties that read `Trip.expenses` ([backend/models/common.py:2029](backend/models/common.py#L2029), a plain `relationship` with no eager loading), and the list route builds a DTO per row ([trip/routes.py:318](backend/app/entrypoint/routes/trip/routes.py#L318)) with no `selectinload`. It rides on a much larger pre-existing `expected_cash` walk, so this is a latency item to watch on `/trip/` p95, not a new class of problem. Fix is a `selectinload` on the list query. **Small lift.**

- **The Expo half of this feature is not on any device.** The code is in `main`, but the mobile jobs skip unless a commit carries a `[build_apps:ios]` / `[build_apps:android]` marker, so the expense screen, the map/sheet buttons, and the app's cash block have never run outside a local simulator. Needs a marker commit, then real device verification. **Small lift, but do not skip the device pass** — the simulator preview could not exercise the submit path (no tap tooling), so the form's own POST is still unproven end-to-end.

---

## App i18n and layout direction

- **Layout direction drifts from the language.** `LanguageContext` treats the user's *profile* language as the source of truth and adopts it in an effect ([expo_app/contexts/LanguageContext.tsx:32](expo_app/contexts/LanguageContext.tsx#L32)) that only calls `setLangState`. The native RTL flag is flipped **only** inside `setLang` ([:66](expo_app/contexts/LanguageContext.tsx#L66)), and it persists natively (iOS: `RCTI18nUtil_forceRTL` in the app's `NSUserDefaults`). So any path that changes the effective language without going through `setLang` — an admin changing it on the web, or a fresh login on a device whose flag was set by a previous session — leaves English text in a right-to-left layout. **Observed on a simulator 2026-07-27.** Fix: extract the flip into one helper and call it wherever the language is resolved, reloading only when the direction actually changes. **Small lift**, high user impact — Arabic-speaking drivers are the app's main users.

- **The app's `enumLabel` has no English branch.** [expo_app/i18n/enums.ts:85](expo_app/i18n/enums.ts#L85) returns the raw value for English, so `te()` on a backend enum renders `maintenance` instead of `Maintenance`. `tef()` (`enumLabelPretty`) is the one that prettifies. The trip-expense screen was switched to `tef`; **other `te()` call sites across the app were not audited** and may show raw lowercase values. The web does not have this gap (it falls back to `enum.<value>` translation keys). Worth one sweep of `te(` usages plus a decision on whether the app should gain the same `enum.*` fallback. **Small lift.**

---

## From the exchange-rates feature

- ~~**A year of USD→SYP history is not obtainable from sp-today.**~~ ✅ **WRONG — and worth recording why.** The first pass concluded a year was impossible because the rendered page embeds only 26 points (`initialChartData` — the chart's *opening view*) and no query string on the page extended it. That conclusion came from reading a truncated accessibility tree, not finding the `Today / 1W / 1M / 3M / 6M / 1Y / All` control that sits further down the page, and asserting a negative from its absence. Clicking `1Y` reveals the endpoint the chart actually uses:

  ```
  GET https://sp-today.com/api/historical?code=USD&city=damascus&range=1y
  → [{"date": "2025-07-28T20:00:01+03:00", "buy": 10300, "sell": 10300}, …]  299 points
  ```

  Unauthenticated, old-pound values, and `range=all` reaches 2015 (400 aggregated points). `sp_today.py` now uses this instead of parsing HTML. **The lesson worth keeping: a negative claim about a third party's site needs the interactive control exercised, not just the served markup read.**

  Two traps in that endpoint, both encoded in tests: an unrecognised `range` (`2y`, `5y`) answers **200 with ~26 points** rather than erroring, so the value must be whitelisted before it is sent or a "year" backfill silently stores a month; and `city=general`/`aleppo`/`idlib` answer 503 while `damascus` (or omitting it) works.

- **Nothing pulls the rate automatically.** `POST /exchange-rate/pull` is a button, so the history gains a point only when somebody clicks it — the table will gap on every day nobody does. Less severe now that a backfill can re-fetch up to a year on demand (a gap is recoverable rather than lost forever), but a daily rate still should not depend on someone remembering. There is no scheduler in this repo today (no `schedule:` in any workflow, no worker process), so the cheapest honest option is a scheduled GitHub Actions job hitting the endpoint with a service token, or a cron on the droplet. **Small lift**, and it is the difference between a rate history and a rate scrapbook.

- **`rate` is the midpoint of buy and sell.** An exchange office buys dollars at one price and sells at another (13,350 / 13,425 on the day this shipped); the stored `rate` is the average, which is neither side of a real trade. Bookkeeping convention, and the transaction form leaves the field editable, but if the business actually always transacts on one side, change `Quote.mid_rate` in `app/domains/exchange_rate/sp_today.py` to return that side instead. **Trivial**, but it is a money decision, not a code one.

- **A re-pull silently overwrites a hand-corrected rate.** `ExchangeRateDomain.upsert` ([domain.py:47](backend/app/domains/exchange_rate/domain.py#L47)) reassigns `rate`, `buy_rate`, `sell_rate` and `source` on any hit for that pair+date, with no check on what was there — so a rate someone fixed by hand reverts to the site's number and `source` flips from `manual` back to `sp-today`, with no record of the prior value. Not reachable from the UI today (there is no create/edit surface; `POST /` and `PUT /<uuid>` are API-only), but one **Backfill** click would overwrite up to 26 days of corrections at once. Fix before an edit UI or a scheduled pull lands: either skip rows whose `source` is `manual`, or keep both and prefer the manual one. **Small lift**, and it should be decided before either of those two features, not after.

- ~~**New-pound migration is unhandled.**~~ ✅ **DONE** — migration `f2a7b3d91c05` restated every SYP amount in the new pound (100 old = 1 new) across 13 tables, and `sp_today.py` now divides the source's old-pound figures on the way in. Two things worth keeping in mind for anyone reading this later:

  - **It does not round.** Dividing by exactly 100 and leaving the precision alone scales every side of every comparison by the same factor, so invoice totals, payments and balances stay consistent. Rounding each price to 2dp would have moved totals by fractions of a pound against payments already recorded and could have flipped paid statuses — verified on local data that all 23 invoice statuses came through unchanged.
  - **Quantities are not money.** `inventory_event.quantity`, `purchase_order_item.quantity_received`, `credit_note_item.inventory_change` and the `inventory._cached_*_quantity` columns sit next to a `currency` column but count goods; converting them would have corrupted stock. `fixed_asset.price_per_unit` and `invoice_item.price_per_unit` have no currency of their own and are converted through a join to the purchase-order item and the invoice respectively.

  Still open: a fixed asset with no purchase-order link has no discoverable currency, so the migration reports those rather than guessing. None existed locally; the deploy log will say if prod has any.

---

## From the negative-stock audit (2026-07-28)

A 5-dimension audit ran after customer-order fulfilment was allowed to overdraw stock (PR #64). 22 findings raised, 15 survived three-lens verification. **Fixed on that PR:** both vehicle-ledger guards (they tested the resulting balance rather than whether the change made things worse, so an overdrawn van could not be loaded and a sale could not be reversed) and a `ZeroDivisionError` in `enrich_cost_per_unit` that 500'd the whole inventory list. **Confirmed clean:** the FIFO allocator and `_absorb_shortfall`, production's continued refusal to overdraw, the zero-out endpoint, `warehouse-over-time` (signed baseline and signed ranking), material and warehouse tables (negatives red, signed values, Zero out per row), all three chart Y axes (no `[0,…]` domain), trip reconciliation on both clients, and the absence of any `Math.abs`/`max(0,…)` clamp in the inventory UI.

These are the rest, in rough order of how much they mislead someone:

- **Order pickers hide a material the van is negative on** — `frontend/client/src/components/customer-orders/CreateOrderDialog.tsx:59-66` and `expo_app/app/distribution/create-order.tsx:66-79` both `.filter(([, qty]) => Number(qty) > 0)` over `trip.start_inventory`, which `create_trip_operator.py:241` snapshots as signed balances. The material is silently absent from the only picker — no row, no message — while `record_trip_sale` would happily accept the sale. Second-order: the `loadedMaterialUuids.length > 0` fallback was meant to detect "no snapshot" but also fires when *every* balance is ≤ 0, flipping the picker to the entire catalogue. Two drivers in the same physical situation see different lists, neither of which is the van's contents. Fix: `Math.abs(q) > 1e-9`, detect an absent snapshot via `Object.keys(inv).length === 0`, and show the (possibly negative) balance beside the name. **Small lift, both clients.**

- **The material page's summary tile vanishes exactly when it is needed** — `MaterialInventorySection.tsx:118` `.filter(([, v]) => v.qty > 0)` drops a whole currency bucket whose **net** is ≤ 0. A material whose only lot sits at −500 shows the red row and then prints *"No cost data on remaining lots."* underneath. With several currencies, a net-negative USD bucket disappears with no hint it existed. Fix: `Math.abs(v.qty) > 1e-9` and render the negative signed. **Small lift.**

- **A material whose lots cancel to zero disappears from the warehouse table** — `backend/app/entrypoint/routes/inventory/routes.py:408` applies `abs(quantity) > 1e-9` to the material **aggregate**, not per lot, so −500 restocked with a manual +500 (which always creates a *new* lot) nets to exactly 0 and the row is dropped — while the same query still reports `lots: 2` from its per-lot `abs()` at :365. No caller passes `include_empty`, so there is no escape hatch, and the material also drops out of the chart's filter and the top-N ranking at :459-461. Fix: `... or i["lots"] > 0`. **Small lift.**

- **The vehicle inventory chart can invent or hide a negative** — `VehicleInventoryChart.tsx:117` fetches `per_page=100` with no paging, and the events endpoint passes no `ordering`, so the repository's default `created_at DESC` returns the **newest** 100. The component re-sorts ascending and accumulates from `let bal = 0`, discarding the opening balance, so past ~100 events (one per trip sale) the line is offset by the entire missing prefix — a van holding +200 can plot at −4000. `total_count` is ignored, so the truncation is silent, and the table directly above it shows the correct figure. `balAt` also returns 0 before the first fetched point, which `TripDetail.tsx:567` inherits. Fix: page until `page >= pages`, or seed an opening balance, or compute the series server-side. **Medium lift.**

- **"Avg cost" on the material page can exceed every lot's unit cost** — same file, `:119` divides net value by net quantity. Lot A +500 @ 10 with lot B overdrawn to −490 @ 2 renders `Avg cost 402`, unbounded as the lots converge. The quantity and value are honest; only the ratio is nonsense. Fix: divide by `Σ|qty|`, keep reporting signed net qty and value, and suppress just the average when the gross is ~0. **Trivial.**

- **Packaging consumption silently drops an uncovered quantity** — `backend/app/domains/task_execution/callback_functions/consume_packaging_from_output.py:69` is a copy of the FIFO drain loop with the shortfall handling deleted; `left_quantity` is never read again, and `:71` catches only the total-absence case. This violates the allocator's own documented invariant. **Currently masked by a hard crash rather than luck** — `create_process_from_workflow.py:58-61` builds `ProcessInputItem(inventory_uuid=…)` while `app/dto/process.py:21` requires `material_uuid` under `extra="forbid"`, so any non-empty `process_inputs` raises a validation error first. Repair that DTO call and this becomes a live under-deduction. Also in that file: `current_quantity` is re-read per output without applying earlier allocations, so two outputs mapping to the same packaging material each claim the lot's full balance, and `print()` debugging is left at :49 and :55. Fix: call `InventoryDomain.get_fifo_inventories_for_material(..., allow_negative=False)` instead of hand-rolling it. **Small lift.**

- **Every inventory list row shows `cost_per_unit: N/A`** — `backend/app/entrypoint/routes/inventory/routes.py:123` passes the ORM row to `enrich_cost_per_unit` after the DTO was already built on :122, so the value lands on a throwaway attribute; `Inventory` has no such column (only `_cached_cost_per_unit`), so `from_orm` kept the `None` default. Clicking into the same lot shows the real figure. The endpoint still pays the per-row enrichment (an N+1 — `domain.py:55` re-fetches each lot). Separately `total_original_cost` (`models/common.py:1511`) reads the same non-existent attribute and is therefore permanently null in every inventory response. Fix: pass `dto`, matching `:56`; batch the enrichment; drop or rebase the hybrid. **Small lift.**

- **A residual case of the guard shape that was just fixed:** deleting a *load* is still refused whenever it would take the balance below zero, which is right when the stock has since been sold but wrong when the balance is only non-negative *because* that load offset an earlier deficit — two loads of +3 and +7 onto a van at −10 cannot be individually undone through the API. Narrow this only with a clear rule for distinguishing the two cases; the current behaviour is deliberately conservative.

---

## Testing

- **The backend test suite is ~92% red and nothing runs it.** As of 2026-07-27: `pytest` gives **234 failed, 20 passed**. Two independent causes, both long-standing: (1) every route test calls `client.put(...)` with no `Authorization` header and gets 401 — those files were last touched 2025-04-23, `jwt_required` arrived on the routes 2025-06-21, and `conftest.py` has an unused `admin_token` fixture sitting right there; (2) `tests/domains/test_transaction_domain.py` constructs `TransactionCreate(amount=…, currency=…, exchange_rate=…)`, a DTO shape that no longer exists (it is `from_amount` / `from_currency` / `usd_to_syp_exchange_rate`, and the model is `extra="forbid"`), so every case dies in validation. No workflow runs pytest, so none of this is visible in CI. **Medium lift** to repair (mostly mechanical: inject the token fixture, update the DTO calls), and until then the suite provides zero protection on a codebase that moves money. Verified the rot predates the transaction-bug PR (#60): the parent commit's DTO already had the current field names.

---

## Cross-cutting

- **`scopes_required(...)` role lists are not an authorization spec.** For any user with fine-grained perms (`g.user_acl` set — i.e. every non-admin), the decorator returns the handler for any required-scope list that isn't a subset of the admin scopes ([routes/common/auth.py:44-50](backend/app/entrypoint/routes/common/auth.py#L44)). This is deliberate — the endpoint grant checked in `before_request` is the real gate — but the decorator *reads* like it restricts roles, and `scripts/gen_role_presets.py` derives the presets from it. Anyone reasoning about "who can call this" from the decorator alone will be wrong. Deferred because it's a documentation/naming problem, not a hole; noting it so the next reader doesn't mistake the decorator for the gate.

- **Expo web bundling is broken.** [expo_app/components/TripTrackingMap.tsx](expo_app/components/TripTrackingMap.tsx) imports `react-native-maps`, which pulls a native-only module (`codegenNativeCommands`), and there is no `.web.tsx` variant — so `expo start --web` fails to bundle. Confirmed pre-existing (reproduced with local changes stashed). Blocks browser-based previews of the app; iOS bundles fine. Fix is a `TripTrackingMap.web.tsx` stub. **Small lift.**

- **User-analytics N+1 + missing attribution indexes.** Documented in the PR #56 body: trip-stop attribution goes through `TaskExecution.result["assigned_user_uuid"]` with a correlated `EXISTS`, and the supporting indexes don't exist. **Medium lift.**

- **100 Dependabot alerts on `main`** (1 critical, 42 high, 44 moderate, 13 low) as of 2026-07-27. Surfaced on every push. Needs a triage pass, not a blind bump. See <https://github.com/albardn2/karma/security/dependabot>.
