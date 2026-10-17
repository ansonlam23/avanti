import type { BlockReason, OrderStatus } from "@/lib/types";

/** Broadcast on channel `shop:<slug>`. Event name === `kind`. */
export type ShopPing =
  | { kind: "order"; status: OrderStatus } // no order id: it would expose orders (and pickup codes) to anyone on the channel
  | { kind: "stock"; item_id: string; stock: number; sold_out: boolean }
  | { kind: "blocked"; reason: BlockReason; count?: number }
  | { kind: "shop"; open: boolean };
