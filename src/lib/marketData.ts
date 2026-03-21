import { getOptionalEnv } from "@/lib/env";
import { fetchYahooQuotes, fetchYahooChart, type QuoteLite, type OhlcvPoint } from "@/lib/yahoo";
import { fetchAlphaVantageQuote, fetchAlphaVantageDaily, type AlphaVantageQuote, type AlphaVantageTimeSeries } from "@/lib/alphavantage";
import { fetchTwelveDataQuote, fetchTwelveDataTimeSeries, type TwelveDataQuote, type TwelveDataTimeSeries } from "@/lib/twelvedata";
import { fetchFinnhubQuote, fetchFinnhubCandles, type FinnhubQuote, type FinnhubCandle } from "@/lib/finnhub";

export type UnifiedQuote = {
  symbol: string;
  name?: string;
  price: number;
  change: number;
  changePercent: number;
  open: number;
  high: number;
  low: number;
  previousClose: number;
  volume: number;
  marketCap?: number;
  source: "yahoo" | "alphavantage" | "twelvedata" | "finnhub";
};

export type UnifiedCandle = {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
};

export type MarketDataProvider = "yahoo" | "alphavantage" | "twelvedata" | "finnhub";

// API kullanılabilirliğini kontrol et
function isProviderAvailable(provider: MarketDataProvider): boolean {
  switch (provider) {
    case "yahoo":
      return true; // Yahoo API key gerektirmez
    case "alphavantage":
      return !!getOptionalEnv("ALPHAVANTAGE_API_KEY");
    case "twelvedata":
      return !!getOptionalEnv("TWELVE_DATA_API_KEY");
    case "finnhub":
      return !!getOptionalEnv("FINNHUB_API_KEY");
    default:
      return false;
  }
}

// Mevcut provider'ları öncelik sırasına göre al
function getAvailableProviders(): MarketDataProvider[] {
  const providers: MarketDataProvider[] = ["yahoo", "alphavantage", "twelvedata", "finnhub"];
  return providers.filter(isProviderAvailable);
}

// Quote verisini normalize et
function normalizeYahooQuote(quote: QuoteLite): UnifiedQuote {
  return {
    symbol: quote.symbol,
    name: quote.longName || quote.shortName,
    price: quote.regularMarketPrice || 0,
    change: ((quote.regularMarketPrice || 0) - (quote.regularMarketPreviousClose || 0)),
    changePercent: quote.regularMarketChangePercent || 0,
    open: 0,
    high: 0,
    low: 0,
    previousClose: quote.regularMarketPreviousClose || 0,
    volume: quote.regularMarketVolume || 0,
    marketCap: quote.marketCap,
    source: "yahoo",
  };
}

function normalizeAlphaVantageQuote(quote: AlphaVantageQuote): UnifiedQuote {
  return {
    symbol: quote.symbol,
    price: quote.price,
    change: quote.change,
    changePercent: parseFloat(quote.changePercent.replace("%", "")),
    open: quote.open,
    high: quote.high,
    low: quote.low,
    previousClose: quote.previousClose,
    volume: quote.volume,
    source: "alphavantage",
  };
}

function normalizeTwelveDataQuote(quote: TwelveDataQuote): UnifiedQuote {
  return {
    symbol: quote.symbol,
    name: quote.name,
    price: quote.close,
    change: quote.change,
    changePercent: quote.percentChange,
    open: quote.open,
    high: quote.high,
    low: quote.low,
    previousClose: quote.previousClose,
    volume: quote.volume,
    source: "twelvedata",
  };
}

function normalizeFinnhubQuote(quote: FinnhubQuote): UnifiedQuote {
  return {
    symbol: "",
    price: quote.c,
    change: quote.d,
    changePercent: quote.dp,
    open: quote.o,
    high: quote.h,
    low: quote.l,
    previousClose: quote.pc,
    volume: 0,
    source: "finnhub",
  };
}

// Ana quote fonksiyonu - fallback mekanizması ile
export async function fetchMarketQuote(
  symbol: string,
  preferredProvider?: MarketDataProvider
): Promise<UnifiedQuote | null> {
  const providers = getAvailableProviders();
  
  // Tercih edilen provider varsa başa al
  if (preferredProvider && providers.includes(preferredProvider)) {
    const ordered = [preferredProvider, ...providers.filter(p => p !== preferredProvider)];
    providers.splice(0, providers.length, ...ordered);
  }

  for (const provider of providers) {
    try {
      switch (provider) {
        case "yahoo": {
          const quotes = await fetchYahooQuotes([symbol]);
          if (quotes.length > 0) {
            const normalized = normalizeYahooQuote(quotes[0]);
            normalized.symbol = symbol;
            return normalized;
          }
          break;
        }
        case "alphavantage": {
          const quote = await fetchAlphaVantageQuote(symbol);
          if (quote) {
            return normalizeAlphaVantageQuote(quote);
          }
          break;
        }
        case "twelvedata": {
          const quote = await fetchTwelveDataQuote(symbol);
          if (quote) {
            return normalizeTwelveDataQuote(quote);
          }
          break;
        }
        case "finnhub": {
          const quote = await fetchFinnhubQuote(symbol);
          if (quote) {
            const normalized = normalizeFinnhubQuote(quote);
            normalized.symbol = symbol;
            return normalized;
          }
          break;
        }
      }
    } catch (error) {
      console.warn(`Provider ${provider} failed for ${symbol}:`, error);
      continue;
    }
  }

  return null;
}

// Birden fazla sembol için quote
export async function fetchMultipleQuotes(
  symbols: string[],
  preferredProvider?: MarketDataProvider
): Promise<UnifiedQuote[]> {
  const results: UnifiedQuote[] = [];
  
  // Batch işlem için provider seçimi
  const provider = preferredProvider || getAvailableProviders()[0];
  
  if (!provider) {
    throw new Error("No market data provider available");
  }

  try {
    switch (provider) {
      case "yahoo": {
        const quotes = await fetchYahooQuotes(symbols);
        for (const quote of quotes) {
          results.push(normalizeYahooQuote(quote));
        }
        break;
      }
      case "alphavantage": {
        // Alpha Vantage batch desteklemez, tek tek çek
        for (const symbol of symbols) {
          const quote = await fetchAlphaVantageQuote(symbol);
          if (quote) {
            results.push(normalizeAlphaVantageQuote(quote));
          }
        }
        break;
      }
      case "twelvedata": {
        const quotes = await fetchTwelveDataTimeSeries(symbols[0]); // Twelve Data tek sembol
        // Fallback to individual quotes
        for (const symbol of symbols) {
          const quote = await fetchTwelveDataQuote(symbol);
          if (quote) {
            results.push(normalizeTwelveDataQuote(quote));
          }
        }
        break;
      }
      case "finnhub": {
        // Finnhub batch desteklemez
        for (const symbol of symbols) {
          const quote = await fetchFinnhubQuote(symbol);
          if (quote) {
            const normalized = normalizeFinnhubQuote(quote);
            normalized.symbol = symbol;
            results.push(normalized);
          }
        }
        break;
      }
    }
  } catch (error) {
    console.error(`Batch quote failed with provider ${provider}:`, error);
  }

  return results;
}

// Grafik verisi için
export async function fetchChartData(
  symbol: string,
  range: string = "6mo",
  preferredProvider?: MarketDataProvider
): Promise<UnifiedCandle[]> {
  const providers = getAvailableProviders();
  
  if (preferredProvider && providers.includes(preferredProvider)) {
    const ordered = [preferredProvider, ...providers.filter(p => p !== preferredProvider)];
    providers.splice(0, providers.length, ...ordered);
  }

  for (const provider of providers) {
    try {
      switch (provider) {
        case "yahoo": {
          const candles = await fetchYahooChart(symbol, range);
          return candles.map(c => ({
            date: c.date,
            open: c.open,
            high: c.high,
            low: c.low,
            close: c.close,
            volume: c.volume,
          }));
        }
        case "alphavantage": {
          const candles = await fetchAlphaVantageDaily(symbol);
          return candles.map(c => ({
            date: c.date,
            open: c.open,
            high: c.high,
            low: c.low,
            close: c.close,
            volume: c.volume,
          }));
        }
        case "twelvedata": {
          const interval = range === "1mo" ? "1day" : range === "3mo" ? "1day" : "1day";
          const candles = await fetchTwelveDataTimeSeries(symbol, interval, range === "1mo" ? 30 : range === "3mo" ? 90 : 180);
          return candles.map(c => ({
            date: c.datetime,
            open: c.open,
            high: c.high,
            low: c.low,
            close: c.close,
            volume: c.volume,
          }));
        }
        case "finnhub": {
          const resolution = "D";
          const from = Math.floor(Date.now() / 1000) - (range === "1mo" ? 30 : range === "3mo" ? 90 : 180) * 24 * 60 * 60;
          const to = Math.floor(Date.now() / 1000);
          const candle = await fetchFinnhubCandles(symbol, resolution, from, to);
          
          if (candle && candle.s === "ok") {
            return candle.t.map((timestamp, i) => ({
              date: new Date(timestamp * 1000).toISOString(),
              open: candle.o[i],
              high: candle.h[i],
              low: candle.l[i],
              close: candle.c[i],
              volume: candle.v[i],
            }));
          }
          break;
        }
      }
    } catch (error) {
      console.warn(`Chart data provider ${provider} failed for ${symbol}:`, error);
      continue;
    }
  }

  return [];
}

// Mevcut provider'ları listele
export function getMarketDataStatus(): Array<{ provider: MarketDataProvider; available: boolean; name: string }> {
  return [
    { provider: "yahoo", available: isProviderAvailable("yahoo"), name: "Yahoo Finance" },
    { provider: "alphavantage", available: isProviderAvailable("alphavantage"), name: "Alpha Vantage" },
    { provider: "twelvedata", available: isProviderAvailable("twelvedata"), name: "Twelve Data" },
    { provider: "finnhub", available: isProviderAvailable("finnhub"), name: "Finnhub" },
  ];
}