import { getOptionalEnv } from "@/lib/env";

export type NewsItem = {
  title: string;
  link: string;
  pubDate: string;
  source: string;
  description?: string;
  image?: string;
};

// ═══════════════════════════════════════════════════════════════════════════
// NewsAPI.org - Free tier: 100 requests/day, 50 results per request
// https://newsapi.org/register
// ═══════════════════════════════════════════════════════════════════════════
export async function fetchNewsAPI(
  query: string = "economy OR finance OR stock market",
  language: string = "en",
  pageSize: number = 20
): Promise<NewsItem[]> {
  const apiKey = getOptionalEnv("NEWSAPI_KEY");
  if (!apiKey) {
    console.warn("NewsAPI key not configured");
    return [];
  }

  try {
    const url = `https://newsapi.org/v2/everything?q=${encodeURIComponent(query)}&language=${language}&sortBy=publishedAt&pageSize=${pageSize}&apiKey=${apiKey}`;
    const response = await fetch(url, {
      next: { revalidate: 600 }, // 10 dakika cache
    });

    if (!response.ok) {
      console.warn(`NewsAPI error: ${response.status}`);
      return [];
    }

    const data = await response.json();
    if (data.status !== "ok" || !data.articles) {
      return [];
    }

    return data.articles.map((article: {
      title: string;
      url: string;
      publishedAt: string;
      source: { name: string };
      description: string;
      urlToImage: string;
    }) => ({
      title: article.title || "Untitled",
      link: article.url,
      pubDate: article.publishedAt,
      source: `NewsAPI - ${article.source?.name || "Unknown"}`,
      description: article.description?.slice(0, 260),
      image: article.urlToImage || undefined,
    }));
  } catch (error) {
    console.error("NewsAPI fetch failed:", error);
    return [];
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// GNews API - Free tier: 100 requests/day, 10 results per request
// https://gnews.io/register
// ═══════════════════════════════════════════════════════════════════════════
export async function fetchGNews(
  query: string = "economy finance",
  lang: string = "en",
  maxResults: number = 10
): Promise<NewsItem[]> {
  const apiKey = getOptionalEnv("GNEWS_API_KEY");
  if (!apiKey) {
    console.warn("GNews API key not configured");
    return [];
  }

  try {
    const url = `https://gnews.io/api/v4/search?q=${encodeURIComponent(query)}&lang=${lang}&max=${maxResults}&apikey=${apiKey}`;
    const response = await fetch(url, {
      next: { revalidate: 600 },
    });

    if (!response.ok) {
      console.warn(`GNews error: ${response.status}`);
      return [];
    }

    const data = await response.json();
    if (!data.articles) {
      return [];
    }

    return data.articles.map((article: {
      title: string;
      url: string;
      publishedAt: string;
      source: { name: string };
      description: string;
      image: string;
    }) => ({
      title: article.title || "Untitled",
      link: article.url,
      pubDate: article.publishedAt,
      source: `GNews - ${article.source?.name || "Unknown"}`,
      description: article.description?.slice(0, 260),
      image: article.image || undefined,
    }));
  } catch (error) {
    console.error("GNews fetch failed:", error);
    return [];
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// Currents API - Free tier: 600 requests/day
// https://currentsapi.services/en/register
// ═══════════════════════════════════════════════════════════════════════════
export async function fetchCurrents(
  keywords: string = "economy finance business",
  language: string = "en"
): Promise<NewsItem[]> {
  const apiKey = getOptionalEnv("CURRENTS_API_KEY");
  if (!apiKey) {
    console.warn("Currents API key not configured");
    return [];
  }

  try {
    const url = `https://api.currentsapi.services/v1/latest-news?keywords=${encodeURIComponent(keywords)}&language=${language}&apiKey=${apiKey}`;
    const response = await fetch(url, {
      next: { revalidate: 600 },
    });

    if (!response.ok) {
      console.warn(`Currents error: ${response.status}`);
      return [];
    }

    const data = await response.json();
    if (data.status !== "success" || !data.news) {
      return [];
    }

    return data.news.map((article: {
      title: string;
      url: string;
      published: string;
      author: string;
      description: string;
      image: string;
    }) => ({
      title: article.title || "Untitled",
      link: article.url,
      pubDate: article.published,
      source: `Currents - ${article.author || "Unknown"}`,
      description: article.description?.slice(0, 260),
      image: article.image || undefined,
    }));
  } catch (error) {
    console.error("Currents fetch failed:", error);
    return [];
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// Medıastack API - Free tier: 500 requests/month, 25 results per request
// http://mediastack.com/signup/free
// ═══════════════════════════════════════════════════════════════════════════
export async function fetchMediastack(
  keywords: string = "economy finance",
  language: string = "en",
  limit: number = 25
): Promise<NewsItem[]> {
  const apiKey = getOptionalEnv("MEDIASTACK_ACCESS_KEY");
  if (!apiKey) {
    console.warn("Mediastack API key not configured");
    return [];
  }

  try {
    const url = `http://api.mediastack.com/v1/news?access_key=${apiKey}&keywords=${encodeURIComponent(keywords)}&languages=${language}&limit=${limit}`;
    const response = await fetch(url, {
      next: { revalidate: 600 },
    });

    if (!response.ok) {
      console.warn(`Mediastack error: ${response.status}`);
      return [];
    }

    const data = await response.json();
    if (!data.data) {
      return [];
    }

    return data.data.map((article: {
      title: string;
      url: string;
      published_at: string;
      source: string;
      description: string;
      image: string;
    }) => ({
      title: article.title || "Untitled",
      link: article.url,
      pubDate: article.published_at,
      source: `Mediastack - ${article.source || "Unknown"}`,
      description: article.description?.slice(0, 260),
      image: article.image || undefined,
    }));
  } catch (error) {
    console.error("Mediastack fetch failed:", error);
    return [];
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// Birleşik haber servisi - Tüm API'leri dener
// ═══════════════════════════════════════════════════════════════════════════
export async function fetchAllNews(
  query: string = "economy finance",
  language: string = "en",
  limit: number = 50
): Promise<{ items: NewsItem[]; sources: string[] }> {
  const results = await Promise.allSettled([
    fetchNewsAPI(query, language, Math.min(limit, 20)),
    fetchGNews(query, language, Math.min(limit, 10)),
    fetchCurrents(query, language),
    fetchMediastack(query, language, Math.min(limit, 25)),
  ]);

  const allItems: NewsItem[] = [];
  const activeSources: string[] = [];

  const sourceNames = ["NewsAPI", "GNews", "Currents", "Mediastack"];

  results.forEach((result, index) => {
    if (result.status === "fulfilled" && result.value.length > 0) {
      allItems.push(...result.value);
      activeSources.push(sourceNames[index]);
    }
  });

  // Deduplicate by link
  const dedup = new Set<string>();
  const uniqueItems = allItems.filter((item) => {
    const key = item.link.toLowerCase();
    if (dedup.has(key)) return false;
    dedup.add(key);
    return true;
  });

  // Sort by date
  uniqueItems.sort((a, b) => {
    const dateA = new Date(a.pubDate).getTime();
    const dateB = new Date(b.pubDate).getTime();
    return dateB - dateA;
  });

  return {
    items: uniqueItems.slice(0, limit),
    sources: activeSources,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// API durumunu kontrol et
// ═══════════════════════════════════════════════════════════════════════════
export function getNewsServiceStatus(): Record<string, { configured: boolean; limit: string }> {
  return {
    newsapi: {
      configured: !!getOptionalEnv("NEWSAPI_KEY"),
      limit: "100 requests/day",
    },
    gnews: {
      configured: !!getOptionalEnv("GNEWS_API_KEY"),
      limit: "100 requests/day",
    },
    currents: {
      configured: !!getOptionalEnv("CURRENTS_API_KEY"),
      limit: "600 requests/day",
    },
    mediastack: {
      configured: !!getOptionalEnv("MEDIASTACK_ACCESS_KEY"),
      limit: "500 requests/month",
    },
  };
}