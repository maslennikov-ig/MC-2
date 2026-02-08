'use client'

import React, { useState } from 'react'
import { Link } from '@/src/i18n/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import { Sparkles, Menu, X, ChevronDown } from 'lucide-react'
import { sectionsData } from '../_data/sections-data'
import { scrollToSection } from '../_utils/scroll-utils'

export function NavigationMenu() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)

  const handleScrollTo = (id: string) => {
    scrollToSection(id)
    setMobileMenuOpen(false)
  }

  return (
    <nav className="fixed top-0 right-0 left-0 z-40 border-b border-gray-800 bg-gray-900/95 backdrop-blur-sm">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex h-20 items-center justify-between py-4">
          {/* Logo - Left */}
          <Link href="/" className="group flex flex-shrink-0 items-center gap-3">
            <Sparkles className="h-7 w-7 text-purple-500 transition-colors group-hover:text-purple-400" />
            <span className="bg-gradient-to-r from-purple-400 to-cyan-400 bg-clip-text text-xl font-bold text-transparent">
              MegaCampusAI Enterprise
            </span>
          </Link>

          {/* Desktop Navigation - Center */}
          <div className="hidden flex-1 items-center justify-center px-8 md:flex">
            <div className="flex items-center gap-1">
              {/* Основные разделы с выпадающими подменю */}
              <div className="group relative">
                <button className="flex items-center gap-1 rounded-lg px-4 py-2 text-sm font-medium text-gray-400 transition-all duration-200 hover:bg-gray-800/50 hover:text-white">
                  Автоматизация
                  <ChevronDown className="h-3 w-3" />
                </button>
                <div className="invisible absolute top-full left-0 z-50 mt-2 w-56 rounded-lg border border-gray-700 bg-gray-900/95 opacity-0 shadow-xl backdrop-blur-sm transition-all duration-200 group-hover:visible group-hover:opacity-100">
                  <button
                    onClick={() => handleScrollTo('automation')}
                    className="block w-full rounded-t-lg px-4 py-2 text-left text-sm text-gray-400 transition-colors hover:bg-gray-800/50 hover:text-white"
                  >
                    Контент и знания
                  </button>
                  <button
                    onClick={() => handleScrollTo('innovation-tech')}
                    className="block w-full px-4 py-2 text-left text-sm text-gray-400 transition-colors hover:bg-gray-800/50 hover:text-white"
                  >
                    Инновационные технологии
                  </button>
                  <button
                    onClick={() => handleScrollTo('integration')}
                    className="block w-full rounded-b-lg px-4 py-2 text-left text-sm text-gray-400 transition-colors hover:bg-gray-800/50 hover:text-white"
                  >
                    Интеграции
                  </button>
                </div>
              </div>

              <div className="group relative">
                <button className="flex items-center gap-1 rounded-lg px-4 py-2 text-sm font-medium text-gray-400 transition-all duration-200 hover:bg-gray-800/50 hover:text-white">
                  Обучение
                  <ChevronDown className="h-3 w-3" />
                </button>
                <div className="invisible absolute top-full left-0 z-50 mt-2 w-56 rounded-lg border border-gray-700 bg-gray-900/95 opacity-0 shadow-xl backdrop-blur-sm transition-all duration-200 group-hover:visible group-hover:opacity-100">
                  <button
                    onClick={() => handleScrollTo('personalization')}
                    className="block w-full rounded-t-lg px-4 py-2 text-left text-sm text-gray-400 transition-colors hover:bg-gray-800/50 hover:text-white"
                  >
                    Персонализация
                  </button>
                  <button
                    onClick={() => handleScrollTo('gamification')}
                    className="block w-full px-4 py-2 text-left text-sm text-gray-400 transition-colors hover:bg-gray-800/50 hover:text-white"
                  >
                    Геймификация
                  </button>
                  <button
                    onClick={() => handleScrollTo('social')}
                    className="block w-full px-4 py-2 text-left text-sm text-gray-400 transition-colors hover:bg-gray-800/50 hover:text-white"
                  >
                    Социальное
                  </button>
                  <button
                    onClick={() => handleScrollTo('mobile')}
                    className="block w-full px-4 py-2 text-left text-sm text-gray-400 transition-colors hover:bg-gray-800/50 hover:text-white"
                  >
                    Микрообучение
                  </button>
                  <button
                    onClick={() => handleScrollTo('future-skills')}
                    className="block w-full rounded-b-lg px-4 py-2 text-left text-sm text-gray-400 transition-colors hover:bg-gray-800/50 hover:text-white"
                  >
                    Навыки будущего
                  </button>
                </div>
              </div>

              <div className="group relative">
                <button className="flex items-center gap-1 rounded-lg px-4 py-2 text-sm font-medium text-gray-400 transition-all duration-200 hover:bg-gray-800/50 hover:text-white">
                  Бизнес
                  <ChevronDown className="h-3 w-3" />
                </button>
                <div className="invisible absolute top-full left-0 z-50 mt-2 w-56 rounded-lg border border-gray-700 bg-gray-900/95 opacity-0 shadow-xl backdrop-blur-sm transition-all duration-200 group-hover:visible group-hover:opacity-100">
                  <button
                    onClick={() => handleScrollTo('analytics')}
                    className="block w-full rounded-t-lg px-4 py-2 text-left text-sm text-gray-400 transition-colors hover:bg-gray-800/50 hover:text-white"
                  >
                    Аналитика и ROI
                  </button>
                  <button
                    onClick={() => handleScrollTo('compliance')}
                    className="block w-full px-4 py-2 text-left text-sm text-gray-400 transition-colors hover:bg-gray-800/50 hover:text-white"
                  >
                    Compliance
                  </button>
                  <button
                    onClick={() => handleScrollTo('economy')}
                    className="block w-full px-4 py-2 text-left text-sm text-gray-400 transition-colors hover:bg-gray-800/50 hover:text-white"
                  >
                    Экономия затрат
                  </button>
                  <button
                    onClick={() => handleScrollTo('unique-differentiators')}
                    className="block w-full rounded-b-lg px-4 py-2 text-left text-sm text-gray-400 transition-colors hover:bg-gray-800/50 hover:text-white"
                  >
                    Дифференциаторы
                  </button>
                </div>
              </div>

              <div className="group relative">
                <button className="flex items-center gap-1 rounded-lg px-4 py-2 text-sm font-medium text-gray-400 transition-all duration-200 hover:bg-gray-800/50 hover:text-white">
                  Решения
                  <ChevronDown className="h-3 w-3" />
                </button>
                <div className="invisible absolute top-full left-0 z-50 mt-2 w-56 rounded-lg border border-gray-700 bg-gray-900/95 opacity-0 shadow-xl backdrop-blur-sm transition-all duration-200 group-hover:visible group-hover:opacity-100">
                  <button
                    onClick={() => handleScrollTo('industry-solutions')}
                    className="block w-full rounded-t-lg px-4 py-2 text-left text-sm text-gray-400 transition-colors hover:bg-gray-800/50 hover:text-white"
                  >
                    Отраслевые решения
                  </button>
                  <button
                    onClick={() => handleScrollTo('russia-specific')}
                    className="block w-full rounded-b-lg px-4 py-2 text-left text-sm text-gray-400 transition-colors hover:bg-gray-800/50 hover:text-white"
                  >
                    Для России
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* CTA Button - Right */}
          <div className="hidden flex-shrink-0 items-center md:flex">
            <button
              onClick={() => handleScrollTo('share-ideas')}
              className="rounded-lg bg-gradient-to-r from-purple-600 to-cyan-600 px-5 py-2.5 font-medium text-white transition-all hover:shadow-lg hover:shadow-purple-500/25"
            >
              Поделиться идеями
            </button>
          </div>

          {/* Mobile Menu Button */}
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="p-2 text-gray-400 hover:text-white md:hidden"
          >
            {mobileMenuOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
          </button>
        </div>
      </div>

      {/* Mobile Menu */}
      <AnimatePresence>
        {mobileMenuOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="border-t border-gray-800 bg-gray-900 md:hidden"
          >
            <div className="space-y-2 px-4 py-4">
              {sectionsData.map((section) => (
                <button
                  key={section.id}
                  onClick={() => handleScrollTo(section.id)}
                  className="block w-full rounded-lg px-4 py-2 text-left text-gray-400 transition-colors hover:bg-gray-800 hover:text-white"
                >
                  {section.title}
                </button>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </nav>
  )
}
