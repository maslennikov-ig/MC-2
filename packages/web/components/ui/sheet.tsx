'use client'

import * as React from 'react'
import * as SheetPrimitive from '@radix-ui/react-dialog'
import { cva, type VariantProps } from 'class-variance-authority'
import { X } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { cn } from '@/lib/utils'

// Wrap Sheet with AnimatePresence for exit animations
const SheetRoot = SheetPrimitive.Root

const Sheet = ({
  children,
  open,
  onOpenChange,
  ...props
}: React.ComponentPropsWithoutRef<typeof SheetPrimitive.Root>) => (
  <SheetRoot open={open} onOpenChange={onOpenChange} {...props}>
    <AnimatePresence mode="wait">{open && children}</AnimatePresence>
  </SheetRoot>
)

const SheetTrigger = SheetPrimitive.Trigger

const SheetClose = SheetPrimitive.Close

const SheetPortal = SheetPrimitive.Portal

const SheetOverlay = React.forwardRef<
  React.ElementRef<typeof SheetPrimitive.Overlay>,
  React.ComponentPropsWithoutRef<typeof SheetPrimitive.Overlay>
>(({ className, ...props }, ref) => {
  // Filter out props that conflict with motion.div (Radix overlay includes drag handlers that clash with framer-motion)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Required: `as any` makes motionSafeProps lose Radix types so it can spread onto motion.div
  const { onDrag: _onDrag, onDragStart: _onDragStart, onDragEnd, ...motionSafeProps } = props as any

  return (
    <SheetPrimitive.Overlay asChild>
      <motion.div
        ref={ref}
        data-sheet-overlay=""
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- framer-motion 12.x Transition type mismatch with Radix component context
        transition={{ duration: 0.2, ease: 'easeInOut' } as any}
        className={cn('fixed inset-0 z-50 bg-black/80', className)}
        {...motionSafeProps}
      />
    </SheetPrimitive.Overlay>
  )
})
SheetOverlay.displayName = SheetPrimitive.Overlay.displayName

const sheetVariants = cva('fixed z-50 gap-4 bg-white dark:bg-slate-900 p-6 shadow-lg', {
  variants: {
    side: {
      top: 'inset-x-0 top-0 border-b',
      bottom: 'inset-x-0 bottom-0 border-t',
      left: 'inset-y-0 left-0 h-full w-3/4 border-r',
      right: 'inset-y-0 right-0 h-full w-3/4 border-l',
    },
  },
  defaultVariants: {
    side: 'right',
  },
})

// Framer Motion variants for slide animations
const getMotionVariants = (side: 'top' | 'bottom' | 'left' | 'right') => {
  const variants = {
    top: {
      hidden: { y: '-100%', opacity: 0 },
      visible: {
        y: 0,
        opacity: 1,
        transition: {
          type: 'spring' as const,
          damping: 25,
          stiffness: 300,
        },
      },
      exit: {
        y: '-100%',
        opacity: 0,
        transition: { duration: 0.2 },
      },
    },
    bottom: {
      hidden: { y: '100%', opacity: 0 },
      visible: {
        y: 0,
        opacity: 1,
        transition: {
          type: 'spring' as const,
          damping: 25,
          stiffness: 300,
        },
      },
      exit: {
        y: '100%',
        opacity: 0,
        transition: { duration: 0.2 },
      },
    },
    left: {
      hidden: { x: '-100%', opacity: 0 },
      visible: {
        x: 0,
        opacity: 1,
        transition: {
          type: 'spring' as const,
          damping: 25,
          stiffness: 300,
        },
      },
      exit: {
        x: '-100%',
        opacity: 0,
        transition: { duration: 0.2 },
      },
    },
    right: {
      hidden: { x: '100%', opacity: 0 },
      visible: {
        x: 0,
        opacity: 1,
        transition: {
          type: 'spring' as const,
          damping: 25,
          stiffness: 300,
        },
      },
      exit: {
        x: '100%',
        opacity: 0,
        transition: { duration: 0.2 },
      },
    },
  }
  return variants[side]
}

interface SheetContentProps
  extends React.ComponentPropsWithoutRef<typeof SheetPrimitive.Content>,
    VariantProps<typeof sheetVariants> {
  /** Hide the built-in close button (use when providing custom close button) */
  hideCloseButton?: boolean
  /** Container element to portal into (for fullscreen support) */
  container?: HTMLElement | null
}

const SheetContent = React.forwardRef<
  React.ElementRef<typeof SheetPrimitive.Content>,
  SheetContentProps
>(({ side = 'right', className, children, hideCloseButton = false, container, ...props }, ref) => {
  const actualSide = side || 'right'
  const motionVariants = getMotionVariants(actualSide)

  return (
    <SheetPortal container={container}>
      <SheetOverlay />
      <SheetPrimitive.Content
        ref={ref}
        aria-describedby={undefined}
        className={cn(sheetVariants({ side: actualSide }), className)}
        asChild
        {...props}
      >
        {/* eslint-disable-next-line @typescript-eslint/no-explicit-any -- framer-motion 12.x Variants type mismatch */}
        <motion.div initial="hidden" animate="visible" exit="exit" variants={motionVariants as any}>
          {!hideCloseButton && (
            <SheetPrimitive.Close className="ring-offset-background focus:ring-ring data-[state=open]:bg-secondary absolute top-4 right-4 rounded-sm opacity-70 transition-opacity hover:opacity-100 focus:ring-2 focus:ring-offset-2 focus:outline-none disabled:pointer-events-none">
              <X className="h-4 w-4" />
              <span className="sr-only">Close</span>
            </SheetPrimitive.Close>
          )}
          {children}
        </motion.div>
      </SheetPrimitive.Content>
    </SheetPortal>
  )
})
SheetContent.displayName = SheetPrimitive.Content.displayName

const SheetHeader = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn('flex flex-col space-y-2 text-center sm:text-left', className)} {...props} />
)
SheetHeader.displayName = 'SheetHeader'

const SheetFooter = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn('flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2', className)}
    {...props}
  />
)
SheetFooter.displayName = 'SheetFooter'

const SheetTitle = React.forwardRef<
  React.ElementRef<typeof SheetPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof SheetPrimitive.Title>
>(({ className, ...props }, ref) => (
  <SheetPrimitive.Title
    ref={ref}
    className={cn('text-foreground text-lg font-semibold', className)}
    {...props}
  />
))
SheetTitle.displayName = SheetPrimitive.Title.displayName

const SheetDescription = React.forwardRef<
  React.ElementRef<typeof SheetPrimitive.Description>,
  React.ComponentPropsWithoutRef<typeof SheetPrimitive.Description>
>(({ className, ...props }, ref) => (
  <SheetPrimitive.Description
    ref={ref}
    className={cn('text-muted-foreground text-sm', className)}
    {...props}
  />
))
SheetDescription.displayName = SheetPrimitive.Description.displayName

export {
  Sheet,
  SheetPortal,
  SheetOverlay,
  SheetTrigger,
  SheetClose,
  SheetContent,
  SheetHeader,
  SheetFooter,
  SheetTitle,
  SheetDescription,
}
