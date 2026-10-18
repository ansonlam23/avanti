import type { CSSProperties, ReactNode } from "react";
import { SiteFooter } from "@/components/landing/site-footer";
import { GITHUB_URL, SiteNav } from "@/components/landing/site-nav";
import type { PaymentMode } from "@/lib/types";
import { CopyLink } from "./copy-link";

// /privacy: how avanti uses AI and your data. Short on purpose, and every line
// is checked against the code (the payment line and the shopper's model follow
// this deployment's real settings). Two sides like /start: the shopper's on
// paper, the shop's on the teal wash; then one row on the AI itself, and how
// any outside AI can use avanti (the MCP server) and what it can see.

export interface AiUse {
  /** Who, said as the start of the sentence ("Claude (Anthropic)"). */
  who: string;
  /** The rest of the sentence ("runs the AI shopper."). */
  what: string;
}

const rise = (s: number) => ({ "--rise": `${s}s` }) as CSSProperties;

/** The name in running text: semibold, in the logo's teal. */
function Avanti() {
  return <span className="font-semibold text-carbon">avanti</span>;
}

function Side({ id, title, surface, delay, children }: { id: string; title: string; surface: "paper" | "pad"; delay: number; children: ReactNode }) {
  return (
    <section aria-labelledby={id} className={`lp-rise ${surface} px-6 pb-3 pt-7 sm:px-8 lg:px-10 lg:pb-5 lg:pt-9`} style={rise(delay)}>
      <h2 id={id} className="font-display text-[30px] font-normal leading-none text-ink lg:text-[36px]">
        {title}
      </h2>
      <ul className="mt-5 lg:mt-7">{children}</ul>
    </section>
  );
}

function Line({ children }: { children: ReactNode }) {
  return <li className="border-t border-ink/15 py-4 text-[16px] leading-snug text-ink text-pretty lg:text-[18px]">{children}</li>;
}

export function PrivacyPage({ payments, shopperAi, mcpUrl }: { payments: PaymentMode; shopperAi: AiUse; mcpUrl: string }) {
  const ai: { who: string; what: ReactNode }[] = [
    { who: "Gemini (Google)", what: "reads the counter photo and voice note." },
    {
      who: shopperAi.who,
      what: (
        <>
          {shopperAi.what} <Avanti /> doesn&apos;t save your chat.
        </>
      ),
    },
    { who: "Prices", what: "always come from the database, never from AI text." },
    { who: "Demo shops", what: "are labeled demo." },
  ];
  return (
    <div className="flex min-h-svh flex-col bg-counter">
      <SiteNav variant="page" section="privacy" />
      <main className="mx-auto w-full max-w-page flex-1 px-5 pb-16 pt-8 sm:px-8 lg:px-10 lg:pb-20 lg:pt-14">
        <h1
          className="lp-rise font-display text-[36px] font-normal leading-[1.08] text-carbon text-balance sm:text-[52px] lg:text-[clamp(3.25rem,1.6rem+2.6vw,4.25rem)]"
          style={rise(0.05)}
        >
          How avanti uses AI and your data
        </h1>

        <div className="mt-9 grid gap-5 lg:mt-14 lg:grid-cols-2 lg:gap-8">
          <Side id="shoppers" title="Shoppers" surface="paper" delay={0.16}>
            <Line>
              <Avanti /> keeps your pickup name and your order. Requests are counted per IP address to stop abuse.
            </Line>
            <Line>
              <Avanti /> never asks for your card number.{" "}
              {payments === "sandbox"
                ? "This demo uses a Visa sandbox test card, so no real money moves."
                : "Payments here are simulated: no Visa call, no real money."}
            </Line>
            <Line>Nothing is ordered or held without your tap.</Line>
            <Line>Every order request is cryptographically signed and verified before Visa is called.</Line>
            <Line>Your searches are counted anonymously to tell shops what&apos;s in demand.</Line>
            <Line>Loyalty stamps use a random key stored hashed, tied to your phone, not to you.</Line>
          </Side>
          <Side id="shop-owners" title="Shop owners" surface="pad" delay={0.26}>
            <Line>
              The AI answers about your shop only from your own words and prices. It never invents one: unpriced items stay
              &ldquo;needs a price&rdquo; and can&apos;t be ordered.
            </Line>
            <Line>You set the rules: a cap on each AI order, items sold in person only, and a pause for AI orders anytime.</Line>
            <Line>Unsigned or forged order requests are turned away before they reach Visa.</Line>
            <Line>
              You check the menu Gemini drafts before it goes live. Your photo becomes the shop&apos;s picture; <Avanti /> doesn&apos;t keep
              the voice note.
            </Line>
          </Side>
        </div>

        <section aria-labelledby="ai" className="lp-rise mt-12 lg:mt-16" style={rise(0.36)}>
          <h2 id="ai" className="font-display text-[30px] font-normal leading-none text-ink lg:text-[36px]">
            How AI is used
          </h2>
          <ul className="mt-5 grid sm:grid-cols-2 sm:gap-x-8 lg:mt-7 lg:grid-cols-4">
            {ai.map((a, i) => (
              <li key={i} className="border-t border-ink/15 py-4 text-[16px] leading-snug text-ink-muted text-pretty lg:py-5 lg:text-[18px]">
                <span className="font-semibold text-ink">{a.who}</span> {a.what}
              </li>
            ))}
          </ul>
        </section>

        {/* the MCP server (CONTRACTS §15): the same tools the avanti shopper uses, read-only */}
        <section aria-labelledby="your-ai" className="lp-rise mt-12 lg:mt-16" style={rise(0.46)}>
          <h2 id="your-ai" className="font-display text-[30px] font-normal leading-none text-ink lg:text-[36px]">
            Use <span className="text-carbon">avanti</span> from your own AI
          </h2>
          <p className="mt-4 max-w-[60ch] text-[16px] leading-snug text-ink-muted text-pretty lg:mt-5 lg:text-[18px]">
            <Avanti /> is an MCP server, so an assistant like Claude can find these shops for you. Add this link to it:
          </p>
          <div className="mt-5 lg:mt-6">
            <CopyLink url={mcpUrl} label="avanti's MCP server link" />
          </div>
          <p className="mt-5 text-[16px] text-ink-muted lg:mt-6 lg:text-[17px]">
            Claude, Cursor and other apps:{" "}
            <a href={`${GITHUB_URL}#use-avanti-from-any-ai`} target="_blank" rel="noreferrer" className="underline decoration-ink/30 underline-offset-4 hover:decoration-ink">
              setup steps on GitHub
            </a>
            .
          </p>
        </section>
      </main>
      <SiteFooter privacyLink={false} />
    </div>
  );
}
