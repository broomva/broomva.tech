import type { MetadataRoute } from "next";
import { config } from "@/lib/config";

export default function robots(): MetadataRoute.Robots {
  const baseUrl = config.appUrl;

  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/api/", "/settings/", "/(chat)/"],
      },
    ],
    sitemap: `${baseUrl}/sitemap.xml`,
  };
}
