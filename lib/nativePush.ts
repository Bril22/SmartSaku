import { getApps, initializeApp, cert, type App } from "firebase-admin/app";
import { getMessaging } from "firebase-admin/messaging";
import { prisma } from "./db";
import type { PushPayload } from "./push";

let app: App | null = null;

/** Read the service account from FIREBASE_SERVICE_ACCOUNT (raw JSON or base64). */
function serviceAccount(): Record<string, string> | null {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!raw) return null;
  try {
    const json = raw.trim().startsWith("{")
      ? raw
      : Buffer.from(raw, "base64").toString("utf8");
    return JSON.parse(json);
  } catch {
    return null;
  }
}

function ensureApp(): App | null {
  if (app) return app;
  if (getApps().length) {
    app = getApps()[0];
    return app;
  }
  const sa = serviceAccount();
  if (!sa) return null;
  app = initializeApp({
    credential: cert({
      projectId: sa.project_id,
      clientEmail: sa.client_email,
      privateKey: sa.private_key?.replace(/\\n/g, "\n"),
    }),
  });
  return app;
}

export function nativePushConfigured(): boolean {
  return !!process.env.FIREBASE_SERVICE_ACCOUNT;
}

/** Send to every native device the user registered. Invalid tokens are pruned.
 * Firebase relays to APNs for iOS, so one call covers both platforms. */
export async function sendNativeToUser(userId: string, payload: PushPayload): Promise<number> {
  const application = ensureApp();
  if (!application) return 0;

  const rows = await prisma.nativePushToken.findMany({ where: { userId } });
  if (!rows.length) return 0;
  const tokens = rows.map((r) => r.token);

  const res = await getMessaging(application).sendEachForMulticast({
    tokens,
    notification: { title: payload.title, body: payload.body },
    data: { url: payload.url ?? "/", tag: payload.tag ?? "" },
    android: { priority: "high", notification: { defaultSound: true } },
    apns: { payload: { aps: { sound: "default" } } },
  });

  const dead: string[] = [];
  res.responses.forEach((r, i) => {
    if (r.success) return;
    const code = r.error?.code ?? "";
    if (
      code === "messaging/registration-token-not-registered" ||
      code === "messaging/invalid-argument" ||
      code === "messaging/invalid-registration-token"
    ) {
      dead.push(tokens[i]);
    }
  });
  if (dead.length) {
    await prisma.nativePushToken.deleteMany({ where: { token: { in: dead } } }).catch(() => {});
  }

  return res.successCount;
}
