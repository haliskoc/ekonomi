"use client";

type PricePoint = {
  date: string;
  close: number;
};

type PriceChartProps = {
  data: PricePoint[];
  currency: string;
  currentPrice: number;
  dayChangePercent: number;
  oneMonthChangePercent: number | null;
};

function formatCompact(value: number): string {
  return new Intl.NumberFormat("tr-TR", {
    maximumFractionDigits: value >= 100 ? 1 : 2,
  }).format(value);
}

function getStrokeColor(last: number, first: number): string {
  return last >= first ? "#7dd3fc" : "#fda4af";
}

export default function PriceChart({
  data,
  currency,
  currentPrice,
  dayChangePercent,
  oneMonthChangePercent,
}: PriceChartProps) {
  if (!data.length) {
    return (
      <div className="rounded-2xl border border-white/10 bg-black/20 p-5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-white/50">Fiyat Grafigi</p>
            <p className="mt-2 text-xl font-semibold text-white">
              {formatCompact(currentPrice)} {currency}
            </p>
          </div>
          <div className="text-right text-xs text-white/50">
            <p>Gunluk {dayChangePercent.toFixed(2)}%</p>
            <p>1A {oneMonthChangePercent === null ? "N/A" : `${oneMonthChangePercent.toFixed(2)}%`}</p>
          </div>
        </div>
        <div className="mt-4 rounded-xl border border-dashed border-white/10 px-4 py-10 text-center text-sm text-white/45">
          Bu sembol icin cizilecek fiyat verisi gelmedi.
        </div>
      </div>
    );
  }

  const width = 640;
  const height = 240;
  const paddingX = 18;
  const paddingY = 18;
  const closes = data.map((point) => point.close);
  const min = Math.min(...closes);
  const max = Math.max(...closes);
  const range = Math.max(max - min, 1e-6);

  const points = data.map((point, index) => {
    const x = paddingX + (index / Math.max(data.length - 1, 1)) * (width - paddingX * 2);
    const y = height - paddingY - ((point.close - min) / range) * (height - paddingY * 2);
    return { x, y, value: point.close, date: point.date };
  });

  const linePath = points.map((point, index) => `${index === 0 ? "M" : "L"} ${point.x} ${point.y}`).join(" ");
  const areaPath = `${linePath} L ${points.at(-1)?.x ?? width - paddingX} ${height - paddingY} L ${points[0]?.x ?? paddingX} ${
    height - paddingY
  } Z`;
  const stroke = getStrokeColor(closes.at(-1) ?? currentPrice, closes[0] ?? currentPrice);
  const minLabel = formatCompact(min);
  const maxLabel = formatCompact(max);
  const lastPoint = points.at(-1);

  return (
    <div className="rounded-2xl border border-white/10 bg-black/20 p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-white/50">Fiyat Grafigi</p>
          <p className="mt-2 text-2xl font-semibold text-white">
            {formatCompact(currentPrice)} {currency}
          </p>
          <p className="mt-1 text-xs text-white/45">Son 1 ay kapanis hareketi</p>
        </div>
        <div className="grid grid-cols-2 gap-2 text-xs sm:min-w-[220px]">
          <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
            <p className="text-white/45">Gunluk</p>
            <p className={`mt-1 text-sm font-semibold ${dayChangePercent >= 0 ? "text-emerald-300" : "text-rose-300"}`}>
              {dayChangePercent.toFixed(2)}%
            </p>
          </div>
          <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
            <p className="text-white/45">1 Ay</p>
            <p
              className={`mt-1 text-sm font-semibold ${
                (oneMonthChangePercent ?? 0) >= 0 ? "text-sky-300" : "text-orange-300"
              }`}
            >
              {oneMonthChangePercent === null ? "N/A" : `${oneMonthChangePercent.toFixed(2)}%`}
            </p>
          </div>
        </div>
      </div>

      <div className="mt-4 overflow-hidden rounded-2xl border border-white/10 bg-[linear-gradient(180deg,rgba(10,16,26,0.92),rgba(8,11,18,0.6))]">
        <svg viewBox={`0 0 ${width} ${height}`} className="h-64 w-full">
          <defs>
            <linearGradient id="price-chart-fill" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor={stroke} stopOpacity="0.35" />
              <stop offset="100%" stopColor={stroke} stopOpacity="0.02" />
            </linearGradient>
          </defs>
          {[0.2, 0.4, 0.6, 0.8].map((ratio) => (
            <line
              key={ratio}
              x1={paddingX}
              x2={width - paddingX}
              y1={paddingY + (height - paddingY * 2) * ratio}
              y2={paddingY + (height - paddingY * 2) * ratio}
              stroke="rgba(255,255,255,0.08)"
              strokeDasharray="3 6"
            />
          ))}
          <path d={areaPath} fill="url(#price-chart-fill)" />
          <path d={linePath} fill="none" stroke={stroke} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
          {lastPoint ? (
            <>
              <circle cx={lastPoint.x} cy={lastPoint.y} r="5" fill={stroke} />
              <circle cx={lastPoint.x} cy={lastPoint.y} r="11" fill={stroke} fillOpacity="0.15" />
            </>
          ) : null}
        </svg>
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-3 text-xs text-white/50">
        <div className="flex items-center gap-3">
          <span>Min {minLabel}</span>
          <span>Maks {maxLabel}</span>
        </div>
        <div className="flex items-center gap-3">
          <span>{data[0]?.date}</span>
          <span>{data.at(-1)?.date}</span>
        </div>
      </div>
    </div>
  );
}
