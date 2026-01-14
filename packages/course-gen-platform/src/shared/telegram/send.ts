/**
 * Telegram Notification Service
 *
 * Sends messages via Telegram Bot API for course generation notifications.
 */

import { logger } from '../logger/index.js';

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
  const stageNames: Record<number, string> = {
    2: 'Обработка документов',
    3: 'Классификация документов',
    4: 'Анализ структуры',
    5: 'Генерация структуры',
    6: 'Генерация уроков',
  };

  return `⚡ *Этап ${stage} завершён*

Курс: "${courseTitle}"
Этап: ${stageNames[stage] || `Этап ${stage}`} ✓`;
}
