import { cn } from "@/lib/utils";
import { Eyebrow, Lede, Section, Title } from "./section";

// Sourced, short. Each number keeps its source on the line under it.
const STATS = [
  { value: "68¢", text: "of every dollar spent at a small business stays local.", source: "American Express, 2025" },
  { value: "58%", text: "of shoppers ask AI for product picks instead of search.", source: "Capgemini, Jan 2025" },
  { value: "+693%", text: "AI traffic to US retail sites, 2025 holidays.", source: "Adobe Analytics, Jan 2026" },
];

export function Why() {
  return (
    <Section id="why" labelledBy="why-title">
      <div className="grid gap-y-14 lg:grid-cols-12 lg:gap-x-6">
        <div className="lg:col-span-5">
          <Eyebrow>Why</Eyebrow>
          <Title id="why-title">To an AI, most shops on your street don&apos;t exist.</Title>
          <Lede>Their menus live on paper. AI shoppers can&apos;t read paper.</Lede>
        </div>

        {/* a printed tally: number, then what it means and who measured it */}
        <ul className="flex flex-col lg:col-span-7 lg:col-start-6 lg:pl-10">
          {STATS.map((s, i) => (
            <li
              key={s.value}
              className={cn(
                "grid gap-x-8 gap-y-3 py-8 sm:grid-cols-[minmax(0,15rem)_minmax(0,1fr)] sm:items-center lg:grid-cols-[18.5rem_minmax(0,1fr)] lg:py-9",
                i > 0 && "border-t-[1.5px] border-dashed border-ink/25",
                i === 0 && "pt-0 lg:pt-1",
              )}
            >
              <p className="thermal font-display text-[80px] font-black leading-[0.8] tracking-[-0.01em] lg:text-[104px]">{s.value}</p>
              <div>
                <p className="text-body-lg">{s.text}</p>
                <p className="mt-2 text-[15px] text-ink-muted">{s.source}</p>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </Section>
  );
}
