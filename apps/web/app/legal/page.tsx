import Link from "next/link";
import { LegalPage } from "./legal-page";

export default function LegalIndexPage() {
  return (
    <LegalPage
      title="Hana legal center"
      intro="The core policies for using Hana Chat, managing private stories, publishing characters, and accessing mature spaces."
      sections={[
        {
          title: "Policies",
          body: (
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
          ),
        },
        {
          title: "Support",
          body: (
            <p>
              For account, payment, creator, or safety questions, email{" "}
              <a href="mailto:support@hanachat.site">support@hanachat.site</a>.
            </p>
          ),
        },
      ]}
    />
  );
}
