"use client";

import { MotionConfig } from "motion/react";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <MotionConfig reducedMotion="user">
      <TooltipProvider delayDuration={200}>
        {children}
        <Toaster
          theme="light"
          position="top-center"
          toastOptions={{
            // Toasts are small paper slips: square, the ink hairline, a faint shadow.
            classNames: {
              toast: "!rounded-none !border !border-ink/16 !bg-paper !text-ink !shadow-[var(--shadow-slip)] !font-sans",
              title: "!text-[16px] !font-semibold",
              description: "!text-[15px] !text-ink-muted",
            },
          }}
        />
      </TooltipProvider>
    </MotionConfig>
  );
}
