/**
 * Tailwind CSS breakpoint values in pixels
 * Matches the default Tailwind configuration
 * @see https://tailwindcss.com/docs/responsive-design
 */
export const BREAKPOINTS = {
  /** Small screens and up */
  sm: 640,
  /** Medium screens (tablets) and up */
  md: 768,
  /** Large screens (laptops) and up */
  lg: 1024,
  /** Extra large screens (desktops) and up */
  xl: 1280,
  /** 2XL screens and up */
  '2xl': 1536,
} as const

export type Breakpoint = keyof typeof BREAKPOINTS
