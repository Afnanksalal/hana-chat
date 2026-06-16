import type { MetadataRoute } from "next";
import { absoluteUrl, publicSeoPages } from "./seo";

export default function sitemap(): MetadataRoute.Sitemap {
  return publicSeoPages.map((route) => ({
    url: absoluteUrl(route.path),
    lastModified: new Date(route.lastModified),
    changeFrequency: route.changeFrequency,
    priority: route.priority,
    images: route.path === "/" ? [absoluteUrl("/assets/hana-hero.png")] : undefined,
  }));
}
