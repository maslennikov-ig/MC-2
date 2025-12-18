import { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Профиль | MegaCampusAI',
  description: 'Управление профилем и настройками аккаунта',
}

export default function ProfileLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <>
      {children}
    </>
  )
}