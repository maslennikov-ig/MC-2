'use client'

import React, { useRef } from 'react'
import { motion, useScroll, useTransform } from 'framer-motion'
import { Sparkles, TrendingUp, Users, Globe, Clock, ChevronDown } from 'lucide-react'
import { scrollToSection } from '../_utils/scroll-utils'

export function HeroSection() {
  const heroRef = useRef<HTMLDivElement>(null)
  const { scrollYProgress } = useScroll()
  // We want the hero to fade out as we scroll down the first part of the page
  // Since this component is at the top, global scrollYProgress works,
  // but targeting the ref might be more precise if we wanted local effect.
  // The original code used global scrollYProgress for this effect.
  const opacityProgress = useTransform(scrollYProgress, [0, 0.5], [1, 0])

  return (
    <motion.div
      ref={heroRef}
      className="relative flex min-h-screen items-center justify-center overflow-hidden pt-24 pb-12"
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
            backgroundImage:
              'url("data:image/svg+xml,%3Csvg width="60" height="60" xmlns="http://www.w3.org/2000/svg"%3E%3Cdefs%3E%3Cpattern id="grid" width="60" height="60" patternUnits="userSpaceOnUse"%3E%3Cpath d="M 60 0 L 0 0 0 60" fill="none" stroke="white" stroke-width="0.5" opacity="0.1"/%3E%3C/pattern%3E%3C/defs%3E%3Crect width="100%25" height="100%25" fill="url(%23grid)"/%3E%3C/svg%3E")',
            backgroundSize: '60px 60px',
          }}
        />
      </div>

      <div className="relative z-10 mx-auto max-w-7xl px-4 py-12 text-center sm:px-6 lg:px-8">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8 }}
        >
          <div className="mb-12 inline-flex items-center gap-2 rounded-full border border-purple-500/30 bg-gradient-to-r from-purple-500/20 to-cyan-500/20 px-6 py-3 backdrop-blur-sm">
            <Sparkles className="h-4 w-4 text-purple-400" />
            <span className="text-sm font-medium text-purple-300">
              200+ функций для трансформации обучения
            </span>
          </div>

          <h1 className="mb-8 text-5xl leading-tight font-bold sm:text-6xl lg:text-7xl">
            <span className="bg-gradient-to-r from-white via-blue-200 to-purple-200 bg-clip-text text-transparent">
              Платформа будущего
            </span>
            <br />
            <span className="bg-gradient-to-r from-purple-400 to-cyan-400 bg-clip-text text-4xl text-transparent sm:text-5xl lg:text-6xl">
              для корпоративного обучения
            </span>
          </h1>

          <p className="mx-auto mb-16 max-w-3xl text-xl leading-relaxed text-gray-300">
            Трансформируйте корпоративное обучение с помощью AI. Создавайте курсы за минуты,
            персонализируйте траектории, измеряйте ROI каждого занятия.
          </p>

          {/* CTA Buttons */}
          <div className="mb-20 flex flex-col justify-center gap-6 sm:flex-row">
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => scrollToSection('automation')}
              className="rounded-xl bg-gradient-to-r from-purple-600 to-cyan-600 px-8 py-4 font-semibold text-white transition-all hover:shadow-2xl hover:shadow-purple-500/25"
            >
              Узнать о возможностях будущего
            </motion.button>
          </div>

          {/* Stats Grid */}
          <div className="mx-auto mt-12 grid max-w-4xl grid-cols-2 gap-6 md:grid-cols-4">
            {[
              { label: 'Экономия времени', value: '95%', icon: <Clock className="h-5 w-5" /> },
              { label: 'ROI обучения', value: '470%', icon: <TrendingUp className="h-5 w-5" /> },
              { label: 'Вовлеченность', value: '+89%', icon: <Users className="h-5 w-5" /> },
              { label: 'Языков', value: '40+', icon: <Globe className="h-5 w-5" /> },
            ].map((stat, index) => (
              <motion.div
                key={stat.label}
                initial={{ opacity: 0, scale: 0.5 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 0.5 + index * 0.1 }}
                className="rounded-xl border border-gray-700 bg-gradient-to-br from-gray-800/50 to-gray-900/50 p-6 backdrop-blur-sm transition-all hover:border-purple-500/50"
              >
                <div className="mb-2 flex justify-center text-purple-400">{stat.icon}</div>
                <div className="mb-1 text-3xl font-bold text-white">{stat.value}</div>
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
          <ChevronDown className="h-8 w-8 text-gray-400" />
        </motion.div>
      </div>
    </motion.div>
  )
}
