# Notifications setup

## Human-friendly overview

SmartSaku can send phone notifications: a daily reminder to log spending, and a
heads-up before a bill or debt is due. This uses **Web Push**, which needs a few
secret keys and a scheduled job. This page lists the exact steps to turn it on in
production. Until these are set, the app still runs; the Notifications panel just
shows "not set up on the server yet".

---

## What already exists in the code

- `lib/push.ts` — sends a notification to every device a user registered.
- `lib/notify.ts` — decides who to notify (daily nudge + due reminders).
- `app/api/cron/notify/route.ts` — the endpoint the scheduler calls each hour.
- `public/sw.js` — shows the notification and handles taps.
- Settings → Notifications — where a user turns it on and picks a time.
- `vercel.json` — runs the cron every hour (`0 * * * *`).

## Keys you need (production)

Generate the VAPID keypair once:

```
node -e "console.log(require('web-push').generateVAPIDKeys())"
```

Then set these in **Vercel → Project → Settings → Environment Variables** (for
Production, and Preview if you want it there too):

| Variable | Value |
|---|---|
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY` | the public key (safe to expose) |
| `VAPID_PRIVATE_KEY` | the private key (keep secret) |
| `VAPID_SUBJECT` | `mailto:` plus a contact email |
| `CRON_SECRET` | a long random string (Vercel sends it to the cron as a Bearer token) |

Locally these already live in `.env` (git-ignored). You can reuse the same
values in Vercel, or generate fresh ones for production.

## Turn on the schedule

The cron is declared in `vercel.json`. After the next deploy, Vercel picks it up
under **Project → Settings → Cron Jobs**.

- **Plan note:** hourly crons need a Vercel plan that allows them. On the Hobby
  plan crons may be limited to about once a day; if so, the per-user reminder
  hour cannot be honored exactly — everyone is notified when the daily run fires.
  Hourly (this config) gives each person their chosen hour.

## How to verify

1. Deploy with the env vars set.
2. On a phone: open the production site. On **iPhone** you must first add it to
   the Home Screen (Share → Add to Home Screen) and open it from there — iOS only
   allows web push for an installed app. On **Android** Chrome it works directly.
3. Settings → Notifications → **Enable**, allow the prompt, then **Send me a
   test**. The test should arrive within a few seconds.
4. The hourly cron then delivers the daily nudge at each person's chosen hour and
   due reminders for bills (on their day) and debts (near month end).

## Later: native push

Web push covers Android now and iPhone once installed. For always-on iPhone push
without the Home-Screen step, the native (Capacitor) shell would use Apple's
APNs; that is a separate, later piece.
