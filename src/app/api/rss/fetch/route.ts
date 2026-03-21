import { NextRequest } from "next/server";
import { z } from "zod";
import { createRequestId, getClientIp, jsonError, jsonSuccess } from "@/lib/api";
import { checkRateLimit } from "@/lib/rateLimit";
import { validateRssUrl } from "@/lib/security";

type RssItem = {
  title: string;
  link: string;
  pubDate: string;
  source: string;
  description?: string;
  image?: string;
};

const USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
const RATE_LIMIT_WINDOW_MS = 60 * 1000;
const RATE_LIMIT_COUNT = 30;
const querySchema = z.object({
  url: z.string().trim().min(1, "url is required"),
});

function decodeXml(value: string): string {
  return value
    .replace(/<!\[CDATA\[|\]\]>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
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
  if (mediaContent) {
    return decodeXml(mediaContent);
  }

  const mediaThumb = block.match(/<media:thumbnail[^>]*url=["']([^"']+)["'][^>]*>/i)?.[1];
  if (mediaThumb) {
    return decodeXml(mediaThumb);
  }

  const enclosureImage =
    block.match(/<enclosure[^>]*type=["'][^"']*image[^"']*["'][^>]*url=["']([^"']+)["'][^>]*>/i)?.[1] ??
    block.match(/<enclosure[^>]*url=["']([^"']+)["'][^>]*type=["'][^"']*image[^"']*["'][^>]*>/i)?.[1];
  if (enclosureImage) {
    return decodeXml(enclosureImage);
  }

  const atomEnclosure = block.match(/<link[^>]*rel=["']enclosure["'][^>]*href=["']([^"']+)["'][^>]*>/i)?.[1];
  if (atomEnclosure) {
    return decodeXml(atomEnclosure);
  }

  const htmlImage = block.match(/<img[^>]*src=["']([^"']+)["'][^>]*>/i)?.[1];
  return htmlImage ? decodeXml(htmlImage) : "";
}

function parseRssItems(xml: string): RssItem[] {
  const rssItems = xml.match(/<item>[\s\S]*?<\/item>/gi) ?? [];
  if (rssItems.length) {
    return rssItems.slice(0, 20).map((item) => ({
      title: getTag(item, "title") || "Untitled",
      link: getTag(item, "link"),
      pubDate: getTag(item, "pubDate") || new Date().toISOString(),
      source: getTag(item, "source") || "RSS",
      description: extractDescription(item, false),
      image: extractImageUrl(item) || undefined,
    }));
  }

  const atomItems = xml.match(/<entry>[\s\S]*?<\/entry>/gi) ?? [];
  return atomItems.slice(0, 20).map((entry) => {
    const title = getTag(entry, "title") || "Untitled";
    const updated = getTag(entry, "updated") || getTag(entry, "published") || new Date().toISOString();
    const source = getTag(entry, "name") || "Atom";
    const linkMatch = entry.match(/<link[^>]*href=["']([^"']+)["'][^>]*>/i);

    return {
      title,
      link: linkMatch ? decodeXml(linkMatch[1]) : "",
      pubDate: updated,
      source,
      description: extractDescription(entry, true),
      image: extractImageUrl(entry) || undefined,
    };
  });
}

export async function GET(request: NextRequest) {
  const requestId = createRequestId();
  const clientIp = getClientIp(request);
  const rate = checkRateLimit({
    key: `rss-fetch:${clientIp}`,
    limit: RATE_LIMIT_COUNT,
    windowMs: RATE_LIMIT_WINDOW_MS,
  });
  if (!rate.allowed) {
    return jsonError("too many requests", 429, {
      requestId,
      code: "RATE_LIMITED",
      headers: {
        "retry-after": String(rate.retryAfterSeconds),
      },
    });
  }

  try {
    const parsedQuery = querySchema.safeParse({
      url: request.nextUrl.searchParams.get("url") || "",
    });
    if (!parsedQuery.success) {
      return jsonError(parsedQuery.error.issues[0]?.message ?? "invalid query", 400, {
        requestId,
        code: "INVALID_QUERY",
      });
    }

    const validatedUrl = validateRssUrl(parsedQuery.data.url);
    if (!validatedUrl.ok) {
      return jsonError(validatedUrl.reason, 400, {
        requestId,
        code: "UNSAFE_URL",
      });
    }

    const response = await fetch(validatedUrl.url.toString(), {
      headers: { "User-Agent": USER_AGENT, Accept: "application/rss+xml, application/atom+xml, application/xml, text/xml, */*", "Accept-Language": "en-US,en;q=0.9,tr;q=0.8" },
      redirect: "follow",
      signal: AbortSignal.timeout(8000),
      next: { revalidate: 300 },
    });

    if (!response.ok) {
      return jsonError(`rss fetch failed: ${response.status}`, 502, {
        requestId,
        code: "UPSTREAM_FETCH_FAILED",
      });
    }

    const xml = await response.text();
    const dedup = new Set<string>();
    const items = parseRssItems(xml)
      .filter((item) => item.link)
      .filter((item) => {
        const key = `${item.link}::${item.title.toLowerCase()}`;
        if (dedup.has(key)) {
          return false;
        }
        dedup.add(key);
        return true;
      });

    return jsonSuccess(
      {
        feedUrl: validatedUrl.url.toString(),
        items,
        requestId,
      },
      {
        requestId,
        headers: {
          "cache-control": "public, s-maxage=120, stale-while-revalidate=300",
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
