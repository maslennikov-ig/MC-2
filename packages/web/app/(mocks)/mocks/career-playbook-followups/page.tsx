'use client'

import { redirect } from 'next/navigation'
import { NextIntlClientProvider } from 'next-intl'

import CareerPlaybookNewPageClient from '@/app/[locale]/career-playbook/new/page-client'
import { Providers } from '@/app/[locale]/providers'
import authMessages from '@/messages/ru/auth.json'
import careerPlaybookMessages from '@/messages/ru/career-playbook.json'
import commonMessages from '@/messages/ru/common.json'

const messages = {
  auth: authMessages,
  'career-playbook': careerPlaybookMessages,
  common: commonMessages,
}

export default function CareerPlaybookFollowupsFixturePage() {
  if (process.env.NODE_ENV === 'production') redirect('/')

  return (
    <NextIntlClientProvider locale="ru" messages={messages} timeZone="Europe/Moscow">
      <Providers>
        <CareerPlaybookNewPageClient
          locale="ru"
          userId="00000000-0000-4000-8000-000000000862"
          resetOnMount
        />
      </Providers>
    </NextIntlClientProvider>
  )
}
