import crypto from "crypto";

function snapUrl(): string {
  return process.env.MIDTRANS_IS_PRODUCTION === "true"
    ? "https://app.midtrans.com/snap/v1/transactions"
    : "https://app.sandbox.midtrans.com/snap/v1/transactions";
}

export function midtransConfigured(): boolean {
  return !!process.env.MIDTRANS_SERVER_KEY;
}

/** Create a Snap transaction and return its hosted payment page URL. */
export async function createSnapTransaction(params: {
  orderId: string;
  amount: number;
  email: string;
  name: string;
  itemName: string;
  finishUrl: string;
}): Promise<{ redirectUrl: string } | null> {
  const serverKey = process.env.MIDTRANS_SERVER_KEY;
  if (!serverKey) return null;
  const auth = Buffer.from(serverKey + ":").toString("base64");
  try {
    const res = await fetch(snapUrl(), {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "application/json",
        authorization: `Basic ${auth}`,
      },
      body: JSON.stringify({
        transaction_details: { order_id: params.orderId, gross_amount: params.amount },
        customer_details: { email: params.email, first_name: params.name },
        item_details: [
          { id: params.orderId, price: params.amount, quantity: 1, name: params.itemName },
        ],
        callbacks: { finish: params.finishUrl },
      }),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { redirect_url?: string };
    return data.redirect_url ? { redirectUrl: data.redirect_url } : null;
  } catch {
    return null;
  }
}

/** Verify a Midtrans webhook using the SHA-512 signature. */
export function verifyNotification(n: {
  order_id?: string;
  status_code?: string;
  gross_amount?: string;
  signature_key?: string;
}): boolean {
  const serverKey = process.env.MIDTRANS_SERVER_KEY;
  if (!serverKey || !n.order_id || !n.status_code || !n.gross_amount || !n.signature_key) {
    return false;
  }
  const expected = crypto
    .createHash("sha512")
    .update(n.order_id + n.status_code + n.gross_amount + serverKey)
    .digest("hex");
  return expected === n.signature_key;
}
