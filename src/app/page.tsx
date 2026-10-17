import { Bots } from "@/components/landing/bots";
import { Doors } from "@/components/landing/doors";
import { Held } from "@/components/landing/held";
import { Hero } from "@/components/landing/hero";
import { HowItWorks } from "@/components/landing/how-it-works";
import { SiteFooter } from "@/components/landing/site-footer";
import { SiteNav } from "@/components/landing/site-nav";
import { Why } from "@/components/landing/why";
import { hasGemini, paymentMode } from "@/lib/env";

export const dynamic = "force-dynamic"; // the slips reflect this deployment's real payment mode

export default function Home() {
  const payments = paymentMode();
  return (
    <>
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-[3px] focus:bg-paper focus:px-4 focus:py-3 focus:shadow-[var(--shadow-lift)]"
      >
        Skip to content
      </a>
      <SiteNav />
      <main id="main" className="flex flex-1 flex-col">
        <Hero payments={payments} />
        <Why />
        <HowItWorks />
        <Held payments={payments} />
        <Bots />
        <Doors payments={payments} ai={hasGemini()} />
      </main>
      <SiteFooter photoCredit />
    </>
  );
}
