'use client'

import { AuthRequiredState } from '@/components/common/error-states'
import Header from '@/components/layouts/header'
import { useAuthModal } from '@/lib/hooks/use-auth-modal'
import type { Locale } from '@/src/i18n/config'

interface CareerPlaybookAuthRequiredClientProps {
  locale: Locale
  returnTo?: string
}

export default function CareerPlaybookAuthRequiredClient({
  locale,
  returnTo,
}: CareerPlaybookAuthRequiredClientProps) {
  const authModal = useAuthModal()
  const returnToPath = returnTo ?? `/${locale}/career-playbook/new`

  return (
    <>
      <Header sticky surface="glass" />
      <main className="career-playbook-zone min-h-[calc(100vh-73px)] px-4 py-10">
        <div className="mx-auto flex min-h-[calc(100vh-153px)] max-w-3xl items-center justify-center">
          <AuthRequiredState
            variant="card"
            onSignIn={() => authModal.open('login', { returnTo: returnToPath })}
            onRegister={() => authModal.open('register', { returnTo: returnToPath })}
          />
        </div>
      </main>
    </>
  )
}
