'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { api } from '@/lib/api';

interface KitSummary {
  id: string;
  role: { title: string; seniority?: string };
  source: { company: string; company_url?: string; researched_at?: string };
  schedule: { days_available: number };
  status?: string;
  questions_count?: number;
}

export default function DashboardPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const [kits, setKits] = useState<KitSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('');

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      router.replace('/auth');
      return;
    }

    let mounted = true;
    api
      .listKits()
      .then((res) => {
        if (mounted) {
          setKits((res.kits as unknown as KitSummary[]) || []);
        }
      })
      .catch((err: any) => {
        if (err?.status === 401 || err?.code === 'UNAUTHORIZED') {
          router.replace('/auth');
        }
        // API unreachable — show empty state
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });

    return () => { mounted = false; };
  }, [user, authLoading]);

  const filteredKits = kits.filter(
    (k) =>
      k.role.title.toLowerCase().includes(filter.toLowerCase()) ||
      k.source.company.toLowerCase().includes(filter.toLowerCase())
  );

  return (
    <div className="space-y-8">
      {/* Hero Banner */}
      <div className="rounded-2xl bg-gradient-to-r from-emerald-900 via-slate-900 to-slate-950 p-8 text-white shadow-xl relative overflow-hidden">
        <div className="relative z-10 max-w-2xl space-y-3">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/20 px-3 py-1 text-xs font-semibold text-emerald-300 ring-1 ring-inset ring-emerald-500/30">
            Autonomous Pipeline • Appendix A Compliant
          </span>
          <h1 className="text-3xl font-extrabold tracking-tight sm:text-4xl">
            Tailored Interview Preparation Kits
          </h1>
          <p className="text-slate-300 text-sm sm:text-base leading-relaxed">
            Paste any job description and company website. Our system crawls the company, discovers
            interview discussions, extracts verified requirements, and constructs a personalized
            day-by-day prep plan.
          </p>
          <div className="pt-2 flex flex-wrap gap-3">
            <Link
              href="/create"
              className="rounded-lg bg-emerald-500 px-4 py-2.5 text-sm font-semibold text-white shadow hover:bg-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-400 transition"
            >
              + Create Preparation Kit
            </Link>
          </div>
        </div>
      </div>

      {/* Filter and Kit List */}
      <div className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h2 className="text-xl font-bold text-slate-900">Your Interview Kits</h2>
            <p className="text-xs text-slate-500">Each kit is strictly scoped to your account</p>
          </div>

          <div className="w-full sm:w-72">
            <input
              type="text"
              placeholder="Search by role or company..."
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3.5 py-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
            />
          </div>
        </div>

        {loading ? (
          <div className="py-16 text-center text-slate-500 text-sm">
            <div className="inline-block h-6 w-6 animate-spin rounded-full border-2 border-emerald-600 border-t-transparent mb-2" />
            <p>Loading your preparation kits...</p>
          </div>
        ) : filteredKits.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-300 bg-white p-12 text-center">
            <p className="text-slate-600 font-medium">No interview kits found.</p>
            <p className="text-xs text-slate-400 mt-1">Get started by creating your first personalized kit.</p>
            <Link
              href="/create"
              className="inline-block mt-4 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 transition"
            >
              Create Kit Now
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredKits.map((kit) => (
              <div
                key={kit.id}
                className="group relative rounded-xl border border-slate-200 bg-white p-6 shadow-sm hover:shadow-md hover:border-slate-300 transition flex flex-col justify-between"
              >
                <div className="space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <span className="inline-block rounded-md bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-700 border border-emerald-200">
                      {kit.source.company}
                    </span>
                    <span className="text-xs font-medium text-slate-500">
                      {kit.schedule.days_available} Day Plan
                    </span>
                  </div>

                  <div>
                    <h3 className="text-lg font-bold text-slate-900 group-hover:text-emerald-600 transition-colors">
                      {kit.role.title}
                    </h3>
                    {kit.role.seniority && (
                      <p className="text-xs text-slate-500">{kit.role.seniority} Level</p>
                    )}
                  </div>
                </div>

                <div className="mt-6 pt-4 border-t border-slate-100 flex items-center justify-between gap-2">
                  <Link
                    href={`/kits/${kit.id}`}
                    className="text-sm font-semibold text-emerald-600 hover:text-emerald-700 flex items-center gap-1"
                  >
                    Open Kit &rarr;
                  </Link>

                  <Link
                    href={`/kits/${kit.id}/practice`}
                    className="rounded-md bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-200 transition"
                  >
                    Practice Mode
                  </Link>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
