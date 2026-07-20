import { prisma } from "./db";

export const CURRENCIES: Record<string, { symbol: string; decimals: number; label: string }> = {
  IDR: { symbol: "Rp", decimals: 0, label: "Indonesian Rupiah" },
  USD: { symbol: "$", decimals: 2, label: "US Dollar" },
  EUR: { symbol: "€", decimals: 2, label: "Euro" },
  SGD: { symbol: "S$", decimals: 2, label: "Singapore Dollar" },
  JPY: { symbol: "¥", decimals: 0, label: "Japanese Yen" },
  GBP: { symbol: "£", decimals: 2, label: "British Pound" },
};

export type Money = {
  code: string;
  ratePerIdr: number;
  symbol: string;
  stale: boolean;
  rp: (idr: number | bigint) => string;
  rpShort: (idr: number | bigint) => string;
};

const DAY_MS = 24 * 60 * 60 * 1000;

async function getRate(code: string): Promise<{ rate: number; stale: boolean } | null> {
  const row = await prisma.exchangeRate.findUnique({ where: { code } });
  if (row && Date.now() - row.fetchedAt.getTime() < DAY_MS) {
    return { rate: row.ratePerIdr, stale: false };
  }
  try {
    const res = await fetch("https://open.er-api.com/v6/latest/IDR", {
      cache: "no-store",
      signal: AbortSignal.timeout(4000),
    });
    const data = await res.json();
    if (data?.result === "success" && data.rates) {
      const codes = Object.keys(CURRENCIES).filter((c) => c !== "IDR");
      await Promise.all(
        codes.map((c) =>
          typeof data.rates[c] === "number"
            ? prisma.exchangeRate.upsert({
                where: { code: c },
                create: { code: c, ratePerIdr: data.rates[c] },
                update: { ratePerIdr: data.rates[c], fetchedAt: new Date() },
              })
            : Promise.resolve(),
        ),
      );
      if (typeof data.rates[code] === "number") return { rate: data.rates[code], stale: false };
    }
  } catch {
    // fall through to stale row
  }
  if (row) return { rate: row.ratePerIdr, stale: true };
  return null;
}

export async function getMoney(userId: string): Promise<Money> {
  const settings = await prisma.settings.findUnique({ where: { userId } });
  const code = settings?.currency && CURRENCIES[settings.currency] ? settings.currency : "IDR";
  if (code === "IDR") return makeMoney("IDR", 1, false);
  const rate = await getRate(code);
  if (!rate) return makeMoney("IDR", 1, false);
  return makeMoney(code, rate.rate, rate.stale);
}

export function makeMoney(code: string, ratePerIdr: number, stale: boolean): Money {
  const { symbol, decimals } = CURRENCIES[code];
  const rp = (idr: number | bigint) => {
    const v = Number(idr) * ratePerIdr;
    return (
      symbol +
      v.toLocaleString(code === "IDR" ? "id-ID" : "en-US", {
        minimumFractionDigits: 0,
        maximumFractionDigits: decimals,
      })
    );
  };
  const rpShort = (idr: number | bigint) => {
    const v = Number(idr) * ratePerIdr;
    if (code === "IDR") {
      if (Math.abs(v) >= 1_000_000_000) return "Rp" + (v / 1_000_000_000).toFixed(2) + "M";
      if (Math.abs(v) >= 1_000_000) return "Rp" + (v / 1_000_000).toFixed(1) + "jt";
      if (Math.abs(v) >= 1_000) return "Rp" + (v / 1_000).toFixed(0) + "rb";
      return "Rp" + v.toFixed(0);
    }
    return (
      symbol +
      v.toLocaleString("en-US", { notation: "compact", maximumFractionDigits: 1 })
    );
  };
  return { code, ratePerIdr, symbol, stale, rp, rpShort };
}
