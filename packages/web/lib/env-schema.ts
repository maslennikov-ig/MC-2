import { createEnv } from '@t3-oss/env-nextjs'
import { z } from 'zod'

export const env = createEnv({
  server: {
    /** Runtime environment (auto-detected by Next.js) */
    NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
    /** Supabase service role key for admin operations (bypasses RLS) */
    SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
    /** Supabase JWT secret for manual token verification. Optional if using Supabase client-side validation only */
    SUPABASE_JWT_SECRET: z.string().min(1).optional(),
    /** Course generation backend URL (tRPC server) */
    COURSEGEN_BACKEND_URL: z.string().url().default('http://localhost:3456'),
  },
  client: {
    /** Supabase project URL */
    NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
    /** Supabase anonymous key for client-side auth */
    NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
    /** Application base URL for metadata and OG images */
    NEXT_PUBLIC_APP_URL: z.string().url().default('http://localhost:3000'),
    /** Backend URL override for client-side tRPC calls (optional, auto-detected from window.location) */
    NEXT_PUBLIC_COURSEGEN_BACKEND_URL: z.string().optional(),
    /** Userback feedback widget toggle */
    NEXT_PUBLIC_FEATURE_USERBACK: z.string().optional(),
    /** Userback widget token */
    NEXT_PUBLIC_USERBACK_TOKEN: z.string().optional(),
    /** Telegram bot username for /start deep links */
    NEXT_PUBLIC_TELEGRAM_BOT_USERNAME: z.string().optional(),
  },
  // Next.js >= 13.4.4: only client vars need explicit destructuring
  // Server vars are auto-read from process.env
  experimental__runtimeEnv: {
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
    NEXT_PUBLIC_COURSEGEN_BACKEND_URL: process.env.NEXT_PUBLIC_COURSEGEN_BACKEND_URL,
    NEXT_PUBLIC_FEATURE_USERBACK: process.env.NEXT_PUBLIC_FEATURE_USERBACK,
    NEXT_PUBLIC_USERBACK_TOKEN: process.env.NEXT_PUBLIC_USERBACK_TOKEN,
    NEXT_PUBLIC_TELEGRAM_BOT_USERNAME: process.env.NEXT_PUBLIC_TELEGRAM_BOT_USERNAME,
  },
  skipValidation: !!process.env.SKIP_ENV_VALIDATION,
  emptyStringAsUndefined: true,
})
