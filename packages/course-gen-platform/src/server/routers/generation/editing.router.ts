/**
 * Editing Router
 * @module server/routers/generation/editing
 *
 * Handles course content editing operations for Stage 4 and Stage 5 outputs.
 * Provides inline editing, element deletion/addition, and AI-powered regeneration.
 *
 * All endpoints require instructor or admin role (instructorProcedure).
 */

import { router } from '../../trpc';
import { fieldUpdateRouter } from './editing/field-update.router';
import { elementCrudRouter } from './editing/element-crud.router';
import { regenerationRouter } from './editing/regeneration.router';
import { permissionsRouter } from './editing/permissions.router';
import { editHistoryRouter } from './editing/edit-history.router';
import { chatRouter } from './editing/chat.router';

/**
 * Editing Router - Course content editing operations
 *
 * Endpoints:
 * - updateField: Update a field in course analysis_result or course_structure
 * - deleteElement: Delete a lesson or section from Stage 5 course structure
 * - addElement: Add a lesson or section to Stage 5 course structure with AI generation
 * - regenerateBlock: Regenerate a block (field) using AI with smart context routing
 * - getEditPermissions: Check if the current user can edit a specific course
 * - getEditHistory: Get edit history for a course (diff view)
 * - chat: Conversational interface for course refinement/regeneration
 */
export const editingRouter = router({
  ...fieldUpdateRouter,
  ...elementCrudRouter,
  ...regenerationRouter,
  ...permissionsRouter,
  ...editHistoryRouter,
  ...chatRouter,
});
