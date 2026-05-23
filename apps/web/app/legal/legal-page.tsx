import Link from "next/link";
import type { ReactNode } from "react";
import { HanaLogo } from "../components/hana-logo";

interface LegalSection {
  title: string;
  body: ReactNode;
}

interface LegalPageProps {
  title: string;
  intro: string;
  sections: LegalSection[];
}

export function LegalPage({ title, intro, sections }: LegalPageProps) {
  return (
    <main className="legal-shell">
      <header className="legal-nav">
        <Link className="brand-lockup" href="/">
          <span className="brand-symbol" aria-hidden="true">
            <HanaLogo size={22} />
          </span>
          <span>Hana Chat</span>
        </Link>
        <Link className="nav-cta" href="/auth">
          Sign in
        </Link>
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
      </article>
    </main>
  );
}
