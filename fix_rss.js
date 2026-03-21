import { readFileSync, writeFileSync } from "node:fs";

let code = readFileSync("src/app/api/rss/fetch/route.ts", "utf8");

// Use a more real-looking user agent
code = code.replace(
  'const USER_AGENT = "Mozilla/5.0 (compatible; EkonomiBot/1.0; +https://example.com)";',
  'const USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";'
);

// Update fetch options
code = code.replace(
  `headers: { "User-Agent": USER_AGENT, Accept: "application/rss+xml, application/atom+xml, application/xml, text/xml" },`,
  `headers: { "User-Agent": USER_AGENT, Accept: "application/rss+xml, application/atom+xml, application/xml, text/xml, */*", "Accept-Language": "en-US,en;q=0.9,tr;q=0.8" },\n      redirect: "follow",\n      signal: AbortSignal.timeout(8000),`
);

writeFileSync("src/app/api/rss/fetch/route.ts", code);
