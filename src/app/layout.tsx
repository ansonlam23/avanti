import type { Metadata, Viewport } from "next";
import { Marcellus, Nanum_Brush_Script, Red_Hat_Mono, Red_Hat_Text } from "next/font/google";
import { Providers } from "@/components/providers";
import "./globals.css";

// avanti · ink (DESIGN.md §2): four fonts, four jobs.
// Marcellus: the wordmark, headings, buttons and big prices (the landing page's face).
const marcellus = Marcellus({
  variable: "--font-marcellus",
  subsets: ["latin", "latin-ext"],
  weight: "400",
});

// Red Hat Text: body copy and interface text.
const redHatText = Red_Hat_Text({
  variable: "--font-redhat-text",
  subsets: ["latin", "latin-ext"],
  weight: ["400", "500", "600", "700"],
});

// Red Hat Mono: what's printed on a slip (receipts, codes, amounts in lists).
const redHatMono = Red_Hat_Mono({
  variable: "--font-redhat-mono",
  subsets: ["latin", "latin-ext"],
  weight: ["400", "500", "600"],
});

// Nanum Brush Script: the owner's own handwriting, in brush ink (≥ 24px only).
const nanumBrush = Nanum_Brush_Script({
  variable: "--font-nanum-brush",
  subsets: ["latin"],
  weight: "400",
});

export const metadata: Metadata = {
  title: {
    default: "avanti — every shop, open to every AI",
    template: "%s · avanti",
  },
  description:
    "avanti opens any small shop to AI shoppers: snap the counter, say your prices, and verified AI shoppers can order, with the money held on Visa until pickup.",
};

export const viewport: Viewport = {
  themeColor: "#ebe5de",
  colorScheme: "light",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={[marcellus.variable, redHatText.variable, redHatMono.variable, nanumBrush.variable, "h-full antialiased"].join(" ")}
    >
      <body className="flex min-h-full flex-col">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
