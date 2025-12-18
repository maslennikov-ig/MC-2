import { NextResponse } from "next/server"
import { supabaseAdmin } from "@/lib/supabase-admin"
import { z } from "zod"
import { logger } from "@/lib/logger"
import { headers } from "next/headers"

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8).regex(
    /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/,
    "Password must contain at least one uppercase letter, one lowercase letter, and one number"
  ),
  fullName: z.string().min(2).max(100),
})

// Rate limiting helper
async function checkRateLimit(identifier: string): Promise<boolean> {
  // supabaseAdmin is always available from lib/supabase-admin.ts

  try {
    // Using type assertion because the rate limit function is optional
    // The system gracefully handles absence of the database function
    const { data, error } = await (supabaseAdmin as unknown as {
      rpc: (name: string, params: Record<string, unknown>) => Promise<{ data: boolean | null; error: Error | null }>
    })
      .rpc('check_rate_limit', {
        p_identifier: identifier,
        p_endpoint: '/api/auth/register',
        p_max_attempts: 5,
        p_window_minutes: 15
      })
    
    if (error) {
      // If function doesn't exist, allow registration but log warning
      if ((error as Error & { code?: string }).code === 'PGRST202' || error.message?.includes('function') || error.message?.includes('does not exist')) {
        logger.warn("Rate limit function not found in database - skipping rate limiting", { error: error.message })
        return true
      }
      
      logger.error("Rate limit check error:", error)
      return true // Allow on error to not block users
    }
    
    return data as boolean
  } catch (err) {
    logger.error("Unexpected error in rate limit check:", err)
    return true // Allow on unexpected error
  }
}

export async function POST(req: Request) {
  try {
    // supabaseAdmin is always available from lib/supabase-admin.ts

    // Get IP for rate limiting
    const headersList = await headers()
    const forwardedFor = headersList.get('x-forwarded-for')
    const realIp = headersList.get('x-real-ip')
    const ip = forwardedFor?.split(',')[0] || realIp || 'unknown'
    
    // Check rate limit
    const allowed = await checkRateLimit(ip)
    if (!allowed) {
      return NextResponse.json(
        { error: "Too many registration attempts. Please try again later." },
        { status: 429 }
      )
    }
    
    const body = await req.json()
    
    // Log registration attempt
    logger.info("Registration attempt", { 
      email: body.email?.toLowerCase(), 
      ip,
      timestamp: new Date().toISOString()
    })
    
    // Validate input
    const validationResult = registerSchema.safeParse(body)
    if (!validationResult.success) {
      return NextResponse.json(
        { error: "Invalid input", details: validationResult.error.flatten() },
        { status: 400 }
      )
    }
    
    const { email, password, fullName } = validationResult.data
    
    // Check if user already exists
    const { data: existingUser } = await supabaseAdmin
      .from('users')
      .select('id')
      .eq('email', email.toLowerCase())
      .single()

    if (existingUser) {
      return NextResponse.json(
        { error: "User with this email already exists" },
        { status: 400 }
      )
    }
    
    // Create user in Supabase Auth
    logger.info("Creating user in Supabase Auth", { email: email.toLowerCase() })
    
    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email: email.toLowerCase(),
      password,
      email_confirm: true, // Auto-confirm for now, change to false for production
      user_metadata: {
        full_name: fullName,
        role: 'user'
      }
    })
    
    if (authError) {
      logger.error("Auth creation error:", {
        error: authError,
        message: authError.message,
        code: authError.code,
        email: email.toLowerCase()
      })
      
      // Handle specific errors
      if (authError.message?.includes('duplicate') || authError.message?.includes('already registered')) {
        return NextResponse.json(
          { error: "Пользователь с таким email уже существует" },
          { status: 400 }
        )
      }
      
      if (authError.message?.includes('password')) {
        return NextResponse.json(
          { error: "Пароль не соответствует требованиям безопасности" },
          { status: 400 }
        )
      }
      
      return NextResponse.json(
        { 
          error: "Не удалось создать учетную запись. Попробуйте позже или обратитесь в поддержку.",
          details: process.env.NODE_ENV === 'development' ? authError.message : undefined
        },
        { status: 500 }
      )
    }
    
    if (!authData.user) {
      return NextResponse.json(
        { error: "User creation failed" },
        { status: 500 }
      )
    }

    // Note: User record in public.users table will be created by database trigger
    // full_name is stored in auth.users.user_metadata
    // password is managed by Supabase Auth (no need to store hash separately)
    
    // Create session for immediate login (optional)
    const { data: sessionData } = await supabaseAdmin.auth.admin.generateLink({
      type: 'magiclink',
      email: email.toLowerCase(),
      options: {
        redirectTo: `${process.env.NEXT_PUBLIC_SITE_URL}/dashboard`
      }
    })
    
    return NextResponse.json(
      { 
        message: "Registration successful! Please check your email to verify your account.",
        user: {
          id: authData.user.id,
          email: authData.user.email,
          name: fullName,
        },
        // Include session for immediate login if needed
        session: sessionData
      },
      { status: 201 }
    )
    
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Invalid data", details: error.flatten() },
        { status: 400 }
      )
    }
    
    logger.error("Registration error:", error)
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    )
  }
}