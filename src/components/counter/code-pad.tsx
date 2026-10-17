"use client";

import { useEffect, useRef, useState } from "react";
import { motion, useAnimate } from "motion/react";
import { Delete, X } from "lucide-react";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

/**
 * The 4-digit pickup code pad: a paper slip with four square boxes (Red Hat
 * Mono digits) and flat square keys. Submits when 4 digits are in; shakes and
 * clears on a wrong code.
 */
export function CodePad({
  open,
  onOpenChange,
  title,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  onSubmit: (code: string) => Promise<boolean>;
}) {
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [scope, animate] = useAnimate();

  useEffect(() => {
    // Fresh pad every time it opens.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (open) setCode("");
  }, [open]);

  async function press(d: string) {
    if (busy || code.length >= 4) return;
    const next = code + d;
    setCode(next);
    if (next.length === 4) {
      setBusy(true);
      const ok = await onSubmit(next);
      setBusy(false);
      if (!ok) {
        await animate(scope.current, { x: [0, -10, 8, -6, 4, 0] }, { duration: 0.4 });
        setCode("");
      }
    }
  }

  // On a laptop the owner can just type the four digits (Backspace deletes).
  const pressRef = useRef(press);
  useEffect(() => {
    pressRef.current = press;
  });
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (/^[0-9]$/.test(e.key)) {
        e.preventDefault();
        void pressRef.current(e.key);
      } else if (e.key === "Backspace") {
        e.preventDefault();
        setCode((c) => c.slice(0, -1));
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        className="paper max-w-[360px] gap-0 rounded-none p-7 shadow-[var(--shadow-lift)] ring-0 sm:max-w-[360px]"
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <DialogTitle className="font-display text-[32px] font-normal leading-none">Pickup code</DialogTitle>
            <DialogDescription className="mt-3 text-[16px] leading-snug text-ink-muted">
              Ask for their 4 digits.
              <span className="mt-1 block text-ink">{title}</span>
            </DialogDescription>
          </div>
          <DialogClose
            className="-mr-3 -mt-3 grid size-11 shrink-0 place-items-center text-ink-muted transition-colors hover:bg-ink/[0.06] hover:text-ink"
            aria-label="Close"
          >
            <X className="size-5" strokeWidth={1.5} aria-hidden />
          </DialogClose>
        </div>

        <div ref={scope} className="my-7 flex justify-center gap-2.5" aria-live="polite" aria-label={`${code.length} of 4 digits entered`}>
          {[0, 1, 2, 3].map((i) => (
            <motion.span
              key={i}
              animate={{ scale: code[i] ? [1.06, 1] : 1 }}
              transition={{ duration: 0.2 }}
              className={cn(
                "grid h-[72px] w-[60px] place-items-center border bg-paper transition-colors duration-200",
                code[i] ? "border-ink" : i === code.length ? "border-carbon" : "border-ink/20",
              )}
            >
              <span className={cn("font-mono text-[36px] font-medium leading-none", code[i] ? "text-ink" : "text-ink-faint")}>{code[i] ?? "·"}</span>
            </motion.span>
          ))}
        </div>

        <div className="grid grid-cols-3 gap-2">
          {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((d) => (
            <PadKey key={d} onClick={() => press(d)} disabled={busy}>
              {d}
            </PadKey>
          ))}
          <span />
          <PadKey onClick={() => press("0")} disabled={busy}>
            0
          </PadKey>
          <PadKey onClick={() => setCode((c) => c.slice(0, -1))} disabled={busy || code.length === 0} aria-label="Delete last digit">
            <Delete className="size-6" strokeWidth={1.5} aria-hidden />
          </PadKey>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function PadKey(props: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      {...props}
      className="flex h-16 items-center justify-center border border-ink/15 bg-paper font-mono text-[26px] font-medium text-ink transition-colors duration-200 hover:border-ink/35 hover:bg-highlight/40 active:bg-highlight disabled:opacity-45"
    />
  );
}
