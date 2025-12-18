import { NextRequest, NextResponse } from "next/server"
import { getAdminClient } from "@/lib/supabase/client-factory"
import { withOptionalAuth, AuthUser } from "@/lib/auth"
import { logger } from "@/lib/logger"
import type { Json } from "@/types/database.generated"

async function handleContentGeneration(request: NextRequest, user: AuthUser | null) {
  try {
    const body = await request.json()
    
    const {
      webhook,
      courseId,
      lessonId,
      lessonNumber,
      lessonTitle,
      sectionId,
      formatId,
      language = "ru"
    } = body

    logger.info('Content generation request', { webhook, courseId, lessonId, formatId, userId: user?.id })

    // Validate required fields
    if (!webhook || !courseId || !lessonId) {
      logger.error('Missing required fields', { webhook, courseId, lessonId })
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      )
    }

    // Use admin client for server operations
    const supabase = getAdminClient()
    
    // Get lesson content from database
    const { data: lesson, error: lessonError } = await supabase
      .from("lessons")
      .select("*")
      .eq("id", lessonId)
      .single()

    if (lessonError || !lesson) {
      logger.error('Lesson not found', { lessonId, lessonError })
      return NextResponse.json(
        { error: "Lesson not found" },
        { status: 404 }
      )
    }

    // Get course information
    const { data: course, error: courseError } = await supabase
      .from("courses")
      .select("title, course_description, style, target_audience")
      .eq("id", courseId)
      .single()

    if (courseError || !course) {
      logger.error('Course not found', { courseId, courseError })
      return NextResponse.json(
        { error: "Course not found" },
        { status: 404 }
      )
    }

    // Prepare webhook payload (with safe fallbacks for testing)
    const webhookPayload = {
      courseId,
      courseTitle: course?.title || "Test Course",
      courseDescription: course?.course_description || "Test Description",
      lessonId,
      lessonNumber: lessonNumber || lesson?.order_index || 1,
      lessonTitle: lessonTitle || lesson?.title || "Test Lesson",
      lessonContent: lesson?.content_text || lesson?.content || "Test content for webhook testing",
      lessonObjectives: lesson?.objectives || [],
      lessonDuration: lesson?.duration_minutes || 5,
      sectionId,
      formatId,
      language,
      timestamp: new Date().toISOString(),
      metadata: {
        courseStyle: course?.style || "academic",
        targetAudience: course?.target_audience || "general"
      }
    }

    logger.info('Sending webhook request', { url: webhook })

    // Send webhook request
    const webhookResponse = await fetch(webhook, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`,
        "User-Agent": "MegaCampusAI/1.0"
      },
      body: JSON.stringify(webhookPayload)
    })

    logger.info('Webhook response received', { status: webhookResponse.status })

    if (!webhookResponse.ok) {
      const errorText = await webhookResponse.text()
      logger.error('Webhook failed', { error: errorText, response: {
        status: webhookResponse.status,
        statusText: webhookResponse.statusText,
        headers: Object.fromEntries(webhookResponse.headers.entries()),
        body: errorText
      }})
      return NextResponse.json(
        { 
          error: "Webhook request failed",
          details: errorText,
          status: webhookResponse.status
        },
        { status: 500 }
      )
    }

    // Parse webhook response
    let webhookResult
    try {
      webhookResult = await webhookResponse.json()
    } catch {
      webhookResult = { success: true, message: "Webhook accepted" }
    }

    // Update lesson metadata to track generated content (only if lesson exists)
    if (lesson) {
      try {
        const currentMetadata = (lesson.metadata || {}) as Record<string, Json | undefined>
        const generatedContent = (currentMetadata.generated_content || {}) as Record<string, Json | undefined>
        generatedContent[formatId] = {
          status: "requested",
          requestedAt: new Date().toISOString(),
          webhookResponse: webhookResult as Json
        }

        const updatedMetadata: Json = {
          ...currentMetadata,
          generated_content: generatedContent
        }
        
        const { error: updateError } = await supabase
          .from("lessons")
          .update({
            metadata: updatedMetadata
          })
          .eq("id", lessonId)
        
        if (updateError) {
          logger.warn('Failed to update lesson metadata', { error: updateError, lessonId })
          // Continue execution - this is not a critical failure
        }
      } catch (metadataError) {
        logger.warn('Error updating lesson metadata', { error: metadataError, lessonId })
        // Continue execution - this is not a critical failure
      }
    }

    return NextResponse.json({
      success: true,
      message: "Content generation initiated",
      lessonId,
      formatId,
      webhookResponse: webhookResult
    })

  } catch (error) {
    logger.error('Content generation failed', { error })
    return NextResponse.json(
      { 
        error: "Internal server error",
        details: error instanceof Error ? error.message : "Unknown error"
      },
      { status: 500 }
    )
  }
}

// Export the POST handler with optional authentication
// MVP version allows content generation without authentication
export const POST = withOptionalAuth(handleContentGeneration)