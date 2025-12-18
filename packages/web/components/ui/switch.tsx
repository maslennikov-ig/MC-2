"use client"

import * as React from "react"
import * as SwitchPrimitives from "@radix-ui/react-switch"

import { cn } from "@/lib/utils"

const Switch = React.forwardRef<
  React.ElementRef<typeof SwitchPrimitives.Root>,
  React.ComponentPropsWithoutRef<typeof SwitchPrimitives.Root>
>(({ className, ...props }, ref) => (
  <SwitchPrimitives.Root
    className={cn(
      "peer inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full border-2 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-600 focus-visible:ring-offset-2 focus-visible:ring-offset-white disabled:cursor-not-allowed disabled:opacity-50",
      "data-[state=checked]:border-purple-600 data-[state=checked]:bg-purple-600",
      "data-[state=unchecked]:border-gray-300 data-[state=unchecked]:bg-gray-200",
      "dark:border-gray-600 dark:focus-visible:ring-purple-500 dark:focus-visible:ring-offset-gray-950",
      "dark:data-[state=checked]:border-purple-500 dark:data-[state=checked]:bg-purple-500",
      "dark:data-[state=unchecked]:border-gray-600 dark:data-[state=unchecked]:bg-gray-700",
      className
    )}
    {...props}
    ref={ref}
  >
    <SwitchPrimitives.Thumb
      className={cn(
        "pointer-events-none block h-5 w-5 rounded-full bg-white shadow-md ring-0 transition-transform",
        "data-[state=checked]:translate-x-5 data-[state=unchecked]:translate-x-0",
        "dark:bg-gray-100"
      )}
    />
  </SwitchPrimitives.Root>
))
Switch.displayName = SwitchPrimitives.Root.displayName

export { Switch }
