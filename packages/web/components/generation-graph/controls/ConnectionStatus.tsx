import React from 'react'
import { Wifi, WifiOff } from 'lucide-react'
import { useTranslations } from 'next-intl'

export const ConnectionStatus = ({ isConnected }: { isConnected: boolean }) => {
  const t = useTranslations('generation')

  if (isConnected) {
    return (
      <div className="flex items-center gap-2 rounded-full border border-emerald-100 bg-emerald-50 px-2 py-1 text-[10px] font-medium text-emerald-600 opacity-75 shadow-sm transition-opacity hover:opacity-100">
        <Wifi size={12} />
        Connected
      </div>
    )
  }

  return (
    <div className="flex animate-pulse items-center gap-2 rounded-full border border-red-200 bg-red-100 px-3 py-1.5 text-xs font-medium text-red-700 shadow-sm">
      <WifiOff size={14} />
      {t('errors.connectionLost') || 'Connection Lost'}
    </div>
  )
}
