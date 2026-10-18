"use client";

import { useId, useRef, useState } from "react";
import { InkToggle } from "@/components/open/ink-toggle";
import { LOYALTY_DEFAULT_EVERY, LOYALTY_REWARD_MAX, loyaltyOf, parseLoyaltyInput, sameRule } from "@/lib/loyalty/rules";
import type { LoyaltyRule, ShopRules } from "@/lib/types";
import { cn } from "@/lib/utils";

type Problem = { field: "every" | "reward"; message: string };

/**
 * "Regulars": the shop's stamp card (CONTRACTS §17). Each pickup by the same
 * shopper's device stamps a seal on their card; every Nth pickup the owner
 * hands over the reward. One sentence, "Every [5] pickups → [free cookie]",
 * and a square switch. It saves on Enter or when focus leaves the sentence.
 * Off ends the program; stamps are counted from orders, so turning it back
 * on keeps everyone's cards.
 */
export function LoyaltySetting({
  rules,
  onChange,
  className,
}: {
  rules: ShopRules;
  /** Saves the rule (null = off) and resolves true once saved. Absent: shown read-only (the lab). */
  onChange?: (rule: LoyaltyRule | null) => Promise<boolean>;
  className?: string;
}) {
  const saved = loyaltyOf(rules);
  const savedKey = saved ? `${saved.every}|${saved.reward}` : "";
  const id = useId();
  // What's typed but not saved yet (null = show the saved rule).
  const [every, setEvery] = useState<string | null>(null);
  const [reward, setReward] = useState<string | null>(null);
  // Where the switch was just moved (null = follow the saved rule).
  const [want, setWant] = useState<boolean | null>(null);
  const [problem, setProblem] = useState<Problem | null>(null);
  const [saving, setSaving] = useState(false);
  // The saved rule this view last followed, and the last one that was on (it comes back after "off").
  const [seen, setSeen] = useState<{ key: string; last: LoyaltyRule | null }>({ key: savedKey, last: saved });
  if (seen.key !== savedKey) {
    // The saved rule changed (our save landed, or another screen changed it): follow it.
    setSeen({ key: savedKey, last: saved ?? seen.last });
    setEvery(null);
    setReward(null);
    setWant(null);
  }
  const rewardRef = useRef<HTMLInputElement>(null);
  const queue = useRef<Promise<unknown>>(Promise.resolve()); // one save at a time, in order

  const base = saved ?? seen.last;
  const on = want ?? saved !== null;
  const everyText = every ?? String(base?.every ?? LOYALTY_DEFAULT_EVERY);
  const rewardText = reward ?? base?.reward ?? "";
  const readOnly = !onChange;

  function save(next: LoyaltyRule | null) {
    const run = async () => {
      if (!onChange) return;
      setSaving(true);
      // The counter says how it went; the saved rule then arrives with its refresh.
      if (!(await onChange(next))) setWant(null);
      setSaving(false);
    };
    queue.current = queue.current.then(run, run);
  }

  function commit(force = false) {
    const parsed = parseLoyaltyInput(everyText, rewardText);
    if (!parsed.ok) return setProblem(parsed);
    setProblem(null);
    if (!force && sameRule(parsed.rule, saved)) {
      setEvery(null);
      setReward(null);
      return;
    }
    save(parsed.rule);
  }

  function toggle(next: boolean) {
    setProblem(null);
    setWant(next);
    if (!next) {
      setEvery(null);
      setReward(null);
      if (saved) save(null);
      return;
    }
    // The card they had before comes straight back (saved even if an "off" is still in flight);
    // a new one needs its reward first.
    if (rewardText.trim()) commit(true);
    else requestAnimationFrame(() => rewardRef.current?.focus());
  }

  const field = "field-print min-h-11! text-[16px]! disabled:opacity-60";
  return (
    <div className={className}>
      <div className="flex items-center justify-between gap-4">
        <p id={`${id}-label`} className="text-[16px]">
          Regulars
        </p>
        <InkToggle checked={on} disabled={readOnly} onCheckedChange={toggle} aria-label="Stamp card for regulars" />
      </div>
      {on ? (
        <div
          role="group"
          aria-labelledby={`${id}-label`}
          aria-busy={saving || undefined}
          onBlur={(e) => {
            // leaving the sentence (not moving between its two fields) saves it
            if (!readOnly && !e.currentTarget.contains(e.relatedTarget as Node | null)) commit();
          }}
          className="mt-2.5 flex flex-wrap items-center gap-x-2.5 gap-y-2 text-[16px] lg:text-[17px]"
        >
          <span>Every</span>
          <input
            inputMode="numeric"
            pattern="[0-9]*"
            maxLength={2}
            value={everyText}
            disabled={readOnly}
            aria-label="Pickups per reward"
            aria-invalid={problem?.field === "every" || undefined}
            onChange={(e) => {
              setEvery(e.target.value.replace(/\D/g, "").slice(0, 2));
              setProblem(null);
            }}
            onKeyDown={(e) => onEnter(e, commit)}
            className={cn(field, "w-14! px-0! text-center font-mono", problem?.field === "every" && "border-stamp-deep!")}
          />
          <span>
            pickups <span aria-hidden>→</span>
          </span>
          <input
            ref={rewardRef}
            value={rewardText}
            maxLength={LOYALTY_REWARD_MAX}
            placeholder="free cookie"
            enterKeyHint="done"
            disabled={readOnly}
            aria-label="Reward"
            aria-invalid={problem?.field === "reward" || undefined}
            onChange={(e) => {
              setReward(e.target.value);
              setProblem(null);
            }}
            onKeyDown={(e) => onEnter(e, commit)}
            className={cn(field, "w-auto! min-w-[9.5rem] flex-1 px-3!", problem?.field === "reward" && "border-stamp-deep!")}
          />
        </div>
      ) : (
        <p className="mt-1 text-[15px] text-ink-muted lg:text-[16px]">Give repeat customers a stamp card.</p>
      )}
      {problem ? (
        <p role="alert" className="mt-2 text-[15px] font-semibold text-stamp-deep">
          {problem.message}
        </p>
      ) : null}
    </div>
  );
}

function onEnter(e: React.KeyboardEvent<HTMLInputElement>, commit: () => void) {
  if (e.key === "Enter") {
    e.preventDefault();
    commit();
  }
}
