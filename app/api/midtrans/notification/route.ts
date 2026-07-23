import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { verifyNotification } from "@/lib/midtrans";
import { grantPremium, type Tier } from "@/lib/plan";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  let body: Record<string, string>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "bad json" }, { status: 400 });
  }

  if (!verifyNotification(body)) {
    return NextResponse.json({ error: "bad signature" }, { status: 403 });
  }

  const orderId = body.order_id;
  const payment = await prisma.payment.findUnique({ where: { orderId } });
  if (!payment) return NextResponse.json({ received: true });

  const status = body.transaction_status;
  const paid = status === "settlement" || status === "capture";

  if (paid && payment.status !== "paid") {
    await prisma.payment.update({ where: { orderId }, data: { status: "paid" } });
    await grantPremium(payment.userId, payment.tier as Tier);
  } else if (status === "expire" || status === "cancel" || status === "deny") {
    await prisma.payment.update({ where: { orderId }, data: { status } });
  }

  return NextResponse.json({ received: true });
}
