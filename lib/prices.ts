export type CryptoQuote = { symbol: string; name: string; idr: number };

/**
 * Live crypto prices in IDR from Indodax's free public API. Cached for a few
 * minutes across requests. Returns an empty map if the API is unreachable, so
 * the page still renders (holdings just show no live value).
 */
export async function getCryptoPrices(): Promise<Map<string, CryptoQuote>> {
  try {
    const res = await fetch("https://indodax.com/api/summaries", {
      next: { revalidate: 300 },
    });
    if (!res.ok) return new Map();
    const data = (await res.json()) as { tickers?: Record<string, Record<string, string>> };
    const tickers = data.tickers ?? {};
    const map = new Map<string, CryptoQuote>();
    for (const [pair, t] of Object.entries(tickers)) {
      if (!pair.endsWith("_idr")) continue;
      const symbol = pair.slice(0, -4).toUpperCase();
      const idr = Number(t.last);
      if (idr > 0) map.set(symbol, { symbol, name: t.name || symbol, idr });
    }
    return map;
  } catch {
    return new Map();
  }
}
