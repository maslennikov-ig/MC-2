import { createEnv } from '@t3-oss/env-nextjs'
import { z } from 'zod'

export const env = createEnv({
  server: {
    NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
    SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
    SUPABASE_JWT_SECRET: z.string().min(1).optional(),
    COURSEGEN_BACKEND_URL: z.string().url().default('http://localhost:3456'),
  },
  client: {
    NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
    NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
    NEXT_PUBLIC_APP_URL: z.string().url().default('http://localhost:3000'),
    NEXT_PUBLIC_COURSEGEN_BACKEND_URL: z.string().optional(),
    NEXT_PUBLIC_FEATURE_USERBACK: z.string().optional(),
    NEXT_PUBLIC_USERBACK_TOKEN: z.string().optional(),
    NEXT_PUBLIC_TELEGRAM_BOT_USERNAME: z.string().optional(),
  },
  runtimeEnv: {
    NODE_ENV: process.env.NODE_ENV,
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
    SUPABASE_JWT_SECRET: process.env.SUPABASE_JWT_SECRET,
    COURSEGEN_BACKEND_URL: process.env.COURSEGEN_BACKEND_URL,
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
