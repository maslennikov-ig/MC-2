import { clsx, type ClassValue } from 'clsx'

// Typography utility classes
export const typography = {
  // Headings
  h1: 'text-4xl md:text-5xl font-bold tracking-tight',
  h2: 'text-3xl md:text-4xl font-semibold tracking-tight',
  h3: 'text-2xl md:text-3xl font-semibold',
  h4: 'text-xl md:text-2xl font-medium',
  h5: 'text-lg md:text-xl font-medium',
  h6: 'text-base md:text-lg font-medium',
  
  // Body text
  body: 'text-base leading-relaxed',
  bodyLarge: 'text-lg leading-relaxed',
  bodySmall: 'text-sm leading-relaxed',
  
  // Special text
  lead: 'text-xl md:text-2xl text-muted-foreground leading-relaxed',
  muted: 'text-muted-foreground',
  small: 'text-sm',
  tiny: 'text-xs',
  
  // Semantic text using design tokens
  error: 'text-destructive',
  success: 'text-[hsl(var(--success))]',
  warning: 'text-[hsl(var(--warning))]',
  info: 'text-[hsl(var(--info))]',
  
  // Font weights
  thin: 'font-thin',
  light: 'font-light',
  normal: 'font-normal',
  medium: 'font-medium',
  semibold: 'font-semibold',
  bold: 'font-bold',
  extrabold: 'font-extrabold',
  
  // Text alignment
  left: 'text-left',
  center: 'text-center',
  right: 'text-right',
  justify: 'text-justify',
  
  // Text transforms
  uppercase: 'uppercase',
  lowercase: 'lowercase',
  capitalize: 'capitalize',
  normalCase: 'normal-case',
  
  // Truncation
  truncate: 'truncate',
  lineClamp1: 'line-clamp-1',
  lineClamp2: 'line-clamp-2',
  lineClamp3: 'line-clamp-3',
  lineClamp4: 'line-clamp-4',
  
  // Letter spacing
  tighter: 'tracking-tighter',
  tight: 'tracking-tight',
  wide: 'tracking-wide',
  wider: 'tracking-wider',
  widest: 'tracking-widest',
  
  // Line height
  leading: {
    none: 'leading-none',
    tight: 'leading-tight',
    snug: 'leading-snug',
    normal: 'leading-normal',
    relaxed: 'leading-relaxed',
    loose: 'leading-loose',
  },
  
  // Gradients
  gradient: 'bg-gradient-to-r from-primary to-purple-600 bg-clip-text text-transparent',
  gradientHover: 'hover:bg-gradient-to-r hover:from-primary hover:to-purple-600 hover:bg-clip-text hover:text-transparent transition-all',
}

// Helper function to combine typography classes
export function tw(...classes: ClassValue[]) {
  return clsx(classes)
}

