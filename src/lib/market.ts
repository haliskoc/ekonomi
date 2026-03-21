export type NewsItem = {
  title: string;
  link: string;
  pubDate: string;
  source: string;
};

export type MarketSnapshot = {
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

export type AnalysisOutput = {
  summary: string;
  source: "heuristic" | "openai";
  baseCase: string;
  bullCase: string;
  bearCase: string;
  keyDrivers: string[];
  keyRisks: string[];
  disclaimer: string;
};

const USER_AGENT = "Mozilla/5.0 (compatible; EkonomiBot/1.0; +https://example.com)";

function extractTag(text: string, tag: string): string {
  const regex = new RegExp(`<${tag}>([\\s\\S]*?)<\\/${tag}>`, "i");
  const match = text.match(regex);
  return match ? decodeXml(match[1].trim()) : "";
}

function decodeXml(value: string): string {
  return value
    .replace(/<!\[CDATA\[|\]\]>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function scoreHeadlineSentiment(title: string): number {
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
  ];

  let score = 0;
  for (const w of positiveWords) {
    if (lower.includes(w)) {
      score += 1;
    }
  }
  for (const w of negativeWords) {
    if (lower.includes(w)) {
      score -= 1;
    }
  }
  return score;
}

export async function fetchCompanyNews(input: string, limit = 7): Promise<NewsItem[]> {
  const query = encodeURIComponent(input);
  const url = `https://news.google.com/rss/search?q=${query}%20stock&hl=en-US&gl=US&ceid=US:en`;

  const response = await fetch(url, {
    headers: { "User-Agent": USER_AGENT },
    next: { revalidate: 900 },
  });

  if (!response.ok) {
    throw new Error(`News fetch failed: ${response.status}`);
  }

  const xml = await response.text();
  const rawItems = xml.match(/<item>[\s\S]*?<\/item>/g) ?? [];

  return rawItems.slice(0, limit).map((raw) => ({
    title: extractTag(raw, "title"),
    link: extractTag(raw, "link"),
    pubDate: extractTag(raw, "pubDate"),
    source: extractTag(raw, "source") || "Google News",
  }));
}

export async function fetchMarketSnapshot(symbol: string): Promise<MarketSnapshot> {
  const quoteUrl = `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${encodeURIComponent(symbol)}`;
  const chartUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=1mo&interval=1d`;

  const [quoteRes, chartRes] = await Promise.all([
    fetch(quoteUrl, { headers: { "User-Agent": USER_AGENT }, next: { revalidate: 900 } }),
    fetch(chartUrl, { headers: { "User-Agent": USER_AGENT }, next: { revalidate: 900 } }),
  ]);

  if (!quoteRes.ok) {
    throw new Error(`Quote fetch failed: ${quoteRes.status}`);
  }

  const quoteJson = await quoteRes.json();
  const quote = quoteJson?.quoteResponse?.result?.[0];

  if (!quote) {
    throw new Error("Symbol not found.");
  }

  let oneMonthChangePercent: number | null = null;
  let dailyPrices: { date: string; close: number }[] = [];
  if (chartRes.ok) {
    const chartJson = await chartRes.json();
    const chart = chartJson?.chart?.result?.[0];
    const closes: number[] = chartJson?.chart?.result?.[0]?.indicators?.quote?.[0]?.close ?? [];
    const validCloses = closes.filter((v) => typeof v === "number");
    if (validCloses.length >= 2) {
      const first = validCloses[0];
      const last = validCloses[validCloses.length - 1];
      if (first !== 0) {
        oneMonthChangePercent = ((last - first) / first) * 100;
      }
    }

    const timestamps: number[] = chart?.timestamp ?? [];
    dailyPrices = closes
      .map((close, index) => {
        const ts = timestamps[index];
        if (typeof close !== "number" || typeof ts !== "number") {
          return null;
        }

        return {
          date: new Date(ts * 1000).toISOString().slice(0, 10),
          close,
        };
      })
      .filter((entry): entry is { date: string; close: number } => entry !== null)
      .slice(-22);
  }

  return {
    symbol: quote.symbol,
    currency: quote.currency || "USD",
    regularMarketPrice: quote.regularMarketPrice || 0,
    previousClose: quote.regularMarketPreviousClose || quote.regularMarketPrice || 0,
    dayChangePercent: quote.regularMarketChangePercent || 0,
    oneMonthChangePercent,
    marketState: quote.marketState || "UNKNOWN",
    dailyPrices,
  };
}

type OpenAiArgs = {
  company: string;
  symbol: string;
  market: MarketSnapshot;
  news: NewsItem[];
};

async function tryOpenAiScenario(args: OpenAiArgs): Promise<AnalysisOutput | null> {
  const key = process.env.OPENAI_API_KEY;
  if (!key) {
    return null;
  }

  const compactNews = args.news.map((n, idx) => `${idx + 1}. ${n.title}`).join("\n");

  const prompt = [
    "You are an educational market analyst. Never give investment advice or buy/sell/hold instructions.",
    `Company: ${args.company} (${args.symbol})`,
    `Price: ${args.market.regularMarketPrice} ${args.market.currency}`,
    `Daily change: ${args.market.dayChangePercent.toFixed(2)}%`,
    `1M change: ${args.market.oneMonthChangePercent?.toFixed(2) ?? "N/A"}%`,
    "Recent headlines:",
    compactNews,
    "Return strict JSON with keys: summary, baseCase, bullCase, bearCase, keyDrivers, keyRisks.",
    "keyDrivers and keyRisks must be arrays of short strings.",
  ].join("\n");

  const requestBody = JSON.stringify({
    model: "gpt-4.1-mini",
    input: prompt,
    text: {
      format: {
        type: "json_schema",
        name: "analysis",
        schema: {
          type: "object",
          additionalProperties: false,
          properties: {
            summary: { type: "string" },
            baseCase: { type: "string" },
            bullCase: { type: "string" },
            bearCase: { type: "string" },
            keyDrivers: { type: "array", items: { type: "string" } },
            keyRisks: { type: "array", items: { type: "string" } },
          },
          required: ["summary", "baseCase", "bullCase", "bearCase", "keyDrivers", "keyRisks"],
        },
      },
    },
  });

  let res: Response | null = null;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const candidate = await fetch("https://api.openai.com/v1/responses", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${key}`,
          "Content-Type": "application/json",
        },
        body: requestBody,
        signal: AbortSignal.timeout(10000),
      });
      if (candidate.ok) {
        res = candidate;
        break;
      }

      // Retry once for transient upstream failures.
      if (candidate.status >= 500 && attempt === 0) {
        continue;
      }
      return null;
    } catch {
      if (attempt === 0) {
        continue;
      }
      return null;
    }
  }

  if (!res) {
    return null;
  }

  const json = await res.json();
  const raw = json?.output?.[0]?.content?.[0]?.text;
  if (!raw) {
    return null;
  }

  let parsed: {
    summary: string;
    baseCase: string;
    bullCase: string;
    bearCase: string;
    keyDrivers: string[];
    keyRisks: string[];
  };

  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }

  const banned = /\b(buy|sell|hold|target price|guarantee)\b/i;
  const textBlob = `${parsed.summary} ${parsed.baseCase} ${parsed.bullCase} ${parsed.bearCase}`;
  if (banned.test(textBlob)) {
    return null;
  }

  return {
    summary: parsed.summary,
    source: "openai",
    baseCase: parsed.baseCase,
    bullCase: parsed.bullCase,
    bearCase: parsed.bearCase,
    keyDrivers: parsed.keyDrivers,
    keyRisks: parsed.keyRisks,
    disclaimer:
      "Educational commentary only. This is not financial advice and may be incomplete or inaccurate.",
  };
}

function buildHeuristicScenario(company: string, market: MarketSnapshot, news: NewsItem[]): AnalysisOutput {
  const sentiment = news.reduce((acc, n) => acc + scoreHeadlineSentiment(n.title), 0);
  const daily = market.dayChangePercent;
  const monthly = market.oneMonthChangePercent ?? 0;

  const trendLabel = monthly > 4 ? "positive trend" : monthly < -4 ? "negative trend" : "sideways trend";
  const momentumLabel = daily > 1.2 ? "short-term momentum is improving" : daily < -1.2 ? "short-term pressure is visible" : "short-term moves are mixed";

  const summary = `${company} is showing a ${trendLabel}; ${momentumLabel}. Recent headlines suggest sentiment score ${sentiment >= 0 ? "above neutral" : "below neutral"}.`;

  const baseCase =
    sentiment >= 0
      ? "If recent operational updates remain stable, the company could continue with moderate performance while volatility stays elevated."
      : "If recent concerns persist, performance may stay range-bound with sensitivity to new headlines and earnings updates.";

  const bullCase =
    sentiment > 1
      ? "If execution quality improves and macro conditions stay supportive, upside could come from stronger revenue expectations and multiple expansion."
      : "If one or two catalysts turn favorable (new contracts, margin improvement, better guidance), upside pressure may build.";

  const bearCase =
    sentiment < -1
      ? "If negative headlines convert into weaker fundamentals, downside risk can increase through earnings revisions and reduced investor confidence."
      : "If macro conditions tighten or guidance weakens, downside may come from valuation compression and slower growth expectations.";

  const keyDrivers = [
    "Upcoming earnings and management guidance",
    "Sector-wide demand and macro trend",
    "Recent one-month price trend and volatility regime",
    "Headline flow quality over the next 2-4 weeks",
  ];

  const keyRisks = [
    "Headline sentiment can reverse quickly",
    "Single-source news may miss critical context",
    "Macro shocks can dominate company-specific factors",
    "Model output reflects scenarios, not certainty",
  ];

  return {
    summary,
    source: "heuristic",
    baseCase,
    bullCase,
    bearCase,
    keyDrivers,
    keyRisks,
    disclaimer:
      "Educational commentary only. This is not financial advice and may be incomplete or inaccurate.",
  };
}

export async function buildAnalysis(company: string, symbol: string): Promise<{
  market: MarketSnapshot;
  news: NewsItem[];
  analysis: AnalysisOutput;
}> {
  const [market, news] = await Promise.all([fetchMarketSnapshot(symbol), fetchCompanyNews(`${company} ${symbol}`)]);

  const ai = await tryOpenAiScenario({ company, symbol, market, news });
  const analysis = ai ?? buildHeuristicScenario(company, market, news);

  return { market, news, analysis };
}
