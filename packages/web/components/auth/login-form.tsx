"use client"

import { useState } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import * as z from "zod"
import { useSupabase } from '@/lib/supabase/browser-client'
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Icons } from "@/components/common/icons"
import { toast } from "sonner"
import { useAuthModal } from "@/lib/hooks/use-auth-modal"
import { logger } from "@/lib/logger"
import { useRouter } from "next/navigation"
import { refreshAuthState } from "@/app/actions/auth"

const loginSchema = z.object({
  email: z.string()
    .min(1, "Email обязателен")
    .refine((val) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val), {
      message: "Введите корректный email"
    }),
  password: z.string().min(6, "Пароль должен быть не менее 6 символов"),
})

type LoginFormData = z.infer<typeof loginSchema>

interface LoginFormProps {
  onSuccess?: () => void
}

export function LoginForm({ onSuccess }: LoginFormProps) {
  const [isLoading, setIsLoading] = useState(false)
  const { returnTo, onSuccessCallback, close } = useAuthModal()
  const router = useRouter()
  const { supabase } = useSupabase()
  
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginFormData>({
    resolver: zodResolver(loginSchema),
  })
  
  const onSubmit = async (data: LoginFormData) => {
    setIsLoading(true)
    
    try {
      // Use Supabase client directly for authentication
      const { data: authData, error } = await supabase.auth.signInWithPassword({
        email: data.email.toLowerCase(),
        password: data.password,
      })
      
      if (error) {
        logger.error("Login error:", error)
        toast.error(error.message || "Неверный email или пароль")
        setIsLoading(false)
        return
      }
      
      if (authData.session) {
        toast.success("Добро пожаловать!")
        
        // Закрываем модал и вызываем колбэки
        close()
        onSuccessCallback?.()
        onSuccess?.()
        
        // Обновляем серверное состояние аутентификации
        await refreshAuthState()
        
        // ВАЖНО: Сначала обновляем роутер, чтобы сессия успела синхронизироваться
        await router.refresh()
        
        // Небольшая задержка для гарантии синхронизации cookies
        await new Promise(resolve => setTimeout(resolve, 100))
        
        // Переходим на returnTo только если он отличается от текущей страницы
        if (returnTo && returnTo !== window.location.pathname) {
          // returnTo is a string from searchParams, needs type assertion for Next.js router
          router.push(returnTo as Parameters<typeof router.push>[0])
        }
        // Если returnTo не указан или совпадает с текущей страницей - остаемся на месте
        // НЕ ДЕЛАЕМ автоматический редирект на /courses
      }
    } catch (error) {
      logger.error("Login error:", error)
      toast.error("Произошла ошибка при входе")
    } finally {
      setIsLoading(false)
    }
  }
  
  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="login-email" className="text-sm font-medium text-gray-700 dark:text-gray-300">
          Email
        </Label>
        <Input
          id="login-email"
          type="email"
          placeholder="you@example.com"
          disabled={isLoading}
          className="h-11 px-4 bg-gray-50 dark:bg-gray-800/50 border-gray-200 dark:border-gray-700 focus:border-purple-500 dark:focus:border-purple-400 focus:ring-purple-500/20"
          {...register("email")}
        />
        {errors.email && (
          <p className="text-sm text-red-500 dark:text-red-400">{errors.email.message}</p>
        )}
      </div>
      
      <div className="space-y-2">
        <Label htmlFor="login-password" className="text-sm font-medium text-gray-700 dark:text-gray-300">
          Пароль
        </Label>
        <Input
          id="login-password"
          type="password"
          placeholder="••••••••"
          disabled={isLoading}
          className="h-11 px-4 bg-gray-50 dark:bg-gray-800/50 border-gray-200 dark:border-gray-700 focus:border-purple-500 dark:focus:border-purple-400 focus:ring-purple-500/20"
          {...register("password")}
        />
        {errors.password && (
          <p className="text-sm text-red-500 dark:text-red-400">{errors.password.message}</p>
        )}
      </div>
      
      <div className="flex items-center justify-end">
        <Button
          type="button"
          variant="link"
          className="px-0 text-sm text-purple-600 dark:text-purple-400 hover:text-purple-700 dark:hover:text-purple-300"
          disabled={isLoading}
        >
          Забыли пароль?
        </Button>
      </div>
      
      <Button
        type="submit"
        className="w-full h-11 bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 text-white font-medium shadow-lg shadow-purple-500/25 transition-all duration-200 hover:shadow-xl hover:shadow-purple-500/30"
        disabled={isLoading}
      >
        {isLoading && (
          <Icons.spinner className="mr-2 h-4 w-4 animate-spin" />
        )}
        Войти
      </Button>
    </form>
  )
}