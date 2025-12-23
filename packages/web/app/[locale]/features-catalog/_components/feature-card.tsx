'use client';

import React from 'react';
import { motion } from 'framer-motion';
import { Feature } from '../_types';

interface FeatureCardProps {
  feature: Feature;
  index: number;
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
      <div className="absolute inset-0 bg-gradient-to-br from-purple-600/10 to-cyan-600/10 rounded-2xl blur-xl opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
      
      <div className="relative h-full bg-gradient-to-br from-gray-800/80 to-gray-900/80 backdrop-blur-sm border border-gray-700 rounded-2xl p-6 hover:border-purple-500/50 transition-all duration-300">
        <div className="flex items-start justify-between mb-4">
          <div className={`p-3 rounded-xl bg-gradient-to-br ${feature.gradient} shadow-lg`}>
            {feature.icon}
          </div>
          {feature.stats && (
            <motion.span 
              initial={{ scale: 0 }}
              whileInView={{ scale: 1 }}
              viewport={{ once: true }}
              className="px-3 py-1 bg-gradient-to-r from-purple-500/20 to-cyan-500/20 text-purple-300 text-xs font-bold rounded-full border border-purple-500/30"
            >
              {feature.stats}
            </motion.span>
          )}
        </div>

        <h3 className="text-xl font-semibold text-white mb-3 group-hover:text-transparent group-hover:bg-gradient-to-r group-hover:from-purple-400 group-hover:to-cyan-400 group-hover:bg-clip-text transition-all duration-300">
          {feature.title}
        </h3>
        
        <p className="text-gray-400 leading-relaxed">
          {feature.benefit}
        </p>
      </div>
    </motion.div>
  );
}