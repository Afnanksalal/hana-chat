import { LegalPage } from "../legal-page";
import { createPublicMetadata } from "../../seo";

export const metadata = createPublicMetadata("/legal/refunds");

export default function RefundPolicyPage() {
  return (
    <LegalPage
      path="/legal/refunds"
      title="Billing and Refund Policy"
      intro="This policy explains paid plans, renewals, cancellations, failed payments, refunds, charge issues, and support routes for Hana Chat."
      sections={[
        {
          title: "Paid plans",
          body: (
            <p>
              Hana Chat may offer subscriptions, paid character access, message limits, memory
              upgrades, and mature spaces. Prices, plan benefits, billing interval, currency, taxes,
              and payment provider details are shown before checkout.
            </p>
          ),
        },
        {
          title: "Renewals and cancellation",
          body: (
            <p>
              Subscriptions renew automatically unless cancelled before the next billing date.
              Cancellation stops future renewals but does not remove access already paid for during
              the active billing period unless required by law or platform policy.
            </p>
          ),
        },
        {
          title: "Refund eligibility",
          body: (
            <ul>
              <li>
                Duplicate charges, billing errors, or accidental duplicate purchases may be
                refunded.
              </li>
              <li>
                If premium access was not delivered because of a technical fault, contact support
                and include the payment reference.
              </li>
              <li>
                Refunds are generally not available for used subscription periods, policy
                violations, abuse, chargeback fraud, banned accounts, or consumed digital access.
              </li>
              <li>
                App Store, Google Play, Razorpay, card-network, bank, and local-law rules may
                control whether a refund is available and how it is processed.
              </li>
            </ul>
          ),
        },
        {
          title: "Refund process",
          body: (
            <p>
              Send refund requests to{" "}
              <a href="mailto:support@hanachat.site">support@hanachat.site</a> with your account
              email address, order ID, payment ID, date, amount, and reason. Approved refunds are
              returned to the original payment method when supported by the payment provider.
              Provider and bank processing times can vary after Hana approves the request.
            </p>
          ),
        },
        {
          title: "Failed payments and access",
          body: (
            <p>
              Failed, reversed, disputed, or high-risk payments may prevent premium activation or
              temporarily limit paid features. Hana may retry payment, ask for updated billing
              details, or downgrade an account when payment cannot be completed.
            </p>
          ),
        },
        {
          title: "Creator monetization",
          body: (
            <p>
              Creator earnings, paid character availability, reversals, refunds, fraud reviews, and
              payout timing may be adjusted when a buyer receives a refund, a payment is disputed,
              or a character violates platform rules.
            </p>
          ),
        },
        {
          title: "Support",
          body: (
            <p>
              For billing, subscription, refund, cancellation, or payment-access questions, email{" "}
              <a href="mailto:support@hanachat.site">support@hanachat.site</a>.
            </p>
          ),
        },
      ]}
    />
  );
}
