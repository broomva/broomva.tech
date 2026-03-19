import type { MetadataRoute } from "next";
import { config } from "@/lib/config";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: config.appName,
    short_name: config.appName,
    description: config.appDescription,
    start_url: "/",
    display: "standalone",
    background_color: "#000B18",
    theme_color: "#000B18",
    icons: [
      {
        src: "/icon.svg",
        sizes: "any",
        type: "image/svg+xml",
      },
      {
        src: "/icon-192.png",
        sizes: "192x192",
        type: "image/png",
      },
      {
        src: "/icon-512.png",
        sizes: "512x512",
        type: "image/png",
      },
      {
        src: "/icon.png",
        sizes: "1024x1024",
        type: "image/png",
      },
    ],
  };
}
