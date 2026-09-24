import dns from 'node:dns/promises';
import net from 'node:net';

export type UrlSafetyPolicy = 'strict' | 'allow-local';

export interface UrlValidationResult {
  valid: boolean;
  reason?: string;
  normalizedUrl?: string;
}

export interface FetchOptions {
  timeoutMs?: number;
  maxSizeBytes?: number;
  policy?: UrlSafetyPolicy;
  headers?: Record<string, string>;
  maxRedirects?: number;
}

export interface SafeFetchResponse {
  url: string;
  status: number;
  statusText: string;
  contentType: string;
  body: string;
  text: string; // Cleaned plain text
}

/**
 * Checks whether an IPv4 address belongs to a private, loopback, or cloud-metadata range.
 */
export function isPrivateOrBlockedIp(ip: string, policy: UrlSafetyPolicy = 'strict'): boolean {
  if (net.isIPv4(ip)) {
    const parts = ip.split('.').map(Number);
    if (parts.length !== 4 || parts.some(isNaN)) return true;
    const [b0, b1] = parts;

    // Cloud metadata 169.254.169.254 / link-local 169.254.0.0/16 is ALWAYS blocked regardless of policy
    if (b0 === 169 && b1 === 254) {
      return true;
    }

    // 0.0.0.0/8
    if (b0 === 0) return true;

    // Loopback 127.0.0.0/8
    if (b0 === 127) {
      return policy !== 'allow-local';
    }

    // Private 10.0.0.0/8
    if (b0 === 10) {
      return policy !== 'allow-local';
    }

    // Private 172.16.0.0/12 (172.16.0.0 to 172.31.255.255)
    if (b0 === 172 && b1 >= 16 && b1 <= 31) {
      return policy !== 'allow-local';
    }

    // Private 192.168.0.0/16
    if (b0 === 192 && b1 === 168) {
      return policy !== 'allow-local';
    }

    // Broadcast 255.255.255.255
    if (parts.every((p) => p === 255)) return true;

    return false;
  }

  if (net.isIPv6(ip)) {
    // IPv6 loopback ::1
    if (ip === '::1' || ip === '0:0:0:0:0:0:0:1') {
      return policy !== 'allow-local';
    }
    // IPv6 link-local fe80::/10 or unique local fc00::/7
    const lower = ip.toLowerCase();
    if (lower.startsWith('fe8') || lower.startsWith('fe9') || lower.startsWith('fea') || lower.startsWith('feb') || lower.startsWith('fc') || lower.startsWith('fd')) {
      return true;
    }
    return false;
  }

  return true;
}

/**
 * Validates a URL against SSRF rules.
 */
export async function validateSafeUrl(
  inputUrl: string,
  policy: UrlSafetyPolicy = 'strict'
): Promise<UrlValidationResult> {
  let parsed: URL;
  try {
    parsed = new URL(inputUrl);
  } catch {
    return { valid: false, reason: 'Invalid URL format' };
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return { valid: false, reason: `Disallowed protocol: ${parsed.protocol}. Only http: and https: are allowed.` };
  }

  const hostname = parsed.hostname.toLowerCase();

  // Block obvious metadata or localhost in strict mode
  if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1') {
    if (policy !== 'allow-local') {
      return { valid: false, reason: 'Localhost addresses are blocked in production policy' };
    }
  }

  if (hostname === '169.254.169.254' || hostname === 'metadata.google.internal' || hostname === 'instance-data') {
    return { valid: false, reason: 'Cloud metadata access is forbidden' };
  }

  // If hostname is an IP literal, validate directly
  if (net.isIP(hostname)) {
    if (isPrivateOrBlockedIp(hostname, policy)) {
      return { valid: false, reason: `IP address ${hostname} is private or blocked` };
    }
  } else {
    // Resolve DNS to verify destination IP
    try {
      const addresses = await dns.lookup(hostname, { all: true });
      for (const addr of addresses) {
        if (isPrivateOrBlockedIp(addr.address, policy)) {
          return { valid: false, reason: `Host ${hostname} resolves to blocked IP ${addr.address}` };
        }
      }
    } catch {
      // If DNS fails and not localhost in allow-local, report invalid
      if (policy === 'allow-local' && (hostname === 'localhost' || hostname === '127.0.0.1')) {
        // allowed
      } else {
        return { valid: false, reason: `DNS resolution failed for ${hostname}` };
      }
    }
  }

  return { valid: true, normalizedUrl: parsed.href };
}

/**
 * Strips HTML tags, scripts, styles and extracts readable clean text.
 */
export function extractCleanText(html: string): string {
  if (!html) return '';

  return html
    // Remove scripts and styles
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, ' ')
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, ' ')
    .replace(/<noscript\b[^<]*(?:(?!<\/noscript>)<[^<]*)*<\/noscript>/gi, ' ')
    .replace(/<svg\b[^<]*(?:(?!<\/svg>)<[^<]*)*<\/svg>/gi, ' ')
    // Replace block breaks with newlines
    .replace(/<\/(p|div|h\d|li|tr|section|article)>/gi, '\n')
    .replace(/<br\s*[\/]?>/gi, '\n')
    // Remove all remaining HTML tags
    .replace(/<[^>]+>/g, ' ')
    // Decode HTML entities
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    // Clean whitespace
    .replace(/[ \t]+/g, ' ')
    .replace(/\n\s*\n+/g, '\n\n')
    .trim();
}

/**
 * SSRF-Safe Fetch function with timeout, size limits, redirect validation, and text extraction.
 */
export async function safeFetch(
  targetUrl: string,
  options: FetchOptions = {}
): Promise<SafeFetchResponse> {
  const {
    timeoutMs = 5000,
    maxSizeBytes = 2 * 1024 * 1024, // 2MB
    policy = 'strict',
    headers = {},
    maxRedirects = 3,
  } = options;

  let currentUrl = targetUrl;
  let redirectsRemaining = maxRedirects;

  while (redirectsRemaining >= 0) {
    const validation = await validateSafeUrl(currentUrl, policy);
    if (!validation.valid) {
      throw new Error(`SSRF Blocked: ${validation.reason}`);
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(currentUrl, {
        method: 'GET',
        headers: {
          'User-Agent': 'AI-Interview-Prep-Bot/1.0 (+http://localhost/bot)',
          Accept: 'text/html,text/plain,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8',
          ...headers,
        },
        redirect: 'manual',
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      // Handle redirect
      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get('location');
        if (!location) {
          throw new Error(`Redirect with status ${response.status} missing Location header`);
        }
        currentUrl = new URL(location, currentUrl).href;
        redirectsRemaining--;
        continue;
      }

      if (!response.ok) {
        throw new Error(`HTTP error ${response.status}: ${response.statusText}`);
      }

      const contentType = response.headers.get('content-type') || 'text/html';
      const allowedTypes = ['text/html', 'text/plain', 'application/xhtml+xml', 'application/json'];
      const isAllowed = allowedTypes.some((t) => contentType.toLowerCase().includes(t));
      if (!isAllowed) {
        throw new Error(`Disallowed content-type: ${contentType}. Only text/html/json supported.`);
      }

      const contentLength = response.headers.get('content-length');
      if (contentLength && parseInt(contentLength, 10) > maxSizeBytes) {
        throw new Error(`Response size ${contentLength} bytes exceeds limit of ${maxSizeBytes} bytes`);
      }

      const body = await response.text();
      if (body.length > maxSizeBytes) {
        throw new Error(`Response body exceeds limit of ${maxSizeBytes} bytes`);
      }

      const text = extractCleanText(body);

      return {
        url: currentUrl,
        status: response.status,
        statusText: response.statusText,
        contentType,
        body,
        text,
      };
    } catch (err: any) {
      clearTimeout(timeoutId);
      if (err.name === 'AbortError') {
        throw new Error(`Request timed out after ${timeoutMs}ms`);
      }
      throw err;
    }
  }

  throw new Error(`Exceeded maximum redirects (${maxRedirects})`);
}
