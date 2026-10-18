"use client";

import { Check, Copy } from "lucide-react";
import { useRef, useState } from "react";

/** A link to paste somewhere else, with a copy key (if the clipboard is refused, the text is selected instead). */
export function CopyLink({ url, label }: { url: string; label: string }) {
  const text = useRef<HTMLElement>(null);
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      if (text.current) window.getSelection()?.selectAllChildren(text.current);
    }
  };
  return (
    <div className="flex min-h-14 w-full max-w-[680px] items-stretch border border-ink/25 bg-paper">
      <code
        ref={text}
        aria-label={label}
        className="flex min-w-0 flex-1 items-center px-4 py-3 font-mono text-[16px] leading-snug text-ink [overflow-wrap:anywhere] lg:text-[17px]"
      >
        {url}
      </code>
      <button
        type="button"
        onClick={() => void copy()}
        className="flex shrink-0 items-center gap-2 bg-carbon px-5 text-[16px] text-paper transition-colors duration-200 hover:bg-[#124b56] lg:text-[17px]"
      >
        {copied ? <Check className="size-[18px]" strokeWidth={1.75} aria-hidden /> : <Copy className="size-[18px]" strokeWidth={1.75} aria-hidden />}
        {copied ? "Copied" : "Copy"}
      </button>
    </div>
  );
}
