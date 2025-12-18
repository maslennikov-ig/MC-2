"use client"

import { useState } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import * as z from "zod"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Icons } from "@/components/common/icons"
import { toast } from "sonner"
import { useAuthModal } from "@/lib/hooks/use-auth-modal"
import { Checkbox } from "@/components/ui/checkbox"
import { logger } from "@/lib/logger"

const registerSchema = z.object({
  email: z.string().email("Введите корректный email"),
  password: z.string()
    .min(8, "Пароль должен быть не менее 8 символов")
    .regex(
      /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/,
      "Пароль должен содержать хотя бы одну заглавную букву, одну строчную букву и одну цифру"
    ),
  confirmPassword: z.string(),
  fullName: z.string().min(2, "Введите ваше имя"),
  agreeToTerms: z.boolean().refine(val => val === true, {
    message: "Вы должны согласиться с условиями использования"
  }),
}).refine((data) => data.password === data.confirmPassword, {
  message: "Пароли не совпадают",
  path: ["confirmPassword"],
})

type RegisterFormData = z.infer<typeof registerSchema>

interface RegisterFormProps {
  onSuccess?: () => void
}

export function RegisterForm({ onSuccess }: RegisterFormProps) {
  const [isLoading, setIsLoading] = useState(false)
  const { setMode } = useAuthModal()
  
  const {
    register,
    handleSubmit,
    formState: { errors },
    setValue,
    watch,
  } = useForm<RegisterFormData>({
    resolver: zodResolver(registerSchema),
    defaultValues: {
      agreeToTerms: true, // Checked by default
    },
  })
  
  const agreeToTerms = watch("agreeToTerms")
  
  const onSubmit = async (data: RegisterFormData) => {
    setIsLoading(true)
    
    try {
      // Регистрация через наш API endpoint
      const response = await fetch('/api/auth/register', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email: data.email,
          password: data.password,
          fullName: data.fullName,
        }),
      })
      
      const result = await response.json()
      
      if (!response.ok) {
        toast.error(result.error || 'Ошибка регистрации')
      } else {
        toast.success(result.message || "Регистрация успешна! Теперь вы можете войти.")
        
        // Переключаемся на форму входа
        setTimeout(() => {
          setMode('login')
        }, 2000)
        
        onSuccess?.()
      }
    } catch (error) {
      logger.error("Registration error:", error)
      toast.error("Произошла ошибка при регистрации")
    } finally {
      setIsLoading(false)
    }
  }
  
  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="register-fullName" className="text-sm font-medium text-gray-700 dark:text-gray-300">
          Имя
        </Label>
        <Input
          id="register-fullName"
          type="text"
          placeholder="Иван Иванов"
          disabled={isLoading}
          className="h-11 px-4 bg-gray-50 dark:bg-gray-800/50 border-gray-200 dark:border-gray-700 focus:border-purple-500 dark:focus:border-purple-400 focus:ring-purple-500/20"
          {...register("fullName")}
        />
        {errors.fullName && (
          <p className="text-sm text-red-500 dark:text-red-400">{errors.fullName.message}</p>
        )}
      </div>
      
      <div className="space-y-2">
        <Label htmlFor="register-email" className="text-sm font-medium text-gray-700 dark:text-gray-300">
          Email
        </Label>
        <Input
          id="register-email"
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
        <Label htmlFor="register-password" className="text-sm font-medium text-gray-700 dark:text-gray-300">
          Пароль
        </Label>
        <Input
          id="register-password"
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
      
      <div className="space-y-2">
        <Label htmlFor="register-confirmPassword" className="text-sm font-medium text-gray-700 dark:text-gray-300">
          Подтвердите пароль
        </Label>
        <Input
          id="register-confirmPassword"
          type="password"
          placeholder="••••••••"
          disabled={isLoading}
          className="h-11 px-4 bg-gray-50 dark:bg-gray-800/50 border-gray-200 dark:border-gray-700 focus:border-purple-500 dark:focus:border-purple-400 focus:ring-purple-500/20"
          {...register("confirmPassword")}
        />
        {errors.confirmPassword && (
          <p className="text-sm text-red-500 dark:text-red-400">{errors.confirmPassword.message}</p>
        )}
      </div>
      
      <div className="flex items-start space-x-2">
        <Checkbox
          id="register-terms"
          checked={agreeToTerms}
          onCheckedChange={(checked) => setValue("agreeToTerms", checked as boolean)}
          disabled={isLoading}
        />
        <div className="grid gap-1.5 leading-none">
          <label
            htmlFor="register-terms"
            className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
          >
            Я согласен с условиями использования
          </label>
          {errors.agreeToTerms && (
            <p className="text-sm text-red-500 dark:text-red-400">{errors.agreeToTerms.message}</p>
          )}
        </div>
      </div>
      
      <Button
        type="submit"
        className="w-full h-11 bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 text-white font-medium shadow-lg shadow-purple-500/25 transition-all duration-200 hover:shadow-xl hover:shadow-purple-500/30"
        disabled={isLoading}
      >
        {isLoading && (
          <Icons.spinner className="mr-2 h-4 w-4 animate-spin" />
        )}
        Зарегистрироваться
      </Button>
      
      <p className="text-center text-xs text-gray-500 dark:text-gray-400">
        Регистрируясь, вы соглашаетесь получать обновления о курсах
      </p>
    </form>
  )
}