import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { ReactNode } from 'react';
import { ErrorBoundary } from './components/error-boundary';

/**
 * Pipeline Admin Layout - Superadmin-Only Access
 *
 * This layout enforces superadmin-only access to pipeline configuration.
 * Key differences from regular admin layout:
 * - Only `superadmin` role allowed (NOT admin)
 * - Redirects non-superadmins to home page
 * - No duplicate header (parent admin layout already provides one)
 *
 * @module app/admin/pipeline/layout
 */
export default async function PipelineAdminLayout({
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
    redirect('/');
  }

  // Fetch user role
  const { data: profile } = await supabase
    .from('users')
    .select('role')
    .eq('id', user.id)
    .single();

  const role = profile?.role;

  // Only superadmin can access pipeline admin
  if (role !== 'superadmin') {
    redirect('/');
  }

  return <ErrorBoundary>{children}</ErrorBoundary>;
}
