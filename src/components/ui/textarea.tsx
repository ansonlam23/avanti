import * as React from "react"
import { cn } from "cn"

function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        "flex field-sizing-content min-h-24 w-full border border-input bg-paper px-3.5 py-3 font-sans text-[16px] leading-relaxed text-ink transition-colors placeholder:text-ink-muted hover:border-ink/55 focus-visible:border-carbon focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-carbon disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive",
        className
      )}
      {...props}
    />
  )
}

export { Textarea }
