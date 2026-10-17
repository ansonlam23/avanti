"use client";

import { Switch as SwitchPrimitive } from "radix-ui";
import { cn } from "@/lib/utils";

/**
 * A square ink switch: an ink outline with a square knob; when it's on, the
 * box fills with the brand teal and the knob turns paper. The visible box is
 * 52×28; a pseudo-element widens the tap target to 64×48.
 * Shared by /open (Take AI orders) and the counter (Sold out).
 */
export function InkToggle({
  checked,
  onCheckedChange,
  disabled,
  id,
  className,
  ...aria
}: {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  disabled?: boolean;
  id?: string;
  className?: string;
  "aria-label"?: string;
  "aria-describedby"?: string;
}) {
  return (
    <SwitchPrimitive.Root
      id={id}
      checked={checked}
      disabled={disabled}
      onCheckedChange={onCheckedChange}
      {...aria}
      className={cn(
        "relative inline-flex h-7 w-[52px] shrink-0 items-center border-[1.5px] border-ink bg-paper px-[3px]",
        "transition-[background-color,border-color] duration-300 ease-[cubic-bezier(.22,1,.36,1)]",
        "before:absolute before:-inset-x-1.5 before:-inset-y-2.5 before:content-['']",
        "data-[state=checked]:border-carbon data-[state=checked]:bg-carbon",
        "hover:border-carbon disabled:cursor-not-allowed disabled:opacity-45",
        className,
      )}
    >
      <SwitchPrimitive.Thumb
        className={cn(
          "block size-[18px] bg-ink transition-[transform,background-color] duration-300 ease-[cubic-bezier(.22,1,.36,1)]",
          "data-[state=checked]:translate-x-[25px] data-[state=checked]:bg-paper",
        )}
      />
    </SwitchPrimitive.Root>
  );
}
