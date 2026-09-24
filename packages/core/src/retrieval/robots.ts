export interface RobotsRule {
  userAgent: string;
  disallows: string[];
  allows: string[];
  crawlDelayMs?: number;
}

export interface RobotsPolicy {
  isAllowed: (path: string) => boolean;
  crawlDelayMs: number;
}

/**
 * Parses robots.txt text according to the RFC 9309 subset.
 */
export function parseRobotsTxt(content: string): RobotsRule[] {
  const rules: RobotsRule[] = [];
  let currentRule: RobotsRule | null = null;

  const lines = content.split('\n');
  for (const rawLine of lines) {
    const line = rawLine.split('#')[0].trim();
    if (!line) continue;

    const colonIndex = line.indexOf(':');
    if (colonIndex === -1) continue;

    const directive = line.slice(0, colonIndex).trim().toLowerCase();
    const value = line.slice(colonIndex + 1).trim();

    if (directive === 'user-agent') {
      const ua = value.toLowerCase();
      currentRule = {
        userAgent: ua,
        disallows: [],
        allows: [],
      };
      rules.push(currentRule);
    } else if (currentRule) {
      if (directive === 'disallow' && value) {
        currentRule.disallows.push(value);
      } else if (directive === 'allow' && value) {
        currentRule.allows.push(value);
      } else if (directive === 'crawl-delay') {
        const seconds = parseFloat(value);
        if (!isNaN(seconds)) {
          currentRule.crawlDelayMs = Math.round(seconds * 1000);
        }
      }
    }
  }

  return rules;
}

/**
 * Determines whether a URL path is allowed for a user agent.
 */
export function isPathAllowed(
  rules: RobotsRule[],
  urlPath: string,
  userAgent: string = 'ai-interview-prep-bot'
): boolean {
  const lowerUa = userAgent.toLowerCase();

  // Find most specific matching rule group (agent name first, then fallback to *)
  let matchingRule = rules.find((r) => r.userAgent === lowerUa);
  if (!matchingRule) {
    matchingRule = rules.find((r) => r.userAgent === '*');
  }

  if (!matchingRule) return true;

  // Check allows first (most specific path match takes precedence)
  for (const allow of matchingRule.allows) {
    if (urlPath.startsWith(allow)) {
      return true;
    }
  }

  // Check disallows
  for (const disallow of matchingRule.disallows) {
    if (urlPath.startsWith(disallow)) {
      return false;
    }
  }

  return true;
}

/**
 * Creates a policy object from robots.txt content with default 1000ms politeness delay.
 */
export function createRobotsPolicy(content: string, userAgent?: string): RobotsPolicy {
  const rules = parseRobotsTxt(content);
  let crawlDelayMs = 1000; // Default politeness delay 1s

  const lowerUa = (userAgent || 'ai-interview-prep-bot').toLowerCase();
  const rule = rules.find((r) => r.userAgent === lowerUa) || rules.find((r) => r.userAgent === '*');
  if (rule?.crawlDelayMs && rule.crawlDelayMs > crawlDelayMs) {
    crawlDelayMs = rule.crawlDelayMs;
  }

  return {
    isAllowed: (path: string) => isPathAllowed(rules, path, userAgent),
    crawlDelayMs,
  };
}
