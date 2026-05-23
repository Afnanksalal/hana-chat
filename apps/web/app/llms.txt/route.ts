import { absoluteAppUrl, absoluteUrl, siteDescription, siteName } from "../seo";

export const dynamic = "force-static";

export function GET(): Response {
  const body = `# ${siteName}

> ${siteDescription}

Hana Chat is a consumer AI character chat product focused on anime-inspired companions, persistent conversation memory, creator-built characters, private stories, subscriptions, and age-gated premium spaces.

## Public URLs

- [Home](${absoluteUrl("/")})
- [Pricing and features](${absoluteUrl("/#pricing")})
- [App sign in](${absoluteAppUrl("/auth")})
- [Terms](${absoluteUrl("/legal/terms")})
- [Billing and refunds](${absoluteUrl("/legal/refunds")})
- [Privacy](${absoluteUrl("/legal/privacy")})
- [Community rules](${absoluteUrl("/legal/community")})
- [Safety](${absoluteUrl("/legal/safety")})
- [Expanded LLM summary](${absoluteUrl("/llms-full.txt")})

## Crawl Boundaries

Authenticated app routes, user chats, private memories, creator drafts, account settings, and API endpoints are not public documentation and should not be indexed or used as public corpus material.

Support contact: support@hanachat.site
`;

  return new Response(body, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=3600, stale-while-revalidate=86400",
    },
  });
}
