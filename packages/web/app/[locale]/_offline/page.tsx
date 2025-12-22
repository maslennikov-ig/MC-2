'use client'

import { WifiOff, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'

export default function OfflinePage() {
  const handleRetry = () => {
    window.location.reload()
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-br from-purple-50 to-blue-50 dark:from-gray-900 dark:to-slate-900 px-4">
      <div className="text-center max-w-md">
        <div className="mx-auto w-20 h-20 bg-purple-100 dark:bg-purple-900/30 rounded-full flex items-center justify-center mb-6">
          <WifiOff className="w-10 h-10 text-purple-600 dark:text-purple-400" />
        </div>
        
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-3">
          Нет подключения к интернету
        </h1>
        
        <p className="text-gray-600 dark:text-gray-400 mb-8">
          Похоже, вы не подключены к интернету. Проверьте ваше соединение и попробуйте снова.
        </p>
        
        <Button 
          onClick={handleRetry}
          className="inline-flex items-center gap-2 bg-purple-600 hover:bg-purple-700 text-white"
        >
          <RefreshCw className="w-4 h-4" />
          Попробовать снова
        </Button>
        
        <div className="mt-12 p-4 bg-white dark:bg-gray-800 rounded-lg shadow-sm">
          <p className="text-sm text-gray-500 dark:text-gray-400">
            💡 Совет: MegaCampusAI сохраняет некоторые страницы для офлайн просмотра. 
            Вы можете продолжить изучать курсы, которые уже были загружены.
          </p>
        </div>
      </div>
    </div>
  )
}