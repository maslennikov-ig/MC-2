'use client'

import { useState, useEffect, useRef, useMemo } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import * as z from 'zod'
import { useTranslations, useLocale } from 'next-intl'
import { useSupabase } from '@/lib/supabase/browser-client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Icons } from '@/components/common/icons'
import { toast } from '@/lib/toast'
import { logger } from '@/lib/client-logger'
import { useRouter } from 'next/navigation'
import { Sparkles, Check } from 'lucide-react'

export default function UpdatePasswordPage() {
  const t = useTranslations('auth')
  const locale = useLocale()
  const [isLoading, setIsLoading] = useState(false)
  const [isSuccess, setIsSuccess] = useState(false)
  const router = useRouter()
  const { supabase, session, isLoading: isSessionLoading } = useSupabase()
  const redirectTimerRef = useRef<NodeJS.Timeout | undefined>(undefined)

  // Redirect if no recovery session
  useEffect(() => {
    if (!isSessionLoading && !session) {
      toast.error(t('updatePassword.error'))
      router.push(`/${locale}`)
    }
  }, [session, isSessionLoading, router, locale, t])

  // Cleanup timer on unmount
  useEffect(() => {
    return () => {
      if (redirectTimerRef.current) {
        clearTimeout(redirectTimerRef.current)
      }
    }
  }, [])

  const updatePasswordSchema = useMemo(
    () =>
      z
        .object({
          password: z
            .string()
            .min(8, t('validation.passwordMin8'))
            .regex(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/, t('validation.passwordRequirements')),
          confirmPassword: z.string(),
        })
        .refine((data) => data.password === data.confirmPassword, {
          message: t('validation.passwordMismatch'),
          path: ['confirmPassword'],
        }),
    [t]
  )

  type UpdatePasswordFormData = z.infer<typeof updatePasswordSchema>

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<UpdatePasswordFormData>({
    resolver: zodResolver(updatePasswordSchema),
  })

  const onSubmit = async (data: UpdatePasswordFormData) => {
    setIsLoading(true)

    try {
      const { error } = await supabase.auth.updateUser({
        password: data.password,
      })

      if (error) {
        logger.error('Update password error:', error)
        toast.error(t('updatePassword.error'))
        return
      }

      setIsSuccess(true)
      toast.success(t('updatePassword.success'))

      redirectTimerRef.current = setTimeout(() => {
        router.push(`/${locale}`)
      }, 2000)
    } catch (error) {
      logger.error('Update password error:', error)
      toast.error(t('updatePassword.error'))
    } finally {
      setIsLoading(false)
    }
  }

  if (isSessionLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Icons.spinner className="h-8 w-8 animate-spin text-purple-600" />
      </div>
    )
  }

  if (!session) {
    return null
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-gray-50 to-gray-100 p-4 dark:from-gray-950 dark:to-gray-900">
      <div className="w-full max-w-[480px]">
        <div className="relative overflow-hidden rounded-2xl bg-white/95 shadow-xl backdrop-blur-xl dark:bg-gray-900/95">
          <div className="absolute inset-0 -z-10 bg-gradient-to-br from-purple-600/20 via-blue-600/20 to-purple-600/20 blur-xl" />

          <div className="px-8 pt-8 pb-0">
            <h1 className="bg-gradient-to-r from-purple-600 to-blue-600 bg-clip-text text-center text-3xl font-bold text-transparent">
              {t('updatePassword.title')}
            </h1>
            <p className="mt-2 text-center text-gray-600 dark:text-gray-400">
              <span className="inline-flex items-center gap-1">
                <Sparkles className="h-4 w-4 text-purple-500" />
                {t('updatePassword.description')}
              </span>
            </p>
          </div>

          <div className="px-8 pt-6 pb-8">
            {isSuccess ? (
              <div className="space-y-4 text-center">
                <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-green-100 dark:bg-green-900/30">
                  <Check className="h-8 w-8 text-green-600 dark:text-green-400" />
                </div>
                <p className="text-gray-600 dark:text-gray-400">{t('updatePassword.success')}</p>
              </div>
            ) : (
              <form onSubmit={(e) => void handleSubmit(onSubmit)(e)} className="space-y-4">
                <div className="space-y-2">
                  <Label
                    htmlFor="new-password"
                    className="text-sm font-medium text-gray-700 dark:text-gray-300"
                  >
                    {t('updatePassword.newPassword')}
                  </Label>
                  <Input
                    id="new-password"
                    type="password"
                    disabled={isLoading}
                    className="h-11 border-gray-200 bg-gray-50 px-4 focus:border-purple-500 focus:ring-purple-500/20 dark:border-gray-700 dark:bg-gray-800/50 dark:focus:border-purple-400"
                    {...register('password')}
                  />
                  {errors.password && (
                    <p className="text-sm text-red-500 dark:text-red-400">
                      {errors.password.message}
                    </p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label
                    htmlFor="confirm-password"
                    className="text-sm font-medium text-gray-700 dark:text-gray-300"
                  >
                    {t('updatePassword.confirmPassword')}
                  </Label>
                  <Input
                    id="confirm-password"
                    type="password"
                    disabled={isLoading}
                    className="h-11 border-gray-200 bg-gray-50 px-4 focus:border-purple-500 focus:ring-purple-500/20 dark:border-gray-700 dark:bg-gray-800/50 dark:focus:border-purple-400"
                    {...register('confirmPassword')}
                  />
                  {errors.confirmPassword && (
                    <p className="text-sm text-red-500 dark:text-red-400">
                      {errors.confirmPassword.message}
                    </p>
                  )}
                </div>

                <Button
                  type="submit"
                  className="h-11 w-full bg-gradient-to-r from-purple-600 to-blue-600 font-medium text-white shadow-lg shadow-purple-500/25 transition-all duration-200 hover:from-purple-700 hover:to-blue-700 hover:shadow-xl hover:shadow-purple-500/30"
                  disabled={isLoading}
                >
                  {isLoading && <Icons.spinner className="mr-2 h-4 w-4 animate-spin" />}
                  {t('updatePassword.submit')}
                </Button>
              </form>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
