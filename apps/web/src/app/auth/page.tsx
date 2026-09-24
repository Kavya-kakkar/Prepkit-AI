'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';

export default function AuthPage() {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const { login, register } = useAuth();
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      if (mode === 'login') {
        await login(email, password);
      } else {
        await register(email, password);
      }
      router.push('/');
    } catch (err: any) {
      setError(err?.message || 'Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-[70vh] flex items-center justify-center px-4">
      <div className="w-full max-w-md space-y-6">
        {/* Logo / Brand */}
        <div className="text-center space-y-2">
          <div className="inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-600 text-white font-extrabold text-2xl shadow-lg mx-auto">
            P
          </div>
          <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight">
            PrepKit<span className="text-emerald-600">.ai</span>
          </h1>
          <p className="text-sm text-slate-500">
            {mode === 'login'
              ? 'Sign in to access your interview preparation kits.'
              : 'Create your account to get started.'}
          </p>
        </div>

        {/* Tab Switcher */}
        <div className="flex rounded-xl overflow-hidden border border-slate-200 bg-slate-50">
          <button
            type="button"
            onClick={() => { setMode('login'); setError(null); }}
            className={`flex-1 py-2.5 text-sm font-semibold transition-all ${mode === 'login'
              ? 'bg-white text-slate-900 shadow-sm border-r border-slate-200'
              : 'text-slate-500 hover:text-slate-700'
              }`}
          >
            Sign In
          </button>
          <button
            type="button"
            onClick={() => { setMode('register'); setError(null); }}
            className={`flex-1 py-2.5 text-sm font-semibold transition-all ${mode === 'register'
              ? 'bg-white text-slate-900 shadow-sm'
              : 'text-slate-500 hover:text-slate-700'
              }`}
          >
            Create Account
          </button>
        </div>

        {/* Form */}
        <form
          onSubmit={handleSubmit}
          className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-5"
        >
          {error && (
            <div className="rounded-lg bg-rose-50 border border-rose-200 px-4 py-3 text-sm text-rose-700">
              {error}
            </div>
          )}

          <div className="space-y-1.5">
            <label htmlFor="email" className="block text-sm font-semibold text-slate-700">
              Email address
            </label>
            <input
              id="email"
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              className="w-full rounded-lg border border-slate-300 px-3.5 py-2.5 text-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
            />
          </div>

          <div className="space-y-1.5">
            <label htmlFor="password" className="block text-sm font-semibold text-slate-700">
              Password
            </label>
            <input
              id="password"
              type="password"
              required
              minLength={6}
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="At least 6 characters"
              className="w-full rounded-lg border border-slate-300 px-3.5 py-2.5 text-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-emerald-700 disabled:opacity-50 transition flex items-center justify-center gap-2"
          >
            {loading ? (
              <>
                <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                <span>{mode === 'login' ? 'Signing in...' : 'Creating account...'}</span>
              </>
            ) : mode === 'login' ? (
              'Sign In →'
            ) : (
              'Create Account →'
            )}
          </button>
        </form>

        <p className="text-center text-xs text-slate-400">
          Your kits are private and scoped only to your account.
        </p>
      </div>
    </div>
  );
}
