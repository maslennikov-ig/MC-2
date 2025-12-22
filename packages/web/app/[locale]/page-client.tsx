"use client"

import dynamic from "next/dynamic"
import Header from "@/components/layouts/header"
import HomeMetadata from "@/components/common/home-metadata"

// Dynamic imports for heavy components with shader effects
const HeroContent = dynamic(
  () => import("@/components/common/hero-content"),
  { 
    loading: () => (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-pulse text-white text-xl">Загрузка...</div>
      </div>
    )
  }
)

const ShaderBackground = dynamic(
  () => import("@/components/layouts/shader-background"),
  { 
    loading: () => (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 to-slate-800" />
    )
  }
)

export default function HomePageClient() {
  return (
    <ShaderBackground>
      <HomeMetadata />
      <Header darkMode={true} />
      <HeroContent />
    </ShaderBackground>
  )
}