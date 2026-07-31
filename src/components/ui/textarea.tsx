import * as React from "react"

import { cn } from "@/lib/utils"

function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        // text-foreground is required, not decorative — see the matching
        // comment in input.tsx: --color-base collides with the text-base
        // utility name, so bare `text-base` would render typed text in the
        // page-background colour instead of setting font size.
        "flex field-sizing-content min-h-16 w-full rounded-2xl border border-input bg-transparent px-4 py-2 text-base text-foreground shadow-xs transition-[color,box-shadow] outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-destructive/20 md:text-sm dark:bg-input/30 dark:aria-invalid:ring-destructive/40",
        className
      )}
      {...props}
    />
  )
}

export { Textarea }
