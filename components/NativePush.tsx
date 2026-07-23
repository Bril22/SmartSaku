"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Capacitor } from "@capacitor/core";

async function saveToken(token: string) {
  if (!token) return;
  await fetch("/api/push/native", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ token, platform: Capacitor.getPlatform() }),
  }).catch(() => {});
}

export default function NativePush() {
  const router = useRouter();

  useEffect(() => {
    // only runs inside the Capacitor app; a plain browser skips this entirely
    if (!Capacitor.isNativePlatform()) return;

    let cleanup: (() => void) | undefined;

    (async () => {
      try {
        const { FirebaseMessaging } = await import("@capacitor-firebase/messaging");
        const perm = await FirebaseMessaging.requestPermissions();
        if (perm.receive !== "granted") return;

        const { token } = await FirebaseMessaging.getToken();
        await saveToken(token);

        const refreshed = await FirebaseMessaging.addListener("tokenReceived", (event) => {
          void saveToken(event.token);
        });
        const tapped = await FirebaseMessaging.addListener(
          "notificationActionPerformed",
          (event) => {
            const url =
              (event.notification?.data as Record<string, string> | undefined)?.url || "/";
            router.push(url);
          },
        );
        cleanup = () => {
          void refreshed.remove();
          void tapped.remove();
        };
      } catch {
        // plugin not available in this build
      }
    })();

    return () => cleanup?.();
  }, [router]);

  return null;
}
