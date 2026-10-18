import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import QRCode from "qrcode";
import { cache } from "react";
import { WindowSign } from "@/components/sign/window-sign";
import { getShopBySlug } from "@/lib/db/shops";
import { hasSupabase } from "@/lib/env";

export const dynamic = "force-dynamic";

// The shop's printable window sign: "AI orders welcome" + a QR to its public page.
// The owner opens it from the counter ("Print window sign →") and prints it.
const loadShop = cache(async (slug: string) => (hasSupabase() ? getShopBySlug(slug) : null));

export async function generateMetadata(props: PageProps<"/s/[slug]/sign">): Promise<Metadata> {
  const { slug } = await props.params;
  const shop = await loadShop(slug).catch(() => null);
  return { title: shop ? `Window sign · ${shop.name}` : "Shop not found", robots: { index: false, follow: false } };
}

export default async function WindowSignPage(props: PageProps<"/s/[slug]/sign">) {
  const { slug } = await props.params;
  const shop = await loadShop(slug);
  if (!shop) notFound();

  // The QR points at this deployment, whichever host it runs on.
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "open-sign-three.vercel.app";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  const shopUrl = `${proto}://${host}/s/${shop.slug}`;
  const qrSvg = await QRCode.toString(shopUrl, {
    type: "svg",
    margin: 0,
    errorCorrectionLevel: "M",
    color: { dark: "#163a42ff", light: "#00000000" },
  });

  return <WindowSign shopName={shop.name} shopUrl={shopUrl} qrSvg={qrSvg} isDemo={Boolean(shop.is_demo)} />;
}
