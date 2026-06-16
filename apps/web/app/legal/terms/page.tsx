import { LegalPage } from "../legal-page";
import { createPublicMetadata } from "../../seo";

export const metadata = createPublicMetadata("/legal/terms");

export default function TermsPage() {
  return (
    <LegalPage
      path="/legal/terms"
      title="Terms of Service"
      intro="These terms explain the rules for using Hana Chat, subscriptions, characters, and account access."
      sections={[
        {
          title: "Using Hana",
          body: (
            <p>
              Hana Chat is an AI character and roleplay service. You are responsible for how you use
              the app, the characters you create, and the content you publish or share.
            </p>
          ),
        },
        {
          title: "Accounts",
          body: (
            <p>
              You must provide accurate account information and keep access to your account secure.
              Hana may limit, suspend, or remove accounts that abuse the service, evade limits, or
              harm other users.
            </p>
          ),
        },
        {
          title: "Subscriptions",
          body: (
            <p>
              Paid plans unlock additional usage, premium features, and mature spaces where
              available. Prices, benefits, renewal terms, taxes, and billing provider details are
              shown before purchase. Subscriptions renew unless cancelled before the next billing
              date.
            </p>
          ),
        },
        {
          title: "Cancellations and refunds",
          body: (
            <p>
              You can cancel future renewals from account settings or by contacting{" "}
              <a href="mailto:support@hanachat.site">support@hanachat.site</a>. Refund eligibility,
              timelines, duplicate-charge handling, and store-provider rules are described in the{" "}
              <a href="/legal/refunds">Billing and Refund Policy</a>.
            </p>
          ),
        },
        {
          title: "Characters and content",
          body: (
            <p>
              You keep responsibility for characters, prompts, names, images, and stories you
              submit. Public characters may be reviewed, removed, or restricted if they violate our
              rules.
            </p>
          ),
        },
        {
          title: "AI output",
          body: (
            <p>
              AI responses can be inaccurate, unexpected, or fictional. Do not rely on Hana for
              medical, legal, financial, emergency, or professional advice.
            </p>
          ),
        },
        {
          title: "Contact",
          body: (
            <p>
              Questions about these terms, billing, account access, or safety can be sent to{" "}
              <a href="mailto:support@hanachat.site">support@hanachat.site</a>.
            </p>
          ),
        },
      ]}
    />
  );
}
