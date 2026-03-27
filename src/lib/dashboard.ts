import type { BistCompany } from "@/lib/bist100";

export type AnalyzeResponse = {
  symbol: string;
  company: string;
  fetchedAt: string;
  cached: boolean;
  requestId?: string;
  market: {
    symbol: string;
    currency: string;
    regularMarketPrice: number;
    previousClose: number;
    dayChangePercent: number;
    oneMonthChangePercent: number | null;
    marketState: string;
    dailyPrices: {
      date: string;
      close: number;
    }[];
  };
  news: {
    title: string;
    link: string;
    pubDate: string;
    source: string;
  }[];
  analysis: {
    summary: string;
    source: "heuristic" | "openai";
    baseCase: string;
    bullCase: string;
    bearCase: string;
    keyDrivers: string[];
    keyRisks: string[];
    disclaimer: string;
  };
};

export type RssItem = {
  title: string;
  link: string;
  pubDate: string;
  source: string;
  description?: string;
  image?: string;
};

export type RssPreviewResponse = {
  feedUrl: string;
  items: RssItem[];
};

export type MarketUniverseKey =
  | "bist100"
  | "nasdaq100"
  | "sp500"
  | "nasdaq"
  | "nyse"
  | "amex"
  | "usall";

export type UniverseResponse = {
  market: MarketUniverseKey;
  count: number;
  companies: BistCompany[];
};

export type FeedView = {
  url: string;
  name: string;
  language: "tr" | "en";
  system: boolean;
  priority: number;
};

export type RssNewsRow = RssItem & {
  feedName: string;
  feedUrl: string;
  feedLanguage: "tr" | "en";
  feedPriority: number;
};

export type NewsSentimentBreakdown = {
  positive: number;
  neutral: number;
  negative: number;
};

export type WorkspaceCompanyRef = {
  symbol: string;
  company: string;
  market: MarketUniverseKey;
};

export type SavedAnalysisEntry = {
  id: string;
  symbol: string;
  company: string;
  market: MarketUniverseKey;
  savedAt: string;
  source: "heuristic" | "openai";
  price: number;
  currency: string;
  dayChangePercent: number;
  oneMonthChangePercent: number | null;
  summary: string;
  baseCase: string;
  bullCase: string;
  bearCase: string;
  dailyPrices: {
    date: string;
    close: number;
  }[];
  keyDrivers: string[];
  keyRisks: string[];
  sentiment: NewsSentimentBreakdown;
};

export type AlertRule = {
  id: string;
  symbol: string;
  company: string;
  label: string;
  metric: "dayChangePercent" | "oneMonthChangePercent";
  direction: "above" | "below";
  threshold: number;
  createdAt: string;
};

export type TriggeredAlert = {
  id: string;
  ruleId: string;
  symbol: string;
  company: string;
  message: string;
  triggeredAt: string;
};

export type WorkspaceSnapshot = {
  watchlist: WorkspaceCompanyRef[];
  compareItems: WorkspaceCompanyRef[];
  notesBySymbol: Record<string, string>;
  analysisHistory: SavedAnalysisEntry[];
  alerts: AlertRule[];
  triggeredAlerts: TriggeredAlert[];
};

export const WORKSPACE_STORAGE_KEY = "algoturk-workspace-v2";
export const MAX_COMPARE_ITEMS = 4;

const COMPANY_STOP_WORDS = new Set([
  "sanayi",
  "ticaret",
  "anonim",
  "sirketi",
  "holding",
  "yatirim",
  "bank",
  "bankasi",
  "industry",
  "trade",
  "company",
  "group",
  "investment",
  "technologies",
  "technology",
  "services",
  "service",
  "inc",
  "co",
  "corp",
  "as",
  "ve",
]);

export function normalizeText(value: string): string {
  return value
    .toLowerCase()
    .replace(/[ıİ]/g, "i")
    .replace(/[ğĞ]/g, "g")
    .replace(/[üÜ]/g, "u")
    .replace(/[şŞ]/g, "s")
    .replace(/[öÖ]/g, "o")
    .replace(/[çÇ]/g, "c")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function toTokens(value: string): string[] {
  return normalizeText(value)
    .split(" ")
    .map((token) => token.trim())
    .filter((token) => token.length > 2 && !COMPANY_STOP_WORDS.has(token));
}

export function buildCompanyTerms(company: BistCompany): string[] {
  const bag = new Set<string>([
    company.symbol.toLowerCase().replace(".is", ""),
    company.name,
    company.nameEn ?? "",
    company.nameTr ?? "",
    ...(company.aliases ?? []),
  ]);

  for (const token of toTokens(company.name)) bag.add(token);
  for (const token of toTokens(company.nameEn ?? "")) bag.add(token);
  for (const token of toTokens(company.nameTr ?? "")) bag.add(token);

  return Array.from(bag)
    .map((term) => normalizeText(term))
    .filter((term) => term.length > 1);
}

export function companyMatchesQuery(company: BistCompany, cleanQuery: string): boolean {
  const queryUpper = cleanQuery.toUpperCase();
  const queryNorm = normalizeText(cleanQuery);
  const values = [
    company.symbol,
    company.name,
    company.nameEn ?? "",
    company.nameTr ?? "",
    ...(company.aliases ?? []),
  ];

  return values.some((value) => value.toUpperCase().includes(queryUpper) || normalizeText(value).includes(queryNorm));
}

export function formatPubDate(value: string): string {
  const timestamp = Date.parse(value);
  if (Number.isNaN(timestamp)) {
    return value;
  }

  const date = new Date(timestamp);
  const pad = (num: number) => String(num).padStart(2, "0");
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())} ${pad(date.getUTCHours())}:${pad(
    date.getUTCMinutes()
  )} UTC`;
}

function scoreTerms(haystack: string, title: string, terms: string[]): number {
  let score = 0;
  const uniqueTerms = Array.from(new Set(terms.map((term) => normalizeText(term)).filter((term) => term.length > 1)));

  for (const term of uniqueTerms) {
    if (title.includes(term)) {
      score += term.length >= 5 ? 7 : 4;
      continue;
    }

    if (haystack.includes(term)) {
      score += term.length >= 5 ? 4 : 2;
    }
  }

  return score;
}

export function rankRssItem(item: RssNewsRow, rawQuery: string, boostedTerms: string[] = []): number {
  const titleNorm = normalizeText(item.title);
  const haystack = normalizeText(`${item.title} ${item.source || item.feedName} ${item.description ?? ""}`);
  const queryNorm = normalizeText(rawQuery.trim());
  const queryTokens = toTokens(rawQuery);

  let score = 0;

  if (queryNorm) {
    if (titleNorm.includes(queryNorm)) {
      score += 18;
    } else if (haystack.includes(queryNorm)) {
      score += 11;
    }

    for (const token of queryTokens) {
      if (titleNorm.includes(token)) {
        score += 5;
      } else if (haystack.includes(token)) {
        score += 2;
      }
    }
  }

  score += scoreTerms(haystack, titleNorm, boostedTerms);
  return score;
}

export function scoreHeadlineSentiment(title: string): number {
  const lower = title.toLowerCase();
  const positiveWords = [
    "beat",
    "growth",
    "surge",
    "record",
    "strong",
    "up",
    "rise",
    "profit",
    "partnership",
    "expand",
    "approval",
    "investment",
  ];
  const negativeWords = [
    "miss",
    "drop",
    "fall",
    "lawsuit",
    "investigation",
    "downgrade",
    "loss",
    "weak",
    "cut",
    "decline",
    "risk",
    "fine",
  ];

  let score = 0;
  for (const word of positiveWords) {
    if (lower.includes(word)) {
      score += 1;
    }
  }
  for (const word of negativeWords) {
    if (lower.includes(word)) {
      score -= 1;
    }
  }
  return score;
}

export function getNewsSentimentBreakdown(news: AnalyzeResponse["news"]): NewsSentimentBreakdown {
  return news.reduce<NewsSentimentBreakdown>(
    (acc, item) => {
      const score = scoreHeadlineSentiment(item.title);
      if (score > 0) {
        acc.positive += 1;
      } else if (score < 0) {
        acc.negative += 1;
      } else {
        acc.neutral += 1;
      }
      return acc;
    },
    { positive: 0, neutral: 0, negative: 0 }
  );
}

export function createSavedAnalysisEntry(result: AnalyzeResponse, market: MarketUniverseKey): SavedAnalysisEntry {
  return {
    id: `${result.symbol}-${result.fetchedAt}`,
    symbol: result.symbol,
    company: result.company,
    market,
    savedAt: result.fetchedAt,
    source: result.analysis.source,
    price: result.market.regularMarketPrice,
    currency: result.market.currency,
    dayChangePercent: result.market.dayChangePercent,
    oneMonthChangePercent: result.market.oneMonthChangePercent,
    summary: result.analysis.summary,
    baseCase: result.analysis.baseCase,
    bullCase: result.analysis.bullCase,
    bearCase: result.analysis.bearCase,
    dailyPrices: result.market.dailyPrices,
    keyDrivers: result.analysis.keyDrivers,
    keyRisks: result.analysis.keyRisks,
    sentiment: getNewsSentimentBreakdown(result.news),
  };
}

export function readWorkspaceSnapshot(raw: string | null): WorkspaceSnapshot {
  if (!raw) {
    return {
      watchlist: [],
      compareItems: [],
      notesBySymbol: {},
      analysisHistory: [],
      alerts: [],
      triggeredAlerts: [],
    };
  }

  try {
    const parsed = JSON.parse(raw) as Partial<WorkspaceSnapshot>;
    return {
      watchlist: Array.isArray(parsed.watchlist)
        ? parsed.watchlist.filter(isWorkspaceCompanyRef)
        : [],
      compareItems: Array.isArray(parsed.compareItems)
        ? parsed.compareItems.filter(isWorkspaceCompanyRef).slice(0, MAX_COMPARE_ITEMS)
        : [],
      notesBySymbol: parsed.notesBySymbol && typeof parsed.notesBySymbol === "object" ? parsed.notesBySymbol : {},
      analysisHistory: Array.isArray(parsed.analysisHistory) ? parsed.analysisHistory.slice(0, 60).map(normalizeSavedAnalysisEntry) : [],
      alerts: Array.isArray(parsed.alerts) ? parsed.alerts.slice(0, 50) : [],
      triggeredAlerts: Array.isArray(parsed.triggeredAlerts) ? parsed.triggeredAlerts.slice(0, 50) : [],
    };
  } catch {
    return {
      watchlist: [],
      compareItems: [],
      notesBySymbol: {},
      analysisHistory: [],
      alerts: [],
      triggeredAlerts: [],
    };
  }
}

function isWorkspaceCompanyRef(value: unknown): value is WorkspaceCompanyRef {
  if (!value || typeof value !== "object") {
    return false;
  }

  const item = value as Partial<WorkspaceCompanyRef>;
  return typeof item.symbol === "string" && typeof item.company === "string" && typeof item.market === "string";
}

function normalizeSavedAnalysisEntry(value: unknown): SavedAnalysisEntry {
  const item = value && typeof value === "object" ? (value as Partial<SavedAnalysisEntry>) : {};
  return {
    ...item,
    id: typeof item.id === "string" ? item.id : crypto.randomUUID(),
    symbol: typeof item.symbol === "string" ? item.symbol : "",
    company: typeof item.company === "string" ? item.company : "",
    market: item.market ?? (typeof item.symbol === "string" && item.symbol.endsWith(".IS") ? "bist100" : "usall"),
    savedAt: typeof item.savedAt === "string" ? item.savedAt : new Date().toISOString(),
    source: item.source === "openai" ? "openai" : "heuristic",
    price: typeof item.price === "number" ? item.price : 0,
    currency: typeof item.currency === "string" ? item.currency : "USD",
    dayChangePercent: typeof item.dayChangePercent === "number" ? item.dayChangePercent : 0,
    oneMonthChangePercent: typeof item.oneMonthChangePercent === "number" ? item.oneMonthChangePercent : null,
    summary: typeof item.summary === "string" ? item.summary : "",
    baseCase: typeof item.baseCase === "string" ? item.baseCase : "",
    bullCase: typeof item.bullCase === "string" ? item.bullCase : "",
    bearCase: typeof item.bearCase === "string" ? item.bearCase : "",
    dailyPrices: Array.isArray(item.dailyPrices) ? item.dailyPrices : [],
    keyDrivers: Array.isArray(item.keyDrivers) ? item.keyDrivers.filter((entry): entry is string => typeof entry === "string") : [],
    keyRisks: Array.isArray(item.keyRisks) ? item.keyRisks.filter((entry): entry is string => typeof entry === "string") : [],
    sentiment:
      item.sentiment && typeof item.sentiment === "object"
        ? {
            positive: typeof item.sentiment.positive === "number" ? item.sentiment.positive : 0,
            neutral: typeof item.sentiment.neutral === "number" ? item.sentiment.neutral : 0,
            negative: typeof item.sentiment.negative === "number" ? item.sentiment.negative : 0,
          }
        : { positive: 0, neutral: 0, negative: 0 },
  } satisfies SavedAnalysisEntry;
}
