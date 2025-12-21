'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

interface AdminNavProps {
  role: string | undefined;
  messages: {
    admin?: {
      navigation?: {
        dashboard?: string;
        generations?: string;
        history?: string;
        users?: string;
        pipeline?: string;
        pricing?: string;
      };
    };
  };
}

export function AdminNav({ role, messages }: AdminNavProps) {
  const pathname = usePathname();

  const isActive = (path: string, exact: boolean = false) => {
    if (exact) return pathname === path;
    return pathname.startsWith(path);
  };

  return (
    <nav className="flex items-center space-x-1 text-sm font-medium">
      <Link
        className={`admin-nav-link px-3 py-2 rounded-md text-gray-700 dark:text-gray-300 hover:text-purple-600 dark:hover:text-purple-400 hover:bg-gray-100 dark:hover:bg-slate-800 transition-colors ${
          isActive('/admin', true) ? 'admin-nav-link-active bg-purple-50 dark:bg-purple-500/10 text-purple-600 dark:text-purple-400' : ''
        }`}
        href="/admin"
      >
        {messages.admin?.navigation?.dashboard || 'Dashboard'}
      </Link>
      <Link
        className={`admin-nav-link px-3 py-2 rounded-md text-gray-700 dark:text-gray-300 hover:text-purple-600 dark:hover:text-purple-400 hover:bg-gray-100 dark:hover:bg-slate-800 transition-colors ${
          isActive('/admin/generation') ? 'admin-nav-link-active bg-purple-50 dark:bg-purple-500/10 text-purple-600 dark:text-purple-400' : ''
        }`}
        href="/admin/generation/history"
      >
        {messages.admin?.navigation?.generations || 'Generations'}
      </Link>
      {role === 'superadmin' && (
        <>
          <Link
            className={`admin-nav-link px-3 py-2 rounded-md text-gray-700 dark:text-gray-300 hover:text-purple-600 dark:hover:text-purple-400 hover:bg-gray-100 dark:hover:bg-slate-800 transition-colors ${
              isActive('/admin/users') ? 'admin-nav-link-active bg-purple-50 dark:bg-purple-500/10 text-purple-600 dark:text-purple-400' : ''
            }`}
            href="/admin/users"
          >
            {messages.admin?.navigation?.users || 'Users'}
          </Link>
          <Link
            className={`admin-nav-link px-3 py-2 rounded-md text-gray-700 dark:text-gray-300 hover:text-purple-600 dark:hover:text-purple-400 hover:bg-gray-100 dark:hover:bg-slate-800 transition-colors ${
              isActive('/admin/pricing') ? 'admin-nav-link-active bg-purple-50 dark:bg-purple-500/10 text-purple-600 dark:text-purple-400' : ''
            }`}
            href={'/admin/pricing' as any}
          >
            {messages.admin?.navigation?.pricing || 'Pricing'}
          </Link>
          <Link
            className={`admin-nav-link px-3 py-2 rounded-md text-gray-700 dark:text-gray-300 hover:text-purple-600 dark:hover:text-purple-400 hover:bg-gray-100 dark:hover:bg-slate-800 transition-colors ${
              isActive('/admin/pipeline') ? 'admin-nav-link-active bg-purple-50 dark:bg-purple-500/10 text-purple-600 dark:text-purple-400' : ''
            }`}
            href="/admin/pipeline"
          >
            {messages.admin?.navigation?.pipeline || 'Pipeline'}
          </Link>
        </>
      )}
    </nav>
  );
}
