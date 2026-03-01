'use client'

import Link from 'next/link'
import { useAuthModal } from '@/lib/hooks/use-auth-modal'
import { useSupabase } from '@/lib/supabase/browser-client'

export default function HeroContent() {
  const { session } = useSupabase()
  const isAuthenticated = !!session
  const { open } = useAuthModal()

  return (
    <main className="absolute right-4 bottom-4 left-4 z-20 max-w-full sm:right-auto sm:bottom-6 sm:left-6 sm:max-w-2xl md:bottom-8 md:left-8">
      <div className="text-left">
        <div
          className="relative mb-3 inline-flex items-center rounded-full bg-white/10 px-3 py-1.5 backdrop-blur-sm sm:mb-4 md:mb-5"
          style={{
            filter: 'url(#glass-effect)',
            textShadow: '0 2px 4px rgba(0,0,0,0.3)',
          }}
        >
          <div className="absolute top-0 right-1 left-1 h-px rounded-full bg-gradient-to-r from-transparent via-white/20 to-transparent" />
          <span className="relative z-10 text-xs font-normal text-white/95">
            ✨ Новая эра образования с AI
          </span>
        </div>

        {/* Main Heading - Using responsive typography scale */}
        <h1
          className="heading-1 mb-3 text-white sm:mb-4 md:mb-6"
          style={{ textShadow: '0 4px 8px rgba(0,0,0,0.4)' }}
        >
          <span className="font-medium italic">MegaCampusAI</span>
          <span className="font-light"> создавайте</span>
          <br />
          <span className="font-light tracking-tight text-white">курсы в один клик</span>
        </h1>

        {/* Description - Using body-large class */}
        <p
          className="body-large mb-4 max-w-full font-light text-white/85 sm:mb-5 sm:max-w-xl md:mb-6"
          style={{ textShadow: '0 2px 4px rgba(0,0,0,0.3)' }}
        >
          Автоматизированная система генерации образовательных курсов. Загружайте документы,
          получайте полноценные курсы с видео, аудио и тестами за считанные минуты.
        </p>

        {/* Conditional CTA Buttons */}
        <div className="flex flex-col gap-3">
          {isAuthenticated === true ? (
            // Authenticated user - show course actions
            <div className="flex flex-wrap items-center gap-4">
              <Link
                href="/courses"
                className="inline-flex items-center justify-center rounded-full border-2 border-white/40 bg-transparent px-6 py-2.5 text-sm font-medium text-white transition-all duration-300 hover:scale-105 hover:border-white/60 hover:bg-white/10 sm:px-8 sm:py-3"
                style={{ textShadow: '0 2px 4px rgba(0,0,0,0.3)' }}
              >
                Смотреть курсы
              </Link>
              <Link
                href="/create"
                className="relative isolate inline-flex items-center justify-center rounded-full px-6 py-2.5 text-sm font-semibold shadow-lg transition-all duration-300 before:absolute before:inset-0 before:-z-10 before:rounded-full before:bg-white hover:scale-105 sm:px-8 sm:py-3"
                style={{ color: '#111827' }}
              >
                Создать курс
              </Link>
            </div>
          ) : isAuthenticated === false ? (
            // Non-authenticated user - show auth actions
            <>
              <div className="flex flex-wrap items-center gap-4">
                <button
                  onClick={() => open('register')}
                  className="inline-flex items-center justify-center rounded-full border-2 border-white/40 bg-transparent px-6 py-2.5 text-sm font-medium text-white transition-all duration-300 hover:scale-105 hover:border-white/60 hover:bg-white/10 sm:px-8 sm:py-3"
                  style={{ textShadow: '0 2px 4px rgba(0,0,0,0.3)' }}
                >
                  Начать бесплатно
                </button>
                <button
                  onClick={() => open('login')}
                  className="relative isolate inline-flex items-center justify-center rounded-full px-6 py-2.5 text-sm font-semibold shadow-lg transition-all duration-300 before:absolute before:inset-0 before:-z-10 before:rounded-full before:bg-white hover:scale-105 sm:px-8 sm:py-3"
                  style={{ color: '#111827' }}
                >
                  Войти
                </button>
              </div>
              {/* Additional link for exploring */}
              <div className="mt-2">
                <Link
                  href="/courses"
                  className="inline-flex min-h-[44px] min-w-[44px] items-center text-sm text-white underline decoration-white/50 underline-offset-4 transition-colors hover:text-white hover:decoration-white"
                  style={{ textShadow: '0 2px 4px rgba(0,0,0,0.3)' }}
                >
                  или посмотрите примеры курсов →
                </Link>
              </div>
            </>
          ) : null}
        </div>
      </div>
    </main>
  )
}
