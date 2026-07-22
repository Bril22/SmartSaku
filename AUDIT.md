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

## Open findings

### Critical — must fix before charging money

1. **Related records are validated by `userId`, not `spaceId`.** A member of a shared space can
   submit an account or category id belonging to a different space they own, and the write is
   accepted. Cross-space data mixing.
   `app/actions.ts` (several actions), `app/goals/actions.ts`, `app/settings/actions.ts`.
2. **`SpaceMember.role` is ignored for money.** Any member of a shared space can delete
   transactions, accounts, categories and goals. Only space administration checks `OWNER`.
   A shared space is therefore unsafe with anyone you do not fully trust.
3. **No subscription or entitlement model.** Nothing in the schema expresses a plan, a limit or
   a paid feature, so there is nothing to sell yet.

### High

4. **`AUTH_SECRET` falls back to a hardcoded string** if the environment variable is missing
   (`lib/auth.ts`). A misconfigured deploy would let anyone forge a session.
5. **Sessions cannot be revoked.** 30-day stateless cookies with no version or server-side
   record — logging out elsewhere, or a stolen token, cannot be cut off.
6. **No rate limiting** on login, registration, password change, or the AI endpoints. The AI ones
   cost real money per call.
7. **Open redirect** through the user-controlled `backTo` hidden field.
8. **Balance correction and debt payment have race conditions.** Both read, compute, then write
   without locking, so two quick submits can overwrite each other or overpay.
9. **Links between records are plain strings, not foreign keys** (`DebtPayment.transactionId`,
   `GoalContribution.transactionId`, `Transaction.plannedId`, `transferId`, `importBatchId`).
   Orphans are easy to create and nothing at the database level prevents them.
10. **Indexes do not match the queries.** The main index is `[userId, date]` but the app queries
    `spaceId + date`. History also loads a whole month with no pagination.
11. **Account deletion is unsafe in a shared space** — deleting a user cascades away the shared
    records they happened to create, damaging the space for everyone else.
12. **Money is `BigInt` in the database but converted to `Number` everywhere in app code.** Fine
    at personal scale, lossy at very large values.

### Medium

13. Weak and inconsistent password policy (6 characters at registration, 8 at change), no email
    verification, no lockout.
14. Inconsistent input validation — several actions can throw a 500 instead of rejecting politely.
15. No soft deletes and no audit trail beyond `BalanceCorrection`.
16. No observability: no error tracking, no structured logging.
17. Search uses unindexed `contains` across relations.

### Mobile readiness

18. No offline support at all — every write is a server action. A wrapped app fails completely
    without a connection.
19. Cookie sessions need explicit handling inside a native WebView.
20. No deep links, no push notifications, no biometric lock.
21. Image import base64-loads the whole file into memory.

---

## Suggested order

1. Critical 1–2 (authorisation) — these are correctness and trust issues, and they are cheap to fix.
2. High 4–7 (auth hardening, rate limiting, redirect) — small, high value.
3. High 8–10 (races, foreign keys, indexes) — needed before data volume grows.
4. Then the paid-product and mobile work, which is a product decision rather than a defect.
