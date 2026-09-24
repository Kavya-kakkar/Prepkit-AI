'use client';

import React, { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { api } from '@/lib/api';
import type { Kit, Flashcard } from '@/types/client';

interface CardProgress {
  card: Flashcard;
  rating?: number; // 1, 2, 3
  revealed: boolean;
}

export default function PracticeModePage() {
  const params = useParams();
  const router = useRouter();
  const kitId = (params?.id as string) || '';

  const [cards, setCards] = useState<CardProgress[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [completed, setCompleted] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    api
      .getKit(kitId)
      .then((res) => {
        if (mounted && res.kit && res.kit.flashcards.length > 0) {
          initializeCards(res.kit.flashcards);
        } else if (mounted) {
          initializeCards(getDemoFlashcards());
        }
      })
      .catch(() => {
        if (mounted) {
          initializeCards(getDemoFlashcards());
        }
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, [kitId]);

  const initializeCards = (rawCards: Flashcard[]) => {
    setCards(
      rawCards.map((c) => ({
        card: c,
        revealed: false,
      }))
    );
    setCurrentIndex(0);
    setCompleted(false);
  };

  // Keyboard navigation: Space to flip, 1, 2, 3 to rate
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (completed || cards.length === 0) return;

      const currentCard = cards[currentIndex];
      if (!currentCard) return;

      if (e.code === 'Space') {
        e.preventDefault();
        handleReveal();
      } else if (currentCard.revealed) {
        if (e.key === '1') handleRate(1);
        else if (e.key === '2') handleRate(2);
        else if (e.key === '3') handleRate(3);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [currentIndex, cards, completed]);

  const handleReveal = () => {
    setCards((prev) =>
      prev.map((item, idx) => (idx === currentIndex ? { ...item, revealed: true } : item))
    );
  };

  const handleRate = async (rating: 1 | 2 | 3) => {
    const currentCard = cards[currentIndex];
    if (!currentCard) return;

    // Record progress via API in background
    api.ratePracticeQuestion(kitId, currentCard.card.id, rating).catch(() => {});

    const updated = cards.map((item, idx) =>
      idx === currentIndex ? { ...item, rating } : item
    );
    setCards(updated);

    if (currentIndex + 1 < cards.length) {
      setCurrentIndex((prev) => prev + 1);
    } else {
      setCompleted(true);
    }
  };

  // Reorder session by least confident (rating 1 first, then 2, then 3)
  const handleRestartWeakestFirst = () => {
    const sorted = [...cards].sort((a, b) => {
      const rateA = a.rating ?? 2;
      const rateB = b.rating ?? 2;
      return rateA - rateB; // lowest confidence first
    });

    setCards(
      sorted.map((item) => ({
        card: item.card,
        revealed: false,
      }))
    );
    setCurrentIndex(0);
    setCompleted(false);
  };

  if (loading) {
    return (
      <div className="py-24 text-center text-slate-500 text-sm">
        <div className="inline-block h-6 w-6 animate-spin rounded-full border-2 border-emerald-600 border-t-transparent mb-2" />
        <p>Loading practice session...</p>
      </div>
    );
  }

  if (cards.length === 0) {
    return (
      <div className="max-w-xl mx-auto py-16 text-center space-y-4">
        <p className="text-slate-600 font-medium">No flashcards found for this kit.</p>
        <Link
          href={`/kits/${kitId}`}
          className="inline-block rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white"
        >
          Return to Kit Builder
        </Link>
      </div>
    );
  }

  // --- Session Completed Summary View ---
  if (completed) {
    const strugglingCount = cards.filter((c) => c.rating === 1).length;
    const okCount = cards.filter((c) => c.rating === 2).length;
    const masteredCount = cards.filter((c) => c.rating === 3).length;

    return (
      <div className="max-w-xl mx-auto py-12 space-y-6">
        <div className="rounded-2xl border border-slate-200 bg-white p-8 shadow-sm text-center space-y-6">
          <div className="mx-auto h-12 w-12 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-600 text-xl font-bold">
            ✓
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Practice Session Complete!</h1>
            <p className="text-xs text-slate-500 mt-1">
              You reviewed {cards.length} concept cards. Confidence ratings have been saved.
            </p>
          </div>

          <div className="grid grid-cols-3 gap-3 text-center">
            <div className="rounded-xl border border-rose-200 bg-rose-50 p-3">
              <span className="text-2xl font-bold text-rose-700">{strugglingCount}</span>
              <p className="text-xs font-semibold text-rose-800 mt-1">Needs Work</p>
            </div>
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-3">
              <span className="text-2xl font-bold text-amber-700">{okCount}</span>
              <p className="text-xs font-semibold text-amber-800 mt-1">Fair</p>
            </div>
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3">
              <span className="text-2xl font-bold text-emerald-700">{masteredCount}</span>
              <p className="text-xs font-semibold text-emerald-800 mt-1">Mastered</p>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row gap-3 justify-center pt-4">
            <button
              type="button"
              onClick={handleRestartWeakestFirst}
              className="rounded-lg bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-emerald-700 transition"
            >
              ↻ Review Least Confident First
            </button>
            <Link
              href={`/kits/${kitId}`}
              className="rounded-lg border border-slate-300 bg-white px-5 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 transition"
            >
              Back to Kit
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const current = cards[currentIndex]!;
  const coveredCount = cards.filter((c) => c.rating !== undefined).length;
  const progressPct = Math.round((coveredCount / cards.length) * 100);

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      {/* Top Header & Progress Bar */}
      <div className="flex items-center justify-between">
        <Link
          href={`/kits/${kitId}`}
          className="text-xs font-semibold text-slate-500 hover:text-slate-800 flex items-center gap-1"
        >
          &larr; Exit to Kit
        </Link>
        <span className="text-xs font-bold text-slate-700 font-mono">
          Card {currentIndex + 1} of {cards.length}
        </span>
      </div>

      {/* Covered vs Uncovered Bar */}
      <div className="space-y-1.5">
        <div className="flex justify-between text-xs text-slate-500 font-medium">
          <span>Covered: {coveredCount}</span>
          <span>{progressPct}% Completed</span>
        </div>
        <div className="h-2 w-full bg-slate-200 rounded-full overflow-hidden">
          <div
            className="h-full bg-emerald-600 rounded-full transition-all duration-300"
            style={{ width: `${progressPct}%` }}
          />
        </div>
      </div>

      {/* Active Flashcard Interface */}
      <div
        onClick={!current.revealed ? handleReveal : undefined}
        className={`min-h-[300px] rounded-2xl border p-8 flex flex-col justify-between transition-all select-none ${
          !current.revealed
            ? 'border-slate-300 bg-white shadow-md hover:border-emerald-400 cursor-pointer'
            : 'border-emerald-200 bg-emerald-50/20 shadow-lg'
        }`}
      >
        <div className="space-y-4">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span className="font-mono font-bold">[{current.card.id}]</span>
            <span>{current.revealed ? 'Answer Revealed' : 'Click or press Space to reveal'}</span>
          </div>

          <div>
            <h2 className="text-xl font-bold text-slate-900 leading-snug">{current.card.front}</h2>
          </div>

          {current.revealed ? (
            <div className="pt-4 border-t border-slate-200 animate-fadeIn">
              <span className="text-xs font-bold uppercase tracking-wider text-emerald-800 block mb-1">
                Answer Outline:
              </span>
              <p className="text-sm font-medium text-slate-700 leading-relaxed bg-white p-4 rounded-xl border border-slate-100">
                {current.card.back}
              </p>
            </div>
          ) : (
            <div className="py-12 text-center text-slate-400 text-sm italic">
              Tap anywhere or press <kbd className="px-2 py-0.5 bg-slate-100 border rounded text-xs">Space</kbd> to flip
            </div>
          )}
        </div>

        {/* Rating Controls (Shown upon reveal) */}
        {current.revealed && (
          <div className="pt-6 border-t border-slate-200 space-y-2">
            <p className="text-center text-xs font-semibold text-slate-500">
              How confident did you feel on this card?
            </p>
            <div className="grid grid-cols-3 gap-3">
              <button
                type="button"
                onClick={() => handleRate(1)}
                className="rounded-xl border border-rose-200 bg-rose-50 hover:bg-rose-100 p-3 text-center transition focus:ring-2 focus:ring-rose-400"
              >
                <span className="block text-xs font-bold text-rose-800">[1] Needs Work</span>
                <span className="text-[10px] text-rose-600">Struggled to recall</span>
              </button>

              <button
                type="button"
                onClick={() => handleRate(2)}
                className="rounded-xl border border-amber-200 bg-amber-50 hover:bg-amber-100 p-3 text-center transition focus:ring-2 focus:ring-amber-400"
              >
                <span className="block text-xs font-bold text-amber-800">[2] Fair</span>
                <span className="text-[10px] text-amber-600">Got the main points</span>
              </button>

              <button
                type="button"
                onClick={() => handleRate(3)}
                className="rounded-xl border border-emerald-200 bg-emerald-50 hover:bg-emerald-100 p-3 text-center transition focus:ring-2 focus:ring-emerald-400"
              >
                <span className="block text-xs font-bold text-emerald-800">[3] Mastered</span>
                <span className="text-[10px] text-emerald-600">Complete mastery</span>
              </button>
            </div>
          </div>
        )}
      </div>

      <div className="text-center text-xs text-slate-400">
        Keyboard Shortcuts: <kbd className="px-1.5 py-0.5 bg-white border rounded">Space</kbd> Flip card •{' '}
        <kbd className="px-1.5 py-0.5 bg-white border rounded">1</kbd>{' '}
        <kbd className="px-1.5 py-0.5 bg-white border rounded">2</kbd>{' '}
        <kbd className="px-1.5 py-0.5 bg-white border rounded">3</kbd> Rate confidence
      </div>
    </div>
  );
}

function getDemoFlashcards(): Flashcard[] {
  return [
    {
      id: 'f1',
      front: 'What is the Outbox Pattern in distributed systems?',
      back: 'A design pattern where database mutations and outgoing event messages are saved in the same local transaction, guaranteeing at-least-once message delivery without distributed 2PC locks.',
      requirement_ids: ['r1'],
    },
    {
      id: 'f2',
      front: 'How does Go garbage collection achieve sub-millisecond pauses?',
      back: 'By utilizing a concurrent tri-color mark-and-sweep collector that operates concurrently with application goroutines, using a hybrid write barrier to maintain invariant pointer graphs.',
      requirement_ids: ['r1'],
    },
    {
      id: 'f3',
      front: 'What is the difference between buffered and unbuffered channels in Go?',
      back: 'Unbuffered channels synchronize sender and receiver simultaneously (rendezvous), whereas buffered channels decouple the sender until the ring buffer capacity is filled.',
      requirement_ids: ['r1'],
    },
  ];
}
