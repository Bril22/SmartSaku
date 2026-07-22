# SmartSaku — plan for iOS, Android and paid tiers

## Human-friendly overview

The research changed my mind about the strategy, so the headline first.

**The thing you most want — connecting to banks and e-money — is not available to buy in Indonesia, and you do not need it.** The market leader has 10 million installs and no bank sync at all. Spendee lists 49 countries it connects to and Indonesia is not one of them. The Indonesian aggregators that used to sell this (Brick, Ayoconnect) moved to business payments, and Finantier closed in 2023. Only Brankas still offers it, enterprise-only, requiring a company. So nobody in this market has bank sync, and the apps that do have it elsewhere get the worst reviews in the category — 33% to 67% of their recent reviews are negative, almost all about the sync breaking.

**What people actually reward is fast typing and never losing their data.** The two highest-rated money apps in Indonesia both sell *offline* as the feature. SmartSaku today cannot record a transaction without a network connection, which is the single biggest gap.

**Your real advantage is the one the leader publicly cannot do.** Realbyte's own help centre, updated this month, says: "we do not support the feature to synchronize multiple devices yet." Their users ask for it constantly. SmartSaku already has multi-device sync *and* shared spaces. That is the wedge.

**One warning about AI.** In the reviews I read, AI that removes typing (receipt scanning) is loved and missed when it breaks. AI that gives advice is a liability — Monarch shipped an AI adviser in December 2025 and it is now the subject of their one-star reviews. Saku-Kun should become an explainer, not a consultant.

**And the price is much lower than expected.** The number one paid finance app in the Indonesian App Store is Realbyte's ad-removal at **Rp 19.000, paid once, forever**. A competitor charging Rp 629.000/year produced reviews calling it fraud. Another priced at Rp 249.000/year is now abandoned.

---

## 1. What the research settled

### Bank and e-money linking — not realistic, and not the gap

| Route | Verdict |
|---|---|
| Your own licence | Account information services need a **BI PJP Category 2 licence with Rp5.000.000.000 paid-up capital**. Brankas was the *first* company in Indonesia to get one, in April 2024. |
| Aggregator API (Brick, Ayoconnect) | Both pivoted to business payments. No consumer aggregation. |
| Finantier | Shut down September 2023. |
| Brankas | The only one left. Contact-sales, needs a PT, no self-serve tier. |
| BI's SNAP standard | Standardises the *shape* of the APIs, not the *right* to call them. Limited to licensed payment providers. |
| Reading SMS | Google Play permits `READ_SMS` only for default SMS/phone/assistant handlers. Expense tracking does not qualify. |
| **Android notification listener** | **Viable.** `BIND_NOTIFICATION_LISTENER_SERVICE`, user-granted, no declaration form. A shipping app (Radar Duit) already parses 13+ Indonesian banks and wallets this way. Android only, needs a native shell. |
| **QRIS QR parsing** | **Viable and unclaimed.** The QR payload is EMVCo TLV — tag 59 is the merchant name, 52 the category, 54 the amount. Parseable on-device with no permission, no API and no licence. Nobody does this. |
| **E-statement import** | **Viable, and it is what the local competition actually does.** Sribuu's current bank-linking page is a manual e-statement upload. Finku leads with statement and receipt scanning. Neither runs live aggregation. Skipping it is not falling behind — it is matching the market. |

**Build note:** Indonesian bank e-statement PDFs are usually password-protected, and the password is
commonly the account holder's date of birth as `ddmmyyyy`. The importer must accept one.

### Regulation — you are clear, with two duties

- **No OJK licence.** A manual tracker is outside POJK 3/2024's scope, and the ITSK regime requires a legal entity anyway, so it excludes individuals by design.
- **PSE registration with Komdigi is required**, and individuals can do it through OSS. The penalty for skipping it is your app being blocked, and this is actively enforced — Wikipedia was blocked in April 2026 until it registered.
- **PDP Law applies.** Financial data counts as *specific* personal data, so a written impact assessment is mandatory and breaches must be reported within 3×24 hours. The supervisory body still does not exist, so administrative fines cannot currently be issued — but the criminal provisions are live, and Law No. 1 of 2026 cut those fines sharply (Rp5 miliar to Rp200 juta for unlawful collection).
- **You can host on Neon and Vercel.** There is no general data-residency rule for a private app; localisation binds public operators and licensed financial institutions. Cross-border transfer needs explicit separate consent naming the countries and providers, plus the standard processing agreements those vendors already offer.
- **Data subject requests carry a 72-hour deadline**, which means export, delete and withdraw-consent have to be self-service. That happens to be the same work as the store account-deletion requirement.
- **The line not to cross:** the moment the app lists, compares or refers third-party financial products, it may become a *Penyelenggara Agregasi Jasa Keuangan* under POJK 4/2025 — OJK licence, PT, and Rp 500,000,000 paid-up capital. So no "compare loans", no lender affiliate links, ever.
- **Tax:** the 0.5% final UMKM rate is now permanent for individuals, and the first Rp 500 million of turnover is untaxed. A PT Perorangan (Rp 50.000 to register) gets the *same* tax treatment — form one for limited liability, not for tax.

### Payments — Midtrans, and annual billing

Xendit changed its policy in March 2026: individuals cannot open an account. Midtrans still accepts them (KTP alone; add NPWP for cards). That decides it.

The fee maths on a small ticket is brutal and drives the whole pricing design:

| On Rp 29.000/month | On Rp 249.000/year |
|---|---|
| Midtrans QRIS **0,7%** | QRIS **0,7%** |
| Midtrans GoPay **2,0%** | GoPay **2,0%** |
| Midtrans card **10,9%** | card 4,1% |
| Midtrans bank transfer **15,3%** | bank transfer 1,8% |
| Xendit QRIS **14,5%** | Xendit QRIS 2,3% |

Also: **Google Play cannot bill a subscription to QRIS, cash or a virtual account** — only cards, carrier billing and e-wallets. And 31% of Play subscription cancellations are involuntary billing failures.

### Three things to decide before the first submission

1. **Google Play account type is irreversible.** A personal account **cannot** be converted to an organization account later. If bank linking is ever on the roadmap — which needs a company anyway — open an **organization** account now. Apple has the same shape of problem: guideline 5.1.1(ix) says apps in banking and financial services should be submitted by a legal entity rather than an individual. A manual tracker is fine as an individual today; the day it connects to a bank, expect that rule to be enforced.
2. **Account deletion must exist before you submit.** Apple has required in-app deletion since June 2022, and Google requires **both** an in-app path **and** a public web page that works without logging in. This is a common, entirely avoidable rejection.
3. **Apply to Apple's Small Business Program.** It is 15% from day one instead of 30% for the first year, but enrolment is **not automatic** — you have to apply, and the rate starts after approval.

And the calendar blocker: Google Play personal accounts created after November 2023 must run a closed test with **12 testers opted in for 14 continuous days**. Budget about three extra weeks and start recruiting now.

One piece of good news on fees: Google's June 2026 fee restructure does not reach Indonesia until **30 September 2027**, so nothing changes for you in the near term.

---

## 2. Positioning

> **SmartSaku — catatan keuangan yang ikut pindah HP, dan tahu berapa utangmu benar-benar berharga.**
> The money tracker that follows you to a new phone, and tells you what your debt really costs.

Two claims, both true today, both unavailable elsewhere in this market:

1. **Your data survives.** Cloud sync, multi-device, shared with family. The leader cannot do this and says so publicly. Data loss is the single most repeated fear in Indonesian reviews of every competitor.
2. **Your debt is honest.** SPayLater quotes "2,95%/month". That is a flat rate on the original principal — about **62% effective APR**. Kredivo at 3,99% is over 85%. No app in Indonesia shows this. SmartSaku already models debt schedules; it needs the rate maths on top.

Ship the store listing as **"SmartSaku: Catatan Keuangan"** with a full Bahasa Indonesia interface. Every leader localises its name; "SmartSaku" alone will not appear in a *catatan keuangan* search.

---

## 3. Plan

### Phase G — Trustworthy (before anything ships to a store)

From the audit in [AUDIT.md](AUDIT.md). None of this is optional once strangers' money is involved.

1. Authorisation: validate every related record by `spaceId`, not `userId`.
2. Enforce `SpaceMember.role` on money operations — a member should not be able to delete shared history.
3. Remove the hardcoded `AUTH_SECRET` fallback; add session versioning so sessions can be revoked.
4. Rate-limit login, registration and every AI endpoint (those cost real money per call).
5. Fix the open redirect via `backTo`.
6. Row locking on balance and debt-payment writes.
7. Indexes matching the real queries (`[spaceId, date]`), and pagination on history.
8. Full export (every table, not just transactions) and real account deletion.

### Phase H — Fast to type (the actual competitive battle)

9. **Offline.** Manifest, service worker, local write queue, background sync. This is both the Indonesian expectation and what gets a wrapped app past Apple's "minimum functionality" rule.
10. **Templates.** One tap to log "Gojek Rp 25.000". Realbyte calls them Bookmarks; Wallet users cite them for 3–5 second entry. Biggest single win available.
11. **Calculator in the amount field.** Requested over and over; present in four competitors.
12. **Payday month start.** Indonesian salaries land on the 25th. Realbyte ships it, Sepran advertises it, Spendee lost users by removing it.
13. **Quick-add widget and PIN/biometric lock.**
14. Sub-categories, split transactions, budget carry-over, receipt attachment, daily running total.

### Phase I — Native shell

15. Capacitor wrapper with genuine native surface: offline store, push, widgets, biometric lock, share-sheet receipt intake. A bare WebView risks rejection under Apple guideline 4.2.
16. **Android notification capture** for BCA, Mandiri, BRI, BNI, Jago, Jenius, SeaBank, blu, GoPay, OVO, DANA, ShopeePay. This is the closest thing to bank sync that exists here, and it is the strongest technical moat available.
17. **QRIS scan → transaction.** Free, no permission, nobody has claimed it.

### Phase J — The debt wedge

18. Give `Debt` real terms: principal, flat vs effective rate, tenor, due day, late fee.
19. **Show effective APR next to the advertised rate.** The core differentiator.
20. Snowball vs avalanche comparison, ordered by true cost.
21. Paylater and pinjol as first-class account types, with the 2026 rules surfaced: maximum 3 BNPL platforms, 30% debt-burden ratio. Telling someone "you are on 4 platforms at 38% DBR" is information their lenders will not give them.
22. **Receivables — money owed *to* you**, and settle-up between space members. Every Indonesian "utang" app tracks shopkeeper receivables and points the wrong way; Splitwise is #5 top-grossing in Indonesia.

### Phase K — Money

23. Entitlements in the schema (none exist today).
24. Midtrans individual account, QRIS + GoPay.
25. **Free forever:** unlimited manual entry, all accounts, budgets, debt tracking, one device.
    **Paid:** sync and shared spaces, AI import quota, effective-rate analysis, full export.
26. **Price: free, or one lifetime unlock around Rp 99.000, or Rp 25.000/month.** Lead with lifetime — it matches the market's shape and avoids the rage that killed the subscription apps here.
27. Renewal by QRIS link with a reminder, since QRIS cannot auto-charge but costs 0,7% instead of 10,9%.

### Phase L — Accounting depth

28. Per-transaction multi-currency (today only the display converts).
29. Asset and liability accounts: property, vehicle, gold, receivables.
30. **Investments read-only**: Indodax gives free IDR crypto prices with no key. Never execute a trade, never hold coins — both need a PAKD licence.
    **Important design correction:** Indonesian crypto tax under PMK 50/2025 is **final and charged on the gross sale value, not the profit** — 0,21% through a domestic exchange, 1% through a foreign one, and VAT on the asset itself was removed. So never present "realised gain" as a tax base. Showing the estimated 0,21% on a sale is a genuine differentiator nobody offers.
    Indonesian mutual fund (reksa dana) NAV has **no free daily feed** — manual entry only. IDX end-of-day prices need a paid provider (~$10–20/month); Yahoo works but has no commercial licence.
31. **Zakat**: a precise, citable spec (2,5%, nisab = 85g gold, Rp 91.681.728 for 2026 by BAZNAS decree). 64% of payers already give digitally. The only competitor has 50 downloads. Note that murabahah debt has no interest to save, so the payoff engine needs a debt-type flag.
32. **Tax estimate only** — PPh 21 brackets and PTKP, clearly marked as an estimate. Preparing figures is fine; advising is not.

---

## 4. What I recommend against

- **Buying bank aggregation.** Not purchasable at your size, and the apps that have it elsewhere have the worst reviews in the category.
- **Subscription-first pricing.** The market anchor is Rp 19.000 once. Sribuu charged Rp 249.000/year and is abandoned; Monefy's Rp 629.000/year generates fraud accusations.
- **AI that gives advice.** Monarch's AI adviser is the one AI feature in this entire dataset that generated one-star reviews. Keep Saku-Kun explaining numbers, not recommending actions — which also keeps you clear of POJK 4/2025.
- **Merchant-of-record platforms.** Paddle, Lemon Squeezy and Polar accept Indonesian sellers but support no QRIS, GoPay, OVO or DANA, and their flat $0.50 fee alone exceeds 25% of a Rp 29.000 plan.
- **Any SMS-reading feature.** Google Play policy forbids it for this use, and BCA is switching SMS notifications off anyway.

---

## 5. Order

**Phase G → H → I → J → K → L.**

G is not negotiable before charging money. H is what makes people stay. I unlocks the store and the capture moat. J is the differentiator. K turns it on. L is depth for later.

If only one thing ships next: **offline plus transaction templates**. That is the difference between an app people try and an app people keep.
