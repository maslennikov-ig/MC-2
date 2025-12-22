import { createNavigation } from 'next-intl/navigation';
import { routing } from './routing';

/**
 * Locale-aware navigation utilities from next-intl.
 * Use these instead of next/link and next/navigation for proper locale handling.
 *
 * @example
 * import { Link, useRouter, usePathname } from '@/src/i18n/navigation';
 *
 * // In component:
 * <Link href="/courses">Courses</Link>
 * const router = useRouter();
 * router.push('/about');
 */
export const { Link, redirect, usePathname, useRouter, getPathname } =
  createNavigation(routing);
