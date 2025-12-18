"use client"

import { useState } from "react"
import { useSupabase } from '@/lib/supabase/browser-client'
import { Button } from "@/components/ui/button"
import { Icons } from "@/components/common/icons"
import { toast } from "sonner"
import { useAuthModal } from "@/lib/hooks/use-auth-modal"
import { logger } from "@/lib/logger"

export function SocialButtons() {
  const [isGoogleLoading, setIsGoogleLoading] = useState(false)
  const [isGitHubLoading, setIsGitHubLoading] = useState(false)
  const { returnTo } = useAuthModal()
  const { supabase } = useSupabase()
  
  const handleOAuthSignIn = async (provider: 'google' | 'github') => {
    try {
      if (provider === 'google') {
        setIsGoogleLoading(true)
      } else if (provider === 'github') {
        setIsGitHubLoading(true)
      }
      
      const { error } = await supabase.auth.signInWithOAuth({
        provider,
        options: {
          redirectTo: returnTo || window.location.href,
        }
      })
      
      if (error) {
        throw error
      }
    } catch (error) {
      logger.error(`${provider} sign in error:`, error)
      toast.error(`Не удалось войти через ${provider}`)
      setIsGoogleLoading(false)
      setIsGitHubLoading(false)
    }
  }
  
  return (
    <div className="grid gap-3">
      <Button
        variant="outline"
        type="button"
        disabled={isGoogleLoading || isGitHubLoading}
        onClick={() => handleOAuthSignIn('google')}
        className="relative h-11 border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800/50 hover:bg-gray-50 dark:hover:bg-gray-800 transition-all duration-200 group"
      >
        <div className="absolute inset-0 bg-gradient-to-r from-blue-500/0 via-red-500/0 to-yellow-500/0 group-hover:from-blue-500/10 group-hover:via-red-500/10 group-hover:to-yellow-500/10 rounded-lg transition-all duration-300" />
        {isGoogleLoading ? (
          <Icons.spinner className="mr-2 h-4 w-4 animate-spin" />
        ) : (
          <Icons.google className="mr-2 h-4 w-4" />
        )}
        <span className="relative">Продолжить с Google</span>
      </Button>
      
      {/* GitHub будет добавлен позже
      <Button
        variant="outline"
        type="button"
        disabled={isGoogleLoading || isGitHubLoading}
        onClick={() => handleOAuthSignIn('github')}
        className="relative h-11 border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800/50 hover:bg-gray-50 dark:hover:bg-gray-800 transition-all duration-200 group"
      >
        <div className="absolute inset-0 bg-gradient-to-r from-gray-500/0 to-gray-700/0 group-hover:from-gray-500/10 group-hover:to-gray-700/10 rounded-lg transition-all duration-300" />
        {isGitHubLoading ? (
          <Icons.spinner className="mr-2 h-4 w-4 animate-spin" />
        ) : (
          <Icons.gitHub className="mr-2 h-4 w-4" />
        )}
        <span className="relative">Продолжить с GitHub</span>
      </Button>
      */}
    </div>
  )
}