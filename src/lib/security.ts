import { isIP } from "node:net";
import { DEFAULT_RSS_FEEDS } from "@/lib/rssSources";

type ValidationResult =
  | { ok: true; url: URL }
  | { ok: false; reason: string };

const ALLOWED_RSS_HOSTS = new Set(
  DEFAULT_RSS_FEEDS.map((feed) => {
    const parsed = new URL(feed.url);
    return parsed.hostname.toLowerCase();
  })
);

function isPrivateIpv4(ip: string): boolean {
  const parts = ip.split(".").map((part) => Number(part));
  if (parts.length !== 4 || parts.some((p) => !Number.isInteger(p) || p < 0 || p > 255)) {
    return false;
  }

  const [a, b] = parts;
  if (a === 10 || a === 127 || a === 0) {
    return true;
  }
  if (a === 192 && b === 168) {
    return true;
  }
  if (a === 172 && b >= 16 && b <= 31) {
    return true;
  }
  if (a === 169 && b === 254) {
    return true;
  }
  return a === 100 && b >= 64 && b <= 127;
}

function isPrivateIpv6(ip: string): boolean {
  const normalized = ip.toLowerCase();
  return (
    normalized === "::1" ||
    normalized.startsWith("fc") ||
    normalized.startsWith("fd") ||
    normalized.startsWith("fe8") ||
    normalized.startsWith("fe9") ||
    normalized.startsWith("fea") ||
    normalized.startsWith("feb")
  );
}

function isPrivateHost(hostname: string): boolean {
  const host = hostname.toLowerCase();
  if (host === "localhost" || host.endsWith(".localhost")) {
    return true;
  }
  if (host.endsWith(".local") || host.endsWith(".internal") || host.endsWith(".home")) {
    return true;
  }

  const ipType = isIP(host);
  if (ipType === 4) {
    return isPrivateIpv4(host);
  }
  if (ipType === 6) {
    return isPrivateIpv6(host);
  }
  return false;
}

export function validateRssUrl(rawUrl: string): ValidationResult {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return { ok: false, reason: "url is invalid" };
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return { ok: false, reason: "only http/https urls are supported" };
  }

  const hostname = parsed.hostname.toLowerCase();
  if (isPrivateHost(hostname)) {
    return { ok: false, reason: "private or local network hosts are not allowed" };
  }

  if (!ALLOWED_RSS_HOSTS.has(hostname)) {
    return { ok: false, reason: "rss host is not in allowlist" };
  }

  return { ok: true, url: parsed };
}
