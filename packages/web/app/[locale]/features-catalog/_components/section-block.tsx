'use client';

import React from 'react';
import { motion } from 'framer-motion';
import { Section } from '../_types';
import { FeatureCard } from './feature-card';

interface SectionBlockProps {
  section: Section;
  index: number;
}

export function SectionBlock({ section, index }: SectionBlockProps) {
  return (
    <motion.section
      id={section.id}
      initial={{ opacity: 0 }}
      whileInView={{ opacity: 1 }}
      viewport={{ once: true, amount: 0.2 }}
      className="py-24 relative overflow-hidden"
    >
      {/* Section Background */}
      <div className="absolute inset-0">
        <div className={`absolute inset-0 ${section.gradient} opacity-30`} />
      </div>

      <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Section Header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="text-center mb-16"
        >
          <div className={`inline-flex items-center gap-3 px-6 py-3 bg-gradient-to-r ${section.color} rounded-full text-white mb-6`}>
            {section.icon}
            <span className="text-sm font-semibold uppercase tracking-wider">
              Раздел {index + 1}
            </span>
          </div>
          <h2 className="text-4xl lg:text-5xl font-bold text-white mb-4">
            {section.title}
          </h2>
          <p className="text-xl text-gray-400 max-w-3xl mx-auto">
            {section.subtitle}
          </p>
        </motion.div>

        {/* Features Grid */}
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {section.features.map((feature, featureIndex) => (
            <FeatureCard 
              key={feature.id} 
              feature={feature} 
              index={featureIndex} 
            />
          ))}
        </div>
      </div>
    </motion.section>
  );
}