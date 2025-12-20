"use client"

import React, { useState, useCallback, useEffect, useRef, useMemo } from "react"
import { logger } from "@/lib/logger"
import { useRouter } from "next/navigation"
import { createClient } from '@/lib/supabase/client'
import type { Route } from "next"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { useAuthModal } from '@/lib/hooks/use-auth-modal'
import { z } from "zod"
import { motion } from "framer-motion"
import { toast } from "sonner"
import { LEARNING_STYLES, reorderLearningStylesWithPreferred } from '@/lib/constants/learning-styles'
import { loadUserPreferences } from '@/lib/user-preferences'
import { createDraftCourse, updateDraftAndStartGeneration, canCreateCourses } from '@/app/actions/courses'
import type { CreateCourseError } from '@/types/course-generation'
import { createDraftSession, updateDraftSession, materializeDraftSession } from '@/app/actions/draft-session'
import type { DraftFormData } from '@/lib/draft-session'
import { FileUpload, readFileAsBase64 } from '@/components/forms/file-upload'
import type { UploadedFile, FileUploadStatus } from '@/components/forms/file-upload'
import { AuthRequiredState, PermissionDeniedState } from '@/components/common/error-states'
import {
  FileText,
  AlertCircle,
  Loader2,
  Sparkles,
  Users,
  Globe,
  Mail,
  ChevronDown,
  Settings2,
  BookOpen,
  FolderOpen,
  Info,
  PenTool,
  Video,
  Mic,
  FlaskConical,
  MousePointerClick,
  ClipboardList,
  Presentation,
  ClipboardCheck,
} from "lucide-react"

const formSchema = z.object({
  topic: z.string().min(3, "Тема должна содержать минимум 3 символа").max(200),
  email: z.string().email("Введите корректный email"),
  description: z.string().optional(),
  writingStyle: z.enum(["academic", "conversational", "storytelling", "practical", "motivational", "visual", "gamified", "minimalist", "research", "engaging", "professional", "socratic", "problem_based", "collaborative", "technical", "microlearning", "inspirational", "interactive", "analytical"]).optional(),
  language: z.enum(["ru", "en", "zh", "es", "fr", "de", "ja", "ko", "ar", "pt", "it", "tr", "vi", "th", "id", "ms", "hi", "bn", "pl"]).optional(),
  targetAudience: z.string().optional(),
  estimatedLessons: z.number().min(10).max(100).optional().or(z.nan().transform(() => undefined)),
  estimatedSections: z.number().min(3).max(30).optional().or(z.nan().transform(() => undefined)),
  contentStrategy: z.enum(["auto", "create_from_scratch", "expand_and_enhance", "optimize_existing"]).optional(),
  lessonDuration: z.number().int().min(3).max(45).optional(),
  learningOutcomes: z.string().optional(),
  formats: z.array(z.string()).optional()
})

type FormData = z.infer<typeof formSchema>

// WritingStyle interface and writingStyles array removed - now using LEARNING_STYLES from shared constants

interface GenerationFormat {
  value: string
  icon: React.ComponentType<{ className?: string }>
  title: string
  description: string
  available: boolean // indicates if format is available for use
  required?: boolean // if true, format is always enabled and cannot be toggled
}

const generationFormats: GenerationFormat[] = [
  { value: "text", icon: FileText, title: "Текст", description: "Основной текст уроков", available: true, required: true },
  { value: "video", icon: Video, title: "Видео", description: "Создание видео-урока", available: false },
  { value: "audio", icon: Mic, title: "Аудио", description: "Озвучка текста урока", available: false },
  { value: "tests", icon: FlaskConical, title: "Тесты", description: "Тесты для проверки знаний", available: false },
  { value: "interactive", icon: MousePointerClick, title: "Интерактив", description: "Интерактивные упражнения", available: false },
  { value: "quiz", icon: ClipboardList, title: "Квиз", description: "Тестовые вопросы по материалу", available: false },
  { value: "presentation", icon: Presentation, title: "Презентация", description: "Слайды для урока", available: false },
  { value: "exercises", icon: PenTool, title: "Задания", description: "Практические упражнения", available: false },
  { value: "summary", icon: ClipboardCheck, title: "Конспект", description: "Краткое изложение материала", available: false }
]

export default function CreateCourseForm() {
  const router = useRouter()
  const authModal = useAuthModal()
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [showAdvancedSettings, setShowAdvancedSettings] = useState(false)
  const [showAllStyles, setShowAllStyles] = useState(false)
  const [mounted, setMounted] = useState(false)
  const [userPreferredStyle, setUserPreferredStyle] = useState<string | null>(null)
  const [reorderedStyles, setReorderedStyles] = useState(LEARNING_STYLES)
  // File upload state for local file uploads
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([])
  const [isUploadingFiles, setIsUploadingFiles] = useState(false)
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [draftCourseId, setDraftCourseId] = useState<string | null>(null)
  const [canCreate, setCanCreate] = useState<boolean | null>(null)
  const [userRole, setUserRole] = useState<string>('unknown')
  const timeoutRef = useRef<NodeJS.Timeout | null>(null)
  const validationTimeoutsRef = useRef<NodeJS.Timeout[]>([])
  const autoSubmitTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const autoSaveTimeoutRef = useRef<NodeJS.Timeout | null>(null)

  // Load saved preferences from localStorage
  const getSavedPreferences = () => {
    if (typeof window === 'undefined') return null
    try {
      const saved = localStorage.getItem('courseFormPreferences')
      return saved ? JSON.parse(saved) : null
    } catch {
      return null
    }
  }

  const {
    register,
    handleSubmit,
    formState: { errors },
    watch,
    setValue,
    getValues,
  } = useForm<FormData>({
    resolver: zodResolver(formSchema),
    mode: "onChange",
    defaultValues: {
      writingStyle: userPreferredStyle || getSavedPreferences()?.writingStyle || "conversational",
      language: getSavedPreferences()?.language || "ru",
      contentStrategy: "auto",
      formats: ["text"],
      lessonDuration: 5,
    },
  })

  // Note: File upload functionality has been moved to generation page

  // Handle form validation and scroll to first error
  const validateAndScrollToError = () => {
    const errorFields = Object.keys(errors)
    if (errorFields.length > 0) {
      const firstErrorField = errorFields[0]
      const element = document.querySelector(`[name="${firstErrorField}"]`) as HTMLElement
      if (element) {
        // Get the element's position
        const rect = element.getBoundingClientRect()
        const scrollTop = window.pageYOffset || document.documentElement.scrollTop
        
        // Calculate position with offset for sticky header (approximately 80px)
        const targetPosition = rect.top + scrollTop - 120
        
        // Smooth scroll to the calculated position
        window.scrollTo({
          top: targetPosition,
          behavior: 'smooth'
        })
        
        // Clear any existing validation timeouts
        validationTimeoutsRef.current.forEach(clearTimeout)
        validationTimeoutsRef.current = []
        
        // Focus after scroll animation
        const focusTimeout = setTimeout(() => {
          element.focus()
          // Add highlight animation
          element.classList.add('animate-pulse', 'ring-2', 'ring-red-500', 'ring-offset-2')
          const removeTimeout = setTimeout(() => {
            element.classList.remove('animate-pulse', 'ring-2', 'ring-red-500', 'ring-offset-2')
            // Remove this timeout from the array after it executes
            validationTimeoutsRef.current = validationTimeoutsRef.current.filter(t => t !== removeTimeout)
          }, 3000)
          validationTimeoutsRef.current.push(removeTimeout)
        }, 500)
        validationTimeoutsRef.current.push(focusTimeout)
      }
      
      // Show toast with specific error message
      const errorMessages: Record<string, string> = {
        topic: 'Пожалуйста, укажите тему курса',
        email: 'Пожалуйста, укажите email для получения результатов'
      }
      
      toast.error(errorMessages[firstErrorField] || 'Пожалуйста, заполните все обязательные поля')
      return false
    }
    return true
  }

  // Auto-save to Redis session (debounced)
  // This is a non-critical feature - if Redis is unavailable, the form still works
  const autoSaveToRedis = useCallback(async (formData: Partial<DraftFormData>) => {
    if (!sessionId) return

    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    try {
      const result = await updateDraftSession(user.id, sessionId, formData)
      if (!result.success) {
        // Only log at debug level - auto-save is non-critical
        logger.debug('Auto-save skipped (Redis unavailable)', { error: result.error })
      } else {
        logger.debug('Form auto-saved to Redis', { sessionId })
      }
    } catch (error) {
      // Silently ignore - auto-save is a nice-to-have feature
      logger.debug('Auto-save skipped', { error })
    }
  }, [sessionId])

  // Debounced auto-save on form change
  const handleFormChange = useCallback(() => {
    if (autoSaveTimeoutRef.current) {
      clearTimeout(autoSaveTimeoutRef.current)
    }

    autoSaveTimeoutRef.current = setTimeout(() => {
      const currentValues = getValues()
      const draftFormData: Partial<DraftFormData> = {
        topic: currentValues.topic,
        description: currentValues.description,
        language: currentValues.language,
        email: currentValues.email,
        writingStyles: currentValues.writingStyle ? [currentValues.writingStyle] : undefined,
        outputFormats: currentValues.formats || undefined,
      }
      autoSaveToRedis(draftFormData)
    }, 3000) // 3 seconds debounce
  }, [autoSaveToRedis, getValues])

  // Upload a single file to the server
  const uploadSingleFile = useCallback(async (
    file: UploadedFile,
    courseId: string
  ): Promise<string | null> => {
    try {
      // Read file as base64
      const fileContent = await readFileAsBase64(file.file)

      // Update progress to indicate upload starting
      setUploadedFiles(prev =>
        prev.map(f =>
          f.id === file.id
            ? { ...f, status: 'uploading' as FileUploadStatus, progress: 30 }
            : f
        )
      )

      // Send to API
      const response = await fetch('/api/coursegen/upload', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          courseId,
          filename: file.file.name,
          fileSize: file.file.size,
          mimeType: file.file.type || 'application/octet-stream',
          fileContent,
        }),
      })

      // Update progress
      setUploadedFiles(prev =>
        prev.map(f =>
          f.id === file.id
            ? { ...f, progress: 80 }
            : f
        )
      )

      const data = await response.json()

      // Check for specific errors
      if (!response.ok) {
        if (data.code === 'QUOTA_EXCEEDED' || (data.message && data.message.includes('quota exceeded'))) {
          toast.warning("Превышен лимит хранилища", {
            description: "Не удалось загрузить файл. Место на диске закончилось.",
            duration: 5000
          })
          throw new Error("Превышен лимит хранилища")
        }
        throw new Error(data.error || 'Upload failed')
      }

      // Update to success state
      setUploadedFiles(prev =>
        prev.map(f =>
          f.id === file.id
            ? { ...f, status: 'success' as FileUploadStatus, progress: 100, fileId: data.fileId }
            : f
        )
      )

      logger.info('File uploaded successfully', {
        filename: file.file.name,
        fileId: data.fileId,
        courseId,
      })

      return data.fileId
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'

      // Update to error state
      setUploadedFiles(prev =>
        prev.map(f =>
          f.id === file.id
            ? { ...f, status: 'error' as FileUploadStatus, progress: 0, error: errorMessage }
            : f
        )
      )

      logger.error('File upload failed', {
        filename: file.file.name,
        courseId,
        error: errorMessage,
      })

      return null
    }
  }, [])

  // Upload all pending files
  const uploadAllFiles = useCallback(async (courseId: string): Promise<string[]> => {
    const pendingFiles = uploadedFiles.filter(f => f.status === 'pending')
    if (pendingFiles.length === 0) {
      // Return already uploaded file IDs
      return uploadedFiles
        .filter(f => f.status === 'success' && f.fileId)
        .map(f => f.fileId!)
    }

    setIsUploadingFiles(true)
    const fileIds: string[] = []

    // Upload files sequentially to avoid overwhelming the server
    for (const file of pendingFiles) {
      const fileId = await uploadSingleFile(file, courseId)
      if (fileId) {
        fileIds.push(fileId)
      }
    }

    setIsUploadingFiles(false)

    // Include previously uploaded file IDs
    const previousFileIds = uploadedFiles
      .filter(f => f.status === 'success' && f.fileId)
      .map(f => f.fileId!)

    return [...previousFileIds, ...fileIds]
  }, [uploadedFiles, uploadSingleFile])

  // Check permissions on mount
  useEffect(() => {
    const checkPermissions = async () => {
      const { canCreate: hasPermission, role } = await canCreateCourses()
      setCanCreate(hasPermission)
      setUserRole(role)
    }

    if (mounted) {
      checkPermissions()
    }
  }, [mounted])

  // Create Redis session on mount (replaces auto-draft creation)
  useEffect(() => {
    const initSession = async () => {
      if (sessionId || !mounted || canCreate !== true) return

      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      // Get organizationId (same logic as in createDraftCourse)
      const { data: orgData } = await supabase
        .from('users')
        .select('organization_id')
        .eq('id', user.id)
        .single()

      if (!orgData?.organization_id) {
        logger.warn('No organization_id found for user', { userId: user.id })
        return
      }

      const result = await createDraftSession(user.id, orgData.organization_id)

      if (result.success) {
        setSessionId(result.data)
        logger.info('Draft session created', { sessionId: result.data, userId: user.id })
      } else {
        logger.error('Failed to create draft session', { error: result.error })
      }
    }

    initSession()
  }, [sessionId, mounted, canCreate])

  const onSubmit = async (data: FormData) => {
    // SECURITY: Check if user is authenticated using getUser() instead of getSession()
    // getUser() validates JWT by contacting Supabase Auth server
    const supabase = createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      // Save form data to localStorage before opening auth modal
      const formData = getValues()
      localStorage.setItem('pendingCourseData', JSON.stringify({
        ...formData,
        files: uploadedFiles.map(f => ({
          name: f.file.name,
          size: f.file.size,
          type: f.file.type
        }))
      }))

      // Open auth modal with callback to resubmit form after auth
      authModal.open('login', {
        onSuccess: () => {
          // Reload the page to resubmit the form with saved data
          window.location.reload()
        }
      })

      toast.info("Требуется авторизация", {
        description: "Войдите или зарегистрируйтесь для создания курса. Ваши данные будут сохранены."
      })
      return
    }

    setIsSubmitting(true)

    try {
      let finalCourseId: string

      // NEW: Materialize Redis session to DB if it exists
      if (sessionId && !draftCourseId) {
        const result = await materializeDraftSession(user.id, sessionId)

        if (!result.success) {
          toast.error("Ошибка создания курса", { description: result.error })
          setIsSubmitting(false)
          return
        }

        finalCourseId = result.data.id
        setDraftCourseId(result.data.id)
        logger.info('Session materialized to DB', { courseId: finalCourseId, sessionId })
      } else if (draftCourseId && draftCourseId !== 'failed') {
        // Use existing draft course ID
        finalCourseId = draftCourseId
      } else {
        // Fallback: create directly if no session exists
        const draftResult = await createDraftCourse(data.topic)
        if ('error' in draftResult) {
          toast.error("Ошибка создания черновика курса", {
            description: draftResult.error
          })
          setIsSubmitting(false)
          return
        }
        finalCourseId = draftResult.id
      }

      // Prepare form data for submission
      const formData = new FormData()
      formData.append('topic', data.topic)
      formData.append('course_description', data.description || '')
      formData.append('target_audience', data.targetAudience || '')
      formData.append('language', data.language || 'ru')

      // Only append optional fields if they have values
      if (data.writingStyle) {
        formData.append('style', data.writingStyle)
      }
      if (data.contentStrategy) {
        formData.append('content_strategy', data.contentStrategy)
      }
      formData.append('lesson_duration_minutes', String(data.lessonDuration || 5))
      formData.append('learning_outcomes', data.learningOutcomes || '')

      // Add output formats
      if (data.formats && data.formats.length > 0) {
        data.formats.forEach(format => {
          formData.append('output_formats', format)
        })
      }

      // Add optional fields
      if (data.estimatedLessons) {
        formData.append('estimated_lessons', data.estimatedLessons.toString())
      }
      if (data.estimatedSections) {
        formData.append('estimated_sections', data.estimatedSections.toString())
      }

      // Upload pending files if any
      if (uploadedFiles.length > 0) {
        toast.info("Загрузка файлов...", {
          description: `Загружаем ${uploadedFiles.filter(f => f.status === 'pending').length} файл(ов)`,
          duration: 3000
        })

        const fileIds = await uploadAllFiles(finalCourseId)

        // Add uploaded file IDs to form data
        fileIds.forEach(fileId => {
          formData.append('file_ids', fileId)
        })

        // Check if any files failed to upload
        const failedFiles = uploadedFiles.filter(f => f.status === 'error')
        if (failedFiles.length > 0) {
          toast.warning("Некоторые файлы не загружены", {
            description: `${failedFiles.length} файл(ов) не удалось загрузить. Курс будет создан без них.`,
            duration: 5000
          })
        }
      }

      // Now update the draft with full data and start generation
      const result = await updateDraftAndStartGeneration(finalCourseId, formData)

      // Check if error
      if ('error' in result) {
        const error = result as CreateCourseError

        // Handle rate limiting specially
        if (error.code === 'RATE_LIMIT_EXCEEDED') {
          toast.error("Превышен лимит создания курсов", {
            description: error.error,
            duration: 10000
          })
        } else {
          toast.error("Ошибка создания курса", {
            description: error.error || "Произошла неизвестная ошибка"
          })
        }

        setIsSubmitting(false)
        return
      }

      // Success! Redirect to generation page
      toast.success("Перенаправление...", {
        description: "Переходим к отслеживанию прогресса",
        duration: 1500
      })

      // Redirect to the generation page with the real slug
      router.push(`/courses/generating/${result.slug}` as Route<string>)

    } catch (error) {
      logger.error("Error creating course:", error)

      toast.error("Произошла ошибка", {
        description: error instanceof Error ? error.message : "Не удалось создать курс"
      })

      setIsSubmitting(false)
    }
  }

  const writingStyle = watch("writingStyle")
  const language = watch("language")
  const rawFormats = watch("formats")
  const formats = useMemo(() => rawFormats || [], [rawFormats])

  // Auto-set lesson duration for microlearning style
  useEffect(() => {
    if (writingStyle === "microlearning") {
      setValue("lessonDuration", 3)
    }
  }, [writingStyle, setValue])

  // Styles display logic
  const displayedStyles = useMemo(() => {
    return showAllStyles ? reorderedStyles : reorderedStyles.slice(0, 12)
  }, [showAllStyles, reorderedStyles])

  // Set mounted state and restore saved data
  useEffect(() => {
    setMounted(true)

    // Load user preferences including learning style
    const loadPreferences = async () => {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()

      if (user) {
        // Set user email
        setValue("email", user.email || "")

        // Load user preferences from database
        try {
          const preferences = await loadUserPreferences(supabase, user.id)
          if (preferences.learning_style) {
            setUserPreferredStyle(preferences.learning_style)
            // Set as default value if not already set
            const currentStyle = getValues("writingStyle")
            if (!currentStyle || currentStyle === "conversational") {
              setValue("writingStyle", preferences.learning_style as FormData['writingStyle'])
            }
            // Reorder styles with preferred one first
            const reordered = reorderLearningStylesWithPreferred(preferences.learning_style)
            setReorderedStyles(reordered)
          }
        } catch {
          // Failed to load user preferences - will use defaults
        }
      }
    }

    // Check for pending course data after authentication
    const pendingData = localStorage.getItem('pendingCourseData')
    if (pendingData) {
      try {
        const data = JSON.parse(pendingData)

        // Restore form values
        Object.keys(data).forEach((key) => {
          if (key !== 'files' && data[key] !== undefined) {
            setValue(key as keyof FormData, data[key])
          }
        })

        // Clear the pending data
        localStorage.removeItem('pendingCourseData')

        // Show a message that data was restored
        toast.success('Данные формы восстановлены', {
          description: 'Теперь вы можете продолжить создание курса'
        })

        // Auto-submit if user just authenticated
        const supabase = createClient()
        supabase.auth.getUser().then(({ data: { user } }) => {
          if (user) {
            // Clear any existing auto-submit timeout
            if (autoSubmitTimeoutRef.current) {
              clearTimeout(autoSubmitTimeoutRef.current)
            }
            // Wait a bit for form to be fully rendered
            autoSubmitTimeoutRef.current = setTimeout(() => {
              const submitButton = document.querySelector('[type="submit"]') as HTMLButtonElement
              if (submitButton) {
                submitButton.click()
              }
              autoSubmitTimeoutRef.current = null
            }, 500)
          }
        })
      } catch {
        // Failed to restore form data - user will need to re-enter
      }
    } else {
      // Load user preferences
      loadPreferences()
    }
  }, [setValue, getValues])

  // Save preferences to localStorage when they change
  useEffect(() => {
    if (typeof window !== 'undefined' && mounted) {
      try {
        const preferences = {
          writingStyle,
          language
        }
        localStorage.setItem('courseFormPreferences', JSON.stringify(preferences))
      } catch {
        // localStorage might be disabled or quota exceeded
        // Silently fail as this is a non-critical feature
      }
    }
  }, [writingStyle, language, mounted])

  // Toggle format selection - check availability and required status
  const toggleFormat = useCallback((format: string, available: boolean, required?: boolean) => {
    // Don't allow toggling unavailable or required formats
    if (!available || required) {
      return
    }
    const currentFormats = formats || []
    if (currentFormats.includes(format)) {
      setValue("formats", currentFormats.filter(f => f !== format), { shouldValidate: true })
    } else {
      setValue("formats", [...currentFormats, format], { shouldValidate: true })
    }
  }, [formats, setValue])

  // Cleanup timeout on unmount
  // Initialize formats field on mount
  useEffect(() => {
    // Ensure formats array is properly initialized
    const currentFormats = getValues("formats")
    if (!currentFormats || currentFormats.length === 0) {
      setValue("formats", ["text"], { shouldValidate: true })
    }
  }, [getValues, setValue])

  useEffect(() => {
    // Store ref values in local variables to ensure proper cleanup
    const timeout = timeoutRef.current
    const validationTimeouts = [...validationTimeoutsRef.current]
    const autoSubmitTimeout = autoSubmitTimeoutRef.current
    const autoSaveTimeout = autoSaveTimeoutRef.current

    return () => {
      // Clean up all timeouts on unmount
      if (timeout) {
        clearTimeout(timeout)
      }
      // Clean up validation timeouts
      validationTimeouts.forEach(clearTimeout)
      validationTimeoutsRef.current = []
      // Clean up auto-submit timeout
      if (autoSubmitTimeout) {
        clearTimeout(autoSubmitTimeout)
      }
      // Clean up auto-save timeout
      if (autoSaveTimeout) {
        clearTimeout(autoSaveTimeout)
      }
    }
  }, [])

  // Custom submit handler that handles validation errors
  const handleFormSubmit = handleSubmit(
    onSubmit,
    // onInvalid callback - called when validation fails
    () => {
      validateAndScrollToError()
    }
  )

  // Show loading state while checking permissions
  if (canCreate === null) {
    return (
      <div className="w-full max-w-5xl mx-auto">
        <div className="bg-white/90 dark:bg-black/70 backdrop-blur-xl rounded-2xl p-8 border border-slate-200 dark:border-white/10 text-center">
          <Loader2 className="w-12 h-12 text-purple-400 animate-spin mx-auto mb-4" />
          <p className="text-slate-600 dark:text-white/80">Проверка прав доступа...</p>
        </div>
      </div>
    )
  }

  // Show restriction notice for unauthenticated users
  if (!canCreate && userRole === 'unauthenticated') {
    return (
      <div className="w-full max-w-5xl mx-auto">
        <AuthRequiredState
          variant="card"
          onSignIn={() => authModal.open('login')}
          onRegister={() => authModal.open('register')}
        />
      </div>
    )
  }

  // Show restriction notice for authenticated users without permissions
  if (!canCreate) {
    return (
      <div className="w-full max-w-5xl mx-auto">
        <PermissionDeniedState
          variant="card"
          userRole={userRole}
          returnUrl="/courses"
          contactUrl="/profile"
        />
      </div>
    )
  }

  return (
    <div className="w-full mx-auto">
      <form onSubmit={handleFormSubmit} className="grid grid-cols-1 xl:grid-cols-2 gap-6 xl:gap-8">
        {/* Basic Information Section */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="bg-white/90 dark:bg-black/70 backdrop-blur-xl rounded-2xl p-4 sm:p-6 md:p-8 border border-slate-200 dark:border-white/10 xl:col-span-1"
        >
          <h2 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white mb-4 sm:mb-6 flex items-center gap-2 sm:gap-3">
            <BookOpen className="w-5 h-5 sm:w-6 sm:h-6 text-purple-500 dark:text-purple-400" />
            Основная информация
          </h2>

          <div className="space-y-6">
            {/* Topic Field */}
            <div>
              <label htmlFor="topic" className="block text-slate-700 dark:text-white/90 mb-2 font-medium">
                Тема курса <span className="text-red-500 dark:text-red-400">*</span>
              </label>
              <input
                id="topic"
                {...register("topic")}
                type="text"
                className={`w-full px-4 py-3 bg-slate-100 dark:bg-black/30 backdrop-blur-sm border rounded-xl text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-white/40 focus:outline-none focus:bg-slate-50 dark:focus:bg-black/40 transition-all ${
                  errors.topic ? 'border-red-500 animate-pulse' : 'border-slate-300 dark:border-white/20 focus:border-purple-500 dark:focus:border-purple-400'
                }`}
                placeholder="Например: Основы машинного обучения"
                aria-describedby={errors.topic ? "topic-error" : undefined}
                aria-invalid={errors.topic ? "true" : "false"}
                aria-required="true"
                onBlur={handleFormChange}
              />
              {errors.topic && (
                <motion.p
                  id="topic-error"
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="text-red-400 text-sm mt-2 flex items-center gap-1"
                  role="alert"
                  aria-live="polite"
                >
                  <AlertCircle className="w-4 h-4" aria-hidden="true" />
                  {errors.topic.message}
                </motion.p>
              )}
            </div>

            {/* Email Field */}
            <div>
              <label htmlFor="email" className="block text-slate-700 dark:text-white/90 mb-2 font-medium">
                <Mail className="inline w-4 h-4 mr-2" aria-hidden="true" />
                Email для результатов <span className="text-red-500 dark:text-red-400">*</span>
                <span className="text-slate-500 dark:text-white/50 text-sm ml-2">(из вашего профиля)</span>
              </label>
              <input
                id="email"
                {...register("email")}
                type="email"
                readOnly
                disabled
                className="w-full px-4 py-3 bg-slate-100 dark:bg-black/20 backdrop-blur-sm border border-slate-200 dark:border-white/10 rounded-xl text-slate-500 dark:text-white/70 cursor-not-allowed"
                placeholder="your@email.com"
                aria-describedby="email-info"
                aria-readonly="true"
              />
              <p id="email-info" className="text-slate-500 dark:text-white/50 text-xs mt-1">
                Email автоматически подставляется из регистрационных данных
              </p>
            </div>

            {/* Language Field */}
            <div>
              <label htmlFor="language" className="block text-slate-700 dark:text-white/90 mb-2 font-medium">
                <Globe className="inline w-4 h-4 mr-2" aria-hidden="true" />
                Язык курса
              </label>
              <select
                id="language"
                {...register("language")}
                className="w-full px-4 py-3 bg-slate-100 dark:bg-white/10 border border-slate-300 dark:border-white/20 rounded-xl text-slate-900 dark:text-white appearance-none focus:outline-none focus:border-purple-500 dark:focus:border-purple-400 focus:bg-slate-50 dark:focus:bg-white/15 transition-all cursor-pointer"
                aria-label="Выберите язык курса"
              >
                <option value="ru" className="bg-white dark:bg-gray-800 text-slate-900 dark:text-white">🇷🇺 Русский</option>
                <option value="en" className="bg-white dark:bg-gray-800 text-slate-900 dark:text-white">🇬🇧 English</option>
                <option value="zh" className="bg-white dark:bg-gray-800 text-slate-900 dark:text-white">🇨🇳 中文 (Chinese)</option>
                <option value="es" className="bg-white dark:bg-gray-800 text-slate-900 dark:text-white">🇪🇸 Español</option>
                <option value="fr" className="bg-white dark:bg-gray-800 text-slate-900 dark:text-white">🇫🇷 Français</option>
                <option value="de" className="bg-white dark:bg-gray-800 text-slate-900 dark:text-white">🇩🇪 Deutsch</option>
                <option value="ja" className="bg-white dark:bg-gray-800 text-slate-900 dark:text-white">🇯🇵 日本語 (Japanese)</option>
                <option value="ko" className="bg-white dark:bg-gray-800 text-slate-900 dark:text-white">🇰🇷 한국어 (Korean)</option>
                <option value="ar" className="bg-white dark:bg-gray-800 text-slate-900 dark:text-white">🇸🇦 العربية (Arabic)</option>
                <option value="pt" className="bg-white dark:bg-gray-800 text-slate-900 dark:text-white">🇵🇹 Português</option>
                <option value="it" className="bg-white dark:bg-gray-800 text-slate-900 dark:text-white">🇮🇹 Italiano</option>
                <option value="tr" className="bg-white dark:bg-gray-800 text-slate-900 dark:text-white">🇹🇷 Türkçe</option>
                <option value="vi" className="bg-white dark:bg-gray-800 text-slate-900 dark:text-white">🇻🇳 Tiếng Việt</option>
                <option value="th" className="bg-white dark:bg-gray-800 text-slate-900 dark:text-white">🇹🇭 ไทย (Thai)</option>
                <option value="id" className="bg-white dark:bg-gray-800 text-slate-900 dark:text-white">🇮🇩 Bahasa Indonesia</option>
                <option value="ms" className="bg-white dark:bg-gray-800 text-slate-900 dark:text-white">🇲🇾 Bahasa Melayu</option>
                <option value="hi" className="bg-white dark:bg-gray-800 text-slate-900 dark:text-white">🇮🇳 हिन्दी (Hindi)</option>
                <option value="bn" className="bg-white dark:bg-gray-800 text-slate-900 dark:text-white">🇧🇩 বাংলা (Bengali)</option>
                <option value="pl" className="bg-white dark:bg-gray-800 text-slate-900 dark:text-white">🇵🇱 Polski</option>
              </select>
            </div>

            {/* Description Field */}
            <div>
              <label htmlFor="description" className="block text-slate-700 dark:text-white/90 mb-2 font-medium">
                Описание и требования
                <span className="text-slate-500 dark:text-white/50 text-sm ml-2">(что должно быть в курсе)</span>
              </label>
              <textarea
                id="description"
                {...register("description")}
                rows={4}
                className={`w-full px-4 py-3 bg-slate-100 dark:bg-white/10 border rounded-xl text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-white/40 focus:outline-none focus:bg-slate-50 dark:focus:bg-white/15 transition-all resize-none ${
                  errors.description ? 'border-red-500 animate-pulse' : 'border-slate-300 dark:border-white/20 focus:border-purple-500 dark:focus:border-purple-400'
                }`}
                placeholder="Опишите ключевые темы, целевую аудиторию и желаемые результаты обучения..."
                aria-describedby={errors.description ? "description-error" : undefined}
                aria-invalid={errors.description ? "true" : "false"}
                onBlur={handleFormChange}
              />
              {errors.description && (
                <motion.p
                  id="description-error"
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="text-red-400 text-sm mt-2 flex items-center gap-1"
                  role="alert"
                  aria-live="polite"
                >
                  <AlertCircle className="w-4 h-4" aria-hidden="true" />
                  {errors.description.message}
                </motion.p>
              )}
            </div>
          </div>
        </motion.div>

        {/* Output Formats */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.2 }}
          className="bg-white/90 dark:bg-black/70 backdrop-blur-xl rounded-2xl p-4 sm:p-6 md:p-8 border border-slate-200 dark:border-white/10 xl:col-span-1"
        >
          <h2 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white mb-4 sm:mb-6 flex items-center gap-2 sm:gap-3">
            <FolderOpen className="w-5 h-5 sm:w-6 sm:h-6 text-purple-500 dark:text-purple-400" />
            Форматы генерации
          </h2>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 md:gap-4">
            {generationFormats.map((format) => {
              const isSelected = mounted && formats.includes(format.value)
              const isAvailable = format.available
              const isRequired = format.required
              const isClickable = isAvailable && !isRequired
              return (
                <motion.div
                  key={format.value}
                  whileHover={isClickable ? { scale: 1.02 } : {}}
                  whileTap={isClickable ? { scale: 0.98 } : {}}
                  onClick={() => toggleFormat(format.value, format.available, format.required)}
                  className={`relative p-4 rounded-xl border-2 transition-all ${
                    !isAvailable
                      ? "opacity-60 cursor-not-allowed grayscale-[30%]"
                      : isRequired
                        ? "cursor-default"
                        : "cursor-pointer"
                  } ${
                    isSelected && isAvailable
                      ? "bg-gradient-to-br from-purple-500/20 to-pink-500/20 border-purple-500 dark:border-purple-400"
                      : isAvailable
                        ? "bg-slate-50 dark:bg-white/5 border-slate-200 dark:border-white/10 hover:border-slate-400 dark:hover:border-white/30"
                        : "bg-slate-50 dark:bg-white/5 border-slate-200 dark:border-white/10"
                  }`}
                >
                {/* Required badge for always-on formats */}
                {isRequired && (
                  <span className="absolute top-2 right-2 px-2 py-0.5 text-xs font-medium bg-green-500/20 text-green-600 dark:text-green-400 rounded-full border border-green-500/30">
                    Всегда
                  </span>
                )}
                {/* Coming Soon badge for unavailable formats */}
                {!isAvailable && (
                  <span className="absolute top-2 right-2 px-2 py-0.5 text-xs font-medium bg-amber-500/20 text-amber-600 dark:text-amber-400 rounded-full border border-amber-500/30">
                    Скоро
                  </span>
                )}
                <div className="flex items-center gap-3">
                  <format.icon className={`w-6 h-6 ${isAvailable ? 'text-purple-500 dark:text-purple-400' : 'text-slate-400 dark:text-white/40'}`} />
                  <div>
                    <h3 className={`font-semibold ${isAvailable ? 'text-slate-900 dark:text-white' : 'text-slate-600 dark:text-white/60'}`}>{format.title}</h3>
                    <p className={`text-sm ${isAvailable ? 'text-slate-500 dark:text-white/60' : 'text-slate-400 dark:text-white/40'}`}>{format.description}</p>
                  </div>
                </div>
              </motion.div>
              )
            })}
          </div>
          {errors.formats && (
            <motion.p
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              className="text-red-400 text-sm mt-4 flex items-center gap-1"
            >
              <AlertCircle className="w-4 h-4" />
              {errors.formats.message}
            </motion.p>
          )}
        </motion.div>

        {/* Writing Style Selection */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.3 }}
          className="bg-white/90 dark:bg-black/70 backdrop-blur-xl rounded-2xl p-4 sm:p-6 md:p-8 border border-slate-200 dark:border-white/10 xl:col-span-1"
        >
          <h2 id="writing-style-heading" className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white mb-4 sm:mb-6 flex items-center gap-2 sm:gap-3">
            <PenTool className="w-5 h-5 sm:w-6 sm:h-6 text-purple-500 dark:text-purple-400" aria-hidden="true" />
            Стиль изложения
          </h2>
          
          <fieldset>
            <legend className="sr-only">Выберите стиль изложения курса</legend>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 md:gap-4" role="radiogroup" aria-labelledby="writing-style-heading">
              {displayedStyles.map((style) => {
                const isSelected = mounted && writingStyle === style.value
                return (
                  <label
                    key={style.value}
                    className={`relative cursor-pointer transition-all ${
                      isSelected ? "scale-105" : ""
                    }`}
                  >
                    <input
                      type="radio"
                      {...register("writingStyle")}
                      value={style.value}
                      className="sr-only"
                      aria-describedby={`style-${style.value}-desc`}
                    />
                    <div
                      className={`p-3 sm:p-4 rounded-xl border-2 transition-all h-full flex flex-col ${
                        isSelected
                          ? "bg-gradient-to-br from-purple-500/30 to-pink-500/30 border-purple-500 dark:border-purple-400 backdrop-blur-md"
                          : "bg-slate-50 dark:bg-black/20 backdrop-blur-sm border-slate-200 dark:border-white/10 hover:border-slate-400 dark:hover:border-white/30"
                      }`}
                      role="radio"
                      aria-checked={isSelected}
                      tabIndex={isSelected ? 0 : -1}
                    >
                    <div className="flex items-start gap-3">
                      <div className="flex-shrink-0">
                        <style.icon className="w-6 h-6 sm:w-7 sm:h-7 md:w-8 md:h-8 text-purple-500 dark:text-purple-400" aria-hidden="true" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <h3 className="font-bold text-slate-900 dark:text-white text-sm sm:text-base mb-1">{style.title}</h3>
                        <p id={`style-${style.value}-desc`} className="text-slate-600 dark:text-white/70 text-xs sm:text-sm line-clamp-2 sm:line-clamp-none">{style.description}</p>
                      </div>
                    </div>
                  </div>
                </label>
                )
              })}
            </div>
            
            {/* Show More Styles Button */}
            {!showAllStyles && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="mt-6 text-center"
              >
                <button
                  type="button"
                  onClick={() => setShowAllStyles(true)}
                  className="inline-flex items-center gap-2 px-6 py-3 bg-slate-100 dark:bg-white/10 hover:bg-slate-200 dark:hover:bg-white/20 text-slate-700 dark:text-white rounded-xl transition-all border border-slate-200 dark:border-white/20 hover:border-purple-500/50 dark:hover:border-purple-400/50"
                >
                  <ChevronDown className="w-5 h-5" />
                  <span className="font-medium text-sm sm:text-base">Ещё стили (+7)</span>
                </button>
              </motion.div>
            )}

            {/* Hide Styles Button */}
            {showAllStyles && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="mt-6 text-center"
              >
                <button
                  type="button"
                  onClick={() => setShowAllStyles(false)}
                  className="inline-flex items-center gap-2 px-6 py-3 bg-slate-100 dark:bg-white/10 hover:bg-slate-200 dark:hover:bg-white/20 text-slate-700 dark:text-white rounded-xl transition-all border border-slate-200 dark:border-white/20 hover:border-purple-500/50 dark:hover:border-purple-400/50"
                >
                  <ChevronDown className="w-5 h-5 rotate-180" />
                  <span className="font-medium text-sm sm:text-base">Скрыть стили</span>
                </button>
              </motion.div>
            )}
          </fieldset>
        </motion.div>

        {/* File Upload Section - Local Storage */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.4 }}
          className="bg-white/90 dark:bg-black/70 backdrop-blur-xl rounded-2xl p-4 sm:p-6 md:p-8 border border-slate-200 dark:border-white/10 xl:col-span-1"
        >
          <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-4 flex items-center gap-3">
            <FolderOpen className="w-6 h-6 text-purple-500 dark:text-purple-400" />
            Загрузка учебных материалов (необязательно)
          </h2>

          <div className="mb-4 p-4 bg-purple-50 dark:bg-black/30 backdrop-blur-md border border-purple-200 dark:border-purple-400/30 rounded-lg flex items-start gap-3">
            <Info className="w-5 h-5 text-purple-500 dark:text-purple-400 mt-0.5" />
            <div className="text-slate-700 dark:text-white/80 text-sm">
              <p className="font-medium mb-1">Загрузите материалы для анализа и генерации курса</p>
              <p>Поддерживаются: PDF, DOCX, TXT, MD и другие форматы. Максимум 50MB на файл.</p>
              <p className="text-slate-500 dark:text-white/60 mt-1">Файлы будут использованы как основа для создания курса. Система проанализирует содержание и создаст структурированные уроки.</p>
            </div>
          </div>

          <FileUpload
            courseId={draftCourseId}
            uploadedFiles={uploadedFiles}
            onFilesChange={setUploadedFiles}
            onUploadFile={async (file) => {
              if (!draftCourseId) return null
              return uploadSingleFile(file, draftCourseId)
            }}
            disabled={isSubmitting || isUploadingFiles}
            maxFiles={10}
          />

          {uploadedFiles.filter(f => f.status === 'success').length > 0 && (
            <div className="mt-4 p-3 bg-green-500/10 border border-green-500/30 rounded-lg">
              <p className="text-green-400 text-sm">
                Загружено файлов: {uploadedFiles.filter(f => f.status === 'success').length}. Они будут использованы для генерации курса.
              </p>
            </div>
          )}
        </motion.div>

        {/* Advanced Settings - Unified Collapsible Section */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.5 }}
          className="xl:col-span-2 bg-gradient-to-br from-white/90 to-white/70 dark:from-black/70 dark:to-black/60 backdrop-blur-xl rounded-2xl border border-slate-200 dark:border-white/10 overflow-hidden"
        >
          {/* Trigger Button */}
          <button
            type="button"
            onClick={() => setShowAdvancedSettings(!showAdvancedSettings)}
            className={`w-full flex items-center justify-between p-6 transition-all hover:bg-slate-50/50 dark:hover:bg-white/5 ${
              showAdvancedSettings ? 'border-b border-slate-200 dark:border-white/10' : ''
            }`}
            aria-expanded={showAdvancedSettings}
            aria-controls="advanced-settings-content"
          >
            <div className="flex items-center gap-3">
              <Settings2 className="w-6 h-6 text-purple-500 dark:text-purple-400" />
              <span className="text-xl font-bold text-slate-900 dark:text-white">
                Дополнительные настройки
              </span>
              <span className="text-slate-500 dark:text-white/50 text-sm font-normal">
                (необязательно)
              </span>
            </div>
            <motion.div
              animate={{ rotate: showAdvancedSettings ? 180 : 0 }}
              transition={{ duration: 0.2 }}
            >
              <ChevronDown className="w-5 h-5 text-slate-500 dark:text-white/60" />
            </motion.div>
          </button>

          {/* Collapsible Content */}
          <motion.div
            id="advanced-settings-content"
            initial={false}
            animate={{
              height: showAdvancedSettings ? "auto" : 0,
              opacity: showAdvancedSettings ? 1 : 0
            }}
            transition={{ duration: 0.3, ease: "easeInOut" }}
            className="overflow-hidden"
          >
            <div className="p-6 pt-4 md:p-8 md:pt-6">

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 md:gap-6 lg:gap-8">
            <div>
              <label className="block text-slate-700 dark:text-white/90 mb-2 font-medium">
                <Users className="inline w-4 h-4 mr-2" />
                Целевая аудитория
              </label>
              <input
                {...register("targetAudience")}
                type="text"
                className={`w-full px-4 py-3 bg-slate-100 dark:bg-black/30 backdrop-blur-sm border rounded-xl text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-white/40 focus:outline-none focus:bg-slate-50 dark:focus:bg-black/40 transition-all ${
                  errors.targetAudience ? 'border-red-500 animate-pulse' : 'border-slate-300 dark:border-white/20 focus:border-purple-500 dark:focus:border-purple-400'
                }`}
                placeholder="Разработчики, менеджеры, студенты..."
              />
              {errors.targetAudience && (
                <p className="text-red-500 dark:text-red-400 text-sm mt-2">
                  {errors.targetAudience.message}
                </p>
              )}
            </div>

            <div>
              <label className="block text-slate-700 dark:text-white/90 mb-2 font-medium">
                Количество уроков
                <span className="text-slate-500 dark:text-white/50 text-sm ml-2">(авто если не указано)</span>
              </label>
              <input
                {...register("estimatedLessons", {
                  setValueAs: (v) => v === "" ? undefined : Number(v)
                })}
                type="number"
                min="10"
                max="100"
                className="w-full px-4 py-3 bg-slate-100 dark:bg-black/30 backdrop-blur-sm border border-slate-300 dark:border-white/20 rounded-xl text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-white/40 focus:outline-none focus:border-purple-500 dark:focus:border-purple-400 focus:bg-slate-50 dark:focus:bg-black/40 transition-all"
                placeholder="Автоматически"
              />
            </div>

            <div>
              <label className="block text-slate-700 dark:text-white/90 mb-2 font-medium">
                Количество модулей
                <span className="text-slate-500 dark:text-white/50 text-sm ml-2">(авто если не указано)</span>
              </label>
              <input
                {...register("estimatedSections", {
                  setValueAs: (v) => v === "" ? undefined : Number(v)
                })}
                type="number"
                min="3"
                max="30"
                className="w-full px-4 py-3 bg-slate-100 dark:bg-black/30 backdrop-blur-sm border border-slate-300 dark:border-white/20 rounded-xl text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-white/40 focus:outline-none focus:border-purple-500 dark:focus:border-purple-400 focus:bg-slate-50 dark:focus:bg-black/40 transition-all"
                placeholder="Автоматически"
              />
            </div>

            <div>
              <label className="block text-slate-700 dark:text-white/90 mb-2 font-medium">
                Стратегия контента
              </label>
              <select
                {...register("contentStrategy")}
                className="w-full px-4 py-3 bg-slate-100 dark:bg-white/10 border border-slate-300 dark:border-white/20 rounded-xl text-slate-900 dark:text-white appearance-none focus:outline-none focus:border-purple-500 dark:focus:border-purple-400 focus:bg-slate-50 dark:focus:bg-white/15 transition-all cursor-pointer"
              >
                <option value="auto" className="bg-white dark:bg-gray-800 text-slate-900 dark:text-white">Автоматически</option>
                <option value="create_from_scratch" className="bg-white dark:bg-gray-800 text-slate-900 dark:text-white">Создать с нуля</option>
                <option value="expand_and_enhance" className="bg-white dark:bg-gray-800 text-slate-900 dark:text-white">Расширить и улучшить</option>
                <option value="optimize_existing" className="bg-white dark:bg-gray-800 text-slate-900 dark:text-white">Оптимизировать существующий</option>
              </select>
            </div>

            <div className="md:col-span-2">
              <label className="block text-slate-700 dark:text-white/90 mb-2 font-medium flex items-center gap-2">
                <Settings2 className="w-4 h-4" />
                Длительность урока
              </label>
              <select
                {...register("lessonDuration", { valueAsNumber: true })}
                className="w-full px-4 py-3 bg-slate-100 dark:bg-black/30 backdrop-blur-sm border border-slate-300 dark:border-white/20 rounded-xl text-slate-900 dark:text-white focus:outline-none focus:border-purple-500 dark:focus:border-purple-400 focus:bg-slate-50 dark:focus:bg-black/40 transition-all"
              >
                <option value={3} className="bg-white dark:bg-gray-800 text-slate-900 dark:text-white">3 минуты — микрообучение</option>
                <option value={5} className="bg-white dark:bg-gray-800 text-slate-900 dark:text-white">5 минут — быстрое изучение (рекомендуется)</option>
                <option value={10} className="bg-white dark:bg-gray-800 text-slate-900 dark:text-white">10 минут — стандартный урок</option>
                <option value={15} className="bg-white dark:bg-gray-800 text-slate-900 dark:text-white">15 минут — углубленное изучение</option>
                <option value={20} className="bg-white dark:bg-gray-800 text-slate-900 dark:text-white">20 минут — глубокое погружение</option>
                <option value={30} className="bg-white dark:bg-gray-800 text-slate-900 dark:text-white">30 минут — для сложных тем</option>
                <option value={45} className="bg-white dark:bg-gray-800 text-slate-900 dark:text-white">45 минут — ЭКСТРЕМАЛЬНО (не рекомендуется)</option>
              </select>
              <p className="text-xs text-slate-500 dark:text-white/50 mt-1">
                5 минут оптимально для большинства тем. При выборе стиля &quot;Микрообучение&quot; автоматически устанавливается 3 минуты.
              </p>
              {watch("lessonDuration") === 45 && (
                <div className="mt-2 p-3 bg-red-500/10 border border-red-500/30 rounded-lg">
                  <p className="text-xs text-red-400 font-medium">
                    ⚠️ <strong>Внимание:</strong> 45 минут крайне не рекомендуется из-за:
                  </p>
                  <ul className="text-xs text-red-300 mt-1 ml-4 space-y-0.5">
                    <li>• Резкое падение концентрации после 20 минут</li>
                    <li>• Низкий процент завершения длинных уроков (~30%)</li>
                    <li>• Высокая когнитивная нагрузка снижает усвоение материала</li>
                    <li>• Лучше разбить на 2-3 урока по 15-20 минут</li>
                  </ul>
                  <p className="text-xs text-red-400 mt-2">
                    💡 <strong>Рекомендация:</strong> Используйте только для исключительных случаев (детальный разбор комплексных технических систем).
                  </p>
                </div>
              )}
            </div>

            <div className="md:col-span-2">
              <label className="block text-slate-700 dark:text-white/90 mb-2 font-medium">
                Результаты обучения
              </label>
              <textarea
                {...register("learningOutcomes")}
                rows={3}
                className="w-full px-4 py-3 bg-slate-100 dark:bg-white/10 border border-slate-300 dark:border-white/20 rounded-xl text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-white/40 focus:outline-none focus:border-purple-500 dark:focus:border-purple-400 focus:bg-slate-50 dark:focus:bg-white/15 transition-all resize-none"
                placeholder="После прохождения курса студенты смогут..."
              />
            </div>
          </div>
            </div>
          </motion.div>
        </motion.div>

        {/* Submit Section */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.6 }}
          className="xl:col-span-2 flex flex-col sm:flex-row gap-4 justify-between items-center"
        >
          <div className="text-slate-500 dark:text-white/60 text-sm">
            * Обязательные поля
          </div>
          <div className="flex gap-4">
            <button
              type="button"
              onClick={() => router.push("/")}
              className="px-6 py-3 bg-slate-100 dark:bg-white/10 hover:bg-slate-200 dark:hover:bg-white/20 text-slate-700 dark:text-white font-medium rounded-xl transition-all"
              aria-label="Отменить создание курса и вернуться на главную страницу"
            >
              Отмена
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className={`inline-flex items-center gap-3 px-8 py-4 rounded-xl font-semibold text-lg transition-all duration-200 group ${
                !isSubmitting
                  ? "bg-gradient-to-r from-violet-600 to-purple-600 text-white hover:from-violet-700 hover:to-purple-700 shadow-xl hover:shadow-2xl hover:scale-105"
                  : "bg-white/10 text-white/40 cursor-not-allowed"
              }`}
              aria-label={
                isSubmitting ? "Создание курса в процессе" :
                "Создать новый курс с указанными параметрами"
              }
              aria-disabled={isSubmitting}
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-6 h-6 animate-spin" aria-hidden="true" />
                  <span>Создание курса...</span>
                </>
              ) : (
                <>
                  <Sparkles className="w-6 h-6 group-hover:rotate-12 transition-transform" aria-hidden="true" />
                  <span>Создать курс</span>
                </>
              )}
            </button>
          </div>
        </motion.div>
      </form>
    </div>
  )
}