'use client'

import { AuthRequiredState } from '@/components/common/error-states'
import { useAuthModal } from '@/lib/hooks/use-auth-modal'
import type { Locale } from '@/src/i18n/config'

interface CareerPlaybookAuthRequiredClientProps {
  locale: Locale
}

export default function CareerPlaybookAuthRequiredClient({
  locale,
}: CareerPlaybookAuthRequiredClientProps) {
  const authModal = useAuthModal()
  const returnTo = `/${locale}/career-playbook/new`

  return (
    <main className="min-h-screen bg-slate-100 text-slate-950 dark:bg-slate-950 dark:text-slate-50">
      <AuthRequiredState
        variant="fullpage"
        onSignIn={() => authModal.open('login', { returnTo })}
        onRegister={() => authModal.open('register', { returnTo })}
      />
    </main>
  )
}
