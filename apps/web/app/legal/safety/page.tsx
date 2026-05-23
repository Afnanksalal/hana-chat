import { LegalPage } from "../legal-page";

export default function SafetyPage() {
  return (
    <LegalPage
      title="Safety and Mature Content"
      intro="Hana includes romantic and mature roleplay controls while keeping public discovery, account access, and creator content clear."
      sections={[
        {
          title: "Mature spaces",
          body: (
            <p>
              Mature spaces are off by default and require eligible paid access plus age
              confirmation. They should never appear as the default experience for younger users.
            </p>
          ),
        },
        {
          title: "Boundaries",
          body: (
            <p>
              Users can set preferences and boundaries for characters. Characters should respect
              refusal, safety settings, and conversation limits.
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
              The app should provide clear ways to leave a chat, delete memories, report content,
              manage subscriptions, and turn mature spaces off.
            </p>
          ),
        },
      ]}
    />
  );
}
