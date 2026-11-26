import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Mindspace",
    short_name: "Mindspace",
    description: "Book Mindspace classes and club events.",
    start_url: "/",
    display: "standalone",
    background_color: "#f7f4f0",
    theme_color: "#53617f",
    icons: [
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml" },
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
  };
}
