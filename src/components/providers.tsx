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
            // Toasts are little printed slips: paper, ink, square corners.
            classNames: {
              toast: "!rounded-[3px] !border-0 !bg-paper !text-ink !shadow-[var(--shadow-lift)] !font-sans",
              title: "!text-[15px] !font-bold",
              description: "!text-[14px] !text-ink-muted",
            },
          }}
        />
      </TooltipProvider>
    </MotionConfig>
  );
}
