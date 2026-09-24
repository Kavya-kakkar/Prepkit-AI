import type { Kit, GenerationJob, User, QuestionCategory } from '../types/client.js';

class ApiError extends Error {
  readonly status: number;
  readonly code?: string;

  constructor(status: number, message: string, code?: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
  }
}

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...init?.headers,
    },
    credentials: 'include', // Ensures session cookie is sent
  });

  if (!res.ok) {
    let errorData: { error?: { message?: string; code?: string }; message?: string } | null = null;
    try {
      errorData = await res.json();
    } catch {
      // non-JSON error response
    }
    const message = errorData?.error?.message || errorData?.message || `API request failed with status ${res.status}`;
    const code = errorData?.error?.code;
    throw new ApiError(res.status, message, code);
  }

  return res.json() as Promise<T>;
}

export const api = {
  // Auth
  async register(email: string, password: string):Promise<{ user: User }> {
    return fetchJson('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
  },

  async login(email: string, password: string): Promise<{ user: User }> {
    return fetchJson('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
  },

  async logout(): Promise<{ ok: boolean }> {
    return fetchJson('/api/auth/logout', { method: 'POST' });
  },

  async getMe(): Promise<{ user: User | null }> {
    try {
      return await fetchJson('/api/auth/me');
    } catch {
      return { user: null };
    }
  },

  // Kits
  async listKits(): Promise<{ kits: Array<Pick<Kit, 'id' | 'role' | 'source' | 'schedule'>> }> {
    return fetchJson('/api/kits');
  },

  async getKit(id: string): Promise<{ kit: Kit }> {
    // The server returns the Kit object directly (not wrapped in { kit: ... })
    const data = await fetchJson<Kit | { kit: Kit }>(`/api/kits/${id}`);
    // Handle both shapes gracefully
    if (data && typeof data === 'object' && 'id' in data) {
      return { kit: data as Kit };
    }
    return data as { kit: Kit };
  },

  async createKit(data: { jd: string; company_url: string; days: number }): Promise<{ job_id: string; kit_id?: string }> {
    const res = await fetchJson<{ jobId: string; kitId?: string; status: string }>('/api/kits', {
      method: 'POST',
      body: JSON.stringify(data),
    });
    // Normalise to the shape the UI expects
    return { job_id: res.jobId, kit_id: res.kitId };
  },

  async saveKit(id: string, kit: Kit): Promise<{ kit: Kit }> {
    return fetchJson(`/api/kits/${id}`, {
      method: 'PUT',
      body: JSON.stringify(kit),
    });
  },

  async regenerateSection(
    kitId: string,
    section: { type: 'company_brief' | 'schedule' | 'category'; category?: QuestionCategory }
  ): Promise<{ kit: Kit }> {
    return fetchJson(`/api/kits/${kitId}/regenerate`, {
      method: 'POST',
      body: JSON.stringify(section),
    });
  },

  // Job Polling
  async getJob(id: string): Promise<{ job: GenerationJob }> {
    const data = await fetchJson<GenerationJob | { job: GenerationJob }>(`/api/jobs/${id}`);
    // Handle both { job: ... } and bare object from server
    if (data && 'job' in data) return data as { job: GenerationJob };
    return { job: data as GenerationJob };
  },

  // Practice
  async ratePracticeQuestion(
    kitId: string,
    questionId: string,
    rating: 1 | 2 | 3
  ): Promise<{ ok: boolean }> {
    return fetchJson(`/api/kits/${kitId}/practice/${questionId}/rate`, {
      method: 'POST',
      body: JSON.stringify({ rating }),
    });
  },

  async getPracticeQueue(kitId: string): Promise<{
    queue: Array<{
      id: string;
      front: string;
      back: string;
      requirement_ids: string[];
      need_score: number;
    }>;
  }> {
    return fetchJson(`/api/kits/${kitId}/practice/queue`);
  },
};
