/**
 * Global Setup for Playwright E2E Tests
 *
 * Handles authentication and environment preparation before test execution.
 */

import type { FullConfig } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const dirname = path.dirname(fileURLToPath(import.meta.url))
const LEGACY_SUPABASE_AUTH_COOKIE = 'sb-diqooqbuchsliypgwksu-auth-token'
const DEFAULT_E2E_USER_EMAIL = 'test-instructor1@megacampus.com'
const DEFAULT_E2E_USER_PASSWORD = 'test-password-123'
const E2E_USER_ID = '00000000-0000-0000-0000-000000000012'
const E2E_ORGANIZATION_ID = '759ba851-3f16-4294-9627-dc5a0a366c8e'
const E2E_VIEWER_PLAYBOOK_ID = '00000000-0000-4000-8000-000000002001'

function encodeSupabaseSessionCookie(session: unknown) {
  return `base64-${Buffer.from(JSON.stringify(session)).toString('base64url')}`
}

function getSupabaseAuthCookieNames() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'http://localhost:54321'
  const hostname = new URL(supabaseUrl).hostname
  const derivedProjectRef = hostname.split('.')[0] || 'localhost'

  return [...new Set([`sb-${derivedProjectRef}-auth-token`, LEGACY_SUPABASE_AUTH_COOKIE])]
}

function firstEnv(...names: string[]) {
  for (const name of names) {
    const value = process.env[name]?.trim()
    if (value) return value
  }
  return undefined
}

async function resolveAuthenticatedSession() {
  const token = process.env.TOKEN?.trim()
  if (token) {
    return {
      access_token: token,
      refresh_token: token,
      token_type: 'bearer',
      expires_at: Math.floor(Date.now() / 1000) + 60 * 60,
      expires_in: 60 * 60,
    }
  }

  const supabaseUrl = firstEnv('NEXT_PUBLIC_SUPABASE_URL', 'SUPABASE_URL')
  const supabaseAnonKey = firstEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'SUPABASE_ANON_KEY')
  const email = firstEnv('E2E_AUTH_EMAIL', 'TEST_AUTH_EMAIL') ?? DEFAULT_E2E_USER_EMAIL
  const password = firstEnv('E2E_AUTH_PASSWORD', 'TEST_AUTH_PASSWORD') ?? DEFAULT_E2E_USER_PASSWORD

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error(
      'Authenticated Playwright tests require TOKEN or Supabase auth env: NEXT_PUBLIC_SUPABASE_URL/SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY/SUPABASE_ANON_KEY'
    )
  }

  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  })
  const { data, error } = await supabase.auth.signInWithPassword({ email, password })

  if (error || !data.session) {
    throw new Error(
      `Authenticated Playwright setup failed for ${email}: ${error?.message ?? 'missing session'}`
    )
  }

  return data.session
}

async function seedCareerPlaybookViewerFixture() {
  const supabaseUrl = firstEnv('NEXT_PUBLIC_SUPABASE_URL', 'SUPABASE_URL')
  const serviceKey = firstEnv('SUPABASE_SERVICE_ROLE_KEY', 'SUPABASE_SERVICE_KEY')
  if (!supabaseUrl || !serviceKey) {
    console.warn('[Global Setup] Supabase service key not available; viewer fixture not seeded')
    return
  }

  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  })

  await supabase
    .from('career_playbooks')
    .delete()
    .eq('user_id', E2E_USER_ID)
    .neq('id', E2E_VIEWER_PLAYBOOK_ID)

  const { error } = await supabase.from('career_playbooks').upsert(
    {
      id: E2E_VIEWER_PLAYBOOK_ID,
      user_id: E2E_USER_ID,
      organization_id: E2E_ORGANIZATION_ID,
      status: 'completed',
      language: 'en',
      position_title: 'Sales Director',
      department: 'Sales',
      specialization: 'Enterprise sales',
      level: 'director',
      q_a_data: {
        fixed: [{ question_key: 'position', value: 'Sales Director' }],
        followups: [],
        freeform: [],
        business_context: {
          mode: 'universal',
          status: 'skipped',
          digest: null,
          source_ids: [],
        },
        followup_questions: [],
        followup_generation_count: 0,
        completeness_score: 1,
      },
      generated_blocks: {
        header: { status: 'generated', content: '# Sales Director' },
        block_1: { status: 'generated', content: 'Own enterprise sales execution.' },
      },
      final_markdown: '# Sales Director\n\nOwn enterprise sales execution.',
      is_public: false,
      visibility: 'private',
    },
    { onConflict: 'id' }
  )

  if (error) {
    throw new Error(`Failed to seed Career Playbook viewer fixture: ${error.message}`)
  }
}

async function globalSetup(config: FullConfig) {
  console.log('[Global Setup] Starting...')

  // Ensure .auth directory exists
  const authDir = path.join(dirname, '.auth')
  if (!fs.existsSync(authDir)) {
    fs.mkdirSync(authDir, { recursive: true })
  }

  const authFile = path.join(authDir, 'user.json')

  console.log('[Global Setup] Setting up authenticated state...')

  try {
    await seedCareerPlaybookViewerFixture()
    const session = await resolveAuthenticatedSession()

    const baseURL = String(config.projects[0].use.baseURL || 'http://localhost:3000')
    const baseUrl = new URL(baseURL)
    const cookieValue = encodeSupabaseSessionCookie(session)
    const authCookies = getSupabaseAuthCookieNames()
    const expiresAt = session.expires_at ?? Math.floor(Date.now() / 1000) + 60 * 60

    const storageState = {
      cookies: authCookies.map((name) => ({
        name,
        value: cookieValue,
        domain: baseUrl.hostname,
        path: '/',
        sameSite: 'Lax' as const,
        expires: expiresAt,
        httpOnly: false,
        secure: baseUrl.protocol === 'https:',
      })),
      origins: [
        {
          origin: baseUrl.origin,
          localStorage: authCookies.map((name) => ({
            name,
            value: JSON.stringify(session),
          })),
        },
      ],
    }

    // Save storage state
    fs.writeFileSync(authFile, JSON.stringify(storageState, null, 2))
    console.log(`[Global Setup] Auth state saved to ${authFile}`)
  } catch (error) {
    console.error('[Global Setup] Error during setup:', error)
    throw error
  }

  console.log('[Global Setup] Complete')
}

export default globalSetup
