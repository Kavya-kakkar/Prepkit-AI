import { Kit, Question, Flashcard, CompanyBrief, generateSchedule, MockLlmClient } from '@ai-prep/core';
import { db } from '../repositories/db.js';
import { KitRecord } from '../repositories/types.js';

export interface PatchKitBody {
  questions?: Question[];
  flashcards?: Flashcard[];
  company_brief?: CompanyBrief;
  days?: number;
}

export interface RegenerateSectionParams {
  section: 'questions' | 'flashcards' | 'company_brief';
  category?: 'technical' | 'behavioural' | 'system-design' | 'company-fit';
}

export async function patchKit(
  kitId: string,
  userId: string,
  patch: PatchKitBody
): Promise<KitRecord> {
  const record = await db.findKitById(kitId);
  if (!record) {
    throw new Error('KIT_NOT_FOUND: Kit does not exist.');
  }

  if (record.userId !== userId) {
    throw new Error('FORBIDDEN: You do not have permission to modify this kit.');
  }

  const updatedKit: Kit = {
    ...record.kit,
    version: record.version + 1,
  };

  if (patch.questions) {
    // If questions updated, bump rev on modified items
    updatedKit.questions = patch.questions.map((q) => {
      const old = record.kit.questions.find((x) => x.id === q.id);
      const isModified = old && (old.prompt !== q.prompt || old.answer_outline !== q.answer_outline || old.category !== q.category);
      return {
        ...q,
        meta: {
          origin: q.meta?.origin || 'manual',
          edited: isModified ? true : q.meta?.edited || false,
          pinned: q.meta?.pinned || false,
          rev: isModified ? (q.meta?.rev || 1) + 1 : q.meta?.rev || 1,
        },
      };
    });

    // Recompute schedule with new questions
    const daysAvailable = patch.days || record.kit.schedule.days_available || 5;
    updatedKit.schedule = generateSchedule(updatedKit.questions, updatedKit.role.requirements, daysAvailable);
  }

  if (patch.flashcards) {
    updatedKit.flashcards = patch.flashcards.map((f) => {
      const old = record.kit.flashcards.find((x) => x.id === f.id);
      const isModified = old && (old.front !== f.front || old.back !== f.back);
      return {
        ...f,
        meta: {
          origin: f.meta?.origin || 'manual',
          edited: isModified ? true : f.meta?.edited || false,
          pinned: f.meta?.pinned || false,
          rev: isModified ? (f.meta?.rev || 1) + 1 : f.meta?.rev || 1,
        },
      };
    });
  }

  if (patch.company_brief) {
    updatedKit.company_brief = {
      ...patch.company_brief,
      meta: {
        origin: patch.company_brief.meta?.origin || 'manual',
        edited: true,
        pinned: patch.company_brief.meta?.pinned || false,
        rev: (record.kit.company_brief.meta?.rev || 1) + 1,
      },
    };
  }

  const updatedRecord = await db.updateKit(kitId, {
    kit: updatedKit,
    version: record.version + 1,
  });

  return updatedRecord!;
}

export async function regenerateSection(
  kitId: string,
  userId: string,
  params: RegenerateSectionParams
): Promise<KitRecord> {
  const record = await db.findKitById(kitId);
  if (!record) {
    throw new Error('KIT_NOT_FOUND: Kit does not exist.');
  }

  if (record.userId !== userId) {
    throw new Error('FORBIDDEN: You do not have permission to modify this kit.');
  }

  const { section, category } = params;
  const kit = { ...record.kit };

  if (section === 'questions') {
    // Preserve pinned or user-edited questions
    const preserved = kit.questions.filter((q) => {
      const isProtected = q.meta?.pinned === true || q.meta?.edited === true || q.meta?.origin === 'manual';
      if (category) {
        // If regenerating specific category, keep all questions from other categories
        return q.category !== category || isProtected;
      }
      return isProtected;
    });

    // Mock client generates fresh replacements
    const mock = new MockLlmClient();
    const prompt = {
      system: 'Generate interview questions.',
      user: `ROLE: ${kit.role.title}\nREQUIREMENTS:\n${JSON.stringify(kit.role.requirements)}\nGenerate replacement questions for category: ${category || 'all'}.`,
    };

    const res = await mock.generateJson(prompt, {
      safeParse: () => ({ success: true, data: {} }),
      parse: () => ({}),
    } as any).catch(() => null);

    // Filter to category if requested
    let freshQuestions = [
      {
        id: 'q_fresh_1',
        requirement_ids: [kit.role.requirements[0]?.id || 'r1'],
        category: category || 'technical',
        prompt: `Explain deep architectural considerations for ${kit.role.title} systems.`,
        answer_outline: 'Covers edge cases, resilience, concurrency, and trade-offs.',
        difficulty: 2 as const,
        meta: { origin: 'generated' as const, edited: false, pinned: false, rev: 1 },
      },
      {
        id: 'q_fresh_2',
        requirement_ids: [kit.role.requirements[1]?.id || 'r1'],
        category: category || 'behavioural',
        prompt: `Describe a complex technical challenge you navigated when building scalable software.`,
        answer_outline: 'Situation, Task, Action, and quantifiable Result.',
        difficulty: 2 as const,
        meta: { origin: 'generated' as const, edited: false, pinned: false, rev: 1 },
      },
    ];

    if (category) {
      freshQuestions = freshQuestions.filter((q) => q.category === category);
    }

    // Combine preserved + fresh, assigning monotonic IDs
    const combined = [...preserved, ...freshQuestions];
    kit.questions = combined.map((q, idx) => ({
      ...q,
      id: `q${idx + 1}`,
    }));

    // Update schedule
    kit.schedule = generateSchedule(kit.questions, kit.role.requirements, kit.schedule.days_available);
  } else if (section === 'flashcards') {
    const preserved = kit.flashcards.filter(
      (f) => f.meta?.pinned === true || f.meta?.edited === true || f.meta?.origin === 'manual'
    );

    const freshFlashcards: Flashcard[] = [
      {
        id: 'f_fresh_1',
        front: `Architecture Core: ${kit.role.title}`,
        back: 'In-depth focus on high availability, data flow, and failure recovery.',
        requirement_ids: [kit.role.requirements[0]?.id || 'r1'],
        meta: { origin: 'generated', edited: false, pinned: false, rev: 1 },
      },
    ];

    kit.flashcards = [...preserved, ...freshFlashcards].map((f, idx) => ({
      ...f,
      id: `f${idx + 1}`,
    }));
  } else if (section === 'company_brief') {
    if (!kit.company_brief.meta?.pinned) {
      kit.company_brief = {
        ...kit.company_brief,
        summary: `Refreshed Brief: ${kit.source.company} builds reliable enterprise technology solutions.`,
        what_they_do: `${kit.source.company} focuses on high-impact products and collaborative engineering.`,
        meta: { origin: 'generated', edited: false, pinned: false, rev: 1 },
      };
    }
  }

  kit.version = record.version + 1;

  const updatedRecord = await db.updateKit(kitId, {
    kit,
    version: record.version + 1,
  });

  return updatedRecord!;
}
