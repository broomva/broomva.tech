import type { MetadataRoute } from "next";
import { getBaseUrl } from "@/lib/url";
import { getAllSlugs } from "@/lib/content";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const baseUrl = getBaseUrl();
  const now = new Date();

  const [projectSlugs, writingSlugs, noteSlugs, promptSlugs] = await Promise.all([
    getAllSlugs("projects"),
    getAllSlugs("writing"),
    getAllSlugs("notes"),
    getAllSlugs("prompts"),
  ]);

  const staticEntries: MetadataRoute.Sitemap = [
    { url: `${baseUrl}/`, lastModified: now, changeFrequency: "weekly", priority: 1 },
    { url: `${baseUrl}/chat`, lastModified: now, changeFrequency: "weekly", priority: 0.9 },
    { url: `${baseUrl}/projects`, lastModified: now, changeFrequency: "weekly", priority: 0.8 },
    { url: `${baseUrl}/writing`, lastModified: now, changeFrequency: "weekly", priority: 0.8 },
    { url: `${baseUrl}/notes`, lastModified: now, changeFrequency: "weekly", priority: 0.7 },
    { url: `${baseUrl}/prompts`, lastModified: now, changeFrequency: "weekly", priority: 0.7 },
    { url: `${baseUrl}/start-here`, lastModified: now, changeFrequency: "monthly", priority: 0.8 },
    { url: `${baseUrl}/now`, lastModified: now, changeFrequency: "monthly", priority: 0.6 },
    { url: `${baseUrl}/contact`, lastModified: now, changeFrequency: "monthly", priority: 0.5 },
  ];

  const contentEntries: MetadataRoute.Sitemap = [
    ...projectSlugs.map((slug) => ({
      url: `${baseUrl}/projects/${slug}`,
      lastModified: now,
      changeFrequency: "monthly" as const,
      priority: 0.7,
    })),
    ...writingSlugs.map((slug) => ({
      url: `${baseUrl}/writing/${slug}`,
      lastModified: now,
      changeFrequency: "monthly" as const,
      priority: 0.7,
    })),
    ...noteSlugs.map((slug) => ({
      url: `${baseUrl}/notes/${slug}`,
      lastModified: now,
      changeFrequency: "monthly" as const,
      priority: 0.6,
    })),
    ...promptSlugs.map((slug) => ({
      url: `${baseUrl}/prompts/${slug}`,
      lastModified: now,
      changeFrequency: "monthly" as const,
      priority: 0.6,
    })),
  ];

  return [...staticEntries, ...contentEntries];
}
