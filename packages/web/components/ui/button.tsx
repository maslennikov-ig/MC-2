import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap text-sm font-medium disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:icon-md shrink-0 [&_svg]:shrink-0 btn-interactive focus-ring gpu-accelerated",
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
        default: "h-10 px-4 py-2 md:h-10 min-h-[44px] md:min-h-[40px]",
        sm: "h-9 px-3 min-h-[44px] md:min-h-[36px] rounded-md",
        lg: "h-11 px-8 min-h-[44px] rounded-xl",
        icon: "h-10 w-10 min-h-[44px] min-w-[44px] md:min-h-[40px] md:min-w-[40px] rounded-lg",
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