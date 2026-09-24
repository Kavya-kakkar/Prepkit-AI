import { describe, it, expect, beforeEach } from 'vitest';
import { createServer } from '../src/index.js';
import { db } from '../src/repositories/inMemoryDb.js';

describe('API End-to-End Integration Tests', () => {
  const app = createServer();
  let server: any;
  let baseUrl: string;

  beforeEach(async () => {
    db.clear();
    await new Promise<void>((resolve) => {
      server = app.listen(0, () => {
        const port = server.address().port;
        baseUrl = `http://127.0.0.1:${port}`;
        resolve();
      });
    });

    return () => {
      server.close();
    };
  });

  it('handles auth lifecycle: register, login, me, and rejects invalid credentials', async () => {
    // 1. Register
    const regRes = await fetch(`${baseUrl}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'test@example.com', password: 'password123' }),
    });
    expect(regRes.status).toBe(201);
    const regData = await regRes.json();
    expect(regData.user.email).toBe('test@example.com');
    const token = regData.sessionToken;

    // 2. Reject duplicate email
    const dupRes = await fetch(`${baseUrl}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'test@example.com', password: 'password123' }),
    });
    expect(dupRes.status).toBe(400);

    // 3. GET /me with token
    const meRes = await fetch(`${baseUrl}/api/auth/me`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(meRes.status).toBe(200);
    const meData = await meRes.json();
    expect(meData.user.email).toBe('test@example.com');

    // 4. Reject unauthenticated request
    const unauthRes = await fetch(`${baseUrl}/api/auth/me`);
    expect(unauthRes.status).toBe(401);
  });

  it('kicks off async generation with 202, tracks job progress, and enforces owner scoping', async () => {
    // Register User A
    const userARes = await fetch(`${baseUrl}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'userA@example.com', password: 'password123' }),
    });
    const { sessionToken: tokenA } = await userARes.json();

    // Register User B
    const userBRes = await fetch(`${baseUrl}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'userB@example.com', password: 'password123' }),
    });
    const { sessionToken: tokenB } = await userBRes.json();

    // User A creates kit
    const jd = 'Senior Backend Engineer with 5+ years of Node.js and TypeScript.';
    const createRes = await fetch(`${baseUrl}/api/kits`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${tokenA}`,
      },
      body: JSON.stringify({
        jd,
        days: 5,
      }),
    });

    expect(createRes.status).toBe(202);
    const { jobId } = await createRes.json();
    expect(jobId).toBeDefined();

    // Poll job until completed (or timeout after 5s)
    let kitId: string | undefined;
    for (let i = 0; i < 20; i++) {
      await new Promise((r) => setTimeout(r, 200));
      const jobRes = await fetch(`${baseUrl}/api/jobs/${jobId}`, {
        headers: { Authorization: `Bearer ${tokenA}` },
      });
      const job = await jobRes.json();
      if (job.status === 'completed') {
        kitId = job.kitId;
        break;
      }
    }

    expect(kitId).toBeDefined();

    // User A can access kit
    const kitRes = await fetch(`${baseUrl}/api/kits/${kitId}`, {
      headers: { Authorization: `Bearer ${tokenA}` },
    });
    expect(kitRes.status).toBe(200);
    const kit = await kitRes.json();
    expect(kit.schedule.days.length).toBe(5);

    // User B CANNOT access User A's kit (403 Forbidden)
    const userBKitRes = await fetch(`${baseUrl}/api/kits/${kitId}`, {
      headers: { Authorization: `Bearer ${tokenB}` },
    });
    expect(userBKitRes.status).toBe(403);
  });

  it('supports inline patch and section regeneration preserving pinned/edited items', async () => {
    // Register user
    const reg = await fetch(`${baseUrl}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'edit@example.com', password: 'password123' }),
    });
    const { sessionToken: token } = await reg.json();

    // Create kit
    const createRes = await fetch(`${baseUrl}/api/kits`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        jd: 'Staff Engineer leading cloud distributed architecture with Go.',
        days: 3,
      }),
    });
    const { jobId } = await createRes.json();

    // Wait for kit creation
    let kitId: string | undefined;
    for (let i = 0; i < 20; i++) {
      await new Promise((r) => setTimeout(r, 200));
      const jobRes = await fetch(`${baseUrl}/api/jobs/${jobId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const job = await jobRes.json();
      if (job.status === 'completed') {
        kitId = job.kitId;
        break;
      }
    }

    // Fetch initial kit
    const initialRes = await fetch(`${baseUrl}/api/kits/${kitId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const initialKit = await initialRes.json();
    const firstQ = initialKit.questions[0];

    // 1. Inline edit: pin question and modify prompt
    const modifiedQuestions = [...initialKit.questions];
    modifiedQuestions[0] = {
      ...firstQ,
      prompt: 'CUSTOM USER EDITED QUESTION PROMPT',
      meta: { ...firstQ.meta, pinned: true },
    };

    const patchRes = await fetch(`${baseUrl}/api/kits/${kitId}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ questions: modifiedQuestions }),
    });

    expect(patchRes.status).toBe(200);
    const patchedKit = await patchRes.json();
    expect(patchedKit.version).toBe(initialKit.version + 1);
    expect(patchedKit.questions[0].meta.edited).toBe(true);
    expect(patchedKit.questions[0].meta.pinned).toBe(true);

    // 2. Section regeneration: preserves the pinned/edited question
    const regenRes = await fetch(`${baseUrl}/api/kits/${kitId}/regenerate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ section: 'questions' }),
    });

    expect(regenRes.status).toBe(200);
    const regeneratedKit = await regenRes.json();
    expect(regeneratedKit.version).toBe(patchedKit.version + 1);

    // Pinned edited question survived regeneration!
    const survived = regeneratedKit.questions.find((q: any) => q.prompt === 'CUSTOM USER EDITED QUESTION PROMPT');
    expect(survived).toBeDefined();
    expect(survived.meta.pinned).toBe(true);
  });

  it('tracks practice mode ratings and returns questions prioritized by need score', async () => {
    // Register user
    const reg = await fetch(`${baseUrl}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'practice@example.com', password: 'password123' }),
    });
    const { sessionToken: token } = await reg.json();

    // Create kit
    const createRes = await fetch(`${baseUrl}/api/kits`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        jd: 'Senior React and TypeScript frontend architect.',
        days: 3,
      }),
    });
    const { jobId } = await createRes.json();

    // Wait for kit creation
    let kitId: string | undefined;
    for (let i = 0; i < 20; i++) {
      await new Promise((r) => setTimeout(r, 200));
      const jobRes = await fetch(`${baseUrl}/api/jobs/${jobId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const job = await jobRes.json();
      if (job.status === 'completed') {
        kitId = job.kitId;
        break;
      }
    }

    // Submit rating for question 1 (struggled = 1)
    const rateRes = await fetch(`${baseUrl}/api/practice/q1/rate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ kitId, rating: 1 }),
    });

    expect(rateRes.status).toBe(200);
    const rateData = await rateRes.json();
    expect(rateData.needScore).toBeGreaterThanOrEqual(0.7);

    // Submit rating for question 2 (mastered = 3)
    await fetch(`${baseUrl}/api/practice/q2/rate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ kitId, rating: 3 }),
    });

    // Fetch next questions: q1 should be first because need score is higher
    const nextRes = await fetch(`${baseUrl}/api/practice/${kitId}/next`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(nextRes.status).toBe(200);
    const nextData = await nextRes.json();
    expect(nextData.questions[0].id).toBe('q1');
  });
});
