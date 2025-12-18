'use server'

import { draftSessionManager } from '@/lib/draft-session'
import type { DraftFormData, Result, DraftSessionData } from '@/lib/draft-session'

/**
 * Server Action: Create a new draft session in Redis
 *
 * @param userId - User ID from Supabase auth
 * @param organizationId - Organization ID from users table
 * @returns Session ID for future operations
 */
export async function createDraftSession(
  userId: string,
  organizationId: string
): Promise<Result<string>> {
  return draftSessionManager.createSession(userId, organizationId)
}

/**
 * Server Action: Update draft session with form data
 *
 * @param userId - User ID (for key isolation)
 * @param sessionId - Session ID from createDraftSession
 * @param formData - Partial form data to merge
 * @returns Success result
 */
export async function updateDraftSession(
  userId: string,
  sessionId: string,
  formData: Partial<DraftFormData>
): Promise<Result<void>> {
  return draftSessionManager.updateSession(userId, sessionId, formData)
}

/**
 * Server Action: Materialize session to PostgreSQL database
 *
 * Creates actual course record in DB from session data, then deletes session.
 *
 * @param userId - User ID
 * @param sessionId - Session ID
 * @returns Course ID and slug, or error
 */
export async function materializeDraftSession(
  userId: string,
  sessionId: string
): Promise<Result<{ id: string; slug: string }>> {
  return draftSessionManager.materializeSession(userId, sessionId)
}

/**
 * Server Action: Get session data
 *
 * @param userId - User ID (for key isolation)
 * @param sessionId - Session ID
 * @returns Session data or null if not found
 */
export async function getDraftSession(
  userId: string,
  sessionId: string
): Promise<Result<DraftSessionData | null>> {
  return draftSessionManager.getSession(userId, sessionId)
}

/**
 * Server Action: Delete session
 *
 * @param userId - User ID (for key isolation)
 * @param sessionId - Session ID
 * @returns Success result
 */
export async function deleteDraftSession(
  userId: string,
  sessionId: string
): Promise<Result<void>> {
  return draftSessionManager.deleteSession(userId, sessionId)
}
