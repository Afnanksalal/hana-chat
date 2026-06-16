import { ArrowRight, CheckCircle2, Sparkles } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { HanaLogo } from "./components/hana-logo";
import { LandingSessionCta } from "./components/landing-session-cta";
import {
  breadcrumbJsonLd,
  getPublicSeoPage,
  jsonLd,
  relatedPublicPages,
  webpageJsonLd,
} from "./seo";
import { getInitialAuthenticated } from "./session-state";

interface TopicSection {
  title: string;
  body: string;
}

interface TopicFaq {
  question: string;
  answer: string;
}

interface PublicTopicPageProps {
  path: string;
  eyebrow: string;
  headline: string;
  intro: string;
  bullets: string[];
  sections: TopicSection[];
  faqs: TopicFaq[];
  ctaLabel?: string;
}

export async function PublicTopicPage({
  path,
  eyebrow,
  headline,
  intro,
  bullets,
  sections,
  faqs,
  ctaLabel = "Start chatting",
}: PublicTopicPageProps) {
  const page = getPublicSeoPage(path);
  const relatedPages = relatedPublicPages(path, 4);
  const initialAuthenticated = await getInitialAuthenticated();
  const structuredData = [
    webpageJsonLd(path),
    breadcrumbJsonLd(path),
    {
      "@context": "https://schema.org",
      "@type": "FAQPage",
      mainEntity: faqs.map((faq) => ({
        "@type": "Question",
        name: faq.question,
        acceptedAnswer: {
          "@type": "Answer",
          text: faq.answer,
        },
      })),
    },
  ];

  return (
    <main className="site-shell">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLd(structuredData) }}
      />
      <header className="site-nav">
        <Link className="brand-lockup" href="/">
          <span className="brand-symbol" aria-hidden="true">
            <HanaLogo size={22} />
          </span>
          <span>Hana Chat</span>
        </Link>
        <nav className="site-links" aria-label="Public navigation">
          <Link href="/ai-character-chat">AI chat</Link>
          <Link href="/ai-roleplay-chat">Roleplay</Link>
          <Link href="/ai-character-creator">Creator</Link>
        </nav>
        <LandingSessionCta
          authHref="/auth"
          dashboardHref="/app"
          initialAuthenticated={initialAuthenticated}
          variant="nav"
        />
      </header>

      <section className="public-hero">
        <div className="public-hero-copy">
          <span className="section-label">
            <Sparkles size={16} /> {eyebrow}
          </span>
          <h1>{headline}</h1>
          <p>{intro}</p>
          <div className="topic-tags" aria-label={`${page.shortTitle} tags`}>
            {page.tags.slice(0, 5).map((tag) => (
              <span key={tag}>{tag}</span>
            ))}
          </div>
          <div className="hero-actions">
            <LandingSessionCta
              authHref="/auth"
              dashboardHref="/app"
              initialAuthenticated={initialAuthenticated}
              variant="hero"
            >
              {ctaLabel}
            </LandingSessionCta>
            <Link className="secondary-action" href="/#features">
              See features <ArrowRight size={18} />
            </Link>
          </div>
        </div>
        <div className="public-hero-visual" aria-hidden="true">
          <Image src="/assets/hana-hero.png" alt="" fill sizes="(max-width: 900px) 100vw, 42vw" />
        </div>
      </section>

      <section className="topic-showcase" aria-labelledby={`${page.path.slice(1)}-signals`}>
        <div className="section-intro">
          <h2 id={`${page.path.slice(1)}-signals`}>Why this page matters</h2>
          <p>
            Hana keeps the public promise simple: text-first character chat, memory that stays
            scoped, and creator tools that feed better conversations.
          </p>
        </div>
        <div className="topic-grid">
          {bullets.map((bullet) => (
            <article className="topic-card" key={bullet}>
              <CheckCircle2 size={22} />
              <span>{bullet}</span>
              <p>
                {sections.find((section) => section.title === bullet)?.body ?? page.description}
              </p>
            </article>
          ))}
        </div>
      </section>

      <section className="feature-showcase">
        <div className="section-intro">
          <h2>Built into the product, not pasted on later.</h2>
          <p>
            These are the product surfaces behind the promise, written plainly so users, search
            engines, and answer engines can understand what Hana does.
          </p>
        </div>
        <div className="public-section-list">
          {sections.map((section) => (
            <article className="feature-card" key={section.title}>
              <h3>{section.title}</h3>
              <p>{section.body}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="faq-section" aria-labelledby={`${page.path.slice(1)}-faq`}>
        <div className="section-intro">
          <h2 id={`${page.path.slice(1)}-faq`}>{page.shortTitle} FAQ</h2>
          <p>
            Concise answers for searchers comparing AI chat, roleplay, memory, and creator tools.
          </p>
        </div>
        <div className="faq-list">
          {faqs.map((faq) => (
            <article className="faq-item" key={faq.question}>
              <h3>{faq.question}</h3>
              <p>{faq.answer}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="related-section" aria-labelledby={`${page.path.slice(1)}-related`}>
        <div className="section-intro">
          <h2 id={`${page.path.slice(1)}-related`}>Keep exploring</h2>
          <p>Related Hana pages that connect the public content graph.</p>
        </div>
        <div className="related-link-grid">
          {relatedPages.map((related) => (
            <Link className="related-link" href={related.path} key={related.path}>
              <span>{related.shortTitle}</span>
              <p>{related.description}</p>
              <strong>
                Open page <ArrowRight size={16} />
              </strong>
            </Link>
          ))}
        </div>
      </section>
    </main>
  );
}
