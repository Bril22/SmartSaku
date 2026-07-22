# Phase F — plan for review

## Human-friendly overview

SmartSaku is a personal money manager (Next.js 16 + Prisma 6 + Neon Postgres, IDR-first,
mobile-first). This phase covers 12 pieces of user feedback. The biggest one is that money
must support cents: today every amount is stored as a whole rupiah integer, so `1.234.567,89`
cannot be represented at all. That forces a one-time migration of every money column, and
everything else is built on top of it.

The other 11 items are UI and feature work: date+time on transactions, AI file upload from the
add screen, account ordering and a main account, hidden accounts, balance-edit auditing, a
full-width search that drives the chart instead of printing a list, drill-down from the
calendar, a missing back button, "latest 5 + see more" on long lists, and a collapsible
two-way chat with the AI on each goal.

---

## Current state (facts that constrain the design)

- All money is `BigInt` whole rupiah across **15 columns**:
  `FinAccount.balance`, `DebtScheduleEntry.planned`, `DebtPayment.amount`,
  `DebtAdjustment.delta`, `Category.budget`, `Transaction.amount`,
  `PlannedTransaction.amount`, `Goal.targetAmount`, `GoalContribution.amount`,
  `MonthlySnapshot.{totalSavings,totalDebt,incomeReceived}` (model currently unused),
  `Settings.{monthlyIncome,monthlyExpense}`.
- Display goes through one place: `makeMoney()` in `lib/money.ts` → `money.rp()` / `money.rpShort()`.
  Both currently do `Number(idr) * ratePerIdr` then `toLocaleString("en-US")`.
- Form input goes through `components/MoneyInput.tsx`, which emits a raw digit string in a
  hidden input; server actions do `BigInt(Math.round(Number(formData.get(k))))`.
- Data is scoped by `spaceId` (shared spaces shipped in Phase E). Settings stay per-user.
- Migrations are applied with `prisma db push`, not `prisma migrate` — there is no migration
  history table, so a "run once" guarantee does not exist today.

---

## Item-by-item design

### F1. Money precision (item 6) — foundation, must land first

**Decision (confirmed with user):** store **minor units** (cents/sen) in every money column,
for every currency. Display format is Indonesian: `1.234.567,89`.

**Storage:** keep `BigInt`, change the meaning from "rupiah" to "1/100 rupiah". Chosen over
Prisma `Decimal` because `Decimal` returns Decimal.js objects that would touch every
arithmetic site in `lib/finance.ts`, whereas integer minor units keep all existing `Number()`
arithmetic working unchanged.

**Migration:** one SQL pass, `UPDATE "T" SET "c" = "c" * 100` for each of the 15 columns.

**Re-run safety:** this is the main risk — running it twice silently multiplies by 10,000 and
there is no migration history. Mitigation: add a tiny `AppMeta { key @id, value }` model and
write `money_scale=100` inside the same transaction as the updates. The script aborts if the
key already exists. Also print the sum of `FinAccount.balance` before and after and assert the
ratio is exactly 100.

**Code changes:**
- `lib/money.ts`: `rp()` / `rpShort()` divide by 100, format with `id-ID` grouping and exactly
  2 decimals. `rpShort` thresholds scale by 100.
- `CURRENCIES[].decimals` becomes display-only; all currencies now show 2 decimals.
- `components/MoneyInput.tsx`: display Indonesian separators as the user types; hidden input
  carries an integer count of minor units. Must accept `1.234.567,89`, `1234567,89`, and plain
  `1234567` (→ `123456700`).
- Server actions: `num()` helpers now expect minor units already; drop the `Math.round(Number)`
  rupiah assumption.
- Seed files: literal amounts (`27_500_000n`, …) all scale ×100.
- `lib/importer.ts`: AI returns human amounts → convert to minor units at the boundary.

**Verification:** snapshot every account balance and the 5-year forecast number before, run the
migration, assert balances ×100 and the forecast unchanged after the display change.

### F2. Accounts (items 3, 4, 5, 11-accounts)

Schema on `FinAccount`: `sortOrder Int @default(0)`, `primary Boolean @default(false)`,
`hidden Boolean @default(false)`.

- **Main account (3):** exactly one `primary` per space, enforced in a transaction
  (clear others, set one). Pre-selects the account in add-transaction and transfer forms.
- **Reorder (3):** drag to reorder. HTML5 drag-and-drop does not work on touch, so this is a
  pointer-events implementation with an explicit drag handle, plus up/down buttons as an
  accessible fallback. Persisted by a server action that writes `sortOrder` for the whole list.
  Reordering lives in **Settings › Manage accounts** (full list, nothing truncated).
- **Hidden (5):** excluded from the all-accounts total, home savings, forecast starting
  savings, and net worth. Still appears in every account picker (labelled "hidden") so money
  can move to and from it. Rationale: hiding is about totals, not about disabling the account.
- **Balance edit with audit (4):** when the balance changes, the user chooses:
  1. *Record as income/expense* — creates a real `Transaction` (IN if the balance went up,
     OUT if down) in a reserved "Adjustment" category, so the chart and history stay truthful.
  2. *Correct silently* — no transaction; writes a `BalanceCorrection` row
     (`accountId, before, after, reason, userId, createdAt`) purely as an audit trail.
  Default is option 1, because a silent change makes balance and transaction history disagree.
- **Top 5 (11):** Money › Accounts shows the first 5 by `sortOrder` + "See all"; Settings ›
  Manage accounts always shows every account.

### F3. Add transaction (items 1, 2)

- **Date + time (1):** applies to expense, income, **and transfer**. `Transaction.date` is
  already `DateTime`, so time needs no schema change. Extend `DateField` with
  `mode="datetime"`: the existing calendar plus an hour/minute row inside the same sheet, so
  there is still only one date UI in the app. Defaults to now.
- **AI upload (2):** the `/import` flow already handles image/PDF/CSV/Excel with AI vision.
  Add a clearly secondary entry point on `/add` that opens it, rather than duplicating the
  preview/confirm UI on two pages.

### F4. History (items 7, 8, 9, 11-transactions)

- **(7)** Search input goes full width on its own row; the Search button sits beside it on
  desktop and full width beneath on mobile. The AI upload becomes a separate row below.
- **(8)** Delete the search results list. `q` becomes a filter applied to the pie chart data
  and the calendar dots, so searching narrows what is already on screen.
- **(9)** Calendar day panel shows the **first 5** transactions for the selected day; if there
  are more, "See all N" links to a new `/money/day/[date]` page that carries the active filters
  (`q`, `kind`, `range`).
- **(11)** Same 5 + "See more" rule on history-style lists.

### F5. Remaining (items 10, 12)

- **(10)** Debt detail gets a `‹ Debts` back link, matching the other sub-pages.
- **(12)** Goals: the Saku-Kun block becomes a collapsed accordion, and the user can reply.
  New model `GoalMessage { id, goalId, role: USER|AI, text, createdAt }`, with the existing
  `Goal.advice` string migrated into the first AI message. Replies send the thread plus the
  goal's live numbers to OpenAI. Keep the "not licensed financial advice" note.

---

## Sequencing

F1 first and alone (everything displays money). Then F2, F3, F4, F5 in any order.

## Codex review — corrections applied

1. **`RecurringBill.amount` was missing** from the column list (2 rows, 7.000.000). The
   migration now derives its columns from the schema instead of a hand-written list.
2. Named helpers (`formatMinor`, `parseMinor`, `shortMinor`) live in `lib/format.ts`, which is
   client-safe, so server and client share one implementation and the scale cannot drift.
3. Verification covers **all 15 columns**, not just `FinAccount.balance`.
4. Balance adjustments will use a flag on `Transaction`, not a reserved "Adjustment" category,
   because category names are user-editable and would pollute reporting.
5. Hidden accounts will be excluded from aggregate charts as well as totals, so reports never
   disagree with the headline number.
6. `MoneyInput` takes and emits **minor units**, so no `defaultValue` call site changes and
   there is no window where scaled and unscaled values mix.

## Status

- F1 done: migration applied (guarded, all 15 columns verified x100), formatting switched,
  19 conversion unit tests passing.
- F2-F5 pending.

## Original questions for the reviewer

1. Is integer minor units the right call over Prisma `Decimal` here, given the arithmetic in
   `lib/finance.ts`?
2. Is the `AppMeta` guard enough to make the ×100 migration safe without adopting
   `prisma migrate`, or should the project move to real migrations before touching money?
3. Does the hidden-account rule (excluded from totals, present in pickers) create a case where
   totals and transaction history visibly disagree?
4. In the balance-edit flow, is a reserved "Adjustment" category the right modelling, or should
   the adjustment transaction carry a dedicated flag instead?
5. Any ordering hazard in F1 — a place where scaled and unscaled amounts could be compared
   during the rollout?
