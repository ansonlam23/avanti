import type { Metadata, Viewport } from "next";
import { Barlow_Condensed, Doto, Nanum_Pen_Script, Space_Mono } from "next/font/google";
import { Providers } from "@/components/providers";
import "./globals.css";

// Four fonts, four jobs (DESIGN.md §2).
// Barlow Condensed: heavy headings, OPEN, prices, buttons.
const barlow = Barlow_Condensed({
  variable: "--font-barlow",
  subsets: ["latin", "latin-ext", "vietnamese"],
  weight: ["600", "700", "800", "900"],
});

// Space Mono: everything a receipt printer would print (body + UI).
const spaceMono = Space_Mono({
  variable: "--font-space-mono",
  subsets: ["latin", "latin-ext", "vietnamese"],
  weight: ["400", "700"],
});

// Doto: dot-matrix numerals for codes, counts and timers (≥ 28px only).
const doto = Doto({
  variable: "--font-doto",
  subsets: ["latin"],
  axes: ["ROND"],
});

// Nanum Pen Script: the owner's handwriting on the order pad (≥ 24px only).
const nanumPen = Nanum_Pen_Script({
  variable: "--font-nanum-pen",
  subsets: ["latin"],
  weight: "400",
});

export const metadata: Metadata = {
  title: {
    default: "Open Sign — every shop, open to every AI",
    template: "%s · Open Sign",
  },
  description:
    "The OPEN sign for AI shoppers: small shops go live for AI in 40 seconds, with Visa-verified orders.",
};

export const viewport: Viewport = {
  themeColor: "#e4e0d6",
  colorScheme: "light",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={[barlow.variable, spaceMono.variable, doto.variable, nanumPen.variable, "h-full antialiased"].join(" ")}
    >
      <body className="flex min-h-full flex-col">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
