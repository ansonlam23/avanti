"use client";

import Link from "next/link";
import { useSyncExternalStore } from "react";
import { hasOwnerToken } from "@/lib/my-shops";
import { cn } from "@/lib/utils";
import { Arrow } from "./arrow";

// Shown only in the browser that opened this shop (it holds the owner token).

const noop = () => () => {};

export function OwnerLink({ slug, className }: { slug: string; className?: string }) {
  const owner = useSyncExternalStore(
    noop,
    () => hasOwnerToken(slug),
    () => false,
  );
  if (!owner) return null;
  return (
    <Link href={`/shop/${slug}`} className={cn("sf-link", className)}>
      Behind the counter <Arrow />
    </Link>
  );
}
