import crypto from 'node:crypto'
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { logger } from '@/lib/logger'

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN
const TELEGRAM_WEBHOOK_SECRET = process.env.TELEGRAM_WEBHOOK_SECRET
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://ai.megacampus.ru'

// Create Supabase admin client
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

interface TelegramUpdate {
  update_id: number
  message?: {
    message_id: number
    from: {
      id: number
      first_name: string
      last_name?: string
      username?: string
      language_code?: string
    }
    chat: {
      id: number
      type: string
    }
    date: number
    text?: string
  }
}

/**
 * Send message via Telegram Bot API
 */
async function sendMessage(
  chatId: number,
  text: string,
  parseMode: 'Markdown' | 'HTML' = 'Markdown'
) {
  if (!TELEGRAM_BOT_TOKEN) return

  await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      parse_mode: parseMode,
      disable_web_page_preview: false,
    }),
  })
}

/**
 * Handle /start command
 */
async function handleStart(chatId: number, firstName: string, languageCode?: string) {
  const isRussian = languageCode === 'ru'

  // Update user in DB if they exist and are connected
  const { error } = await supabaseAdmin
    .from('users')
    .update({ telegram_notifications_enabled: true })
    .eq('telegram_chat_id', chatId.toString())

  if (error) {
    logger.error('Failed to update user notifications state on /start', error)
  }

  const message = isRussian
    ? `👋 Привет, ${firstName}!

Я бот *AI.Megacampus* для уведомлений о генерации курсов.

🔗 *Как подключить:*
1. Откройте [профиль на сайте](${APP_URL}/profile)
2. Перейдите в раздел "Настройки"
3. Нажмите кнопку "Подключить Telegram"
4. Подтвердите авторизацию

После подключения вы будете получать уведомления:
✅ Курс готов
⚡ Этап завершён
❌ Произошла ошибка

Ваш Chat ID: \`${chatId}\``
    : `👋 Hi, ${firstName}!

I'm the *AI.Megacampus* bot for course generation notifications.

🔗 *How to connect:*
1. Open your [profile on the website](${APP_URL}/profile)
2. Go to "Settings"
3. Click "Connect Telegram" button
4. Confirm authorization

After connecting, you'll receive notifications:
✅ Course ready
⚡ Stage completed
❌ Error occurred

Your Chat ID: \`${chatId}\``

  await sendMessage(chatId, message)
}

/**
 * Handle /help command
 */
async function handleHelp(chatId: number, languageCode?: string) {
  const isRussian = languageCode === 'ru'

  const message = isRussian
    ? `❓ *Помощь*

*Команды:*
/start - Начать работу с ботом
/help - Показать эту справку
/status - Проверить статус подключения
/disconnect - Отключить уведомления

*Как это работает:*
1. Подключите бота в профиле на сайте
2. При генерации курса бот пришлёт уведомления
3. Вы узнаете когда курс готов или если есть ошибки

*Поддержка:*
По вопросам обращайтесь на [ai.megacampus.ru](${APP_URL})`
    : `❓ *Help*

*Commands:*
/start - Start using the bot
/help - Show this help
/status - Check connection status
/disconnect - Disable notifications

*How it works:*
1. Connect the bot in your profile on the website
2. When generating a course, the bot will send notifications
3. You'll know when the course is ready or if there are errors

*Support:*
For questions, visit [ai.megacampus.ru](${APP_URL})`

  await sendMessage(chatId, message)
}

/**
 * Handle /status command
 */
async function handleStatus(chatId: number, languageCode?: string) {
  const isRussian = languageCode === 'ru'

  // Fetch actual connection status
  const { data: user } = await supabaseAdmin
    .from('users')
    .select('id, telegram_notifications_enabled')
    .eq('telegram_chat_id', chatId.toString())
    .single()

  const isConnected = !!user
  const isEnabled = user?.telegram_notifications_enabled

  const statusInfoRu = isConnected
    ? `✅ Аккаунт подключен.\nУведомления: ${isEnabled ? 'Включены 🔔' : 'Отключены 🔕'}`
    : `❌ Аккаунт не подключен.`

  const statusInfoEn = isConnected
    ? `✅ Account connected.\nNotifications: ${isEnabled ? 'Enabled 🔔' : 'Disabled 🔕'}`
    : `❌ Account not connected.`

  const message = isRussian
    ? `📊 *Статус подключения*

Ваш Chat ID: \`${chatId}\`

${statusInfoRu}

Управлять настройками можно в [профиле на сайте](${APP_URL}/profile).`
    : `📊 *Connection Status*

Your Chat ID: \`${chatId}\`

${statusInfoEn}

Manage settings in your [profile on the website](${APP_URL}/profile).`

  await sendMessage(chatId, message)
}

/**
 * Handle /disconnect command
 */
async function handleDisconnect(chatId: number, languageCode?: string) {
  const isRussian = languageCode === 'ru'

  // Update user in DB: ONLY disable notifications, keep chat_id for easy re-enable via /start
  const { error } = await supabaseAdmin
    .from('users')
    .update({
      telegram_notifications_enabled: false,
    })
    .eq('telegram_chat_id', chatId.toString())

  if (error) {
    logger.error('Failed to disable user notifications on /disconnect', error)
  }

  const message = isRussian
    ? `🔌 *Отключение уведомлений*

Уведомления отключены.

Чтобы включить уведомления обратно, просто отправьте команду /start или включите их в [профиле на сайте](${APP_URL}/profile).`
    : `🔌 *Disable Notifications*

Notifications disabled.

To enable notifications again, simply send the /start command or enable them in your [profile on the website](${APP_URL}/profile).`

  await sendMessage(chatId, message)
}

/**
 * Handle unknown messages
 */
async function handleUnknown(chatId: number, languageCode?: string) {
  const isRussian = languageCode === 'ru'

  const message = isRussian
    ? `🤔 Не понял команду. Используйте /help для списка доступных команд.`
    : `🤔 I didn't understand that. Use /help to see available commands.`

  await sendMessage(chatId, message)
}

/**
 * Telegram Webhook Handler
 */
export async function POST(request: NextRequest) {
  try {
    // Verify webhook authenticity using secret token
    if (TELEGRAM_WEBHOOK_SECRET) {
      const secretToken = request.headers.get('x-telegram-bot-api-secret-token')

      if (!secretToken) {
        logger.warn('Missing Telegram webhook secret token header')
        return NextResponse.json({ ok: false }, { status: 403 })
      }

      // Timing-safe comparison to prevent timing attacks
      const tokenBuffer = Buffer.from(secretToken)
      const expectedBuffer = Buffer.from(TELEGRAM_WEBHOOK_SECRET)

      if (
        tokenBuffer.length !== expectedBuffer.length ||
        !crypto.timingSafeEqual(tokenBuffer, expectedBuffer)
      ) {
        logger.warn('Invalid Telegram webhook secret token')
        return NextResponse.json({ ok: false }, { status: 403 })
      }
    } else {
      logger.warn('TELEGRAM_WEBHOOK_SECRET not configured - webhook requests are not authenticated')
    }

    const update: TelegramUpdate = await request.json()

    if (!update.message?.text) {
      return NextResponse.json({ ok: true })
    }

    const { chat, from, text } = update.message
    const command = text.split(' ')[0].toLowerCase()
    const languageCode = from.language_code

    switch (command) {
      case '/start':
        await handleStart(chat.id, from.first_name, languageCode)
        break
      case '/help':
        await handleHelp(chat.id, languageCode)
        break
      case '/status':
        await handleStatus(chat.id, languageCode)
        break
      case '/disconnect':
        await handleDisconnect(chat.id, languageCode)
        break
      default:
        await handleUnknown(chat.id, languageCode)
    }

    return NextResponse.json({ ok: true })
  } catch (error) {
    logger.error('Telegram webhook error:', error)
    return NextResponse.json({ ok: true }) // Always return 200 to Telegram
  }
}

// Verify webhook (optional - for setup)
export function GET() {
  return NextResponse.json({
    status: 'ok',
    message: 'Telegram webhook endpoint',
  })
}
