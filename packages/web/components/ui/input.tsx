import * as React from "react"
import { cn } from "@/lib/utils"
import { cva, type VariantProps } from "class-variance-authority"

const inputVariants = cva(
  "flex h-9 w-full rounded-md border bg-transparent px-3 py-1 text-base shadow-sm transition-all duration-200 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
  {
    variants: {
      variant: {
        default: "border-input focus-visible:ring-1 focus-visible:ring-ring",
        error: "border-red-500 focus-visible:ring-1 focus-visible:ring-red-500 bg-red-50/50 dark:bg-red-950/20",
        success: "border-green-500 focus-visible:ring-1 focus-visible:ring-green-500 bg-green-50/50 dark:bg-green-950/20",
        warning: "border-yellow-500 focus-visible:ring-1 focus-visible:ring-yellow-500 bg-yellow-50/50 dark:bg-yellow-950/20"
      }
    },
    defaultVariants: {
      variant: "default",
    }
  }
)

export interface InputProps
  extends React.InputHTMLAttributes<HTMLInputElement>,
    VariantProps<typeof inputVariants> {
  error?: boolean
  success?: boolean
}

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, variant, error, success, ...props }, ref) => {
    // Determine variant based on props
    const computedVariant = error ? "error" : success ? "success" : variant || "default"
    
    return (
      <input
        type={type}
        className={cn(inputVariants({ variant: computedVariant }), className)}
        ref={ref}
        aria-invalid={error ? "true" : undefined}
        {...props}
      />
    )
  }
)
Input.displayName = "Input"

export { Input }