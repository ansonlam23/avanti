"use client";

import { useEffect } from "react";
import { sfx } from "@/components/brand";
import { formatCents, formatTime } from "@/lib/format";
import type { DashboardOrder } from "@/lib/orders/dashboard";

// The counter reads new orders aloud (speechSynthesis), so an owner across the
// room hears them: "New order: 2 lemon bars for Jordan, pickup at 5:30 PM.
// $9.50 held on Visa." Only when sound is ON, and only after a real tap this
// visit (the sound toggle's click unlocks it; browsers refuse speech before a
// gesture anyway). One calm en-US voice at rate 1.

let unlocked = false;
let voice: SpeechSynthesisVoice | null = null;

/** Calm, natural en-US voices first (Apple, Google, Microsoft), then any en-US, then any English. */
const PREFERRED = ["Samantha", "Ava", "Allison", "Susan", "Google US English", "Microsoft Aria", "Microsoft Jenny", "Microsoft Zira"];

function synth(): SpeechSynthesis | null {
  return typeof window !== "undefined" && "speechSynthesis" in window ? window.speechSynthesis : null;
}

function pickVoice(): SpeechSynthesisVoice | null {
  const s = synth();
  if (!s) return null;
  const all = s.getVoices();
  const us = all.filter((v) => v.lang.replace("_", "-").toLowerCase() === "en-us");
  for (const name of PREFERRED) {
    const v = us.find((x) => x.name.startsWith(name));
    if (v) return v;
  }
  return us.find((v) => v.localService) ?? us[0] ?? all.find((v) => v.lang.toLowerCase().startsWith("en")) ?? null;
}

/** iOS only lets speech start inside a gesture: an empty utterance in the tap unlocks it for later. */
function prime() {
  const s = synth();
  if (!s) return;
  unlocked = true;
  try {
    const u = new SpeechSynthesisUtterance("");
    u.volume = 0;
    s.speak(u);
  } catch {
    /* speech is a courtesy; never break the counter */
  }
}

/**
 * Arms the voice for this page: the first tap or key press of the visit (and
 * the sound toggle's click, which happens inside the same gesture) unlocks it.
 */
export function useOrderVoice() {
  useEffect(() => {
    const s = synth();
    if (!s) return;
    const loadVoices = () => {
      voice = pickVoice();
    };
    loadVoices();
    s.addEventListener?.("voiceschanged", loadVoices);
    const onGesture = () => {
      if (!sfx.isMuted()) prime();
      else unlocked = true;
    };
    window.addEventListener("pointerdown", onGesture, true);
    window.addEventListener("keydown", onGesture, true);
    // The toggle's own click: sfx notifies synchronously inside that click.
    const off = sfx.subscribe(() => {
      if (!sfx.isMuted()) prime();
      else s.cancel();
    });
    return () => {
      s.removeEventListener?.("voiceschanged", loadVoices);
      window.removeEventListener("pointerdown", onGesture, true);
      window.removeEventListener("keydown", onGesture, true);
      off();
    };
  }, []);
}

/** "2 croissant" → "2 croissants" for plain English names; others stay as the owner wrote them. */
function plural(name: string, qty: number): string {
  if (qty === 1 || !/^[a-z\s'-]+$/i.test(name) || /s$/i.test(name)) return name;
  if (/[^aeiou]y$/i.test(name)) return `${name.slice(0, -1)}ies`;
  if (/(x|z|ch|sh)$/i.test(name)) return `${name}es`;
  return `${name}s`;
}

/** The sentence for one new order (prices and names come from the order row, never invented). */
export function orderSentence(o: DashboardOrder): string {
  const what = `${o.qty} ${plural(o.item_name.toLowerCase(), o.qty)}`;
  const who = o.customer_name ? ` for ${o.customer_name}` : "";
  const when = o.pickup_time ? `pickup at ${formatTime(o.pickup_time)}` : "pickup today";
  const held = o.payment_mode === "simulated" ? "held" : "held on Visa";
  return `New order: ${what}${who}, ${when}. ${formatCents(o.amount_cents)} ${held}.`;
}

/** Say new orders after the doorbell (queued if several land together). */
export function speakOrders(orders: DashboardOrder[], delayMs = 900) {
  const s = synth();
  if (!s || !orders.length || sfx.isMuted() || !unlocked) return;
  window.setTimeout(() => {
    if (sfx.isMuted()) return;
    for (const o of orders) {
      const u = new SpeechSynthesisUtterance(orderSentence(o));
      u.lang = "en-US";
      if (voice) u.voice = voice;
      u.rate = 1;
      u.pitch = 1;
      u.volume = 1;
      s.speak(u);
    }
  }, delayMs);
}
