import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { ReactNode } from 'react';
import { NextIntlClientProvider } from 'next-intl';
import { getMessages, getLocale } from 'next-intl/server';
import { LanguageSwitcher } from '@/components/language-switcher';
import { AdminUserMenu } from './components/admin-user-menu';
import { AdminNav } from './components/admin-nav';
import Logo from '@/components/common/logo';
import { BookOpen, Plus } from 'lucide-react';

interface AdminMessages {
  admin?: {
    dashboard?: string;
    navigation?: {
      dashboard?: string;
      generations?: string;
      history?: string;
      users?: string;
      pipeline?: string;
      pricing?: string;
    };
  };
}

export default async function AdminLayout({
  children,
}: {
  children: ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    // Redirect to home since auth/login is missing
    redirect('/');
  }

  const { data: profile } = await supabase
    .from('users')
    .select('role')
    .eq('id', user.id)
    .single();

  const role = profile?.role;

  if (role !== 'admin' && role !== 'superadmin') {
    redirect('/');
  }

  const locale = await getLocale();
  const messages = (await getMessages()) as AdminMessages;

  return (
    <NextIntlClientProvider locale={locale} messages={messages}>
      <div className="min-h-screen admin-bg-grid bg-gray-50 dark:bg-transparent">
        <header className="sticky top-0 z-50 w-full admin-header-glass bg-white/80 dark:bg-transparent border-b border-gray-200 dark:border-transparent">
          <div className="flex h-16 items-center justify-between px-6">
            <div className="flex items-center gap-4 sm:gap-6">
              {/* Logo - links to main site */}
              <Logo variant="compact" size="sm" href="/" />

              {/* Quick action buttons */}
              <div className="hidden sm:flex items-center gap-2">
                <Link
                  href="/courses"
                  className="group text-gray-700 dark:text-gray-300 hover:text-purple-600 dark:hover:text-purple-400 text-sm font-medium px-3 py-2 rounded-full bg-gray-100 dark:bg-slate-800 border border-gray-200 dark:border-slate-700 hover:bg-purple-50 dark:hover:bg-purple-500/10 hover:border-purple-200 dark:hover:border-purple-500/30 transition-all flex items-center gap-1.5"
                >
                  <BookOpen className="w-4 h-4" />
                  <span>Каталог</span>
                </Link>
                <Link
                  href="/create"
                  className="group text-gray-700 dark:text-gray-300 hover:text-purple-600 dark:hover:text-purple-400 text-sm font-medium px-3 py-2 rounded-full bg-gradient-to-r from-purple-50 to-blue-50 dark:from-purple-500/5 dark:to-blue-500/5 border border-purple-200 dark:border-purple-500/20 hover:from-purple-100 hover:to-blue-100 dark:hover:from-purple-500/10 dark:hover:to-blue-500/10 transition-all flex items-center gap-1.5"
                >
                  <Plus className="w-4 h-4 text-purple-600 dark:text-purple-400" />
                  <span>Создать курс</span>
                </Link>
              </div>

              {/* Divider */}
              <div className="hidden sm:block h-6 w-px bg-gray-200 dark:bg-slate-700" />

              {/* Admin navigation */}
              <AdminNav role={role} messages={messages} />
            </div>
            <div className="flex items-center gap-3">
              <LanguageSwitcher />
              <AdminUserMenu userEmail={user.email || ''} />
            </div>
          </div>
        </header>
        <main className="px-6 py-8 max-w-[1600px] mx-auto">
          {children}
        </main>
      </div>
    </NextIntlClientProvider>
  );
}
