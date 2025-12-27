import { NextRequest } from 'next/server'
import { jsonError, jsonSuccess, ERROR_CODES } from '@/lib/api-response'
import { logger } from '@/lib/logger'
import { checkRateLimit, getRateLimitIdentifier } from '@/lib/rate-limit'

// Telegram configuration - NEVER hardcode credentials!
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID

// Validate environment variables are present
if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) {
  logger.error('Missing required Telegram environment variables')
}

const TELEGRAM_API_URL = TELEGRAM_BOT_TOKEN 
  ? `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`
  : null

interface IdeaSubmission {
  idea: string
  contact?: string
  timestamp?: string
  source?: string
}

export async function POST(request: NextRequest) {
  try {
    // Apply rate limiting first: 3 submissions per 5 minutes
    const identifier = getRateLimitIdentifier(request);
    const rateLimitResult = await checkRateLimit(identifier, {
      requests: 3,
      window: 300, // 5 minutes
      keyPrefix: 'rate-limit:idea-submission',
    });

    if (!rateLimitResult.success) {
      const response = jsonError(
        ERROR_CODES.VALIDATION_ERROR,
        'Too many idea submissions. Please wait a few minutes before submitting another idea.',
        429,
        { retryAfter: rateLimitResult.retryAfter }
      )

      // Add rate limit headers
      response.headers.set('X-RateLimit-Limit', '3')
      response.headers.set('X-RateLimit-Remaining', rateLimitResult.remaining.toString())
      response.headers.set('X-RateLimit-Reset', rateLimitResult.reset.toString())
      response.headers.set('Retry-After', (rateLimitResult.retryAfter || 0).toString())

      return response
    }

    // Check if Telegram is properly configured
    if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID || !TELEGRAM_API_URL) {
      logger.error('Telegram integration not configured: Missing environment variables')
      return jsonError(ERROR_CODES.SERVICE_UNAVAILABLE, 'Service temporarily unavailable. Please try again later.', 503)
    }

    // Parse request body
    const body: IdeaSubmission = await request.json()
    
    // Validate required fields
    if (!body.idea || body.idea.trim().length === 0) {
      return jsonError(ERROR_CODES.VALIDATION_ERROR, 'Idea text is required', 400)
    }

    // Format message for Telegram
    const timestamp = new Date().toLocaleString('ru-RU', {
      timeZone: 'Europe/Moscow',
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })

    let message = `🚀 *Новая идея от пользователя*\n\n`
    message += `📝 *Идея:*\n${escapeMarkdown(body.idea)}\n\n`
    
    if (body.contact && body.contact.trim()) {
      message += `📧 *Контакт:* ${escapeMarkdown(body.contact)}\n`
    }
    
    message += `📅 *Время:* ${timestamp}\n`
    message += `🌐 *Источник:* ${body.source || 'Features Catalog'}`

    // Send to Telegram
    const telegramResponse = await fetch(TELEGRAM_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        chat_id: TELEGRAM_CHAT_ID,
        text: message,
        parse_mode: 'Markdown',
        disable_web_page_preview: true
      })
    })

    if (!telegramResponse.ok) {
      const error = await telegramResponse.json()
      logger.error('Telegram API error:', error)

      // Don't expose Telegram errors to the client
      return jsonError(ERROR_CODES.INTERNAL_ERROR, 'Failed to send message. Please try again later.', 500)
    }

    const result = await telegramResponse.json()

    // Log success for monitoring (only in development)
    logger.devLog('Telegram message sent successfully:', {
      messageId: result.result?.message_id,
      timestamp,
      hasContact: !!body.contact
    })

    const response = jsonSuccess({
      message: 'Idea submitted successfully',
      timestamp,
      messageId: result.result?.message_id
    })

    // Add rate limit headers to successful response
    response.headers.set('X-RateLimit-Limit', '3')
    response.headers.set('X-RateLimit-Remaining', rateLimitResult.remaining.toString())
    response.headers.set('X-RateLimit-Reset', rateLimitResult.reset.toString())

    return response

  } catch (error) {
    logger.error('Error sending to Telegram:', error)

    // Generic error response
    return jsonError(ERROR_CODES.INTERNAL_ERROR, 'An error occurred while processing your request', 500)
  }
}

// Helper function to escape Markdown special characters
function escapeMarkdown(text: string): string {
  return text
    .replace(/\*/g, '\\*')
    .replace(/_/g, '\\_')
    .replace(/\[/g, '\\[')
    .replace(/\]/g, '\\]')
    .replace(/\(/g, '\\(')
    .replace(/\)/g, '\\)')
    .replace(/~/g, '\\~')
    .replace(/`/g, '\\`')
    .replace(/>/g, '\\>')
    .replace(/#/g, '\\#')
    .replace(/\+/g, '\\+')
    .replace(/-/g, '\\-')
    .replace(/=/g, '\\=')
    .replace(/\|/g, '\\|')
    .replace(/\{/g, '\\{')
    .replace(/\}/g, '\\}')
    .replace(/\./g, '\\.')
    .replace(/!/g, '\\!')
}