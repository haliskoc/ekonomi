"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  createChart,
  type IChartApi,
  type CandlestickData,
  type HistogramData,
  ColorType,
  CandlestickSeries,
  HistogramSeries,
} from "lightweight-charts";

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

type Props = {
  symbol: string;
  symbolOptions: string[];
};

type Lang = "tr" | "en";

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

export default function AdvancedWorkspace({ symbol, symbolOptions }: Props) {
  const [lang, setLang] = useState<Lang>(() => {
    if (typeof window === "undefined") {
      return "tr";
    }

    const stored = window.localStorage.getItem("ui-lang");
    return stored === "en" ? "en" : "tr";
  });
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
  const [portfolioResult, setPortfolioResult] = useState<{ totalValue: number; totalPnl: number } | null>(null);
  const [sector, setSector] = useState<{ averageDayChangePercent: number | null; companyCount: number } | null>(null);
  const chartRef = useRef<HTMLDivElement | null>(null);
  const chartApiRef = useRef<IChartApi | null>(null);

  const t = text[lang];

  useEffect(() => {
    localStorage.setItem("ui-lang", lang);
  }, [lang]);

  useEffect(() => {
    async function loadData(): Promise<void> {
      const [techRes, finRes, sumRes, macroRes, globalRes, alertRes, sectorRes] = await Promise.all([
        fetch(`/api/company/technicals?symbol=${encodeURIComponent(symbol)}&range=6mo&interval=1d`),
        fetch(`/api/company/financials?symbol=${encodeURIComponent(symbol)}`),
        fetch("/api/markets/summary?market=bist100"),
        fetch("/api/macro/indicators"),
        fetch("/api/markets/global"),
        fetch("/api/alerts"),
        fetch(`/api/sector/analyze?symbols=${encodeURIComponent(compareSymbols.join(","))}&sector=mixed`),
      ]);

      const techJson = (await techRes.json()) as { points?: TechnicalPoint[] };
      const finJson = (await finRes.json()) as FinancialsResponse;
      const sumJson = (await sumRes.json()) as { gainers: CompareRow[]; losers: CompareRow[]; byVolume: CompareRow[] };
      const macroJson = (await macroRes.json()) as { indicators?: Record<string, number | null> };
      const globalJson = (await globalRes.json()) as { markets?: Array<{ id: string; label: string; price: number | null; changePercent: number | null }> };
      const alertJson = (await alertRes.json()) as { alerts?: AlertItem[] };
      const sectorJson = (await sectorRes.json()) as { averageDayChangePercent?: number | null; companyCount?: number };

      setTechnicals(techJson.points ?? []);
      setFinancials(finJson);
      setSummary({
        gainers: sumJson.gainers ?? [],
        losers: sumJson.losers ?? [],
        byVolume: sumJson.byVolume ?? [],
      });
      setMacro(macroJson.indicators ?? null);
      setGlobal(globalJson.markets ?? []);
      setAlerts(alertJson.alerts ?? []);
      setSector({
        averageDayChangePercent: sectorJson.averageDayChangePercent ?? null,
        companyCount: sectorJson.companyCount ?? 0,
      });
    }

    void loadData();
  }, [symbol, compareSymbols]);

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
      height: 320,
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
  }, [technicals]);

  const incomePreview = useMemo(() => financials?.incomeStatement?.slice(0, 3) ?? [], [financials]);

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

    const data = (await response.json()) as { totals?: { totalValue: number; totalPnl: number } };
    setPortfolioResult(data.totals ?? null);
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
        <article className="border border-white/15 p-3">
          <p className="text-xs uppercase tracking-[0.16em] text-white/70">{t.chart}</p>
          <div ref={chartRef} className="mt-3 w-full" />
        </article>

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

        <article className="border border-white/15 p-3">
          <p className="text-xs uppercase tracking-[0.16em] text-white/70">{t.summary}</p>
          <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
            <div className="border border-white/10 p-2">
              <p className="mb-2 text-white/60">Top Gainers</p>
              {summary?.gainers.slice(0, 4).map((row) => (
                <p key={row.symbol}>{row.symbol}</p>
              ))}
            </div>
            <div className="border border-white/10 p-2">
              <p className="mb-2 text-white/60">Top Losers</p>
              {summary?.losers.slice(0, 4).map((row) => (
                <p key={row.symbol}>{row.symbol}</p>
              ))}
            </div>
            <div className="border border-white/10 p-2">
              <p className="mb-2 text-white/60">Top Volume</p>
              {summary?.byVolume.slice(0, 4).map((row) => (
                <p key={row.symbol}>{row.symbol}</p>
              ))}
            </div>
          </div>
        </article>

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

        <article className="border border-white/15 p-3">
          <p className="text-xs uppercase tracking-[0.16em] text-white/70">{t.portfolio}</p>
          <textarea
            value={portfolioText}
            onChange={(event) => setPortfolioText(event.target.value)}
            rows={4}
            className="mt-2 w-full border border-white/30 bg-black p-2 text-xs"
            placeholder="THYAO.IS,10,250\nAKBNK.IS,20,55"
          />
          <button type="button" onClick={evaluatePortfolio} className="mt-2 border border-white/40 px-2 py-1 text-xs">Calculate</button>
          {portfolioResult ? (
            <p className="mt-2 text-xs">Value: {fmt(portfolioResult.totalValue)} | PnL: {fmt(portfolioResult.totalPnl)}</p>
          ) : null}
        </article>

        <article className="border border-white/15 p-3">
          <p className="text-xs uppercase tracking-[0.16em] text-white/70">{t.macro}</p>
          <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
            <div className="border border-white/10 p-2">USDTRY: {fmt(macro?.usdtry)}</div>
            <div className="border border-white/10 p-2">EURTRY: {fmt(macro?.eurtry)}</div>
            <div className="border border-white/10 p-2">US10Y: {fmt(macro?.us10yYield)}</div>
            <div className="border border-white/10 p-2">TR CPI YoY: {fmt(macro?.turkeyInflationYoY)}</div>
          </div>
        </article>

        <article className="border border-white/15 p-3 xl:col-span-2">
          <p className="text-xs uppercase tracking-[0.16em] text-white/70">{t.global}</p>
          <div className="mt-2 grid grid-cols-2 gap-2 text-xs md:grid-cols-5">
            {global.map((item) => (
              <div key={item.id} className="border border-white/10 p-2">
                <p className="text-white/65">{item.label}</p>
                <p>{fmt(item.price)}</p>
                <p>{fmt(item.changePercent)}%</p>
              </div>
            ))}
          </div>
        </article>
      </div>
    </section>
  );
}
