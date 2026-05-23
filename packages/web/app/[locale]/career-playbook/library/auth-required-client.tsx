'use client'

import { AuthRequiredState } from '@/components/common/error-states'
import Header from '@/components/layouts/header'
import { useAuthModal } from '@/lib/hooks/use-auth-modal'
import type { Locale } from '@/src/i18n/config'

interface CareerPlaybookLibraryAuthRequiredClientProps {
  locale: Locale
}

export default function CareerPlaybookLibraryAuthRequiredClient({
  locale,
}: CareerPlaybookLibraryAuthRequiredClientProps) {
  const authModal = useAuthModal()
  const returnTo = `/${locale}/career-playbook/library`

  return (
    <>
      <Header sticky surface="glass" />
      <main className="min-h-[calc(100vh-73px)] bg-slate-100 px-4 py-10 text-slate-950 dark:bg-slate-950 dark:text-slate-50">
        <div className="mx-auto flex min-h-[calc(100vh-153px)] max-w-3xl items-center justify-center">
          <AuthRequiredState
            variant="card"
            onSignIn={() => authModal.open('login', { returnTo })}
            onRegister={() => authModal.open('register', { returnTo })}
          />
        </div>
      </main>
    </>
  )
}
