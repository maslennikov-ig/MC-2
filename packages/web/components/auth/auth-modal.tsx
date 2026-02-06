'use client'

import { useEffect, lazy, Suspense } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { SocialButtons } from './social-buttons'
import { useAuthModal, type AuthModalMode } from '@/lib/hooks/use-auth-modal'
import { Sparkles, ArrowLeft } from 'lucide-react'
import { Icons } from '@/components/common/icons'

// Lazy load forms for better performance
const LoginForm = lazy(() => import('./login-form').then((mod) => ({ default: mod.LoginForm })))
const RegisterForm = lazy(() =>
  import('./register-form').then((mod) => ({ default: mod.RegisterForm }))
)
const ForgotPasswordForm = lazy(() =>
  import('./forgot-password-form').then((mod) => ({ default: mod.ForgotPasswordForm }))
)

export function AuthModal() {
  const { isOpen, mode, close, setMode } = useAuthModal()

  // Сбрасываем режим при закрытии
  useEffect(() => {
    if (!isOpen) {
      // Небольшая задержка чтобы модал закрылся плавно
      const timer = setTimeout(() => {
        setMode('login')
      }, 300)
      return () => clearTimeout(timer)
    }
    return undefined
  }, [isOpen, setMode])

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && close()}>
      <DialogContent className="gap-0 overflow-hidden border-0 bg-white/95 p-0 backdrop-blur-xl sm:max-w-[480px] dark:bg-gray-900/95">
        {/* Gradient Border Effect */}
        <div className="absolute inset-0 -z-10 bg-gradient-to-br from-purple-600/20 via-blue-600/20 to-purple-600/20 blur-xl" />

        {/* Animated Background Pattern */}
        <div className="absolute inset-0 -z-10 opacity-30">
          <div className="absolute inset-0 bg-[linear-gradient(to_right,#8080800a_1px,transparent_1px),linear-gradient(to_bottom,#8080800a_1px,transparent_1px)] bg-[size:14px_24px]" />
        </div>

        <DialogHeader className="relative px-8 pt-8 pb-0">
          <DialogTitle className="bg-gradient-to-r from-purple-600 to-blue-600 bg-clip-text text-center text-3xl font-bold text-transparent">
            Добро пожаловать
          </DialogTitle>
          <DialogDescription className="mt-2 text-center text-gray-600 dark:text-gray-400">
            <span className="inline-flex items-center gap-1">
              <Sparkles className="h-4 w-4 text-purple-500" />
              Создавайте курсы с помощью ИИ
            </span>
          </DialogDescription>
        </DialogHeader>

        <div className="px-8 pt-6 pb-8">
          {mode === 'forgot-password' ? (
            <div className="space-y-5">
              <button
                type="button"
                onClick={() => setMode('login')}
                className="flex items-center gap-2 text-sm text-gray-600 transition-colors hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-200"
              >
                <ArrowLeft className="h-4 w-4" />
                Назад к входу
              </button>
              <AnimatePresence mode="wait">
                <motion.div
                  key="forgot-password"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  transition={{ duration: 0.2 }}
                >
                  <Suspense
                    fallback={
                      <div className="flex justify-center py-8">
                        <Icons.spinner className="h-8 w-8 animate-spin" />
                      </div>
                    }
                  >
                    <ForgotPasswordForm />
                  </Suspense>
                </motion.div>
              </AnimatePresence>
            </div>
          ) : (
            <Tabs
              value={mode}
              onValueChange={(value) => setMode(value as AuthModalMode)}
              className="w-full"
            >
              <TabsList className="mb-6 grid w-full grid-cols-2 rounded-xl bg-gray-100/50 p-1 dark:bg-gray-800/50">
                <TabsTrigger
                  value="login"
                  className="rounded-lg transition-all data-[state=active]:bg-white data-[state=active]:shadow-sm dark:data-[state=active]:bg-gray-900"
                >
                  Вход
                </TabsTrigger>
                <TabsTrigger
                  value="register"
                  className="rounded-lg transition-all data-[state=active]:bg-white data-[state=active]:shadow-sm dark:data-[state=active]:bg-gray-900"
                >
                  Регистрация
                </TabsTrigger>
              </TabsList>

              <TabsContent value="login" className="mt-0 space-y-5">
                <AnimatePresence mode="wait">
                  {mode === 'login' && (
                    <motion.div
                      key="login"
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -10 }}
                      transition={{ duration: 0.2 }}
                    >
                      <Suspense
                        fallback={
                          <div className="flex justify-center py-8">
                            <Icons.spinner className="h-8 w-8 animate-spin" />
                          </div>
                        }
                      >
                        <LoginForm />
                      </Suspense>

                      <div className="relative my-6">
                        <div className="absolute inset-0 flex items-center">
                          <div className="w-full border-t border-gray-200 dark:border-gray-700" />
                        </div>
                        <div className="relative flex justify-center text-xs">
                          <span className="bg-white px-3 text-gray-500 dark:bg-gray-900 dark:text-gray-400">
                            или продолжите с
                          </span>
                        </div>
                      </div>

                      <SocialButtons />

                      <p className="mt-6 text-center text-sm text-gray-600 dark:text-gray-400">
                        Нет аккаунта?{' '}
                        <button
                          type="button"
                          onClick={() => setMode('register')}
                          className="bg-gradient-to-r from-purple-600 to-blue-600 bg-clip-text font-medium text-transparent transition-all hover:from-purple-700 hover:to-blue-700"
                        >
                          Зарегистрироваться
                        </button>
                      </p>
                    </motion.div>
                  )}
                </AnimatePresence>
              </TabsContent>

              <TabsContent value="register" className="mt-0 space-y-5">
                <AnimatePresence mode="wait">
                  {mode === 'register' && (
                    <motion.div
                      key="register"
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -10 }}
                      transition={{ duration: 0.2 }}
                    >
                      <Suspense
                        fallback={
                          <div className="flex justify-center py-8">
                            <Icons.spinner className="h-8 w-8 animate-spin" />
                          </div>
                        }
                      >
                        <RegisterForm />
                      </Suspense>

                      <div className="relative my-6">
                        <div className="absolute inset-0 flex items-center">
                          <div className="w-full border-t border-gray-200 dark:border-gray-700" />
                        </div>
                        <div className="relative flex justify-center text-xs">
                          <span className="bg-white px-3 text-gray-500 dark:bg-gray-900 dark:text-gray-400">
                            или продолжите с
                          </span>
                        </div>
                      </div>

                      <SocialButtons />

                      <p className="mt-6 text-center text-sm text-gray-600 dark:text-gray-400">
                        Уже есть аккаунт?{' '}
                        <button
                          type="button"
                          onClick={() => setMode('login')}
                          className="bg-gradient-to-r from-purple-600 to-blue-600 bg-clip-text font-medium text-transparent transition-all hover:from-purple-700 hover:to-blue-700"
                        >
                          Войти
                        </button>
                      </p>
                    </motion.div>
                  )}
                </AnimatePresence>
              </TabsContent>
            </Tabs>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
