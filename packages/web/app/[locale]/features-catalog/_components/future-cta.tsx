'use client'

import React from 'react'
import { motion } from 'framer-motion'
import { scrollToSection } from '../_utils/scroll-utils'

export function FutureCTA() {
  return (
    <section className="relative overflow-hidden py-32">
      <div className="absolute inset-0 bg-gradient-to-br from-purple-600/20 via-blue-600/20 to-cyan-600/20" />

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        className="relative z-10 mx-auto max-w-4xl px-4 text-center sm:px-6 lg:px-8"
      >
        <h2 className="mb-6 text-5xl font-bold text-white">Будущее корпоративного обучения</h2>
        <p className="mb-12 text-xl text-gray-300">
          Исследуйте возможности, которые станут реальностью завтра. <br />
          Это концепция того, как может выглядеть корпоративное обучение в ближайшем будущем.
        </p>

        <div className="mb-12 grid gap-8 md:grid-cols-3">
          <div className="rounded-xl border border-gray-700 bg-gray-800/50 p-6 backdrop-blur-sm">
            <div className="mb-2 text-3xl font-bold text-purple-400">200+</div>
            <div className="text-gray-400">инновационных функций</div>
          </div>
          <div className="rounded-xl border border-gray-700 bg-gray-800/50 p-6 backdrop-blur-sm">
            <div className="mb-2 text-3xl font-bold text-cyan-400">14</div>
            <div className="text-gray-400">направлений развития</div>
          </div>
          <div className="rounded-xl border border-gray-700 bg-gray-800/50 p-6 backdrop-blur-sm">
            <div className="mb-2 text-3xl font-bold text-green-400">∞</div>
            <div className="text-gray-400">возможностей</div>
          </div>
        </div>

        <div className="mb-12 rounded-2xl border border-purple-500/30 bg-gradient-to-r from-purple-500/20 to-cyan-500/20 p-8 backdrop-blur-sm">
          <p className="mb-4 text-lg text-gray-300">
            <span className="font-semibold text-purple-400">Важно:</span> Это визуализация
            возможного будущего корпоративного обучения.
          </p>
          <p className="text-gray-400">
            Представленные функции показывают направление развития индустрии L&D и потенциал
            технологий AI в образовании. Некоторые из этих возможностей уже реализуются, другие
            находятся в разработке, а часть представляет собой видение будущего.
          </p>
        </div>

        <div className="flex flex-col justify-center gap-4 sm:flex-row">
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={() => scrollToSection('share-ideas')}
            className="rounded-xl bg-gradient-to-r from-purple-600 to-cyan-600 px-8 py-4 font-semibold text-white transition-all hover:shadow-2xl hover:shadow-purple-500/25"
          >
            Поделиться своими идеями
          </motion.button>
        </div>
      </motion.div>
    </section>
  )
}
