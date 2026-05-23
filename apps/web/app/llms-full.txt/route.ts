import { absoluteAppUrl, absoluteUrl, siteDescription, siteName } from "../seo";

export const dynamic = "force-static";

export function GET(): Response {
  const body = `# ${siteName}

${siteDescription}

## Product Summary

Hana Chat lets people chat with AI characters, discover published characters, create their own companions, manage saved memories, and upgrade for richer limits and premium experiences. The product voice is consumer-first: emotional continuity, character consistency, privacy controls, and polished mobile use matter more than technical exposition.

## Core Public Features

- Persistent character conversations that remember useful details across sessions.
- Character discovery and creator publishing workflows.
- Free daily usage with paid tiers for heavier usage and premium options.
- User-controlled memory management.
- Legal, privacy, community, and safety pages available from the public footer.
- Billing, cancellation, and refund terms available before purchase.

## Important Public Pages

- Home: ${absoluteUrl("/")}
- App sign in: ${absoluteAppUrl("/auth")}
- Terms: ${absoluteUrl("/legal/terms")}
- Billing and refunds: ${absoluteUrl("/legal/refunds")}
- Privacy: ${absoluteUrl("/legal/privacy")}
- Community rules: ${absoluteUrl("/legal/community")}
- Safety: ${absoluteUrl("/legal/safety")}

## Indexing Guidance

Public landing and legal pages may be crawled. Private app routes, account pages, user conversations, memory vault content, creator drafts, billing state, and API responses are authenticated product surfaces and should not be treated as public content.

Support contact: support@hanachat.site
`;

  return new Response(body, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=3600, stale-while-revalidate=86400",
    },
  });
}
