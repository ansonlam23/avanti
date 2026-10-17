import { cn } from "@/lib/utils";

// Layout helpers for the public pages: one container (max-w-page, 12-column
// grid on laptops), one vertical rhythm, one type scale.
//
// Note: `cn` (tailwind-merge) reads the custom sizes text-hero / text-title /
// text-lede / text-body-lg as colors and drops them next to a text color, so
// they're kept outside cn() here and in the other landing components.

export function Section({
  id,
  labelledBy,
  className,
  children,
}: {
  id?: string;
  labelledBy?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <section
      id={id}
      aria-labelledby={labelledBy}
      className={cn("mx-auto w-full max-w-page scroll-mt-6 px-6 py-16 md:px-10 lg:py-[76px]", className)}
    >
      {children}
    </section>
  );
}

export function Eyebrow({ children, className }: { children: React.ReactNode; className?: string }) {
  return <p className={cn("label-print text-[15px] text-ink-muted", className)}>{children}</p>;
}

export function Title({ id, children, className }: { id?: string; children: React.ReactNode; className?: string }) {
  return (
    <h2 id={id} className={`text-title ${cn("thermal mt-4 font-display font-black uppercase text-balance", className)}`}>
      {children}
    </h2>
  );
}

export function Lede({ children, className }: { children: React.ReactNode; className?: string }) {
  return <p className={`text-lede ${cn("mt-6 max-w-[38ch] text-pretty text-ink-muted", className)}`}>{children}</p>;
}
