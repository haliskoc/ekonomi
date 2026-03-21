import { getOptionalEnv } from "@/lib/env";

export type FinnhubQuote = {
  c: number; // Current price
  d: number; // Change
  dp: number; // Percent change
  h: number; // High price of the day
  l: number; // Low price of the day
  o: number; // Open price of the day
  pc: number; // Previous close price
  t: number; // Timestamp
};

export type FinnhubCandle = {
  c: number[]; // Close prices
  h: number[]; // High prices
  l: number[]; // Low prices
  o: number[]; // Open prices
  t: number[]; // Timestamps
  v: number[]; // Volumes
  s: string; // Status
};

export type FinnhubCompanyProfile = {
  country: string;
  currency: string;
  exchange: string;
  ipo: string;
  marketCapitalization: number;
  name: string;
  phone: string;
  shareOutstanding: number;
  ticker: string;
  weburl: string;
  logo: string;
  finnhubIndustry: string;
};

export type FinnhubNews = {
  category: string;
  datetime: number;
  headline: string;
  id: number;
  image: string;
  related: string;
  source: string;
  summary: string;
  url: string;
};

const BASE_URL = "https://finnhub.io/api/v1";

async function fetchWithApiKey<T>(endpoint: string): Promise<T> {
  const apiKey = getOptionalEnv("FINNHUB_API_KEY");
  
  if (!apiKey) {
    throw new Error("Finnhub API key not configured");
  }

  const separator = endpoint.includes("?") ? "&" : "?";
  const url = `${BASE_URL}${endpoint}${separator}token=${apiKey}`;
  
  const response = await fetch(url, {
    next: { revalidate: 60 }, // 1 dakika cache
  });

  if (!response.ok) {
    if (response.status === 429) {
      throw new Error("Finnhub API rate limit reached");
    }
    throw new Error(`Finnhub API error: ${response.status}`);
  }

  const data = await response.json();

  if (data.error) {
    throw new Error(`Finnhub: ${data.error}`);
  }

  return data as T;
}

export async function fetchFinnhubQuote(symbol: string): Promise<FinnhubQuote | null> {
  try {
    const data = await fetchWithApiKey<FinnhubQuote>(`/quote?symbol=${symbol}`);

    if (!data || !data.c) {
      return null;
    }

    return data;
  } catch (error) {
    console.error(`Finnhub quote fetch failed for ${symbol}:`, error);
    return null;
  }
}

export async function fetchFinnhubCandles(
  symbol: string,
  resolution: "1" | "5" | "15" | "30" | "60" | "D" | "W" | "M" = "D",
  from: number = Math.floor(Date.now() / 1000) - 30 * 24 * 60 * 60,
  to: number = Math.floor(Date.now() / 1000)
): Promise<FinnhubCandle | null> {
  try {
    const data = await fetchWithApiKey<FinnhubCandle>(
      `/stock/candle?symbol=${symbol}&resolution=${resolution}&from=${from}&to=${to}`
    );

    if (!data || data.s !== "ok") {
      return null;
    }

    return data;
  } catch (error) {
    console.error(`Finnhub candles fetch failed for ${symbol}:`, error);
    return null;
  }
}

export async function fetchFinnhubCompanyProfile(symbol: string): Promise<FinnhubCompanyProfile | null> {
  try {
    const data = await fetchWithApiKey<FinnhubCompanyProfile>(`/stock/profile2?symbol=${symbol}`);

    if (!data || !data.name) {
      return null;
    }

    return data;
  } catch (error) {
    console.error(`Finnhub company profile fetch failed for ${symbol}:`, error);
    return null;
  }
}

export async function fetchFinnhubCompanyNews(
  symbol: string,
  from: string = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split("T")[0],
  to: string = new Date().toISOString().split("T")[0]
): Promise<FinnhubNews[]> {
  try {
    const data = await fetchWithApiKey<FinnhubNews[]>(
      `/company-news?symbol=${symbol}&from=${from}&to=${to}`
    );

    if (!data || !Array.isArray(data)) {
      return [];
    }

    return data.slice(0, 20); // İlk 20 haber
  } catch (error) {
    console.error(`Finnhub company news fetch failed for ${symbol}:`, error);
    return [];
  }
}

export async function fetchFinnhubMarketNews(category: string = "general"): Promise<FinnhubNews[]> {
  try {
    const data = await fetchWithApiKey<FinnhubNews[]>(`/news?category=${category}`);

    if (!data || !Array.isArray(data)) {
      return [];
    }

    return data.slice(0, 20);
  } catch (error) {
    console.error(`Finnhub market news fetch failed:`, error);
    return [];
  }
}

export async function searchFinnhubSymbol(query: string): Promise<Array<{ description: string; displaySymbol: string; symbol: string; type: string }>> {
  try {
    const data = await fetchWithApiKey<{
      count: number;
      result: Array<{ description: string; displaySymbol: string; symbol: string; type: string }>;
    }>(`/search?q=${encodeURIComponent(query)}`);

    if (!data.result) {
      return [];
    }

    return data.result;
  } catch (error) {
    console.error(`Finnhub symbol search failed for ${query}:`, error);
    return [];
  }
}