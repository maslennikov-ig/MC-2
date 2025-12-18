"use client"

import { useEffect, lazy, Suspense } from "react"
import { motion, AnimatePresence } from "framer-motion"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { SocialButtons } from "./social-buttons"
import { useAuthModal } from "@/lib/hooks/use-auth-modal"
import { Sparkles } from "lucide-react"
import { Icons } from "@/components/common/icons"

// Lazy load forms for better performance
const LoginForm = lazy(() => import("./login-form").then(mod => ({ default: mod.LoginForm })))
const RegisterForm = lazy(() => import("./register-form").then(mod => ({ default: mod.RegisterForm })))

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
      <DialogContent className="sm:max-w-[480px] p-0 gap-0 overflow-hidden border-0 bg-white/95 dark:bg-gray-900/95 backdrop-blur-xl">
        {/* Gradient Border Effect */}
        <div className="absolute inset-0 -z-10 bg-gradient-to-br from-purple-600/20 via-blue-600/20 to-purple-600/20 blur-xl" />
        
        {/* Animated Background Pattern */}
        <div className="absolute inset-0 -z-10 opacity-30">
          <div className="absolute inset-0 bg-[linear-gradient(to_right,#8080800a_1px,transparent_1px),linear-gradient(to_bottom,#8080800a_1px,transparent_1px)] bg-[size:14px_24px]" />
        </div>
        
        <DialogHeader className="relative px-8 pt-8 pb-0">
          <DialogTitle className="text-3xl font-bold text-center bg-gradient-to-r from-purple-600 to-blue-600 bg-clip-text text-transparent">
            Добро пожаловать
          </DialogTitle>
          <DialogDescription className="text-center text-gray-600 dark:text-gray-400 mt-2">
            <span className="inline-flex items-center gap-1">
              <Sparkles className="w-4 h-4 text-purple-500" />
              Создавайте курсы с помощью ИИ
            </span>
          </DialogDescription>
        </DialogHeader>
        
        <div className="px-8 pb-8 pt-6">
          <Tabs 
            value={mode} 
            onValueChange={(value) => setMode(value as 'login' | 'register')}
            className="w-full"
          >
            <TabsList className="grid w-full grid-cols-2 mb-6 bg-gray-100/50 dark:bg-gray-800/50 p-1 rounded-xl">
              <TabsTrigger 
                value="login" 
                className="data-[state=active]:bg-white dark:data-[state=active]:bg-gray-900 data-[state=active]:shadow-sm rounded-lg transition-all"
              >
                Вход
              </TabsTrigger>
              <TabsTrigger 
                value="register"
                className="data-[state=active]:bg-white dark:data-[state=active]:bg-gray-900 data-[state=active]:shadow-sm rounded-lg transition-all"
              >
                Регистрация
              </TabsTrigger>
            </TabsList>
            
            <TabsContent value="login" className="space-y-5 mt-0">
              <AnimatePresence mode="wait">
                {mode === 'login' && (
                  <motion.div
                    key="login"
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    transition={{ duration: 0.2 }}
                  >
                    <Suspense fallback={<div className="flex justify-center py-8"><Icons.spinner className="h-8 w-8 animate-spin" /></div>}>
                      <LoginForm />
                    </Suspense>
                    
                    <div className="relative my-6">
                      <div className="absolute inset-0 flex items-center">
                        <div className="w-full border-t border-gray-200 dark:border-gray-700" />
                      </div>
                      <div className="relative flex justify-center text-xs">
                        <span className="px-3 bg-white dark:bg-gray-900 text-gray-500 dark:text-gray-400">
                          или продолжите с
                        </span>
                      </div>
                    </div>
                    
                    <SocialButtons />
                    
                    <p className="text-center text-sm text-gray-600 dark:text-gray-400 mt-6">
                      Нет аккаунта?{" "}
                      <button
                        type="button"
                        onClick={() => setMode('register')}
                        className="font-medium bg-gradient-to-r from-purple-600 to-blue-600 bg-clip-text text-transparent hover:from-purple-700 hover:to-blue-700 transition-all"
                      >
                        Зарегистрироваться
                      </button>
                    </p>
                  </motion.div>
                )}
              </AnimatePresence>
            </TabsContent>
            
            <TabsContent value="register" className="space-y-5 mt-0">
              <AnimatePresence mode="wait">
                {mode === 'register' && (
                  <motion.div
                    key="register"
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    transition={{ duration: 0.2 }}
                  >
                    <Suspense fallback={<div className="flex justify-center py-8"><Icons.spinner className="h-8 w-8 animate-spin" /></div>}>
                      <RegisterForm />
                    </Suspense>
                    
                    <div className="relative my-6">
                      <div className="absolute inset-0 flex items-center">
                        <div className="w-full border-t border-gray-200 dark:border-gray-700" />
                      </div>
                      <div className="relative flex justify-center text-xs">
                        <span className="px-3 bg-white dark:bg-gray-900 text-gray-500 dark:text-gray-400">
                          или продолжите с
                        </span>
                      </div>
                    </div>
                    
                    <SocialButtons />
                    
                    <p className="text-center text-sm text-gray-600 dark:text-gray-400 mt-6">
                      Уже есть аккаунт?{" "}
                      <button
                        type="button"
                        onClick={() => setMode('login')}
                        className="font-medium bg-gradient-to-r from-purple-600 to-blue-600 bg-clip-text text-transparent hover:from-purple-700 hover:to-blue-700 transition-all"
                      >
                        Войти
                      </button>
                    </p>
                  </motion.div>
                )}
              </AnimatePresence>
            </TabsContent>
          </Tabs>
        </div>
      </DialogContent>
    </Dialog>
  )
}