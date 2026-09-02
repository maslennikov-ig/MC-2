export function buildCareerPlaybookPublicPath(
  locale: string,
  organizationSlug: string | null | undefined,
  playbookSlug: string | null | undefined
): string | null {
  if (!organizationSlug || !playbookSlug) return null

  return `/${locale}/career-playbooks/${encodeURIComponent(organizationSlug)}/${encodeURIComponent(
    playbookSlug
  )}`
}

/**
 * Absolute URL for one reader-scoped view link.
 *
 * The server returns a locale-less path because it does not know which locale
 * the owner is reading in; the page lives under `[locale]`, so the prefix is
 * added here rather than shipping a link that 404s for the person pasting it.
 */
export function buildCareerPlaybookViewLinkUrl(
  locale: string,
  path: string,
  origin?: string
): string {
  const localized = `/${locale}${path.startsWith('/') ? path : `/${path}`}`
  const resolvedOrigin =
    origin ??
    (typeof window !== 'undefined' && window.location?.origin ? window.location.origin : '')

  return resolvedOrigin ? `${resolvedOrigin}${localized}` : localized
}

export function buildCareerPlaybookPublicUrl(
  locale: string,
  organizationSlug: string | null | undefined,
  playbookSlug: string | null | undefined,
  origin?: string
): string | null {
  const path = buildCareerPlaybookPublicPath(locale, organizationSlug, playbookSlug)
  if (!path) return null

  const resolvedOrigin =
    origin ??
    (typeof window !== 'undefined' && window.location?.origin ? window.location.origin : '')

  return resolvedOrigin ? `${resolvedOrigin}${path}` : path
}
