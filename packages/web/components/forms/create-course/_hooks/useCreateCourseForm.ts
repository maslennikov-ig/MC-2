"use client"

import { useState, useCallback, useEffect, useRef, useMemo } from "react"
import { createClient } from '@/lib/supabase/client'
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { toast } from "sonner"
import { logger } from "@/lib/client-logger"
import { LEARNING_STYLES, reorderLearningStylesWithPreferred } from '@/lib/constants/learning-styles'
import { loadUserPreferences } from '@/lib/user-preferences'
import { canCreateCourses } from '@/app/actions/courses'
import { createDraftSession } from '@/app/actions/draft-session'
import { formSchema, type FormData } from "../_schemas/form-schema"
import { useFileUpload } from "./useFileUpload"
import { useAutoSave } from "./useAutoSave"
import { useSubmitCourse } from "./useSubmitCourse"
import { useWorkerReadiness } from "./useWorkerReadiness"

export function useCreateCourseForm() {
  const [mounted, setMounted] = useState(false)
  const [userPreferredStyle, setUserPreferredStyle] = useState<string | null>(null)
  const [reorderedStyles, setReorderedStyles] = useState(LEARNING_STYLES)
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [draftCourseId, setDraftCourseId] = useState<string | null>(null)
  const [canCreate, setCanCreate] = useState<boolean | null>(null)
  const [userRole, setUserRole] = useState<string>('unknown')
  
  const validationTimeoutsRef = useRef<NodeJS.Timeout[]>([])
  const autoSubmitTimeoutRef = useRef<NodeJS.Timeout | null>(null)

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

  const form = useForm<FormData>({
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

  const {
    handleSubmit,
    formState: { errors },
    watch,
    setValue,
    getValues,
  } = form

  const writingStyle = watch("writingStyle")
  const language = watch("language")
  const rawFormats = watch("formats")
  const formats = useMemo(() => rawFormats || [], [rawFormats])

  // Custom hooks
  const { 
    uploadedFiles, 
    setUploadedFiles, 
    isUploadingFiles, 
    uploadSingleFile, 
    uploadAllFiles 
  } = useFileUpload()

  const { handleFormChange } = useAutoSave(sessionId, getValues)

  // Worker readiness check - poll every 10s until ready
  const workerReadiness = useWorkerReadiness({
    enabled: mounted && canCreate === true,
    pollInterval: 10000,
    pollWhenReady: false, // Stop polling once ready
  })

  const { onSubmit, isSubmitting, authModal, router } = useSubmitCourse({
    sessionId,
    draftCourseId,
    setDraftCourseId,
    uploadedFiles,
    uploadAllFiles,
    getValues
  })

  // Validate and scroll to error
  const validateAndScrollToError = useCallback(() => {
    const errorFields = Object.keys(errors)
    if (errorFields.length > 0) {
      const firstErrorField = errorFields[0]
      const element = document.querySelector(`[name="${firstErrorField}"]`) as HTMLElement
      if (element) {
        const rect = element.getBoundingClientRect()
        const scrollTop = window.pageYOffset || document.documentElement.scrollTop
        const targetPosition = rect.top + scrollTop - 120
        
        window.scrollTo({
          top: targetPosition,
          behavior: 'smooth'
        })
        
        validationTimeoutsRef.current.forEach(clearTimeout)
        validationTimeoutsRef.current = []
        
        const focusTimeout = setTimeout(() => {
          element.focus()
          element.classList.add('animate-pulse', 'ring-2', 'ring-red-500', 'ring-offset-2')
          const removeTimeout = setTimeout(() => {
            element.classList.remove('animate-pulse', 'ring-2', 'ring-red-500', 'ring-offset-2')
            validationTimeoutsRef.current = validationTimeoutsRef.current.filter(t => t !== removeTimeout)
          }, 3000)
          validationTimeoutsRef.current.push(removeTimeout)
        }, 500)
        validationTimeoutsRef.current.push(focusTimeout)
      }
      
      const errorMessages: Record<string, string> = {
        topic: 'Пожалуйста, укажите тему курса',
        email: 'Пожалуйста, укажите email для получения результатов'
      }
      
      toast.error(errorMessages[firstErrorField] || 'Пожалуйста, заполните все обязательные поля')
      return false
    }
    return true
  }, [errors])

  // Initial checks and data loading
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

  useEffect(() => {
    const initSession = async () => {
      if (sessionId || !mounted || canCreate !== true) return

      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

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

  useEffect(() => {
    setMounted(true)

    const loadPreferences = async () => {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()

      if (user) {
        setValue("email", user.email || "")

        try {
          const preferences = await loadUserPreferences(supabase, user.id)
          if (preferences.learning_style) {
            setUserPreferredStyle(preferences.learning_style)
            const currentStyle = getValues("writingStyle")
            if (!currentStyle || currentStyle === "conversational") {
              setValue("writingStyle", preferences.learning_style as FormData['writingStyle'])
            }
            const reordered = reorderLearningStylesWithPreferred(preferences.learning_style)
            setReorderedStyles(reordered)
          }
        } catch {
          // Failed to load user preferences
        }
      }
    }

    const pendingData = localStorage.getItem('pendingCourseData')
    if (pendingData) {
      try {
        const data = JSON.parse(pendingData)
        Object.keys(data).forEach((key) => {
          if (key !== 'files' && data[key] !== undefined) {
            setValue(key as keyof FormData, data[key])
          }
        })
        localStorage.removeItem('pendingCourseData')
        toast.success('Данные формы восстановлены', {
          description: 'Теперь вы можете продолжить создание курса'
        })

        const supabase = createClient()
        supabase.auth.getUser().then(({ data: { user } }) => {
          if (user) {
            if (autoSubmitTimeoutRef.current) {
              clearTimeout(autoSubmitTimeoutRef.current)
            }
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
        // Failed to restore form data
      }
    } else {
      loadPreferences()
    }
  }, [setValue, getValues])

  useEffect(() => {
    if (typeof window !== 'undefined' && mounted) {
      try {
        const preferences = {
          writingStyle,
          language
        }
        localStorage.setItem('courseFormPreferences', JSON.stringify(preferences))
      } catch {
        // Silently fail
      }
    }
  }, [writingStyle, language, mounted])

  useEffect(() => {
    if (writingStyle === "microlearning") {
      setValue("lessonDuration", 3)
    }
  }, [writingStyle, setValue])

  useEffect(() => {
    const currentFormats = getValues("formats")
    if (!currentFormats || currentFormats.length === 0) {
      setValue("formats", ["text"], { shouldValidate: true })
    }
  }, [getValues, setValue])

  useEffect(() => {
    // Cleanup function called at unmount
    return () => {
      // Clear all validation timeouts (from current ref, not a copy)
      validationTimeoutsRef.current.forEach(clearTimeout)
      validationTimeoutsRef.current = []

      // Clear autoSubmit timeout
      if (autoSubmitTimeoutRef.current) {
        clearTimeout(autoSubmitTimeoutRef.current)
        autoSubmitTimeoutRef.current = null
      }
    }
  }, [])

  const toggleFormat = useCallback((format: string, available: boolean, required?: boolean) => {
    if (!available || required) return
    const currentFormats = formats || []
    if (currentFormats.includes(format)) {
      setValue("formats", currentFormats.filter(f => f !== format), { shouldValidate: true })
    } else {
      setValue("formats", [...currentFormats, format], { shouldValidate: true })
    }
  }, [formats, setValue])

  const handleFormSubmit = handleSubmit(onSubmit, () => validateAndScrollToError())

  return {
    form,
    isSubmitting,
    mounted,
    reorderedStyles,
    uploadedFiles,
    setUploadedFiles,
    isUploadingFiles,
    canCreate,
    userRole,
    draftCourseId,
    handleFormChange,
    handleFormSubmit,
    uploadSingleFile,
    toggleFormat,
    authModal,
    router,
    formats,
    workerReadiness,
  }
}
