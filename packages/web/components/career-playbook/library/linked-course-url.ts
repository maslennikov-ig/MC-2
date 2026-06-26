import type { CareerPlaybookLinkedCourse } from '@megacampus/shared-types'

export function buildCareerPlaybookLinkedCoursePath(
  locale: string,
  linkedCourse: CareerPlaybookLinkedCourse | null | undefined
): string | null {
  if (!linkedCourse?.organizationSlug || !linkedCourse.slug) return null

  const basePath = `/${locale}/courses/${linkedCourse.organizationSlug}/${linkedCourse.slug}`
  if (linkedCourse.generationStatus === 'completed' || linkedCourse.status === 'published') {
    return basePath
  }

  return `${basePath}/generating`
}
