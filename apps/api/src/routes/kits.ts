import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth.js';
import { startGenerationJob } from '../services/jobRunner.js';
import { patchKit, regenerateSection } from '../services/kitMutations.js';
import { db } from '../repositories/db.js';

export const kitsRouter = Router();

const CreateKitInputSchema = z.object({
  jd: z.string().min(1, 'Job description text cannot be empty'),
  company_url: z.string().optional(),
  days: z.number().int().positive().default(5),
});

const RegenerateInputSchema = z.object({
  section: z.enum(['questions', 'flashcards', 'company_brief']),
  category: z.enum(['technical', 'behavioural', 'system-design', 'company-fit']).optional(),
});

// POST /api/kits — Start generation job (returns 202 Accepted)
kitsRouter.post('/', requireAuth, async (req: Request, res: Response, next) => {
  try {
    const { jd, company_url, days } = CreateKitInputSchema.parse(req.body);
    const userId = req.user!.id;

    const result = await startGenerationJob({
      userId,
      jd,
      companyUrl: company_url,
      days,
    });

    res.status(202).json({
      jobId: result.jobId,
      dedupeKey: result.dedupeKey,
      status: result.status,
      kitId: result.existingKitId,
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/kits — List all kits owned by user
kitsRouter.get('/', requireAuth, async (req: Request, res: Response, next) => {
  try {
    const userId = req.user!.id;
    const kits = await db.listKitsByUser(userId);
    res.json({ kits: kits.map((k) => k.kit) });
  } catch (err) {
    next(err);
  }
});

// POST /api/kits/list — Alternate List endpoint for RPC-style clients
kitsRouter.post('/list', requireAuth, async (req: Request, res: Response, next) => {
  try {
    const userId = req.user!.id;
    const kits = await db.listKitsByUser(userId);
    res.json({ kits: kits.map((k) => k.kit) });
  } catch (err) {
    next(err);
  }
});

// GET /api/kits/:id — Retrieve single kit (owner-scoped)
kitsRouter.get('/:id', requireAuth, async (req: Request, res: Response, next) => {
  try {
    const rawId = req.params.id || req.query.id;
    const id = Array.isArray(rawId) ? (rawId[0] as string) : (rawId as string);

    if (!id || id === 'undefined') {
      res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'Kit ID parameter is required' } });
      return;
    }

    const record = await db.findKitById(id);

    if (!record) {
      console.warn(`[KitsRouter] Kit not found in database: ID=${id}`);
      res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Kit not found' } });
      return;
    }

    if (record.userId !== req.user!.id) {
      console.warn(`[KitsRouter] Access forbidden for user ${req.user!.id} on kit ${id} (owner: ${record.userId})`);
      res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Access denied to this kit' } });
      return;
    }

    res.json(record.kit);
  } catch (err) {
    next(err);
  }
});

// PATCH /api/kits/:id — Inline edit kit
kitsRouter.patch('/:id', requireAuth, async (req: Request, res: Response, next) => {
  try {
    const rawId = req.params.id || req.query.id;
    const id = Array.isArray(rawId) ? (rawId[0] as string) : (rawId as string);

    const updated = await patchKit(id, req.user!.id, req.body);
    res.json(updated.kit);
  } catch (err) {
    next(err);
  }
});

// POST /api/kits/:id/regenerate — Regenerate section preserving pinned/edited items
kitsRouter.post('/:id/regenerate', requireAuth, async (req: Request, res: Response, next) => {
  try {
    const rawId = req.params.id || req.query.id;
    const id = Array.isArray(rawId) ? (rawId[0] as string) : (rawId as string);

    const { section, category } = RegenerateInputSchema.parse(req.body);
    const updated = await regenerateSection(id, req.user!.id, { section, category });
    res.json(updated.kit);
  } catch (err) {
    next(err);
  }
});