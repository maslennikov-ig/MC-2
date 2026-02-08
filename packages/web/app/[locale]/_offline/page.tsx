'use client'

import { WifiOff, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'

export default function OfflinePage() {
  const handleRetry = () => {
    window.location.reload()
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-gradient-to-br from-purple-50 to-blue-50 px-4 dark:from-gray-900 dark:to-slate-900">
      <div className="max-w-md text-center">
        <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-purple-100 dark:bg-purple-900/30">
          <WifiOff className="h-10 w-10 text-purple-600 dark:text-purple-400" />
        </div>

        <h1 className="mb-3 text-3xl font-bold text-gray-900 dark:text-white">
          Нет подключения к интернету
        </h1>

        <p className="mb-8 text-gray-600 dark:text-gray-400">
          Похоже, вы не подключены к интернету. Проверьте ваше соединение и попробуйте снова.
        </p>

        <Button
          onClick={handleRetry}
          className="inline-flex items-center gap-2 bg-purple-600 text-white hover:bg-purple-700"
        >
          <RefreshCw className="h-4 w-4" />
          Попробовать снова
        </Button>

        <div className="mt-12 rounded-lg bg-white p-4 shadow-sm dark:bg-gray-800">
          <p className="text-sm text-gray-500 dark:text-gray-400">
            💡 Совет: MegaCampusAI сохраняет некоторые страницы для офлайн просмотра. Вы можете
            продолжить изучать курсы, которые уже были загружены.
          </p>
        </div>
      </div>
    </div>
  )
}
