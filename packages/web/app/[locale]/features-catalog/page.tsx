'use client';

import React from 'react';
import { motion, useScroll } from 'framer-motion';
import { sectionsData } from './_data/sections-data';
import { NavigationMenu } from './_components/navigation-menu';
import { HeroSection } from './_components/hero-section';
import { SectionBlock } from './_components/section-block';
import { FutureCTA } from './_components/future-cta';
import { ShareIdeasForm } from './_components/share-ideas-form';

export default function FeaturesLanding() {
  const { scrollYProgress } = useScroll();

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900">
      {/* Progress Bar */}
      <motion.div
        className="fixed top-0 left-0 right-0 h-1 bg-gradient-to-r from-purple-600 to-cyan-600 z-50 origin-left"
        style={{ scaleX: scrollYProgress }}
      />

      {/* Navigation */}
      <NavigationMenu />

      {/* Hero Section */}
      <HeroSection />

      {/* Features Sections */}
      {sectionsData.map((section, sectionIndex) => (
        <SectionBlock 
          key={section.id} 
          section={section} 
          index={sectionIndex} 
        />
      ))}

      {/* Final CTA Section */}
      <FutureCTA />

      {/* Share Ideas Section */}
      <ShareIdeasForm />

    </div>
  );
}