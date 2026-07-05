import { LegalPage } from "../legal-page";
import { createPublicMetadata } from "../../seo";

export const metadata = createPublicMetadata("/legal/community");

export default function CommunityPage() {
  return (
    <LegalPage
      path="/legal/community"
      title="Community Rules"
      intro="These rules keep public characters, creator pages, and shared spaces usable for everyone."
      sections={[
        {
          title: "Respect other users",
          body: (
            <p>
              Do not harass, threaten, stalk, dox, impersonate, or pressure other users. Hana can
              restrict accounts that make the service unsafe or unusable. Treat creator profiles,
              reports, support channels, and shared discovery spaces as community surfaces, not
              places for spam or intimidation.
            </p>
          ),
        },
        {
          title: "Public characters",
          body: (
            <p>
              Public characters must not use stolen identities, non-consensual sexual likenesses,
              illegal content, hateful content, or content designed to exploit minors. Character
              names, images, descriptions, greetings, tags, and examples should accurately describe
              the experience a user is about to enter.
            </p>
          ),
        },
        {
          title: "Creator quality",
          body: (
            <p>
              Character pages should set clear expectations. Misleading titles, spam, bait listings,
              and low-effort duplicate characters may be hidden or removed. Creators should use
              ratings and tags honestly so discovery, safety settings, and user expectations line
              up.
            </p>
          ),
        },
        {
          title: "Reporting",
          body: (
            <p>
              Report characters, messages, profiles, impersonation, stolen media, or underage
              concerns through <a href="mailto:support@hanachat.site">support@hanachat.site</a>.
              Reports may lead to review, limits, removal, or account action.
            </p>
          ),
        },
        {
          title: "Marketplace behavior",
          body: (
            <p>
              Do not manipulate marketplace visibility with fake engagement, duplicate listings,
              deceptive tags, stolen art, or misleading creator identities. Public discovery should
              help users find characters that match their intended tone, category, and rating.
            </p>
          ),
        },
      ]}
    />
  );
}
