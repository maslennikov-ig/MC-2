"use client"

import { useEffect, useState } from "react"
import { Sun, Moon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useThemeSync } from "@/lib/hooks/use-theme-sync"

export default function ThemeToggle() {
  const [mounted, setMounted] = useState(false)
  const { theme, toggleTheme } = useThemeSync()

  useEffect(() => {
    setMounted(true)
  }, [])

  // Не рендерим ничего до монтирования, чтобы избежать несоответствия на сервере
  if (!mounted) {
    return (
      <Button
        variant="ghost"
        size="sm"
        className="text-gray-600 hover:text-gray-900 dark:text-white/70 dark:hover:text-white"
        disabled
      >
        <div className="w-4 h-4" />
      </Button>
    )
  }

  return (
    <Button
      onClick={toggleTheme}
      variant="ghost"
      size="sm"
      className="text-gray-600 hover:text-gray-900 dark:text-white/70 dark:hover:text-white"
      aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
    >
      {theme === 'dark' ? (
        <Sun className="w-4 h-4" />
      ) : (
        <Moon className="w-4 h-4" />
      )}
    </Button>
  )
}