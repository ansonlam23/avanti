"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { useSyncExternalStore } from "react";
import { hasOwnerToken } from "@/lib/my-shops";
import { cn } from "@/lib/utils";

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
    <Link href={`/shop/${slug}`} className={cn("btn-ink mt-6 w-full justify-between!", className)}>
      Behind the counter <ArrowRight className="size-6" aria-hidden />
    </Link>
  );
}
