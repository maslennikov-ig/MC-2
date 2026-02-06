'use client'

import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import * as z from 'zod'
import { useTranslations, useLocale } from 'next-intl'
import { useSupabase } from '@/lib/supabase/browser-client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Icons } from '@/components/common/icons'
import { CheckCircle } from 'lucide-react'
import { useAuthModal } from '@/lib/hooks/use-auth-modal'
import { logger } from '@/lib/client-logger'
import { toast } from '@/lib/toast'

export function ForgotPasswordForm() {
  const t = useTranslations('auth')
  const [isLoading, setIsLoading] = useState(false)
  const [isSuccess, setIsSuccess] = useState(false)
  const locale = useLocale()
  const { setMode } = useAuthModal()
  const { supabase } = useSupabase()

  // Create schema with translated messages
  const forgotPasswordSchema = z.object({
    email: z
      .string()
      .min(1, t('validation.emailRequired'))
      .refine((val) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val), {
        message: t('validation.emailInvalid'),
      }),
  })

  type ForgotPasswordFormData = z.infer<typeof forgotPasswordSchema>

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ForgotPasswordFormData>({
    resolver: zodResolver(forgotPasswordSchema),
  })

  const onSubmit = async (data: ForgotPasswordFormData) => {
    setIsLoading(true)

    try {
      const { error } = await supabase.auth.resetPasswordForEmail(data.email.toLowerCase(), {
        redirectTo: `/${locale}/update-password`,
      })

      if (error) {
        logger.error('Reset password error:', error)
        toast.error(error.message)
        setIsLoading(false)
        return
      }

      setIsSuccess(true)
      toast.success(t('forgotPassword.success'))
    } catch (error) {
      logger.error('Reset password error:', error)
      toast.error(t('errors.genericError'))
    } finally {
      setIsLoading(false)
    }
  }

  if (isSuccess) {
    return (
      <div className="space-y-4 text-center">
        <div className="flex justify-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-green-100 dark:bg-green-900/30">
            <CheckCircle className="h-8 w-8 text-green-600 dark:text-green-400" />
          </div>
        </div>
        <p className="text-sm text-gray-600 dark:text-gray-400">{t('forgotPassword.success')}</p>
        <Button
          type="button"
          variant="link"
          onClick={() => setMode('login')}
          className="bg-gradient-to-r from-purple-600 to-blue-600 bg-clip-text font-medium text-transparent transition-all hover:from-purple-700 hover:to-blue-700"
        >
          {t('forgotPassword.backToLogin')}
        </Button>
      </div>
    )
  }

  return (
    <form onSubmit={(e) => void handleSubmit(onSubmit)(e)} className="space-y-4">
      <p className="text-sm text-gray-600 dark:text-gray-400">{t('forgotPassword.description')}</p>

      <div className="space-y-2">
        <Label
          htmlFor="forgot-email"
          className="text-sm font-medium text-gray-700 dark:text-gray-300"
        >
          {t('forgotPassword.email')}
        </Label>
        <Input
          id="forgot-email"
          type="email"
          placeholder={t('forgotPassword.emailPlaceholder')}
          disabled={isLoading}
          className="h-11 border-gray-200 bg-gray-50 px-4 focus:border-purple-500 focus:ring-purple-500/20 dark:border-gray-700 dark:bg-gray-800/50 dark:focus:border-purple-400"
          {...register('email')}
        />
        {errors.email && (
          <p className="text-sm text-red-500 dark:text-red-400">{errors.email.message}</p>
        )}
      </div>

      <Button
        type="submit"
        className="h-11 w-full bg-gradient-to-r from-purple-600 to-blue-600 font-medium text-white shadow-lg shadow-purple-500/25 transition-all duration-200 hover:from-purple-700 hover:to-blue-700 hover:shadow-xl hover:shadow-purple-500/30"
        disabled={isLoading}
      >
        {isLoading && <Icons.spinner className="mr-2 h-4 w-4 animate-spin" />}
        {t('forgotPassword.submit')}
      </Button>

      <p className="text-center text-sm text-gray-600 dark:text-gray-400">
        <button
          type="button"
          onClick={() => setMode('login')}
          className="bg-gradient-to-r from-purple-600 to-blue-600 bg-clip-text font-medium text-transparent transition-all hover:from-purple-700 hover:to-blue-700"
        >
          {t('forgotPassword.backToLogin')}
        </button>
      </p>
    </form>
  )
}
