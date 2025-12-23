'use client';

import React, { useRef } from 'react';
import { motion, useScroll, useTransform } from 'framer-motion';
import { 
  Sparkles, 
  TrendingUp,
  Users, 
  Globe,
  Clock,
  ChevronDown
} from 'lucide-react';
import { scrollToSection } from '../_utils/scroll-utils';

export function HeroSection() {
  const heroRef = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll();
  // We want the hero to fade out as we scroll down the first part of the page
  // Since this component is at the top, global scrollYProgress works, 
  // but targeting the ref might be more precise if we wanted local effect.
  // The original code used global scrollYProgress for this effect.
  const opacityProgress = useTransform(scrollYProgress, [0, 0.5], [1, 0]);

  return (
    <motion.div 
      ref={heroRef}
      className="relative min-h-screen flex items-center justify-center overflow-hidden pt-24 pb-12"
      style={{ opacity: opacityProgress }}
    >
      {/* Animated Background */}
      <div className="absolute inset-0">
        <div className="absolute inset-0 bg-gradient-to-br from-purple-600/20 via-blue-600/20 to-cyan-600/20" />
        <motion.div
          animate={{
            backgroundPosition: ['0% 0%', '100% 100%'],
          }}
          transition={{
            duration: 20,
            repeat: Infinity,
            repeatType: 'reverse',
          }}
          className="absolute inset-0 opacity-30"
          style={{
            backgroundImage: 'url("data:image/svg+xml,%3Csvg width="60" height="60" xmlns="http://www.w3.org/2000/svg"%3E%3Cdefs%3E%3Cpattern id="grid" width="60" height="60" patternUnits="userSpaceOnUse"%3E%3Cpath d="M 60 0 L 0 0 0 60" fill="none" stroke="white" stroke-width="0.5" opacity="0.1"/%3E%3C/pattern%3E%3C/defs%3E%3Crect width="100%25" height="100%25" fill="url(%23grid)"/%3E%3C/svg%3E")',
            backgroundSize: '60px 60px',
          }}
        />
      </div>

      <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center py-12">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8 }}
        >
          <div className="inline-flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-purple-500/20 to-cyan-500/20 backdrop-blur-sm rounded-full border border-purple-500/30 mb-12">
            <Sparkles className="w-4 h-4 text-purple-400" />
            <span className="text-sm font-medium text-purple-300">200+ функций для трансформации обучения</span>
          </div>

          <h1 className="text-5xl sm:text-6xl lg:text-7xl font-bold mb-8 leading-tight">
            <span className="bg-gradient-to-r from-white via-blue-200 to-purple-200 bg-clip-text text-transparent">
              Платформа будущего
            </span>
            <br />
            <span className="text-4xl sm:text-5xl lg:text-6xl bg-gradient-to-r from-purple-400 to-cyan-400 bg-clip-text text-transparent">
              для корпоративного обучения
            </span>
          </h1>

          <p className="text-xl text-gray-300 max-w-3xl mx-auto mb-16 leading-relaxed">
            Трансформируйте корпоративное обучение с помощью AI. 
            Создавайте курсы за минуты, персонализируйте траектории, 
            измеряйте ROI каждого занятия.
          </p>

          {/* CTA Buttons */}
          <div className="flex flex-col sm:flex-row gap-6 justify-center mb-20">
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => scrollToSection('automation')}
              className="px-8 py-4 bg-gradient-to-r from-purple-600 to-cyan-600 text-white font-semibold rounded-xl hover:shadow-2xl hover:shadow-purple-500/25 transition-all"
            >
              Узнать о возможностях будущего
            </motion.button>
          </div>

          {/* Stats Grid */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6 max-w-4xl mx-auto mt-12">
            {[
              { label: 'Экономия времени', value: '95%', icon: <Clock className="w-5 h-5" /> },
              { label: 'ROI обучения', value: '470%', icon: <TrendingUp className="w-5 h-5" /> },
              { label: 'Вовлеченность', value: '+89%', icon: <Users className="w-5 h-5" /> },
              { label: 'Языков', value: '40+', icon: <Globe className="w-5 h-5" /> }
            ].map((stat, index) => (
              <motion.div
                key={stat.label}
                initial={{ opacity: 0, scale: 0.5 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 0.5 + index * 0.1 }}
                className="bg-gradient-to-br from-gray-800/50 to-gray-900/50 backdrop-blur-sm border border-gray-700 rounded-xl p-6 hover:border-purple-500/50 transition-all"
              >
                <div className="flex justify-center mb-2 text-purple-400">
                  {stat.icon}
                </div>
                <div className="text-3xl font-bold text-white mb-1">{stat.value}</div>
                <div className="text-sm text-gray-400">{stat.label}</div>
              </motion.div>
            ))}
          </div>
        </motion.div>

        {/* Scroll Indicator */}
        <motion.div
          animate={{ y: [0, 10, 0] }}
          transition={{ duration: 2, repeat: Infinity }}
          className="absolute bottom-8 left-1/2 -translate-x-1/2"
        >
          <ChevronDown className="w-8 h-8 text-gray-400" />
        </motion.div>
      </div>
    </motion.div>
  );
}
