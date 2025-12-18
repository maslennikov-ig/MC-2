import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { logger } from "@/lib/logger"
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { Database } from '@/types/supabase'
import { COOKIE_CONFIG } from '@/lib/cookie-config'

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
})

export async function POST(req: NextRequest) {
  try {
    // Check if environment variables are set
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
      logger.error("Login failed: Supabase environment variables not set")
      return NextResponse.json(
        { error: "Authentication service unavailable" },
        { status: 503 }
      )
    }

    const body = await req.json()
    
    // Validate input
    const validationResult = loginSchema.safeParse(body)
    if (!validationResult.success) {
      return NextResponse.json(
        { error: "Invalid email or password format" },
        { status: 400 }
      )
    }
    
    const { email, password } = validationResult.data
    
    // Prepare response
    let response = NextResponse.next()
    
    // Create SSR client with cookie handling
    const cookieStore = await cookies()
    const supabase = createServerClient<Database>(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
      {
        cookies: {
          getAll() {
            return cookieStore.getAll()
          },
          setAll(cookiesToSet) {
            try {
              cookiesToSet.forEach(({ name, value, options }) => {
                cookieStore.set(name, value, options)
              })
            } catch {
              // Server Component context - cookies will be set in response
            }
          },
        },
      }
    )
    
    // Sign in with Supabase Auth
    const { data, error } = await supabase.auth.signInWithPassword({
      email: email.toLowerCase(),
      password
    })
    
    if (error) {
      logger.error("Login error:", error)
      return NextResponse.json(
        { error: "Invalid email or password" },
        { status: 401 }
      )
    }
    
    if (!data.user || !data.session) {
      return NextResponse.json(
        { error: "Login failed" },
        { status: 401 }
      )
    }
    
    // Get user profile
    const { data: userProfile } = await supabase
      .from('users')
      .select('role')
      .eq('id', data.user.id)
      .single()

    // Get full_name from user metadata
    const fullName = data.user.user_metadata?.full_name || data.user.email?.split('@')[0]

    // Create successful response
    response = NextResponse.json(
      {
        user: {
          id: data.user.id,
          email: data.user.email,
          name: fullName,
          role: userProfile?.role || 'student'
        },
        session: {
          access_token: data.session.access_token,
          refresh_token: data.session.refresh_token,
          expires_at: data.session.expires_at
        }
      },
      { status: 200 }
    )
    
    // Manually set auth cookies on the response for proper SSR
    const supabaseCookies = cookieStore.getAll().filter(cookie => 
      cookie.name.startsWith('sb-') || cookie.name.includes('supabase')
    )
    
    supabaseCookies.forEach(cookie => {
      // Use centralized cookie configuration for consistency
      response.cookies.set(
        cookie.name, 
        cookie.value, 
        COOKIE_CONFIG.auth()
      )
    })
    
    return response
    
  } catch (error) {
    logger.error("Login error:", error)
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    )
  }
}