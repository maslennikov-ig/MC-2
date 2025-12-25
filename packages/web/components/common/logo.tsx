import Image from "next/image"
import Link from "next/link"
import { cn } from "@/lib/utils"

type LogoSize = "sm" | "md" | "lg"

interface LogoProps {
  className?: string
  variant?: "full" | "compact" | "icon"
  width?: number
  height?: number
  size?: LogoSize
  href?: Parameters<typeof Link>[0]['href']
  clickable?: boolean
  showText?: boolean
  textPosition?: "right" | "bottom"
  forceTheme?: "dark" | "light"
  // Deprecated prop, kept for backward compatibility but ignored in favor of CSS theming or mapped to forceTheme
  forceWhite?: boolean
}

export default function Logo({
  className,
  variant = "compact",
  width,
  height,
  size,
  href = "/",
  clickable = true,
  showText = true,
  textPosition = "right",
  forceTheme,
  forceWhite
}: LogoProps) {
  // Map forceWhite to forceTheme if forceTheme is not explicitly set
  const effectiveForceTheme = forceTheme || (forceWhite ? "dark" : undefined);

  // Standardized sizes for responsive design
  const sizePresets: Record<LogoSize, { width: number; height: number }> = {
    sm: { width: 48, height: 16 },
    md: { width: 60, height: 20 },
    lg: { width: 72, height: 24 }
  }

  // Determine dimensions: size prop > width/height props > variant defaults
  let finalWidth: number
  let finalHeight: number

  if (size) {
    finalWidth = sizePresets[size].width
    finalHeight = sizePresets[size].height
  } else if (width || height) {
    const dimensionDefaults = {
      full: { width: 120, height: 60 },
      compact: { width: 84, height: 28 },
      icon: { width: 24, height: 24 }
    }
    finalWidth = width || dimensionDefaults[variant].width
    finalHeight = height || dimensionDefaults[variant].height
  } else {
    const dimensionDefaults = {
      full: { width: 120, height: 60 },
      compact: { width: 84, height: 28 },
      icon: { width: 24, height: 24 }
    }
    finalWidth = dimensionDefaults[variant].width
    finalHeight = dimensionDefaults[variant].height
  }

  const w = finalWidth
  const h = finalHeight
  
  // Don't show text for icon variant unless explicitly requested
  const shouldShowText = variant === "icon" ? (showText === true && textPosition !== undefined) : showText;

  const TextComponent = () => (
    <span className={cn(
      "font-bold tracking-tight whitespace-nowrap",
      "transition-all duration-300",
      variant === "full" ? "text-[22px]" : "text-[18px]",
      textPosition === "bottom" ? "mt-2" : "ml-3",
      // Forced white text (e.g., dark background header)
      effectiveForceTheme === "dark"
        ? "text-white"
        : effectiveForceTheme === "light"
          // Forced light theme: always gradient
          ? "bg-gradient-to-r from-purple-600 via-purple-500 to-blue-600 bg-clip-text text-transparent"
          // Default: gradient in light theme, white in dark theme
          : cn(
              "bg-gradient-to-r from-purple-600 via-purple-500 to-blue-600 bg-clip-text text-transparent",
              "dark:bg-none dark:text-white"
            )
    )}>
      MegaCampus.ai
    </span>
  )

  // User instructions:
  // logo-dark.webp -> Dark Theme
  // logo-white.webp -> Light Theme
  // Note: Standard logic usually implies "White Logo" is for Dark Backgrounds.
  // However, user mapped "logo-dark.webp" to Dark Theme. 
  // I will implement standard CSS class switching.
  
  const DarkThemeLogo = (
    <Image
      src="/logo/logo-dark.webp"
      alt="MegaCampusAI Logo"
      width={w}
      height={h}
      priority
      quality={90}
      style={{ width: 'auto', height: 'auto' }}
      className={cn(
        "object-contain",
        variant === "icon" && "rounded-lg",
        effectiveForceTheme === "light" ? "hidden" : "hidden dark:block",
        effectiveForceTheme === "dark" && "block"
      )}
    />
  )

  const LightThemeLogo = (
    <Image
      src="/logo/logo-white.webp"
      alt="MegaCampusAI Logo"
      width={w}
      height={h}
      priority
      quality={90}
      style={{ width: 'auto', height: 'auto' }}
      className={cn(
        "object-contain",
        variant === "icon" && "rounded-lg",
        effectiveForceTheme === "dark" ? "hidden" : "block dark:hidden",
        effectiveForceTheme === "light" && "block"
      )}
    />
  )

  const content = (
    <div className={cn(
      "flex items-center", 
      textPosition === "bottom" ? "flex-col" : "flex-row"
    )}>
      <div className="relative flex items-center justify-center">
         {/* Render both, hide one via CSS */}
         {DarkThemeLogo}
         {LightThemeLogo}
      </div>
      {shouldShowText && <TextComponent />}
    </div>
  )
  
  if (clickable) {
    return (
      <Link 
        href={href} 
        className={cn(
          "relative inline-flex items-center cursor-pointer group select-none",
          className
        )}
        aria-label="Go to homepage"
      >
        {content}
      </Link>
    )
  }
  
  return (
    <div className={cn("relative inline-flex items-center select-none", className)}>
      {content}
    </div>
  )
}
