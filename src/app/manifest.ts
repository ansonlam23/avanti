import type { MetadataRoute } from "next";

// "Add to Home Screen": avanti opens as its own app (no browser bars), on paper.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "avanti",
    short_name: "avanti",
    description: "Every shop, open to every AI.",
    start_url: "/start",
    display: "standalone",
    background_color: "#ebe5de",
    theme_color: "#ebe5de",
    icons: [
      { src: "/icons/avanti-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/avanti-512.png", sizes: "512x512", type: "image/png" },
    ],
  };
}
