'use client'

import { useState, useMemo } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import * as z from 'zod'
import { useTranslations } from 'next-intl'
import { useSupabase } from '@/lib/supabase/browser-client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Icons } from '@/components/common/icons'
import { useAuthModal } from '@/lib/hooks/use-auth-modal'
import { logger } from '@/lib/client-logger'
import { toast } from '@/lib/toast'
import { useRouter } from 'next/navigation'
import { refreshAuthState } from '@/app/actions/auth'

// Supabase error code to translation key mapping
const AUTH_ERROR_KEYS = {
  invalid_credentials: 'errors.invalidCredentials',
  invalid_grant: 'errors.invalidCredentials',
  user_not_found: 'errors.userNotFound',
  email_not_confirmed: 'errors.emailNotConfirmed',
  user_banned: 'errors.userBanned',
  over_request_rate_limit: 'errors.rateLimited',
} as const

interface LoginFormProps {
  onSuccess?: () => void
}

export function LoginForm({ onSuccess }: LoginFormProps) {
  const t = useTranslations('auth')
  const [isLoading, setIsLoading] = useState(false)
  const { returnTo, onSuccessCallback, close, setMode } = useAuthModal()
  const router = useRouter()
  const { supabase } = useSupabase()

  const loginSchema = useMemo(
    () =>
      z.object({
        email: z.string().min(1, t('validation.emailRequired')).email(t('validation.emailInvalid')),
        password: z.string().min(6, t('validation.passwordMin6')),
      }),
    [t]
  )

  type LoginFormData = z.infer<typeof loginSchema>

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginFormData>({
    resolver: zodResolver(loginSchema),
  })

  // Get translated error message for Supabase auth errors
  const getAuthErrorMessage = (error: { code?: string }): string => {
    const code = error.code as keyof typeof AUTH_ERROR_KEYS | undefined
    const key = code && AUTH_ERROR_KEYS[code]
    return key ? t(key) : t('errors.invalidCredentials')
  }

  const onSubmit = async (data: LoginFormData) => {
    setIsLoading(true)

    try {
      // Use Supabase client directly for authentication
      const { data: authData, error } = await supabase.auth.signInWithPassword({
        email: data.email.toLowerCase(),
        password: data.password,
      })

      if (error) {
        logger.error('Login error:', error)
        toast.error(getAuthErrorMessage(error))
        setIsLoading(false)
        return
      }

      if (authData.session) {
        toast.success(t('login.success'))

        close()
        onSuccessCallback?.()
        onSuccess?.()

        await refreshAuthState()

        router.refresh()

        await new Promise((resolve) => setTimeout(resolve, 100))

        if (returnTo && returnTo !== window.location.pathname) {
          router.push(returnTo)
        }
      }
    } catch (error) {
      logger.error('Login error:', error)
      toast.error(t('errors.loginFailed'))
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <form onSubmit={(e) => void handleSubmit(onSubmit)(e)} className="space-y-4">
      <div className="space-y-2">
        <Label
          htmlFor="login-email"
          className="text-sm font-medium text-gray-700 dark:text-gray-300"
        >
          {t('login.email')}
        </Label>
        <Input
          id="login-email"
          type="email"
          placeholder={t('login.emailPlaceholder')}
          disabled={isLoading}
          className="h-11 border-gray-200 bg-gray-50 px-4 focus:border-purple-500 focus:ring-purple-500/20 dark:border-gray-700 dark:bg-gray-800/50 dark:focus:border-purple-400"
          {...register('email')}
        />
        {errors.email && (
          <p className="text-sm text-red-500 dark:text-red-400">{errors.email.message}</p>
        )}
      </div>

      <div className="space-y-2">
        <Label
          htmlFor="login-password"
          className="text-sm font-medium text-gray-700 dark:text-gray-300"
        >
          {t('login.password')}
        </Label>
        <Input
          id="login-password"
          type="password"
          placeholder={t('login.passwordPlaceholder')}
          disabled={isLoading}
          className="h-11 border-gray-200 bg-gray-50 px-4 focus:border-purple-500 focus:ring-purple-500/20 dark:border-gray-700 dark:bg-gray-800/50 dark:focus:border-purple-400"
          {...register('password')}
        />
        {errors.password && (
          <p className="text-sm text-red-500 dark:text-red-400">{errors.password.message}</p>
        )}
      </div>

      <div className="flex items-center justify-end">
        <Button
          type="button"
          variant="link"
          className="px-0 text-sm text-purple-600 hover:text-purple-700 dark:text-purple-400 dark:hover:text-purple-300"
          disabled={isLoading}
          onClick={() => setMode('forgot-password')}
        >
          {t('login.forgotPassword')}
        </Button>
      </div>

      <Button
        type="submit"
        className="h-11 w-full bg-gradient-to-r from-purple-600 to-blue-600 font-medium text-white shadow-lg shadow-purple-500/25 transition-all duration-200 hover:from-purple-700 hover:to-blue-700 hover:shadow-xl hover:shadow-purple-500/30"
        disabled={isLoading}
      >
        {isLoading && <Icons.spinner className="mr-2 h-4 w-4 animate-spin" />}
        {t('login.submit')}
      </Button>
    </form>
  )
}
