import webpush from "web-push";
import { prisma } from "./db";
import { sendNativeToUser } from "./nativePush";

let configured = false;

function ensureConfigured(): boolean {
  if (configured) return true;
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  if (!publicKey || !privateKey) return false;
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT || "mailto:admin@smartsaku.app",
    publicKey,
    privateKey,
  );
  configured = true;
  return true;
}

export function pushConfigured(): boolean {
  return !!process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY && !!process.env.VAPID_PRIVATE_KEY;
}

export type PushPayload = {
  title: string;
  body: string;
  url?: string;
  tag?: string;
};

/** Send to every place the user can be reached: browser (web push) and the
 * native app (FCM). Returns the combined number of deliveries. */
export async function notifyUser(userId: string, payload: PushPayload): Promise<number> {
  const [web, native] = await Promise.all([
    sendToUser(userId, payload),
    sendNativeToUser(userId, payload),
  ]);
  return web + native;
}

/** Send a browser (web push) notification to every device the user has
 * registered. Dead subscriptions (404/410) are pruned. */
export async function sendToUser(userId: string, payload: PushPayload): Promise<number> {
  if (!ensureConfigured()) return 0;
  const subs = await prisma.pushSubscription.findMany({ where: { userId } });
  const body = JSON.stringify(payload);
  let sent = 0;
  await Promise.all(
    subs.map(async (s) => {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          body,
        );
        sent++;
      } catch (err) {
        const code = (err as { statusCode?: number })?.statusCode;
        if (code === 404 || code === 410) {
          await prisma.pushSubscription.delete({ where: { id: s.id } }).catch(() => {});
        }
      }
    }),
  );
  return sent;
}
