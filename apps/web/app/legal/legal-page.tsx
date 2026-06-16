import Link from "next/link";
import type { ReactNode } from "react";
import { HanaLogo } from "../components/hana-logo";
import { LandingSessionCta } from "../components/landing-session-cta";
import { breadcrumbJsonLd, jsonLd, relatedPublicPages, webpageJsonLd } from "../seo";
import { getInitialAuthenticated } from "../session-state";

interface LegalSection {
  title: string;
  body: ReactNode;
}

interface LegalPageProps {
  path: string;
  title: string;
  intro: string;
  sections: LegalSection[];
}

export async function LegalPage({ path, title, intro, sections }: LegalPageProps) {
  const initialAuthenticated = await getInitialAuthenticated();
  const relatedPages = relatedPublicPages(path, 4);
  const structuredData = [webpageJsonLd(path), breadcrumbJsonLd(path)];

  return (
    <main className="legal-shell">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLd(structuredData) }}
      />
      <header className="legal-nav">
        <Link className="brand-lockup" href="/">
          <span className="brand-symbol" aria-hidden="true">
            <HanaLogo size={22} />
          </span>
          <span>Hana Chat</span>
        </Link>
        <LandingSessionCta
          authHref="/auth"
          dashboardHref="/app"
          initialAuthenticated={initialAuthenticated}
          variant="nav"
        />
      </header>

      <article className="legal-card">
        <div className="legal-heading">
          <span>Last updated May 22, 2026</span>
          <h1>{title}</h1>
          <p>{intro}</p>
        </div>

        <div className="legal-sections">
          {sections.map((section) => (
            <section className="legal-section" key={section.title}>
              <h2>{section.title}</h2>
              <div>{section.body}</div>
            </section>
          ))}
        </div>

        <footer className="legal-support">
          <span>Need help?</span>
          <a href="mailto:support@hanachat.site">support@hanachat.site</a>
        </footer>

        <nav className="legal-related" aria-label="Related Hana pages">
          {relatedPages.map((page) => (
            <Link href={page.path} key={page.path}>
              <span>{page.shortTitle}</span>
              <small>{page.description}</small>
            </Link>
          ))}
        </nav>
      </article>
    </main>
  );
}
