'use client'

import React from 'react'
import { motion } from 'framer-motion'
import { Section } from '../_types'
import { FeatureCard } from './feature-card'

interface SectionBlockProps {
  section: Section
  index: number
}

export function SectionBlock({ section, index }: SectionBlockProps) {
  return (
    <motion.section
      id={section.id}
      initial={{ opacity: 0 }}
      whileInView={{ opacity: 1 }}
      viewport={{ once: true, amount: 0.2 }}
      className="relative overflow-hidden py-24"
    >
      {/* Section Background */}
      <div className="absolute inset-0">
        <div className={`absolute inset-0 ${section.gradient} opacity-30`} />
      </div>

      <div className="relative z-10 mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        {/* Section Header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="mb-16 text-center"
        >
          <div
            className={`inline-flex items-center gap-3 bg-gradient-to-r px-6 py-3 ${section.color} mb-6 rounded-full text-white`}
          >
            {section.icon}
            <span className="text-sm font-semibold tracking-wider uppercase">
              Раздел {index + 1}
            </span>
          </div>
          <h2 className="mb-4 text-4xl font-bold text-white lg:text-5xl">{section.title}</h2>
          <p className="mx-auto max-w-3xl text-xl text-gray-400">{section.subtitle}</p>
        </motion.div>

        {/* Features Grid */}
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {section.features.map((feature, featureIndex) => (
            <FeatureCard key={feature.id} feature={feature} index={featureIndex} />
          ))}
        </div>
      </div>
    </motion.section>
  )
}
