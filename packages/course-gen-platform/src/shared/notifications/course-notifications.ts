/**
 * Course Notifications Service
 *
 * Centralized notification dispatch for course generation events.
 * Supports Push, Email, and Telegram notifications.
 */

import { logger } from '../logger/index.js';
import { getSupabaseAdmin } from '../supabase/admin';
import { getStageName } from '@megacampus/shared-types';
import {
  sendTelegramMessage,
  formatCourseCompletionMessage,
  formatCourseErrorMessage,
  formatStageCompleteMessage,
} from '../telegram/send';

interface NotificationPayload {
  title: string;
  body: string;
  url?: string;
}

interface CourseWithUser {
  id: string;
  title: string;
  slug: string;
  generation_mode: string | null;
  notify_on_completion: boolean | null;
  notify_on_error: boolean | null;
  notify_on_stage_complete: boolean | null;
  user_id: string | null;
  user?: {
    email: string | null;
    telegram_chat_id: string | null;
    telegram_notifications_enabled: boolean | null;
  } | null;
}

/**
 * Fetch course with user notification settings
 */
async function getCourseWithUser(courseId: string): Promise<CourseWithUser | null> {
  const supabase = getSupabaseAdmin();

  const { data, error } = await supabase
    .from('courses')
    .select(
      `
      id, title, slug, generation_mode,
      notify_on_completion, notify_on_error, notify_on_stage_complete,
      user_id,
      user:users(email, telegram_chat_id, telegram_notifications_enabled)
    `
    )
    .eq('id', courseId)
    .single();

  if (error || !data) {
    logger.error({ courseId, error }, 'Failed to fetch course for notifications');
    return null;
  }

  // Handle user array from Supabase join
  const userData = Array.isArray(data.user) ? data.user[0] : data.user;

  return {
    ...data,
    user: userData,
  };
}

/**
 * Send push notification to user (via web-push)
 * Note: Requires push subscription to be stored in DB
 */
async function sendPushToUser(userId: string, payload: NotificationPayload): Promise<boolean> {
  // TODO: Implement web-push when push_subscriptions table is ready
  // For now, log and return false
  logger.info({ userId, payload }, 'Push notification queued (not implemented yet)');
  return false;
}

/**
 * Notify user when course generation completes successfully
 */
export async function notifyCourseCompletion(courseId: string): Promise<void> {
  const course = await getCourseWithUser(courseId);
  if (!course) return;

  // Only send notifications in automatic mode
  if (course.generation_mode !== 'automatic') {
    logger.debug({ courseId }, 'Skipping completion notification (not automatic mode)');
    return;
  }

  // Check if notifications enabled
  if (!course.notify_on_completion) {
    logger.debug({ courseId }, 'Completion notifications disabled for this course');
    return;
  }

  const payload: NotificationPayload = {
    title: 'Курс готов!',
    body: `Ваш курс "${course.title}" успешно создан`,
    url: `/courses/${course.slug}`,
  };

  logger.info({ courseId, userId: course.user_id }, 'Sending course completion notifications');

  // 1. Push notification
  if (course.user_id) {
    await sendPushToUser(course.user_id, payload);
  }

  // 2. Telegram notification
  if (course.user?.telegram_chat_id && course.user?.telegram_notifications_enabled) {
    const message = formatCourseCompletionMessage(course.title || 'Курс', course.slug);
    await sendTelegramMessage(course.user.telegram_chat_id, message);
  }

  // 3. Email notification (TODO: implement with Resend)
  // if (course.user?.email) {
  //   await sendEmail(course.user.email, 'course-completion', payload);
  // }
}

/**
 * Notify user when an error occurs during generation
 */
export async function notifyCourseError(
  courseId: string,
  stage: number,
  error: string
): Promise<void> {
  const course = await getCourseWithUser(courseId);
  if (!course) return;

  // Only send notifications in automatic mode
  if (course.generation_mode !== 'automatic') {
    return;
  }

  // Check if error notifications enabled
  if (!course.notify_on_error) {
    return;
  }

  const payload: NotificationPayload = {
    title: 'Ошибка генерации',
    body: `Ошибка на этапе ${stage}: ${error}`,
    url: `/courses/generating/${course.slug}`,
  };

  logger.info({ courseId, stage, error }, 'Sending course error notifications');

  // 1. Push notification
  if (course.user_id) {
    await sendPushToUser(course.user_id, payload);
  }

  // 2. Telegram notification
  if (course.user?.telegram_chat_id && course.user?.telegram_notifications_enabled) {
    const message = formatCourseErrorMessage(course.title || 'Курс', stage, error);
    await sendTelegramMessage(course.user.telegram_chat_id, message);
  }
}

/**
 * Notify user when a stage completes (optional, more granular)
 */
export async function notifyStageComplete(courseId: string, stage: number): Promise<void> {
  const course = await getCourseWithUser(courseId);
  if (!course) return;

  // Only send notifications in automatic mode
  if (course.generation_mode !== 'automatic') {
    return;
  }

  // Check if stage notifications enabled (off by default)
  if (!course.notify_on_stage_complete) {
    return;
  }

  const stageName = getStageName(stage, 'ru');

  const payload: NotificationPayload = {
    title: `Этап ${stage} завершён`,
    body: `${stageName} - выполнено ✓`,
    url: `/courses/generating/${course.slug}`,
  };

  logger.info({ courseId, stage }, 'Sending stage completion notification');

  // Only push notification for intermediate stages (lightweight)
  if (course.user_id) {
    await sendPushToUser(course.user_id, payload);
  }

  // Telegram for stage notifications
  if (course.user?.telegram_chat_id && course.user?.telegram_notifications_enabled) {
    const message = formatStageCompleteMessage(course.title || 'Курс', stage);
    await sendTelegramMessage(course.user.telegram_chat_id, message);
  }
}
