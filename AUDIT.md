# Codebase audit — findings and status

## Human-friendly overview

Before SmartSaku goes on the App Store and Play Store as a paid product, the code has to be
safe to trust with other people's money. This is the result of an independent review of the
whole codebase. Some findings were live bugs and are already fixed; the rest are listed here
with a severity so they can be scheduled honestly rather than discovered by a paying user.

---

## Fixed already (commit 5fab9f8)

| Was | Effect |
|---|---|
| Debt payments, planned records, goal contributions and imported transactions were saved without `spaceId` | Balances moved but the transaction never showed in history, charts or export, and undo could not find it |
| The importer created accounts and categories outside the space, and de-duplicated by user instead of space | Imported data went missing from every space-scoped page |
| `/debts` passed `userId` into `getDebtSummaries(spaceId)` and queried schedules by `userId` | The whole debts page read the wrong scope |
| CSV export was scoped by `userId` | One file mixed together every space the user belongs to |
| CSV export wrote raw minor units | `675000000` instead of `6750000.00` |

Earlier in the same sweep: transfer legs were missing `spaceId` (12 rows repaired), and
`RecurringBill.amount` was missing from the money migration (would have been 1/100 of its value).

Database checked after the fix: no unscoped rows remain in any table.

---

## Fixed in Phase G (commit de92bd3)

| Was | Now |
|---|---|
| Related records validated by `userId`, so a shared-space member could pass an id from another space | Every account, category, debt, goal and import is validated by `spaceId` |
| `SpaceMember.role` ignored for money | Deleting an account, category, debt or goal is owner-only in a shared space |
| `AUTH_SECRET` fell back to a hardcoded string | The app refuses to start without it |
| Sessions could not be revoked | Every token carries a session version; changing a password or revoking ends other sessions |
| No rate limiting | Login (per IP and per account), registration, OAuth callback and all three AI endpoints |
| Open redirect through `backTo` | `safeBackTo()` accepts same-site absolute paths only, with tests |
| Balance edits read then wrote outside a transaction | The row is locked with `SELECT … FOR UPDATE` inside the transaction |
| Debt payments could be double-submitted past the cap | The debt row is locked before the cap is computed |
| Indexes did not match the queries | Added `[spaceId, date]`, `[spaceId, accountId, date]`, `[spaceId, categoryId, date]`, `importBatchId`, `transferId` |
| Export covered transactions only | Nine sections covering the whole space |
| Deleting a user destroyed shared data they had created | Blocked while they own a shared space with other members |
| Password change assumed a password existed | Handles Google-only accounts, and sets one |

## Open findings

### Critical — before charging money

1. **No subscription or entitlement model.** Nothing in the schema expresses a plan, a limit or
   a paid feature, so there is nothing to sell yet.

### High

2. **Links between records are plain strings, not foreign keys** (`DebtPayment.transactionId`,
   `GoalContribution.transactionId`, `Transaction.plannedId`, `transferId`, `importBatchId`).
   Orphans are easy to create and nothing at the database level prevents them.
3. **History has no pagination.** The indexes now match the queries, but a month is still loaded
   in full with its relations.
4. **Money is `BigInt` in the database but converted to `Number` in app code.** Fine at personal
   scale, lossy at very large values.
5. **No email verification and no account lockout.** Rate limiting slows an attacker down but
   does not lock a targeted account, and an address is never proven for password signups.
   (Google signups are verified by Google.)

### Medium

6. Inconsistent input validation — several actions can throw a 500 instead of rejecting politely.
7. No soft deletes, and no audit trail beyond `BalanceCorrection`.
8. No observability: no error tracking, no structured logging.
9. Search uses unindexed `contains` across relations.

### Mobile readiness

10. No offline support — every write is a server action, so a wrapped app fails without a
    connection. This is also the biggest gap against the Indonesian competition.
11. Cookie sessions need explicit handling inside a native WebView.
12. No deep links, no push notifications, no biometric lock.
13. Image import base64-loads the whole file into memory.

---

## Suggested order

The authorisation, session and money-race work is done. What remains splits in two:

1. **Foreign keys and pagination** (High 2–3) — needed before data volume grows, and cheap now.
2. **Everything else is product work, not defect work** — entitlements when you decide to charge,
   offline when you go to the stores. Both are in [PLAN-MOBILE.md](PLAN-MOBILE.md).
