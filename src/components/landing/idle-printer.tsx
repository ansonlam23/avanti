import { OpenSign } from "@/components/brand";

/**
 * The 404 still life (kept under its old name): an un-inked sign hanging
 * from its nail, the plaque only a faint dashed outline around `ghost`.
 */
export function IdlePrinter({ ghost = "404" }: { ghost?: string }) {
  return (
    <div aria-hidden className="flex justify-center">
      <OpenSign mount="plate" state="off" text={ghost} size="lg" sound={false} className="text-[72px] lg:text-[112px]" />
    </div>
  );
}
