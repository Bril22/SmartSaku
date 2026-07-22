import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { GOOGLE_AUTH_URL, googleConfigured, redirectUri } from "@/lib/google";

export async function GET() {
  if (!googleConfigured()) {
    redirect("/login?error=google_unavailable");
  }
  // random value echoed back by Google, so a forged callback cannot be replayed
  const state = crypto.randomUUID();
  const jar = await cookies();
  jar.set("smartsaku_oauth_state", state, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 600,
    path: "/",
  });

  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID!,
    redirect_uri: await redirectUri(),
    response_type: "code",
    scope: "openid email profile",
    state,
    prompt: "select_account",
  });
  redirect(`${GOOGLE_AUTH_URL}?${params}`);
}
