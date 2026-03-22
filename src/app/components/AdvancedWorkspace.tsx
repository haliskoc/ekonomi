"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  createChart,
  type IChartApi,
  type CandlestickData,
  type HistogramData,
  type LineData,
  ColorType,
  CandlestickSeries,
  HistogramSeries,
  LineSeries,
} from "lightweight-charts";
import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  AreaChart,
  Area,
  BarChart,
  Bar,
} from "recharts";

type TechnicalPoint = {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
};

type FinancialsResponse = {
  symbol: string;
  incomeStatement: Array<Record<string, string | number | null>>;
  balanceSheet: Array<Record<string, string | number | null>>;
  cashflowStatement: Array<Record<string, string | number | null>>;
  valuation: {
    trailingPE: string | number | null;
    priceToBook: string | number | null;
    marketCap: string | number | null;
  };
};

type CompareRow = {
  symbol: string;
  name: string;
  price: number | null;
  oneMonthChangePercent: number | null;
  trailingPE: number | null;
  priceToBook: number | null;
};

type AlertItem = {
  id: string;
  symbol: string;
  direction: "above" | "below";
  targetPrice: number;
  currentPrice: number | null;
  triggered: boolean;
};

type PortfolioHolding = {
  symbol: string;
  quantity: number;
  avgCost?: number;
};

type PortfolioRow = {
  symbol: string;
  quantity: number;
  price: number;
  value: number;
  pnl: number | null;
};

type Props = {
  symbol: string;
  symbolOptions: string[];
};

type Lang = "tr" | "en";

type TimePeriod = "1D" | "1H" | "4H" | "1W" | "1M";

type RssItem = {
  title: string;
  link: string;
  pubDate: string;
  source: string;
  description?: string;
  image?: string;
};

const PIE_COLORS = ["#3ecf8e", "#6ba4ff", "#ff6b6b", "#ffd93d", "#c084fc", "#f97316", "#06b6d4", "#84cc16"];

const text = {
  tr: {
    title: "Gelismis Analiz Paneli",
    chart: "Teknik Grafik",
    financials: "Finansal Tablolar",
    compare: "Karsilastirma",
    summary: "Seans Ozeti",
    portfolio: "Portfoy",
    alerts: "Fiyat Alarmlari",
    macro: "Makro Gostergeler",
    global: "Global Pazarlar",
    export: "Disa Aktar",
    noData: "Veri yok",
    indicators: "Teknik Indikatorler",
    heatmap: "Isi Haritasi",
    stockPrice: "Hisse Fiyatlari",
    rssNews: "RSS Haberleri",
    portfolioChart: "Portfoy Performans",
    portfolioPie: "Portfoy Dagilimi",
  },
  en: {
    title: "Advanced Analytics",
    chart: "Technical Chart",
    financials: "Financial Statements",
    compare: "Comparison",
    summary: "Market Summary",
    portfolio: "Portfolio",
    alerts: "Price Alerts",
    macro: "Macro Indicators",
    global: "Global Markets",
    export: "Export",
    noData: "No data",
    indicators: "Technical Indicators",
    heatmap: "Heat Map",
    stockPrice: "Stock Prices",
    rssNews: "RSS News",
    portfolioChart: "Portfolio Performance",
    portfolioPie: "Portfolio Distribution",
  },
} as const;

function fmt(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return "-";
  }
  return value.toLocaleString("en-US", { maximumFractionDigits: 2 });
}

function downloadBlob(filename: string, blob: Blob): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

// Calculate RSI
function calculateRSI(prices: number[], period: number = 14): (number | null)[] {
  const rsi: (number | null)[] = [];
  const changes: number[] = [];

  for (let i = 1; i < prices.length; i++) {
    changes.push(prices[i] - prices[i - 1]);
  }

  for (let i = 0; i < period; i++) {
    rsi.push(null);
  }

  let avgGain = 0;
  let avgLoss = 0;

  for (let i = 0; i < period; i++) {
    if (changes[i] > 0) avgGain += changes[i];
    else avgLoss += Math.abs(changes[i]);
  }

  avgGain /= period;
  avgLoss /= period;

  if (avgLoss === 0) {
    rsi.push(100);
  } else {
    const rs = avgGain / avgLoss;
    rsi.push(100 - 100 / (1 + rs));
  }

  for (let i = period; i < changes.length; i++) {
    const change = changes[i];
    const gain = change > 0 ? change : 0;
    const loss = change < 0 ? Math.abs(change) : 0;

    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;

    if (avgLoss === 0) {
      rsi.push(100);
    } else {
      const rs = avgGain / avgLoss;
      rsi.push(100 - 100 / (1 + rs));
    }
  }

  return rsi;
}

// Calculate MACD
function calculateMACD(prices: number[], fastPeriod: number = 12, slowPeriod: number = 26, signalPeriod: number = 9): { macd: (number | null)[]; signal: (number | null)[]; histogram: (number | null)[] } {
  function ema(data: number[], period: number): (number | null)[] {
    const result: (number | null)[] = [];
    const k = 2 / (period + 1);

    for (let i = 0; i < period - 1; i++) {
      result.push(null);
    }

    let sum = 0;
    for (let i = 0; i < period; i++) {
      sum += data[i];
    }
    let emaValue = sum / period;
    result.push(emaValue);

    for (let i = period; i < data.length; i++) {
      emaValue = data[i] * k + emaValue * (1 - k);
      result.push(emaValue);
    }

    return result;
  }

  const fastEMA = ema(prices, fastPeriod);
  const slowEMA = ema(prices, slowPeriod);

  const macdLine: (number | null)[] = [];
  for (let i = 0; i < prices.length; i++) {
    if (fastEMA[i] === null || slowEMA[i] === null) {
      macdLine.push(null);
    } else {
      macdLine.push((fastEMA[i] as number) - (slowEMA[i] as number));
    }
  }

  const validMacd = macdLine.filter((v) => v !== null) as number[];
  const signalLine = ema(validMacd, signalPeriod);

  const histogram: (number | null)[] = [];
  let signalIdx = 0;
  for (let i = 0; i < macdLine.length; i++) {
    if (macdLine[i] === null || signalLine[signalIdx] === null) {
      histogram.push(null);
      if (macdLine[i] !== null) signalIdx++;
    } else {
      histogram.push((macdLine[i] as number) - (signalLine[signalIdx] as number));
      signalIdx++;
    }
  }

  return { macd: macdLine, signal: signalLine, histogram };
}

// Calculate Bollinger Bands
function calculateBollingerBands(prices: number[], period: number = 20, multiplier: number = 2): { upper: (number | null)[]; middle: (number | null)[]; lower: (number | null)[] } {
  const upper: (number | null)[] = [];
  const middle: (number | null)[] = [];
  const lower: (number | null)[] = [];

  for (let i = 0; i < period - 1; i++) {
    upper.push(null);
    middle.push(null);
    lower.push(null);
  }

  for (let i = period - 1; i < prices.length; i++) {
    const slice = prices.slice(i - period + 1, i + 1);
    const avg = slice.reduce((a, b) => a + b, 0) / period;
    const variance = slice.reduce((a, b) => a + Math.pow(b - avg, 2), 0) / period;
    const stdDev = Math.sqrt(variance);

    middle.push(avg);
    upper.push(avg + multiplier * stdDev);
    lower.push(avg - multiplier * stdDev);
  }

  return { upper, middle, lower };
}

// Generate mock portfolio history
function generatePortfolioHistory(holdings: PortfolioRow[]): { date: string; value: number }[] {
  const history: { date: string; value: number }[] = [];
  const today = new Date();
  let baseValue = holdings.reduce((sum, h) => sum + h.value, 0) || 10000;

  for (let i = 30; i >= 0; i--) {
    const date = new Date(today);
    date.setDate(date.getDate() - i);
    const variation = 1 + (Math.random() - 0.45) * 0.08;
    baseValue *= variation;
    history.push({
      date: date.toISOString().slice(0, 10),
      value: Math.round(baseValue * 100) / 100,
    });
  }

  return history;
}

export default function AdvancedWorkspace({ symbol, symbolOptions }: Props) {
  const [lang, setLang] = useState<Lang>(() => {
    if (typeof window === "undefined") {
      return "tr";
    }

    const stored = window.localStorage.getItem("ui-lang");
    return stored === "en" ? "en" : "tr";
  });
  const [timePeriod, setTimePeriod] = useState<TimePeriod>("1D");
  const [showIndicators, setShowIndicators] = useState({ rsi: true, macd: true, bollinger: true });
  const [technicals, setTechnicals] = useState<TechnicalPoint[]>([]);
  const [financials, setFinancials] = useState<FinancialsResponse | null>(null);
  const [compareSymbols, setCompareSymbols] = useState<string[]>(() => symbolOptions.slice(0, 3));
  const [compareRows, setCompareRows] = useState<CompareRow[]>([]);
  const [summary, setSummary] = useState<{ gainers: CompareRow[]; losers: CompareRow[]; byVolume: CompareRow[] } | null>(null);
  const [macro, setMacro] = useState<Record<string, number | null> | null>(null);
  const [global, setGlobal] = useState<Array<{ id: string; label: string; price: number | null; changePercent: number | null }>>([]);
  const [alerts, setAlerts] = useState<AlertItem[]>([]);
  const [alertForm, setAlertForm] = useState({ direction: "above" as "above" | "below", targetPrice: "" });
  const [portfolioText, setPortfolioText] = useState(`${symbol},10,0`);
  const [portfolioResult, setPortfolioResult] = useState<{ totalValue: number; totalPnl: number; rows: PortfolioRow[] } | null>(null);
  const [sector, setSector] = useState<{ averageDayChangePercent: number | null; companyCount: number } | null>(null);
  const [rssPage, setRssPage] = useState(1);
  const [rssItems, setRssItems] = useState<RssItem[]>([]);
  const [rssLoading, setRssLoading] = useState(false);
  const [dataLoading, setDataLoading] = useState(true);
  const chartRef = useRef<HTMLDivElement | null>(null);
  const chartApiRef = useRef<IChartApi | null>(null);

  const t = text[lang];
  const RSS_PER_PAGE = 6;

  useEffect(() => {
    localStorage.setItem("ui-lang", lang);
  }, [lang]);

  useEffect(() => {
    async function loadData(): Promise<void> {
      const rangeMap: Record<TimePeriod, string> = {
        "1D": "1d",
        "1H": "5d",
        "4H": "1mo",
        "1W": "3mo",
        "1M": "6mo",
      };
      const intervalMap: Record<TimePeriod, string> = {
        "1D": "5m",
        "1H": "5m",
        "4H": "1h",
        "1W": "1d",
        "1M": "1d",
      };

      setDataLoading(true);
      try {
        // Fetch technicals data with error handling
        let techData: TechnicalPoint[] = [];
        try {
          const techRes = await fetch(`/api/company/technicals?symbol=${encodeURIComponent(symbol)}&range=${rangeMap[timePeriod]}&interval=${intervalMap[timePeriod]}`);
          if (techRes.ok) {
            const techJson = (await techRes.json()) as { points?: TechnicalPoint[] };
            techData = techJson.points ?? [];
          } else {
            console.warn("Technicals API returned:", techRes.status);
          }
        } catch (e) {
          console.warn("Technicals fetch failed:", e);
        }
        setTechnicals(techData);

        // Fetch financials with error handling
        let finData: FinancialsResponse | null = null;
        try {
          const finRes = await fetch(`/api/company/financials?symbol=${encodeURIComponent(symbol)}`);
          if (finRes.ok) {
            finData = (await finRes.json()) as FinancialsResponse;
          }
        } catch (e) {
          console.warn("Financials fetch failed:", e);
        }
        setFinancials(finData);

        // Fetch market summary with error handling
        let sumData: { gainers: CompareRow[]; losers: CompareRow[]; byVolume: CompareRow[] } | null = null;
        try {
          const sumRes = await fetch("/api/markets/summary?market=bist100");
          if (sumRes.ok) {
            sumData = (await sumRes.json()) as { gainers: CompareRow[]; losers: CompareRow[]; byVolume: CompareRow[] };
          }
        } catch (e) {
          console.warn("Market summary fetch failed:", e);
        }
        setSummary(sumData ? {
          gainers: sumData.gainers ?? [],
          losers: sumData.losers ?? [],
          byVolume: sumData.byVolume ?? [],
        } : null);

        // Fetch macro indicators with error handling
        let macroData: Record<string, number | null> | null = null;
        try {
          const macroRes = await fetch("/api/macro/indicators");
          if (macroRes.ok) {
            const macroJson = (await macroRes.json()) as { indicators?: Record<string, number | null> };
            macroData = macroJson.indicators ?? null;
          }
        } catch (e) {
          console.warn("Macro fetch failed:", e);
        }
        setMacro(macroData);

        // Fetch global markets with error handling
        let globalData: Array<{ id: string; label: string; price: number | null; changePercent: number | null }> = [];
        try {
          const globalRes = await fetch("/api/markets/global");
          if (globalRes.ok) {
            const globalJson = (await globalRes.json()) as { markets?: Array<{ id: string; label: string; price: number | null; changePercent: number | null }> };
            globalData = globalJson.markets ?? [];
          }
        } catch (e) {
          console.warn("Global markets fetch failed:", e);
        }
        setGlobal(globalData);

        // Fetch alerts with error handling
        let alertsData: AlertItem[] = [];
        try {
          const alertRes = await fetch("/api/alerts");
          if (alertRes.ok) {
            const alertJson = (await alertRes.json()) as { alerts?: AlertItem[] };
            alertsData = alertJson.alerts ?? [];
          }
        } catch (e) {
          console.warn("Alerts fetch failed:", e);
        }
        setAlerts(alertsData);

        // Fetch sector data with error handling
        let sectorData: { averageDayChangePercent: number | null; companyCount: number } = { averageDayChangePercent: null, companyCount: 0 };
        try {
          const sectorRes = await fetch(`/api/sector/analyze?symbols=${encodeURIComponent(compareSymbols.join(","))}&sector=mixed`);
          if (sectorRes.ok) {
            const sectorJson = (await sectorRes.json()) as { averageDayChangePercent?: number | null; companyCount?: number };
            sectorData = {
              averageDayChangePercent: sectorJson.averageDayChangePercent ?? null,
              companyCount: sectorJson.companyCount ?? 0,
            };
          }
        } catch (e) {
          console.warn("Sector fetch failed:", e);
        }
        setSector(sectorData);

      } catch (error) {
        console.error("Data loading error:", error);
      }
    }

    void loadData();
  }, [symbol, compareSymbols, timePeriod]);

  useEffect(() => {
    async function loadRss(): Promise<void> {
      setRssLoading(true);
      try {
        const response = await fetch(`/api/rss/feeds?lang=all&limit=50`);
        const json = (await response.json()) as { items?: RssItem[] };
        setRssItems(json.items ?? []);
      } catch {
        setRssItems([]);
      } finally {
        setRssLoading(false);
      }
    }
    void loadRss();
  }, []);

  useEffect(() => {
    if (!chartRef.current || !technicals.length) {
      return;
    }

    if (chartApiRef.current) {
      chartApiRef.current.remove();
      chartApiRef.current = null;
    }

    const chart = createChart(chartRef.current, {
      width: chartRef.current.clientWidth,
      height: 400,
      layout: {
        textColor: "#eaf1ff",
        background: { type: ColorType.Solid, color: "#0d1627" },
      },
      grid: {
        vertLines: { color: "rgba(255,255,255,0.06)" },
        horzLines: { color: "rgba(255,255,255,0.06)" },
      },
      rightPriceScale: { borderColor: "rgba(255,255,255,0.1)" },
      timeScale: { borderColor: "rgba(255,255,255,0.1)" },
    });

    const candles = chart.addSeries(CandlestickSeries, {
      upColor: "#3ecf8e",
      downColor: "#ff6b6b",
      wickUpColor: "#3ecf8e",
      wickDownColor: "#ff6b6b",
      borderVisible: false,
    });

    const volume = chart.addSeries(HistogramSeries, {
      color: "rgba(107,164,255,0.5)",
      priceFormat: { type: "volume" },
      priceScaleId: "",
    });

    const candleData: CandlestickData[] = technicals.map((item) => ({
      time: item.date.slice(0, 10),
      open: item.open,
      high: item.high,
      low: item.low,
      close: item.close,
    }));

    const volumeData: HistogramData[] = technicals.map((item) => ({
      time: item.date.slice(0, 10),
      value: item.volume,
      color: item.close >= item.open ? "rgba(62,207,142,0.35)" : "rgba(255,107,107,0.35)",
    }));

    candles.setData(candleData);
    volume.setData(volumeData);

    // Bollinger Bands
    if (showIndicators.bollinger && technicals.length >= 20) {
      const closes = technicals.map((p) => p.close);
      const bb = calculateBollingerBands(closes);

      const upperBand = chart.addSeries(LineSeries, { color: "#ffd93d", lineWidth: 1, priceScaleId: "right" });
      const middleBand = chart.addSeries(LineSeries, { color: "#6ba4ff", lineWidth: 1, lineStyle: 2, priceScaleId: "right" });
      const lowerBand = chart.addSeries(LineSeries, { color: "#ffd93d", lineWidth: 1, priceScaleId: "right" });

      const upperData: LineData[] = [];
      const middleData: LineData[] = [];
      const lowerData: LineData[] = [];

      for (let i = 0; i < technicals.length; i++) {
        const time = technicals[i].date.slice(0, 10);
        if (bb.upper[i] !== null) upperData.push({ time, value: bb.upper[i] as number });
        if (bb.middle[i] !== null) middleData.push({ time, value: bb.middle[i] as number });
        if (bb.lower[i] !== null) lowerData.push({ time, value: bb.lower[i] as number });
      }

      upperBand.setData(upperData);
      middleBand.setData(middleData);
      lowerBand.setData(lowerData);
    }

    chart.timeScale().fitContent();
    chartApiRef.current = chart;

    const onResize = (): void => {
      if (!chartRef.current) {
        return;
      }
      chart.applyOptions({ width: chartRef.current.clientWidth });
    };

    window.addEventListener("resize", onResize);
    return () => {
      window.removeEventListener("resize", onResize);
      chart.remove();
    };
  }, [technicals, showIndicators.bollinger]);

  const incomePreview = useMemo(() => financials?.incomeStatement?.slice(0, 3) ?? [], [financials]);

  const rsiData = useMemo(() => {
    if (!showIndicators.rsi || technicals.length < 15) return null;
    const closes = technicals.map((p) => p.close);
    const rsiValues = calculateRSI(closes);
    return technicals.map((p, i) => ({ date: p.date.slice(0, 10), rsi: rsiValues[i] })).filter((d) => d.rsi !== null);
  }, [technicals, showIndicators.rsi]);

  const macdData = useMemo(() => {
    if (!showIndicators.macd || technicals.length < 26) return null;
    const closes = technicals.map((p) => p.close);
    const { macd, signal, histogram } = calculateMACD(closes);
    return technicals.map((p, i) => ({
      date: p.date.slice(0, 10),
      macd: macd[i],
      signal: signal[i >= 26 ? i - 26 + (signal.length - (technicals.length - 26)) : 0],
      histogram: histogram[i],
    })).filter((d) => d.macd !== null);
  }, [technicals, showIndicators.macd]);

  const portfolioHistory = useMemo(() => {
    if (!portfolioResult?.rows?.length) return [];
    return generatePortfolioHistory(portfolioResult.rows);
  }, [portfolioResult]);

  const portfolioPieData = useMemo(() => {
    if (!portfolioResult?.rows?.length) return [];
    return portfolioResult.rows.map((row) => ({
      name: row.symbol,
      value: row.value,
    }));
  }, [portfolioResult]);

  const heatmapData = useMemo(() => {
    if (!summary) return [];
    const sectors = [
      { name: "Bankacilik", change: (summary.gainers[0]?.oneMonthChangePercent ?? 0) * 0.8 },
      { name: "Holding", change: (summary.gainers[1]?.oneMonthChangePercent ?? 0) * 0.6 },
      { name: "Sanayi", change: (summary.losers[0]?.oneMonthChangePercent ?? 0) * 0.5 },
      { name: "Teknoloji", change: (summary.gainers[2]?.oneMonthChangePercent ?? 0) * 0.9 },
      { name: "Enerji", change: (summary.losers[1]?.oneMonthChangePercent ?? 0) * 0.7 },
      { name: "Perakende", change: (summary.byVolume[0]?.oneMonthChangePercent ?? 0) * 0.4 },
    ];
    return sectors;
  }, [summary]);

  const paginatedRss = useMemo(() => {
    const start = (rssPage - 1) * RSS_PER_PAGE;
    return rssItems.slice(start, start + RSS_PER_PAGE);
  }, [rssItems, rssPage]);

  const totalRssPages = Math.ceil(rssItems.length / RSS_PER_PAGE);

  async function refreshCompare(): Promise<void> {
    const response = await fetch(`/api/company/compare?symbols=${encodeURIComponent(compareSymbols.join(","))}`);
    const json = (await response.json()) as { rows?: CompareRow[] };
    setCompareRows(json.rows ?? []);
  }

  async function addAlert(): Promise<void> {
    const targetPrice = Number(alertForm.targetPrice);
    if (!targetPrice || Number.isNaN(targetPrice)) {
      return;
    }

    await fetch("/api/alerts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        symbol,
        direction: alertForm.direction,
        targetPrice,
      }),
    });

    const refreshed = await fetch("/api/alerts");
    const data = (await refreshed.json()) as { alerts?: AlertItem[] };
    setAlerts(data.alerts ?? []);
    setAlertForm((prev) => ({ ...prev, targetPrice: "" }));
  }

  async function deleteAlert(id: string): Promise<void> {
    await fetch("/api/alerts", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });

    const refreshed = await fetch("/api/alerts");
    const data = (await refreshed.json()) as { alerts?: AlertItem[] };
    setAlerts(data.alerts ?? []);
  }

  async function evaluatePortfolio(): Promise<void> {
    const holdings: PortfolioHolding[] = portfolioText
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const [rawSymbol, rawQty, rawCost] = line.split(",").map((part) => part.trim());
        return {
          symbol: rawSymbol.toUpperCase(),
          quantity: Number(rawQty),
          avgCost: rawCost ? Number(rawCost) : undefined,
        };
      })
      .filter((row) => row.symbol && row.quantity > 0);

    if (!holdings.length) {
      return;
    }

    const response = await fetch("/api/portfolio/value", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ holdings }),
    });

    const data = (await response.json()) as { totals?: { totalValue: number; totalPnl: number }; rows?: PortfolioRow[] };
    setPortfolioResult({
      totalValue: data.totals?.totalValue ?? 0,
      totalPnl: data.totals?.totalPnl ?? 0,
      rows: data.rows ?? [],
    });
  }

  async function exportReport(format: "json" | "pdf"): Promise<void> {
    const response = await fetch("/api/export/report", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        format,
        title: `${symbol} Analysis Export`,
        payload: {
          symbol,
          compareRows,
          valuation: financials?.valuation ?? null,
          summary,
          macro,
          global,
        },
      }),
    });

    if (format === "json") {
      const json = await response.json();
      downloadBlob(`${symbol.toLowerCase()}-analysis.json`, new Blob([JSON.stringify(json, null, 2)], { type: "application/json" }));
      return;
    }

    const blob = await response.blob();
    downloadBlob(`${symbol.toLowerCase()}-analysis.pdf`, blob);
  }

  function getHeatmapColor(change: number): string {
    if (change > 3) return "bg-green-600";
    if (change > 1) return "bg-green-500";
    if (change > 0) return "bg-green-400";
    if (change > -1) return "bg-red-400";
    if (change > -3) return "bg-red-500";
    return "bg-red-600";
  }

  return (
    <section className="mt-4 rounded-xl border border-white/15 bg-[#0f1728bf] p-4 shadow-[0_20px_40px_rgba(0,0,0,0.25)]">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/15 pb-3">
        <h3 className="text-sm font-semibold uppercase tracking-[0.2em]">{t.title}</h3>
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => setLang("tr")} className={`border px-2 py-1 text-xs ${lang === "tr" ? "bg-white text-black" : "border-white/30"}`}>TR</button>
          <button type="button" onClick={() => setLang("en")} className={`border px-2 py-1 text-xs ${lang === "en" ? "bg-white text-black" : "border-white/30"}`}>EN</button>
          <button type="button" onClick={() => exportReport("json")} className="border border-white/40 px-2 py-1 text-xs">{t.export} JSON</button>
          <button type="button" onClick={() => exportReport("pdf")} className="border border-white/40 px-2 py-1 text-xs">{t.export} PDF</button>
        </div>
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-2">
        {/* Technical Chart with Time Period Selector */}
        <article className="border border-white/15 p-3 xl:col-span-2">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <p className="text-xs uppercase tracking-[0.16em] text-white/70">{t.chart}</p>
            <div className="flex items-center gap-2">
              {(["1D", "1H", "4H", "1W", "1M"] as TimePeriod[]).map((period) => (
                <button
                  key={period}
                  type="button"
                  onClick={() => setTimePeriod(period)}
                  className={`border px-2 py-1 text-xs ${timePeriod === period ? "bg-white text-black" : "border-white/30"}`}
                >
                  {period}
                </button>
              ))}
            </div>
          </div>
          <div ref={chartRef} className="mt-3 w-full" />
          
          {/* Indicator Toggles */}
          <div className="mt-3 flex items-center gap-4 text-xs">
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={showIndicators.bollinger} onChange={(e) => setShowIndicators((p) => ({ ...p, bollinger: e.target.checked }))} />
              Bollinger Bands
            </label>
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={showIndicators.rsi} onChange={(e) => setShowIndicators((p) => ({ ...p, rsi: e.target.checked }))} />
              RSI
            </label>
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={showIndicators.macd} onChange={(e) => setShowIndicators((p) => ({ ...p, macd: e.target.checked }))} />
              MACD
            </label>
          </div>
        </article>

        {/* RSI Indicator */}
        {showIndicators.rsi && rsiData && (
          <article className="border border-white/15 p-3">
            <p className="text-xs uppercase tracking-[0.16em] text-white/70">RSI (14)</p>
            <ResponsiveContainer width="100%" height={120}>
              <LineChart data={rsiData}>
                <XAxis dataKey="date" hide />
                <YAxis domain={[0, 100]} tick={{ fill: "#eaf1ff", fontSize: 10 }} width={30} />
                <Tooltip contentStyle={{ background: "#0d1627", border: "1px solid rgba(255,255,255,0.15)", color: "#eaf1ff", fontSize: 11 }} />
                <Line type="monotone" dataKey="rsi" stroke="#c084fc" dot={false} strokeWidth={1.5} />
                <Line type="monotone" dataKey={() => 70} stroke="rgba(255,107,107,0.5)" dot={false} strokeDasharray="3 3" />
                <Line type="monotone" dataKey={() => 30} stroke="rgba(62,207,142,0.5)" dot={false} strokeDasharray="3 3" />
              </LineChart>
            </ResponsiveContainer>
          </article>
        )}

        {/* MACD Indicator */}
        {showIndicators.macd && macdData && (
          <article className="border border-white/15 p-3">
            <p className="text-xs uppercase tracking-[0.16em] text-white/70">MACD (12,26,9)</p>
            <ResponsiveContainer width="100%" height={120}>
              <BarChart data={macdData}>
                <XAxis dataKey="date" hide />
                <YAxis tick={{ fill: "#eaf1ff", fontSize: 10 }} width={40} />
                <Tooltip contentStyle={{ background: "#0d1627", border: "1px solid rgba(255,255,255,0.15)", color: "#eaf1ff", fontSize: 11 }} />
                <Bar dataKey="histogram" fill="rgba(107,164,255,0.5)" />
                <Line type="monotone" dataKey="macd" stroke="#3ecf8e" dot={false} strokeWidth={1} />
                <Line type="monotone" dataKey="signal" stroke="#ff6b6b" dot={false} strokeWidth={1} />
              </BarChart>
            </ResponsiveContainer>
          </article>
        )}

        {/* Financials */}
        <article className="border border-white/15 p-3">
          <p className="text-xs uppercase tracking-[0.16em] text-white/70">{t.financials}</p>
          <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
            <div className="border border-white/10 p-2">P/E: {String(financials?.valuation.trailingPE ?? "-")}</div>
            <div className="border border-white/10 p-2">P/B: {String(financials?.valuation.priceToBook ?? "-")}</div>
            <div className="border border-white/10 p-2">MCap: {String(financials?.valuation.marketCap ?? "-")}</div>
          </div>
          <div className="mt-3 overflow-x-auto text-xs">
            <table className="w-full min-w-[540px] border-collapse">
              <thead>
                <tr className="border-b border-white/15 text-white/65">
                  <th className="p-2 text-left">Date</th>
                  <th className="p-2 text-left">Revenue</th>
                  <th className="p-2 text-left">Gross</th>
                  <th className="p-2 text-left">Net</th>
                </tr>
              </thead>
              <tbody>
                {incomePreview.map((row, idx) => (
                  <tr key={idx} className="border-b border-white/10">
                    <td className="p-2">{String(row.endDate ?? row.date ?? "-")}</td>
                    <td className="p-2">{String(row.totalRevenue ?? "-")}</td>
                    <td className="p-2">{String(row.grossProfit ?? "-")}</td>
                    <td className="p-2">{String(row.netIncome ?? "-")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </article>

        {/* Comparison */}
        <article className="border border-white/15 p-3">
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs uppercase tracking-[0.16em] text-white/70">{t.compare}</p>
            <button type="button" onClick={refreshCompare} className="border border-white/40 px-2 py-1 text-xs">Load</button>
          </div>
          <div className="mt-2 grid grid-cols-3 gap-2">
            {[0, 1, 2].map((index) => (
              <select
                key={index}
                value={compareSymbols[index] ?? ""}
                onChange={(event) => {
                  const value = event.target.value;
                  setCompareSymbols((prev) => {
                    const next = [...prev];
                    next[index] = value;
                    return Array.from(new Set(next)).slice(0, 3);
                  });
                }}
                className="border border-white/30 bg-black px-2 py-1 text-xs"
              >
                {symbolOptions.slice(0, 250).map((item) => (
                  <option key={item} value={item}>{item}</option>
                ))}
              </select>
            ))}
          </div>
          <div className="mt-3 space-y-2 text-xs">
            {compareRows.length ? (
              compareRows.map((row) => (
                <div key={row.symbol} className="grid grid-cols-5 gap-1 border border-white/10 p-2">
                  <span>{row.symbol}</span>
                  <span>{fmt(row.price)}</span>
                  <span>{fmt(row.oneMonthChangePercent)}</span>
                  <span>{fmt(row.trailingPE ?? null)}</span>
                  <span>{fmt(row.priceToBook ?? null)}</span>
                </div>
              ))
            ) : (
              <p className="text-white/60">{t.noData}</p>
            )}
          </div>
          <p className="mt-2 text-xs text-white/60">Sector breadth: {fmt(sector?.averageDayChangePercent)} / {sector?.companyCount ?? 0}</p>
        </article>

        {/* Market Summary with Performance Table */}
        <article className="border border-white/15 p-3">
          <p className="text-xs uppercase tracking-[0.16em] text-white/70">{t.summary}</p>
          <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
            <div className="border border-white/10 p-2">
              <p className="mb-2 text-white/60">Top Gainers</p>
              {summary?.gainers.slice(0, 5).map((row) => (
                <p key={row.symbol} className="flex justify-between">
                  <span>{row.symbol}</span>
                  <span className="text-green-400">{fmt(row.oneMonthChangePercent)}%</span>
                </p>
              ))}
            </div>
            <div className="border border-white/10 p-2">
              <p className="mb-2 text-white/60">Top Losers</p>
              {summary?.losers.slice(0, 5).map((row) => (
                <p key={row.symbol} className="flex justify-between">
                  <span>{row.symbol}</span>
                  <span className="text-red-400">{fmt(row.oneMonthChangePercent)}%</span>
                </p>
              ))}
            </div>
            <div className="border border-white/10 p-2">
              <p className="mb-2 text-white/60">Top Volume</p>
              {summary?.byVolume.slice(0, 5).map((row) => (
                <p key={row.symbol} className="flex justify-between">
                  <span>{row.symbol}</span>
                  <span className="text-blue-400">{fmt(row.price)}</span>
                </p>
              ))}
            </div>
          </div>
        </article>

        {/* Heat Map */}
        <article className="border border-white/15 p-3">
          <p className="text-xs uppercase tracking-[0.16em] text-white/70">{t.heatmap}</p>
          <div className="mt-3 grid grid-cols-3 gap-2">
            {heatmapData.map((sector) => (
              <div
                key={sector.name}
                className={`${getHeatmapColor(sector.change)} p-3 text-center rounded`}
              >
                <p className="text-xs font-semibold">{sector.name}</p>
                <p className="text-lg font-bold">{sector.change > 0 ? "+" : ""}{sector.change.toFixed(1)}%</p>
              </div>
            ))}
          </div>
        </article>

        {/* Alerts */}
        <article className="border border-white/15 p-3">
          <p className="text-xs uppercase tracking-[0.16em] text-white/70">{t.alerts}</p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <select
              value={alertForm.direction}
              onChange={(event) => setAlertForm((prev) => ({ ...prev, direction: event.target.value as "above" | "below" }))}
              className="border border-white/30 bg-black px-2 py-1 text-xs"
            >
              <option value="above">Above</option>
              <option value="below">Below</option>
            </select>
            <input
              value={alertForm.targetPrice}
              onChange={(event) => setAlertForm((prev) => ({ ...prev, targetPrice: event.target.value }))}
              placeholder="Target"
              className="border border-white/30 bg-black px-2 py-1 text-xs"
            />
            <button type="button" onClick={addAlert} className="border border-white/40 px-2 py-1 text-xs">Add</button>
          </div>
          <div className="mt-3 space-y-2 text-xs">
            {alerts.map((item) => (
              <div key={item.id} className="flex items-center justify-between border border-white/10 p-2">
                <p>
                  {item.symbol} {item.direction} {fmt(item.targetPrice)} | now {fmt(item.currentPrice ?? null)} {item.triggered ? "(TRIGGERED)" : ""}
                </p>
                <button type="button" onClick={() => deleteAlert(item.id)} className="border border-white/30 px-2 py-1">X</button>
              </div>
            ))}
          </div>
        </article>

        {/* Portfolio with Charts */}
        <article className="border border-white/15 p-3 xl:col-span-2">
          <p className="text-xs uppercase tracking-[0.16em] text-white/70">{t.portfolio}</p>
          <div className="mt-2 grid gap-4 xl:grid-cols-2">
            <div>
              <textarea
                value={portfolioText}
                onChange={(event) => setPortfolioText(event.target.value)}
                rows={4}
                className="w-full border border-white/30 bg-black p-2 text-xs"
                placeholder="THYAO.IS,10,250\nAKBNK.IS,20,55"
              />
              <button type="button" onClick={evaluatePortfolio} className="mt-2 border border-white/40 px-2 py-1 text-xs">Calculate</button>
              {portfolioResult ? (
                <p className="mt-2 text-xs">Value: {fmt(portfolioResult.totalValue)} | PnL: {fmt(portfolioResult.totalPnl)}</p>
              ) : null}

              {/* Portfolio Pie Chart */}
              {portfolioPieData.length > 0 && (
                <div className="mt-4">
                  <p className="text-xs uppercase tracking-[0.16em] text-white/70 mb-2">{t.portfolioPie}</p>
                  <ResponsiveContainer width="100%" height={200}>
                    <PieChart>
                      <Pie data={portfolioPieData} cx="50%" cy="50%" outerRadius={80} dataKey="value" label={({ name, percent }) => `${name} ${((percent ?? 0) * 100).toFixed(0)}%`}>
                        {portfolioPieData.map((_, index) => (
                          <Cell key={`cell-${index}`} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip contentStyle={{ background: "#0d1627", border: "1px solid rgba(255,255,255,0.15)", color: "#eaf1ff", fontSize: 11 }} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>

            {/* Portfolio Performance Chart */}
            {portfolioHistory.length > 0 && (
              <div>
                <p className="text-xs uppercase tracking-[0.16em] text-white/70 mb-2">{t.portfolioChart}</p>
                <ResponsiveContainer width="100%" height={250}>
                  <AreaChart data={portfolioHistory}>
                    <XAxis dataKey="date" tick={{ fill: "#eaf1ff", fontSize: 9 }} />
                    <YAxis tick={{ fill: "#eaf1ff", fontSize: 10 }} width={60} />
                    <Tooltip contentStyle={{ background: "#0d1627", border: "1px solid rgba(255,255,255,0.15)", color: "#eaf1ff", fontSize: 11 }} />
                    <Area type="monotone" dataKey="value" stroke="#3ecf8e" fill="rgba(62,207,142,0.2)" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>
        </article>

        {/* Macro Indicators */}
        <article className="border border-white/15 p-3">
          <p className="text-xs uppercase tracking-[0.16em] text-white/70">{t.macro}</p>
          <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
            <div className="border border-white/10 p-2">USDTRY: {fmt(macro?.usdtry)}</div>
            <div className="border border-white/10 p-2">EURTRY: {fmt(macro?.eurtry)}</div>
            <div className="border border-white/10 p-2">US10Y: {fmt(macro?.us10yYield)}</div>
            <div className="border border-white/10 p-2">TR CPI YoY: {fmt(macro?.turkeyInflationYoY)}</div>
          </div>
        </article>

        {/* Global Markets */}
        <article className="border border-white/15 p-3 xl:col-span-2">
          <p className="text-xs uppercase tracking-[0.16em] text-white/70">{t.global}</p>
          <div className="mt-2 grid grid-cols-2 gap-2 text-xs md:grid-cols-5">
            {global.map((item) => (
              <div key={item.id} className="border border-white/10 p-2">
                <p className="text-white/65">{item.label}</p>
                <p>{fmt(item.price)}</p>
                <p className={item.changePercent && item.changePercent > 0 ? "text-green-400" : "text-red-400"}>
                  {fmt(item.changePercent)}%
                </p>
              </div>
            ))}
          </div>
        </article>

        {/* Paginated RSS News */}
        <article className="border border-white/15 p-3 xl:col-span-2">
          <div className="flex items-center justify-between">
            <p className="text-xs uppercase tracking-[0.16em] text-white/70">{t.rssNews}</p>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setRssPage((p) => Math.max(1, p - 1))}
                disabled={rssPage <= 1}
                className="border border-white/40 px-2 py-1 text-xs disabled:opacity-30"
              >
                Onceki
              </button>
              <span className="text-xs text-white/60">{rssPage} / {totalRssPages || 1}</span>
              <button
                type="button"
                onClick={() => setRssPage((p) => Math.min(totalRssPages, p + 1))}
                disabled={rssPage >= totalRssPages}
                className="border border-white/40 px-2 py-1 text-xs disabled:opacity-30"
              >
                Sonraki
              </button>
            </div>
          </div>
          {rssLoading ? (
            <p className="mt-3 text-xs text-white/60">Yukleniyor...</p>
          ) : (
            <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {paginatedRss.map((item, idx) => (
                <a
                  key={`${item.link}-${idx}`}
                  href={item.link}
                  target="_blank"
                  rel="noreferrer"
                  className="border border-white/10 p-3 hover:border-white/30 transition"
                >
                  <p className="text-[10px] uppercase text-white/50">{item.source}</p>
                  <p className="mt-1 text-sm font-medium line-clamp-2">{item.title}</p>
                  <p className="mt-1 text-[11px] text-white/40 line-clamp-2">{item.description}</p>
                  <p className="mt-2 text-[10px] text-white/30">{new Date(item.pubDate).toLocaleDateString()}</p>
                </a>
              ))}
            </div>
          )}
        </article>
      </div>
    </section>
  );
}