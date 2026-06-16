import type { MetadataRoute } from "next";
import { absoluteUrl, getSiteUrl, publicSeoPages } from "./seo";

const privatePaths = ["/app", "/app/", "/api/", "/auth"];
const llmPaths = [
  ...publicSeoPages.map((page) => page.path),
  "/llms.txt",
  "/llms-full.txt",
  "/assets/",
];
const aiSearchUserAgents = [
  "OAI-SearchBot",
  "OAI-AdsBot",
  "GPTBot",
  "ChatGPT-User",
  "ClaudeBot",
  "Claude-SearchBot",
  "Claude-User",
  "PerplexityBot",
  "Perplexity-User",
  "Google-Extended",
  "Applebot-Extended",
];

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: privatePaths,
      },
      {
        userAgent: aiSearchUserAgents,
        allow: llmPaths,
        disallow: privatePaths,
      },
    ],
    sitemap: absoluteUrl("/sitemap.xml"),
    host: getSiteUrl(),
  };
}
