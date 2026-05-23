"use client";

import {
  ArrowRight,
  Bell,
  Check,
  CreditCard,
  LogOut,
  LockKeyhole,
  Moon,
  ShieldCheck,
  UserRound,
  WalletCards,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { apiJson, money } from "../api";

type PlanId = "free" | "plus" | "ultra";

interface SettingsResponse {
  displayName: string | null;
  adultModeEnabled: boolean;
  memoryEnabled: boolean;
  voiceEnabled: boolean;
  marketingOptIn: boolean;
}

interface BillingPlan {
  id: PlanId;
  name: string;
  monthlyPriceCents: number;
  currency: string;
  monthlyMessageLimit: number;
  adultModeEnabled: boolean;
  voiceEnabled: boolean;
  deepMemoryEnabled: boolean;
  creatorPaidCharactersEnabled: boolean;
}

interface BillingResponse {
  plans: BillingPlan[];
  subscription: {
    planId: PlanId;
    status: string;
    currentPeriodEnd: string | null;
  };
}

interface CheckoutResponse {
  provider: "mock" | "razorpay";
  internalOrderId: string;
  activated?: boolean;
  keyId?: string;
  order?: {
    id: string;
    amount: number;
    currency: string;
  };
  plan?: {
    name: string;
  };
}

type RazorpayCheckout = new (options: {
  key: string;
  order_id: string;
  amount: number;
  currency: string;
  name: string;
  description: string;
  handler: (response: {
    razorpay_order_id: string;
    razorpay_payment_id: string;
    razorpay_signature: string;
  }) => void;
}) => {
  open: () => void;
};

declare global {
  interface Window {
    Razorpay?: RazorpayCheckout;
  }
}

const fallbackSettings: SettingsResponse = {
  displayName: "Hana User",
  adultModeEnabled: false,
  memoryEnabled: true,
  voiceEnabled: false,
  marketingOptIn: false,
};

export default function SettingsPage() {
  const [settings, setSettings] = useState<SettingsResponse>(fallbackSettings);
  const [billing, setBilling] = useState<BillingResponse | undefined>();
  const [profileName, setProfileName] = useState(fallbackSettings.displayName ?? "");
  const [status, setStatus] = useState("Loading settings...");

  useEffect(() => {
    void load();
  }, []);

  async function load() {
    try {
      const [settingsPayload, billingPayload] = await Promise.all([
        apiJson<SettingsResponse>("/api/v1/settings"),
        apiJson<BillingResponse>("/api/v1/billing/plans"),
      ]);
      setSettings(settingsPayload);
      setProfileName(settingsPayload.displayName ?? "");
      setBilling(billingPayload);
      setStatus("");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Settings unavailable.");
    }
  }

  async function saveProfile() {
    const displayName = profileName.trim();

    if (!displayName) {
      setStatus("Choose a display name.");
      return;
    }

    await patchSettings({ displayName });
  }

  async function patchSettings(input: Partial<SettingsResponse>) {
    setStatus("Saving...");

    try {
      const updated = await apiJson<SettingsResponse>("/api/v1/settings", {
        method: "PATCH",
        body: JSON.stringify(input),
      });
      setSettings(updated);
      setStatus("Saved.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Could not update setting.");
    }
  }

  async function checkout(planId: "plus" | "ultra") {
    setStatus("Opening checkout...");

    try {
      const checkoutPayload = await apiJson<CheckoutResponse>("/api/v1/billing/checkout", {
        method: "POST",
        body: JSON.stringify({ planId, provider: "razorpay" }),
      });

      if (checkoutPayload.provider === "mock" || checkoutPayload.activated) {
        setStatus("Plan activated.");
        await load();
        return;
      }

      if (!checkoutPayload.keyId || !checkoutPayload.order) {
        setStatus("Checkout could not start.");
        return;
      }

      const Razorpay = await loadRazorpay();
      const instance = new Razorpay({
        key: checkoutPayload.keyId,
        order_id: checkoutPayload.order.id,
        amount: checkoutPayload.order.amount,
        currency: checkoutPayload.order.currency,
        name: "Hana Chat",
        description: checkoutPayload.plan?.name ?? "Hana subscription",
        handler: (response) => {
          void apiJson("/api/v1/billing/razorpay/verify", {
            method: "POST",
            body: JSON.stringify({
              internalOrderId: checkoutPayload.internalOrderId,
              razorpayOrderId: response.razorpay_order_id,
              razorpayPaymentId: response.razorpay_payment_id,
              razorpaySignature: response.razorpay_signature,
            }),
          })
            .then(() => load())
            .then(() => setStatus("Plan activated."))
            .catch((error: unknown) =>
              setStatus(error instanceof Error ? error.message : "Payment verification failed."),
            );
        },
      });

      instance.open();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Checkout failed.");
    }
  }

  async function logout() {
    setStatus("Signing out...");

    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } finally {
      window.location.href = "/auth";
    }
  }

  const activePlanId = billing?.subscription.planId ?? "free";
  const activePlan = billing?.plans.find((plan) => plan.id === activePlanId);
  const toggles = [
    {
      label: "18+ mode",
      value: settings.adultModeEnabled,
      icon: LockKeyhole,
      detail: "Unlock age-gated chats on this account.",
      action: () => patchSettings({ adultModeEnabled: !settings.adultModeEnabled }),
    },
    {
      label: "Memory",
      value: settings.memoryEnabled,
      icon: Moon,
      detail: "Let characters keep private context inside each chat.",
      action: () => patchSettings({ memoryEnabled: !settings.memoryEnabled }),
    },
    {
      label: "Voice",
      value: settings.voiceEnabled,
      icon: Bell,
      detail: "Use voice features when your plan supports them.",
      action: () => patchSettings({ voiceEnabled: !settings.voiceEnabled }),
    },
  ];

  return (
    <div className="app-page settings-page">
      <section className="settings-hero">
        <div className="settings-avatar">
          <UserRound size={34} />
        </div>
        <div>
          <span className="section-label">
            <UserRound size={15} /> Account
          </span>
          <h1>Make Hana feel yours.</h1>
          <p>Profile, access, voice, and plan controls for your private space.</p>
        </div>
        {status ? <p className="form-status">{status}</p> : null}
      </section>

      <section className="settings-dashboard">
        <form
          className="settings-card profile-settings-card"
          onSubmit={(event) => {
            event.preventDefault();
            void saveProfile();
          }}
        >
          <div className="settings-card-title">
            <UserRound size={19} />
            <div>
              <h2>Profile</h2>
              <p>This is how Hana addresses you.</p>
            </div>
          </div>
          <label>
            Display name
            <input
              value={profileName}
              onChange={(event) => setProfileName(event.target.value)}
              required
            />
          </label>
          <button className="primary-action compact" type="submit">
            Save profile
          </button>
        </form>

        <section className="settings-card access-settings-card">
          <div className="settings-card-title">
            <ShieldCheck size={19} />
            <div>
              <h2>Access</h2>
              <p>Control what this account can use.</p>
            </div>
          </div>
          <div className="toggle-list">
            {toggles.map((toggle) => (
              <article className="setting-toggle-row" key={toggle.label}>
                <toggle.icon size={20} />
                <div>
                  <h3>{toggle.label}</h3>
                  <p>{toggle.detail}</p>
                </div>
                <button
                  className={toggle.value ? "switch-control on" : "switch-control"}
                  type="button"
                  role="switch"
                  aria-checked={toggle.value}
                  onClick={() => void toggle.action()}
                >
                  <span />
                </button>
              </article>
            ))}
          </div>
        </section>

        <section className="settings-card current-plan-card">
          <div className="settings-card-title">
            <CreditCard size={19} />
            <div>
              <h2>Current plan</h2>
              <p>{activePlan?.name ?? "Free"} is active on this account.</p>
            </div>
          </div>
          <strong>
            {activePlan ? money(activePlan.monthlyPriceCents, activePlan.currency) : "$0"}
          </strong>
          <span>{activePlan?.monthlyMessageLimit.toLocaleString() ?? "30"} monthly messages</span>
          <button
            className="secondary-action compact"
            type="button"
            onClick={() =>
              document.getElementById("settings-plans")?.scrollIntoView({ block: "start" })
            }
          >
            View plans
          </button>
        </section>

        <section className="settings-card account-settings-card">
          <div className="settings-card-title">
            <WalletCards size={19} />
            <div>
              <h2>Creator wallet</h2>
              <p>Manage paid unlock revenue and payout requests.</p>
            </div>
          </div>
          <Link className="secondary-action compact" href="/app/wallet">
            Open wallet <ArrowRight size={16} />
          </Link>
        </section>

        <section className="settings-card account-settings-card">
          <div className="settings-card-title">
            <LogOut size={19} />
            <div>
              <h2>Session</h2>
              <p>Sign out from this device.</p>
            </div>
          </div>
          <button className="secondary-action compact" type="button" onClick={() => void logout()}>
            <LogOut size={16} /> Sign out
          </button>
        </section>
      </section>

      <section className="pricing-grid app-pricing premium-plan-grid" id="settings-plans">
        {billing?.plans.map((plan) => {
          const paidPlanId = plan.id === "plus" || plan.id === "ultra" ? plan.id : undefined;

          return (
            <article
              className={plan.id === activePlanId ? "pricing-card featured" : "pricing-card"}
              key={plan.id}
            >
              <WalletCards size={22} />
              <h3>{plan.name}</h3>
              <strong>
                {money(plan.monthlyPriceCents, plan.currency)}
                <span>/mo</span>
              </strong>
              <ul>
                <li>
                  <Check size={15} /> {plan.monthlyMessageLimit.toLocaleString()} monthly messages
                </li>
                <li>
                  <Check size={15} /> {plan.deepMemoryEnabled ? "Deep memory" : "Basic memory"}
                </li>
                <li>
                  <Check size={15} /> {plan.voiceEnabled ? "Voice enabled" : "Text chat"}
                </li>
                <li>
                  <Check size={15} /> {plan.adultModeEnabled ? "18+ spaces" : "Default spaces"}
                </li>
              </ul>
              {paidPlanId ? (
                <button
                  className="primary-action"
                  type="button"
                  disabled={paidPlanId === activePlanId}
                  onClick={() => void checkout(paidPlanId)}
                >
                  {paidPlanId === activePlanId ? "Current plan" : "Upgrade"}
                </button>
              ) : null}
            </article>
          );
        })}
      </section>
    </div>
  );
}

async function loadRazorpay(): Promise<RazorpayCheckout> {
  if (window.Razorpay) {
    return window.Razorpay;
  }

  await new Promise<void>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://checkout.razorpay.com/v1/checkout.js";
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Checkout script failed to load."));
    document.body.appendChild(script);
  });

  if (!window.Razorpay) {
    throw new Error("Checkout is unavailable.");
  }

  return window.Razorpay;
}
