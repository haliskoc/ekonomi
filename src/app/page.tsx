"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import { BIST100_COMPANIES, type BistCompany } from "@/lib/bist100";
import { DEFAULT_RSS_FEEDS } from "@/lib/rssSources";

type AnalyzeResponse = {
  symbol: string;
  company: string;
  fetchedAt: string;
  cached: boolean;
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

type RssItem = {
  title: string;
  link: string;
  pubDate: string;
  source: string;
  description?: string;
  image?: string;
};

type RssPreviewResponse = {
  feedUrl: string;
  items: RssItem[];
};

type MarketUniverseKey = "bist100" | "nasdaq100" | "sp500" | "nasdaq" | "nyse" | "amex" | "usall";

type UniverseResponse = {
  market: MarketUniverseKey;
  count: number;
  companies: BistCompany[];
};

type FeedView = {
  url: string;
  name: string;
  language: "tr" | "en";
  system: boolean;
  priority: number;
};

type RssNewsRow = RssItem & {
  feedName: string;
  feedUrl: string;
  feedLanguage: "tr" | "en";
  feedPriority: number;
};

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

function normalizeText(value: string): string {
  const normalized = value
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

  return normalized;
}

function toTokens(value: string): string[] {
  return normalizeText(value)
    .split(" ")
    .map((token) => token.trim())
    .filter((token) => token.length > 2 && !COMPANY_STOP_WORDS.has(token));
}

function buildCompanyTerms(company: BistCompany): string[] {
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

function companyMatchesQuery(company: BistCompany, cleanQuery: string): boolean {
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

function formatPubDate(value: string): string {
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

function rankRssItem(item: RssNewsRow, rawQuery: string, boostedTerms: string[] = []): number {
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

export default function Home() {
  const [activeTab, setActiveTab] = useState<"markets" | "rss">("markets");
  const [marketUniverse, setMarketUniverse] = useState<MarketUniverseKey>("bist100");
  const [universeCompanies, setUniverseCompanies] = useState<BistCompany[]>(BIST100_COMPANIES);
  const [marketLoading, setMarketLoading] = useState(false);
  const [marketError, setMarketError] = useState("");

  const marketLabel = useMemo(() => {
    if (marketUniverse === "bist100") return "BIST 100";
    if (marketUniverse === "nasdaq100") return "Nasdaq 100";
    if (marketUniverse === "sp500") return "S&P 500";
    if (marketUniverse === "nasdaq") return "NASDAQ (All)";
    if (marketUniverse === "nyse") return "NYSE (All)";
    if (marketUniverse === "amex") return "AMEX (All)";
    return "US All Exchanges";
  }, [marketUniverse]);

  const [query, setQuery] = useState("");
  const [selectedCompany, setSelectedCompany] = useState<BistCompany>(BIST100_COMPANIES[0]);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<AnalyzeResponse | null>(null);

  const [rssInput, setRssInput] = useState("");
  const [rssSearchQuery, setRssSearchQuery] = useState("");
  const [customRssFeeds, setCustomRssFeeds] = useState<string[]>([]);
  const [rssItemsByFeed, setRssItemsByFeed] = useState<Record<string, RssItem[]>>({});
  const [rssLoadingByFeed, setRssLoadingByFeed] = useState<Record<string, boolean>>({});
  const [rssErrorByFeed, setRssErrorByFeed] = useState<Record<string, string>>({});
  const autoPreviewAttemptedRef = useRef<Set<string>>(new Set());

  const systemFeedMap = useMemo(() => {
    const map = new Map<string, { name: string; language: "tr" | "en"; priority: number }>();
    for (const feed of DEFAULT_RSS_FEEDS) {
      map.set(feed.url, { name: feed.name, language: feed.language, priority: feed.priority });
    }
    return map;
  }, []);

  const rssFeeds = useMemo<FeedView[]>(() => {
    const merged = new Map<string, FeedView>();

    for (const feed of DEFAULT_RSS_FEEDS) {
      merged.set(feed.url, {
        url: feed.url,
        name: feed.name,
        language: feed.language,
        system: true,
        priority: feed.priority,
      });
    }

    for (const url of customRssFeeds) {
      if (!merged.has(url)) {
        merged.set(url, {
          url,
          name: "Custom Feed",
          language: "en",
          system: false,
          priority: 999,
        });
      }
    }

    return Array.from(merged.values()).sort((a, b) => a.priority - b.priority);
  }, [customRssFeeds]);

  const filteredCompanies = useMemo(() => {
    const clean = query.trim();
    if (!clean) {
      return universeCompanies;
    }

    return universeCompanies.filter((item) => companyMatchesQuery(item, clean));
  }, [query, universeCompanies]);

  const selectedTicker = useMemo(() => {
    if (marketUniverse === "bist100") {
      return `${selectedCompany.symbol}.IS`;
    }
    return selectedCompany.symbol;
  }, [marketUniverse, selectedCompany.symbol]);

  const rssNewsRows = useMemo(() => {
    const rows: RssNewsRow[] = [];

    for (const feed of rssFeeds) {
      const items = rssItemsByFeed[feed.url] ?? [];
      for (const item of items) {
        rows.push({ ...item, feedName: feed.name, feedUrl: feed.url, feedLanguage: feed.language, feedPriority: feed.priority });
      }
    }

    rows.sort((a, b) => {
      if (marketUniverse === "bist100" && a.feedLanguage !== b.feedLanguage) {
        return a.feedLanguage === "tr" ? -1 : 1;
      }

      const aTime = Number.isNaN(Date.parse(a.pubDate)) ? 0 : Date.parse(a.pubDate);
      const bTime = Number.isNaN(Date.parse(b.pubDate)) ? 0 : Date.parse(b.pubDate);
      if (bTime !== aTime) {
        return bTime - aTime;
      }

      return a.feedPriority - b.feedPriority;
    });

    const uniqueRows: RssNewsRow[] = [];
    const seen = new Set<string>();
    for (const row of rows) {
      const key = normalizeText(row.link || row.title);
      if (!key || seen.has(key)) {
        continue;
      }
      seen.add(key);
      uniqueRows.push(row);
    }

    return uniqueRows;
  }, [marketUniverse, rssFeeds, rssItemsByFeed]);

  const companySpecificRssNews = useMemo(() => {
    if (!selectedCompany) {
      return [];
    }

    const selectedTerms = buildCompanyTerms(selectedCompany);
    const queryClean = query.trim();
    const relatedCompanies = queryClean ? universeCompanies.filter((company) => companyMatchesQuery(company, queryClean)).slice(0, 5) : [];
    const queryTerms = relatedCompanies.flatMap((company) => buildCompanyTerms(company));

    return rssNewsRows
      .map((item) => ({
        item,
        selectedScore: rankRssItem(item, "", selectedTerms),
        queryScore: queryClean ? rankRssItem(item, queryClean, queryTerms) : 0,
      }))
      .filter((row) => row.selectedScore > 0 && (queryClean ? row.queryScore > 0 : true))
      .sort((a, b) => {
        const scoreDiff = b.selectedScore + b.queryScore - (a.selectedScore + a.queryScore);
        if (scoreDiff !== 0) {
          return scoreDiff;
        }
        const aTime = Number.isNaN(Date.parse(a.item.pubDate)) ? 0 : Date.parse(a.item.pubDate);
        const bTime = Number.isNaN(Date.parse(b.item.pubDate)) ? 0 : Date.parse(b.item.pubDate);
        return bTime - aTime;
      })
      .map((row) => row.item);
  }, [query, rssNewsRows, selectedCompany, universeCompanies]);

  const filteredRssNewsRows = useMemo(() => {
    const clean = rssSearchQuery.trim();
    if (!clean) {
      return rssNewsRows;
    }

    const relatedCompanies = universeCompanies.filter((company) => companyMatchesQuery(company, clean)).slice(0, 8);
    const companyTerms = relatedCompanies.flatMap((company) => buildCompanyTerms(company));

    return rssNewsRows
      .map((item) => ({ item, score: rankRssItem(item, clean, companyTerms) }))
      .filter((row) => row.score > 0)
      .sort((a, b) => {
        if (b.score !== a.score) {
          return b.score - a.score;
        }
        const aTime = Number.isNaN(Date.parse(a.item.pubDate)) ? 0 : Date.parse(a.item.pubDate);
        const bTime = Number.isNaN(Date.parse(b.item.pubDate)) ? 0 : Date.parse(b.item.pubDate);
        return bTime - aTime;
      })
      .map((row) => row.item);
  }, [rssNewsRows, rssSearchQuery, universeCompanies]);

  const loadUniverse = useCallback(async (market: MarketUniverseKey) => {
    setMarketLoading(true);
    setMarketError("");

    try {
      const response = await fetch(`/api/markets/constituents?market=${market}`);
      const json = (await response.json()) as UniverseResponse | { error?: string };
      if (!response.ok || !("companies" in json)) {
        throw new Error("error" in json ? json.error || "Market list fetch failed" : "Market list fetch failed");
      }

      setUniverseCompanies(json.companies);
    } catch (err) {
      setMarketError(err instanceof Error ? err.message : "Market list fetch failed");
      setUniverseCompanies(market === "bist100" ? BIST100_COMPANIES : []);
    } finally {
      setMarketLoading(false);
    }
  }, []);

  const loadRssPreview = useCallback(async (feedUrl: string) => {
    setRssLoadingByFeed((prev) => ({ ...prev, [feedUrl]: true }));
    setRssErrorByFeed((prev) => ({ ...prev, [feedUrl]: "" }));

    try {
      const response = await fetch(`/api/rss/fetch?url=${encodeURIComponent(feedUrl)}`);
      const json = (await response.json()) as RssPreviewResponse | { error?: string };
      if (!response.ok || !("items" in json)) {
        throw new Error("error" in json ? json.error || "RSS fetch failed" : "RSS fetch failed");
      }

      setRssItemsByFeed((prev) => ({ ...prev, [feedUrl]: json.items }));
    } catch (err) {
      setRssErrorByFeed((prev) => ({
        ...prev,
        [feedUrl]: err instanceof Error ? err.message : "RSS fetch failed",
      }));
    } finally {
      setRssLoadingByFeed((prev) => ({ ...prev, [feedUrl]: false }));
    }
  }, []);

  useEffect(() => {
    const stored = localStorage.getItem("custom-rss-feeds");
    if (!stored) {
      return;
    }

    try {
      const parsed = JSON.parse(stored);
      if (Array.isArray(parsed)) {
        setCustomRssFeeds(parsed.filter((item): item is string => typeof item === "string"));
      }
    } catch {
      setCustomRssFeeds([]);
    }
  }, []);

  useEffect(() => {
    localStorage.setItem("custom-rss-feeds", JSON.stringify(customRssFeeds));
  }, [customRssFeeds]);

  useEffect(() => {
    void loadUniverse(marketUniverse);
  }, [marketUniverse, loadUniverse]);

  useEffect(() => {
    if (!universeCompanies.length) {
      return;
    }

    const matched = universeCompanies.find((item) => item.symbol === selectedCompany.symbol);
    if (matched) {
      setSelectedCompany(matched);
      return;
    }

    setSelectedCompany(universeCompanies[0]);
  }, [selectedCompany.symbol, universeCompanies]);

  useEffect(() => {
    for (const feed of rssFeeds) {
      if (autoPreviewAttemptedRef.current.has(feed.url)) {
        continue;
      }

      const hasItems = (rssItemsByFeed[feed.url]?.length ?? 0) > 0;
      const isLoading = Boolean(rssLoadingByFeed[feed.url]);
      if (!hasItems && !isLoading) {
        autoPreviewAttemptedRef.current.add(feed.url);
        void loadRssPreview(feed.url);
      }
    }
  }, [loadRssPreview, rssFeeds, rssItemsByFeed, rssLoadingByFeed]);

  async function runAnalysis() {
    setLoading(true);
    setError("");

    try {
      const response = await fetch("/api/company/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          symbol: selectedTicker,
          company: selectedCompany.name,
        }),
      });

      const json = await response.json();
      if (!response.ok) {
        throw new Error(json.error || "Request failed");
      }

      setResult(json as AnalyzeResponse);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unexpected error");
      setResult(null);
    } finally {
      setLoading(false);
    }
  }

  async function addRssFeed() {
    const value = rssInput.trim();
    if (!value) {
      return;
    }

    try {
      const normalized = new URL(value).toString();
      if (!customRssFeeds.includes(normalized) && !systemFeedMap.has(normalized)) {
        setCustomRssFeeds((prev) => [normalized, ...prev]);
      }
      autoPreviewAttemptedRef.current.delete(normalized);
      await loadRssPreview(normalized);
      setRssInput("");
    } catch {
      setRssInput(value);
    }
  }

  function removeRssFeed(feedUrl: string) {
    if (systemFeedMap.has(feedUrl)) {
      return;
    }

    setCustomRssFeeds((prev) => prev.filter((item) => item !== feedUrl));
    setRssItemsByFeed((prev) => {
      const copy = { ...prev };
      delete copy[feedUrl];
      return copy;
    });
    setRssLoadingByFeed((prev) => {
      const copy = { ...prev };
      delete copy[feedUrl];
      return copy;
    });
    setRssErrorByFeed((prev) => {
      const copy = { ...prev };
      delete copy[feedUrl];
      return copy;
    });
    autoPreviewAttemptedRef.current.delete(feedUrl);
  }

  return (
    <div className="min-h-screen text-white">
      {/* Header / Tabs */}
      <header className="sticky top-0 z-20 border-b border-white/15 bg-[#0a101bcc]/80 backdrop-blur-md">
        <div className="mx-auto max-w-[1500px] flex items-center gap-6 px-4 md:px-6">
          <h1 className="py-4 text-lg font-bold tracking-widest uppercase border-r border-white/20 pr-6">Algoturk</h1>
          <nav className="flex items-center gap-4">
            <button 
              onClick={() => setActiveTab("markets")} 
              className={`py-4 text-sm font-semibold tracking-wider uppercase border-b-2 transition-colors ${activeTab === "markets" ? "border-white text-white" : "border-transparent text-white/50 hover:text-white/80"}`}
            >
              Piyasalar & Analiz
            </button>
            <button 
              onClick={() => setActiveTab("rss")} 
              className={`py-4 text-sm font-semibold tracking-wider uppercase border-b-2 transition-colors ${activeTab === "rss" ? "border-white text-white" : "border-transparent text-white/50 hover:text-white/80"}`}
            >
              RSS Haber Merkezi
            </button>
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-[1500px] p-4 md:p-6">
        {activeTab === "markets" && (
          <>
            <section className="rounded-xl border border-white/15 bg-[#0f1728cc] p-4 shadow-[0_24px_60px_rgba(0,0,0,0.35)] md:p-5">
              <p className="text-xs uppercase tracking-[0.24em] text-white/70">Market Workspace</p>
              <div className="mt-3 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => setMarketUniverse("bist100")}
                    className={`border px-3 py-2 text-xs font-semibold uppercase tracking-[0.16em] ${
                      marketUniverse === "bist100" ? "border-white bg-white text-black" : "border-white/30 bg-black text-white"
                    }`}
                  >
                    BIST 100
                  </button>
                  <button
                    type="button"
                    onClick={() => setMarketUniverse("nasdaq100")}
                    className={`border px-3 py-2 text-xs font-semibold uppercase tracking-[0.16em] ${
                      marketUniverse === "nasdaq100" ? "border-white bg-white text-black" : "border-white/30 bg-black text-white"
                    }`}
                  >
                    Nasdaq 100
                  </button>
                  <button
                    type="button"
                    onClick={() => setMarketUniverse("sp500")}
                    className={`border px-3 py-2 text-xs font-semibold uppercase tracking-[0.16em] ${
                      marketUniverse === "sp500" ? "border-white bg-white text-black" : "border-white/30 bg-black text-white"
                    }`}
                  >
                    S&P 500
                  </button>
                  <button
                    type="button"
                    onClick={() => setMarketUniverse("nasdaq")}
                    className={`border px-3 py-2 text-xs font-semibold uppercase tracking-[0.16em] ${
                      marketUniverse === "nasdaq" ? "border-white bg-white text-black" : "border-white/30 bg-black text-white"
                    }`}
                  >
                    Nasdaq All
                  </button>
                  <button
                    type="button"
                    onClick={() => setMarketUniverse("nyse")}
                    className={`border px-3 py-2 text-xs font-semibold uppercase tracking-[0.16em] ${
                      marketUniverse === "nyse" ? "border-white bg-white text-black" : "border-white/30 bg-black text-white"
                    }`}
                  >
                    NYSE All
                  </button>
                  <button
                    type="button"
                    onClick={() => setMarketUniverse("amex")}
                    className={`border px-3 py-2 text-xs font-semibold uppercase tracking-[0.16em] ${
                      marketUniverse === "amex" ? "border-white bg-white text-black" : "border-white/30 bg-black text-white"
                    }`}
                  >
                    AMEX All
                  </button>
                  <button
                    type="button"
                    onClick={() => setMarketUniverse("usall")}
                    className={`border px-3 py-2 text-xs font-semibold uppercase tracking-[0.16em] ${
                      marketUniverse === "usall" ? "border-white bg-white text-black" : "border-white/30 bg-black text-white"
                    }`}
                  >
                    US All
                  </button>
                </div>

                <div className="grid w-full gap-2 sm:grid-cols-[1fr_auto] lg:max-w-xl">
                  <input
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder="Arama: THYAO, AAPL, holding, bank..."
                    className="border border-white/30 bg-black px-3 py-2 text-sm text-white outline-none"
                  />
                  <div className="border border-white/20 px-3 py-2 text-center text-xs text-white/70">
                    {marketLoading ? "Yukleniyor" : `${universeCompanies.length} sirket`}
                  </div>
                </div>
              </div>
              {marketError ? <p className="mt-3 border border-white/20 bg-[#170f14] px-3 py-2 text-xs text-white">{marketError}</p> : null}
            </section>

            <div className="mt-4 grid gap-4 xl:grid-cols-[1fr_2.5fr]">
              {/* Sol Kolon: Sirket Listesi */}
              <article className="flex h-[85vh] flex-col rounded-xl border border-white/15 bg-[#0f1728bf] p-3 shadow-[0_20px_40px_rgba(0,0,0,0.25)]">
                <div className="flex items-center justify-between border-b border-white/20 pb-2">
                  <h2 className="text-sm font-semibold uppercase tracking-[0.2em]">Sirketler</h2>
                  <span className="text-xs text-white/60">Seç</span>
                </div>

                <div className="mt-3 flex-1 space-y-2 overflow-y-auto pr-1">
                  {filteredCompanies.map((item) => (
                    <button
                      key={item.symbol}
                      type="button"
                      onClick={() => setSelectedCompany(item)}
                      className={`w-full border p-3 text-left transition ${
                        selectedCompany?.symbol === item.symbol ? "border-white bg-white text-black" : "border-white/20 hover:border-white/50 bg-black text-white"
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <div className="relative h-10 w-10 shrink-0 overflow-hidden border border-white/20 bg-white/5">
                          {item.logoUrl ? (
                            <Image src={item.logoUrl} alt={`${item.symbol} logo`} fill sizes="40px" className="object-contain p-1" unoptimized />
                          ) : (
                            <div className="flex h-full w-full items-center justify-center text-[10px] font-bold">{item.symbol.slice(0, 2)}</div>
                          )}
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-semibold">{item.symbol}</p>
                          <p className="truncate text-xs opacity-80">{item.nameTr || item.name}</p>
                          <p className="truncate text-[11px] opacity-60">{item.nameEn || item.name}</p>
                        </div>
                      </div>
                    </button>
                  ))}

                  {!filteredCompanies.length ? <p className="py-6 text-center text-sm text-white/60">Sonuc bulunamadi.</p> : null}
                </div>
              </article>

              {/* Sag Kolon: Detaylar ve Haberler */}
              <div className="flex flex-col gap-4 overflow-y-auto h-[85vh] pb-4">
                {/* Ust Kisim: Analiz ve Bilgi */}
                <article className="rounded-xl border border-white/15 bg-[#0f1728bf] p-4 shadow-[0_20px_40px_rgba(0,0,0,0.25)]">
                  <h2 className="border-b border-white/20 pb-2 text-sm font-semibold flex items-center justify-between">
                    <span className="uppercase tracking-[0.2em]">Sirket Bilgisi</span>
                    <span className="text-white/60 text-xs">#{selectedTicker}</span>
                  </h2>

                  <div className="mt-4 grid md:grid-cols-2 gap-4">
                    <div className="space-y-2 text-sm">
                      <div className="flex items-center gap-3 border border-white/10 bg-white/[0.02] p-2">
                        <div className="relative h-14 w-14 shrink-0 overflow-hidden border border-white/20 bg-white/5">
                          {selectedCompany?.logoUrl ? (
                            <Image src={selectedCompany.logoUrl} alt={`${selectedCompany.symbol} logo`} fill sizes="56px" className="object-contain p-1" unoptimized />
                          ) : (
                            <div className="flex h-full w-full items-center justify-center text-xs font-bold">{selectedCompany?.symbol.slice(0, 2)}</div>
                          )}
                        </div>
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold">{selectedCompany?.symbol}</p>
                          <p className="truncate text-xs text-white/70">{selectedCompany?.officialNameTr || selectedCompany?.nameTr || selectedCompany?.name}</p>
                        </div>
                      </div>
                      <p>
                        <span className="text-white/60">Pazar:</span> {marketLabel}
                      </p>
                      <p>
                        <span className="text-white/60">Sirket:</span> {selectedCompany?.nameTr || selectedCompany?.name || "Bilinmiyor"}
                      </p>
                      <p>
                        <span className="text-white/60">English:</span> {selectedCompany?.nameEn || selectedCompany?.name || "Unknown"}
                      </p>
                      <button
                        type="button"
                        onClick={runAnalysis}
                        disabled={loading}
                        className="mt-4 border border-white bg-white px-4 py-2 text-sm font-semibold text-black disabled:cursor-not-allowed disabled:border-white/40 disabled:bg-black disabled:text-white/40"
                      >
                        {loading ? "Analiz yukleniyor..." : "Sirket Analizi Getir"}
                      </button>
                      {error ? <p className="mt-3 border border-red-500/50 bg-red-500/10 px-3 py-2 text-xs text-white">{error}</p> : null}
                    </div>

                    {result && (
                      <div className="grid grid-cols-2 gap-2 text-xs">
                        <div className="border border-white/20 p-2">
                          <p className="text-white/60">Fiyat</p>
                          <p className="mt-1 text-sm font-semibold">
                            {result.market.regularMarketPrice} {result.market.currency}
                          </p>
                        </div>
                        <div className="border border-white/20 p-2">
                          <p className="text-white/60">Gunluk</p>
                          <p className="mt-1 text-sm font-semibold">{result.market.dayChangePercent?.toFixed(2)}%</p>
                        </div>
                        <div className="border border-white/20 p-2">
                          <p className="text-white/60">Aylik</p>
                          <p className="mt-1 text-sm font-semibold">
                            {result.market.oneMonthChangePercent === null ? "N/A" : `${result.market.oneMonthChangePercent?.toFixed(2)}%`}
                          </p>
                        </div>
                        <div className="border border-white/20 p-2">
                          <p className="text-white/60">Piyasa</p>
                          <p className="mt-1 text-sm font-semibold">{result.market.marketState}</p>
                        </div>
                      </div>
                    )}
                  </div>

                  {result && (
                    <div className="mt-4 border-t border-white/20 pt-4">
                      <div className="border border-white/20 p-3 text-sm leading-6">
                        <p className="font-semibold uppercase tracking-[0.16em] text-white/70">Ozet Analiz</p>
                        <p className="mt-2 text-white/90">{result.analysis.summary}</p>
                      </div>
                    </div>
                  )}
                </article>

                {/* Ozel Sirket Haberleri */}
                <article className="flex-1 rounded-xl border border-white/15 bg-[#0f1728bf] p-4 shadow-[0_20px_40px_rgba(0,0,0,0.25)]">
                  <h2 className="border-b border-white/20 pb-2 text-sm font-semibold flex items-center justify-between">
                    <span className="uppercase tracking-[0.2em]">{selectedCompany?.symbol} Haberleri</span>
                    <span className="text-white/60 text-xs">RSS Takibi ({companySpecificRssNews.length})</span>
                  </h2>
                  
                  <div className="mt-4">
                    {companySpecificRssNews.length > 0 ? (
                      <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
                        {companySpecificRssNews.slice(0, 15).map((item, idx) => (
                          <article key={`${item.link}-${idx}`} className="group overflow-hidden border border-white/10 bg-white/[0.02] transition hover:border-white/30">
                            {item.image ? (
                              <Image src={item.image} alt={item.title} width={1200} height={675} className="h-36 w-full object-cover object-center" unoptimized />
                            ) : (
                              <div className="h-36 w-full bg-gradient-to-br from-white/10 to-transparent" />
                            )}
                            <div className="space-y-2 p-3">
                              <div className="flex items-center justify-between gap-2">
                                <span className="shrink-0 border border-white/20 px-2 py-1 text-[10px] uppercase text-white/60">{item.feedLanguage}</span>
                                <span className="truncate text-[10px] uppercase text-white/50">{item.source || item.feedName}</span>
                              </div>
                              <a href={item.link} target="_blank" rel="noreferrer" className="line-clamp-3 text-sm font-medium leading-6 hover:underline decoration-white/40 underline-offset-2 break-words">
                                {item.title}
                              </a>
                              <p className="line-clamp-2 text-[11px] text-white/45">{item.description || "Baglantiya giderek haberin detayini okuyabilirsiniz."}</p>
                              <p className="text-[11px] text-white/40">
                                {formatPubDate(item.pubDate)}
                              </p>
                            </div>
                          </article>
                        ))}
                      </div>
                    ) : (
                      <p className="text-sm text-white/60 border border-white/10 p-4 text-center">Bu şirket ile eşleşen güncel RSS haberi bulunamadı. Şirketin adını veya sembolünü içeren haberler eklendikçe burada görünecektir.</p>
                    )}
                  </div>
                </article>
              </div>
            </div>
          </>
        )}

        {/* RSS SECMESI */}
        {activeTab === "rss" && (
          <div className="grid h-[85vh] gap-6 xl:grid-cols-[360px_1fr]">
            {/* Ayarlar & RSS Yönetimi - 1 Kolon */}
            <article className="flex flex-col rounded-xl border border-white/15 bg-[#0f1728bf] p-4 shadow-[0_20px_40px_rgba(0,0,0,0.25)]">
              <h2 className="border-b border-white/20 pb-2 text-sm font-semibold uppercase tracking-[0.2em]">RSS Kaynak Yönetimi</h2>
              
              <div className="mt-4 border border-white/20 p-3">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-white/70">Yeni Kaynak Ekle</p>
                <div className="mt-2 flex gap-2">
                  <input
                    value={rssInput}
                    onChange={(event) => setRssInput(event.target.value)}
                    placeholder="https://ornek.com/rss"
                    className="w-full border border-white/30 bg-black px-3 py-2 text-sm text-white outline-none focus:border-white"
                  />
                  <button type="button" onClick={addRssFeed} className="border border-white bg-white px-4 py-2 text-sm font-semibold text-black hover:bg-white/90">
                    Ekle
                  </button>
                </div>
              </div>

              <div className="mt-4 flex-1 space-y-2 overflow-y-auto pr-1">
                {rssFeeds.map((feed) => (
                  <div key={feed.url} className="border border-white/20 p-3 text-xs flex flex-col justify-between">
                    <div className="flex items-center justify-between gap-2">
                      <p className="font-semibold text-[13px]">{feed.name}</p>
                      <div className="flex items-center gap-2">
                        <span className="border border-white/30 px-2 py-1 text-[9px] uppercase">{feed.language}</span>
                        {!feed.system ? (
                          <button type="button" onClick={() => removeRssFeed(feed.url)} className="border border-white/40 px-2 py-1 text-[10px] hover:bg-white hover:text-black transition">
                            Sil
                          </button>
                        ) : (
                          <span className="border border-white/30 px-2 py-1 text-[9px] uppercase text-white/50">Sistem</span>
                        )}
                      </div>
                    </div>
                    <p className="mt-2 break-all text-white/50 text-[10px]">{feed.url}</p>
                    
                    <div className="mt-3 flex items-center justify-between">
                        <p className="text-[10px] text-white/40">Durum: {rssLoadingByFeed[feed.url] ? "Yukleniyor..." : "Hazir"}</p>
                        <button type="button" onClick={() => loadRssPreview(feed.url)} className="border border-white/40 px-3 py-1.5 text-[10px] uppercase hover:bg-white/10 transition">
                          Güncelle
                        </button>
                    </div>
                    {rssErrorByFeed[feed.url] ? <p className="mt-2 text-[11px] text-red-400">{rssErrorByFeed[feed.url]}</p> : null}
                  </div>
                ))}
              </div>
            </article>

            {/* Genel RSS Haber Akisi - 2 Kolon */}
            <article className="flex flex-col rounded-xl border border-white/15 bg-[#0f1728bf] p-4 shadow-[0_20px_40px_rgba(0,0,0,0.25)]">
              <div className="border-b border-white/20 pb-3">
                <h2 className="text-sm font-semibold uppercase tracking-[0.2em]">Genel Haber Akisi</h2>
                <p className="mt-1 text-xs text-white/55">Tum RSS kaynaklarindan gelen haberler. BIST seciliyken Turkce kaynaklar ustte listelenir.</p>
                <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_auto]">
                  <input
                    value={rssSearchQuery}
                    onChange={(event) => setRssSearchQuery(event.target.value)}
                    placeholder="Haber ara: Turkcell, THYAO, Akbank, bankacilik..."
                    className="w-full border border-white/30 bg-black px-3 py-2 text-sm text-white outline-none focus:border-white"
                  />
                  <div className="border border-white/20 px-3 py-2 text-center text-xs text-white/70">{filteredRssNewsRows.length} haber</div>
                </div>
              </div>

              <div className="mt-4 flex-1 overflow-y-auto">
                {filteredRssNewsRows.length ? (
                  <div className="grid grid-cols-1 gap-4 md:grid-cols-2 2xl:grid-cols-3">
                    {filteredRssNewsRows.slice(0, 120).map((item, idx) => (
                      <article key={`${item.feedUrl}-${item.link}-${idx}`} className="group overflow-hidden border border-white/10 bg-white/[0.02] transition hover:border-white/30">
                        {item.image ? (
                          <Image src={item.image} alt={item.title} width={1200} height={675} className="h-40 w-full object-cover object-center" unoptimized />
                        ) : (
                          <div className="h-40 w-full bg-[radial-gradient(circle_at_top_left,rgba(255,255,255,0.18),rgba(255,255,255,0.02)_45%,transparent_80%)]" />
                        )}
                        <div className="space-y-2 p-3">
                          <div className="flex items-center justify-between gap-2">
                            <span className="border border-white/25 px-2 py-1 text-[10px] uppercase text-white/70">{item.feedLanguage}</span>
                            <span className="truncate text-[10px] uppercase text-white/45">{item.source || item.feedName}</span>
                          </div>
                          <a href={item.link} target="_blank" rel="noreferrer" className="line-clamp-3 text-sm font-semibold leading-6 hover:underline decoration-white/50 underline-offset-2">
                            {item.title}
                          </a>
                          <p className="line-clamp-2 text-[12px] text-white/45">{item.description || "Haberi acarak detayini inceleyebilirsiniz."}</p>
                          <p className="text-[11px] text-white/40">
                            {formatPubDate(item.pubDate)}
                          </p>
                        </div>
                      </article>
                    ))}
                  </div>
                ) : (
                  <div className="border border-white/10 p-6 text-center text-sm text-white/60">Arama kriterine uygun haber bulunamadi.</div>
                )}
              </div>
            </article>

          </div>
        )}
      </main>
    </div>
  );
}
