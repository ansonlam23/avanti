import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "cn"
import { Slot } from "radix-ui"

// avanti · ink: square, Marcellus labels. default = the solid brand-teal
// primary; outline = the ink-outline secondary; link = a teal text link.
const buttonVariants = cva(
  "group/button inline-flex shrink-0 items-center justify-center gap-2 border border-transparent font-display text-[17px] leading-none tracking-[0.02em] whitespace-nowrap transition-[background-color,border-color,color,opacity,transform] duration-200 select-none active:not-aria-[haspopup]:translate-y-px disabled:pointer-events-none disabled:opacity-45 aria-invalid:border-destructive [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg]:transition-transform [&_svg]:duration-300 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default: "border-primary bg-primary text-primary-foreground hover:border-[#124b56] hover:bg-[#124b56]",
        outline: "border-ink bg-transparent text-ink hover:bg-ink/[0.05] aria-expanded:bg-ink/[0.05]",
        secondary: "border-pad-line bg-pad text-ink hover:bg-[#d5dfda] aria-expanded:bg-[#d5dfda]",
        ghost: "text-ink hover:bg-ink/[0.05] aria-expanded:bg-ink/[0.05]",
        destructive: "border-stamp-deep bg-transparent text-stamp-deep hover:bg-stamp/[0.06]",
        link: "font-sans text-[16px] tracking-normal text-carbon underline decoration-transparent decoration-1 underline-offset-[5px] hover:decoration-current hover:[&_svg]:translate-x-1",
      },
      size: {
        default: "h-11 px-5 has-data-[icon=inline-end]:pr-4 has-data-[icon=inline-start]:pl-4",
        xs: "h-8 gap-1.5 px-2.5 text-[14px] [&_svg:not([class*='size-'])]:size-3.5",
        sm: "h-9 gap-1.5 px-3.5 text-[15px] [&_svg:not([class*='size-'])]:size-4",
        lg: "h-14 gap-3 px-6 text-[20px] has-data-[icon=inline-end]:pr-5 has-data-[icon=inline-start]:pl-5",
        icon: "size-11",
        "icon-xs": "size-8 [&_svg:not([class*='size-'])]:size-3.5",
        "icon-sm": "size-9",
        "icon-lg": "size-12",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

function Button({
  className,
  variant = "default",
  size = "default",
  asChild = false,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean
  }) {
  const Comp = asChild ? Slot.Root : "button"

  return (
    <Comp
      data-slot="button"
      data-variant={variant}
      data-size={size}
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }
