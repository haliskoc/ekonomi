import { NextRequest } from "next/server";
import { z } from "zod";
import { XMLParser } from "fast-xml-parser";
import { createRequestId, getClientIp, jsonError, jsonSuccess } from "@/lib/api";
import { checkRateLimit } from "@/lib/rateLimit";
import { DEFAULT_RSS_FEEDS, type RssFeedSource } from "@/lib/rssSources";
import { fetchFinnhubMarketNews } from "@/lib/finnhub";
import { fetchAllNews, getNewsServiceStatus, type NewsItem } from "@/lib/newsService";

type RssItem = {
  title: string;
  link: string;
  pubDate: string;
  source: string;
  sourceId: string;
  description?: string;
  image?: string;
};

const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
const RATE_LIMIT_WINDOW_MS = 60 * 1000;
const RATE_LIMIT_COUNT = 20;
const FETCH_TIMEOUT_MS = 10000; // 10s timeout - daha güvenilir
const BATCH_SIZE = 10; // Batch başına kaç feed fetch edilecek

// fast-xml-parser configuration
const xmlParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  textNodeName: "#text",
  parseAttributeValue: false,
  parseTagValue: false,
  trimValues: true,
  processEntities: true,
  stopNodes: undefined,
});

// Helper to extract text value from field (handles CDATA, objects, arrays)
function extractText(value: any): string {
  if (!value) return "";
  if (typeof value === "string") return value;
  if (typeof value === "object") {
    // Handle CDATA wrapper
    if (value.__cdata) return value.__cdata;
    // Handle text node
    if (value["#text"]) return value["#text"];
    // Handle array
    if (Array.isArray(value) && value.length > 0) return extractText(value[0]);
    // Fallback to JSON string
    return JSON.stringify(value);
  }
  return String(value);
}

const querySchema = z.object({
  lang: z.enum(["tr", "en", "all"]).default("all"),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  sources: z.string().optional(),
  includeNewsApis: z.coerce.boolean().default(false),
});

// HTML entity decode (Node.js compatible)
function decodeHtmlEntities(value: any): string {
  if (!value) return "";
  const str = typeof value === "string" ? value : JSON.stringify(value);
  return str
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/&#x2F;/g, "/")
    .replace(/&nbsp;/g, " ")
    .replace(/&hellip;/g, "...")
    .replace(/<!\[CDATA\[|\]\]>/g, "")
    .trim();
}

function stripHtml(value: any): string {
  if (!value) return "";
  const str = typeof value === "string" ? value : JSON.stringify(value);
  return decodeHtmlEntities(str.replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
}

function parseRssItems(xml: string, source: RssFeedSource): RssItem[] {
  try {
    const parsed = xmlParser.parse(xml);
    
    // RSS 2.0 format
    if (parsed.rss?.channel?.item) {
      const items = Array.isArray(parsed.rss.channel.item) 
        ? parsed.rss.channel.item 
        : [parsed.rss.channel.item];
      
      return items.slice(0, 15).map((item: any) => {
        // Extract image from various sources
        let imageUrl = "";
        if (item["media:content"]) {
          imageUrl = item["media:content"]["@_url"] || item["media:content"]?.url || "";
        } else if (item["media:thumbnail"]) {
          imageUrl = item["media:thumbnail"]["@_url"] || item["media:thumbnail"]?.url || "";
        } else if (item.enclosure?.["@_url"]) {
          imageUrl = item.enclosure["@_url"];
        }
        
        const description = item["content:encoded"] || item.description || "";
        
        return {
          title: extractText(item.title) || "Untitled",
          link: extractText(item.link) || "",
          pubDate: extractText(item.pubDate) || new Date().toISOString(),
          source: source.name,
          sourceId: source.id,
          description: stripHtml(extractText(description)).slice(0, 260),
          image: imageUrl || undefined,
        };
      });
    }
    
    // Atom format
    if (parsed.feed?.entry) {
      const entries = Array.isArray(parsed.feed.entry) 
        ? parsed.feed.entry 
        : [parsed.feed.entry];
      
      return entries.slice(0, 15).map((entry: any) => {
        // Atom link extraction
        let link = "";
        if (Array.isArray(entry.link)) {
          const alternate = entry.link.find((l: any) => l["@_rel"] === "alternate");
          link = alternate?.["@_href"] || entry.link[0]?.["@_href"] || "";
        } else if (entry.link) {
          link = entry.link["@_href"] || entry.link.href || "";
        }
        
        // Extract summary/content
        const content = entry.content || entry.summary || "";
        
        return {
          title: extractText(entry.title) || "Untitled",
          link: extractText(link),
          pubDate: extractText(entry.updated || entry.published) || new Date().toISOString(),
          source: source.name,
          sourceId: source.id,
          description: stripHtml(extractText(content)).slice(0, 260),
          image: entry.media?.content?.["@_url"] || entry.media?.thumbnail?.["@_url"] || "",
        };
      });
    }
    
    return [];
  } catch (error) {
    console.warn(`XML parse error for ${source.name}:`, error);
    return [];
  }
}

async function fetchSingleFeed(source: RssFeedSource): Promise<RssItem[]> {
  try {
    const response = await fetch(source.url, {
      headers: {
        "User-Agent": USER_AGENT,
        Accept: "application/rss+xml, application/atom+xml, application/xml, text/xml, */*",
        "Accept-Language": "en-US,en;q=0.9,tr;q=0.8",
      },
      redirect: "follow",
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });

    if (!response.ok) {
      console.warn(`RSS fetch failed for ${source.name}: ${response.status}`);
      return [];
    }

    const xml = await response.text();
    const items = parseRssItems(xml, source).filter((item) => item.link);
    return items;
  } catch (error) {
    console.warn(`RSS fetch error for ${source.name}:`, error);
    return [];
  }
}

// Batch fetch with controlled concurrency
async function fetchFeedsInBatches(
  sources: RssFeedSource[],
  batchSize: number = BATCH_SIZE
): Promise<RssItem[]> {
  // Sort by priority first (lower number = higher priority)
  const sortedSources = [...sources].sort((a, b) => a.priority - b.priority);
  
  const allItems: RssItem[] = [];
  
  // Process in batches
  for (let i = 0; i < sortedSources.length; i += batchSize) {
    const batch = sortedSources.slice(i, i + batchSize);
    const batchPromises = batch.map((source) => fetchSingleFeed(source));
    const batchResults = await Promise.allSettled(batchPromises);
    
    for (const result of batchResults) {
      if (result.status === "fulfilled") {
        allItems.push(...result.value);
      }
    }
    
    // Small delay between batches to avoid overwhelming servers
    if (i + batchSize < sortedSources.length) {
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }
  
  return allItems;
}

async function fetchFinnhubNewsAsRss(): Promise<RssItem[]> {
  try {
    const categories = ["general", "forex", "crypto", "merger"];
    const allNews: RssItem[] = [];

    for (const category of categories) {
      const news = await fetchFinnhubMarketNews(category);
      for (const item of news) {
        allNews.push({
          title: item.headline,
          link: item.url,
          pubDate: new Date(item.datetime * 1000).toISOString(),
          source: `Finnhub - ${category.charAt(0).toUpperCase() + category.slice(1)}`,
          sourceId: `finnhub-${category}`,
          description: item.summary?.slice(0, 260),
          image: item.image || undefined,
        });
      }
    }

    return allNews.slice(0, 30);
  } catch (error) {
    console.warn("Finnhub news fetch failed:", error);
    return [];
  }
}

export async function GET(request: NextRequest) {
  const requestId = createRequestId();
  const clientIp = getClientIp(request);
  const rate = checkRateLimit({
    key: `rss-feeds:${clientIp}`,
    limit: RATE_LIMIT_COUNT,
    windowMs: RATE_LIMIT_WINDOW_MS,
  });

  if (!rate.allowed) {
    return jsonError("too many requests", 429, {
      requestId,
      code: "RATE_LIMITED",
      headers: { "retry-after": String(rate.retryAfterSeconds) },
    });
  }

  try {
    const parsedQuery = querySchema.safeParse({
      lang: request.nextUrl.searchParams.get("lang") || "all",
      limit: request.nextUrl.searchParams.get("limit") || "50",
      sources: request.nextUrl.searchParams.get("sources") || undefined,
    });

    if (!parsedQuery.success) {
      return jsonError(parsedQuery.error.issues[0]?.message ?? "invalid query", 400, {
        requestId,
        code: "INVALID_QUERY",
      });
    }

    const { lang, limit, sources, includeNewsApis } = parsedQuery.data;

    // Filter sources by language or specific IDs
    let filteredSources = DEFAULT_RSS_FEEDS;
    if (sources) {
      const sourceIds = sources.split(",").map((s) => s.trim());
      filteredSources = DEFAULT_RSS_FEEDS.filter((s) => sourceIds.includes(s.id));
    } else if (lang !== "all") {
      filteredSources = DEFAULT_RSS_FEEDS.filter((s) => s.language === lang);
    }

    // Fetch RSS feeds in batches (with priority ordering)
    const rssItems = await fetchFeedsInBatches(filteredSources, BATCH_SIZE);
    const finnhubPromise = fetchFinnhubNewsAsRss();
    
    // Optionally fetch from news APIs
    const newsApiPromise = includeNewsApis
      ? fetchAllNews(lang === "tr" ? "ekonomi finans" : "economy finance", lang === "all" ? "en" : lang, Math.min(limit, 30))
      : Promise.resolve({ items: [], sources: [] });

    const [finnhubResults, newsApiResults] = await Promise.all([
      finnhubPromise,
      newsApiPromise,
    ]);

    // Collect all items
    const allItems: RssItem[] = [...finnhubResults, ...rssItems];
    
    // Add news API items
    for (const item of newsApiResults.items) {
      allItems.push({
        title: item.title,
        link: item.link,
        pubDate: item.pubDate,
        source: item.source,
        sourceId: "newsapi",
        description: item.description,
        image: item.image,
      });
    }

    // Deduplicate by link
    const dedup = new Set<string>();
    const uniqueItems = allItems.filter((item) => {
      const key = item.link.toLowerCase();
      if (dedup.has(key)) return false;
      dedup.add(key);
      return true;
    });

    // Sort by date (newest first)
    uniqueItems.sort((a, b) => {
      const dateA = new Date(a.pubDate).getTime();
      const dateB = new Date(b.pubDate).getTime();
      return dateB - dateA;
    });

    // Limit results
    const limitedItems = uniqueItems.slice(0, limit);

    // Calculate stats - estimate based on items received
    const uniqueSourceIds = new Set(allItems.map((i) => i.sourceId));
    const activeSources = uniqueSourceIds.size;
    const failedSources = Math.max(0, filteredSources.length - activeSources);
    const newsApiStatus = getNewsServiceStatus();

    return jsonSuccess(
      {
        items: limitedItems,
        stats: {
          totalItems: limitedItems.length,
          totalSources: filteredSources.length,
          activeSources,
          failedSources,
          finnhubItems: finnhubResults.length,
          newsApiItems: newsApiResults.items.length,
          newsApiSources: newsApiResults.sources,
          language: lang,
          newsApiStatus: includeNewsApis ? newsApiStatus : undefined,
        },
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
