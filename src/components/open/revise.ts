import type { MenuSoFarItem, RevisionChange } from "@/lib/ai/onboard-revise";
import type { MenuRow } from "./menu-board";

/**
 * How many to start with when nobody said or could count it (a lemonade stand's cups, a photo of one
 * tray). Shown on the review screen ("×10") so the owner can change it; 0 would make the item unorderable.
 */
export const DEFAULT_STOCK = 10;

// "Change anything" on the review screen, the pure half: the menu as the AI
// sees it (short ids, so the model copies them back cheaply) and the AI's
// changes applied to the owner's lines.

/** The named lines as /api/onboard/revise wants them; `keys[i]` is the row behind id `i{i}`. */
export function menuForRevise(rows: MenuRow[]): { menu: MenuSoFarItem[]; keys: string[] } {
  const named = rows.filter((r) => r.name.trim());
  return {
    keys: named.map((r) => r.key),
    menu: named.map((r, i) => ({
      id: `i${i}`,
      name: r.name.trim(),
      name_en: r.name_en,
      price_cents: r.price_cents,
      price_source: r.price_cents === null ? "missing" : r.price_source,
      description: r.description,
      tags: r.tags,
      est_quantity: r.stock,
    })),
  };
}

export interface Applied {
  rows: MenuRow[];
  /** Lines that changed or are new (they get the wash). */
  touched: string[];
  added: number;
  updated: number;
  removed: number;
}

/**
 * Apply the AI's changes. Ids are the `i{n}` ids from `menuForRevise`; an id we
 * don't know is ignored. New lines go at the end; a quantity nobody said starts
 * at DEFAULT_STOCK.
 */
export function applyRevision(
  rows: MenuRow[],
  changes: RevisionChange[],
  keys: string[],
  newKey: (i: number) => string,
): Applied {
  const keyOf = (id: string) => (/^i\d+$/.test(id) ? keys[Number(id.slice(1))] : undefined);
  const removed = new Set<string>();
  const patches = new Map<string, Extract<RevisionChange, { op: "update" }>["patch"]>();
  for (const c of changes) {
    if (c.op === "add") continue;
    const key = keyOf(c.id);
    if (!key) continue;
    if (c.op === "remove") removed.add(key);
    else patches.set(key, { ...patches.get(key), ...c.patch });
  }

  const touched: string[] = [];
  let updated = 0;
  const next: MenuRow[] = [];
  for (const r of rows) {
    if (removed.has(r.key)) continue;
    const p = patches.get(r.key);
    if (!p) {
      next.push(r);
      continue;
    }
    const { est_quantity, ...fields } = p;
    next.push({ ...r, ...fields, ...(est_quantity !== undefined ? { stock: est_quantity } : {}) });
    touched.push(r.key);
    updated++;
  }

  let added = 0;
  for (const c of changes) {
    if (c.op !== "add") continue;
    const key = newKey(added++);
    touched.push(key);
    next.push({
      key,
      name: c.item.name,
      name_en: c.item.name_en,
      description: c.item.description,
      price_cents: c.item.price_cents,
      price_source: c.item.price_source,
      tags: c.item.tags,
      stock: c.item.est_quantity ?? DEFAULT_STOCK,
      box_2d: null,
      ai_orderable: true,
    });
  }

  return { rows: next, touched, added, updated, removed: rows.length - (next.length - added) };
}

/** Drop "I couldn't tell" notes the change settled: a price that's now set, a line that's gone. */
export function pruneUnclear(notes: string[], rows: MenuRow[], goneNames: string[]): string[] {
  return notes.filter((n) => {
    const low = n.toLowerCase();
    if (goneNames.some((g) => g.trim() && low.includes(g.trim().toLowerCase()))) return false;
    if (!low.includes("price")) return true;
    const row = rows.find((r) => r.name.trim() && low.includes(r.name.trim().toLowerCase()));
    return !(row && row.price_cents !== null);
  });
}

/** "Set 2 prices, added 1." The short line under the box after a change. */
export function changeSummary(a: Pick<Applied, "added" | "updated" | "removed">): string {
  const parts: string[] = [];
  if (a.updated) parts.push(`changed ${a.updated}`);
  if (a.added) parts.push(`added ${a.added}`);
  if (a.removed) parts.push(`took off ${a.removed}`);
  if (!parts.length) return "Nothing to change there.";
  const s = parts.join(", ");
  return `${s[0].toUpperCase()}${s.slice(1)}.`;
}
