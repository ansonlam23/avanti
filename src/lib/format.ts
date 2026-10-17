// Small, shared formatting helpers (safe on server and client).

export const SHOP_TIMEZONE = "America/Los_Angeles";

export function formatCents(cents: number | null | undefined, opts: { free?: string } = {}): string {
  if (cents === null || cents === undefined) return "—";
  if (cents === 0 && opts.free) return opts.free;
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);
}

/** "$4.50" | "$18" — drop .00 for chalk menus and price tags. */
export function formatPriceShort(cents: number | null | undefined): string {
  if (cents === null || cents === undefined) return "?";
  return cents % 100 === 0 ? `$${cents / 100}` : formatCents(cents);
}

/** "08:00" → "8 AM", "18:30" → "6:30 PM" */
export function formatClock(hhmm: string): string {
  const [h, m] = hhmm.split(":").map(Number);
  const suffix = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return m ? `${h12}:${String(m).padStart(2, "0")} ${suffix}` : `${h12} ${suffix}`;
}

export function formatTime(iso: string | null | undefined): string {
  if (!iso) return "";
  return new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
    timeZone: SHOP_TIMEZONE,
  }).format(new Date(iso));
}

export function slugify(name: string): string {
  return (
    name
      .normalize("NFKD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/['’]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40)
      .replace(/-+$/, "") || "shop"
  );
}
