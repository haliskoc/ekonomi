"use client";

import type { NewsSentimentBreakdown } from "@/lib/dashboard";

type NewsSentimentChartProps = {
  sentiment: NewsSentimentBreakdown;
};

const ITEMS = [
  { key: "positive", label: "Pozitif", color: "bg-emerald-400/80" },
  { key: "neutral", label: "Notr", color: "bg-slate-300/70" },
  { key: "negative", label: "Negatif", color: "bg-rose-400/80" },
] as const;

export default function NewsSentimentChart({ sentiment }: NewsSentimentChartProps) {
  const total = sentiment.positive + sentiment.neutral + sentiment.negative;

  return (
    <div className="rounded-2xl border border-white/10 bg-black/20 p-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-white/50">Haber Sentimenti</p>
          <p className="mt-2 text-lg font-semibold text-white">{total} baslik analiz edildi</p>
        </div>
        <div className="text-right text-xs text-white/45">
          <p>Kaynak: son analiz</p>
          <p>Skor: baslik bazli</p>
        </div>
      </div>

      <div className="mt-4 h-3 overflow-hidden rounded-full bg-white/8">
        {ITEMS.map((item) => {
          const count = sentiment[item.key];
          const width = total ? `${(count / total) * 100}%` : "0%";
          return <div key={item.key} className={`h-full ${item.color} inline-block`} style={{ width }} />;
        })}
      </div>

      <div className="mt-4 grid gap-2 sm:grid-cols-3">
        {ITEMS.map((item) => {
          const count = sentiment[item.key];
          const ratio = total ? ((count / total) * 100).toFixed(0) : "0";
          return (
            <div key={item.key} className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
              <p className="text-xs uppercase tracking-[0.12em] text-white/45">{item.label}</p>
              <p className="mt-2 text-lg font-semibold text-white">{count}</p>
              <p className="text-xs text-white/45">%{ratio}</p>
            </div>
          );
        })}
      </div>
    </div>
  );
}
