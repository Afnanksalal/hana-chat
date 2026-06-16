#!/usr/bin/env node

const DEFAULT_BASE_URL = "https://hanachat.site";
const baseUrl = normalizeBaseUrl(
  process.env["SEO_AUDIT_BASE_URL"] ??
    process.env["WEB_BASE_URL"] ??
    process.env["NEXT_PUBLIC_SITE_URL"] ??
    DEFAULT_BASE_URL,
);
const minimumOverallScore = Number(process.env["SEO_AUDIT_MIN_SCORE"] ?? 90);
const minimumPageScore = Number(process.env["SEO_AUDIT_MIN_PAGE_SCORE"] ?? 82);

const scoringWeights = {
  technical: 25,
  metadata: 20,
  content: 20,
  internalLinks: 20,
  aiDiscovery: 15,
};

async function main() {
  const robotsUrl = absolute("/robots.txt");
  const sitemapUrl = absolute("/sitemap.xml");
  const llmsUrl = absolute("/llms.txt");
  const llmsFullUrl = absolute("/llms-full.txt");

  const [robots, sitemap, llms, llmsFull] = await Promise.all([
    fetchText(robotsUrl),
    fetchText(sitemapUrl),
    fetchText(llmsUrl),
    fetchText(llmsFullUrl),
  ]);

  const sitemapUrls = parseSitemapUrls(sitemap.body).map(rewriteToAuditOrigin);
  const uniqueUrls = [...new Set(sitemapUrls)];

  if (uniqueUrls.length === 0) {
    throw new Error(`No URLs found in sitemap at ${sitemapUrl}`);
  }

  const pages = await Promise.all(uniqueUrls.map((url) => crawlPage(url)));
  const internalGraph = buildInternalGraph(pages);
  const pageScores = pages.map((page) =>
    scorePage({
      page,
      sitemapUrls: uniqueUrls,
      robotsText: robots.body,
      llmsText: llms.body,
      llmsFullText: llmsFull.body,
      incomingLinks: internalGraph.incoming.get(page.path) ?? 0,
      deadLinks: internalGraph.deadLinks.filter((link) => link.from === page.path),
    }),
  );

  const overallScore = Math.round(
    pageScores.reduce((sum, page) => sum + page.score, 0) / Math.max(pageScores.length, 1),
  );
  const failingPages = pageScores.filter((page) => page.score < minimumPageScore);
  const failingManifests = [
    robots.ok ? undefined : `robots.txt returned ${robots.status}`,
    sitemap.ok ? undefined : `sitemap.xml returned ${sitemap.status}`,
    llms.ok ? undefined : `llms.txt returned ${llms.status}`,
    llmsFull.ok ? undefined : `llms-full.txt returned ${llmsFull.status}`,
  ].filter(Boolean);

  printReport({
    baseUrl,
    robotsUrl,
    sitemapUrl,
    llmsUrl,
    llmsFullUrl,
    pageScores,
    overallScore,
    internalGraph,
  });

  if (failingManifests.length > 0) {
    throw new Error(`SEO manifests failed: ${failingManifests.join("; ")}`);
  }

  if (overallScore < minimumOverallScore || failingPages.length > 0) {
    const pageList = failingPages.map((page) => `${page.path}=${page.score}`).join(", ");
    throw new Error(
      `SEO audit below threshold. Overall ${overallScore}/${minimumOverallScore}; pages: ${
        pageList || "none"
      }`,
    );
  }
}

async function crawlPage(url) {
  const response = await fetchText(url);
  const html = response.body;
  const path = new URL(url).pathname || "/";
  const links = parseAnchors(html, url);
  const bodyText = stripHtml(html);
  const jsonLdBlocks = [
    ...html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi),
  ]
    .map((match) => decodeHtml(match[1] ?? "").trim())
    .filter(Boolean);

  return {
    url,
    path,
    status: response.status,
    ok: response.ok,
    title: getTagText(html, "title"),
    description: getMetaContent(html, "description"),
    canonical: getLinkHref(html, "canonical"),
    h1: getHeadingText(html, 1),
    robotsMeta: getMetaContent(html, "robots"),
    ogTitle: getMetaProperty(html, "og:title"),
    ogDescription: getMetaProperty(html, "og:description"),
    twitterCard: getMetaNameOrProperty(html, "twitter:card"),
    jsonLdBlocks,
    internalLinks: links.internal,
    externalLinks: links.external,
    bodyText,
    wordCount: bodyText.split(/\s+/).filter(Boolean).length,
    faqCount: countMatches(bodyText, /\?/g),
    imageCount: countMatches(html, /<img\b/gi),
  };
}

function scorePage({
  page,
  sitemapUrls,
  robotsText,
  llmsText,
  llmsFullText,
  incomingLinks,
  deadLinks,
}) {
  const issues = [];
  const sitemapPaths = new Set(sitemapUrls.map((url) => new URL(url).pathname || "/"));
  const canonicalPath = page.canonical ? safePath(page.canonical) : "";
  const hasCanonical = canonicalPath === page.path;
  const minimumWordCount = page.path.startsWith("/legal") ? 170 : 280;
  const hasGoodDescription =
    page.description.length >= 80 &&
    page.description.length <= 180 &&
    !page.description.includes("\n");
  const internalLinkTexts = page.internalLinks.map((link) => link.text).filter(Boolean);
  const uniqueInternalTargets = new Set(page.internalLinks.map((link) => link.path));
  const llmsIncludesPage = includesPath(llmsText, page.path);
  const llmsFullIncludesPage = includesPath(llmsFullText, page.path);

  const categoryScores = {
    technical: points(scoringWeights.technical, [
      [page.ok && page.status === 200, 7, "Page must return HTTP 200."],
      [hasCanonical, 6, "Canonical must point at the same public path."],
      [!page.robotsMeta.toLowerCase().includes("noindex"), 4, "Page must not be noindexed."],
      [sitemapPaths.has(page.path), 4, "Page must be listed in the XML sitemap."],
      [robotsAllowsPublicPath(robotsText, page.path), 4, "robots.txt must allow this public path."],
    ]),
    metadata: points(scoringWeights.metadata, [
      [
        page.title.length >= 20 && page.title.length <= 70,
        5,
        "Title should be clear and search-result sized.",
      ],
      [hasGoodDescription, 5, "Meta description should be unique, useful, and 80-180 characters."],
      [
        Boolean(page.ogTitle && page.ogDescription),
        4,
        "Open Graph title and description should exist.",
      ],
      [Boolean(page.twitterCard), 3, "Twitter card metadata should exist."],
      [page.jsonLdBlocks.length > 0, 3, "Structured data JSON-LD should exist."],
    ]),
    content: points(scoringWeights.content, [
      [page.h1.length >= 15, 4, "Page should have a descriptive H1."],
      [
        page.wordCount >= minimumWordCount,
        5,
        `Page should have enough visible crawlable copy for its route type (${minimumWordCount}+ words).`,
      ],
      [
        page.faqCount >= 2 || page.path.startsWith("/legal"),
        4,
        "Product pages should include visible FAQ-style answers.",
      ],
      [
        page.imageCount > 0 || page.path.startsWith("/legal"),
        3,
        "Product pages should include a visual asset.",
      ],
      [mentionsBrandAndTopic(page), 4, "Page should mention Hana and its topic naturally."],
    ]),
    internalLinks: points(scoringWeights.internalLinks, [
      [
        uniqueInternalTargets.size >= 4,
        6,
        "Page should link to at least four internal destinations.",
      ],
      [
        incomingLinks >= (page.path === "/" ? 1 : 2),
        6,
        "Page should receive internal links from other public pages.",
      ],
      [
        internalLinkTexts.some((text) =>
          /chat|roleplay|memory|creator|legal|privacy|terms/i.test(text),
        ),
        4,
        "Anchor text should be descriptive.",
      ],
      [deadLinks.length === 0, 4, "Internal links should not point to dead public pages."],
    ]),
    aiDiscovery: points(scoringWeights.aiDiscovery, [
      [llmsIncludesPage, 4, "llms.txt should include this page."],
      [llmsFullIncludesPage, 4, "llms-full.txt should include this page."],
      [
        robotsText.includes("OAI-SearchBot") && robotsText.includes("PerplexityBot"),
        3,
        "AI/search crawler user agents should be explicit.",
      ],
      [
        robotsText.includes("Disallow: /app") && robotsText.includes("Disallow: /api/"),
        4,
        "AI manifests should keep private app/API routes out.",
      ],
    ]),
  };

  for (const [category, result] of Object.entries(categoryScores)) {
    issues.push(...result.issues.map((issue) => `${category}: ${issue}`));
  }

  return {
    path: page.path,
    title: page.title,
    score: Math.round(Object.values(categoryScores).reduce((sum, result) => sum + result.score, 0)),
    categories: Object.fromEntries(
      Object.entries(categoryScores).map(([category, result]) => [
        category,
        Math.round(result.score),
      ]),
    ),
    issues,
  };
}

function points(max, checks) {
  let score = 0;
  const issues = [];

  for (const [passed, value, issue] of checks) {
    if (passed) {
      score += value;
    } else {
      issues.push(issue);
    }
  }

  return { score: Math.min(score, max), issues };
}

function buildInternalGraph(pages) {
  const knownPaths = new Set(pages.map((page) => page.path));
  const incoming = new Map(pages.map((page) => [page.path, 0]));
  const deadLinks = [];

  for (const page of pages) {
    for (const link of page.internalLinks) {
      if (knownPaths.has(link.path) && link.path !== page.path) {
        incoming.set(link.path, (incoming.get(link.path) ?? 0) + 1);
      } else if (isPublicAuditPath(link.path) && !knownPaths.has(link.path)) {
        deadLinks.push({ from: page.path, to: link.path });
      }
    }
  }

  return { incoming, deadLinks };
}

function parseAnchors(html, pageUrl) {
  const base = new URL(pageUrl);
  const internal = [];
  const external = [];
  const anchorPattern = /<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;

  for (const match of html.matchAll(anchorPattern)) {
    const href = decodeHtml(match[1] ?? "").trim();
    const text = stripHtml(match[2] ?? "")
      .trim()
      .replace(/\s+/g, " ");

    if (!href || href.startsWith("mailto:") || href.startsWith("tel:") || href.startsWith("#")) {
      continue;
    }

    try {
      const parsed = new URL(href, base);
      const item = {
        href: parsed.toString(),
        path: parsed.pathname || "/",
        text,
      };

      if (parsed.origin === base.origin) {
        internal.push(item);
      } else {
        external.push(item);
      }
    } catch {
      // Ignore malformed anchors; they are not useful for crawl scoring.
    }
  }

  return { internal, external };
}

function parseSitemapUrls(xml) {
  return [...xml.matchAll(/<loc>([^<]+)<\/loc>/gi)].map((match) =>
    decodeHtml(match[1] ?? "").trim(),
  );
}

async function fetchText(url) {
  const response = await fetch(url, {
    headers: {
      "User-Agent": "HanaSEOAudit/1.0 (+https://hanachat.site)",
    },
    redirect: "follow",
  });
  const body = await response.text();
  return {
    ok: response.ok,
    status: response.status,
    body,
  };
}

function getTagText(html, tag) {
  const match = html.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i"));
  return decodeHtml(stripHtml(match?.[1] ?? ""))
    .trim()
    .replace(/\s+/g, " ");
}

function getHeadingText(html, level) {
  return getTagText(html, `h${level}`);
}

function getMetaContent(html, name) {
  return getMetaNameOrProperty(html, name);
}

function getMetaProperty(html, property) {
  return getMetaNameOrProperty(html, property);
}

function getMetaNameOrProperty(html, key) {
  const escaped = escapeRegExp(key);
  const patterns = [
    new RegExp(
      `<meta[^>]+(?:name|property)=["']${escaped}["'][^>]+content=["']([^"']*)["'][^>]*>`,
      "i",
    ),
    new RegExp(
      `<meta[^>]+content=["']([^"']*)["'][^>]+(?:name|property)=["']${escaped}["'][^>]*>`,
      "i",
    ),
  ];

  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match?.[1]) {
      return decodeHtml(match[1]).trim();
    }
  }

  return "";
}

function getLinkHref(html, rel) {
  const escaped = escapeRegExp(rel);
  const patterns = [
    new RegExp(`<link[^>]+rel=["']${escaped}["'][^>]+href=["']([^"']+)["'][^>]*>`, "i"),
    new RegExp(`<link[^>]+href=["']([^"']+)["'][^>]+rel=["']${escaped}["'][^>]*>`, "i"),
  ];

  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match?.[1]) {
      return decodeHtml(match[1]).trim();
    }
  }

  return "";
}

function stripHtml(value) {
  return decodeHtml(
    value
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]*>/g, " "),
  )
    .replace(/\s+/g, " ")
    .trim();
}

function decodeHtml(value) {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function countMatches(value, pattern) {
  return [...value.matchAll(pattern)].length;
}

function mentionsBrandAndTopic(page) {
  const text = `${page.title} ${page.description} ${page.h1} ${page.bodyText}`.toLowerCase();
  const hasBrand = text.includes("hana");
  const hasTopic = /ai|character|chat|roleplay|memory|creator|privacy|terms|safety/.test(text);
  return hasBrand && hasTopic;
}

function robotsAllowsPublicPath(robotsText, path) {
  if (!robotsText.includes("User-Agent: *") && !robotsText.includes("User-agent: *")) {
    return false;
  }

  const disallowedPublic = [...robotsText.matchAll(/Disallow:\s*(\S+)/gi)]
    .map((match) => match[1])
    .filter(Boolean)
    .some((rule) => path === rule || (rule.endsWith("/") && path.startsWith(rule)));

  return !disallowedPublic || path === "/";
}

function includesPath(text, path) {
  if (path === "/") {
    return /\[[^\]]*Home[^\]]*\]\(/i.test(text) || /-\s*Home:/i.test(text);
  }
  return text.includes(path);
}

function isPublicAuditPath(path) {
  return (
    path === "/" ||
    path.startsWith("/legal") ||
    path.startsWith("/ai-") ||
    path.startsWith("/anime-ai-chat")
  );
}

function safePath(url) {
  try {
    return new URL(url, baseUrl).pathname || "/";
  } catch {
    return "";
  }
}

function absolute(path) {
  return new URL(path, `${baseUrl}/`).toString();
}

function rewriteToAuditOrigin(url) {
  const parsed = new URL(url);
  return absolute(`${parsed.pathname}${parsed.search}`);
}

function normalizeBaseUrl(value) {
  return value.trim().replace(/\/$/, "");
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function printReport({
  baseUrl,
  robotsUrl,
  sitemapUrl,
  llmsUrl,
  llmsFullUrl,
  pageScores,
  overallScore,
  internalGraph,
}) {
  console.log(`SEO audit base: ${baseUrl}`);
  console.log(`Manifests: ${robotsUrl}, ${sitemapUrl}, ${llmsUrl}, ${llmsFullUrl}`);
  console.log(
    `Weights: ${Object.entries(scoringWeights)
      .map(([key, value]) => `${key}=${value}`)
      .join(", ")}`,
  );
  console.log("");
  console.log("Page scores:");

  for (const page of pageScores.sort((left, right) => right.score - left.score)) {
    const categories = Object.entries(page.categories)
      .map(([key, value]) => `${key}:${value}`)
      .join(" ");
    console.log(`- ${page.score}/100 ${page.path} (${categories})`);
    for (const issue of page.issues.slice(0, 4)) {
      console.log(`  issue: ${issue}`);
    }
  }

  console.log("");
  console.log(`Internal dead public links: ${internalGraph.deadLinks.length}`);
  for (const link of internalGraph.deadLinks.slice(0, 8)) {
    console.log(`  dead: ${link.from} -> ${link.to}`);
  }
  console.log(`Overall SEO score: ${overallScore}/100`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
