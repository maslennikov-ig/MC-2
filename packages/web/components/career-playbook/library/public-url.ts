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
