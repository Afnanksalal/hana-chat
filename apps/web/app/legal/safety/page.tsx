import { LegalPage } from "../legal-page";
import { createPublicMetadata } from "../../seo";

export const metadata = createPublicMetadata("/legal/safety");

export default function SafetyPage() {
  return (
    <LegalPage
      path="/legal/safety"
      title="Safety and Mature Content"
      intro="Hana includes romantic and mature roleplay controls while keeping public discovery, account access, and creator content clear."
      sections={[
        {
          title: "Mature spaces",
          body: (
            <p>
              Mature spaces are off by default and require eligible paid access plus age
              confirmation. They should never appear as the default experience for younger users,
              and mature or adult character signals must be labeled through ratings, tags, and
              review controls.
            </p>
          ),
        },
        {
          title: "Boundaries",
          body: (
            <p>
              Users can set preferences and boundaries for characters. Characters should respect
              refusal, safety settings, and conversation limits. A user's boundary in one room
              should guide that room without becoming a public label or leaking into unrelated
              conversations.
            </p>
          ),
        },
        {
          title: "Not allowed",
          body: (
            <p>
              Hana does not allow sexual content involving minors, coercion, trafficking,
              non-consent, exploitation, real-person sexual impersonation, or instructions for
              illegal harm.
            </p>
          ),
        },
        {
          title: "Controls",
          body: (
            <p>
              The app provides clear ways to leave a chat, manage memories, manage subscriptions,
              and turn mature spaces off. Content reports and urgent safety issues can be sent to{" "}
              <a href="mailto:support@hanachat.site">support@hanachat.site</a>.
            </p>
          ),
        },
        {
          title: "Creator review",
          body: (
            <p>
              Mature or adult public characters may require review before they appear in discovery.
              Listings can be approved, rejected, hidden, or restricted when their profile, media,
              tags, greeting, or behavior conflicts with Hana's public safety expectations.
            </p>
          ),
        },
      ]}
    />
  );
}
