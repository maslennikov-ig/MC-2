/**
 * Career Playbook live smoke — the public pages a reader actually opens.
 * @module smoke/career-playbook-public-pages
 *
 * The `public-share` evidence check reads a tRPC query. For run 4e355bf4 that
 * query answered correctly while every public page of the guide returned HTTP
 * 500 (mc2-j8ms8), and five paid runs passed over it. This module builds the
 * page URLs and reports the status each one actually returned.
 */

import type { CareerPlaybookSmokePageEvidence } from './career-playbook-validation';

interface PageGateEnv {
  [key: string]: string | undefined;
}

interface PageGateOptions {
  trpcUrl?: string;
  webBaseUrl?: string;
}

function hasValue(value: string | null | undefined): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

const DEFAULT_PUBLIC_PAGE_LOCALE = 'en';
const PUBLIC_PAGE_TIMEOUT_MS = 30_000;

/**
 * Where the Next.js app answers. The tRPC endpoint is a route inside that same
 * app (`/api/trpc`), so the origin is derivable and needs no second setting;
 * an explicit option or env still wins when the two are ever split.
 */
export function resolveCareerPlaybookWebBaseUrl(
  options: PageGateOptions,
  env: PageGateEnv = process.env
): string | null {
  const explicit = options.webBaseUrl ?? env.CAREER_PLAYBOOK_SMOKE_WEB_URL;
  if (hasValue(explicit)) return explicit.replace(/\/+$/, '');

  const trpcUrl = options.trpcUrl ?? env.CAREER_PLAYBOOK_SMOKE_TRPC_URL;
  if (!hasValue(trpcUrl)) return null;

  try {
    const url = new URL(trpcUrl);
    return url.origin;
  } catch {
    return null;
  }
}

/** A view token is a capability; the artifact records the shape, not the key. */
function redactViewToken(path: string): string {
  return path.replace(/(\/career-playbook\/view\/[^/]+\/)[^/?#]+/, '$1<token>');
}

export interface CareerPlaybookPublicPageTarget {
  id: string;
  url: string;
  redactedUrl: string;
}

/**
 * The public pages a reader actually opens: the catalog page the owner shares
 * and one link per reader. The slug page is the same renderer as the catalog
 * page, so it adds cost without adding coverage.
 */
export function buildCareerPlaybookPublicPageTargets(input: {
  baseUrl: string;
  locale?: string | null;
  shareSlug?: string | null;
  organizationSlug?: string | null;
  viewLinks?: Array<{ audience: string; path: string }>;
}): CareerPlaybookPublicPageTarget[] {
  const base = input.baseUrl.replace(/\/+$/, '');
  const locale = hasValue(input.locale) ? input.locale : DEFAULT_PUBLIC_PAGE_LOCALE;
  const targets: CareerPlaybookPublicPageTarget[] = [];

  if (hasValue(input.shareSlug) && hasValue(input.organizationSlug)) {
    const path = `/${locale}/career-playbooks/${encodeURIComponent(
      input.organizationSlug
    )}/${encodeURIComponent(input.shareSlug)}`;
    targets.push({ id: 'catalog', url: `${base}${path}`, redactedUrl: `${base}${path}` });
  }

  for (const link of input.viewLinks ?? []) {
    if (!hasValue(link.path)) continue;
    const path = `/${locale}${link.path.startsWith('/') ? link.path : `/${link.path}`}`;
    targets.push({
      id: `reader:${link.audience}`,
      url: `${base}${path}`,
      redactedUrl: `${base}${redactViewToken(path)}`,
    });
  }

  return targets;
}

export async function fetchPublicPageEvidence(
  targets: CareerPlaybookPublicPageTarget[],
  fetchPage: (url: string) => Promise<{ status: number }>
): Promise<CareerPlaybookSmokePageEvidence[]> {
  const evidence: CareerPlaybookSmokePageEvidence[] = [];

  for (const target of targets) {
    try {
      const response = await fetchPage(target.url);
      evidence.push({ id: target.id, url: target.redactedUrl, status: response.status });
    } catch (error) {
      evidence.push({
        id: target.id,
        url: target.redactedUrl,
        status: null,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return evidence;
}

export function defaultPageFetcher(url: string): Promise<{ status: number }> {
  return fetch(url, {
    redirect: 'follow',
    headers: { accept: 'text/html' },
    signal: AbortSignal.timeout(PUBLIC_PAGE_TIMEOUT_MS),
  });
}
