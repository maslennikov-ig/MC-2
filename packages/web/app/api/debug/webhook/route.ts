import { NextRequest, NextResponse } from 'next/server'
import { logger } from '@/lib/logger'

export async function GET(_request: NextRequest) {
  const webhookUrl = process.env.N8N_WEBHOOK_URL || process.env.NEXT_PUBLIC_N8N_WEBHOOK_URL
  const webhookSecret = process.env.N8N_WEBHOOK_SECRET

  const debugInfo = {
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV,
    webhook: {
      hasUrl: !!webhookUrl,
      hasSecret: !!webhookSecret,
      urlSource: process.env.N8N_WEBHOOK_URL ? 'N8N_WEBHOOK_URL' :
                 process.env.NEXT_PUBLIC_N8N_WEBHOOK_URL ? 'NEXT_PUBLIC_N8N_WEBHOOK_URL' : 'none',
      urlPrefix: webhookUrl ? webhookUrl.substring(0, 40) + '...' : 'not configured',
    },
    envVariables: {
      n8nRelated: Object.keys(process.env)
        .filter(key => key.includes('N8N') || key.includes('WEBHOOK'))
        .map(key => ({
          key,
          hasValue: !!process.env[key as keyof typeof process.env],
          length: process.env[key as keyof typeof process.env]?.length || 0
        }))
    },
    testConnection: null as { success: boolean; status?: number; statusText?: string; error?: string } | null
  }

  // Test actual connection to webhook if configured
  if (webhookUrl && webhookSecret) {
    try {
      const testPayload = {
        test: true,
        timestamp: new Date().toISOString()
      }

      logger.info('Testing webhook connection', { url: webhookUrl })

      const response = await fetch(webhookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(testPayload),
        signal: AbortSignal.timeout(3000) // 3 second timeout
      }).catch(error => {
        return {
          ok: false,
          status: 0,
          error: error.message
        }
      })

      debugInfo.testConnection = {
        success: response.ok || response.status === 504, // 504 is acceptable
        status: response.status,
        statusText: 'statusText' in response ? (response as Response).statusText : 'Connection failed',
        error: 'error' in response ? (response as { error: string }).error : undefined
      }
    } catch (error) {
      debugInfo.testConnection = {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      }
    }
  }

  logger.info('Webhook debug info', debugInfo)

  return NextResponse.json(debugInfo, { status: 200 })
}