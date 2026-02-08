import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import crypto from 'crypto'

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN

// Create Supabase admin client
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

interface TelegramAuthData {
  id: number
  first_name: string
  last_name?: string
  username?: string
  photo_url?: string
  auth_date: number
  hash: string
}

/**
 * Verify Telegram auth data using HMAC-SHA256
 * https://core.telegram.org/widgets/login#checking-authorization
 */
function verifyTelegramAuth(data: TelegramAuthData): boolean {
  if (!TELEGRAM_BOT_TOKEN) {
    console.error('TELEGRAM_BOT_TOKEN not configured')
    return false
  }

  const { hash, ...authData } = data

  // Create data-check-string: sorted key=value pairs joined by \n
  const dataCheckString = Object.keys(authData)
    .sort()
    .map((key) => `${key}=${authData[key as keyof typeof authData]}`)
    .join('\n')

  // Secret key is SHA256 hash of bot token
  const secretKey = crypto.createHash('sha256').update(TELEGRAM_BOT_TOKEN).digest()

  // Calculate HMAC-SHA256
  const calculatedHash = crypto
    .createHmac('sha256', secretKey)
    .update(dataCheckString)
    .digest('hex')

  // Verify hash matches
  if (calculatedHash !== hash) {
    console.error('Telegram auth hash mismatch')
    return false
  }

  // Check auth_date is not too old (max 1 day)
  const authDate = data.auth_date * 1000 // Convert to milliseconds
  const maxAge = 24 * 60 * 60 * 1000 // 1 day
  if (Date.now() - authDate > maxAge) {
    console.error('Telegram auth data is too old')
    return false
  }

  return true
}

export async function POST(request: NextRequest) {
  try {
    // Get auth header
    const authHeader = request.headers.get('authorization')
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const accessToken = authHeader.slice(7)

    // Verify user session
    const {
      data: { user },
      error: authError,
    } = await supabaseAdmin.auth.getUser(accessToken)
    if (authError || !user) {
      return NextResponse.json({ error: 'Invalid session' }, { status: 401 })
    }

    // Parse Telegram auth data
    const telegramData: TelegramAuthData = await request.json()

    // Verify Telegram auth
    if (!verifyTelegramAuth(telegramData)) {
      return NextResponse.json({ error: 'Invalid Telegram authorization' }, { status: 400 })
    }

    // Update user profile with Telegram data
    const { error: updateError } = await supabaseAdmin
      .from('users')
      .update({
        telegram_chat_id: telegramData.id.toString(),
        telegram_notifications_enabled: true,
        updated_at: new Date().toISOString(),
      })
      .eq('id', user.id)

    if (updateError) {
      console.error('Failed to update user:', updateError)
      return NextResponse.json({ error: 'Failed to save Telegram connection' }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      telegram_chat_id: telegramData.id.toString(),
      telegram_username: telegramData.username,
      telegram_first_name: telegramData.first_name,
    })
  } catch (error) {
    console.error('Telegram connect error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// Disconnect Telegram
export async function DELETE(request: NextRequest) {
  try {
    // Get auth header
    const authHeader = request.headers.get('authorization')
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const accessToken = authHeader.slice(7)

    // Verify user session
    const {
      data: { user },
      error: authError,
    } = await supabaseAdmin.auth.getUser(accessToken)
    if (authError || !user) {
      return NextResponse.json({ error: 'Invalid session' }, { status: 401 })
    }

    // Remove Telegram data from user profile
    const { error: updateError } = await supabaseAdmin
      .from('users')
      .update({
        telegram_chat_id: null,
        telegram_notifications_enabled: false,
        updated_at: new Date().toISOString(),
      })
      .eq('id', user.id)

    if (updateError) {
      console.error('Failed to update user:', updateError)
      return NextResponse.json({ error: 'Failed to disconnect Telegram' }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Telegram disconnect error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
