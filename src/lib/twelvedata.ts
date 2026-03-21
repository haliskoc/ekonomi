import { getOptionalEnv } from "@/lib/env";

export type TwelveDataQuote = {
  symbol: string;
  name: string;
  exchange: string;
  currency: string;
  datetime: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  previousClose: number;
  change: number;
  percentChange: number;
};

export type TwelveDataTimeSeries = {
  datetime: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
};

const BASE_URL = "https://api.twelvedata.com";

async function fetchWithApiKey<T>(endpoint: string): Promise<T> {
  const apiKey = getOptionalEnv("TWELVE_DATA_API_KEY");
  
  if (!apiKey) {
    throw new Error("Twelve Data API key not configured");
  }

  const separator = endpoint.includes("?") ? "&" : "?";
  const url = `${BASE_URL}${endpoint}${separator}apikey=${apiKey}`;
  
  const response = await fetch(url, {
    next: { revalidate: 300 },
  });

  if (!response.ok) {
    throw new Error(`Twelve Data API error: ${response.status}`);
  }

  const data = await response.json();

  if (data.status === "error") {
    throw new Error(`Twelve Data: ${data.message}`);
  }

  return data as T;
}

export async function fetchTwelveDataQuote(symbol: string): Promise<TwelveDataQuote | null> {
  try {
    const data = await fetchWithApiKey<TwelveDataQuote>(`/quote?symbol=${symbol}`);

    if (!data || !data.symbol) {
      return null;
    }

    return data;
  } catch (error) {
    console.error(`Twelve Data quote fetch failed for ${symbol}:`, error);
    return null;
  }
}

export async function fetchTwelveDataTimeSeries(
  symbol: string,
  interval: "1min" | "5min" | "15min" | "30min" | "1h" | "1day" | "1week" | "1month" = "1day",
  outputSize: number = 30
): Promise<TwelveDataTimeSeries[]> {
  try {
    const data = await fetchWithApiKey<{
      values: Array<TwelveDataTimeSeries>;
    }>(`/time_series?symbol=${symbol}&interval=${interval}&outputsize=${outputSize}`);

    if (!data.values) {
      return [];
    }

    return data.values.sort((a, b) => new Date(a.datetime).getTime() - new Date(b.datetime).getTime());
  } catch (error) {
    console.error(`Twelve Data time series fetch failed for ${symbol}:`, error);
    return [];
  }
}

export async function fetchTwelveDataMultipleQuotes(symbols: string[]): Promise<TwelveDataQuote[]> {
  try {
    const symbolString = symbols.join(",");
    const data = await fetchWithApiKey<Record<string, TwelveDataQuote>>(`/quote?symbol=${symbolString}`);

    if (!data) {
      return [];
    }

    return Object.values(data).filter((quote) => quote && quote.symbol);
  } catch (error) {
    console.error(`Twelve Data multiple quotes fetch failed:`, error);
    return [];
  }
}

export async function searchTwelveDataSymbol(keywords: string): Promise<Array<{ symbol: string; instrument_name: string; exchange: string; instrument_type: string; country: string }>> {
  try {
    const data = await fetchWithApiKey<{
      data: Array<{ symbol: string; instrument_name: string; exchange: string; instrument_type: string; country: string }>;
    }>(`/symbol_search?symbol=${encodeURIComponent(keywords)}`);

    if (!data.data) {
      return [];
    }

    return data.data;
  } catch (error) {
    console.error(`Twelve Data symbol search failed for ${keywords}:`, error);
    return [];
  }
}

export async function fetchTwelveDataForex(pair: string = "EUR/USD"): Promise<{ symbol: string; price: number; datetime: string } | null> {
  try {
    const data = await fetchWithApiKey<{ symbol: string; price: string; datetime: string }>(`/exchange_rate?symbol=${pair}`);

    if (!data || !data.symbol) {
      return null;
    }

    return {
      symbol: data.symbol,
      price: parseFloat(data.price),
      datetime: data.datetime,
    };
  } catch (error) {
    console.error(`Twelve Data forex fetch failed for ${pair}:`, error);
    return null;
  }
}