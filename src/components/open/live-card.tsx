"use client";

import { Check, Copy } from "lucide-react";
import QRCode from "qrcode";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { AiReadyBadge } from "@/components/storefront/ai-ready-badge";

// The shop's slip: its public link + a QR to it + AI-ready, on rice paper.

export function LiveCard({
  shopName,
  publicUrl,
  agentUrl,
  privateShop,
  className,
}: {
  shopName: string;
  publicUrl: string;
  agentUrl: string;
  /** Visitor sandboxes are reachable by link only (CONTRACTS §11). */
  privateShop?: boolean;
  className?: string;
}) {
  const [svg, setSvg] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let alive = true;
    QRCode.toString(publicUrl, {
      type: "svg",
      margin: 0,
      errorCorrectionLevel: "M",
      color: { dark: "#163a42ff", light: "#00000000" },
    })
      .then((s) => alive && setSvg(s))
      .catch(() => alive && setSvg(null));
    return () => {
      alive = false;
    };
  }, [publicUrl]);

  const display = publicUrl.replace(/^https?:\/\//, "");

  return (
    <article className={cn("slip-drop", className)}>
      <div className="paper px-6 pb-6 pt-6 lg:px-7 lg:pt-7">
        {/* phone: the name beside the QR, the AI-ready label on its own line under both;
            laptop (a wider slip): name over label, the QR beside the pair */}
        <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-5 gap-y-4 [grid-template-areas:'name_qr'_'badge_badge'] lg:[grid-template-areas:'name_qr'_'badge_qr']">
          <h3 className="font-display text-[28px] leading-[1.1] [grid-area:name] [overflow-wrap:anywhere]">{shopName}</h3>
          <AiReadyBadge href={agentUrl} surface="paper" className="justify-self-start [grid-area:badge]" />
          <div className="size-[88px] shrink-0 [grid-area:qr]">
            {svg ? (
              <span
                role="img"
                aria-label={`QR code for ${display}`}
                className="block size-full [&_svg]:size-full"
                dangerouslySetInnerHTML={{ __html: svg }}
              />
            ) : null}
          </div>
        </div>

        <button
          type="button"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(publicUrl);
              setCopied(true);
              setTimeout(() => setCopied(false), 1600);
            } catch {
              // clipboard blocked: the link is still on screen to copy by hand
            }
          }}
          className="mt-5 flex min-h-12 w-full items-center gap-3 border border-[rgb(22_58_66/0.34)] bg-paper px-3.5 py-2 text-left text-[15px] leading-snug transition-colors hover:border-[rgb(22_58_66/0.6)] lg:text-[16px]"
          aria-label="Copy your shop link"
        >
          <span className="min-w-0 flex-1 [overflow-wrap:anywhere]">
            {/* prefer breaking after a slash: "open-sign.app/s/ mais-bakery" */}
            {display.split("/").map((part, i, all) => (
              <span key={i}>
                {part}
                {i < all.length - 1 ? (
                  <>
                    /<wbr />
                  </>
                ) : null}
              </span>
            ))}
          </span>
          {copied ? <Check className="size-5 shrink-0 text-carbon" aria-hidden /> : <Copy className="size-5 shrink-0 text-ink-muted" strokeWidth={1.5} aria-hidden />}
        </button>
        {privateShop ? <p className="mt-3 text-[15px] leading-snug text-ink-muted lg:text-[16px]">Private: only people with the link can see it.</p> : null}
      </div>
    </article>
  );
}
