'use client';

import React from 'react';
import { motion } from 'framer-motion';
import { scrollToSection } from '../_utils/scroll-utils';

export function FutureCTA() {
  return (
    <section className="relative py-32 overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-br from-purple-600/20 via-blue-600/20 to-cyan-600/20" />
      
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        className="relative z-10 max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center"
      >
        <h2 className="text-5xl font-bold text-white mb-6">
          Будущее корпоративного обучения
        </h2>
        <p className="text-xl text-gray-300 mb-12">
          Исследуйте возможности, которые станут реальностью завтра. <br/>
          Это концепция того, как может выглядеть корпоративное обучение в ближайшем будущем.
        </p>
        
        <div className="grid md:grid-cols-3 gap-8 mb-12">
          <div className="bg-gray-800/50 backdrop-blur-sm border border-gray-700 rounded-xl p-6">
            <div className="text-3xl font-bold text-purple-400 mb-2">200+</div>
            <div className="text-gray-400">инновационных функций</div>
          </div>
          <div className="bg-gray-800/50 backdrop-blur-sm border border-gray-700 rounded-xl p-6">
            <div className="text-3xl font-bold text-cyan-400 mb-2">14</div>
            <div className="text-gray-400">направлений развития</div>
          </div>
          <div className="bg-gray-800/50 backdrop-blur-sm border border-gray-700 rounded-xl p-6">
            <div className="text-3xl font-bold text-green-400 mb-2">∞</div>
            <div className="text-gray-400">возможностей</div>
          </div>
        </div>

        <div className="bg-gradient-to-r from-purple-500/20 to-cyan-500/20 backdrop-blur-sm rounded-2xl border border-purple-500/30 p-8 mb-12">
          <p className="text-lg text-gray-300 mb-4">
            <span className="text-purple-400 font-semibold">Важно:</span> Это визуализация возможного будущего корпоративного обучения.
          </p>
          <p className="text-gray-400">
            Представленные функции показывают направление развития индустрии L&D и потенциал технологий AI в образовании.
            Некоторые из этих возможностей уже реализуются, другие находятся в разработке, а часть представляет собой видение будущего.
          </p>
        </div>

        <div className="flex flex-col sm:flex-row gap-4 justify-center">
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={() => scrollToSection('share-ideas')}
            className="px-8 py-4 bg-gradient-to-r from-purple-600 to-cyan-600 text-white font-semibold rounded-xl hover:shadow-2xl hover:shadow-purple-500/25 transition-all"
          >
            Поделиться своими идеями
          </motion.button>
        </div>
      </motion.div>
    </section>
  );
}
