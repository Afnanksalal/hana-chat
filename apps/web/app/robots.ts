import type { MetadataRoute } from "next";
import { absoluteUrl, getSiteUrl } from "./seo";

const privatePaths = ["/app", "/app/", "/api/", "/auth"];
const llmPaths = ["/", "/llms.txt", "/llms-full.txt", "/legal/", "/assets/"];

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: privatePaths,
      },
      {
        userAgent: ["GPTBot", "ChatGPT-User", "ClaudeBot", "PerplexityBot", "Applebot-Extended"],
        allow: llmPaths,
        disallow: privatePaths,
      },
    ],
    sitemap: absoluteUrl("/sitemap.xml"),
    host: getSiteUrl(),
  };
}
