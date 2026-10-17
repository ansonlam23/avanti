// Sample data for the design lab ONLY (never shown in the product): lets the
// real views be checked and filmed without a database. Labelled "lab" where
// it renders.
import type { Dashboard, DashboardOrder } from "@/lib/orders/dashboard";
import type { Item, Shop } from "@/lib/types";

const T0 = "2026-10-17T00:30:00.000Z"; // 5:30 PM in Seattle

export const LAB_SHOP: Shop = {
  id: "lab-shop",
  slug: "mais-bakery",
  name: "Mai's Bakery",
  tagline: "Banh mi, croissants and cakes on the Ave.",
  owner_language: "en",
  photo_url: null,
  open: true,
  pickup_window: { start: "08:00", end: "18:00" },
  rules: { max_per_order: 2, accept_ai_orders: true },
  is_demo: true,
  listed: true,
  location_label: "University Way NE, Seattle",
  lat: 47.66,
  lng: -122.31,
  created_at: T0,
};

const item = (id: string, name: string, price: number | null, stock: number, extra: Partial<Item> = {}): Item => ({
  id,
  shop_id: LAB_SHOP.id,
  name,
  name_en: null,
  description: null,
  price_cents: price,
  price_source: price === null ? "missing" : "spoken",
  tags: [],
  stock,
  sold_out: false,
  sort: 0,
  created_at: T0,
  ...extra,
});

export const LAB_ITEMS: Item[] = [
  item("cake", "Chocolate cake", 1800, 2, { tags: ["nut-free"] }),
  item("croissant", "Croissant", 450, 9, { tags: ["contains-dairy"] }),
  item("banh-mi", "Bánh mì", 900, 6, { name_en: "pork baguette" }),
  item("tart", "Lemon tart", 650, 0, { sold_out: true }),
  item("loaf", "Round loaf", null, 3),
];

export function labOrder(id: string, patch: Partial<DashboardOrder> = {}): DashboardOrder {
  return {
    id,
    shop_id: LAB_SHOP.id,
    item_id: "cake",
    item_name: "Chocolate cake",
    qty: 1,
    amount_cents: 1800,
    currency: "USD",
    pickup_time: T0,
    customer_name: "Jordan",
    status: "held",
    payment_mode: "sandbox",
    agent_id: "agent-open-sign-shopper",
    idempotency_key: `lab-${id}`,
    visa_auth_id: null,
    visa_capture_id: null,
    visa_reversal_id: null,
    card_last4: "1111",
    pickup_code: "4821",
    failure_reason: null,
    created_at: T0,
    updated_at: T0,
    held_at: T0,
    paid_at: null,
    released_at: null,
    ...patch,
  };
}

export function labDashboard(orders: DashboardOrder[], blocked = 0): Dashboard {
  const held = orders.filter((o) => o.status === "held").reduce((s, o) => s + o.amount_cents, 0);
  const paid = orders.filter((o) => o.status === "paid").reduce((s, o) => s + o.amount_cents, 0);
  return {
    shop: LAB_SHOP,
    items: LAB_ITEMS,
    orders,
    events: [],
    stats: {
      verified: orders.filter((o) => o.agent_id).length,
      blocked,
      blocked_by_reason: blocked ? { unsigned: Math.ceil(blocked / 2), replayed: Math.floor(blocked / 2) } : {},
      held_cents: held,
      paid_cents: paid,
      unverified_orders: 0,
    },
  };
}
