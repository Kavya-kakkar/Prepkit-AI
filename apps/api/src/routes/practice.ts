import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth.js';
import { calculateNeedScore, rankQuestionsByNeed } from '@ai-prep/core';
import { db } from '../repositories/db.js';
import { PracticeRecord } from '../repositories/types.js';

export const practiceRouter = Router();

const RateQuestionSchema = z.object({
  kitId: z.string().min(1),
  rating: z.union([z.literal(1), z.literal(2), z.literal(3)]),
});

// POST /api/practice/:questionId/rate — Submit confidence rating (1-3)
practiceRouter.post('/:questionId/rate', requireAuth, async (req: Request, res: Response, next) => {
  try {
    const { kitId, rating } = RateQuestionSchema.parse(req.body);
    const questionId = Array.isArray(req.params.questionId) ? req.params.questionId[0] : req.params.questionId;
    const userId = req.user!.id;

    // Verify kit ownership
    const kitRecord = await db.findKitById(kitId);
    if (!kitRecord || kitRecord.userId !== userId) {
      res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Kit not found or access denied' } });
      return;
    }

    const question = kitRecord.kit.questions.find((q) => q.id === questionId);
    if (!question) {
      res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Question not found in kit' } });
      return;
    }

    // Determine if question maps to a must requirement
    const mustReqIds = new Set(
      kitRecord.kit.role.requirements.filter((r) => r.priority === 'must').map((r) => r.id)
    );
    const isMust = question.requirement_ids.some((rid) => mustReqIds.has(rid));

    const existingRecord = await db.getPracticeRecord(userId, questionId);
    const ratings = existingRecord ? [...existingRecord.ratings, rating] : [rating];
    const needScore = calculateNeedScore(ratings, isMust);

    const record: PracticeRecord = {
      userId,
      questionId,
      kitId,
      ratings,
      needScore,
      updatedAt: new Date().toISOString(),
    };

    await db.savePracticeRecord(record);

    res.json({
      questionId,
      ratings,
      needScore,
      isMust,
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/practice/:kitId/next — Get questions prioritized by need score
practiceRouter.get('/:kitId/next', requireAuth, async (req: Request, res: Response, next) => {
  try {
    const kitId = Array.isArray(req.params.kitId) ? req.params.kitId[0] : req.params.kitId;
    const userId = req.user!.id;

    const kitRecord = await db.findKitById(kitId);
    if (!kitRecord || kitRecord.userId !== userId) {
      res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Kit not found or access denied' } });
      return;
    }

    const practiceRecords = await db.listPracticeByUser(userId, kitId);
    const ratingsMap = new Map<string, number[]>();
    practiceRecords.forEach((pr) => {
      ratingsMap.set(pr.questionId, pr.ratings);
    });

    const ranked = rankQuestionsByNeed(
      kitRecord.kit.questions,
      ratingsMap,
      kitRecord.kit.role.requirements
    );

    res.json({
      kitId,
      questions: ranked,
    });
  } catch (err) {
    next(err);
  }
});
