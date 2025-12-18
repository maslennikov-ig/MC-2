/**
 * Lesson UUID Resolver with Redis Caching
 *
 * Resolves human-readable lesson labels ("1.1") to database UUIDs.
 * Uses Redis cache with 1-hour TTL to minimize database queries.
 *
 * Single Source of Truth - replaces duplicated implementations in:
 * - handler.ts (Stage 6)
 * - lesson-content.ts (tRPC router)
 * - debug-stage6-generation.ts
 *
 * @module shared/database/lesson-resolver
 */

import { getSupabaseAdmin } from '../supabase/admin';
import { RedisCache } from '../cache/redis';
import { logger } from '../logger';
import {
  LessonUUID,
  tryCreateLessonUUID,
  isValidLessonLabel,
} from '@megacampus/shared-types';

/** Cache key prefix for lesson UUIDs */
const CACHE_PREFIX = 'lesson:uuid';

/** Cache TTL in seconds (1 hour) */
const CACHE_TTL_SECONDS = 3600;

/** Redis cache instance (lazy) */
let cacheInstance: RedisCache | null = null;

function getCache(): RedisCache {
  if (!cacheInstance) {
    cacheInstance = new RedisCache();
  }
  return cacheInstance;
}

/**
 * Build cache key for lesson UUID resolution
 */
function buildCacheKey(courseId: string, lessonLabel: string): string {
  return `${CACHE_PREFIX}:${courseId}:${lessonLabel}`;
}

/**
 * Resolve lesson label to UUID with Redis caching
 *
 * Uses efficient single JOIN query to resolve "section.lesson" format
 * to database UUID. Results are cached for 1 hour.
 *
 * @param courseId - Course UUID
 * @param lessonLabel - Human-readable label like "1.1" (section.lesson)
 * @returns Branded LessonUUID or null if not found
 *
 * @example
 * const uuid = await resolveLessonUuid('course-uuid', '1.1');
 * if (uuid) {
 *   await supabase.from('lessons').update({...}).eq('id', uuid);
 * }
 */
export async function resolveLessonUuid(
  courseId: string,
  lessonLabel: string
): Promise<LessonUUID | null> {
  // Validate label format using type guard from shared-types
  if (!isValidLessonLabel(lessonLabel)) {
    logger.warn({ lessonLabel }, 'Invalid lesson label format, expected "N.N"');
    return null;
  }

  const cache = getCache();
  const cacheKey = buildCacheKey(courseId, lessonLabel);

  // Check cache first
  try {
    const cached = await cache.get<string>(cacheKey);
    if (cached) {
      logger.debug({ courseId, lessonLabel, source: 'cache' }, 'Lesson UUID resolved');
      return tryCreateLessonUUID(cached);
    }
  } catch {
    // Cache miss or error - continue to DB
  }

  // Parse "1.1" format
  const [sectionStr, lessonStr] = lessonLabel.split('.');
  const sectionOrder = parseInt(sectionStr, 10);
  const lessonOrder = parseInt(lessonStr, 10);

  // Query database with efficient JOIN (single query)
  const supabase = getSupabaseAdmin();

  try {
    const { data, error } = await supabase
      .from('lessons')
      .select('id, sections!inner(course_id, order_index)')
      .eq('sections.course_id', courseId)
      .eq('sections.order_index', sectionOrder)
      .eq('order_index', lessonOrder)
      .single();

    if (error || !data) {
      logger.debug(
        { courseId, lessonLabel, sectionOrder, lessonOrder, error: error?.message },
        'Lesson not found for UUID resolution'
      );
      return null;
    }

    // Cache the result (fire and forget)
    cache.set(cacheKey, data.id, { ttl: CACHE_TTL_SECONDS }).catch(() => {
      // Ignore cache write errors - not critical
    });

    logger.debug(
      { courseId, lessonLabel, lessonUuid: data.id, source: 'database' },
      'Lesson UUID resolved'
    );

    return tryCreateLessonUUID(data.id);
  } catch (error) {
    logger.error(
      { courseId, lessonLabel, error: error instanceof Error ? error.message : String(error) },
      'Error resolving lesson UUID'
    );
    return null;
  }
}

/**
 * Resolve lesson ID that might be either a label ("1.1") or UUID
 *
 * Useful for APIs that accept both formats for flexibility.
 *
 * @param courseId - Course UUID
 * @param lessonIdOrLabel - Either "1.1" format or UUID
 * @returns UUID string or null
 */
export async function resolveLessonIdOrUuid(
  courseId: string,
  lessonIdOrLabel: string
): Promise<string | null> {
  // Check if already a UUID format
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(lessonIdOrLabel)) {
    return lessonIdOrLabel;
  }

  // Try to resolve as label
  const uuid = await resolveLessonUuid(courseId, lessonIdOrLabel);
  return uuid;
}

/**
 * Invalidate cached lesson UUID
 *
 * Call when lesson structure changes (e.g., lessons reordered).
 *
 * @param courseId - Course UUID
 * @param lessonLabel - Lesson label to invalidate (e.g., "1.1")
 */
export async function invalidateLessonUuidCache(
  courseId: string,
  lessonLabel: string
): Promise<void> {
  const cache = getCache();
  const cacheKey = buildCacheKey(courseId, lessonLabel);

  try {
    await cache.delete(cacheKey);
    logger.debug({ courseId, lessonLabel }, 'Lesson UUID cache invalidated');
  } catch {
    // Ignore cache delete errors
  }
}
