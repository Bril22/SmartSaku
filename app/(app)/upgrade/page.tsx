import Link from "next/link";
import { requireSpace } from "@/lib/space";
import { getPremium, PLANS, PREMIUM_FEATURES, type Tier } from "@/lib/plan";
import { midtransConfigured } from "@/lib/midtrans";
import { createCheckout } from "@/app/actions";
import SubmitButton from "@/components/SubmitButton";

const rp = (v: number) => "Rp" + v.toLocaleString("id-ID");

export default async function UpgradePage() {
  const { userId } = await requireSpace();
  const premium = await getPremium(userId);
  const ready = midtransConfigured();
  const order: Tier[] = ["year", "month", "lifetime"];

  return (
    <div className="max-w-md">
      <Link href="/settings" className="text-xs font-bold text-sagedeep">
        ‹ Settings
      </Link>
      <h1 className="font-display text-2xl font-semibold mt-1 mb-1">SmartSaku Premium</h1>

      {premium ? (
        <div className="bg-goodbg text-good rounded-lg px-4 py-6 text-center font-semibold mt-4">
          You’re Premium 🎉 — thank you for supporting SmartSaku.
        </div>
      ) : (
        <>
          <p className="text-[12.5px] text-inksoft mb-4">
            Unlock the smart features. Everyday tracking stays free forever.
          </p>

          <div className="bg-card border border-line rounded-lg p-4 mb-4">
            {PREMIUM_FEATURES.map((f) => (
              <div key={f} className="flex items-start gap-2 text-[13px] py-1">
                <span className="text-sagedeep">✓</span>
                <span>{f}</span>
              </div>
            ))}
          </div>

          {!ready && (
            <div className="bg-warnbg text-warn rounded-md px-4 py-3 text-[12.5px] font-semibold mb-4">
              Payments are not switched on yet. Add the Midtrans keys to accept upgrades.
            </div>
          )}

          <div className="space-y-2.5">
            {order.map((tier) => {
              const p = PLANS[tier];
              const best = tier === "year";
              return (
                <form key={tier} action={createCheckout}>
                  <input type="hidden" name="tier" value={tier} />
                  <SubmitButton
                    disabled={!ready}
                    className={`w-full rounded-lg px-4 py-3.5 flex items-center justify-between disabled:opacity-50 ${
                      best
                        ? "bg-sagedeep text-cream2"
                        : "bg-card border border-line text-ink"
                    }`}
                    pendingText="Opening payment…"
                  >
                    <span className="text-left">
                      <span className="block font-bold text-[14px]">
                        {p.label}
                        {best && (
                          <span className="ml-2 text-[10px] bg-cream2 text-sagedeep rounded-full px-2 py-0.5 font-extrabold">
                            BEST VALUE
                          </span>
                        )}
                      </span>
                      <span className={`block text-[11px] ${best ? "text-cream2/80" : "text-inksoft"}`}>
                        {p.blurb}
                      </span>
                    </span>
                    <span className="font-display font-bold text-[15px]">{rp(p.price)}</span>
                  </SubmitButton>
                </form>
              );
            })}
          </div>

          <p className="text-[11px] text-inksoft mt-3">
            Pay with QRIS, GoPay, bank transfer and more via Midtrans. Monthly and yearly extend
            your access; re-pay any time to top it up.
          </p>
        </>
      )}
    </div>
  );
}
