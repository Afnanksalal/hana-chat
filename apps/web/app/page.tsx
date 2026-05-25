import {
  ArrowRight,
  BookHeart,
  Check,
  Download,
  MessageCircleHeart,
  ShieldCheck,
} from "lucide-react";
import { cookies } from "next/headers";
import Image from "next/image";
import Link from "next/link";
import { HanaLogo } from "./components/hana-logo";
import { LandingSessionCta } from "./components/landing-session-cta";
import { absoluteAppUrl, absoluteUrl, siteDescription, siteName } from "./seo";

const features = [
  {
    icon: MessageCircleHeart,
    title: "Chats that pick up where they left off",
    copy: "Characters remember names, preferences, story arcs, boundaries, and the little details that make a conversation feel alive.",
  },
  {
    icon: BookHeart,
    title: "Create worlds, not just bots",
    copy: "Design personalities, opening scenes, private lore, relationship style, and long-running stories you can keep refining.",
  },
  {
    icon: ShieldCheck,
    title: "Private spaces with clear controls",
    copy: "Keep conversations text-first with memory, account access, mature-space controls, and subscriber-only room depth.",
  },
];

const pricingPlans = [
  {
    name: "Free",
    price: "$0",
    note: "Start chatting today",
    perks: ["30 messages daily", "Public character discovery", "Create starter characters"],
    cta: "Start free",
  },
  {
    name: "Hana Plus",
    price: "$9.99",
    note: "For daily roleplay",
    perks: ["More messages", "Deeper memory", "Private character drafts", "Creator tools"],
    cta: "Go Plus",
    featured: true,
  },
  {
    name: "Hana Ultra",
    price: "$19.99",
    note: "For power users",
    perks: [
      "Priority replies",
      "18+ spaces after age confirmation",
      "Advanced memory controls",
      "Higher monthly message limits",
    ],
    cta: "Unlock Ultra",
  },
];

export default async function LandingPage() {
  const cookieStore = await cookies();
  const initialAuthenticated = Boolean(
    cookieStore.get(process.env["AUTH_COOKIE_NAME"] ?? "hana_session")?.value,
  );
  const androidApkUrl = getAndroidApkDownloadUrl();
  const structuredData = {
    "@context": "https://schema.org",
    "@type": "WebApplication",
    name: siteName,
    description: siteDescription,
    url: absoluteUrl("/"),
    image: absoluteUrl("/assets/hana-hero.png"),
    applicationCategory: "EntertainmentApplication",
    operatingSystem: "Web, iOS, Android",
    installUrl: androidApkUrl ? absoluteUrl(androidApkUrl) : absoluteAppUrl("/auth"),
    offers: pricingPlans.map((plan) => ({
      "@type": "Offer",
      name: plan.name,
      price: plan.price.replace("$", ""),
      priceCurrency: "USD",
      availability: "https://schema.org/InStock",
      url: absoluteAppUrl("/auth"),
    })),
    publisher: {
      "@type": "Organization",
      name: siteName,
      url: absoluteUrl("/"),
      logo: absoluteUrl("/assets/hana-icon-512.png"),
    },
  };
  const structuredDataJson = JSON.stringify(structuredData).replace(/</g, "\\u003c");

  return (
    <main className="site-shell">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: structuredDataJson }} />
      <header className="site-nav">
        <Link className="brand-lockup" href="/">
          <span className="brand-symbol" aria-hidden="true">
            <HanaLogo size={22} />
          </span>
          <span>Hana Chat</span>
        </Link>
        <nav className="site-links" aria-label="Landing navigation">
          <a href="#features">Features</a>
          <a href="#pricing">Pricing</a>
        </nav>
        <LandingSessionCta
          authHref="/auth"
          dashboardHref="/app"
          initialAuthenticated={initialAuthenticated}
          variant="nav"
        />
      </header>

      <section className="landing-hero">
        <div className="hero-art" aria-hidden="true">
          <Image src="/assets/hana-hero.png" alt="" priority fill sizes="100vw" />
        </div>
        <div className="hero-copy">
          <h1>Chat with characters who remember you.</h1>
          <p>
            Meet anime-inspired companions, build private stories, and come back to conversations
            that still know your world.
          </p>
          <div className="hero-actions">
            <LandingSessionCta
              authHref="/auth"
              dashboardHref="/app"
              initialAuthenticated={initialAuthenticated}
              variant="hero"
            >
              Start chatting
            </LandingSessionCta>
            <a className="secondary-action" href="#features">
              See features <ArrowRight size={18} />
            </a>
            {androidApkUrl ? (
              <a className="secondary-action android-download-action" href={androidApkUrl}>
                Android APK <Download size={18} />
              </a>
            ) : null}
          </div>
        </div>
      </section>

      <section className="feature-showcase" id="features">
        <div className="section-intro">
          <h2>Built for obsession, comfort, and long stories.</h2>
          <p>
            Hana is for people who want characters that feel consistent, remember the emotional
            history, and make every return feel personal.
          </p>
        </div>
        <div className="feature-grid">
          {features.map((feature) => (
            <article className="feature-card" key={feature.title}>
              <feature.icon size={24} />
              <h3>{feature.title}</h3>
              <p>{feature.copy}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="pricing-section" id="pricing">
        <div className="section-intro">
          <h2>Start free. Upgrade when Hana becomes part of your night.</h2>
          <p>
            Keep the free tier simple, make premium feel worth it, and give power users a clear
            reason to stay.
          </p>
        </div>
        <div className="pricing-grid">
          {pricingPlans.map((plan) => (
            <article
              className={plan.featured ? "pricing-card featured" : "pricing-card"}
              key={plan.name}
            >
              <div>
                <h3>{plan.name}</h3>
                <p>{plan.note}</p>
              </div>
              <strong>
                {plan.price}
                <span>/mo</span>
              </strong>
              <ul>
                {plan.perks.map((perk) => (
                  <li key={perk}>
                    <Check size={16} />
                    {perk}
                  </li>
                ))}
              </ul>
              <LandingSessionCta
                authHref="/auth"
                dashboardHref="/app"
                initialAuthenticated={initialAuthenticated}
                tone={plan.featured ? "primary" : "secondary"}
                variant="pricing"
              >
                {plan.cta}
              </LandingSessionCta>
            </article>
          ))}
        </div>
      </section>

      <footer className="site-footer">
        <Link className="brand-lockup" href="/">
          <span className="brand-symbol" aria-hidden="true">
            <HanaLogo size={22} />
          </span>
          <span>Hana Chat</span>
        </Link>
        <nav aria-label="Legal links">
          <Link href="/legal/terms">Terms</Link>
          <Link href="/legal/refunds">Refunds</Link>
          <Link href="/legal/privacy">Privacy</Link>
          <Link href="/legal/community">Community rules</Link>
          <Link href="/legal/safety">Safety</Link>
          <a href="mailto:support@hanachat.site">Contact</a>
        </nav>
      </footer>
    </main>
  );
}

function getAndroidApkDownloadUrl(): string | undefined {
  const value = (
    process.env["ANDROID_APK_DOWNLOAD_URL"] ??
    process.env["NEXT_PUBLIC_ANDROID_APK_URL"] ??
    ""
  ).trim();

  if (!value) {
    return undefined;
  }

  if (value.startsWith("/")) {
    return value;
  }

  try {
    return new URL(value).toString();
  } catch {
    return undefined;
  }
}
