import { redirect } from 'next/navigation';

/**
 * Admin Index Page - Redirect to Pipeline
 *
 * Redirects /admin to /admin/pipeline as the default admin view.
 * The pipeline dashboard serves as the main superadmin interface.
 *
 * @module app/admin/page
 */
export default function AdminPage() {
  redirect('/admin/pipeline');
}
