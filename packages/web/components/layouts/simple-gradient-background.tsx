'use client'

import type React from 'react'

interface SimpleGradientBackgroundProps {
  children: React.ReactNode
}

export default function SimpleGradientBackground({ children }: SimpleGradientBackgroundProps) {
  return (
    <div className="relative min-h-screen bg-gradient-to-br from-[#0f172a] via-[#1e1b4b] to-[#0f172a]">
      {/* Subtle noise texture overlay */}
      <div
        className="absolute inset-0 opacity-[0.015]"
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.65' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E")`,
          backgroundRepeat: 'repeat',
          backgroundSize: '256px 256px',
        }}
      />

      {/* Subtle gradient orbs for depth */}
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute -top-40 -right-40 h-80 w-80 rounded-full bg-[#667eea]/10 blur-[128px]" />
        <div className="absolute -bottom-40 -left-40 h-80 w-80 rounded-full bg-[#764ba2]/10 blur-[128px]" />
        <div className="absolute top-1/2 left-1/2 h-96 w-96 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#667eea]/5 blur-[128px]" />
      </div>

      {/* Content */}
      <div className="relative z-10">{children}</div>
    </div>
  )
}
