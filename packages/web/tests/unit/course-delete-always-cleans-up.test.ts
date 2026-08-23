/**
 * Every door that deletes a course cleans up behind it.
 * @module tests/unit/course-delete-always-cleans-up
 *
 * mc2-ipc80 reported a dev course whose rows were gone while its vectors, files
 * and Redis keys remained. There were three delete paths and three behaviours:
 * two called a cleanup they each carried their own copy of, and
 * `DELETE /api/courses/[orgSlug]/[courseSlug]` called nothing at all — that one
 * leaked on every use, not only on failure.
 *
 * A source-level guard rather than a route test, because the failure is a door
 * that forgets, not a door that misbehaves: a fourth one added next year is
 * exactly what this has to catch. Same shape as
 * `one-openrouter-transport.test.ts` in the platform package.
 */

import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const webRoot = process.cwd()

/** Files that delete a course. Adding one without cleanup is the defect. */
const DELETE_PATHS = [
  'app/api/courses/[orgSlug]/[courseSlug]/route.ts',
  'app/api/courses/[orgSlug]/[courseSlug]/delete/route.ts',
  'app/[locale]/courses/actions.ts',
] as const

const CLEANUP_HELPER = 'cleanupCourseResourcesBeforeDelete'
const SHARED_MODULE = '@/lib/helpers/course-cleanup'

describe('course deletion cleans up external resources', () => {
  it.each(DELETE_PATHS)('%s calls the shared cleanup', (path) => {
    const source = readFileSync(join(webRoot, path), 'utf8')

    expect(source).toContain(SHARED_MODULE)
    expect(source).toContain(`await ${CLEANUP_HELPER}(`)
  })

  it.each(DELETE_PATHS)('%s does not carry its own copy of the cleanup call', (path) => {
    const source = readFileSync(join(webRoot, path), 'utf8')

    // The two copies that existed each called the tRPC mutation directly. One
    // logged a COURSE_CLEANUP audit row on failure and the other did not, which
    // is why "did this course leak?" could not be answered from the log.
    expect(source).not.toContain('generation.cleanupCourse.mutate')
  })

  it('the shared cleanup records a failure instead of swallowing it', () => {
    const source = readFileSync(join(webRoot, 'lib/helpers/course-cleanup.ts'), 'utf8')

    expect(source).toContain("job_type: 'COURSE_CLEANUP'")
    // Best-effort is deliberate: deletion proceeds either way, so the audit row
    // is the only record of which paid-for vectors are now orphaned.
    expect(source).toContain('logPermanentFailure')
  })
})
