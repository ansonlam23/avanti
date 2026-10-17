import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { cache } from "react";
import { Storefront } from "@/components/storefront/storefront";
import { getShopBySlug, listItems } from "@/lib/db/shops";
import { hasSupabase } from "@/lib/env";

export const dynamic = "force-dynamic";

// One DB read per request, shared by generateMetadata and the page.
const loadShop = cache(async (slug: string) => (hasSupabase() ? getShopBySlug(slug) : null));

export async function generateMetadata(props: PageProps<"/s/[slug]">): Promise<Metadata> {
  const { slug } = await props.params;
  const shop = await loadShop(slug).catch(() => null);
  if (!shop) return { title: "Shop not found", robots: { index: false } };
  return {
    title: shop.name,
    description: shop.tagline ?? `${shop.name} is open on Open Sign: order ahead, pick up, pay at the counter.`,
    alternates: { types: { "application/json": `/s/${shop.slug}/agent.json` } },
    // visitor sandboxes are private (reachable by link only); never index them
    ...(shop.listed ? {} : { robots: { index: false, follow: false } }),
  };
}

export default async function StorefrontPage(props: PageProps<"/s/[slug]">) {
  const { slug } = await props.params;
  const shop = await loadShop(slug);
  if (!shop) notFound();
  const items = await listItems(shop.id);
  return <Storefront shop={shop} items={items} />;
}
