import { safeFetch, SafeFetchResponse, UrlSafetyPolicy } from './safeFetch.js';
import { createRobotsPolicy, RobotsPolicy } from './robots.js';

export interface CrawledPage {
  url: string;
  depth: number;
  title?: string;
  text: string;
  isHiringPage: boolean;
}

export interface CrawlResult {
  pages: CrawledPage[];
  unreachable: boolean;
  warnings: string[];
}

export interface CrawlerOptions {
  maxPages?: number;
  maxDepth?: number;
  policy?: UrlSafetyPolicy;
  politenessDelayMs?: number;
}

const HIRING_KEYWORDS = ['career', 'job', 'hiring', 'work-with-us', 'culture', 'values', 'handbook', 'about', 'team', 'engineering'];

/**
 * Extracts links from HTML and normalizes them against current page URL.
 */
export function extractLinks(html: string, pageUrl: string): string[] {
  const links: string[] = [];
  const hrefRegex = /href\s*=\s*["']([^"']+)["']/gi;
  let match: RegExpExecArray | null;

  let pageOrigin: string;
  try {
    pageOrigin = new URL(pageUrl).origin;
  } catch {
    return [];
  }

  while ((match = hrefRegex.exec(html)) !== null) {
    const rawHref = match[1].trim();
    if (!rawHref || rawHref.startsWith('#') || rawHref.startsWith('javascript:') || rawHref.startsWith('mailto:')) {
      continue;
    }

    try {
      const resolved = new URL(rawHref, pageUrl);
      // Stay on the same origin
      if (resolved.origin === pageOrigin) {
        // Strip fragments and trailing slash consistency
        resolved.hash = '';
        links.push(resolved.href);
      }
    } catch {
      // Ignore invalid URLs
    }
  }

  return Array.from(new Set(links));
}

/**
 * Ranks candidate links so hiring, culture, and team pages are fetched first.
 */
export function rankUrl(url: string): number {
  const lower = url.toLowerCase();
  let score = 0;

  for (const kw of HIRING_KEYWORDS) {
    if (lower.includes(kw)) {
      score += 10;
    }
  }

  // Penalize long query strings or media/asset paths
  if (lower.match(/\.(jpg|jpeg|png|gif|pdf|zip|svg|css|js)$/)) {
    return -100;
  }

  return score;
}

/**
 * Best-first crawler with depth limits, politeness delays, and source-level error isolation.
 */
export async function crawlCompanySite(
  companyUrl: string,
  options: CrawlerOptions = {}
): Promise<CrawlResult> {
  const {
    maxPages = 12,
    maxDepth = 2,
    policy = 'strict',
    politenessDelayMs = 500, // Reasonable politeness delay
  } = options;

  const warnings: string[] = [];
  const pages: CrawledPage[] = [];
  const visited = new Set<string>();

  let parsedBase: URL;
  try {
    parsedBase = new URL(companyUrl);
  } catch {
    return {
      pages: [],
      unreachable: true,
      warnings: [`Invalid company URL: ${companyUrl}`],
    };
  }

  // Attempt to fetch robots.txt
  let robotsPolicy: RobotsPolicy = {
    isAllowed: () => true,
    crawlDelayMs: politenessDelayMs,
  };

  try {
    const robotsUrl = new URL('/robots.txt', parsedBase.origin).href;
    const robotsRes = await safeFetch(robotsUrl, { policy, timeoutMs: 3000 });
    robotsPolicy = createRobotsPolicy(robotsRes.body);
  } catch {
    // If robots.txt fails or 404s, proceed with default policy
  }

  const delayMs = Math.max(robotsPolicy.crawlDelayMs, politenessDelayMs);

  // Queue of URLs to crawl: { url, depth, priority }
  interface QueueItem {
    url: string;
    depth: number;
    priority: number;
  }

  const queue: QueueItem[] = [
    { url: parsedBase.href, depth: 0, priority: 100 },
  ];

  // Try fetching the homepage first to verify reachability
  let firstPageFailed = false;

  while (queue.length > 0 && pages.length < maxPages) {
    // Sort queue by priority descending, then depth ascending
    queue.sort((a, b) => b.priority - a.priority || a.depth - b.depth);
    const item = queue.shift()!;

    if (visited.has(item.url)) continue;
    visited.add(item.url);

    // Check robots.txt
    const itemPath = new URL(item.url).pathname;
    if (!robotsPolicy.isAllowed(itemPath)) {
      warnings.push(`Skipped ${item.url} per robots.txt`);
      continue;
    }

    try {
      if (pages.length > 0 && delayMs > 0) {
        await new Promise((resolve) => setTimeout(resolve, Math.min(delayMs, 1000)));
      }

      const res = await safeFetch(item.url, { policy, timeoutMs: 5000 });
      const lowerText = res.text.toLowerCase();
      const isHiring = HIRING_KEYWORDS.some((kw) => item.url.toLowerCase().includes(kw) || lowerText.includes(kw));

      pages.push({
        url: res.url,
        depth: item.depth,
        text: res.text.slice(0, 15000), // Keep up to 15k chars per page
        isHiringPage: isHiring,
      });

      // If we haven't reached max depth, discover links
      if (item.depth < maxDepth && pages.length < maxPages) {
        const links = extractLinks(res.body, res.url);
        for (const link of links) {
          if (!visited.has(link) && !queue.some((q) => q.url === link)) {
            const priority = rankUrl(link);
            if (priority >= 0) {
              queue.push({
                url: link,
                depth: item.depth + 1,
                priority,
              });
            }
          }
        }
      }
    } catch (err: any) {
      if (pages.length === 0) {
        firstPageFailed = true;
        warnings.push(`Company homepage unreachable: ${err.message}`);
        break;
      } else {
        // Silently skip non-HTML assets (CSS, JS, images) — these are expected
        // and not meaningful to the user. Only surface real connectivity failures.
        const msg: string = err.message || '';
        const isAssetError =
          msg.includes('Disallowed content-type') ||
          msg.includes('text/css') ||
          msg.includes('text/javascript') ||
          msg.includes('image/') ||
          msg.includes('application/javascript');
        if (!isAssetError) {
          warnings.push(`Failed to fetch page ${item.url}: ${msg}`);
        }
      }
    }
  }

  return {
    pages,
    unreachable: firstPageFailed && pages.length === 0,
    warnings,
  };
}
