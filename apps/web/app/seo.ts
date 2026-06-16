import type { Metadata } from "next";

export const siteName = "Hana Chat";

export const siteDescription =
  "Chat with anime-inspired AI characters, create private stories, and return to conversations that remember your world.";

export const siteKeywords = [
  "AI roleplay",
  "AI companion",
  "anime chat",
  "character chat",
  "AI characters",
  "persistent memory chat",
  "Hana Chat",
];

export type PublicPageGroup = "product" | "policy";

export interface PublicSeoPage {
  path: string;
  title: string;
  absoluteTitle?: string;
  description: string;
  shortTitle: string;
  group: PublicPageGroup;
  priority: number;
  changeFrequency: "weekly" | "monthly";
  lastModified: string;
  tags: string[];
}

export const publicSeoPages = [
  {
    path: "/",
    absoluteTitle: "Hana Chat | AI characters who remember you",
    title: "AI characters who remember you",
    shortTitle: "Home",
    description: siteDescription,
    group: "product",
    priority: 1,
    changeFrequency: "weekly",
    lastModified: "2026-06-09T00:00:00.000Z",
    tags: siteKeywords,
  },
  {
    path: "/ai-character-chat",
    title: "AI Character Chat With Memory",
    shortTitle: "AI character chat",
    description:
      "Start text chats with AI characters that keep story details, boundaries, preferences, and relationship continuity across rooms.",
    group: "product",
    priority: 0.92,
    changeFrequency: "weekly",
    lastModified: "2026-06-09T00:00:00.000Z",
    tags: [
      "AI character chat",
      "AI characters",
      "character AI alternative",
      "persistent AI chat",
      "AI companion memory",
    ],
  },
  {
    path: "/ai-roleplay-chat",
    title: "AI Roleplay Chat for Long Stories",
    shortTitle: "AI roleplay",
    description:
      "Build private roleplay scenes with AI characters that remember the setup, continue the scene, and respect your chosen tone.",
    group: "product",
    priority: 0.9,
    changeFrequency: "weekly",
    lastModified: "2026-06-09T00:00:00.000Z",
    tags: [
      "AI roleplay chat",
      "roleplay AI",
      "story roleplay chat",
      "private AI roleplay",
      "romantic AI companion",
    ],
  },
  {
    path: "/ai-companion-memory",
    title: "AI Companion Memory That Stays Personal",
    shortTitle: "Memory",
    description:
      "Hana Chat keeps memory scoped to each character and room so conversations can evolve without mixing unrelated stories.",
    group: "product",
    priority: 0.88,
    changeFrequency: "weekly",
    lastModified: "2026-06-09T00:00:00.000Z",
    tags: [
      "AI companion with memory",
      "AI memory chat",
      "persistent companion",
      "relationship memory",
      "personalized AI chat",
    ],
  },
  {
    path: "/anime-ai-chat",
    title: "Anime AI Chat Characters",
    shortTitle: "Anime chat",
    description:
      "Discover anime-inspired AI companions for comfort chats, romance, fantasy scenes, study energy, and creator-made stories.",
    group: "product",
    priority: 0.86,
    changeFrequency: "weekly",
    lastModified: "2026-06-09T00:00:00.000Z",
    tags: [
      "anime AI chat",
      "anime AI companion",
      "anime roleplay",
      "anime character chat",
      "AI waifu chat",
    ],
  },
  {
    path: "/ai-character-creator",
    title: "AI Character Creator for Private Worlds",
    shortTitle: "Creator",
    description:
      "Create AI characters with profile art, personas, opening scenes, tags, ratings, and memory-ready prompts for private or public chat.",
    group: "product",
    priority: 0.84,
    changeFrequency: "weekly",
    lastModified: "2026-06-09T00:00:00.000Z",
    tags: [
      "AI character creator",
      "create AI character",
      "AI persona builder",
      "character prompt builder",
      "creator AI chat",
    ],
  },
  {
    path: "/legal",
    title: "Legal Center",
    shortTitle: "Legal",
    description:
      "Read Hana Chat policies for accounts, billing, privacy, community rules, safety, and mature content controls.",
    group: "policy",
    priority: 0.45,
    changeFrequency: "monthly",
    lastModified: "2026-06-09T00:00:00.000Z",
    tags: ["Hana Chat legal", "terms", "privacy", "community rules", "billing policy"],
  },
  {
    path: "/legal/terms",
    title: "Terms of Service",
    shortTitle: "Terms",
    description:
      "The terms for using Hana Chat accounts, characters, subscriptions, AI output, and creator content.",
    group: "policy",
    priority: 0.42,
    changeFrequency: "monthly",
    lastModified: "2026-06-09T00:00:00.000Z",
    tags: ["Hana Chat terms", "terms of service", "AI chat terms"],
  },
  {
    path: "/legal/refunds",
    title: "Billing and Refund Policy",
    shortTitle: "Refunds",
    description:
      "Hana Chat billing, cancellation, refund, failed payment, charge issue, and creator monetization policy.",
    group: "policy",
    priority: 0.42,
    changeFrequency: "monthly",
    lastModified: "2026-06-09T00:00:00.000Z",
    tags: ["Hana Chat refunds", "billing policy", "subscription refund"],
  },
  {
    path: "/legal/privacy",
    title: "Privacy Policy",
    shortTitle: "Privacy",
    description:
      "How Hana Chat uses account information, messages, character settings, saved memories, payments, and support data.",
    group: "policy",
    priority: 0.42,
    changeFrequency: "monthly",
    lastModified: "2026-06-09T00:00:00.000Z",
    tags: ["Hana Chat privacy", "AI chat privacy", "memory privacy"],
  },
  {
    path: "/legal/community",
    title: "Community Rules",
    shortTitle: "Community",
    description:
      "Rules for public characters, creator quality, user respect, reports, and shared Hana Chat spaces.",
    group: "policy",
    priority: 0.4,
    changeFrequency: "monthly",
    lastModified: "2026-06-09T00:00:00.000Z",
    tags: ["Hana Chat community rules", "AI character rules", "creator rules"],
  },
  {
    path: "/legal/safety",
    title: "Safety and Mature Content",
    shortTitle: "Safety",
    description:
      "Hana Chat safety expectations, mature-space controls, user boundaries, reports, and content limits.",
    group: "policy",
    priority: 0.4,
    changeFrequency: "monthly",
    lastModified: "2026-06-09T00:00:00.000Z",
    tags: ["Hana Chat safety", "mature content controls", "AI roleplay safety"],
  },
] as const satisfies readonly PublicSeoPage[];

export function getSiteUrl(): string {
  return (
    process.env["NEXT_PUBLIC_SITE_URL"] ??
    process.env["WEB_ORIGIN"] ??
    "https://hanachat.site"
  )
    .trim()
    .replace(/\/$/, "");
}

export function getAppUrl(): string {
  return (process.env["NEXT_PUBLIC_APP_URL"] ?? "https://app.hanachat.site")
    .trim()
    .replace(/\/$/, "");
}

export function absoluteUrl(path: string): string {
  return new URL(path, `${getSiteUrl()}/`).toString();
}

export function absoluteAppUrl(path: string): string {
  return new URL(path, `${getAppUrl()}/`).toString();
}

export function getPublicSeoPage(path: string): PublicSeoPage {
  const normalizedPath = normalizePublicPath(path);
  const page = publicSeoPages.find((entry) => entry.path === normalizedPath);
  if (!page) {
    throw new Error(`Unknown public SEO page: ${path}`);
  }
  return page;
}

export function productSeoPages(): PublicSeoPage[] {
  return publicSeoPages.filter((page) => page.group === "product");
}

export function policySeoPages(): PublicSeoPage[] {
  return publicSeoPages.filter((page) => page.group === "policy");
}

export function relatedPublicPages(path: string, limit = 4): PublicSeoPage[] {
  const current = getPublicSeoPage(path);
  return publicSeoPages
    .filter((page) => page.path !== current.path)
    .sort((left, right) => {
      if (left.group === current.group && right.group !== current.group) {
        return -1;
      }
      if (right.group === current.group && left.group !== current.group) {
        return 1;
      }
      return right.priority - left.priority;
    })
    .slice(0, limit);
}

export function createPublicMetadata(path: string): Metadata {
  const page = getPublicSeoPage(path);
  const title = page.absoluteTitle ? { absolute: page.absoluteTitle } : page.title;
  const image = absoluteUrl("/assets/hana-hero.png");
  const url = absoluteUrl(page.path);

  return {
    title,
    description: page.description,
    keywords: uniqueKeywords([...siteKeywords, ...page.tags]),
    alternates: {
      canonical: page.path,
    },
    openGraph: {
      type: "website",
      locale: "en_US",
      url,
      siteName,
      title: page.absoluteTitle ?? `${page.title} | ${siteName}`,
      description: page.description,
      images: [
        {
          url: image,
          width: 1200,
          height: 630,
          alt: "Hana Chat AI character chat preview",
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title: page.absoluteTitle ?? `${page.title} | ${siteName}`,
      description: page.description,
      images: [image],
    },
  };
}

export function organizationJsonLd() {
  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: siteName,
    url: absoluteUrl("/"),
    logo: absoluteUrl("/assets/hana-icon-512.png"),
    email: "support@hanachat.site",
    sameAs: [absoluteUrl("/")],
  };
}

export function websiteJsonLd() {
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: siteName,
    url: absoluteUrl("/"),
    description: siteDescription,
    inLanguage: "en-US",
  };
}

export function webpageJsonLd(path: string) {
  const page = getPublicSeoPage(path);

  return {
    "@context": "https://schema.org",
    "@type": "WebPage",
    name: page.absoluteTitle ?? `${page.title} | ${siteName}`,
    description: page.description,
    url: absoluteUrl(page.path),
    isPartOf: {
      "@type": "WebSite",
      name: siteName,
      url: absoluteUrl("/"),
    },
    about: page.tags,
    inLanguage: "en-US",
    dateModified: page.lastModified,
  };
}

export function breadcrumbJsonLd(path: string) {
  const page = getPublicSeoPage(path);
  const items = [
    {
      "@type": "ListItem",
      position: 1,
      name: "Hana Chat",
      item: absoluteUrl("/"),
    },
  ];

  if (page.path !== "/") {
    items.push({
      "@type": "ListItem",
      position: 2,
      name: page.shortTitle,
      item: absoluteUrl(page.path),
    });
  }

  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items,
  };
}

export function jsonLd(data: unknown): string {
  return JSON.stringify(data).replace(/</g, "\\u003c");
}

function normalizePublicPath(path: string): string {
  if (!path || path === "/") {
    return "/";
  }
  return path.endsWith("/") ? path.slice(0, -1) : path;
}

function uniqueKeywords(values: readonly string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}
