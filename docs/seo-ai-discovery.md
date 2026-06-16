# SEO and AI Discovery

Hana's public SEO surface is intentionally small and canonical. The public authority lives on
`https://hanachat.site`; authenticated app routes stay on `/app` and are excluded from indexing.

## Public Route Graph

Public metadata is centralized in `apps/web/app/seo.ts`. The sitemap, robots file, public topic
pages, legal metadata, and LLM text manifests all read from the same route graph.

Current public page groups:

- Product: home, AI character chat, AI roleplay chat, AI companion memory, anime AI chat, and AI
  character creator.
- Policy: legal center, terms, refunds, privacy, community rules, and safety.

Authenticated app routes, auth routes, API routes, private chats, private memories, and creator
drafts are not public SEO content. They are blocked in robots and marked `noindex` where Next
metadata can apply it.

## Weighted Audit

Run:

```powershell
pnpm seo:audit
```

Useful environment overrides:

```powershell
$env:SEO_AUDIT_BASE_URL='https://hanachat.site'
$env:SEO_AUDIT_MIN_SCORE='90'
$env:SEO_AUDIT_MIN_PAGE_SCORE='82'
pnpm seo:audit
```

The audit crawls `robots.txt`, `sitemap.xml`, `llms.txt`, `llms-full.txt`, and every sitemap URL.

Weights:

- Technical: 25 points for HTTP 200, self-canonical path, indexability, sitemap inclusion, and
  robots allow rules.
- Metadata: 20 points for title, description, Open Graph, Twitter card, and JSON-LD.
- Content: 20 points for H1, crawlable copy, FAQ-style answers, visual assets, and natural
  brand/topic language.
- Internal links: 20 points for crawlable internal links, incoming public links, descriptive anchor
  text, and no dead public links.
- AI discovery: 15 points for `llms.txt`, `llms-full.txt`, explicit AI/search crawler rules, and
  private app/API boundaries.

## External Guidance

The implementation follows stable guidance from:

- Google Search Central SEO Starter Guide:
  `https://developers.google.com/search/docs/fundamentals/seo-starter-guide`
- Google Search Central AI features guidance:
  `https://developers.google.com/search/docs/appearance/ai-features`
- Google Search Central structured data intro:
  `https://developers.google.com/search/docs/appearance/structured-data/intro-structured-data`
- Bing Webmaster Guidelines:
  `https://www.bing.com/webmaster/help/Webmaster-Guidelines-30fba23a`
- OpenAI publisher/developer crawler guidance:
  `https://help.openai.com/articles/12627856-publishers-and-developers-faq`
- Perplexity crawler guidance:
  `https://docs.perplexity.ai/guides/bots`

`llms.txt` is treated as a useful AI-readable manifest, not as a guaranteed ranking signal.
Traditional crawlability, useful public content, internal links, structured data, and consistent
brand facts still carry the main discovery value.
