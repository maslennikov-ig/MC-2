'use client';

import React, { useState } from 'react';
import { Link } from '@/src/i18n/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { Sparkles, Menu, X, ChevronDown } from 'lucide-react';
import { sectionsData } from '../_data/sections-data';
import { scrollToSection } from '../_utils/scroll-utils';

export function NavigationMenu() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const handleScrollTo = (id: string) => {
    scrollToSection(id);
    setMobileMenuOpen(false);
  };

  return (
    <nav className="fixed top-0 left-0 right-0 z-40 bg-gray-900/95 backdrop-blur-sm border-b border-gray-800">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-20 py-4">
          {/* Logo - Left */}
          <Link href="/" className="flex items-center gap-3 group flex-shrink-0">
            <Sparkles className="w-7 h-7 text-purple-500 group-hover:text-purple-400 transition-colors" />
            <span className="text-xl font-bold bg-gradient-to-r from-purple-400 to-cyan-400 bg-clip-text text-transparent">
              MegaCampusAI Enterprise
            </span>
          </Link>

          {/* Desktop Navigation - Center */}
          <div className="hidden md:flex items-center justify-center flex-1 px-8">
            <div className="flex items-center gap-1">
              {/* Основные разделы с выпадающими подменю */}
              <div className="relative group">
                <button className="text-gray-400 hover:text-white transition-all duration-200 text-sm font-medium px-4 py-2 rounded-lg hover:bg-gray-800/50 flex items-center gap-1">
                  Автоматизация
                  <ChevronDown className="w-3 h-3" />
                </button>
                <div className="absolute top-full left-0 mt-2 w-56 bg-gray-900/95 backdrop-blur-sm border border-gray-700 rounded-lg shadow-xl opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 z-50">
                  <button onClick={() => handleScrollTo('automation')} className="block w-full text-left px-4 py-2 text-sm text-gray-400 hover:text-white hover:bg-gray-800/50 transition-colors rounded-t-lg">
                    Контент и знания
                  </button>
                  <button onClick={() => handleScrollTo('innovation-tech')} className="block w-full text-left px-4 py-2 text-sm text-gray-400 hover:text-white hover:bg-gray-800/50 transition-colors">
                    Инновационные технологии
                  </button>
                  <button onClick={() => handleScrollTo('integration')} className="block w-full text-left px-4 py-2 text-sm text-gray-400 hover:text-white hover:bg-gray-800/50 transition-colors rounded-b-lg">
                    Интеграции
                  </button>
                </div>
              </div>

              <div className="relative group">
                <button className="text-gray-400 hover:text-white transition-all duration-200 text-sm font-medium px-4 py-2 rounded-lg hover:bg-gray-800/50 flex items-center gap-1">
                  Обучение
                  <ChevronDown className="w-3 h-3" />
                </button>
                <div className="absolute top-full left-0 mt-2 w-56 bg-gray-900/95 backdrop-blur-sm border border-gray-700 rounded-lg shadow-xl opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 z-50">
                  <button onClick={() => handleScrollTo('personalization')} className="block w-full text-left px-4 py-2 text-sm text-gray-400 hover:text-white hover:bg-gray-800/50 transition-colors rounded-t-lg">
                    Персонализация
                  </button>
                  <button onClick={() => handleScrollTo('gamification')} className="block w-full text-left px-4 py-2 text-sm text-gray-400 hover:text-white hover:bg-gray-800/50 transition-colors">
                    Геймификация
                  </button>
                  <button onClick={() => handleScrollTo('social')} className="block w-full text-left px-4 py-2 text-sm text-gray-400 hover:text-white hover:bg-gray-800/50 transition-colors">
                    Социальное
                  </button>
                  <button onClick={() => handleScrollTo('mobile')} className="block w-full text-left px-4 py-2 text-sm text-gray-400 hover:text-white hover:bg-gray-800/50 transition-colors">
                    Микрообучение
                  </button>
                  <button onClick={() => handleScrollTo('future-skills')} className="block w-full text-left px-4 py-2 text-sm text-gray-400 hover:text-white hover:bg-gray-800/50 transition-colors rounded-b-lg">
                    Навыки будущего
                  </button>
                </div>
              </div>

              <div className="relative group">
                <button className="text-gray-400 hover:text-white transition-all duration-200 text-sm font-medium px-4 py-2 rounded-lg hover:bg-gray-800/50 flex items-center gap-1">
                  Бизнес
                  <ChevronDown className="w-3 h-3" />
                </button>
                <div className="absolute top-full left-0 mt-2 w-56 bg-gray-900/95 backdrop-blur-sm border border-gray-700 rounded-lg shadow-xl opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 z-50">
                  <button onClick={() => handleScrollTo('analytics')} className="block w-full text-left px-4 py-2 text-sm text-gray-400 hover:text-white hover:bg-gray-800/50 transition-colors rounded-t-lg">
                    Аналитика и ROI
                  </button>
                  <button onClick={() => handleScrollTo('compliance')} className="block w-full text-left px-4 py-2 text-sm text-gray-400 hover:text-white hover:bg-gray-800/50 transition-colors">
                    Compliance
                  </button>
                  <button onClick={() => handleScrollTo('economy')} className="block w-full text-left px-4 py-2 text-sm text-gray-400 hover:text-white hover:bg-gray-800/50 transition-colors">
                    Экономия затрат
                  </button>
                  <button onClick={() => handleScrollTo('unique-differentiators')} className="block w-full text-left px-4 py-2 text-sm text-gray-400 hover:text-white hover:bg-gray-800/50 transition-colors rounded-b-lg">
                    Дифференциаторы
                  </button>
                </div>
              </div>

              <div className="relative group">
                <button className="text-gray-400 hover:text-white transition-all duration-200 text-sm font-medium px-4 py-2 rounded-lg hover:bg-gray-800/50 flex items-center gap-1">
                  Решения
                  <ChevronDown className="w-3 h-3" />
                </button>
                <div className="absolute top-full left-0 mt-2 w-56 bg-gray-900/95 backdrop-blur-sm border border-gray-700 rounded-lg shadow-xl opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 z-50">
                  <button onClick={() => handleScrollTo('industry-solutions')} className="block w-full text-left px-4 py-2 text-sm text-gray-400 hover:text-white hover:bg-gray-800/50 transition-colors rounded-t-lg">
                    Отраслевые решения
                  </button>
                  <button onClick={() => handleScrollTo('russia-specific')} className="block w-full text-left px-4 py-2 text-sm text-gray-400 hover:text-white hover:bg-gray-800/50 transition-colors rounded-b-lg">
                    Для России
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* CTA Button - Right */}
          <div className="hidden md:flex items-center flex-shrink-0">
            <button 
              onClick={() => handleScrollTo('share-ideas')}
              className="px-5 py-2.5 bg-gradient-to-r from-purple-600 to-cyan-600 text-white font-medium rounded-lg hover:shadow-lg hover:shadow-purple-500/25 transition-all">
              Поделиться идеями
            </button>
          </div>

          {/* Mobile Menu Button */}
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="md:hidden p-2 text-gray-400 hover:text-white"
          >
            {mobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
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
            className="md:hidden bg-gray-900 border-t border-gray-800"
          >
            <div className="px-4 py-4 space-y-2">
              {sectionsData.map((section) => (
                <button
                  key={section.id}
                  onClick={() => handleScrollTo(section.id)}
                  className="block w-full text-left px-4 py-2 text-gray-400 hover:text-white hover:bg-gray-800 rounded-lg transition-colors"
                >
                  {section.title}
                </button>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </nav>
  );
}
