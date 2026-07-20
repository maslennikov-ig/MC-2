'use client'

import { useState } from 'react'
import { redirect } from 'next/navigation'
import { NextIntlClientProvider } from 'next-intl'
import { QueryClientProvider } from '@tanstack/react-query'
import enMessages from '@/messages/en/generation.json'
import ruMessages from '@/messages/ru/generation.json'
import { Button } from '@/components/ui/button'
import { ClarifyingPanel } from '@/components/generation-graph/panels/clarifying/ClarifyingPanel'
import { getQueryClient } from '@/lib/query-client'
import { TRPCProvider } from '@/lib/trpc/trpc-provider'

const E4_SYNTHETIC_COURSE_ID = '30000000-0000-4000-8000-000000000010'

export default function DocumentConflictsE4FixturePage() {
  if (process.env.NODE_ENV === 'production') redirect('/')

  const [locale, setLocale] = useState<'en' | 'ru'>('en')
  const messages = locale === 'en' ? enMessages : ruMessages
  const queryClient = getQueryClient()

  return (
    <NextIntlClientProvider locale={locale} messages={{ generation: messages }}>
      <QueryClientProvider client={queryClient}>
        <TRPCProvider>
          <main className="min-h-screen bg-stone-50 px-4 py-8 text-slate-950 dark:bg-slate-950 dark:text-slate-50">
            <div className="mx-auto max-w-5xl space-y-6">
              <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-xs font-semibold tracking-widest text-orange-700 uppercase dark:text-orange-300">
                    E4 synthetic browser fixture
                  </p>
                  <h1 className="mt-1 text-2xl font-semibold">
                    {locale === 'en' ? 'Document conflicts' : 'Противоречия в документах'}
                  </h1>
                  <p className="mt-2 max-w-2xl text-sm text-slate-600 dark:text-slate-300">
                    {locale === 'en'
                      ? 'Synthetic content only. The real ClarifyingPanel is driven by intercepted authenticated tRPC responses.'
                      : 'Только синтетические данные. Реальная панель уточнений получает ответы из перехваченных авторизованных tRPC-запросов.'}
                  </p>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setLocale((current) => (current === 'en' ? 'ru' : 'en'))}
                >
                  {locale === 'en' ? 'Русский' : 'English'}
                </Button>
              </header>

              <ClarifyingPanel courseId={E4_SYNTHETIC_COURSE_ID} />
            </div>
          </main>
        </TRPCProvider>
      </QueryClientProvider>
    </NextIntlClientProvider>
  )
}
