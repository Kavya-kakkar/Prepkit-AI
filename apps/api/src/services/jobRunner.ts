import crypto from 'node:crypto';
import { runPipeline, GeminiFlashClient, MockLlmClient } from '@ai-prep/core';
import { db } from '../repositories/db.js';
import { Job, KitRecord } from '../repositories/types.js';

export function computeDedupeKey(userId: string, jd: string, companyUrl?: string): string {
  const normalized = `${userId}:${jd.trim()}:${(companyUrl || '').trim()}`;
  return crypto.createHash('sha256').update(normalized).digest('hex');
}

export interface StartJobParams {
  userId: string;
  jd: string;
  companyUrl?: string;
  days: number;
}

export interface StartJobResult {
  jobId: string;
  dedupeKey: string;
  status: 'queued' | 'running' | 'completed';
  existingKitId?: string;
}

export async function startGenerationJob(params: StartJobParams): Promise<StartJobResult> {
  const { userId, jd, companyUrl, days } = params;
  const dedupeKey = computeDedupeKey(userId, jd, companyUrl);

  // 1. Check for existing kit with same dedupeKey
  const existingKit = await db.findKitByDedupe(dedupeKey);
  if (existingKit) {
    return {
      jobId: `job-cached-${existingKit.id}`,
      dedupeKey,
      status: 'completed',
      existingKitId: existingKit.id,
    };
  }

  // 2. Check for running/queued job with same dedupeKey
  const existingJob = await db.findJobByDedupe(dedupeKey);
  if (existingJob && (existingJob.status === 'queued' || existingJob.status === 'running')) {
    return {
      jobId: existingJob.id,
      dedupeKey,
      status: existingJob.status,
    };
  }

  // 3. Create new Job
  const jobId = `job-${crypto.randomUUID()}`;
  const now = new Date().toISOString();

  const job: Job = {
    id: jobId,
    userId,
    dedupeKey,
    status: 'queued',
    stage: 'extracting_requirements',
    percent: 0,
    message: 'Job submitted and queued for preparation...',
    createdAt: now,
    updatedAt: now,
  };

  await db.createJob(job);

  // 4. Fire and forget async pipeline execution
  setImmediate(async () => {
    try {
      await db.updateJob(jobId, { status: 'running', percent: 5, message: 'Starting pipeline execution...' });

      const llm = process.env.GEMINI_API_KEY ? new GeminiFlashClient() : new MockLlmClient();

      const kit = await runPipeline(
        {
          jd,
          company_url: companyUrl,
          days,
          userId,
        },
        {
          llm,
          policy: process.env.NODE_ENV === 'production' ? 'strict' : 'allow-local',
        },
        {
          onProgress: (p) => {
            db.updateJob(jobId, {
              stage: p.stage,
              percent: p.percent,
              message: p.message,
            });
          },
        }
      );

      // Save kit record to DB
      const kitRecord: KitRecord = {
        id: kit.id || `kit-${Date.now()}`,
        userId,
        dedupeKey,
        version: 1,
        kit,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      await db.createKit(kitRecord);

      // Update job to completed
      await db.updateJob(jobId, {
        status: 'completed',
        percent: 100,
        message: 'Kit generation completed successfully!',
        kitId: kitRecord.id,
        kit,
      });
    } catch (err: any) {
      await db.updateJob(jobId, {
        status: 'failed',
        error: err.message || 'Pipeline execution failed',
        message: `Failed: ${err.message}`,
      });
    }
  });

  return {
    jobId,
    dedupeKey,
    status: 'queued',
  };
}
