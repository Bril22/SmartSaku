import { NextResponse } from "next/server";
import { runReminders } from "@/lib/notify";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  // Vercel Cron sends "Authorization: Bearer <CRON_SECRET>" when the env var is set
  if (secret && req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const sent = await runReminders(new Date());
  return NextResponse.json({ ok: true, sent });
}
