import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "cn"
import { Slot } from "radix-ui"

const badgeVariants = cva(
  "group/badge inline-flex h-7 w-fit shrink-0 items-center justify-center gap-1.5 overflow-hidden border border-transparent px-2.5 font-sans text-[13px] font-semibold uppercase tracking-[0.12em] whitespace-nowrap transition-colors has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2 aria-invalid:border-destructive [&>svg]:pointer-events-none [&>svg]:size-3.5!",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground [a]:hover:bg-[#124b56]",
        secondary:
          "bg-pad text-ink [a]:hover:bg-[#d5dfda]",
        destructive:
          "border-stamp-deep text-stamp-deep [a]:hover:bg-stamp/[0.06]",
        outline:
          "border-ink/40 text-ink [a]:hover:border-ink",
        ghost:
          "text-ink-muted hover:bg-ink/[0.05] hover:text-ink",
        link: "text-carbon underline-offset-4 hover:underline",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

function Badge({
  className,
  variant = "default",
  asChild = false,
  ...props
}: React.ComponentProps<"span"> &
  VariantProps<typeof badgeVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot.Root : "span"

  return (
    <Comp
      data-slot="badge"
      data-variant={variant}
      className={cn(badgeVariants({ variant }), className)}
      {...props}
    />
  )
}

export { Badge, badgeVariants }
