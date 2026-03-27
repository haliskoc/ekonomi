"use client";

import Image from "next/image";
import { startTransition, useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import PriceChart from "@/components/dashboard/PriceChart";
import NewsSentimentChart from "@/components/dashboard/NewsSentimentChart";
import { BIST100_COMPANIES, type BistCompany } from "@/lib/bist100";
import {
  buildCompanyTerms,
  companyMatchesQuery,
  createSavedAnalysisEntry,
  formatPubDate,
  getNewsSentimentBreakdown,
  rankRssItem,
  readWorkspaceSnapshot,
  type AlertRule,
  type AnalyzeResponse,
  type FeedView,
  type MarketUniverseKey,
  type RssItem,
  type RssNewsRow,
  type RssPreviewResponse,
  type SavedAnalysisEntry,
  type TriggeredAlert,
  type UniverseResponse,
  type WorkspaceCompanyRef,
  WORKSPACE_STORAGE_KEY,
  MAX_COMPARE_ITEMS,
} from "@/lib/dashboard";
import { DEFAULT_RSS_FEEDS } from "@/lib/rssSources";

const PRELOAD_FEED_LIMIT_MARKETS = 4;
const PRELOAD_FEED_LIMIT_RSS = 12;
const MAX_ANALYSIS_HISTORY = 24;

const MARKET_OPTIONS: Array<{ key: MarketUniverseKey; label: string }> = [
  { key: "bist100", label: "BIST 100" },
  { key: "nasdaq100", label: "Nasdaq 100" },
  { key: "sp500", label: "S&P 500" },
  { key: "nasdaq", label: "Nasdaq All" },
  { key: "nyse", label: "NYSE All" },
  { key: "amex", label: "AMEX All" },
  { key: "usall", label: "US All" },
];

function stripWorkspaceSymbol(symbol: string): string {
  return symbol.replace(/\.IS$/i, "");
}

function formatCompactNumber(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return "N/A";
  }

  return new Intl.NumberFormat("tr-TR", {
    maximumFractionDigits: Math.abs(value) >= 100 ? 1 : 2,
  }).format(value);
}

function formatPercent(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return "N/A";
  }

  return `${value.toFixed(2)}%`;
}

function getChangeTone(value: number | null | undefined): string {
  if ((value ?? 0) > 0) return "text-emerald-300";
  if ((value ?? 0) < 0) return "text-rose-300";
  return "text-white";
}

function buildWorkspaceRef(company: BistCompany, market: MarketUniverseKey): WorkspaceCompanyRef {
  const symbol = market === "bist100" ? `${company.symbol}.IS` : company.symbol;
  return {
    symbol,
    company: company.officialNameTr || company.nameTr || company.nameEn || company.name,
    market,
  };
}

function evaluateAlertRules(rules: AlertRule[], entry: SavedAnalysisEntry): TriggeredAlert[] {
  const triggers: TriggeredAlert[] = [];

  for (const rule of rules) {
    if (rule.symbol !== entry.symbol) {
      continue;
    }

    const value = rule.metric === "dayChangePercent" ? entry.dayChangePercent : entry.oneMonthChangePercent;
    if (value === null) {
      continue;
    }

    const matches = rule.direction === "above" ? value >= rule.threshold : value <= rule.threshold;
    if (!matches) {
      continue;
    }

    triggers.push({
      id: `${rule.id}:${entry.savedAt}`,
      ruleId: rule.id,
      symbol: entry.symbol,
      company: entry.company,
      message: `${rule.label}: ${formatPercent(value)} (${rule.direction === "above" ? ">=" : "<="} ${formatPercent(rule.threshold)})`,
      triggeredAt: entry.savedAt,
    });
  }

  return triggers;
}

function MiniSparkline({ data }: { data: SavedAnalysisEntry["dailyPrices"] }) {
  if (!data.length) {
    return <div className="h-14 rounded-lg border border-dashed border-white/10" />;
  }

  const width = 180;
  const height = 54;
  const values = data.map((item) => item.close);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = Math.max(max - min, 1e-6);
  const stroke = (values.at(-1) ?? 0) >= (values[0] ?? 0) ? "#7dd3fc" : "#fda4af";
  const path = data
    .map((item, index) => {
      const x = (index / Math.max(data.length - 1, 1)) * width;
      const y = height - ((item.close - min) / range) * height;
      return `${index === 0 ? "M" : "L"} ${x} ${y}`;
    })
    .join(" ");

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="h-14 w-full">
      <path d={path} fill="none" stroke={stroke} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export default function Home() {
  const [activeTab, setActiveTab] = useState<"markets" | "rss">("markets");
  const [marketUniverse, setMarketUniverse] = useState<MarketUniverseKey>("bist100");
  const [universeCompanies, setUniverseCompanies] = useState<BistCompany[]>(BIST100_COMPANIES);
  const [marketLoading, setMarketLoading] = useState(false);
  const [marketError, setMarketError] = useState("");

  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query);
  const [selectedCompany, setSelectedCompany] = useState<BistCompany>(BIST100_COMPANIES[0]);
  const [pendingSelection, setPendingSelection] = useState<WorkspaceCompanyRef | null>(null);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<AnalyzeResponse | null>(null);

  const [rssInput, setRssInput] = useState("");
  const [rssSearchQuery, setRssSearchQuery] = useState("");
  const deferredRssSearchQuery = useDeferredValue(rssSearchQuery);
  const [customRssFeeds, setCustomRssFeeds] = useState<string[]>([]);
  const [rssItemsByFeed, setRssItemsByFeed] = useState<Record<string, RssItem[]>>({});
  const [rssLoadingByFeed, setRssLoadingByFeed] = useState<Record<string, boolean>>({});
  const [rssErrorByFeed, setRssErrorByFeed] = useState<Record<string, string>>({});
  const [rssFeedLoadTarget, setRssFeedLoadTarget] = useState(PRELOAD_FEED_LIMIT_MARKETS);
  const autoPreviewAttemptedRef = useRef<Set<string>>(new Set());

  const [workspaceReady, setWorkspaceReady] = useState(false);
  const [watchlist, setWatchlist] = useState<WorkspaceCompanyRef[]>([]);
  const [compareItems, setCompareItems] = useState<WorkspaceCompanyRef[]>([]);
  const [notesBySymbol, setNotesBySymbol] = useState<Record<string, string>>({});
  const [analysisHistory, setAnalysisHistory] = useState<SavedAnalysisEntry[]>([]);
  const [alerts, setAlerts] = useState<AlertRule[]>([]);
  const [triggeredAlerts, setTriggeredAlerts] = useState<TriggeredAlert[]>([]);
  const [alertMetric, setAlertMetric] = useState<AlertRule["metric"]>("dayChangePercent");
  const [alertDirection, setAlertDirection] = useState<AlertRule["direction"]>("above");
  const [alertThreshold, setAlertThreshold] = useState("3");
  const [alertLabel, setAlertLabel] = useState("");

  const marketLabel = useMemo(
    () => MARKET_OPTIONS.find((option) => option.key === marketUniverse)?.label ?? "Market",
    [marketUniverse]
  );

  const selectedTicker = useMemo(() => {
    if (marketUniverse === "bist100") {
      return `${selectedCompany.symbol}.IS`;
    }
    return selectedCompany.symbol;
  }, [marketUniverse, selectedCompany.symbol]);

  const selectedWorkspaceRef = useMemo(
    () => buildWorkspaceRef(selectedCompany, marketUniverse),
    [marketUniverse, selectedCompany]
  );

  const selectedWorkspaceSymbol = selectedWorkspaceRef.symbol;

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
    const clean = deferredQuery.trim();
    if (!clean) {
      return universeCompanies;
    }

    return universeCompanies.filter((item) => companyMatchesQuery(item, clean));
  }, [deferredQuery, universeCompanies]);

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
      const key = `${row.feedUrl}:${row.link || row.title}`.toLowerCase();
      if (!key || seen.has(key)) {
        continue;
      }
      seen.add(key);
      uniqueRows.push(row);
    }

    return uniqueRows;
  }, [marketUniverse, rssFeeds, rssItemsByFeed]);

  const companySpecificRssNews = useMemo(() => {
    const selectedTerms = buildCompanyTerms(selectedCompany);
    const queryClean = deferredQuery.trim();
    const relatedCompanies = queryClean ? universeCompanies.filter((company) => companyMatchesQuery(company, queryClean)).slice(0, 5) : [];
    const queryTerms = relatedCompanies.flatMap((company) => buildCompanyTerms(company));

    const scoredRows = rssNewsRows
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

    if (scoredRows.length > 0) {
      return scoredRows;
    }

    return rssNewsRows.slice(0, 18);
  }, [deferredQuery, rssNewsRows, selectedCompany, universeCompanies]);

  const filteredRssNewsRows = useMemo(() => {
    const clean = deferredRssSearchQuery.trim();
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
  }, [deferredRssSearchQuery, rssNewsRows, universeCompanies]);

  const activeResult = result?.symbol === selectedTicker ? result : null;
  const latestSavedEntry = useMemo(
    () => analysisHistory.find((entry) => entry.symbol === selectedWorkspaceSymbol) ?? null,
    [analysisHistory, selectedWorkspaceSymbol]
  );

  const displayEntry = useMemo(() => {
    if (activeResult) {
      return createSavedAnalysisEntry(activeResult, marketUniverse);
    }
    return latestSavedEntry;
  }, [activeResult, latestSavedEntry, marketUniverse]);

  const sentimentBreakdown = useMemo(() => {
    if (activeResult) {
      return getNewsSentimentBreakdown(activeResult.news);
    }
    return displayEntry?.sentiment ?? { positive: 0, neutral: 0, negative: 0 };
  }, [activeResult, displayEntry]);

  const isWatchlisted = useMemo(
    () => watchlist.some((item) => item.symbol === selectedWorkspaceSymbol),
    [selectedWorkspaceSymbol, watchlist]
  );

  const isCompared = useMemo(
    () => compareItems.some((item) => item.symbol === selectedWorkspaceSymbol),
    [compareItems, selectedWorkspaceSymbol]
  );

  const loadedFeedCount = useMemo(
    () => rssFeeds.filter((feed) => (rssItemsByFeed[feed.url]?.length ?? 0) > 0).length,
    [rssFeeds, rssItemsByFeed]
  );

  const compareCards = useMemo(() => {
    return compareItems.map((item) => ({
      item,
      entry: analysisHistory.find((entry) => entry.symbol === item.symbol) ?? null,
    }));
  }, [analysisHistory, compareItems]);

  const digest = useMemo(() => {
    const watchlistSymbols = new Set(watchlist.map((item) => item.symbol));
    const covered = analysisHistory.filter((entry) => watchlistSymbols.has(entry.symbol));
    const uniqueCoverage = new Map<string, SavedAnalysisEntry>();
    for (const entry of covered) {
      if (!uniqueCoverage.has(entry.symbol)) {
        uniqueCoverage.set(entry.symbol, entry);
      }
    }

    const coverageItems = Array.from(uniqueCoverage.values());
    const leaders = [...coverageItems].sort((a, b) => b.dayChangePercent - a.dayChangePercent).slice(0, 3);
    const laggards = [...coverageItems].sort((a, b) => a.dayChangePercent - b.dayChangePercent).slice(0, 3);
    const avgDaily =
      coverageItems.length > 0
        ? coverageItems.reduce((sum, item) => sum + item.dayChangePercent, 0) / coverageItems.length
        : null;

    return {
      coveredCount: coverageItems.length,
      avgDaily,
      leaders,
      laggards,
    };
  }, [analysisHistory, watchlist]);

  const selectedNote = notesBySymbol[selectedWorkspaceSymbol] ?? "";

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
    const storedFeeds = localStorage.getItem("custom-rss-feeds");
    if (storedFeeds) {
      try {
        const parsed = JSON.parse(storedFeeds);
        if (Array.isArray(parsed)) {
          setCustomRssFeeds(parsed.filter((item): item is string => typeof item === "string"));
        }
      } catch {
        setCustomRssFeeds([]);
      }
    }

    const snapshot = readWorkspaceSnapshot(localStorage.getItem(WORKSPACE_STORAGE_KEY));
    setWatchlist(snapshot.watchlist);
    setCompareItems(snapshot.compareItems);
    setNotesBySymbol(snapshot.notesBySymbol);
    setAnalysisHistory(snapshot.analysisHistory);
    setAlerts(snapshot.alerts);
    setTriggeredAlerts(snapshot.triggeredAlerts);
    setWorkspaceReady(true);
  }, []);

  useEffect(() => {
    localStorage.setItem("custom-rss-feeds", JSON.stringify(customRssFeeds));
  }, [customRssFeeds]);

  useEffect(() => {
    if (!workspaceReady) {
      return;
    }

    localStorage.setItem(
      WORKSPACE_STORAGE_KEY,
      JSON.stringify({
        watchlist,
        compareItems,
        notesBySymbol,
        analysisHistory,
        alerts,
        triggeredAlerts,
      })
    );
  }, [alerts, analysisHistory, compareItems, notesBySymbol, triggeredAlerts, watchlist, workspaceReady]);

  useEffect(() => {
    void loadUniverse(marketUniverse);
  }, [loadUniverse, marketUniverse]);

  useEffect(() => {
    if (!universeCompanies.length) {
      return;
    }

    if (pendingSelection && pendingSelection.market === marketUniverse) {
      const nextSymbol = stripWorkspaceSymbol(pendingSelection.symbol);
      const nextCompany = universeCompanies.find((item) => item.symbol === nextSymbol);
      if (nextCompany) {
        setSelectedCompany(nextCompany);
        setPendingSelection(null);
        return;
      }
    }

    const matched = universeCompanies.find((item) => item.symbol === selectedCompany.symbol);
    if (matched) {
      setSelectedCompany(matched);
      return;
    }

    setSelectedCompany(universeCompanies[0]);
  }, [marketUniverse, pendingSelection, selectedCompany.symbol, universeCompanies]);

  useEffect(() => {
    setRssFeedLoadTarget(activeTab === "rss" ? PRELOAD_FEED_LIMIT_RSS : PRELOAD_FEED_LIMIT_MARKETS);
  }, [activeTab]);

  useEffect(() => {
    const feedsToWarm = rssFeeds.slice(0, rssFeedLoadTarget);
    const missing = feedsToWarm.filter((feed) => {
      const hasItems = (rssItemsByFeed[feed.url]?.length ?? 0) > 0;
      const isLoading = Boolean(rssLoadingByFeed[feed.url]);
      return !hasItems && !isLoading && !autoPreviewAttemptedRef.current.has(feed.url);
    });

    if (!missing.length) {
      return;
    }

    let timerId: ReturnType<typeof setTimeout> | null = null;
    let idleId: number | null = null;
    const starter = () => {
      for (const feed of missing.slice(0, activeTab === "rss" ? 3 : 2)) {
        autoPreviewAttemptedRef.current.add(feed.url);
        void loadRssPreview(feed.url);
      }
    };

    if (typeof window !== "undefined" && "requestIdleCallback" in window) {
      idleId = window.requestIdleCallback(starter, { timeout: 800 });
    } else {
      timerId = globalThis.setTimeout(starter, 120);
    }

    return () => {
      if (idleId !== null && "cancelIdleCallback" in window) {
        window.cancelIdleCallback(idleId);
      }
      if (timerId !== null) {
        globalThis.clearTimeout(timerId);
      }
    };
  }, [activeTab, loadRssPreview, rssFeedLoadTarget, rssFeeds, rssItemsByFeed, rssLoadingByFeed]);

  async function runAnalysis() {
    setLoading(true);
    setError("");

    try {
      const response = await fetch("/api/company/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          symbol: selectedTicker,
          company: selectedWorkspaceRef.company,
        }),
      });

      const json = (await response.json()) as AnalyzeResponse & { error?: string };
      if (!response.ok) {
        throw new Error(json.error || "Request failed");
      }

      setResult(json);

      const entry = createSavedAnalysisEntry(json, marketUniverse);
      setAnalysisHistory((prev) => {
        const next = [entry, ...prev.filter((item) => item.symbol !== entry.symbol)].slice(0, MAX_ANALYSIS_HISTORY);
        return next;
      });

      const newTriggers = evaluateAlertRules(alerts, entry);
      if (newTriggers.length) {
        setTriggeredAlerts((prev) => {
          const seen = new Set(prev.map((item) => item.id));
          const merged = [...newTriggers.filter((item) => !seen.has(item.id)), ...prev].slice(0, 30);
          return merged;
        });
      }
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

  async function handleLogout() {
    await fetch("/api/auth/logout", {
      method: "POST",
    });
    window.location.href = "/login";
  }

  function toggleWatchlist() {
    setWatchlist((prev) => {
      const exists = prev.some((item) => item.symbol === selectedWorkspaceRef.symbol);
      if (exists) {
        return prev.filter((item) => item.symbol !== selectedWorkspaceRef.symbol);
      }
      return [selectedWorkspaceRef, ...prev].slice(0, 20);
    });
  }

  function toggleCompare() {
    setCompareItems((prev) => {
      const exists = prev.some((item) => item.symbol === selectedWorkspaceRef.symbol);
      if (exists) {
        return prev.filter((item) => item.symbol !== selectedWorkspaceRef.symbol);
      }
      return [selectedWorkspaceRef, ...prev].slice(0, MAX_COMPARE_ITEMS);
    });
  }

  function jumpToWorkspaceItem(item: WorkspaceCompanyRef) {
    setActiveTab("markets");
    setPendingSelection(item);
    setMarketUniverse(item.market);
    startTransition(() => {
      setQuery(stripWorkspaceSymbol(item.symbol));
    });
  }

  function saveNote(value: string) {
    startTransition(() => {
      setNotesBySymbol((prev) => ({
        ...prev,
        [selectedWorkspaceSymbol]: value,
      }));
    });
  }

  function createAlert() {
    const threshold = Number.parseFloat(alertThreshold);
    if (!Number.isFinite(threshold)) {
      return;
    }

    const label = alertLabel.trim() || `${selectedWorkspaceRef.company} ${alertMetric === "dayChangePercent" ? "gunluk" : "1 aylik"} alarmi`;
    const nextRule: AlertRule = {
      id: crypto.randomUUID(),
      symbol: selectedWorkspaceSymbol,
      company: selectedWorkspaceRef.company,
      label,
      metric: alertMetric,
      direction: alertDirection,
      threshold,
      createdAt: new Date().toISOString(),
    };

    setAlerts((prev) => [nextRule, ...prev].slice(0, 50));
    setAlertLabel("");
  }

  return (
    <div className="min-h-screen text-white">
      <header className="sticky top-0 z-20 border-b border-white/15 bg-[#0a101bcc]/80 backdrop-blur-md">
        <div className="mx-auto flex max-w-[1600px] items-center gap-6 px-4 md:px-6">
          <div className="flex items-center gap-4 border-r border-white/20 pr-6 py-4">
            <h1 className="text-lg font-bold uppercase tracking-[0.24em]">Algoturk</h1>
            <span className="hidden rounded-full border border-white/15 px-3 py-1 text-[10px] uppercase tracking-[0.16em] text-white/60 lg:inline-block">
              Chart + Workspace
            </span>
          </div>

          <nav className="flex items-center gap-4">
            <button
              onClick={() => setActiveTab("markets")}
              className={`py-4 text-sm font-semibold tracking-wider uppercase border-b-2 transition-colors ${
                activeTab === "markets" ? "border-white text-white" : "border-transparent text-white/50 hover:text-white/80"
              }`}
            >
              Piyasalar & Analiz
            </button>
            <button
              onClick={() => setActiveTab("rss")}
              className={`py-4 text-sm font-semibold tracking-wider uppercase border-b-2 transition-colors ${
                activeTab === "rss" ? "border-white text-white" : "border-transparent text-white/50 hover:text-white/80"
              }`}
            >
              RSS Haber Merkezi
            </button>
          </nav>

          <div className="ml-auto flex items-center gap-3 text-[11px] uppercase tracking-[0.14em] text-white/55">
            <span>{watchlist.length} izlenen</span>
            <span>{analysisHistory.length} kayitli analiz</span>
            <button
              type="button"
              onClick={handleLogout}
              className="border border-white/40 px-3 py-2 text-xs font-semibold uppercase tracking-[0.15em] hover:bg-white hover:text-black"
            >
              Cikis
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-[1600px] p-4 md:p-6">
        {activeTab === "markets" && (
          <>
            <section className="rounded-2xl border border-white/15 bg-[#0f1728cc] p-4 shadow-[0_24px_60px_rgba(0,0,0,0.35)] md:p-5">
              <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
                <div>
                  <p className="text-xs uppercase tracking-[0.24em] text-white/65">Market Workspace</p>
                  <h2 className="mt-2 text-2xl font-semibold text-white">Grafikli analiz, compare modu ve kayitli calisma alani</h2>
                  <p className="mt-2 max-w-3xl text-sm text-white/60">
                    Grafikler artik dogrudan sayfada ciziliyor. RSS kaynaklari kademeli yukleniyor; bu sayede ilk acilista sayfa daha az kasar.
                  </p>
                </div>

                <div className="grid gap-3 sm:grid-cols-3">
                  <div className="rounded-xl border border-white/10 bg-black/20 px-4 py-3">
                    <p className="text-[11px] uppercase tracking-[0.16em] text-white/45">Hazir Feed</p>
                    <p className="mt-2 text-xl font-semibold">{loadedFeedCount}</p>
                  </div>
                  <div className="rounded-xl border border-white/10 bg-black/20 px-4 py-3">
                    <p className="text-[11px] uppercase tracking-[0.16em] text-white/45">Aktif Pazar</p>
                    <p className="mt-2 text-xl font-semibold">{marketLabel}</p>
                  </div>
                  <div className="rounded-xl border border-white/10 bg-black/20 px-4 py-3">
                    <p className="text-[11px] uppercase tracking-[0.16em] text-white/45">Son Alarm</p>
                    <p className="mt-2 line-clamp-2 text-sm text-white/80">{triggeredAlerts[0]?.message ?? "Henuz yok"}</p>
                  </div>
                </div>
              </div>

              <div className="mt-4 flex flex-col gap-3">
                <div className="flex flex-wrap gap-2">
                  {MARKET_OPTIONS.map((option) => (
                    <button
                      key={option.key}
                      type="button"
                      onClick={() => setMarketUniverse(option.key)}
                      className={`border px-3 py-2 text-xs font-semibold uppercase tracking-[0.16em] ${
                        marketUniverse === option.key ? "border-white bg-white text-black" : "border-white/30 bg-black text-white"
                      }`}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>

                <div className="grid gap-2 lg:grid-cols-[1fr_auto_auto]">
                  <input
                    value={query}
                    onChange={(event) => startTransition(() => setQuery(event.target.value))}
                    placeholder="Arama: THYAO, AAPL, holding, banka, teknoloji..."
                    className="border border-white/30 bg-black px-3 py-3 text-sm text-white outline-none"
                  />
                  <div className="border border-white/20 px-4 py-3 text-center text-xs text-white/70">
                    {marketLoading ? "Yukleniyor" : `${universeCompanies.length} sirket`}
                  </div>
                  <div className="border border-white/20 px-4 py-3 text-center text-xs text-white/70">
                    {displayEntry ? `Son kayit ${formatPubDate(displayEntry.savedAt)}` : "Analiz bekleniyor"}
                  </div>
                </div>
              </div>

              {marketError ? <p className="mt-3 border border-white/20 bg-[#170f14] px-3 py-2 text-xs text-white">{marketError}</p> : null}
            </section>

            <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(300px,0.9fr)_minmax(0,1.7fr)_minmax(320px,1fr)]">
              <article className="min-w-0 flex h-[calc(100vh-190px)] flex-col rounded-2xl border border-white/15 bg-[#0f1728bf] p-3 shadow-[0_20px_40px_rgba(0,0,0,0.25)]">
                <div className="flex items-center justify-between border-b border-white/20 pb-3">
                  <h2 className="text-sm font-semibold uppercase tracking-[0.2em]">Sirketler</h2>
                  <span className="text-xs text-white/60">Sec</span>
                </div>

                <div className="mt-3 flex-1 space-y-2 overflow-y-auto pr-1">
                  {filteredCompanies.map((item) => (
                    <button
                      key={item.symbol}
                      type="button"
                      onClick={() => setSelectedCompany(item)}
                      className={`w-full rounded-xl border p-3 text-left transition ${
                        selectedCompany.symbol === item.symbol ? "border-white bg-white text-black" : "border-white/20 bg-black text-white hover:border-white/50"
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <div className="relative h-11 w-11 shrink-0 overflow-hidden rounded-xl border border-white/20 bg-white/5">
                          {item.logoUrl ? (
                            <Image src={item.logoUrl} alt={`${item.symbol} logo`} fill sizes="44px" className="object-contain p-1" unoptimized />
                          ) : (
                            <div className="flex h-full w-full items-center justify-center text-[10px] font-bold">{item.symbol.slice(0, 2)}</div>
                          )}
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-semibold">{item.symbol}</p>
                          <p className="truncate text-xs opacity-80">{item.nameTr || item.name}</p>
                          {item.nameEn && item.nameEn !== item.nameTr ? (
                            <p className="truncate text-[11px] opacity-60">{item.nameEn}</p>
                          ) : null}
                        </div>
                      </div>
                    </button>
                  ))}

                  {!filteredCompanies.length ? <p className="py-8 text-center text-sm text-white/60">Sonuc bulunamadi.</p> : null}
                </div>
              </article>

              <div className="min-w-0 flex h-[calc(100vh-190px)] flex-col gap-4 overflow-y-auto pr-1">
                <article className="rounded-2xl border border-white/15 bg-[#0f1728bf] p-4 shadow-[0_20px_40px_rgba(0,0,0,0.25)]">
                  <div className="flex flex-wrap items-start justify-between gap-4 border-b border-white/20 pb-4">
                    <div className="flex items-center gap-4">
                      <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-2xl border border-white/20 bg-white/5">
                        {selectedCompany.logoUrl ? (
                          <Image src={selectedCompany.logoUrl} alt={`${selectedCompany.symbol} logo`} fill sizes="64px" className="object-contain p-1" unoptimized />
                        ) : (
                          <div className="flex h-full w-full items-center justify-center text-sm font-bold">{selectedCompany.symbol.slice(0, 2)}</div>
                        )}
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs uppercase tracking-[0.18em] text-white/50">{marketLabel}</p>
                        <h2 className="mt-1 text-2xl font-semibold">{selectedCompany.symbol}</h2>
                        <p className="truncate text-sm text-white/65">
                          {selectedCompany.officialNameTr || selectedCompany.nameTr || selectedCompany.name}
                        </p>
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={runAnalysis}
                        disabled={loading}
                        className="rounded-xl border border-white bg-white px-4 py-3 text-sm font-semibold text-black disabled:cursor-not-allowed disabled:border-white/40 disabled:bg-black disabled:text-white/40"
                      >
                        {loading ? "Analiz yukleniyor..." : "Sirket Analizi Getir"}
                      </button>
                      <button
                        type="button"
                        onClick={toggleWatchlist}
                        className={`rounded-xl border px-4 py-3 text-sm font-semibold ${
                          isWatchlisted ? "border-sky-300/60 bg-sky-300/15 text-sky-100" : "border-white/30 bg-black text-white"
                        }`}
                      >
                        {isWatchlisted ? "Watchlistten Cikar" : "Watchliste Ekle"}
                      </button>
                      <button
                        type="button"
                        onClick={toggleCompare}
                        className={`rounded-xl border px-4 py-3 text-sm font-semibold ${
                          isCompared ? "border-emerald-300/60 bg-emerald-300/15 text-emerald-100" : "border-white/30 bg-black text-white"
                        }`}
                      >
                        {isCompared ? "Compare'dan Cikar" : "Compare'a Ekle"}
                      </button>
                    </div>
                  </div>

                  <div className="mt-4 grid gap-3 lg:grid-cols-4">
                    <div className="rounded-xl border border-white/10 bg-black/20 p-4">
                      <p className="text-xs uppercase tracking-[0.16em] text-white/45">Ticker</p>
                      <p className="mt-2 text-lg font-semibold">{selectedTicker}</p>
                    </div>
                    <div className="rounded-xl border border-white/10 bg-black/20 p-4">
                      <p className="text-xs uppercase tracking-[0.16em] text-white/45">Kaynak</p>
                      <p className="mt-2 text-lg font-semibold">{activeResult?.analysis.source || latestSavedEntry?.source || "Beklemede"}</p>
                    </div>
                    <div className="rounded-xl border border-white/10 bg-black/20 p-4">
                      <p className="text-xs uppercase tracking-[0.16em] text-white/45">Son Durum</p>
                      <p className="mt-2 text-lg font-semibold">{activeResult?.market.marketState || "Analiz gerektiriyor"}</p>
                    </div>
                    <div className="rounded-xl border border-white/10 bg-black/20 p-4">
                      <p className="text-xs uppercase tracking-[0.16em] text-white/45">Kayitli Not</p>
                      <p className="mt-2 line-clamp-2 text-sm text-white/80">{selectedNote || "Henuz not yok"}</p>
                    </div>
                  </div>

                  {error ? <p className="mt-4 rounded-xl border border-red-500/50 bg-red-500/10 px-3 py-2 text-xs text-white">{error}</p> : null}

                  {displayEntry ? (
                    <>
                      <div className="mt-4 rounded-2xl border border-white/10 bg-black/20 p-4">
                        <div className="flex flex-wrap items-center justify-between gap-3">
                          <p className="text-xs uppercase tracking-[0.16em] text-white/45">Ozet Analiz</p>
                          <p className="text-xs text-white/45">{formatPubDate(displayEntry.savedAt)}</p>
                        </div>
                        <p className="mt-3 text-sm leading-7 text-white/90">{displayEntry.summary}</p>
                      </div>

                      <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,1.5fr)_minmax(320px,0.9fr)]">
                        <PriceChart
                          data={displayEntry.dailyPrices}
                          currency={displayEntry.currency}
                          currentPrice={displayEntry.price}
                          dayChangePercent={displayEntry.dayChangePercent}
                          oneMonthChangePercent={displayEntry.oneMonthChangePercent}
                        />
                        <NewsSentimentChart sentiment={sentimentBreakdown} />
                      </div>

                      <div className="mt-4 grid gap-4 lg:grid-cols-3">
                        <article className="rounded-2xl border border-white/10 bg-black/20 p-4">
                          <p className="text-xs uppercase tracking-[0.16em] text-white/45">Base Case</p>
                          <p className="mt-3 text-sm leading-7 text-white/90">{displayEntry.baseCase}</p>
                        </article>
                        <article className="rounded-2xl border border-emerald-400/20 bg-emerald-400/5 p-4">
                          <p className="text-xs uppercase tracking-[0.16em] text-emerald-200/80">Bull Case</p>
                          <p className="mt-3 text-sm leading-7 text-white/90">{displayEntry.bullCase}</p>
                        </article>
                        <article className="rounded-2xl border border-rose-400/20 bg-rose-400/5 p-4">
                          <p className="text-xs uppercase tracking-[0.16em] text-rose-200/80">Bear Case</p>
                          <p className="mt-3 text-sm leading-7 text-white/90">{displayEntry.bearCase}</p>
                        </article>
                      </div>

                      <div className="mt-4 grid gap-4 lg:grid-cols-2">
                        <article className="rounded-2xl border border-white/10 bg-black/20 p-4">
                          <p className="text-xs uppercase tracking-[0.16em] text-white/45">Key Drivers</p>
                          <div className="mt-3 flex flex-wrap gap-2">
                            {displayEntry.keyDrivers.map((item) => (
                              <span key={item} className="rounded-full border border-sky-300/20 bg-sky-300/10 px-3 py-2 text-xs text-sky-100">
                                {item}
                              </span>
                            ))}
                          </div>
                        </article>
                        <article className="rounded-2xl border border-white/10 bg-black/20 p-4">
                          <p className="text-xs uppercase tracking-[0.16em] text-white/45">Key Risks</p>
                          <div className="mt-3 flex flex-wrap gap-2">
                            {displayEntry.keyRisks.map((item) => (
                              <span key={item} className="rounded-full border border-rose-300/20 bg-rose-300/10 px-3 py-2 text-xs text-rose-100">
                                {item}
                              </span>
                            ))}
                          </div>
                        </article>
                      </div>
                    </>
                  ) : (
                    <div className="mt-4 rounded-2xl border border-dashed border-white/10 bg-black/20 p-8 text-center text-sm text-white/55">
                      Bu alan grafik ve senaryo gosterecek. Veriyi doldurmak icin once analiz calistirin.
                    </div>
                  )}
                </article>

                <article className="rounded-2xl border border-white/15 bg-[#0f1728bf] p-4 shadow-[0_20px_40px_rgba(0,0,0,0.25)]">
                  <div className="flex items-center justify-between gap-3 border-b border-white/20 pb-3">
                    <h2 className="text-sm font-semibold uppercase tracking-[0.2em]">Model Haberleri</h2>
                    <span className="text-xs text-white/55">{activeResult?.news.length ?? 0} baslik</span>
                  </div>

                  {activeResult?.news?.length ? (
                    <div className="mt-4 grid gap-3 xl:grid-cols-2">
                      {activeResult.news.map((item, index) => (
                        <article key={`${item.link}-${index}`} className="rounded-xl border border-white/10 bg-black/20 p-4">
                          <p className="text-[11px] uppercase tracking-[0.14em] text-white/45">{item.source}</p>
                          <a href={item.link} target="_blank" rel="noreferrer" className="mt-2 block text-sm font-semibold leading-6 hover:underline">
                            {item.title}
                          </a>
                          <p className="mt-2 text-[11px] text-white/45">{formatPubDate(item.pubDate)}</p>
                        </article>
                      ))}
                    </div>
                  ) : (
                    <p className="mt-4 text-sm text-white/55">Bu bolum, API analizinden donen ana haber basliklarini gosterir.</p>
                  )}
                </article>

                <article className="flex-1 rounded-2xl border border-white/15 bg-[#0f1728bf] p-4 shadow-[0_20px_40px_rgba(0,0,0,0.25)]">
                  <div className="flex items-center justify-between gap-3 border-b border-white/20 pb-3">
                    <h2 className="text-sm font-semibold uppercase tracking-[0.2em]">{selectedCompany.symbol} RSS Eslestirmeleri</h2>
                    <span className="text-xs text-white/55">{companySpecificRssNews.length} sonuc</span>
                  </div>

                  <div className="mt-4 grid grid-cols-1 gap-3 xl:grid-cols-2">
                    {companySpecificRssNews.slice(0, 12).map((item, idx) => (
                      <article key={`${item.link}-${idx}`} className="group overflow-hidden rounded-2xl border border-white/10 bg-white/[0.02] transition hover:border-white/30">
                        {item.image ? (
                          <Image src={item.image} alt={item.title} width={1200} height={675} className="h-36 w-full object-cover object-center" unoptimized />
                        ) : (
                          <div className="h-36 w-full bg-gradient-to-br from-white/10 to-transparent" />
                        )}
                        <div className="space-y-2 p-3">
                          <div className="flex items-center justify-between gap-2">
                            <span className="shrink-0 rounded-full border border-white/20 px-2 py-1 text-[10px] uppercase text-white/60">{item.feedLanguage}</span>
                            <span className="truncate text-[10px] uppercase text-white/50">{item.source || item.feedName}</span>
                          </div>
                          <a href={item.link} target="_blank" rel="noreferrer" className="line-clamp-3 text-sm font-medium leading-6 hover:underline break-words">
                            {item.title}
                          </a>
                          <p className="line-clamp-2 text-[11px] text-white/45">{item.description || "Baglantiya giderek haberin detayini okuyabilirsiniz."}</p>
                          <p className="text-[11px] text-white/40">{formatPubDate(item.pubDate)}</p>
                        </div>
                      </article>
                    ))}
                  </div>
                </article>
              </div>

              <aside className="min-w-0 flex h-[calc(100vh-190px)] flex-col gap-4 overflow-y-auto pr-1">
                <article className="rounded-2xl border border-white/15 bg-[#0f1728bf] p-4">
                  <div className="flex items-center justify-between gap-3 border-b border-white/20 pb-3">
                    <h2 className="text-sm font-semibold uppercase tracking-[0.2em]">Gunluk Ozet</h2>
                    <span className="text-xs text-white/55">{digest.coveredCount}/{watchlist.length} kapsama</span>
                  </div>
                  <div className="mt-4 grid gap-3 sm:grid-cols-2">
                    <div className="rounded-xl border border-white/10 bg-black/20 p-4">
                      <p className="text-[11px] uppercase tracking-[0.14em] text-white/45">Watchlist Ortalama</p>
                      <p className={`mt-2 text-2xl font-semibold ${getChangeTone(digest.avgDaily)}`}>{formatPercent(digest.avgDaily)}</p>
                    </div>
                    <div className="rounded-xl border border-white/10 bg-black/20 p-4">
                      <p className="text-[11px] uppercase tracking-[0.14em] text-white/45">Tetiklenen Alarm</p>
                      <p className="mt-2 line-clamp-2 text-sm text-white/85">{triggeredAlerts[0]?.company || "Henuz yok"}</p>
                    </div>
                  </div>
                  <div className="mt-4 grid gap-3 md:grid-cols-2">
                    <div className="rounded-xl border border-white/10 bg-black/20 p-4">
                      <p className="text-[11px] uppercase tracking-[0.14em] text-white/45">En Gucluler</p>
                      <div className="mt-3 space-y-2">
                        {digest.leaders.length ? (
                          digest.leaders.map((item) => (
                            <div key={item.symbol} className="flex items-center justify-between text-sm">
                              <span>{item.symbol}</span>
                              <span className={getChangeTone(item.dayChangePercent)}>{formatPercent(item.dayChangePercent)}</span>
                            </div>
                          ))
                        ) : (
                          <p className="text-sm text-white/45">Veri icin analiz kaydet.</p>
                        )}
                      </div>
                    </div>
                    <div className="rounded-xl border border-white/10 bg-black/20 p-4">
                      <p className="text-[11px] uppercase tracking-[0.14em] text-white/45">Basincli Alanlar</p>
                      <div className="mt-3 space-y-2">
                        {digest.laggards.length ? (
                          digest.laggards.map((item) => (
                            <div key={item.symbol} className="flex items-center justify-between text-sm">
                              <span>{item.symbol}</span>
                              <span className={getChangeTone(item.dayChangePercent)}>{formatPercent(item.dayChangePercent)}</span>
                            </div>
                          ))
                        ) : (
                          <p className="text-sm text-white/45">Veri icin analiz kaydet.</p>
                        )}
                      </div>
                    </div>
                  </div>
                </article>

                <article className="rounded-2xl border border-white/15 bg-[#0f1728bf] p-4">
                  <div className="flex items-center justify-between gap-3 border-b border-white/20 pb-3">
                    <h2 className="text-sm font-semibold uppercase tracking-[0.2em]">Watchlist</h2>
                    <span className="text-xs text-white/55">{watchlist.length} sirket</span>
                  </div>
                  <div className="mt-4 space-y-2">
                    {watchlist.length ? (
                      watchlist.map((item) => {
                        const entry = analysisHistory.find((historyItem) => historyItem.symbol === item.symbol);
                        return (
                          <button
                            key={item.symbol}
                            type="button"
                            onClick={() => jumpToWorkspaceItem(item)}
                            className="w-full rounded-xl border border-white/10 bg-black/20 p-3 text-left hover:border-white/30"
                          >
                            <div className="flex items-center justify-between gap-3">
                              <div>
                                <p className="text-sm font-semibold">{item.symbol}</p>
                                <p className="truncate text-xs text-white/55">{item.company}</p>
                              </div>
                              <div className="text-right">
                                <p className={`text-sm font-semibold ${getChangeTone(entry?.dayChangePercent)}`}>{formatPercent(entry?.dayChangePercent)}</p>
                                <p className="text-[11px] text-white/45">{MARKET_OPTIONS.find((option) => option.key === item.market)?.label}</p>
                              </div>
                            </div>
                          </button>
                        );
                      })
                    ) : (
                      <p className="text-sm text-white/45">Secili sirketi watchliste ekleyerek baslayin.</p>
                    )}
                  </div>
                </article>

                <article className="rounded-2xl border border-white/15 bg-[#0f1728bf] p-4">
                  <div className="flex items-center justify-between gap-3 border-b border-white/20 pb-3">
                    <h2 className="text-sm font-semibold uppercase tracking-[0.2em]">Compare Modu</h2>
                    <span className="text-xs text-white/55">{compareItems.length}/{MAX_COMPARE_ITEMS}</span>
                  </div>
                  <div className="mt-4 grid gap-3">
                    {compareCards.length ? (
                      compareCards.map(({ item, entry }) => (
                        <div key={item.symbol} className="rounded-2xl border border-white/10 bg-black/20 p-4">
                          <div className="flex items-start justify-between gap-3">
                            <button type="button" onClick={() => jumpToWorkspaceItem(item)} className="text-left">
                              <p className="text-sm font-semibold">{item.symbol}</p>
                              <p className="max-w-[220px] truncate text-xs text-white/55">{item.company}</p>
                            </button>
                            <button
                              type="button"
                              onClick={() => setCompareItems((prev) => prev.filter((compareItem) => compareItem.symbol !== item.symbol))}
                              className="text-[11px] uppercase tracking-[0.14em] text-white/45 hover:text-white"
                            >
                              Sil
                            </button>
                          </div>
                          {entry ? (
                            <>
                              <div className="mt-3">
                                <MiniSparkline data={entry.dailyPrices} />
                              </div>
                              <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                                <div className="rounded-xl border border-white/10 p-3">
                                  <p className="text-white/45">Fiyat</p>
                                  <p className="mt-1 text-sm font-semibold">
                                    {formatCompactNumber(entry.price)} {entry.currency}
                                  </p>
                                </div>
                                <div className="rounded-xl border border-white/10 p-3">
                                  <p className="text-white/45">Gunluk</p>
                                  <p className={`mt-1 text-sm font-semibold ${getChangeTone(entry.dayChangePercent)}`}>{formatPercent(entry.dayChangePercent)}</p>
                                </div>
                              </div>
                            </>
                          ) : (
                            <p className="mt-3 text-sm text-white/45">Karsilastirma karti hazir. Veri icin bu sirketi bir kez analiz et.</p>
                          )}
                        </div>
                      ))
                    ) : (
                      <p className="text-sm text-white/45">Secili sirketleri burada yan yana biriktirebilirsin.</p>
                    )}
                  </div>
                </article>

                <article className="rounded-2xl border border-white/15 bg-[#0f1728bf] p-4">
                  <div className="flex items-center justify-between gap-3 border-b border-white/20 pb-3">
                    <h2 className="text-sm font-semibold uppercase tracking-[0.2em]">Not Defteri</h2>
                    <span className="text-xs text-white/55">{selectedCompany.symbol}</span>
                  </div>
                  <textarea
                    value={selectedNote}
                    onChange={(event) => saveNote(event.target.value)}
                    placeholder="Bu sirket icin kendi notlarini yaz..."
                    className="mt-4 h-32 w-full rounded-2xl border border-white/10 bg-black/20 p-4 text-sm text-white outline-none"
                  />
                </article>

                <article className="rounded-2xl border border-white/15 bg-[#0f1728bf] p-4">
                  <div className="flex items-center justify-between gap-3 border-b border-white/20 pb-3">
                    <h2 className="text-sm font-semibold uppercase tracking-[0.2em]">Alarm Merkezi</h2>
                    <span className="text-xs text-white/55">{alerts.length} kural</span>
                  </div>

                  <div className="mt-4 grid gap-2">
                    <input
                      value={alertLabel}
                      onChange={(event) => setAlertLabel(event.target.value)}
                      placeholder="Alarm etiketi"
                      className="rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm outline-none"
                    />
                    <div className="grid gap-2 sm:grid-cols-3">
                      <select
                        value={alertMetric}
                        onChange={(event) => setAlertMetric(event.target.value as AlertRule["metric"])}
                        className="rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm outline-none"
                      >
                        <option value="dayChangePercent">Gunluk Degisim</option>
                        <option value="oneMonthChangePercent">1 Aylik Degisim</option>
                      </select>
                      <select
                        value={alertDirection}
                        onChange={(event) => setAlertDirection(event.target.value as AlertRule["direction"])}
                        className="rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm outline-none"
                      >
                        <option value="above">Esik ustu</option>
                        <option value="below">Esik alti</option>
                      </select>
                      <input
                        value={alertThreshold}
                        onChange={(event) => setAlertThreshold(event.target.value)}
                        placeholder="3"
                        className="rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm outline-none"
                      />
                    </div>
                    <button type="button" onClick={createAlert} className="rounded-xl border border-white bg-white px-4 py-3 text-sm font-semibold text-black">
                      Secili Sirket Icin Alarm Ekle
                    </button>
                  </div>

                  <div className="mt-4 space-y-2">
                    {alerts.length ? (
                      alerts.map((rule) => (
                        <div key={rule.id} className="rounded-xl border border-white/10 bg-black/20 p-3">
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <p className="text-sm font-semibold">{rule.label}</p>
                              <p className="text-xs text-white/55">
                                {rule.symbol} / {rule.metric === "dayChangePercent" ? "Gunluk" : "1 Aylik"} {rule.direction === "above" ? ">=" : "<="} {formatPercent(rule.threshold)}
                              </p>
                            </div>
                            <button
                              type="button"
                              onClick={() => setAlerts((prev) => prev.filter((item) => item.id !== rule.id))}
                              className="text-[11px] uppercase tracking-[0.14em] text-white/45 hover:text-white"
                            >
                              Sil
                            </button>
                          </div>
                        </div>
                      ))
                    ) : (
                      <p className="text-sm text-white/45">Analiz geldikce tetiklenecek basit fiyat alarmlarini burada olustur.</p>
                    )}
                  </div>

                  {triggeredAlerts.length ? (
                    <div className="mt-4 rounded-2xl border border-amber-300/20 bg-amber-300/5 p-4">
                      <p className="text-xs uppercase tracking-[0.16em] text-amber-100/75">Son Tetiklenenler</p>
                      <div className="mt-3 space-y-2">
                        {triggeredAlerts.slice(0, 4).map((item) => (
                          <div key={item.id} className="flex items-center justify-between gap-3 text-sm">
                            <div>
                              <p>{item.company}</p>
                              <p className="text-[11px] text-white/55">{item.message}</p>
                            </div>
                            <button
                              type="button"
                              onClick={() => setTriggeredAlerts((prev) => prev.filter((alert) => alert.id !== item.id))}
                              className="text-[11px] uppercase tracking-[0.14em] text-white/45 hover:text-white"
                            >
                              Kapat
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : null}
                </article>

                <article className="rounded-2xl border border-white/15 bg-[#0f1728bf] p-4">
                  <div className="flex items-center justify-between gap-3 border-b border-white/20 pb-3">
                    <h2 className="text-sm font-semibold uppercase tracking-[0.2em]">Analiz Gecmisi</h2>
                    <span className="text-xs text-white/55">{analysisHistory.length}</span>
                  </div>
                  <div className="mt-4 space-y-2">
                    {analysisHistory.length ? (
                      analysisHistory.map((item) => (
                        <button
                          key={item.id}
                          type="button"
                          onClick={() =>
                            jumpToWorkspaceItem({
                              symbol: item.symbol,
                              company: item.company,
                              market: item.market,
                            })
                          }
                          className="w-full rounded-xl border border-white/10 bg-black/20 p-3 text-left hover:border-white/30"
                        >
                          <div className="flex items-center justify-between gap-3">
                            <div>
                              <p className="text-sm font-semibold">{item.symbol}</p>
                              <p className="line-clamp-1 text-xs text-white/55">{item.summary}</p>
                            </div>
                            <div className="text-right">
                              <p className={`text-sm font-semibold ${getChangeTone(item.dayChangePercent)}`}>{formatPercent(item.dayChangePercent)}</p>
                              <p className="text-[11px] text-white/45">{formatPubDate(item.savedAt)}</p>
                            </div>
                          </div>
                        </button>
                      ))
                    ) : (
                      <p className="text-sm text-white/45">Calistirdigin analizler burada birikecek.</p>
                    )}
                  </div>
                </article>
              </aside>
            </div>
          </>
        )}

        {activeTab === "rss" && (
          <div className="grid h-[calc(100vh-190px)] gap-6 xl:grid-cols-[360px_1fr]">
            <article className="flex flex-col rounded-2xl border border-white/15 bg-[#0f1728bf] p-4 shadow-[0_20px_40px_rgba(0,0,0,0.25)]">
              <div className="border-b border-white/20 pb-3">
                <h2 className="text-sm font-semibold uppercase tracking-[0.2em]">RSS Kaynak Yonetimi</h2>
                <p className="mt-2 text-xs text-white/55">Performans icin kaynaklar kademeli yukleniyor. Daha fazla kaynagi manuel olarak acabilirsin.</p>
              </div>

              <div className="mt-4 rounded-2xl border border-white/20 p-3">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-white/70">Yeni Kaynak Ekle</p>
                <div className="mt-2 flex gap-2">
                  <input
                    value={rssInput}
                    onChange={(event) => setRssInput(event.target.value)}
                    placeholder="https://ornek.com/rss"
                    className="w-full rounded-xl border border-white/30 bg-black px-3 py-2 text-sm text-white outline-none focus:border-white"
                  />
                  <button type="button" onClick={addRssFeed} className="rounded-xl border border-white bg-white px-4 py-2 text-sm font-semibold text-black hover:bg-white/90">
                    Ekle
                  </button>
                </div>
              </div>

              <div className="mt-4 flex items-center justify-between gap-2 rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-xs text-white/60">
                <span>{loadedFeedCount}/{rssFeeds.length} kaynak hazir</span>
                <button
                  type="button"
                  onClick={() => setRssFeedLoadTarget((prev) => Math.min(prev + 6, rssFeeds.length))}
                  className="rounded-full border border-white/20 px-3 py-1 uppercase tracking-[0.14em] hover:bg-white/10"
                >
                  Daha fazla yukle
                </button>
              </div>

              <div className="mt-4 flex-1 space-y-2 overflow-y-auto pr-1">
                {rssFeeds.map((feed, index) => {
                  const queued = index >= rssFeedLoadTarget;
                  return (
                    <div key={feed.url} className="rounded-2xl border border-white/20 p-3 text-xs">
                      <div className="flex items-center justify-between gap-2">
                        <p className="font-semibold text-[13px]">{feed.name}</p>
                        <div className="flex items-center gap-2">
                          <span className="rounded-full border border-white/30 px-2 py-1 text-[9px] uppercase">{feed.language}</span>
                          {!feed.system ? (
                            <button type="button" onClick={() => removeRssFeed(feed.url)} className="rounded-full border border-white/40 px-2 py-1 text-[10px] hover:bg-white hover:text-black transition">
                              Sil
                            </button>
                          ) : (
                            <span className="rounded-full border border-white/30 px-2 py-1 text-[9px] uppercase text-white/50">Sistem</span>
                          )}
                        </div>
                      </div>
                      <p className="mt-2 break-all text-white/50 text-[10px]">{feed.url}</p>

                      <div className="mt-3 flex items-center justify-between">
                        <p className="text-[10px] text-white/40">
                          Durum: {queued ? "Sirada" : rssLoadingByFeed[feed.url] ? "Yukleniyor..." : (rssItemsByFeed[feed.url]?.length ?? 0) > 0 ? "Hazir" : "Bos"}
                        </p>
                        <button type="button" onClick={() => loadRssPreview(feed.url)} className="rounded-full border border-white/40 px-3 py-1.5 text-[10px] uppercase hover:bg-white/10 transition">
                          Guncelle
                        </button>
                      </div>
                      {rssErrorByFeed[feed.url] ? <p className="mt-2 text-[11px] text-red-400">{rssErrorByFeed[feed.url]}</p> : null}
                    </div>
                  );
                })}
              </div>
            </article>

            <article className="flex flex-col rounded-2xl border border-white/15 bg-[#0f1728bf] p-4 shadow-[0_20px_40px_rgba(0,0,0,0.25)]">
              <div className="border-b border-white/20 pb-3">
                <h2 className="text-sm font-semibold uppercase tracking-[0.2em]">Genel Haber Akisi</h2>
                <p className="mt-1 text-xs text-white/55">Tum RSS kaynaklarindan gelen haberler. Kademeli preload sayesinde ilk acilista daha akici calisir.</p>
                <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_auto_auto]">
                  <input
                    value={rssSearchQuery}
                    onChange={(event) => startTransition(() => setRssSearchQuery(event.target.value))}
                    placeholder="Haber ara: Turkcell, THYAO, Akbank, bankacilik..."
                    className="w-full rounded-xl border border-white/30 bg-black px-3 py-2 text-sm text-white outline-none focus:border-white"
                  />
                  <div className="rounded-xl border border-white/20 px-3 py-2 text-center text-xs text-white/70">{filteredRssNewsRows.length} haber</div>
                  <button
                    type="button"
                    onClick={() => setRssFeedLoadTarget((prev) => Math.min(prev + 6, rssFeeds.length))}
                    className="rounded-xl border border-white/20 px-3 py-2 text-center text-xs text-white/70 hover:bg-white/10"
                  >
                    Kaynak Yukselt
                  </button>
                </div>
              </div>

              <div className="mt-4 flex-1 overflow-y-auto">
                {filteredRssNewsRows.length ? (
                  <div className="grid grid-cols-1 gap-4 md:grid-cols-2 2xl:grid-cols-3">
                    {filteredRssNewsRows.slice(0, 120).map((item, idx) => (
                      <article key={`${item.feedUrl}-${item.link}-${idx}`} className="group overflow-hidden rounded-2xl border border-white/10 bg-white/[0.02] transition hover:border-white/30">
                        {item.image ? (
                          <Image src={item.image} alt={item.title} width={1200} height={675} className="h-40 w-full object-cover object-center" unoptimized />
                        ) : (
                          <div className="h-40 w-full bg-[radial-gradient(circle_at_top_left,rgba(255,255,255,0.18),rgba(255,255,255,0.02)_45%,transparent_80%)]" />
                        )}
                        <div className="space-y-2 p-3">
                          <div className="flex items-center justify-between gap-2">
                            <span className="rounded-full border border-white/25 px-2 py-1 text-[10px] uppercase text-white/70">{item.feedLanguage}</span>
                            <span className="truncate text-[10px] uppercase text-white/45">{item.source || item.feedName}</span>
                          </div>
                          <a href={item.link} target="_blank" rel="noreferrer" className="line-clamp-3 text-sm font-semibold leading-6 hover:underline">
                            {item.title}
                          </a>
                          <p className="line-clamp-2 text-[12px] text-white/45">{item.description || "Haberi acarak detayini inceleyebilirsiniz."}</p>
                          <p className="text-[11px] text-white/40">{formatPubDate(item.pubDate)}</p>
                        </div>
                      </article>
                    ))}
                  </div>
                ) : (
                  <div className="rounded-2xl border border-white/10 p-6 text-center text-sm text-white/60">Arama kriterine uygun haber bulunamadi.</div>
                )}
              </div>
            </article>
          </div>
        )}
      </main>
    </div>
  );
}
