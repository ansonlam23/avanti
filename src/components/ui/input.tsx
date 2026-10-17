import * as React from "react"
import { cn } from "cn"

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        "h-12 w-full min-w-0 border border-input bg-paper px-3.5 py-1 font-sans text-[16px] text-ink transition-colors file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-[15px] file:font-medium file:text-ink placeholder:text-ink-muted hover:border-ink/55 focus-visible:border-carbon focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-carbon disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive",
        className
      )}
      {...props}
    />
  )
}

export { Input }
