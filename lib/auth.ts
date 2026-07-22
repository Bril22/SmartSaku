import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { prisma } from "./db";

if (!process.env.AUTH_SECRET) {
  // a fallback here would let anyone forge a session on a misconfigured deploy
  throw new Error("AUTH_SECRET is not set — refusing to start without a signing key");
}
const secret = new TextEncoder().encode(process.env.AUTH_SECRET);
const COOKIE = "smartsaku_session";

type Session = { userId: string; ver: number };

export async function createSession(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { sessionVersion: true },
  });
  const token = await new SignJWT({ sub: userId, ver: user?.sessionVersion ?? 0 })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("30d")
    .sign(secret);
  const jar = await cookies();
  jar.set(COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 60 * 60 * 24 * 30,
    path: "/",
  });
}

/** Signature and expiry only — cheap, no database round trip. */
export async function readSession(): Promise<Session | null> {
  const jar = await cookies();
  const token = jar.get(COOKIE)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret);
    const userId = payload.sub as string | undefined;
    if (!userId) return null;
    return { userId, ver: typeof payload.ver === "number" ? payload.ver : 0 };
  } catch {
    return null;
  }
}

export async function getSessionUserId(): Promise<string | null> {
  return (await readSession())?.userId ?? null;
}

/**
 * Checks the token against the user's current session version, so a password
 * change or an explicit sign-out-everywhere really does end other sessions.
 */
export async function requireUserId(): Promise<string> {
  const session = await readSession();
  if (!session) redirect("/login");
  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    select: { sessionVersion: true },
  });
  if (!user || user.sessionVersion !== session.ver) redirect("/login");
  return session.userId;
}

/** Ends every session for this user, including the current one. */
export async function revokeSessions(userId: string) {
  await prisma.user.update({
    where: { id: userId },
    data: { sessionVersion: { increment: 1 } },
  });
}

export async function destroySession() {
  const jar = await cookies();
  jar.delete(COOKIE);
}

/**
 * `backTo` arrives from a hidden form field, so it is attacker-controlled.
 * Only same-site absolute paths are allowed — never "//host" or "https://host".
 */
export function safeBackTo(value: FormDataEntryValue | null, fallback: string): string {
  const raw = String(value ?? "").trim();
  if (!raw.startsWith("/") || raw.startsWith("//") || raw.includes("\\")) return fallback;
  return raw;
}
