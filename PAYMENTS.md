# Premium & payments (Midtrans)

## Human-friendly overview

SmartSaku has a free tier and a Premium tier. Free covers everyday tracking.
Premium unlocks the smart, cost-heavy features. Upgrades are paid through
Midtrans (QRIS, GoPay, bank transfer, and more). The code is all in place; you
add your Midtrans keys and set one webhook URL to switch it on.

---

## What is Premium

Gated behind Premium (free users are sent to `/upgrade`):

- Saku AI import (scan receipts, PDFs, statements)
- AI money consultant chat
- Investments & net worth
- Debt payoff planner (snowball vs avalanche)

Everything else — accounts, transactions, budgets, debts, history, offline,
notifications — stays free.

Prices (edit in `lib/plan.ts`): Monthly Rp29.000, Yearly Rp149.000, Lifetime
Rp399.000. Monthly and yearly are one-time payments that extend access; re-pay
to top up (this keeps QRIS/GoPay working — true auto-charge needs saved cards).

**Existing users** were grandfathered to lifetime Premium as founding members,
so nothing changed for them when gating went live.

## Turn it on

1. Create a Midtrans account. Start in **Sandbox** to test.
2. Settings → Access keys: copy the **Server key** and **Client key**.
3. Set env vars (locally in `.env`, and in Vercel):
   - `MIDTRANS_SERVER_KEY`
   - `NEXT_PUBLIC_MIDTRANS_CLIENT_KEY`
   - `MIDTRANS_IS_PRODUCTION` = `false` for sandbox, `true` for live
4. In the Midtrans dashboard → Settings → **Payment notification URL**, set:
   `https://<your-domain>/api/midtrans/notification`
   This is how a completed payment activates Premium (verified by SHA-512
   signature).

## How a purchase flows

1. User opens **Settings → Upgrade** (`/upgrade`) and picks a plan.
2. `createCheckout` records a pending `Payment`, creates a Midtrans Snap
   transaction, and redirects the browser to Midtrans's hosted payment page.
3. The user pays (QRIS, GoPay, VA, …).
4. Midtrans calls the webhook; the signature is verified, the `Payment` is
   marked paid, and `grantPremium` extends the user's entitlement.

## Testing in sandbox

Use Midtrans's sandbox payment simulator to complete a test payment, then check
that the user shows as Premium in Settings. Sandbox never charges real money.
