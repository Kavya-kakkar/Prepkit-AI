import type { Metadata } from 'next';
import './globals.css';
import { AuthProvider } from '@/context/AuthContext';
import HeaderNav from '@/components/HeaderNav';

export const metadata: Metadata = {
  title: 'AI Interview Prep Kit | Tailored Interview Success',
  description:
    'Turn any job description and company site into an autonomous, deeply researched interview preparation kit.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-slate-50 text-slate-900 antialiased flex flex-col font-sans">
        <AuthProvider>
          <HeaderNav />

          <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8">
            {children}
          </main>

          <footer className="border-t border-slate-200 bg-white py-6 text-center text-xs text-slate-500">
            <div className="max-w-7xl mx-auto px-4">
              AI Interview Preparation Kit • Compliant with TRAO FS-AI-INTERVIEW-01 Specification
            </div>
          </footer>
        </AuthProvider>
      </body>
    </html>
  );
}
