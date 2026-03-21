import { getOptionalEnv } from "@/lib/env";

export type AlphaVantageQuote = {
  symbol: string;
  open: number;
  high: number;
  low: number;
  price: number;
  volume: number;
  latestTradingDay: string;
  previousClose: number;
  change: number;
  changePercent: string;
};

export type AlphaVantageTimeSeries = {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
};

const BASE_URL = "https://www.alphavantage.co/query";

async function fetchWithApiKey<T>(endpoint: string): Promise<T> {
  const apiKey = getOptionalEnv("ALPHAVANTAGE_API_KEY");
  
  if (!apiKey) {
    throw new Error("Alpha Vantage API key not configured");
  }

  const url = `${BASE_URL}${endpoint}&apikey=${apiKey}`;
  
  const response = await fetch(url, {
    next: { revalidate: 300 },
  });

  if (!response.ok) {
    throw new Error(`Alpha Vantage API error: ${response.status}`);
  }

  const data = await response.json();

  if (data["Error Message"]) {
    throw new Error(`Alpha Vantage: ${data["Error Message"]}`);
  }

  if (data["Note"]) {
    throw new Error("Alpha Vantage API rate limit reached");
  }

  return data as T;
}

export async function fetchAlphaVantageQuote(symbol: string): Promise<AlphaVantageQuote | null> {
  try {
    const data = await fetchWithApiKey<{
      "Global Quote": Record<string, string>;
    }>(`?function=GLOBAL_QUOTE&symbol=${symbol}`);

    const quote = data["Global Quote"];
    
    if (!quote || Object.keys(quote).length === 0) {
      return null;
    }

    return {
      symbol: quote["01. symbol"],
      open: parseFloat(quote["02. open"]),
      high: parseFloat(quote["03. high"]),
      low: parseFloat(quote["04. low"]),
      price: parseFloat(quote["05. price"]),
      volume: parseInt(quote["06. volume"]),
      latestTradingDay: quote["07. latest trading day"],
      previousClose: parseFloat(quote["08. previous close"]),
      change: parseFloat(quote["09. change"]),
      changePercent: quote["10. change percent"],
    };
  } catch (error) {
    console.error(`Alpha Vantage quote fetch failed for ${symbol}:`, error);
    return null;
  }
}

export async function fetchAlphaVantageIntraday(
  symbol: string,
  interval: "1min" | "5min" | "15min" | "30min" | "60min" = "15min"
): Promise<AlphaVantageTimeSeries[]> {
  try {
    const data = await fetchWithApiKey<{
      "Time Series (5min)"?: Record<string, Record<string, string>>;
      "Time Series (15min)"?: Record<string, Record<string, string>>;
      "Time Series (30min)"?: Record<string, Record<string, string>>;
      "Time Series (60min)"?: Record<string, Record<string, string>>;
    }>(`?function=TIME_SERIES_INTRADAY&symbol=${symbol}&interval=${interval}`);

    const timeSeriesKey = `Time Series (${interval})` as keyof typeof data;
    const timeSeries = data[timeSeriesKey];

    if (!timeSeries) {
      return [];
    }

    return Object.entries(timeSeries)
      .map(([date, values]) => ({
        date,
        open: parseFloat(values["1. open"]),
        high: parseFloat(values["2. high"]),
        low: parseFloat(values["3. low"]),
        close: parseFloat(values["4. close"]),
        volume: parseInt(values["5. volume"]),
      }))
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  } catch (error) {
    console.error(`Alpha Vantage intraday fetch failed for ${symbol}:`, error);
    return [];
  }
}

export async function fetchAlphaVantageDaily(symbol: string): Promise<AlphaVantageTimeSeries[]> {
  try {
    const data = await fetchWithApiKey<{
      "Time Series (Daily)": Record<string, Record<string, string>>;
    }>(`?function=TIME_SERIES_DAILY&symbol=${symbol}`);

    const timeSeries = data["Time Series (Daily)"];

    if (!timeSeries) {
      return [];
    }

    return Object.entries(timeSeries)
      .map(([date, values]) => ({
        date,
        open: parseFloat(values["1. open"]),
        high: parseFloat(values["2. high"]),
        low: parseFloat(values["3. low"]),
        close: parseFloat(values["4. close"]),
        volume: parseInt(values["5. volume"]),
      }))
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  } catch (error) {
    console.error(`Alpha Vantage daily fetch failed for ${symbol}:`, error);
    return [];
  }
}

export async function searchAlphaVantageSymbol(keywords: string): Promise<Array<{ symbol: string; name: string; type: string; region: string }>> {
  try {
    const data = await fetchWithApiKey<{
      bestMatches: Array<Record<string, string>>;
    }>(`?function=SYMBOL_SEARCH&keywords=${encodeURIComponent(keywords)}`);

    if (!data.bestMatches) {
      return [];
    }

    return data.bestMatches.map((match) => ({
      symbol: match["1. symbol"],
      name: match["2. name"],
      type: match["3. type"],
      region: match["4. region"],
    }));
  } catch (error) {
    console.error(`Alpha Vantage symbol search failed for ${keywords}:`, error);
    return [];
  }
}