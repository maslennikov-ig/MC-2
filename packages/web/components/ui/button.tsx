import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap font-medium disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none shrink-0 [&_svg]:shrink-0 btn-interactive focus-ring gpu-accelerated",
  {
    variants: {
      variant: {
        default:
          "bg-primary text-primary-foreground elevation-2 hover:bg-primary/90 rounded-lg",
        destructive:
          "bg-destructive text-destructive-foreground elevation-2 hover:bg-destructive/90 rounded-lg",
        outline:
          "border border-input bg-background hover:bg-accent hover:text-accent-foreground rounded-lg",
        secondary:
          "bg-secondary text-secondary-foreground elevation-1 hover:bg-secondary/80 rounded-lg",
        ghost: "hover:bg-accent hover:text-accent-foreground rounded-lg",
        link: "text-primary underline-offset-4 hover:underline rounded-none",
      },
      size: {
        // Compact sizes - NO min-height (for dense UIs like toolbars)
        xs: "h-6 min-h-0 px-2 text-[10px] gap-1 rounded-md [&_svg]:w-3 [&_svg]:h-3",
        compact: "h-10 min-h-0 px-4 text-sm gap-2 rounded-lg [&_svg]:w-4 [&_svg]:h-4",

        // Touch-friendly sizes - WITH min-height for accessibility
        sm: "h-8 px-3 text-xs gap-2 min-h-[44px] md:min-h-[32px] rounded-md [&_svg]:w-3.5 [&_svg]:h-3.5",
        default: "h-10 px-4 text-sm gap-2 min-h-[44px] md:min-h-[40px] rounded-lg [&_svg]:w-4 [&_svg]:h-4",
        lg: "h-11 px-6 text-base gap-2 min-h-[44px] rounded-xl [&_svg]:w-5 [&_svg]:h-5",

        // Icon sizes - compact
        "icon-xs": "h-5 w-5 min-h-0 min-w-0 rounded-md [&_svg]:w-2.5 [&_svg]:h-2.5",
        "icon-sm": "h-7 w-7 min-h-0 min-w-0 rounded-md [&_svg]:w-3.5 [&_svg]:h-3.5",
        // Icon sizes - touch-friendly
        icon: "h-10 w-10 min-h-[44px] min-w-[44px] md:min-h-[40px] md:min-w-[40px] rounded-lg [&_svg]:w-4 [&_svg]:h-4",
        "icon-lg": "h-11 w-11 min-h-[44px] min-w-[44px] rounded-xl [&_svg]:w-5 [&_svg]:h-5",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button"
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    )
  }
)
Button.displayName = "Button"

export { Button, buttonVariants }