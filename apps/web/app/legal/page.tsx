import Link from "next/link";
import { LegalPage } from "./legal-page";
import { createPublicMetadata } from "../seo";

export const metadata = createPublicMetadata("/legal");

export default function LegalIndexPage() {
  return (
    <LegalPage
      path="/legal"
      title="Hana legal center"
      intro="The core policies for using Hana Chat, managing private stories, publishing characters, and accessing mature spaces."
      sections={[
        {
          title: "Policies",
          body: (
            <>
              <p>
                These pages explain the public rules around account access, AI character chats,
                creator publishing, memory controls, subscriptions when available, refunds, privacy,
                and mature-space eligibility.
              </p>
              <ul>
                <li>
                  <Link href="/legal/terms">Terms of Service</Link>
                </li>
                <li>
                  <Link href="/legal/refunds">Billing and Refund Policy</Link>
                </li>
                <li>
                  <Link href="/legal/privacy">Privacy Policy</Link>
                </li>
                <li>
                  <Link href="/legal/community">Community Rules</Link>
                </li>
                <li>
                  <Link href="/legal/safety">Safety and Mature Content</Link>
                </li>
              </ul>
            </>
          ),
        },
        {
          title: "Support",
          body: (
            <>
              <p>
                For account, payment, creator, or safety questions, email{" "}
                <a href="mailto:support@hanachat.site">support@hanachat.site</a>. Include the
                account email, the character or room involved when relevant, and enough detail for
                support to route the request.
              </p>
              <p>
                Legal pages are public so users can review expectations before signing in, creating
                characters, publishing marketplace listings, or entering age-gated spaces.
              </p>
            </>
          ),
        },
      ]}
    />
  );
}
