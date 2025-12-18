import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { ReactNode } from 'react';
import { NextIntlClientProvider } from 'next-intl';
import { getMessages, getLocale } from 'next-intl/server';
import { LanguageSwitcher } from '@/components/language-switcher';
import { AdminUserMenu } from './components/admin-user-menu';

interface AdminMessages {
  admin?: {
    dashboard?: string;
    navigation?: {
      generations?: string;
      history?: string;
      pipeline?: string;
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
      <div className="min-h-screen admin-bg-grid">
        <header className="sticky top-0 z-50 w-full admin-header-glass">
          <div className="flex h-16 items-center justify-between px-6">
            <div className="flex items-center gap-8">
              <Link
                className="flex items-center space-x-2 group"
                href="/admin/generation/history"
              >
                <span className="hidden font-bold text-lg sm:inline-block bg-gradient-to-r from-cyan-400 to-purple-400 bg-clip-text text-transparent group-hover:from-cyan-300 group-hover:to-purple-300 transition-all">
                  {messages.admin?.dashboard || 'Admin Dashboard'}
                </span>
              </Link>
              <nav className="flex items-center space-x-1 text-sm font-medium">
                <Link className="admin-nav-link px-3 py-2 rounded-md" href="/admin/generation/history">
                  {messages.admin?.navigation?.generations || 'Generations'}
                </Link>
                <Link className="admin-nav-link px-3 py-2 rounded-md" href="/admin/generation/history">
                  {messages.admin?.navigation?.history || 'History'}
                </Link>
                {role === 'superadmin' && (
                  <Link className="admin-nav-link admin-nav-link-active px-3 py-2 rounded-md" href="/admin/pipeline">
                    {messages.admin?.navigation?.pipeline || 'Pipeline'}
                  </Link>
                )}
              </nav>
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
