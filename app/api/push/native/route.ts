import { NextResponse } from "next/server";
import { resolveSpace } from "@/lib/space";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const space = await resolveSpace();
  if (!space) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "bad json" }, { status: 400 });
  }

  const token = String(body.token ?? "").trim();
  const platform = String(body.platform ?? "").slice(0, 20);
  if (!token) return NextResponse.json({ error: "no token" }, { status: 400 });

  await prisma.nativePushToken.upsert({
    where: { token },
    update: { userId: space.userId, platform },
    create: { userId: space.userId, token, platform },
  });

  return NextResponse.json({ ok: true });
}

export async function DELETE(req: Request) {
  const space = await resolveSpace();
  if (!space) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "bad json" }, { status: 400 });
  }

  const token = String(body.token ?? "").trim();
  if (token) {
    await prisma.nativePushToken.deleteMany({ where: { token, userId: space.userId } });
  }
  return NextResponse.json({ ok: true });
}
