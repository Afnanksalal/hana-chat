import { LegalPage } from "../legal-page";

export default function CommunityPage() {
  return (
    <LegalPage
      title="Community Rules"
      intro="These rules keep public characters, creator pages, and shared spaces usable for everyone."
      sections={[
        {
          title: "Respect other users",
          body: (
            <p>
              Do not harass, threaten, stalk, dox, impersonate, or pressure other users. Hana can
              restrict accounts that make the service unsafe or unusable.
            </p>
          ),
        },
        {
          title: "Public characters",
          body: (
            <p>
              Public characters must not use stolen identities, non-consensual sexual likenesses,
              illegal content, hateful content, or content designed to exploit minors.
            </p>
          ),
        },
        {
          title: "Creator quality",
          body: (
            <p>
              Character pages should set clear expectations. Misleading titles, spam, bait listings,
              and low-effort duplicate characters may be hidden or removed.
            </p>
          ),
        },
        {
          title: "Reporting",
          body: (
            <p>
              Users should be able to report characters, messages, and profiles from inside the app.
              Reports may lead to review, limits, removal, or account action.
            </p>
          ),
        },
      ]}
    />
  );
}
