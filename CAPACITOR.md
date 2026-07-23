# Native apps with Capacitor

## Human-friendly overview

This turns SmartSaku into real iOS and Android apps you can put on the App Store
and Play Store. Because SmartSaku is a server app (it renders pages and runs
server actions on the server), the native app does not bundle the website —
instead it opens the deployed site inside a native window, and adds native
features on top (push, splash screen, later biometric lock). The Capacitor
config and scripts are ready. The parts that need a Mac with Xcode, Android
Studio, and store accounts are yours to run; this page lists every step.

---

## What is already in the repo

- `capacitor.config.ts` — app id `app.smartsaku.mobile`, app name SmartSaku, and
  a `server.url` the native window loads. It defaults to a placeholder; set your
  real domain (below).
- `native/www/index.html` — a small branded page shown for the split second
  before the site loads.
- Installed packages: `@capacitor/core`, `@capacitor/cli`, `@capacitor/ios`,
  `@capacitor/android`, `@capacitor/splash-screen`, `@capacitor/status-bar`.
- Scripts: `npm run cap:sync`, `npm run cap:open:ios`, `npm run cap:open:android`.

## Prerequisites (your machine)

- **iOS:** macOS, Xcode, CocoaPods (`sudo gem install cocoapods`), and an Apple
  Developer account (99 USD/year).
- **Android:** Android Studio and a JDK, plus a Google Play Developer account
  (25 USD one-time).

## One-time setup

1. Set the production domain the app should load. Either edit `server.url` in
   `capacitor.config.ts`, or export it when you run the CLI:
   ```
   export CAP_SERVER_URL="https://your-real-domain.com"
   ```
2. Create the native projects (this needs the toolchains above):
   ```
   npx cap add ios
   npx cap add android
   ```
   This creates `ios/` and `android/` folders — commit them.
3. App icons and splash screens from one source image:
   ```
   npm i -D @capacitor/assets
   npx capacitor-assets generate --iconBackgroundColor "#FFEED6"
   ```
   Put a 1024×1024 icon at `assets/icon.png` first (the Saku-Kun mark works).

## Build and run

```
npm run cap:sync          # copy config + plugins into the native projects
npm run cap:open:ios      # opens Xcode  → Run on a device/simulator
npm run cap:open:android  # opens Android Studio → Run
```

Because the app loads `server.url`, you do **not** rebuild the native app when
you change the website — just deploy the site as usual. Re-run `cap:sync` only
when you change Capacitor config or plugins.

## Sign-in and cookies

The JWT session cookie is set by the site and stored by the native web view, so
sign-in and Google sign-in work inside the app the same as in a browser. No
extra work is needed for auth.

## Native push (a later step)

Web Push already covers Android and iPhone-when-installed (see
[NOTIFICATIONS.md](NOTIFICATIONS.md)). For always-on iPhone push through the App
Store build, native push is separate and uses Apple's APNs and Google's FCM:

1. `npm i @capacitor/push-notifications`.
2. iOS: enable Push in Xcode, create an APNs key in the Apple Developer portal.
   Android: create a Firebase project, add `google-services.json`.
3. On launch, register for push and send the returned **native token** to a new
   server table (separate from the web `PushSubscription`, which holds browser
   endpoints).
4. Send through APNs/FCM instead of the `web-push` library.

This needs real devices and the store accounts to test, so it is best done once
the shell itself is running.

## Passing App Store review (guideline 4.2)

Apple rejects apps that are only a website in a window. SmartSaku must add native
value. What we already have or can add:

- Offline entry (the write queue) and an installable, cached shell — done.
- Native push (above).
- Biometric lock (`@capacitor-community/biometric-auth` or Face ID gate).
- Share-to-import a receipt, and app shortcuts / deep links.

Ship at least push + biometric lock before submitting.

## Store submission checklist

- App icons and splash (generated above).
- Privacy policy URL and an account-deletion path (Apple requires in-app account
  deletion — Settings already has delete account).
- App Privacy answers (data collected: financial data, stored on your server).
- Screenshots per device size.
- iOS: archive in Xcode → upload to App Store Connect. Android: build a signed
  App Bundle (.aab) → upload to the Play Console.
