'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';

export default function HeaderNav() {
  const { user, loading, logout } = useAuth();
  const router = useRouter();

  const handleLogout = async () => {
    await logout();
    router.push('/auth');
  };

  return (
    <header className="sticky top-0 z-40 w-full border-b border-slate-200 bg-white/95 backdrop-blur">
      <div className="max-w-7xl mx-auto flex h-16 items-center justify-between px-4 sm:px-6 lg:px-8">
        {/* Brand */}
        <div className="flex items-center gap-6">
          <Link href="/" className="flex items-center gap-2">
            <div className="h-9 w-9 rounded-lg bg-emerald-600 flex items-center justify-center text-white font-bold text-lg shadow-sm">
              P
            </div>
            <span className="font-bold text-lg tracking-tight text-slate-900">
              PrepKit<span className="text-emerald-600 font-semibold">.ai</span>
            </span>
          </Link>

          {user && (
            <nav className="hidden md:flex items-center gap-5 text-sm font-medium text-slate-600">
              <Link href="/" className="hover:text-emerald-600 transition-colors">
                Dashboard
              </Link>
              <Link href="/create" className="hover:text-emerald-600 transition-colors">
                Create Kit
              </Link>
            </nav>
          )}
        </div>

        {/* Right side */}
        <div className="flex items-center gap-3">
          {loading ? (
            <div className="h-4 w-4 animate-spin rounded-full border-2 border-emerald-500 border-t-transparent" />
          ) : user ? (
            <>
              {/* Logged-in state */}
              <span className="hidden sm:inline text-xs text-slate-500 truncate max-w-[160px]">
                {user.email}
              </span>
              <Link
                href="/create"
                className="inline-flex items-center justify-center rounded-lg bg-emerald-600 px-3.5 py-2 text-sm font-medium text-white shadow-sm hover:bg-emerald-700 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2 transition-all"
              >
                + New Kit
              </Link>
              <button
                type="button"
                onClick={handleLogout}
                className="rounded-lg border border-slate-200 px-3.5 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 transition"
              >
                Sign Out
              </button>
            </>
          ) : (
            <>
              {/* Logged-out state */}
              <Link
                href="/auth"
                className="rounded-lg border border-slate-200 px-3.5 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 transition"
              >
                Sign In
              </Link>
              <Link
                href="/auth"
                className="inline-flex items-center justify-center rounded-lg bg-emerald-600 px-3.5 py-2 text-sm font-medium text-white shadow-sm hover:bg-emerald-700 transition"
              >
                Get Started
              </Link>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
