import type { Config } from 'tailwindcss'
import typography from '@tailwindcss/typography'

const config: Config = {
  darkMode: 'class',
  content: [
    './app/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
    './lib/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      // Core semantic colors
      colors: {
        // Background & Surface colors
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',

        // Card component colors
        card: {
          DEFAULT: 'hsl(var(--card))',
          foreground: 'hsl(var(--card-foreground))',
        },

        // Popover component colors
        popover: {
          DEFAULT: 'hsl(var(--popover))',
          foreground: 'hsl(var(--popover-foreground))',
        },

        // Brand colors
        primary: {
          DEFAULT: 'hsl(var(--primary))',
          foreground: 'hsl(var(--primary-foreground))',
        },
        secondary: {
          DEFAULT: 'hsl(var(--secondary))',
          foreground: 'hsl(var(--secondary-foreground))',
        },

        // UI state colors
        muted: {
          DEFAULT: 'hsl(var(--muted))',
          foreground: 'hsl(var(--muted-foreground))',
        },
        accent: {
          DEFAULT: 'hsl(var(--accent))',
          foreground: 'hsl(var(--accent-foreground))',
        },
        destructive: {
          DEFAULT: 'hsl(var(--destructive))',
          foreground: 'hsl(var(--destructive-foreground))',
        },

        // Status colors
        success: {
          DEFAULT: 'hsl(var(--success))',
          light: 'hsl(var(--success-light))',
          foreground: 'hsl(var(--success-foreground))',
        },
        warning: {
          DEFAULT: 'hsl(var(--warning))',
          light: 'hsl(var(--warning-light))',
          foreground: 'hsl(var(--warning-foreground))',
        },
        info: {
          DEFAULT: 'hsl(var(--info))',
          light: 'hsl(var(--info-light))',
          foreground: 'hsl(var(--info-foreground))',
        },
        danger: {
          DEFAULT: 'hsl(var(--danger))',
          light: 'hsl(var(--danger-light))',
          foreground: 'hsl(var(--danger-foreground))',
        },

        // Form & Border colors
        border: 'hsl(var(--border))',
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',
      },

      // Consistent border radius system
      borderRadius: {
        'none': '0',
        'sm': 'var(--radius-sm)',
        'DEFAULT': 'var(--radius)',
        'md': 'var(--radius-md)',
        'lg': 'var(--radius-lg)',
        'xl': 'var(--radius-xl)',
        '2xl': 'var(--radius-2xl)',
        '3xl': 'var(--radius-3xl)',
        'full': '9999px',
      },

      // Font system
      fontFamily: {
        sans: ['var(--font-sans)', 'system-ui', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Roboto', 'sans-serif'],
        mono: ['var(--font-mono)', 'SFMono-Regular', 'Menlo', 'Monaco', 'Consolas', 'Liberation Mono', 'monospace'],
      },

      // Consistent spacing system (4px base via --spacing CSS variable)
      spacing: {
        '0': '0',
        'px': '1px',
        '0.5': 'calc(var(--spacing) * 0.5)',   // 2px
        '1': 'var(--spacing)',                  // 4px
        '1.5': 'calc(var(--spacing) * 1.5)',   // 6px
        '2': 'calc(var(--spacing) * 2)',       // 8px
        '2.5': 'calc(var(--spacing) * 2.5)',   // 10px
        '3': 'calc(var(--spacing) * 3)',       // 12px
        '3.5': 'calc(var(--spacing) * 3.5)',   // 14px
        '4': 'calc(var(--spacing) * 4)',       // 16px
        '5': 'calc(var(--spacing) * 5)',       // 20px
        '6': 'calc(var(--spacing) * 6)',       // 24px
        '7': 'calc(var(--spacing) * 7)',       // 28px
        '8': 'calc(var(--spacing) * 8)',       // 32px
        '9': 'calc(var(--spacing) * 9)',       // 36px
        '10': 'calc(var(--spacing) * 10)',     // 40px
        '11': 'calc(var(--spacing) * 11)',     // 44px
        '12': 'calc(var(--spacing) * 12)',     // 48px
        '14': 'calc(var(--spacing) * 14)',     // 56px
        '16': 'calc(var(--spacing) * 16)',     // 64px
        '20': 'calc(var(--spacing) * 20)',     // 80px
        '24': 'calc(var(--spacing) * 24)',     // 96px
        '28': 'calc(var(--spacing) * 28)',     // 112px
        '32': 'calc(var(--spacing) * 32)',     // 128px
        '36': 'calc(var(--spacing) * 36)',     // 144px
        '40': 'calc(var(--spacing) * 40)',     // 160px
        '44': 'calc(var(--spacing) * 44)',     // 176px
        '48': 'calc(var(--spacing) * 48)',     // 192px
        '52': 'calc(var(--spacing) * 52)',     // 208px
        '56': 'calc(var(--spacing) * 56)',     // 224px
        '60': 'calc(var(--spacing) * 60)',     // 240px
        '64': 'calc(var(--spacing) * 64)',     // 256px
        '72': 'calc(var(--spacing) * 72)',     // 288px
        '80': 'calc(var(--spacing) * 80)',     // 320px
        '96': 'calc(var(--spacing) * 96)',     // 384px
      },

      // Typography scale
      fontSize: {
        'xs': ['var(--text-xs)', { lineHeight: 'var(--text-xs--line-height)' }],
        'sm': ['var(--text-sm)', { lineHeight: 'var(--text-sm--line-height)' }],
        'base': ['var(--text-base)', { lineHeight: 'var(--text-base--line-height)' }],
        'lg': ['var(--text-lg)', { lineHeight: 'var(--text-lg--line-height)' }],
        'xl': ['var(--text-xl)', { lineHeight: 'var(--text-xl--line-height)' }],
        '2xl': ['var(--text-2xl)', { lineHeight: 'var(--text-2xl--line-height)' }],
        '3xl': ['var(--text-3xl)', { lineHeight: 'var(--text-3xl--line-height)' }],
        '4xl': ['var(--text-4xl)', { lineHeight: 'var(--text-4xl--line-height)' }],
        '5xl': ['var(--text-5xl)', { lineHeight: 'var(--text-5xl--line-height)' }],
        '6xl': ['var(--text-6xl)', { lineHeight: 'var(--text-6xl--line-height)' }],
      },

      // Z-index layering system
      zIndex: {
        '0': '0',
        '10': '10',
        '20': '20',
        '30': '30',
        '40': '40',
        '50': '50',
        'dropdown': '1000',
        'sticky': '1020',
        'fixed': '1030',
        'modal-backdrop': '1040',
        'offcanvas': '1045',
        'modal': '1055',
        'popover': '1070',
        'tooltip': '1080',
        'toast': '9999',
      },

      // Box shadows
      boxShadow: {
        'xs': 'var(--shadow-xs)',
        'sm': 'var(--shadow-sm)',
        'DEFAULT': 'var(--shadow-md)',
        'md': 'var(--shadow-md)',
        'lg': 'var(--shadow-lg)',
        'xl': 'var(--shadow-xl)',
        '2xl': 'var(--shadow-2xl)',
        'inner': 'var(--inset-shadow-sm)',
        'none': 'none',
        'card': '0 2px 8px rgba(0, 0, 0, 0.04), 0 4px 16px rgba(0, 0, 0, 0.08)',
        'card-hover': '0 4px 12px rgba(0, 0, 0, 0.08), 0 8px 24px rgba(0, 0, 0, 0.12)',
        'button': '0 1px 2px rgba(0, 0, 0, 0.05)',
        'button-hover': '0 4px 6px rgba(0, 0, 0, 0.1)',
      },

      // Background images
      backgroundImage: {
        'gradient-radial': 'radial-gradient(var(--tw-gradient-stops))',
        'gradient-primary': 'var(--gradient-primary)',
        'gradient-secondary': 'var(--gradient-secondary)',
        'gradient-accent': 'var(--gradient-accent)',
        'gradient-dark': 'var(--gradient-dark)',
        'gradient-light': 'var(--gradient-light)',
      },

      // Animations
      animation: {
        'fade-in': 'fade-in 0.5s ease-out',
        'fade-out': 'fade-out 0.5s ease-out',
        'slide-up': 'slide-up 0.3s ease-out',
        'slide-down': 'slide-down 0.3s ease-out',
        'scale-in': 'scale-in 0.2s ease-out',
        'shimmer': 'shimmer 2s infinite',
        'pulse-slow': 'pulse-slow 4s ease-in-out infinite',
        'pulse-slower': 'pulse-slower 6s ease-in-out infinite',
        'gradient-flow': 'gradient-flow 15s ease infinite',
        'accordion-down': 'accordion-down 0.2s ease-out',
        'accordion-up': 'accordion-up 0.2s ease-out',
      },

      keyframes: {
        'fade-in': {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        'fade-out': {
          '0%': { opacity: '1' },
          '100%': { opacity: '0' },
        },
        'slide-up': {
          '0%': { transform: 'translateY(10px)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' },
        },
        'slide-down': {
          '0%': { transform: 'translateY(-10px)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' },
        },
        'scale-in': {
          '0%': { transform: 'scale(0.95)', opacity: '0' },
          '100%': { transform: 'scale(1)', opacity: '1' },
        },
        'shimmer': {
          '0%': { transform: 'translateX(-100%)' },
          '100%': { transform: 'translateX(100%)' },
        },
        'pulse-slow': {
          '0%, 100%': { opacity: '0.4' },
          '50%': { opacity: '0.6' },
        },
        'pulse-slower': {
          '0%, 100%': { opacity: '0.3' },
          '50%': { opacity: '0.5' },
        },
        'gradient-flow': {
          '0%': { backgroundPosition: '0% 50%' },
          '50%': { backgroundPosition: '100% 50%' },
          '100%': { backgroundPosition: '0% 50%' },
        },
        'accordion-down': {
          from: { height: '0' },
          to: { height: 'var(--radix-accordion-content-height)' },
        },
        'accordion-up': {
          from: { height: 'var(--radix-accordion-content-height)' },
          to: { height: '0' },
        },
      },

      // Transition timing
      transitionDuration: {
        '0': '0ms',
        '75': '75ms',
        '100': '100ms',
        '150': '150ms',
        '200': '200ms',
        '300': '300ms',
        '500': '500ms',
        '700': '700ms',
        '1000': '1000ms',
      },

      // Transition timing functions
      transitionTimingFunction: {
        'DEFAULT': 'cubic-bezier(0.4, 0, 0.2, 1)',
        'linear': 'linear',
        'in': 'cubic-bezier(0.4, 0, 1, 1)',
        'out': 'cubic-bezier(0, 0, 0.2, 1)',
        'in-out': 'cubic-bezier(0.4, 0, 0.2, 1)',
        'bounce': 'cubic-bezier(0.68, -0.55, 0.265, 1.55)',
      },

      // Typography plugin customizations
      typography: ({ theme }: { theme: (path: string) => string }) => ({
        DEFAULT: {
          css: {
            // Base prose colors
            '--tw-prose-body': theme('colors.foreground'),
            '--tw-prose-headings': theme('colors.foreground'),
            '--tw-prose-lead': theme('colors.muted.foreground'),
            '--tw-prose-links': theme('colors.primary.DEFAULT'),
            '--tw-prose-bold': theme('colors.foreground'),
            '--tw-prose-counters': theme('colors.muted.foreground'),
            '--tw-prose-bullets': theme('colors.muted.foreground'),
            '--tw-prose-hr': theme('colors.border'),
            '--tw-prose-quotes': theme('colors.foreground'),
            '--tw-prose-quote-borders': theme('colors.border'),
            '--tw-prose-captions': theme('colors.muted.foreground'),
            '--tw-prose-code': theme('colors.foreground'),
            '--tw-prose-pre-code': theme('colors.foreground'),
            '--tw-prose-pre-bg': theme('colors.muted.DEFAULT'),
            '--tw-prose-th-borders': theme('colors.border'),
            '--tw-prose-td-borders': theme('colors.border'),

            // Dark mode colors (via .dark class)
            '--tw-prose-invert-body': 'hsl(210 40% 98%)',
            '--tw-prose-invert-headings': 'hsl(210 40% 98%)',
            '--tw-prose-invert-lead': 'hsl(215 16% 65%)',
            '--tw-prose-invert-links': theme('colors.primary.DEFAULT'),
            '--tw-prose-invert-bold': 'hsl(210 40% 98%)',
            '--tw-prose-invert-counters': 'hsl(215 16% 65%)',
            '--tw-prose-invert-bullets': 'hsl(215 16% 65%)',
            '--tw-prose-invert-hr': 'hsl(217 33% 25%)',
            '--tw-prose-invert-quotes': 'hsl(210 40% 98%)',
            '--tw-prose-invert-quote-borders': 'hsl(217 33% 25%)',
            '--tw-prose-invert-captions': 'hsl(215 16% 65%)',
            '--tw-prose-invert-code': 'hsl(210 40% 98%)',
            '--tw-prose-invert-pre-code': 'hsl(210 40% 98%)',
            '--tw-prose-invert-pre-bg': 'hsl(217 33% 17%)',
            '--tw-prose-invert-th-borders': 'hsl(217 33% 25%)',
            '--tw-prose-invert-td-borders': 'hsl(217 33% 25%)',

            // Typography settings (WCAG compliant)
            fontSize: '1rem', // 16px base
            lineHeight: '1.625', // WCAG recommended 1.5+
            maxWidth: '65ch', // NFR-003 requirement
            p: {
              marginTop: '1.25em',
              marginBottom: '1.25em',
            },

            // Headings
            h1: {
              fontSize: '2.25em', // 36px
              lineHeight: '1.2',
              letterSpacing: '-0.025em',
              marginTop: '0',
              marginBottom: '0.8888889em',
              fontWeight: '700',
            },
            h2: {
              fontSize: '1.875em', // 30px
              lineHeight: '1.25',
              letterSpacing: '-0.025em',
              marginTop: '1.5em',
              marginBottom: '0.8em',
              fontWeight: '700',
            },
            h3: {
              fontSize: '1.5em', // 24px
              lineHeight: '1.3',
              marginTop: '1.6em',
              marginBottom: '0.6em',
              fontWeight: '600',
            },
            h4: {
              fontSize: '1.25em', // 20px
              lineHeight: '1.4',
              marginTop: '1.5em',
              marginBottom: '0.5em',
              fontWeight: '600',
            },

            // Links with purple accent
            a: {
              color: 'hsl(var(--primary))',
              textDecoration: 'none',
              fontWeight: '500',
              '&:hover': {
                textDecoration: 'underline',
                textUnderlineOffset: '2px',
              },
            },

            // Code blocks
            code: {
              color: 'inherit',
              fontWeight: '400',
              fontSize: '0.875em',
              backgroundColor: 'hsl(var(--muted))',
              borderRadius: '0.25rem',
              paddingLeft: '0.25rem',
              paddingRight: '0.25rem',
              paddingTop: '0.125rem',
              paddingBottom: '0.125rem',
            },
            'code::before': {
              content: '""',
            },
            'code::after': {
              content: '""',
            },
            pre: {
              backgroundColor: 'hsl(var(--muted))',
              color: 'hsl(var(--foreground))',
              fontSize: '0.875em',
              lineHeight: '1.5',
              borderRadius: '0.5rem',
              padding: '1rem',
              overflowX: 'auto',
              // Let Shiki handle syntax highlighting
            },
            'pre code': {
              backgroundColor: 'transparent',
              borderWidth: '0',
              borderRadius: '0',
              padding: '0',
              fontWeight: 'inherit',
              color: 'inherit',
              fontSize: 'inherit',
              fontFamily: 'inherit',
              lineHeight: 'inherit',
            },

            // Blockquotes
            blockquote: {
              fontWeight: '400',
              fontStyle: 'normal',
              color: 'inherit',
              borderLeftWidth: '4px',
              borderLeftColor: 'hsl(var(--primary))',
              paddingLeft: '1em',
              marginTop: '1.6em',
              marginBottom: '1.6em',
            },

            // Lists
            ul: {
              marginTop: '1.25em',
              marginBottom: '1.25em',
              paddingLeft: '1.625em',
            },
            ol: {
              marginTop: '1.25em',
              marginBottom: '1.25em',
              paddingLeft: '1.625em',
            },
            li: {
              marginTop: '0.5em',
              marginBottom: '0.5em',
            },

            // Tables
            table: {
              width: '100%',
              tableLayout: 'auto',
              fontSize: '0.875em',
              lineHeight: '1.5',
            },
            thead: {
              borderBottomWidth: '2px',
              borderBottomColor: 'hsl(var(--border))',
            },
            'thead th': {
              color: 'hsl(var(--foreground))',
              fontWeight: '600',
              verticalAlign: 'bottom',
              paddingRight: '0.75em',
              paddingBottom: '0.75em',
              paddingLeft: '0.75em',
            },
            'tbody tr': {
              borderBottomWidth: '1px',
              borderBottomColor: 'hsl(var(--border))',
              transition: 'background-color 0.15s',
            },
            'tbody tr:hover': {
              backgroundColor: 'hsl(var(--muted) / 0.5)',
            },
            'tbody td': {
              verticalAlign: 'top',
              paddingTop: '0.75em',
              paddingRight: '0.75em',
              paddingBottom: '0.75em',
              paddingLeft: '0.75em',
            },

            // Horizontal rules
            hr: {
              borderColor: 'hsl(var(--border))',
              marginTop: '2em',
              marginBottom: '2em',
            },

            // Images
            img: {
              borderRadius: '0.5rem',
            },
          },
        },
      }),
    },
  },
  plugins: [typography],
}

export default config