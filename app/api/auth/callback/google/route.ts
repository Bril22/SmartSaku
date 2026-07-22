import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { createSession } from "@/lib/auth";
import { exchangeCode, googleConfigured } from "@/lib/google";
import { nameFromEmail, setUpNewUser } from "@/lib/onboarding";
import { clientKey, rateLimit } from "@/lib/rate-limit";

export async function GET(request: Request) {
  if (!googleConfigured()) redirect("/login?error=google_unavailable");

  const limit = await rateLimit(await clientKey("oauth"), 20, 300);
  if (!limit.ok) redirect("/login?error=rate");

  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");

  const jar = await cookies();
  const expected = jar.get("smartsaku_oauth_state")?.value;
  jar.delete("smartsaku_oauth_state");
  if (!code || !state || !expected || state !== expected) {
    redirect("/login?error=google_state");
  }

  const profile = await exchangeCode(code!);
  if (!profile) redirect("/login?error=google_failed");

  let userId: string;
  const byGoogle = await prisma.user.findUnique({ where: { googleId: profile!.sub } });

  if (byGoogle) {
    userId = byGoogle.id;
  } else {
    const byEmail = await prisma.user.findUnique({ where: { email: profile!.email } });
    if (byEmail) {
      // linking on an unverified address would hand over an existing account
      if (!profile!.emailVerified) redirect("/login?error=google_unverified");
      await prisma.user.update({
        where: { id: byEmail.id },
        data: { googleId: profile!.sub, image: byEmail.image ?? profile!.picture },
      });
      userId = byEmail.id;
    } else {
      if (!profile!.emailVerified) redirect("/login?error=google_unverified");
      const created = await prisma.user.create({
        data: {
          email: profile!.email,
          name: profile!.name || nameFromEmail(profile!.email),
          googleId: profile!.sub,
          image: profile!.picture,
        },
      });
      await setUpNewUser(created.id);
      userId = created.id;
    }
  }

  await createSession(userId);
  redirect("/");
}
