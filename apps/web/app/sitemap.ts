import type { MetadataRoute } from "next";
import { absoluteUrl } from "./seo";

const publicRoutes = [
  { path: "/", priority: 1, changeFrequency: "weekly" },
  { path: "/legal", priority: 0.4, changeFrequency: "monthly" },
  { path: "/legal/terms", priority: 0.4, changeFrequency: "monthly" },
  { path: "/legal/refunds", priority: 0.4, changeFrequency: "monthly" },
  { path: "/legal/privacy", priority: 0.4, changeFrequency: "monthly" },
  { path: "/legal/community", priority: 0.4, changeFrequency: "monthly" },
  { path: "/legal/safety", priority: 0.4, changeFrequency: "monthly" },
] as const;

export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = new Date("2026-05-22T00:00:00.000Z");

  return publicRoutes.map((route) => ({
    url: absoluteUrl(route.path),
    lastModified,
    changeFrequency: route.changeFrequency,
    priority: route.priority,
    images: route.path === "/" ? [absoluteUrl("/assets/hana-hero.png")] : undefined,
  }));
}
