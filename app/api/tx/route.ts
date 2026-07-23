import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { resolveSpace } from "@/lib/space";
import { parseWhen, recordTransaction } from "@/lib/tx";

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

  const result = await recordTransaction(space.userId, space.spaceId, {
    amount: Number(body.amount),
    direction: body.direction === "IN" ? "IN" : "OUT",
    accountId: String(body.accountId ?? ""),
    categoryId: body.categoryId ? String(body.categoryId) : null,
    note: String(body.note ?? ""),
    date: parseWhen(body.date),
    clientId: body.clientId ? String(body.clientId) : undefined,
  });

  if (!result.ok) return NextResponse.json({ error: "invalid" }, { status: 422 });

  revalidatePath("/");
  revalidatePath("/money");
  return NextResponse.json({ ok: true, duplicate: !!result.duplicate });
}
