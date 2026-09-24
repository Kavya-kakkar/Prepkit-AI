import { Router, Request, Response } from 'express';
import { db } from '../repositories/db.js';
import { requireAuth } from '../middleware/auth.js';

export const jobsRouter = Router();

jobsRouter.get('/:id', requireAuth, async (req: Request, res: Response, next) => {
  try {
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const job = await db.findJobById(id);
    if (!job) {
      res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Job not found' } });
      return;
    }

    if (job.userId !== req.user!.id) {
      res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Access denied to this job' } });
      return;
    }

    res.json({
      id: job.id,
      status: job.status,
      stage: job.stage,
      percent: job.percent,
      message: job.message,
      kitId: job.kitId,
      kit: job.kit,
      error: job.error,
    });
  } catch (err) {
    next(err);
  }
});
