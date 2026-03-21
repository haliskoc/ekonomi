import { NextRequest } from "next/server";
import { z } from "zod";
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

const querySchema = z.object({
  lang: z.enum(["tr", "en", "all"]).default("all"),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  sources: z.string().optional(),
  includeNewsApis: z.coerce.boolean().default(false),
});

function decodeXml(value: string): string {
  return value
    .replace(/<!\[CDATA\[|\]\]>/g, "")
    .replace(/&/g, "&")
    .replace(/</g, "<")
    .replace(/>/g, ">")
    .replace(/"/g, '"')
    .replace(/&#39;/g, "'")
    .trim();
}

function getTag(text: string, tag: string): string {
  const match = text.match(new RegExp(`<${tag}>([\\s\\S]*?)<\\/${tag}>`, "i"));
  return match ? decodeXml(match[1]) : "";
}

function stripHtml(value: string): string {
  return decodeXml(value.replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
}

function extractDescription(block: string, isAtom: boolean): string {
  if (isAtom) {
    const atomContent =
      block.match(/<summary[^>]*>([\s\S]*?)<\/summary>/i)?.[1] ??
      block.match(/<content[^>]*>([\s\S]*?)<\/content>/i)?.[1] ??
      "";
    return stripHtml(atomContent).slice(0, 260);
  }
  const rssContent = getTag(block, "content:encoded") || getTag(block, "description");
  return stripHtml(rssContent).slice(0, 260);
}

function extractImageUrl(block: string): string {
  const mediaContent = block.match(/<media:content[^>]*url=["']([^"']+)["'][^>]*>/i)?.[1];
  if (mediaContent) return decodeXml(mediaContent);

  const mediaThumb = block.match(/<media:thumbnail[^>]*url=["']([^"']+)["'][^>]*>/i)?.[1];
  if (mediaThumb) return decodeXml(mediaThumb);

  const enclosureImage =
    block.match(/<enclosure[^>]*type=["'][^"']*image[^"']*["'][^>]*url=["']([^"']+)["'][^>]*>/i)?.[1] ??
    block.match(/<enclosure[^>]*url=["']([^"']+)["'][^>]*type=["'][^"']*image[^"']*["'][^>]*>/i)?.[1];
  if (enclosureImage) return decodeXml(enclosureImage);

  const htmlImage = block.match(/<img[^>]*src=["']([^"']+)["'][^>]*>/i)?.[1];
  return htmlImage ? decodeXml(htmlImage) : "";
}

function parseRssItems(xml: string, source: RssFeedSource): RssItem[] {
  const rssItems = xml.match(/<item>[\s\S]*?<\/item>/gi) ?? [];
  if (rssItems.length) {
    return rssItems.slice(0, 15).map((item) => ({
      title: getTag(item, "title") || "Untitled",
      link: getTag(item, "link"),
      pubDate: getTag(item, "pubDate") || new Date().toISOString(),
      source: source.name,
      sourceId: source.id,
      description: extractDescription(item, false),
      image: extractImageUrl(item) || undefined,
    }));
  }

  const atomItems = xml.match(/<entry>[\s\S]*?<\/entry>/gi) ?? [];
  return atomItems.slice(0, 15).map((entry) => {
    const title = getTag(entry, "title") || "Untitled";
    const updated = getTag(entry, "updated") || getTag(entry, "published") || new Date().toISOString();
    const linkMatch = entry.match(/<link[^>]*href=["']([^"']+)["'][^>]*>/i);
    return {
      title,
      link: linkMatch ? decodeXml(linkMatch[1]) : "",
      pubDate: updated,
      source: source.name,
      sourceId: source.id,
      description: extractDescription(entry, true),
      image: extractImageUrl(entry) || undefined,
    };
  });
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
      signal: AbortSignal.timeout(6000),
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

    // Fetch RSS feeds in parallel
    const rssPromises = filteredSources.map((source) => fetchSingleFeed(source));
    const finnhubPromise = fetchFinnhubNewsAsRss();
    
    // Optionally fetch from news APIs
    const newsApiPromise = includeNewsApis
      ? fetchAllNews(lang === "tr" ? "ekonomi finans" : "economy finance", lang === "all" ? "en" : lang, Math.min(limit, 30))
      : Promise.resolve({ items: [], sources: [] });

    const [rssResults, finnhubResults, newsApiResults] = await Promise.all([
      Promise.allSettled(rssPromises),
      finnhubPromise,
      newsApiPromise,
    ]);

    // Collect all items
    const allItems: RssItem[] = [...finnhubResults];
    
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

    for (const result of rssResults) {
      if (result.status === "fulfilled") {
        allItems.push(...result.value);
      }
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

    // Calculate stats
    const activeSources = rssResults.filter((r) => r.status === "fulfilled" && r.value.length > 0).length;
    const failedSources = rssResults.filter((r) => r.status === "rejected").length;
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