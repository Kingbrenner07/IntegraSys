import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cn } from "@/lib/utils"

const Label = React.forwardRef<React.ElementRef<"label">, React.ComponentPropsWithoutRef<"label"> & { asChild?: boolean }>(
  ({ className, asChild, ...props }, ref) => {
    const Comp = asChild ? Slot : "label"
    return (
      <Comp
        ref={ref}
        className={cn("text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70", className)}
        {...props}
      />
    )
  }
)
Label.displayName = "Label"

export { Label }
