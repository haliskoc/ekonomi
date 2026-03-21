import { NextRequest } from "next/server";
import { BIST100_COMPANIES, type BistCompany } from "@/lib/bist100";
import { z } from "zod";
import { checkRateLimit } from "@/lib/rateLimit";
import { createRequestId, getClientIp, jsonError, jsonSuccess } from "@/lib/api";

type MarketKey = "bist100" | "nasdaq100" | "sp500" | "nasdaq" | "nyse" | "amex" | "usall";
type UsExchangeKey = "nasdaq" | "nyse" | "amex";
const RATE_LIMIT_WINDOW_MS = 60 * 1000;
const RATE_LIMIT_COUNT = 60;
const marketSchema = z.enum(["bist100", "nasdaq100", "sp500", "nasdaq", "nyse", "amex", "usall"]);

type Company = {
  symbol: string;
  name: string;
  nameEn?: string;
  nameTr?: string;
  officialNameTr?: string;
  aliases?: string[];
  logoUrl?: string;
  exchange?: string;
  sector?: string;
  industry?: string;
  country?: string;
  marketCap?: string;
  lastSale?: string;
  netChange?: string;
  pctChange?: string;
  volume?: string;
  ipoYear?: string;
  sourceUrl?: string;
};

type RepoCompany = {
  symbol: string;
  name: string;
  logoUrl: string;
};

const USER_AGENT = "Mozilla/5.0 (compatible; EkonomiBot/1.0; +https://example.com)";

const NASDAQ100_URL = "https://en.wikipedia.org/wiki/Nasdaq-100";
const SP500_URL = "https://en.wikipedia.org/wiki/List_of_S%26P_500_companies";
const BIST_REPO_JSON_URL =
  "https://cdn.jsdelivr.net/gh/ahmeterenodaci/Istanbul-Stock-Exchange--BIST--including-symbols-and-logos/bist.min.json";
const US_STOCK_SYMBOLS_BASE = "https://raw.githubusercontent.com/rreichel3/US-Stock-Symbols/main";

const cache = new Map<MarketKey, { expiresAt: number; companies: Company[] }>();
const CACHE_TTL_MS = 1000 * 60 * 60 * 6;
const repoBistCache = new Map<string, { expiresAt: number; items: RepoCompany[] }>();
const REPO_CACHE_KEY = "repo-bist-all";
const REPO_CACHE_TTL_MS = 1000 * 60 * 60 * 12;

type UsFullTickerRow = {
  symbol: string;
  name: string;
  lastsale?: string;
  netchange?: string;
  pctchange?: string;
  volume?: string;
  marketCap?: string;
  country?: string;
  ipoyear?: string;
  industry?: string;
  sector?: string;
  url?: string;
};

function decodeHtml(value: string): string {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/&#91;\d+\]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function stripTags(value: string): string {
  return decodeHtml(value.replace(/<[^>]+>/g, " "));
}

function findTableAfterMarker(html: string, marker: string): string {
  const markerIndex = html.indexOf(marker);
  const from = markerIndex >= 0 ? markerIndex : 0;
  const tableStart = html.indexOf("<table", from);
  if (tableStart < 0) {
    return "";
  }

  const tableEnd = html.indexOf("</table>", tableStart);
  if (tableEnd < 0) {
    return "";
  }

  return html.slice(tableStart, tableEnd + "</table>".length);
}

function parseTableRows(tableHtml: string): string[][] {
  const rows = tableHtml.match(/<tr[\s\S]*?<\/tr>/gi) ?? [];
  const parsed: string[][] = [];

  for (const row of rows) {
    const cells = row.match(/<t[dh][^>]*>[\s\S]*?<\/t[dh]>/gi) ?? [];
    const values = cells.map((cell) => stripTags(cell));
    if (values.length >= 2) {
      parsed.push(values);
    }
  }

  return parsed;
}

async function fetchWikiHtml(url: string): Promise<string> {
  const response = await fetch(url, {
    headers: { "User-Agent": USER_AGENT },
    next: { revalidate: 60 * 60 * 6 },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch source: ${response.status}`);
  }

  return response.text();
}

function normalizeTrText(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function buildMergedBist(localCompanies: BistCompany[], repoItems: RepoCompany[]): BistCompany[] {
  const bySymbol = new Map<string, RepoCompany>();
  for (const item of repoItems) {
    bySymbol.set(item.symbol.toUpperCase(), item);
  }

  return localCompanies.map((company) => {
    const repo = bySymbol.get(company.symbol.toUpperCase());
    if (!repo) {
      return company;
    }

    const officialNameTr = normalizeTrText(repo.name);
    const aliasSet = new Set<string>(company.aliases ?? []);
    aliasSet.add(officialNameTr);

    return {
      ...company,
      nameTr: company.nameTr ?? officialNameTr,
      officialNameTr,
      logoUrl: repo.logoUrl || company.logoUrl,
      aliases: Array.from(aliasSet),
    };
  });
}

async function loadBistRepoCompanies(): Promise<RepoCompany[]> {
  const now = Date.now();
  const cached = repoBistCache.get(REPO_CACHE_KEY);
  if (cached && cached.expiresAt > now) {
    return cached.items;
  }

  const response = await fetch(BIST_REPO_JSON_URL, {
    headers: { "User-Agent": USER_AGENT },
    next: { revalidate: 60 * 60 * 12 },
  });

  if (!response.ok) {
    throw new Error(`BIST repo data fetch failed: ${response.status}`);
  }

  const data = (await response.json()) as unknown;
  if (!Array.isArray(data)) {
    throw new Error("BIST repo data parse failed");
  }

  const items = data
    .filter((item): item is RepoCompany => {
      if (!item || typeof item !== "object") {
        return false;
      }
      const x = item as Partial<RepoCompany>;
      return typeof x.symbol === "string" && typeof x.name === "string" && typeof x.logoUrl === "string";
    })
    .map((item) => ({
      symbol: item.symbol.toUpperCase().trim(),
      name: item.name,
      logoUrl: item.logoUrl,
    }));

  repoBistCache.set(REPO_CACHE_KEY, { expiresAt: now + REPO_CACHE_TTL_MS, items });
  return items;
}

function normalizeUsSymbol(value: string): string {
  return value.trim().toUpperCase();
}

function mapUsFullTickerRow(exchange: UsExchangeKey, item: UsFullTickerRow): Company {
  return {
    symbol: normalizeUsSymbol(item.symbol),
    name: item.name.trim(),
    nameEn: item.name.trim(),
    aliases: [item.name.trim()],
    exchange: exchange.toUpperCase(),
    sector: item.sector?.trim() || undefined,
    industry: item.industry?.trim() || undefined,
    country: item.country?.trim() || undefined,
    marketCap: item.marketCap?.trim() || undefined,
    lastSale: item.lastsale?.trim() || undefined,
    netChange: item.netchange?.trim() || undefined,
    pctChange: item.pctchange?.trim() || undefined,
    volume: item.volume?.trim() || undefined,
    ipoYear: item.ipoyear?.trim() || undefined,
    sourceUrl: item.url ? `https://www.nasdaq.com${item.url}` : undefined,
  };
}

async function fetchUsExchangeFull(exchange: UsExchangeKey): Promise<Company[]> {
  const url = `${US_STOCK_SYMBOLS_BASE}/${exchange}/${exchange}_full_tickers.json`;
  const response = await fetch(url, {
    headers: { "User-Agent": USER_AGENT },
    next: { revalidate: 60 * 60 * 12 },
  });

  if (!response.ok) {
    throw new Error(`US full ticker fetch failed (${exchange}): ${response.status}`);
  }

  const data = (await response.json()) as unknown;
  if (!Array.isArray(data)) {
    throw new Error(`US full ticker parse failed (${exchange})`);
  }

  const companies = data
    .filter((item): item is UsFullTickerRow => {
      if (!item || typeof item !== "object") {
        return false;
      }

      const row = item as Partial<UsFullTickerRow>;
      return typeof row.symbol === "string" && typeof row.name === "string";
    })
    .map((item) => mapUsFullTickerRow(exchange, item))
    .filter((item) => item.symbol && item.name);

  if (!companies.length) {
    throw new Error(`US full ticker empty (${exchange})`);
  }

  return companies;
}

async function fetchUsExchangeTickers(exchange: UsExchangeKey): Promise<Company[]> {
  const url = `${US_STOCK_SYMBOLS_BASE}/${exchange}/${exchange}_tickers.json`;
  const response = await fetch(url, {
    headers: { "User-Agent": USER_AGENT },
    next: { revalidate: 60 * 60 * 12 },
  });

  if (!response.ok) {
    throw new Error(`US ticker fetch failed (${exchange}): ${response.status}`);
  }

  const data = (await response.json()) as unknown;
  if (!Array.isArray(data)) {
    throw new Error(`US ticker parse failed (${exchange})`);
  }

  const companies = data
    .filter((item): item is string => typeof item === "string")
    .map((symbol) => normalizeUsSymbol(symbol))
    .filter(Boolean)
    .map((symbol) => ({
      symbol,
      name: symbol,
      nameEn: symbol,
      exchange: exchange.toUpperCase(),
    }));

  if (!companies.length) {
    throw new Error(`US ticker empty (${exchange})`);
  }

  return companies;
}

async function loadUsExchange(exchange: UsExchangeKey): Promise<Company[]> {
  try {
    return await fetchUsExchangeFull(exchange);
  } catch {
    return fetchUsExchangeTickers(exchange);
  }
}

function mergeUsExchanges(exchanges: Company[][]): Company[] {
  const bySymbol = new Map<string, Company>();

  for (const list of exchanges) {
    for (const company of list) {
      if (!company.symbol) {
        continue;
      }

      const key = company.symbol.toUpperCase();
      const previous = bySymbol.get(key);
      if (!previous) {
        bySymbol.set(key, company);
        continue;
      }

      bySymbol.set(key, {
        ...previous,
        ...company,
        aliases: Array.from(new Set([...(previous.aliases ?? []), ...(company.aliases ?? [])])),
      });
    }
  }

  return Array.from(bySymbol.values()).sort((a, b) => a.symbol.localeCompare(b.symbol));
}

async function loadNasdaq100(): Promise<Company[]> {
  const html = await fetchWikiHtml(NASDAQ100_URL);
  const table = findTableAfterMarker(html, "Current components");
  if (!table) {
    throw new Error("Nasdaq-100 table not found");
  }

  const rows = parseTableRows(table);
  const companies = rows
    .map((row) => ({
      symbol: row[0].toUpperCase().trim(),
      name: row[1].trim(),
    }))
    .filter((row) => row.symbol && row.name && row.symbol !== "TICKER")
    .slice(0, 120);

  if (!companies.length) {
    throw new Error("Nasdaq-100 parse returned empty list");
  }

  return companies;
}

async function loadSp500(): Promise<Company[]> {
  const html = await fetchWikiHtml(SP500_URL);
  const table = findTableAfterMarker(html, "S&P 500 component stocks");
  if (!table) {
    throw new Error("S&P 500 table not found");
  }

  const rows = parseTableRows(table);
  const companies = rows
    .map((row) => ({
      symbol: row[0].toUpperCase().trim(),
      name: row[1].trim(),
    }))
    .filter((row) => row.symbol && row.name && row.symbol !== "SYMBOL")
    .slice(0, 520);

  if (!companies.length) {
    throw new Error("S&P 500 parse returned empty list");
  }

  return companies;
}

async function getCompanies(market: MarketKey): Promise<Company[]> {
  if (market === "bist100") {
    try {
      const repoCompanies = await loadBistRepoCompanies();
      return buildMergedBist(BIST100_COMPANIES, repoCompanies);
    } catch {
      return BIST100_COMPANIES;
    }
  }

  const now = Date.now();
  const cached = cache.get(market);
  if (cached && cached.expiresAt > now) {
    return cached.companies;
  }

  let companies: Company[];
  if (market === "nasdaq100") {
    companies = await loadNasdaq100();
  } else if (market === "sp500") {
    companies = await loadSp500();
  } else if (market === "nasdaq") {
    companies = await loadUsExchange("nasdaq");
  } else if (market === "nyse") {
    companies = await loadUsExchange("nyse");
  } else if (market === "amex") {
    companies = await loadUsExchange("amex");
  } else {
    const [nasdaq, nyse, amex] = await Promise.all([
      loadUsExchange("nasdaq"),
      loadUsExchange("nyse"),
      loadUsExchange("amex"),
    ]);
    companies = mergeUsExchanges([nasdaq, nyse, amex]);
  }

  cache.set(market, {
    expiresAt: now + CACHE_TTL_MS,
    companies,
  });

  return companies;
}

export async function GET(request: NextRequest) {
  const requestId = createRequestId();
  const clientIp = getClientIp(request);
  const rate = checkRateLimit({
    key: `markets-constituents:${clientIp}`,
    limit: RATE_LIMIT_COUNT,
    windowMs: RATE_LIMIT_WINDOW_MS,
  });
  if (!rate.allowed) {
    return jsonError("too many requests", 429, {
      requestId,
      code: "RATE_LIMITED",
      headers: {
        "retry-after": String(rate.retryAfterSeconds),
      },
    });
  }

  try {
    const marketParam = (request.nextUrl.searchParams.get("market") || "bist100").toLowerCase();
    const parsed = marketSchema.safeParse(marketParam);
    if (!parsed.success) {
      return jsonError("market must be one of: bist100, nasdaq100, sp500, nasdaq, nyse, amex, usall", 400, {
        requestId,
        code: "INVALID_MARKET",
      });
    }

    const market = parsed.data as MarketKey;
    const companies = await getCompanies(market);

    return jsonSuccess(
      {
        market,
        count: companies.length,
        companies,
        fetchedAt: new Date().toISOString(),
        requestId,
      },
      {
        requestId,
        headers: {
          "cache-control": "public, s-maxage=300, stale-while-revalidate=600",
          "x-ratelimit-remaining": String(rate.remaining),
        },
      }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "unexpected error";
    return jsonError(message, 500, {
      requestId,
      code: "INTERNAL_ERROR",
      headers: {
        "x-ratelimit-remaining": String(rate.remaining),
      },
    });
  }
}
