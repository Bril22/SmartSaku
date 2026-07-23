"use client";

import { useEffect, useState } from "react";
import SubmitButton from "@/components/SubmitButton";
import {
  removePushSubscription,
  savePushSubscription,
  sendTestNotification,
  updateNotifyPrefs,
} from "@/app/settings/actions";

function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(b64);
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

export default function NotificationSettings({
  vapidKey,
  configured,
  prefs,
}: {
  vapidKey: string;
  configured: boolean;
  prefs: { notifyDaily: boolean; notifyDebts: boolean; notifyHour: number };
}) {
  const [supported, setSupported] = useState(true);
  const [permission, setPermission] = useState<NotificationPermission>("default");
  const [subscribed, setSubscribed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [tz, setTz] = useState("Asia/Jakarta");

  useEffect(() => {
    const ok = "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
    setSupported(ok);
    if (!ok) return;
    setPermission(Notification.permission);
    try {
      setTz(Intl.DateTimeFormat().resolvedOptions().timeZone || "Asia/Jakarta");
    } catch {
      /* keep default */
    }
    navigator.serviceWorker
      .getRegistration()
      .then((reg) => reg?.pushManager.getSubscription())
      .then((sub) => setSubscribed(!!sub))
      .catch(() => {});
  }, []);

  const enable = async () => {
    setBusy(true);
    setError("");
    try {
      const perm = await Notification.requestPermission();
      setPermission(perm);
      if (perm !== "granted") {
        setError("Permission was not granted on this device.");
        return;
      }
      const reg =
        (await navigator.serviceWorker.getRegistration()) ||
        (await navigator.serviceWorker.register("/sw.js"));
      await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidKey),
      });
      const json = sub.toJSON();
      const fd = new FormData();
      fd.set("endpoint", json.endpoint ?? "");
      fd.set("p256dh", json.keys?.p256dh ?? "");
      fd.set("auth", json.keys?.auth ?? "");
      fd.set("userAgent", navigator.userAgent);
      await savePushSubscription(fd);
      setSubscribed(true);
    } catch {
      setError("Could not turn on notifications on this device.");
    } finally {
      setBusy(false);
    }
  };

  const disable = async () => {
    setBusy(true);
    try {
      const reg = await navigator.serviceWorker.getRegistration();
      const sub = await reg?.pushManager.getSubscription();
      if (sub) {
        const fd = new FormData();
        fd.set("endpoint", sub.endpoint);
        await removePushSubscription(fd);
        await sub.unsubscribe();
      }
      setSubscribed(false);
    } catch {
      /* ignore */
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="bg-card border border-line rounded-lg p-4 mb-4 space-y-3">
      {!configured ? (
        <p className="text-[12.5px] text-inksoft">
          Push notifications are not set up on the server yet.
        </p>
      ) : !supported ? (
        <p className="text-[12.5px] text-inksoft">
          This browser cannot show notifications. On iPhone, add SmartSaku to your Home Screen
          first (Share → Add to Home Screen), then open it from there.
        </p>
      ) : (
        <>
          <div className="flex items-center gap-3">
            <span className="text-lg">🔔</span>
            <div className="flex-1">
              <div className="font-semibold text-[13.5px]">
                {subscribed ? "Notifications are on" : "Turn on notifications"}
              </div>
              <div className="text-[11.5px] text-inksoft">
                {subscribed
                  ? "This device will get reminders."
                  : "Get reminders for bills and daily logging."}
              </div>
            </div>
            <button
              type="button"
              onClick={subscribed ? disable : enable}
              disabled={busy || permission === "denied"}
              className={`rounded-full text-[11px] font-extrabold px-4 py-2 disabled:opacity-50 ${
                subscribed ? "border border-line text-inksoft" : "bg-sagedeep text-cream2"
              }`}
            >
              {busy ? "…" : subscribed ? "Turn off" : "Enable"}
            </button>
          </div>

          {permission === "denied" && (
            <p className="text-[11.5px] text-bad">
              Notifications are blocked for this site. Allow them in your browser settings, then try
              again.
            </p>
          )}
          {error && <p className="text-[11.5px] text-bad">{error}</p>}

          <form action={updateNotifyPrefs} className="border-t border-line pt-3 space-y-3">
            <input type="hidden" name="notifyTz" value={tz} />
            <label className="flex items-center gap-2.5 cursor-pointer">
              <input
                type="checkbox"
                name="notifyDaily"
                value="1"
                defaultChecked={prefs.notifyDaily}
                className="h-4 w-4 accent-sagedeep"
              />
              <span className="text-[13px] flex-1">Daily reminder to log spending</span>
              <select
                name="notifyHour"
                defaultValue={String(prefs.notifyHour)}
                className="rounded-md border border-line bg-cream2 px-2 py-1.5 text-[12px]"
              >
                {Array.from({ length: 24 }, (_, h) => (
                  <option key={h} value={h}>
                    {String(h).padStart(2, "0")}:00
                  </option>
                ))}
              </select>
            </label>
            <label className="flex items-center gap-2.5 cursor-pointer">
              <input
                type="checkbox"
                name="notifyDebts"
                value="1"
                defaultChecked={prefs.notifyDebts}
                className="h-4 w-4 accent-sagedeep"
              />
              <span className="text-[13px] flex-1">Remind me before a bill or debt is due</span>
            </label>
            <p className="text-[11px] text-inksoft">Times use your device timezone ({tz}).</p>
            <SubmitButton
              className="rounded-full bg-sagedeep text-cream2 text-xs font-extrabold px-5 py-2.5"
              pendingText="Saving…"
            >
              Save reminders
            </SubmitButton>
          </form>

          {subscribed && (
            <form action={sendTestNotification} className="border-t border-line pt-3">
              <SubmitButton
                className="rounded-full border border-line text-inksoft text-[11px] font-extrabold px-4 py-2"
                pendingText="Sending…"
              >
                Send me a test
              </SubmitButton>
            </form>
          )}
        </>
      )}
    </div>
  );
}
