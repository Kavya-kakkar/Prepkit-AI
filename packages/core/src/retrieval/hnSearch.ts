import { safeFetch } from './safeFetch.js';

export interface DiscussionResult {
  title: string;
  url: string;
  points: number;
  numComments: number;
  createdAt: string;
}

export interface DiscussionSearchReport {
  queries: string[];
  results: DiscussionResult[];
  warnings: string[];
}

/**
 * Searches Hacker News Algolia API for public discussion about the company's interview process.
 * Gracefully isolates failure if network or API is unavailable.
 */
export async function searchDiscussionHackerNews(
  companyName: string
): Promise<DiscussionSearchReport> {
  const warnings: string[] = [];
  const results: DiscussionResult[] = [];
  const query = `${companyName} interview`;

  if (!companyName || companyName.trim().length === 0) {
    return { queries: [], results: [], warnings: [] };
  }

  const encodedQuery = encodeURIComponent(query);
  const searchUrl = `https://hn.algolia.com/api/v1/search?query=${encodedQuery}&tags=story&hitsPerPage=5`;

  try {
    const res = await safeFetch(searchUrl, {
      timeoutMs: 4000,
      policy: 'strict',
    });

    const data = JSON.parse(res.body);
    if (Array.isArray(data?.hits)) {
      for (const hit of data.hits) {
        if (hit.title) {
          results.push({
            title: hit.title,
            url: hit.url || `https://news.ycombinator.com/item?id=${hit.objectID}`,
            points: hit.points || 0,
            numComments: hit.num_comments || 0,
            createdAt: hit.created_at || new Date().toISOString(),
          });
        }
      }
    }
  } catch (err: any) {
    // Failure isolation: discussion search failure does not abort the preparation kit
    warnings.push(`Public discussion search skipped or unavailable: ${err.message}`);
  }

  return {
    queries: [query],
    results,
    warnings,
  };
}
