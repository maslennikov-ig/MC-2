'use client'

import React from 'react'
import { motion } from 'framer-motion'
import { Feature } from '../_types'

interface FeatureCardProps {
  feature: Feature
  index: number
}

export function FeatureCard({ feature, index }: FeatureCardProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ delay: index * 0.05 }}
      whileHover={{ y: -8, transition: { duration: 0.2 } }}
      className="group relative"
    >
      <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-purple-600/10 to-cyan-600/10 opacity-0 blur-xl transition-opacity duration-300 group-hover:opacity-100" />

      <div className="relative h-full rounded-2xl border border-gray-700 bg-gradient-to-br from-gray-800/80 to-gray-900/80 p-6 backdrop-blur-sm transition-all duration-300 hover:border-purple-500/50">
        <div className="mb-4 flex items-start justify-between">
          <div className={`rounded-xl bg-gradient-to-br p-3 ${feature.gradient} shadow-lg`}>
            {feature.icon}
          </div>
          {feature.stats && (
            <motion.span
              initial={{ scale: 0 }}
              whileInView={{ scale: 1 }}
              viewport={{ once: true }}
              className="rounded-full border border-purple-500/30 bg-gradient-to-r from-purple-500/20 to-cyan-500/20 px-3 py-1 text-xs font-bold text-purple-300"
            >
              {feature.stats}
            </motion.span>
          )}
        </div>

        <h3 className="mb-3 text-xl font-semibold text-white transition-all duration-300 group-hover:bg-gradient-to-r group-hover:from-purple-400 group-hover:to-cyan-400 group-hover:bg-clip-text group-hover:text-transparent">
          {feature.title}
        </h3>

        <p className="leading-relaxed text-gray-400">{feature.benefit}</p>
      </div>
    </motion.div>
  )
}
