import { OpenSign } from "@/components/brand";

/**
 * The 404 still life: the printer on the counter with nothing coming out,
 * and a dashed, unprinted slip where the paper would have been.
 */
export function IdlePrinter({ ghost = "404" }: { ghost?: string }) {
  return (
    <div aria-hidden className="lp-idle">
      <span className="lp-printer-body" />
      {/* the printer with no paper in it (its slip space folded away) */}
      <OpenSign state="off" size="xl" sound={false} className="-mb-[1.58em] text-[1em]!" />
      <OpenSign mount="bare" state="off" text={ghost} size="lg" sound={false} className="mt-[0.2em] text-[0.62em]!" />
    </div>
  );
}
