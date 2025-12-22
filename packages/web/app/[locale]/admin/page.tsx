import { createClient } from '@/lib/supabase/server';
import { setRequestLocale } from 'next-intl/server';
import { Locale } from '@/src/i18n/config';
import { AdminDashboard } from './components/admin-dashboard';

/**
 * Admin Dashboard Page
 *
 * Displays platform statistics and quick actions for administrators.
 * Fetches data from Supabase for users, courses, lessons, jobs, and errors.
 *
 * @module app/admin/page
 */

type Props = {
  params: Promise<{ locale: Locale }>;
};

export default async function AdminPage({ params }: Props) {
  const { locale } = await params;
  setRequestLocale(locale); // Enable static rendering

  const supabase = await createClient();

  // Get current user role for superadmin-specific features
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: profile } = await supabase
    .from('users')
    .select('role')
    .eq('id', user?.id || '')
    .single();

  const isSuperadmin = profile?.role === 'superadmin';

  // Calculate date thresholds
  const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  // Fetch all stats in parallel
  const [
    usersTotal,
    usersNewWeek,
    coursesTotal,
    lessonsTotal,
    jobStats,
    errorsLast24h,
  ] = await Promise.all([
    supabase.from('users').select('*', { count: 'exact', head: true }),
    supabase
      .from('users')
      .select('*', { count: 'exact', head: true })
      .gte('created_at', oneWeekAgo),
    supabase.from('courses').select('*', { count: 'exact', head: true }),
    supabase.from('lessons').select('*', { count: 'exact', head: true }),
    supabase.from('job_status').select('status'),
    supabase
      .from('error_logs')
      .select('*', { count: 'exact', head: true })
      .gte('created_at', oneDayAgo),
  ]);

  // Calculate active jobs (pending, active, waiting)
  const activeStatuses = ['pending', 'active', 'waiting'];
  const activeJobs =
    jobStats.data?.filter((j) => activeStatuses.includes(j.status)).length || 0;

  return (
    <AdminDashboard
      stats={{
        users: {
          total: usersTotal.count || 0,
          newThisWeek: usersNewWeek.count || 0,
        },
        courses: {
          total: coursesTotal.count || 0,
        },
        lessons: {
          total: lessonsTotal.count || 0,
        },
        generations: {
          total: jobStats.data?.length || 0,
          active: activeJobs,
        },
        errors: {
          last24h: errorsLast24h.count || 0,
        },
      }}
      isSuperadmin={isSuperadmin}
    />
  );
}
