import { LegalPage } from "../legal-page";
import { createPublicMetadata } from "../../seo";

export const metadata = createPublicMetadata("/legal/privacy");

export default function PrivacyPage() {
  return (
    <LegalPage
      path="/legal/privacy"
      title="Hana Chat Privacy Policy"
      intro="This policy describes the information Hana uses to run chats, remember preferences, process payments, and protect accounts."
      sections={[
        {
          title: "Information we collect",
          body: (
            <p>
              Hana may collect account details, email address, subscription status, device signals,
              messages, character settings, saved memories, creator profile details, marketplace
              actions, reports, and support requests.
            </p>
          ),
        },
        {
          title: "How information is used",
          body: (
            <p>
              We use information to provide chats, personalize characters, keep memories available,
              process payments, improve safety, prevent abuse, and maintain the service.
            </p>
          ),
        },
        {
          title: "Memory controls",
          body: (
            <p>
              Saved memories are meant to make conversations feel continuous. Users should be able
              to view, edit, and delete memories inside each chat's settings. Memory is designed for
              the current character room, not as a public profile or a cross-character advertising
              record.
            </p>
          ),
        },
        {
          title: "Sharing",
          body: (
            <p>
              Hana does not sell private chat messages. We may share limited information with
              vendors that help run payments, infrastructure, safety, analytics, and customer
              support.
            </p>
          ),
        },
        {
          title: "Payments and support",
          body: (
            <p>
              Payment processors may receive transaction, subscription, fraud-prevention, refund,
              and tax information needed to complete purchases. Support requests sent to{" "}
              <a href="mailto:support@hanachat.site">support@hanachat.site</a> may include account,
              billing, and safety context needed to resolve the request.
            </p>
          ),
        },
        {
          title: "Age",
          body: (
            <p>
              Hana is not intended for children under 13. Mature spaces are only for users who meet
              the required age and access rules in their region.
            </p>
          ),
        },
        {
          title: "User choices",
          body: (
            <p>
              Users can update profile details, adjust safety preferences, delete rooms, remove
              memories, cancel paid access when available, and contact support about account or data
              questions. Some records may be retained when needed for security, billing, legal
              compliance, dispute handling, or abuse prevention.
            </p>
          ),
        },
      ]}
    />
  );
}
