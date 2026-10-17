import { NotFoundView } from "@/components/landing/not-found-view";

// Unknown shop: the printer never printed this shop's OPEN sign.

export default function ShopNotFound() {
  return (
    <NotFoundView
      eyebrow="No such shop"
      title="No shop here."
      text="This link doesn't match a shop. It may have a typo, or the shop isn't open yet."
      primary={{ href: "/open", label: "Open a shop" }}
      secondary={{ href: "/ask", label: "Shop with the AI" }}
      ghost="OPEN"
    />
  );
}
