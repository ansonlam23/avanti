import { ClosedSign } from "@/components/brand";
import { Eyebrow, Lede, Section, Title } from "./section";

/** Trust, plainly: the spindle of spiked requests and the one number that matters, printed like the door log's Z-report. */
export function Bots() {
  return (
    <Section id="trust" labelledBy="trust-title">
      <div className="grid items-center gap-16 lg:grid-cols-12 lg:gap-x-6">
        <div className="lg:order-2 lg:col-span-5 lg:col-start-8">
          <Eyebrow>Trust</Eyebrow>
          <Title id="trust-title">Bots stay outside.</Title>
          <Lede>Every AI order is signed by the shopper&apos;s agent. Unsigned, replayed or edited requests get spiked before Visa sees them.</Lede>
          <p className="mt-6 text-[15px] text-ink-muted">Ed25519 keys · RFC 9421 HTTP Message Signatures</p>
        </div>

        <figure className="flex flex-col items-center gap-14 sm:flex-row sm:items-end sm:justify-center sm:gap-12 lg:order-1 lg:col-span-7 lg:justify-start lg:gap-14 lg:pl-6">
          <div className="origin-bottom sm:scale-110 lg:scale-[1.45]">
            <ClosedSign pile={["unsigned", "digest_mismatch", "replayed"]} sound={false} />
          </div>
          {/* the Z-report's hero line, torn off */}
          <figcaption className="slip-drop" style={{ rotate: "2.2deg" }}>
            <span className="paper edge-torn-y flex flex-col items-center px-10 pb-10 pt-11">
              <span className="dot block text-[120px] leading-[0.78] text-ink lg:text-[150px]">0</span>
              <span className="label-print mt-5 block text-[16px] text-ink">Reached Visa</span>
              <span className="mt-1.5 block text-[15px] text-ink-muted">The check runs first.</span>
            </span>
          </figcaption>
        </figure>
      </div>
    </Section>
  );
}
