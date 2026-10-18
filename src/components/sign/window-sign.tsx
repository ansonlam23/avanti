import { PrintButton } from "./print-button";
import "./sign.css";

// One Letter-size poster in the ink style. Sizes are in container units, so the
// sheet scales to fit any screen and prints at 7.5 × 10 in (Letter, 0.5 in margins).
export function WindowSign({
  shopName,
  shopUrl,
  qrSvg,
  isDemo,
}: {
  shopName: string;
  shopUrl: string;
  /** SVG markup from the qrcode library, built on the server from our own URL. */
  qrSvg: string;
  isDemo: boolean;
}) {
  const display = shopUrl.replace(/^https?:\/\//, "");
  return (
    <main className="ws-page">
      <div className="ws-bar">
        <PrintButton />
      </div>

      <article className="ws-sheet" aria-label={`Window sign for ${shopName}`}>
        <div className="ws-inner">
          <header className="ws-head">
            <span className="ws-mark">avanti</span>
            {isDemo ? <span className="ws-demo">demo shop</span> : null}
          </header>

          <h1 className="ws-title">AI orders welcome.</h1>
          <p className="ws-shop">{shopName}</p>
          <p className="ws-lede">Ask your AI for us, or scan to order ahead.</p>

          <figure className="ws-qr">
            <div className="ws-qr-code" dangerouslySetInnerHTML={{ __html: qrSvg }} />
            <figcaption>
              <span className="ws-qr-cta">Scan to order ahead</span>
              <span className="ws-qr-url">{display}</span>
            </figcaption>
          </figure>

          <p className="ws-foot">Held on Visa until you pick up.</p>
        </div>
        {/* A faint strip of the landing's ink plate along the bottom edge. */}
        {/* eslint-disable-next-line @next/next/no-img-element -- printed poster: a plain img prints reliably */}
        <img className="ws-strip" src="/landing/land.webp" alt="" aria-hidden="true" />
      </article>
    </main>
  );
}
