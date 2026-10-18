"use client";

import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { formatTime } from "@/lib/format";
import { shortShop } from "@/lib/orders/progress";
import { cn } from "@/lib/utils";
import { useSavedPickups, type SavedPickup } from "./saved-pickups";

/**
 * "Your pickups": the tickets this phone holds (CONTRACTS §18). In /ask a tap
 * opens the ticket over the chat (`onOpen`); elsewhere it links to /ticket/[id].
 */
export function PickupsStrip({
  exclude,
  onOpen,
  title = "Your pickups",
  className,
}: {
  exclude?: string[];
  onOpen?: (id: string) => void;
  title?: string;
  className?: string;
}) {
  const list = useSavedPickups().filter((p) => !exclude?.includes(p.id));
  if (list.length === 0) return null;
  return (
    <section aria-label={title} className={cn("w-full", className)}>
      <p className="text-[13px] font-semibold uppercase leading-tight tracking-[0.13em] text-ink-muted">{title}</p>
      <ul className="mt-3 space-y-2.5">
        {list.map((p) => (
          <li key={p.id}>
            <Row pickup={p} onOpen={onOpen} />
          </li>
        ))}
      </ul>
    </section>
  );
}

function Row({ pickup, onOpen }: { pickup: SavedPickup; onOpen?: (id: string) => void }) {
  const when = pickup.pickup_time ? formatTime(pickup.pickup_time) : "today";
  const body = (
    <>
      <span className="min-w-0 flex-1">
        <span className="block truncate font-display text-[20px] leading-tight text-ink">{shortShop(pickup.shop)}</span>
        <span className="mt-1 block truncate text-[15px] text-ink-muted lg:text-[16px]">
          {pickup.qty} × {pickup.item} · {pickup.status === "paid" ? "picked up" : `pickup ${when}`}
        </span>
      </span>
      <ArrowRight aria-hidden className="size-5 shrink-0 text-carbon" strokeWidth={1.5} />
    </>
  );
  const shell =
    "paper flex min-h-16 w-full items-center gap-4 px-5 py-3 text-left transition-colors duration-300 hover:bg-highlight/40";
  return onOpen ? (
    <button type="button" onClick={() => onOpen(pickup.id)} className={shell} aria-label={`Open your ticket for ${pickup.item} at ${pickup.shop}`}>
      {body}
    </button>
  ) : (
    <Link href={`/ticket/${pickup.id}`} className={shell} aria-label={`Open your ticket for ${pickup.item} at ${pickup.shop}`}>
      {body}
    </Link>
  );
}
