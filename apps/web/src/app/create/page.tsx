'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { api } from '@/lib/api';

export default function CreateKitPage() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const [tab, setTab] = useState<'single' | 'batch'>('single');

  // Single Role Form
  const [jd, setJd] = useState('');
  const [companyUrl, setCompanyUrl] = useState('');
  const [days, setDays] = useState(5);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Batch Form
  const [batchFileContent, setBatchFileContent] = useState<string | null>(null);
  const [batchFileName, setBatchFileName] = useState<string | null>(null);
  const [batchError, setBatchError] = useState<string | null>(null);

  const handleSingleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!jd.trim()) {
      setError('Please paste a job description.');
      return;
    }
    if (!companyUrl.trim()) {
      setError('Please provide the company website address.');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const res = await api.createKit({
        jd: jd.trim(),
        company_url: companyUrl.trim(),
        days: Number(days),
      });

      // Redirect to the kit page — poll job progress there
      const targetId = res.kit_id || res.job_id;
      router.push(`/kits/${targetId}?jobId=${res.job_id}`);
    } catch (err: any) {
      if (err?.status === 401 || err?.code === 'UNAUTHORIZED' || err?.code === 'SESSION_EXPIRED') {
        router.push('/auth');
        return;
      }
      setError(err?.message || 'Failed to start kit generation. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setBatchFileName(file.name);
    setBatchError(null);

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const text = event.target?.result as string;
        const parsed = JSON.parse(text);
        if (!Array.isArray(parsed)) {
          throw new Error('Batch file must contain a JSON array of cases.');
        }
        setBatchFileContent(text);
      } catch (err: unknown) {
        setBatchError(err instanceof Error ? err.message : 'Invalid JSON file.');
      }
    };
    reader.readAsText(file);
  };

  const handleBatchSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!batchFileContent) {
      setBatchError('Please select a valid JSON cases file.');
      return;
    }

    setLoading(true);
    try {
      // Batch mode navigates to dashboard with feedback
      router.push('/?batch=started');
    } finally {
      setLoading(false);
    }
  };

  // Redirect to auth if not logged in
  if (!authLoading && !user) {
    router.replace('/auth');
    return null;
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="border-b border-slate-200 pb-4">
        <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Create Interview Preparation Kit</h1>
        <p className="text-sm text-slate-500 mt-1">
          Provide the role details and let our system research the company and synthesize your custom study plan.
        </p>

        {/* Tab Switcher */}
        <div className="flex gap-4 mt-6">
          <button
            type="button"
            onClick={() => setTab('single')}
            className={`pb-2 text-sm font-semibold border-b-2 transition-colors ${
              tab === 'single'
                ? 'border-emerald-600 text-emerald-600'
                : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            Single Role
          </button>
          <button
            type="button"
            onClick={() => setTab('batch')}
            className={`pb-2 text-sm font-semibold border-b-2 transition-colors ${
              tab === 'batch'
                ? 'border-emerald-600 text-emerald-600'
                : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            Batch Upload (Appendix B)
          </button>
        </div>
      </div>

      {tab === 'single' ? (
        <form onSubmit={handleSingleSubmit} className="space-y-6 bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
          {error && (
            <div className="rounded-lg bg-rose-50 border border-rose-200 p-3 text-sm text-rose-700">
              {error}
            </div>
          )}

          {/* Job Description */}
          <div className="space-y-2">
            <label htmlFor="jd" className="block text-sm font-semibold text-slate-900">
              Job Description <span className="text-rose-500">*</span>
            </label>
            <p className="text-xs text-slate-500">
              Paste the verbatim job posting text. Requirements are extracted and verified against this text.
            </p>
            <textarea
              id="jd"
              rows={8}
              required
              value={jd}
              onChange={(e) => setJd(e.target.value)}
              placeholder="e.g. Senior Backend Engineer at Monzo... Responsibilities: ... Requirements: 5+ years with Go and distributed systems..."
              className="w-full rounded-lg border border-slate-300 p-3 text-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
            />
            {jd.length > 0 && jd.length < 100 && (
              <p className="text-xs text-amber-600 font-medium">
                Note: Short descriptions produce a thin kit with honest warning tags per spec requirements.
              </p>
            )}
          </div>

          {/* Company Website */}
          <div className="space-y-2">
            <label htmlFor="companyUrl" className="block text-sm font-semibold text-slate-900">
              Company Website Address <span className="text-rose-500">*</span>
            </label>
            <p className="text-xs text-slate-500">
              Our crawler starts here to discover their mission, tech stack, and hiring process.
            </p>
            <input
              id="companyUrl"
              type="text"
              required
              value={companyUrl}
              onChange={(e) => setCompanyUrl(e.target.value)}
              placeholder="https://example.com or http://localhost:8099/acme/"
              className="w-full rounded-lg border border-slate-300 px-3.5 py-2.5 text-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
            />
          </div>

          {/* Days Available */}
          <div className="space-y-2">
            <div className="flex justify-between items-center">
              <label htmlFor="days" className="block text-sm font-semibold text-slate-900">
                Days Until Interview: <span className="text-emerald-600 font-bold">{days} Days</span>
              </label>
              <span className="text-xs text-slate-400">Range: 1 to 60 days</span>
            </div>
            <input
              id="days"
              type="range"
              min={1}
              max={60}
              value={days}
              onChange={(e) => setDays(Number(e.target.value))}
              className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-emerald-600"
            />
            <div className="flex justify-between text-xs text-slate-400">
              <span>1 Day (Intensive)</span>
              <span>7 Days (Balanced)</span>
              <span>14 Days (Extended)</span>
              <span>60 Days</span>
            </div>
          </div>

          {/* Submit CTA */}
          <div className="pt-4 border-t border-slate-100 flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={() => router.push('/')}
              className="rounded-lg px-4 py-2 text-sm font-medium text-slate-600 hover:text-slate-800"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="rounded-lg bg-emerald-600 px-6 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-emerald-700 disabled:opacity-50 transition flex items-center gap-2"
            >
              {loading ? (
                <>
                  <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                  <span>Starting Research Pipeline...</span>
                </>
              ) : (
                <span>Generate Prep Kit &rarr;</span>
              )}
            </button>
          </div>
        </form>
      ) : (
        <form onSubmit={handleBatchSubmit} className="space-y-6 bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
          {batchError && (
            <div className="rounded-lg bg-rose-50 border border-rose-200 p-3 text-sm text-rose-700">
              {batchError}
            </div>
          )}

          <div className="space-y-3">
            <label className="block text-sm font-semibold text-slate-900">
              Upload Cases JSON File (Appendix B Format)
            </label>
            <p className="text-xs text-slate-500">
              File must contain an array of cases with <code>id</code>, <code>jd</code>, <code>company_url</code>, and <code>days</code>.
            </p>

            <div className="border-2 border-dashed border-slate-300 rounded-xl p-8 text-center hover:border-emerald-500 transition-colors">
              <input
                type="file"
                accept=".json"
                onChange={handleFileUpload}
                className="hidden"
                id="batchFileInput"
              />
              <label htmlFor="batchFileInput" className="cursor-pointer space-y-2 block">
                <div className="text-sm font-medium text-emerald-600 hover:text-emerald-700">
                  {batchFileName ? `Selected: ${batchFileName}` : 'Click to select or drag and drop a JSON file'}
                </div>
                <p className="text-xs text-slate-400">cases.json up to 5MB</p>
              </label>
            </div>
          </div>

          <div className="pt-4 border-t border-slate-100 flex items-center justify-end gap-3">
            <button
              type="submit"
              disabled={!batchFileContent || loading}
              className="rounded-lg bg-emerald-600 px-6 py-2 text-sm font-semibold text-white shadow-sm hover:bg-emerald-700 disabled:opacity-50 transition"
            >
              Run Batch Evaluation
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
