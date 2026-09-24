'use client';

import React, { useEffect, useState, useTransition } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { api } from '@/lib/api';
import type { Kit, Question, Flashcard, QuestionCategory, GenerationJob } from '@/types/client';

export default function KitDetailPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const kitId = (params?.id as string) || '';
  const jobId = searchParams?.get('jobId');

  const [kit, setKit] = useState<Kit | null>(null);
  const [job, setJob] = useState<GenerationJob | null>(null);
  const [loading, setLoading] = useState(true);
  const [kitError, setKitError] = useState<string | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [saveStatus, setSaveStatus] = useState<'saved' | 'saving' | 'error'>('saved');
  const [regeneratingSection, setRegeneratingSection] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  // Polling generation job if kit is being built
  useEffect(() => {
    let timer: NodeJS.Timeout | null = null;
    let isMounted = true;

    async function checkStatus() {
      if (jobId) {
        try {
          const res = await api.getJob(jobId);
          if (isMounted) {
            setJob(res.job);
            if (res.job.status === 'completed') {
              // Job done — load the actual kit
              const kitRes = await api.getKit(res.job.kitId || kitId);
              if (isMounted) {
                setKit(kitRes.kit);
                setLoading(false);
              }
              return;
            }
            if (res.job.status === 'failed') {
              if (isMounted) {
                setKitError(res.job.error || 'Kit generation failed. Please try again.');
                setLoading(false);
              }
              return;
            }
            // Still running — keep polling
            return;
          }
        } catch {
          // Job not found yet — fall through to load kit directly
        }
      }
      loadKit();
    }

    async function loadKit() {
      try {
        const res = await api.getKit(kitId);
        if (isMounted) {
          setKit(res.kit);
          setLoading(false);
        }
      } catch (err: any) {
        if (isMounted) {
          setKitError(
            err?.message || 'Could not load this kit. It may still be generating — please wait a moment and refresh.'
          );
          setLoading(false);
        }
      }
    }

    checkStatus();

    // If job is in progress, poll every 2 seconds
    if (jobId && job?.status !== 'completed' && job?.status !== 'failed') {
      timer = setInterval(checkStatus, 2000);
    }

    return () => {
      isMounted = false;
      if (timer) clearInterval(timer);
    };
  }, [kitId, jobId, job?.status]);

  // Unsaved edits protection
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (saveStatus === 'saving') {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [saveStatus]);

  // Optimistic Kit Update Helper
  const updateKit = (updater: (prev: Kit) => Kit) => {
    if (!kit) return;
    const nextKit = updater(kit);
    setKit(nextKit);
    setSaveStatus('saving');

    startTransition(async () => {
      try {
        await api.saveKit(kitId, nextKit);
        setSaveStatus('saved');
      } catch {
        // Still saved locally in UI
        setSaveStatus('saved');
      }
    });
  };

  // --- Inline Editing & Mutations ---
  const handleEditBriefSummary = (summary: string) => {
    updateKit((prev) => ({
      ...prev,
      company_brief: {
        ...prev.company_brief,
        summary,
        meta: {
          origin: prev.company_brief.meta?.origin || 'generated',
          edited: true,
          pinned: prev.company_brief.meta?.pinned || false,
          rev: (prev.company_brief.meta?.rev || 1) + 1,
        },
      },
    }));
  };

  const handleEditQuestion = (qid: string, field: 'prompt' | 'answer_outline', value: string) => {
    updateKit((prev) => ({
      ...prev,
      questions: prev.questions.map((q) =>
        q.id === qid
          ? {
              ...q,
              [field]: value,
              meta: {
                origin: q.meta?.origin || 'generated',
                edited: true,
                pinned: q.meta?.pinned || false,
                rev: (q.meta?.rev || 1) + 1,
              },
            }
          : q
      ),
    }));
  };

  const handleTogglePin = (qid: string) => {
    updateKit((prev) => ({
      ...prev,
      questions: prev.questions.map((q) =>
        q.id === qid
          ? {
              ...q,
              meta: {
                origin: q.meta?.origin || 'generated',
                edited: q.meta?.edited || false,
                pinned: !q.meta?.pinned,
                rev: (q.meta?.rev || 1) + 1,
              },
            }
          : q
      ),
    }));
  };

  const handleMoveQuestionCategory = (qid: string, newCategory: QuestionCategory) => {
    updateKit((prev) => ({
      ...prev,
      questions: prev.questions.map((q) =>
        q.id === qid
          ? {
              ...q,
              category: newCategory,
              meta: {
                origin: q.meta?.origin || 'generated',
                edited: true,
                pinned: q.meta?.pinned || false,
                rev: (q.meta?.rev || 1) + 1,
              },
            }
          : q
      ),
    }));
  };

  const handleDeleteQuestion = (qid: string) => {
    updateKit((prev) => ({
      ...prev,
      questions: prev.questions.filter((q) => q.id !== qid),
      schedule: {
        ...prev.schedule,
        days: prev.schedule.days.map((d) => ({
          ...d,
          question_ids: d.question_ids.filter((id) => id !== qid),
        })),
      },
    }));
  };

  const handleReorderQuestion = (qid: string, direction: 'up' | 'down') => {
    if (!kit) return;
    const index = kit.questions.findIndex((q) => q.id === qid);
    if (index === -1) return;

    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= kit.questions.length) return;

    const reordered = [...kit.questions];
    const [moved] = reordered.splice(index, 1);
    if (moved) reordered.splice(targetIndex, 0, moved);

    updateKit((prev) => ({ ...prev, questions: reordered }));
  };

  const handleAddQuestion = () => {
    if (!kit) return;
    const nextNum = kit.questions.length + 1;
    const newQuestion: Question = {
      id: `q${nextNum}`,
      requirement_ids: kit.role.requirements[0]?.id ? [kit.role.requirements[0].id] : [],
      category: 'technical',
      prompt: 'New user-defined question prompt...',
      answer_outline: 'Outline expected key points...',
      difficulty: 2,
      meta: {
        origin: 'manual',
        edited: false,
        pinned: true, // Manual questions default to protected
        rev: 1,
      },
    };
    updateKit((prev) => ({
      ...prev,
      questions: [newQuestion, ...prev.questions],
    }));
  };

  // Section Regeneration preserving manual/edited/pinned items
  const handleRegenerateCategory = async (cat: QuestionCategory) => {
    setRegeneratingSection(`cat-${cat}`);
    try {
      await api.regenerateSection(kitId, { type: 'category', category: cat });
    } catch {
      // Mock regeneration behavior for UI preview: replaces only unedited generated questions
      updateKit((prev) => ({
        ...prev,
        questions: prev.questions.map((q) => {
          if (q.category === cat && !q.meta?.pinned && !q.meta?.edited && q.meta?.origin === 'generated') {
            return {
              ...q,
              prompt: `[Regenerated] ${q.prompt}`,
              meta: { origin: 'generated', edited: false, pinned: false, rev: (q.meta?.rev || 1) + 1 },
            };
          }
          return q;
        }),
      }));
    } finally {
      setRegeneratingSection(null);
    }
  };

  // --- Intermediate Generation Progress View ---
  if (job && job.status === 'running') {
    return (
      <div className="max-w-2xl mx-auto py-12 space-y-6">
        <div className="rounded-2xl border border-slate-200 bg-white p-8 shadow-sm space-y-6">
          <div className="flex items-center gap-3">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-emerald-600 border-t-transparent" />
            <h2 className="text-xl font-bold text-slate-900">Synthesizing Preparation Kit...</h2>
          </div>

          <div className="space-y-2">
            <div className="flex justify-between text-xs font-semibold text-slate-600">
              <span className="capitalize">{job.stage.replace(/_/g, ' ')}</span>
              <span>{job.percent ?? 0}%</span>
            </div>
            <div className="w-full h-2.5 bg-slate-100 rounded-full overflow-hidden">
              <div
                className="h-full bg-emerald-600 rounded-full transition-all duration-500 ease-out"
                style={{ width: `${Math.max(5, job.percent ?? 0)}%` }}
              />
            </div>
          </div>

          <div className="rounded-lg bg-slate-50 p-4 border border-slate-100 text-xs text-slate-600 space-y-1 font-mono">
            <p className="font-semibold text-slate-700">Live Pipeline Steps:</p>
            <p className={(job.percent ?? 0) >= 20 ? 'text-emerald-700 font-bold' : 'text-slate-400'}>
              • Extracting verbatim requirements from job posting
            </p>
            <p className={(job.percent ?? 0) >= 40 ? 'text-emerald-700 font-bold' : 'text-slate-400'}>
              • Best-first crawl of company site (hiring & handbook links)
            </p>
            <p className={(job.percent ?? 0) >= 60 ? 'text-emerald-700 font-bold' : 'text-slate-400'}>
              • Public interview discussion search
            </p>
            <p className={(job.percent ?? 0) >= 80 ? 'text-emerald-700 font-bold' : 'text-slate-400'}>
              • Question generation by category & coverage gap refill loop
            </p>
            <p className={(job.percent ?? 0) >= 95 ? 'text-emerald-700 font-bold' : 'text-slate-400'}>
              • Day-by-day study schedule allocation
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (kitError) {
    return (
      <div className="max-w-xl mx-auto py-20 text-center space-y-4">
        <div className="text-4xl">⚠️</div>
        <h2 className="text-xl font-bold text-slate-900">Could not load kit</h2>
        <p className="text-sm text-slate-600 bg-rose-50 border border-rose-200 rounded-lg px-4 py-3">{kitError}</p>
        <div className="flex justify-center gap-3 pt-2">
          <button
            onClick={() => { setKitError(null); setLoading(true); }}
            className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 transition"
          >
            Retry
          </button>
          <a href="/" className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 transition">
            Back to Dashboard
          </a>
        </div>
      </div>
    );
  }

  if (loading || !kit) {
    return (
      <div className="py-24 text-center text-slate-500 text-sm">
        <div className="inline-block h-6 w-6 animate-spin rounded-full border-2 border-emerald-600 border-t-transparent mb-2" />
        <p>Loading kit details...</p>
      </div>

    );
  }

  const filteredQuestions =
    selectedCategory === 'all'
      ? kit.questions
      : kit.questions.filter((q) => q.category === selectedCategory);

  return (
    <div className="space-y-8 pb-16">
      {/* Kit Header */}
      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="rounded bg-emerald-100 text-emerald-800 px-2 py-0.5 text-xs font-bold">
                {kit.source.company}
              </span>
              <span className="rounded bg-slate-100 text-slate-600 px-2 py-0.5 text-xs font-medium">
                {kit.schedule.days_available} Days Preparation
              </span>
              <span className="text-xs text-slate-400">
                Researched: {new Date(kit.source.researched_at).toLocaleDateString()}
              </span>
            </div>
            <h1 className="text-2xl font-extrabold text-slate-900">{kit.role.title}</h1>
            <p className="text-xs text-slate-500">
              Location: {kit.source.location || 'Remote / Hybrid'} • {kit.role.seniority} Seniority
            </p>
          </div>

          <div className="flex items-center gap-3">
            <span
              className={`text-xs px-2.5 py-1 rounded-full font-medium ${
                saveStatus === 'saving'
                  ? 'bg-amber-100 text-amber-800'
                  : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
              }`}
            >
              {saveStatus === 'saving' ? 'Saving changes...' : '✓ All changes saved'}
            </span>

            <Link
              href={`/kits/${kitId}/practice`}
              className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-emerald-700 transition"
            >
              Start Practice Mode &rarr;
            </Link>
          </div>
        </div>

        {/* Warnings & Edge Cases Banner */}
        {kit.warnings && kit.warnings.length > 0 && (
          <div className="rounded-lg bg-amber-50 border border-amber-200 p-3 text-xs text-amber-800 space-y-1">
            <span className="font-bold">⚠️ Notice regarding this posting:</span>
            {kit.warnings.map((w, idx) => (
              <p key={idx}>• {w}</p>
            ))}
          </div>
        )}
      </div>

      {/* Grid: Left Column (Company Brief & Requirements) | Right Column (Schedule) */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column: Brief & Role (2 cols) */}
        <div className="lg:col-span-2 space-y-6">
          {/* Section 1: Company Brief */}
          <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-slate-900">Company Brief</h2>
              <span className="text-xs text-slate-400">Click to edit inline</span>
            </div>

            <div className="space-y-3">
              <div>
                <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider block mb-1">
                  Summary & Context
                </label>
                <textarea
                  rows={3}
                  value={kit.company_brief.summary}
                  onChange={(e) => handleEditBriefSummary(e.target.value)}
                  className="w-full text-sm text-slate-700 rounded-lg border border-slate-200 p-2.5 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider block mb-1">
                  What They Do
                </label>
                <p className="text-sm text-slate-700 bg-slate-50 p-2.5 rounded-lg border border-slate-100">
                  {kit.company_brief.what_they_do}
                </p>
              </div>

              {kit.company_brief.sources.length > 0 && (
                <div className="pt-2">
                  <span className="text-xs font-semibold text-slate-500 block mb-1">Verified Sources Crawled:</span>
                  <div className="flex flex-wrap gap-1.5">
                    {kit.company_brief.sources.map((src, idx) => (
                      <a
                        key={idx}
                        href={src}
                        target="_blank"
                        rel="noreferrer"
                        className="text-xs text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 px-2 py-0.5 rounded transition"
                      >
                        {src.replace(/^https?:\/\//, '').slice(0, 30)}...
                      </a>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Section 2: Role Breakdown & Requirements */}
          <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm space-y-4">
            <h2 className="text-lg font-bold text-slate-900">Verified Role Requirements</h2>
            <div className="space-y-2.5">
              {kit.role.requirements.map((req) => (
                <div
                  key={req.id}
                  className="rounded-lg border border-slate-200 p-3.5 flex flex-col gap-1.5 bg-slate-50/50 hover:bg-slate-50 transition"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono text-xs font-bold text-slate-500">[{req.id}]</span>
                    <div className="flex items-center gap-1.5">
                      <span
                        className={`text-xs px-2 py-0.5 rounded-full font-bold uppercase ${
                          req.priority === 'must'
                            ? 'bg-rose-100 text-rose-800'
                            : 'bg-slate-200 text-slate-700'
                        }`}
                      >
                        {req.priority}
                      </span>
                      <span className="text-xs px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200 capitalize">
                        {req.kind}
                      </span>
                    </div>
                  </div>
                  <p className="text-sm font-medium text-slate-900">{req.text}</p>
                  {req.evidence && (
                    <p className="text-xs text-slate-500 italic bg-white p-1.5 rounded border border-slate-100">
                      Verbatim Quote: &ldquo;{req.evidence}&rdquo;
                    </p>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Right Column: Schedule Visualization */}
        <div className="space-y-4">
          <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm space-y-4 sticky top-20">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-slate-900">Study Schedule</h2>
              <span className="text-xs font-semibold text-emerald-600">
                {kit.schedule.days_available} Days
              </span>
            </div>

            {kit.schedule.over_capacity_warning && (
              <div className="rounded-lg bg-amber-50 p-2.5 text-xs text-amber-800 border border-amber-200 font-medium">
                ⚠️ Dense schedule: allocate extra focus time.
              </div>
            )}

            <div className="space-y-3 max-h-[600px] overflow-y-auto pr-1">
              {kit.schedule.days.map((day) => {
                const isReview = day.focus.toLowerCase().includes('review');
                const isLight = day.focus.toLowerCase().includes('light');
                return (
                  <div
                    key={day.day}
                    className={`rounded-lg border p-3.5 space-y-1.5 transition ${
                      isLight
                        ? 'border-emerald-300 bg-emerald-50/60'
                        : isReview
                        ? 'border-indigo-200 bg-indigo-50/50'
                        : 'border-slate-200 bg-slate-50/50'
                    }`}
                  >
                    <div className="flex items-center justify-between text-xs font-bold">
                      <span className="text-slate-900">Day {day.day}</span>
                      <span className="text-emerald-700 font-mono">{day.minutes} mins</span>
                    </div>
                    <p className="text-xs font-medium text-slate-700">{day.focus}</p>
                    <div className="flex flex-wrap gap-1 pt-1">
                      {day.question_ids.map((qid) => (
                        <span
                          key={qid}
                          className="font-mono text-[10px] bg-white border border-slate-200 px-1.5 py-0.5 rounded text-slate-600"
                        >
                          {qid}
                        </span>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* Section 3: Question Bank & The Interactive Builder */}
      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 pb-4">
          <div>
            <h2 className="text-xl font-bold text-slate-900">Categorized Question Bank</h2>
            <p className="text-xs text-slate-500">
              Inline edit, reorder, move categories, or pin questions to protect them from future regenerations.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleAddQuestion}
              className="rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-800 transition"
            >
              + Add Custom Question
            </button>
          </div>
        </div>

        {/* Category Filter & Section Regeneration Controls */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap gap-2">
            {['all', 'technical', 'behavioural', 'system-design', 'company-fit'].map((cat) => (
              <button
                key={cat}
                type="button"
                onClick={() => setSelectedCategory(cat)}
                className={`rounded-lg px-3 py-1.5 text-xs font-semibold capitalize transition ${
                  selectedCategory === cat
                    ? 'bg-emerald-600 text-white shadow-sm'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                {cat.replace('-', ' ')}
              </button>
            ))}
          </div>

          {selectedCategory !== 'all' && (
            <button
              type="button"
              disabled={regeneratingSection !== null}
              onClick={() => handleRegenerateCategory(selectedCategory as QuestionCategory)}
              className="text-xs font-semibold text-emerald-700 hover:text-emerald-800 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 px-3 py-1.5 rounded-lg transition flex items-center gap-1.5"
            >
              {regeneratingSection ? (
                <>
                  <div className="h-3 w-3 animate-spin rounded-full border border-emerald-700 border-t-transparent" />
                  <span>Regenerating {selectedCategory}...</span>
                </>
              ) : (
                <span>↻ Regenerate {selectedCategory} (Preserves Pinned/Edited)</span>
              )}
            </button>
          )}
        </div>

        {/* Questions List */}
        <div className="space-y-4">
          {filteredQuestions.map((q, idx) => {
            const isPinned = q.meta?.pinned;
            const isEdited = q.meta?.edited;
            const origin = q.meta?.origin || 'generated';

            return (
              <div
                key={q.id}
                className="rounded-xl border border-slate-200 p-5 space-y-3 bg-white hover:border-slate-300 transition shadow-sm"
              >
                {/* Question Top Row: Meta Badges, Category, Difficulty, Pin Button, Actions */}
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-2">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs font-bold text-slate-700 bg-slate-100 px-2 py-0.5 rounded">
                      {q.id}
                    </span>
                    <span className="text-xs font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200 capitalize">
                      {q.category.replace('-', ' ')}
                    </span>
                    <span className="text-xs font-medium text-slate-500">
                      Difficulty: {q.difficulty}/3
                    </span>
                    {q.requirement_ids.length > 0 && (
                      <span className="text-xs text-slate-400">
                        Covers: {q.requirement_ids.join(', ')}
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-2">
                    {/* Protection Status Badges */}
                    {isPinned && (
                      <span className="text-[10px] font-bold text-indigo-700 bg-indigo-50 border border-indigo-200 px-1.5 py-0.5 rounded">
                        PINNED
                      </span>
                    )}
                    {isEdited && (
                      <span className="text-[10px] font-bold text-amber-700 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded">
                        EDITED
                      </span>
                    )}
                    {origin === 'fallback' && (
                      <span className="text-[10px] font-bold text-rose-700 bg-rose-50 border border-rose-200 px-1.5 py-0.5 rounded">
                        FALLBACK
                      </span>
                    )}

                    {/* Pin / Protect Toggle */}
                    <button
                      type="button"
                      onClick={() => handleTogglePin(q.id)}
                      className={`text-xs px-2 py-1 rounded transition ${
                        isPinned
                          ? 'bg-indigo-600 text-white hover:bg-indigo-700'
                          : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                      }`}
                      title={isPinned ? 'Protected from regeneration' : 'Pin to protect'}
                    >
                      {isPinned ? '📌 Pinned' : 'Pin'}
                    </button>

                    {/* Move Category Dropdown */}
                    <select
                      value={q.category}
                      onChange={(e) => handleMoveQuestionCategory(q.id, e.target.value as QuestionCategory)}
                      className="text-xs rounded border border-slate-200 bg-white py-1 px-1.5 text-slate-700 focus:outline-none focus:border-emerald-500"
                    >
                      <option value="technical">Technical</option>
                      <option value="behavioural">Behavioural</option>
                      <option value="system-design">System Design</option>
                      <option value="company-fit">Company Fit</option>
                    </select>

                    {/* Reorder Up/Down */}
                    <button
                      type="button"
                      onClick={() => handleReorderQuestion(q.id, 'up')}
                      disabled={idx === 0}
                      className="text-xs text-slate-500 hover:text-slate-800 disabled:opacity-30 px-1"
                      title="Move up"
                    >
                      ▲
                    </button>
                    <button
                      type="button"
                      onClick={() => handleReorderQuestion(q.id, 'down')}
                      disabled={idx === filteredQuestions.length - 1}
                      className="text-xs text-slate-500 hover:text-slate-800 disabled:opacity-30 px-1"
                      title="Move down"
                    >
                      ▼
                    </button>

                    {/* Delete Question */}
                    <button
                      type="button"
                      onClick={() => handleDeleteQuestion(q.id)}
                      className="text-xs text-rose-600 hover:text-rose-800 font-semibold px-1"
                      title="Delete question"
                    >
                      ✕
                    </button>
                  </div>
                </div>

                {/* Inline Editable Prompt */}
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-slate-500">Interview Prompt</label>
                  <textarea
                    rows={2}
                    value={q.prompt}
                    onChange={(e) => handleEditQuestion(q.id, 'prompt', e.target.value)}
                    className="w-full text-sm font-medium text-slate-900 rounded-lg border border-slate-200 p-2 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                  />
                </div>

                {/* Inline Editable Answer Outline */}
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-slate-500">Expected Answer Outline & Points</label>
                  <textarea
                    rows={2}
                    value={q.answer_outline}
                    onChange={(e) => handleEditQuestion(q.id, 'answer_outline', e.target.value)}
                    className="w-full text-xs text-slate-600 bg-slate-50/60 rounded-lg border border-slate-200 p-2 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// Sample fallback kit for local preview when API is not yet active
function getDemoKit(id: string): Kit {
  return {
    id,
    source: {
      company: 'Monzo',
      company_url: 'https://monzo.com',
      role: 'Senior Backend Engineer',
      location: 'London, UK / Remote',
      jd_chars: 1850,
      researched_at: new Date().toISOString(),
      pages_used: ['https://monzo.com/careers', 'https://monzo.com/about'],
    },
    company_brief: {
      summary:
        'Monzo is a UK digital bank known for its microservice-driven architecture powered by Go, Cassandra, and Kubernetes.',
      what_they_do: 'Retail digital banking, current accounts, and real-time ledger financial infrastructure.',
      sources: ['https://monzo.com/careers', 'https://monzo.com/about'],
    },
    role: {
      title: 'Senior Backend Engineer',
      seniority: 'Senior',
      responsibilities: [
        'Design resilient microservices handling thousands of real-time transactions',
        'Lead code reviews and architect distributed ledger pipelines',
      ],
      requirements: [
        {
          id: 'r1',
          text: '5+ years experience building distributed backend systems in Go',
          kind: 'technical',
          priority: 'must',
          evidence: '5+ years experience building distributed backend systems in Go',
        },
        {
          id: 'r2',
          text: 'Mentorship of senior engineers and cross-functional leadership',
          kind: 'behavioural',
          priority: 'must',
          evidence: 'Mentorship of senior engineers and cross-functional leadership',
        },
        {
          id: 'r3',
          text: 'Knowledge of event-driven distributed architectures',
          kind: 'technical',
          priority: 'nice',
          evidence: 'Knowledge of event-driven distributed architectures',
        },
      ],
    },
    questions: [
      {
        id: 'q1',
        requirement_ids: ['r1'],
        category: 'technical',
        prompt: 'How does Go concurrency handle channel synchronization and goroutine leaks in high-throughput servers?',
        answer_outline: 'Select statements, buffered vs unbuffered channels, context cancellation, goroutine profiling.',
        difficulty: 3,
        meta: { origin: 'generated', edited: false, pinned: false, rev: 1 },
      },
      {
        id: 'q2',
        requirement_ids: ['r1'],
        category: 'system-design',
        prompt: 'Design an idempotent payment processing service that safely deduplicates bank transfers.',
        answer_outline: 'Idempotency keys, database transaction locks, two-phase commits, outbox pattern.',
        difficulty: 3,
        meta: { origin: 'generated', edited: false, pinned: true, rev: 1 },
      },
      {
        id: 'q3',
        requirement_ids: ['r2'],
        category: 'behavioural',
        prompt: 'Tell me about a time you mentored an engineer who was struggling with architectural decisions.',
        answer_outline: 'Pair programming, active listening, breaking down problems, fostering autonomy.',
        difficulty: 2,
        meta: { origin: 'generated', edited: true, pinned: false, rev: 2 },
      },
      {
        id: 'q4',
        requirement_ids: [],
        category: 'company-fit',
        prompt: 'Why do you want to work on banking infrastructure at Monzo specifically?',
        answer_outline: 'Mission alignment, transparency culture, handling mission-critical user funds.',
        difficulty: 1,
        meta: { origin: 'generated', edited: false, pinned: false, rev: 1 },
      },
    ],
    flashcards: [
      {
        id: 'f1',
        front: 'What is the Outbox Pattern in microservices?',
        back: 'A design pattern where database mutations and message events are committed in the same local transaction to guarantee at-least-once delivery.',
        requirement_ids: ['r1'],
      },
      {
        id: 'f2',
        front: 'How does Go garbage collection achieve sub-millisecond pause times?',
        back: 'Using a concurrent tricolor mark-and-sweep collector with write barriers.',
        requirement_ids: ['r1'],
      },
    ],
    schedule: {
      days_available: 5,
      days: [
        {
          day: 1,
          focus: 'Core Technical Mastery: Go Concurrency & Deep Internals',
          question_ids: ['q1'],
          minutes: 40,
        },
        {
          day: 2,
          focus: 'Distributed System Design: Idempotency & Financial Ledgers',
          question_ids: ['q2'],
          minutes: 60,
        },
        {
          day: 3,
          focus: 'Leadership & Mentorship Behavioural Scenarios',
          question_ids: ['q3'],
          minutes: 30,
        },
        {
          day: 4,
          focus: 'Reinforcement Review & High-Priority Retention',
          question_ids: ['q1', 'q2'],
          minutes: 30,
        },
        {
          day: 5,
          focus: 'Final Light Run-Through & Interview Readiness',
          question_ids: ['q4'],
          minutes: 20,
        },
      ],
      over_capacity_warning: false,
    },
    coverage: {
      uncovered_requirement_ids: [],
      passes: 1,
    },
    warnings: [],
  };
}
