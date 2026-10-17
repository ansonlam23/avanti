"use client";

import Link from "next/link";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import {
  BotWall,
  ChalkMenu,
  ClosedSign,
  FocusReveal,
  OpenSign,
  PriceTag,
  Receipt,
  sfx,
  SignedSlip,
  Stamp,
} from "@/components/brand";
import { CounterView } from "@/components/counter/counter-view";
import type { BlockReason, OrderStatus } from "@/lib/types";
import { cn } from "@/lib/utils";
import { MENU } from "./demos/chalk";
import { attack } from "./demos/door";
import { ORDER } from "./demos/receipt";
import { Storefront } from "@/components/storefront/storefront";
import { AskShot } from "./ask-shot";
import { LAB_ITEMS, LAB_SHOP, labDashboard, labOrder } from "./fixtures";

type Shot = {
  title: string;
  /** Full-screen background for the shot (default: the counter). */
  bg?: string;
  /** "page": a whole screen, top-aligned (default "center": one object, centered). */
  layout?: "center" | "page";
  /** take 0 = pre-roll (the moment before); every later take replays the moment. */
  render: (take: number) => ReactNode;
};

const PAPER = "bg-paper";

/** True `ms` after this take started (components are keyed by take). */
function useBeat(take: number, ms: number) {
  const [on, setOn] = useState(false);
  useEffect(() => {
    if (take === 0) return;
    const t = setTimeout(() => setOn(true), ms);
    return () => clearTimeout(t);
  }, [take, ms]);
  return on;
}

export const SHOTS: Record<string, Shot> = {
  "neon-on": {
    title: "OPEN prints out of the printer and tears (hero)",
    render: (take) => <OpenSign key={take} size="xl" spill state={take === 0 ? "off" : "flickering-on"} />,
  },
  "neon-off": {
    title: "OPEN torn away (closing)",
    render: (take) => <OpenSign key={take} size="xl" spill state={take === 0 ? "on" : "sputtering-off"} />,
  },
  "neon-tints": {
    title: "Shop slips printing, one by one",
    render: (take) => (
      <div key={take} className="flex flex-col items-center gap-8">
        <Staggered take={take} delay={0} text="Bakery" />
        <Staggered take={take} delay={520} text="Pho" />
        <Staggered take={take} delay={1040} text="Books" />
      </div>
    ),
  },
  "menu-write": {
    title: "The menu prints line by line",
    render: (take) =>
      take === 0 ? null : <ChalkMenu key={take} title="Mai's Bakery" items={MENU} animateIn className="max-w-[350px]" />,
  },
  "menu-soldout": {
    title: "Sold out: struck in the owner's pen",
    render: (take) => <MenuChange key={take} take={take} change="soldout" />,
  },
  "menu-highlight": {
    title: "The item the shopper asks about gets highlighted",
    render: (take) => <MenuChange key={take} take={take} change="highlight" />,
  },
  tags: {
    title: "Price labels slap down",
    render: (take) => (take === 0 ? null : <Tags key={take} />),
  },
  "receipt-print": {
    title: "Receipt prints → total counts up → HELD lands",
    render: (take) =>
      take === 0 ? null : (
        <div className="scale-[1.12] sm:scale-125">
          <Receipt key={take} {...ORDER} mode="sandbox" status="held" printing qrValue="pickup" />
        </div>
      ),
  },
  "receipt-paid": {
    title: "Picked up: PAID lands over HELD",
    render: (take) => <StatusChange key={take} take={take} to="paid" />,
  },
  "receipt-released": {
    title: "No-show: RELEASED lands over HELD",
    render: (take) => <StatusChange key={take} take={take} to="released" />,
  },
  "stamp-verified": {
    title: "VERIFIED ✓ lands on paper",
    bg: PAPER,
    render: (take) =>
      take === 0 ? null : <Stamp key={take} kind="VERIFIED" label="Open Sign Shopper" size="lg" animate className="sm:scale-125" />,
  },
  "door-flip": {
    title: "One bot: a REJECTED slip on the spindle",
    render: (take) => <Door key={take} take={take} bots={1} />,
  },
  "door-burst": {
    title: "A 50-bot burst piles up on the spindle",
    render: (take) => <Door key={take} take={take} bots={50} />,
  },
  bots: {
    title: "Bot attack: 50 turned away, 0 reached Visa",
    render: (take) => <Bots key={take} take={take} />,
  },
  verified: {
    title: "Focus reveal: ORDER VERIFIED",
    render: (take) => <Focus key={take} take={take} kind="verified" />,
  },
  held: {
    title: "Focus reveal: held, not charged",
    render: (take) => <Focus key={take} take={take} kind="held" />,
  },
  ticket: {
    title: "Counter: a new order ticket swings onto the rail",
    layout: "page",
    render: (take) => <Counter key={take} take={take} mode="ticket" />,
  },
  "ticket-paid": {
    title: "Counter: picked up, PAID lands over HELD",
    layout: "page",
    render: (take) => <Counter key={take} take={take} mode="paid" />,
  },
  counter: {
    title: "Counter: orders tab (lab data)",
    layout: "page",
    render: (take) => <Counter key={take} take={take} mode="static" />,
  },
  "counter-menu": {
    title: "Counter: menu stock (lab data)",
    layout: "page",
    render: (take) => <Counter key={take} take={take} mode="menu" />,
  },
  "counter-door": {
    title: "Counter: door log, 50 bots, 0 reached Visa (lab data)",
    layout: "page",
    render: (take) => <Counter key={take} take={take} mode="door" />,
  },
  storefront: {
    title: "Storefront (lab data)",
    layout: "page",
    render: (take) => <Storefront key={take} shop={LAB_SHOP} items={LAB_ITEMS} />,
  },
  "ask-results": {
    title: "Chat: shop slips + the AI's answer (lab data)",
    layout: "page",
    render: (take) => <AskShot key={take} stage="results" />,
  },
  "ask-order": {
    title: "Chat: menu slip + the order, not placed yet (lab data)",
    layout: "page",
    render: (take) => <AskShot key={take} stage="order" />,
  },
  "ask-held": {
    title: "Chat: the printed receipt + VERIFIED slip (lab data)",
    layout: "page",
    render: (take) => <AskShot key={take} stage="held" />,
  },
};

const noop = () => {};

function Counter({ take, mode }: { take: number; mode: "ticket" | "paid" | "static" | "menu" | "door" }) {
  const arrived = useBeat(take, 700);
  const charged = useBeat(take, 1300);
  const earlier = labOrder("o0", { status: "paid", customer_name: "Sam", item_name: "Croissant", item_id: "croissant", qty: 2, amount_cents: 900 });
  const orders =
    mode === "ticket"
      ? arrived
        ? [labOrder("o1")]
        : []
      : mode === "paid"
        ? [labOrder("o1", { status: charged ? "paid" : "held" })]
        : [labOrder("o1"), earlier];
  return (
    <div className="w-full">
      <CounterView
        data={labDashboard(orders, mode === "door" && arrived ? 50 : 0)}
        fresh={new Set(mode === "ticket" ? ["o1"] : [])}
        busy={null}
        simulating={false}
        padFor={null}
        onPickedUp={noop}
        onPadClose={noop}
        onPadSubmit={() => Promise.resolve(false)}
        onNoShow={noop}
        onToggleSoldOut={noop}
        onSimulate={noop}
        initialTab={mode === "menu" ? "menu" : mode === "door" ? "door" : "orders"}
      />
    </div>
  );
}

function Staggered({ take, delay, text }: { take: number; delay: number; text: string }) {
  const on = useBeat(take, delay);
  return <OpenSign text={text} size="md" state={on ? "flickering-on" : "off"} />;
}

function MenuChange({ take, change }: { take: number; change: "soldout" | "highlight" }) {
  const on = useBeat(take, 500);
  const items = MENU.map((i) => ({ ...i, sold_out: change === "soldout" && on && i.id === "tart" }));
  return (
    <ChalkMenu
      title="Mai's Bakery"
      items={items}
      highlightId={change === "highlight" && on ? "cake" : null}
      className="max-w-[350px]"
    />
  );
}

function Tags() {
  const tags = [
    { label: "Croissant", price: 450, tilt: -4 },
    { label: "Chocolate cake", price: 1800, tilt: 3 },
    { label: "Round loaf", price: null, tilt: -2 },
  ];
  return (
    <div className="flex flex-wrap items-start justify-center gap-5">
      {tags.map((t, i) => (
        <Delayed key={t.label} ms={i * 160}>
          <PriceTag label={t.label} price_cents={t.price} tilt={t.tilt} swing />
        </Delayed>
      ))}
    </div>
  );
}

function Delayed({ ms, children }: { ms: number; children: ReactNode }) {
  const [show, setShow] = useState(ms === 0);
  useEffect(() => {
    if (ms === 0) return;
    const t = setTimeout(() => setShow(true), ms);
    return () => clearTimeout(t);
  }, [ms]);
  return show ? <>{children}</> : <div className="w-[156px]" />;
}

/** A held receipt that changes status a beat after each take starts. */
function StatusChange({ take, to }: { take: number; to: OrderStatus }) {
  const on = useBeat(take, 900);
  const status = on ? to : "held";
  return (
    <div className="scale-[1.12] sm:scale-125">
      {/* like the app: the pickup code is only printed while the hold is open */}
      <Receipt {...ORDER} mode="sandbox" status={status} pickupCode={status === "held" ? ORDER.pickupCode : null} qrValue="pickup" />
    </div>
  );
}

const REASONS: BlockReason[] = ["unsigned", "replayed", "digest_mismatch", "unknown_agent", "bad_signature"];

function Door({ take, bots }: { take: number; bots: number }) {
  const [flips, setFlips] = useState(0);
  const [reason, setReason] = useState<BlockReason>("replayed");
  useEffect(() => {
    if (take === 0) return;
    const ts = Array.from({ length: bots }, (_, i) =>
      setTimeout(() => {
        setReason(REASONS[i % REASONS.length]);
        setFlips((f) => f + 1);
      }, 400 + i * 45),
    );
    return () => ts.forEach(clearTimeout);
  }, [take, bots]);
  return <ClosedSign flips={flips} reason={reason} face="open" className="scale-[1.35]" />;
}

function Bots({ take }: { take: number }) {
  const on = useBeat(take, 500);
  return (
    <div className="w-full max-w-[380px]">
      <BotWall blocked={on ? 50 : 0} reasons={on ? attack({}, 50) : {}} reachedVisa={0} verified={3} />
    </div>
  );
}

function Focus({ take, kind }: { take: number; kind: "verified" | "held" }) {
  const open = useBeat(take, 600);
  return (
    <FocusReveal
      open={open}
      eyebrow={kind === "verified" ? "Order verified" : "Visa hold"}
      title={kind === "verified" ? "Signed by a known agent" : "Held, not charged"}
      tilt={kind === "verified" ? -3 : 2}
      object={(cue) =>
        kind === "verified" ? (
          <SignedSlip cue={cue} />
        ) : (
          <div className="-my-[46px] scale-[0.8]">
            {cue ? <Receipt {...ORDER} mode="sandbox" status="held" printing qrValue="pickup" /> : <div className="h-[466px] w-[312px]" />}
          </div>
        )
      }
      card={kind === "verified" ? "Checked first. Then Visa was asked for a hold." : undefined}
      className="h-[calc(100dvh-3rem)] w-full max-w-[430px] rounded-[6px]"
    >
      <div className="flex h-full flex-col items-center gap-5 bg-counter p-5">
        <ChalkMenu title="Mai's Bakery" items={MENU.slice(0, 3)} />
      </div>
    </FocusReveal>
  );
}

/** One shot, full screen, no chrome. */
export function ShotView({ name }: { name: string }) {
  const shot = SHOTS[name];
  const [take, setTake] = useState(0);
  const replay = useCallback(() => setTake((t) => t + 1), []);

  useEffect(() => {
    const t = setTimeout(replay, 700); // pre-roll, then play
    return () => clearTimeout(t);
  }, [replay]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === " " || e.key === "r" || e.key === "R") {
        e.preventDefault();
        replay();
      } else if (e.key === "m" || e.key === "M") {
        sfx.setMuted(!sfx.isMuted());
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [replay]);

  if (!shot) {
    return (
      <main className="flex min-h-dvh flex-col items-center justify-center gap-4 p-6 text-center">
        <p className="font-display text-[32px] font-extrabold uppercase">No shot called “{name}”.</p>
        <Link href="/lab" className="btn-quiet">
          Back to the lab
        </Link>
      </main>
    );
  }

  if (shot.layout === "page") {
    // A whole screen: no centering, no click-to-replay (its buttons must work); R / Space replays.
    return <div className={cn("relative min-h-dvh w-full", shot.bg)}>{shot.render(take)}</div>;
  }
  return (
    <main
      className={cn("relative flex min-h-dvh w-full cursor-pointer items-center justify-center overflow-hidden p-6", shot.bg)}
      onClick={replay}
      aria-label={`${shot.title}. Click to replay.`}
    >
      {shot.render(take)}
    </main>
  );
}
