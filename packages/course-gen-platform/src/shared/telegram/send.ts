/**
 * Telegram Notification Service
 *
 * Sends messages via Telegram Bot API for course generation notifications.
 */

import { logger } from '../logger/index.js';
import { getStageName } from '@megacampus/shared-types';
import { getSupabaseAdmin } from '../supabase/admin';

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;

interface TelegramSendResult {
  success: boolean;
  messageId?: number;
  error?: string;
}

/**
 * Send a message via Telegram Bot API
 */
export async function sendTelegramMessage(
  chatId: string,
  message: string,
  options?: {
    parseMode?: 'Markdown' | 'HTML';
    disableNotification?: boolean;
  }
): Promise<TelegramSendResult> {
  if (!TELEGRAM_BOT_TOKEN) {
    logger.warn('TELEGRAM_BOT_TOKEN not configured, skipping Telegram notification');
    return { success: false, error: 'Bot token not configured' };
  }

  if (!chatId) {
    logger.warn('No chat_id provided for Telegram notification');
    return { success: false, error: 'No chat_id provided' };
  }

  try {
    const response = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text: message,
        parse_mode: options?.parseMode || 'Markdown',
        disable_notification: options?.disableNotification || false,
      }),
    });

    const result = (await response.json()) as {
      ok: boolean;
      result?: { message_id: number };
      description?: string;
    };

    if (!result.ok) {
      logger.error({ chatId, error: result.description }, 'Telegram API error');
      return { success: false, error: result.description || 'Unknown error' };
    }

    logger.info({ chatId, messageId: result.result?.message_id }, 'Telegram message sent');
    return { success: true, messageId: result.result?.message_id };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    logger.error({ chatId, error: errorMsg }, 'Failed to send Telegram message');
    return { success: false, error: errorMsg };
  }
}

/**
 * Type to readable name mapping for enrichments
 */
const ENRICHMENT_TYPE_NAMES: Record<string, string> = {
  video: 'видео',
  nlm_video: 'видео',
  audio: 'аудио',
  nlm_audio: 'аудио',
  quiz: 'квиз',
  presentation: 'презентация',
  document: 'документ',
  cover: 'обложка',
  card: 'карточка',
};

/**
 * Notify user that an enrichment generation is ready, checking preferences.
 */
export async function notifyEnrichmentReady(params: {
  courseId: string;
  lessonId: string;
  enrichmentType: string;
}): Promise<void> {
  try {
    const supabase = getSupabaseAdmin();

    // 1. Get course to find user_id, slug, org_id
    const { data: course, error: courseError } = await supabase
      .from('courses')
      .select('user_id, slug, organization_id')
      .eq('id', params.courseId)
      .single();

    if (courseError || !course) {
      logger.error(
        { courseId: params.courseId, courseError },
        'Failed to fetch course for enrichment notification'
      );
      return;
    }

    // 2. Fetch user's Telegram settings
    const { data: user, error: userError } = await supabase
      .from('users')
      .select('telegram_chat_id, telegram_notifications_enabled')
      .eq('id', course.user_id)
      .single();

    if (userError || !user) {
      logger.error(
        { userId: course.user_id, userError },
        'Failed to fetch user for enrichment notification'
      );
      return;
    }

    // 3. Check if we should notify
    if (!user.telegram_notifications_enabled || !user.telegram_chat_id) {
      logger.debug(
        { userId: course.user_id },
        'Telegram notification skipped: user opted out or no chat_id'
      );
      return;
    }

    // 4. Fetch the organization to construct proper URL
    let orgSlug = 'org';
    const { data: org } = await supabase
      .from('organizations')
      .select('slug')
      .eq('id', course.organization_id)
      .single();
    if (org) orgSlug = org.slug;

    // 5. Fetch lesson title
    let lessonTitle = '';
    const { data: lesson } = await supabase
      .from('lessons')
      .select('title')
      .eq('id', params.lessonId)
      .single();
    if (lesson?.title) {
      lessonTitle = lesson.title;
    }

    const baseUrl =
      process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL || 'https://ai.megacampus.ru';
    // Link to the lesson view
    const courseUrl = `${baseUrl}/courses/${orgSlug}/${course.slug}/lessons`;
    const readableType = ENRICHMENT_TYPE_NAMES[params.enrichmentType] || params.enrichmentType;
    const lessonDisplay = lessonTitle ? ` для урока «${lessonTitle}»` : '';

    const message = `🎉 *Готово!*

Ваш материал (${readableType})${lessonDisplay} успешно сгенерирован.

[Перейти к уроку](${courseUrl})`;

    await sendTelegramMessage(user.telegram_chat_id, message);
  } catch (error) {
    logger.error(
      { error: error instanceof Error ? error.message : String(error) },
      'Unhandled error in notifyEnrichmentReady'
    );
  }
}

/**
 * Format message for course completion notification
 */
export function formatCourseCompletionMessage(courseTitle: string, courseSlug: string): string {
  return `✅ *Курс готов!*

Ваш курс "${courseTitle}" успешно создан.

[Открыть курс](${process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL || 'https://ai.megacampus.ru'}/courses/${courseSlug})`;
}

/**
 * Format message for course error notification
 */
export function formatCourseErrorMessage(
  courseTitle: string,
  stage: number,
  error: string
): string {
  return `❌ *Ошибка генерации*

При создании курса "${courseTitle}" произошла ошибка на этапе ${stage}.

Ошибка: ${error}

Попробуйте перезапустить генерацию или обратитесь в поддержку.`;
}

/**
 * Format message for stage completion notification
 */
export function formatStageCompleteMessage(courseTitle: string, stage: number): string {
  const stageName = getStageName(stage, 'ru');

  return `⚡ *Этап ${stage} завершён*

Курс: "${courseTitle}"
Этап: ${stageName} ✓`;
}
