export type QuoteLite = {
  symbol: string;
  shortName?: string;
  longName?: string;
  exchange?: string;
  currency?: string;
  regularMarketPrice?: number;
  regularMarketChangePercent?: number;
  regularMarketPreviousClose?: number;
  regularMarketVolume?: number;
  marketCap?: number;
  trailingPE?: number;
  priceToBook?: number;
  fiftyTwoWeekHigh?: number;
  fiftyTwoWeekLow?: number;
};

export type OhlcvPoint = {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
};

const USER_AGENT = "Mozilla/5.0 (compatible; EkonomiBot/1.0; +https://example.com)";

async function fetchJson<T>(url: string, ttlSeconds = 900): Promise<T> {
  const response = await fetch(url, {
    headers: { "User-Agent": USER_AGENT },
    next: { revalidate: ttlSeconds },
  });

  if (!response.ok) {
    throw new Error(`Yahoo fetch failed: ${response.status}`);
  }

  return response.json() as Promise<T>;
}

export async function fetchYahooQuotes(symbols: string[]): Promise<QuoteLite[]> {
  if (!symbols.length) {
    return [];
  }

  const encoded = encodeURIComponent(symbols.join(","));
  const json = await fetchJson<{ quoteResponse?: { result?: QuoteLite[] } }>(
    `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${encoded}`,
    300
  );

  return json.quoteResponse?.result ?? [];
}

export async function fetchYahooChart(symbol: string, range = "6mo", interval = "1d"): Promise<OhlcvPoint[]> {
  const json = await fetchJson<{ chart?: { result?: Array<{ timestamp?: number[]; indicators?: { quote?: Array<{ open?: Array<number | null>; high?: Array<number | null>; low?: Array<number | null>; close?: Array<number | null>; volume?: Array<number | null> }> } }> } }>(
    `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=${encodeURIComponent(range)}&interval=${encodeURIComponent(interval)}`,
    300
  );

  const result = json.chart?.result?.[0];
  const timestamps = result?.timestamp ?? [];
  const quote = result?.indicators?.quote?.[0];
  const opens = quote?.open ?? [];
  const highs = quote?.high ?? [];
  const lows = quote?.low ?? [];
  const closes = quote?.close ?? [];
  const volumes = quote?.volume ?? [];

  const rows: OhlcvPoint[] = [];
  for (let i = 0; i < timestamps.length; i += 1) {
    const ts = timestamps[i];
    const open = opens[i];
    const high = highs[i];
    const low = lows[i];
    const close = closes[i];
    const volume = volumes[i];

    if (
      typeof ts !== "number" ||
      typeof open !== "number" ||
      typeof high !== "number" ||
      typeof low !== "number" ||
      typeof close !== "number"
    ) {
      continue;
    }

    rows.push({
      date: new Date(ts * 1000).toISOString(),
      open,
      high,
      low,
      close,
      volume: typeof volume === "number" ? volume : 0,
    });
  }

  return rows;
}

export async function fetchQuoteSummary(symbol: string, modules: string[]): Promise<Record<string, unknown>> {
  const query = encodeURIComponent(modules.join(","));
  const json = await fetchJson<{
    quoteSummary?: {
      result?: Array<Record<string, unknown>>;
    };
  }>(
    `https://query2.finance.yahoo.com/v10/finance/quoteSummary/${encodeURIComponent(symbol)}?modules=${query}`,
    1800
  );

  return json.quoteSummary?.result?.[0] ?? {};
}

export function readFmt(value: unknown): number | string | null {
  if (value === null || value === undefined) {
    return null;
  }

  if (typeof value === "number" || typeof value === "string") {
    return value;
  }

  if (typeof value === "object") {
    const asObj = value as { raw?: unknown; fmt?: unknown; longFmt?: unknown };
    if (typeof asObj.raw === "number" || typeof asObj.raw === "string") {
      return asObj.raw;
    }
    if (typeof asObj.fmt === "string" || typeof asObj.fmt === "number") {
      return asObj.fmt;
    }
    if (typeof asObj.longFmt === "string" || typeof asObj.longFmt === "number") {
      return asObj.longFmt;
    }
  }

  return null;
}
