"use client";

import {
  ArrowRight,
  Camera,
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
import { type StellarPaymentIntent } from "../stellar-payments";
import { StellarCheckoutModal } from "../components/stellar-checkout-modal";

type PlanId = "free" | "plus" | "ultra";

interface SettingsResponse {
  displayName: string | null;
  avatarUrl: string | null;
  adultModeEnabled: boolean;
  memoryEnabled: boolean;
  marketingOptIn: boolean;
  activePlanId: PlanId;
  planName: string;
  monthlyMessageLimit: number;
}

interface BillingResponse {
  monetizationEnabled: boolean;
  comingSoon: boolean;
  plans: Array<{
    id: string;
    name: string;
    monthlyPriceCents: number;
    monthlyMessageLimit: number;
    deepMemoryEnabled: boolean;
    adultModeEnabled: boolean;
    comingSoon: boolean;
    currency: string;
  }>;
  subscription: {
    planId: string;
    status: string;
    currentPeriodEnd: string | null;
  };
}

interface CheckoutResponse {
  provider: "stellar";
  internalOrderId: string;
  activated?: boolean;
  payment?: StellarPaymentIntent;
  plan?: {
    name: string;
  };
}

interface MediaAssetResponse {
  id: string;
  url: string;
  purpose: "user_avatar";
  mimeType: string;
  byteSize: number;
  fileName: string;
}

const acceptedImageTypes = ["image/png", "image/jpeg", "image/webp"];
const maxClientUploadBytes = 5 * 1024 * 1024;

export default function SettingsPage() {
  const [settings, setSettings] = useState<SettingsResponse | null>(null);
  const [billing, setBilling] = useState<BillingResponse | null>(null);
  const [profileName, setProfileName] = useState("");
  const [profileAvatarUrl, setProfileAvatarUrl] = useState<string | null>(null);
  const [avatarUploadStatus, setAvatarUploadStatus] = useState("PNG, JPG, or WebP up to 5MB.");
  const [status, setStatus] = useState("Loading settings...");
  const [isCheckoutOpen, setIsCheckoutOpen] = useState(false);
  const [activePayment, setActivePayment] = useState<StellarPaymentIntent | null>(null);

  useEffect(() => {
    void load();
  }, []);

  async function load() {
    try {
      const [settingsPayload, billingPayload] = await Promise.all([
        apiJson<SettingsResponse>("/api/v1/settings"),
        apiJson<BillingResponse>("/api/v1/billing/plans"),
      ]);
      const nextSettings = normalizeSettings(settingsPayload);

      setSettings(nextSettings);
      setProfileName(nextSettings.displayName ?? "");
      setProfileAvatarUrl(nextSettings.avatarUrl);
      setBilling(normalizeBilling(billingPayload));
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

    await patchSettings({ displayName, avatarUrl: profileAvatarUrl });
  }

  async function patchSettings(input: Partial<SettingsResponse>) {
    setStatus("Saving...");

    try {
      const updated = await apiJson<SettingsResponse>("/api/v1/settings", {
        method: "PATCH",
        body: JSON.stringify(input),
      });
      const nextSettings = normalizeSettings(updated);

      setSettings(nextSettings);
      setProfileName(nextSettings.displayName ?? "");
      setProfileAvatarUrl(nextSettings.avatarUrl);
      setStatus("Settings saved.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Could not save settings.");
    }
  }

  async function toggleAdultMode() {
    if (!settings) return;
    await patchSettings({ adultModeEnabled: !settings.adultModeEnabled });
  }

  async function toggleMemoryEnabled() {
    if (!settings) return;
    await patchSettings({ memoryEnabled: !settings.memoryEnabled });
  }

  async function toggleMarketingOptIn() {
    if (!settings) return;
    await patchSettings({ marketingOptIn: !settings.marketingOptIn });
  }

  async function uploadProfileImage(file: File | undefined) {
    if (!file) return;

    if (!acceptedImageTypes.includes(file.type)) {
      setAvatarUploadStatus("Supported formats: PNG, JPG, or WebP.");
      return;
    }

    if (file.size > maxClientUploadBytes) {
      setAvatarUploadStatus("Image file size exceeds 5MB limit.");
      return;
    }

    setAvatarUploadStatus("Uploading...");

    try {
      const contentBase64 = await fileToDataUrl(file);
      const media = await apiJson<MediaAssetResponse>("/api/v1/media", {
        method: "POST",
        body: JSON.stringify({
          purpose: "user_avatar",
          fileName: file.name,
          mimeType: file.type,
          contentBase64,
        }),
      });

      setProfileAvatarUrl(media.url);
      setAvatarUploadStatus("Photo uploaded. Save profile to use it.");
    } catch (error) {
      setAvatarUploadStatus(error instanceof Error ? error.message : "Upload failed.");
    }
  }

  async function checkout(planId: "plus" | "ultra") {
    setStatus("Preparing Stellar payment...");

    try {
      const checkoutPayload = await apiJson<CheckoutResponse>("/api/v1/billing/checkout", {
        method: "POST",
        body: JSON.stringify({ planId, provider: "stellar" }),
      });

      if (checkoutPayload.activated) {
        setStatus("Plan activated.");
        await load();
        return;
      }

      if (!checkoutPayload.payment) {
        setStatus("Checkout could not start.");
        return;
      }

      setActivePayment(checkoutPayload.payment);
      setIsCheckoutOpen(true);
      setStatus("");
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

  if (!settings || !billing) {
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
            <h1>
              {status && status !== "Loading settings..."
                ? "Settings unavailable"
                : "Loading settings"}
            </h1>
            <p>{status || "Fetching your live profile, access, memory, and plan controls."}</p>
          </div>
          <button className="secondary-action compact" type="button" onClick={() => void logout()}>
            <LogOut size={16} /> Sign out
          </button>
        </section>
      </div>
    );
  }

  const billingState = billing;
  const plans = billingState.plans;
  const activePlanId = billingState.subscription?.planId ?? "free";
  const activePlan = plans.find((plan) => plan.id === activePlanId);
  const monetizationComingSoon = billingState.comingSoon ?? true;
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
          <p>Profile, access, memory, and plan controls for your private space.</p>
        </div>
        {status ? <p className="form-status">{status}</p> : null}
      </section>

      <section className="settings-dashboard">
        <form
          className="settings-card profile-settings-card"
          noValidate
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
          <div className="profile-avatar-editor">
            <div className="profile-avatar-preview">
              {profileAvatarUrl ? <img src={profileAvatarUrl} alt="" /> : <UserRound size={30} />}
            </div>
            <div>
              <label className="media-upload-button profile-upload-button">
                <Camera size={16} />
                Upload photo
                <input
                  aria-label="Upload profile photo"
                  type="file"
                  accept={acceptedImageTypes.join(",")}
                  onChange={(event) => {
                    void uploadProfileImage(event.target.files?.[0]);
                    event.currentTarget.value = "";
                  }}
                />
              </label>
              <small>{avatarUploadStatus}</small>
            </div>
          </div>
          <label>
            Display name
            <input value={profileName} onChange={(event) => setProfileName(event.target.value)} />
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
              <p>
                {monetizationComingSoon
                  ? "Paid plans are coming soon."
                  : `${activePlan?.name ?? "Free"} is active on this account.`}
              </p>
            </div>
          </div>
          <strong>
            {activePlan ? money(activePlan.monthlyPriceCents, activePlan.currency) : "$0"}
          </strong>
          <div className="billing-plan-status">
            <span>{activePlan?.monthlyMessageLimit.toLocaleString() ?? "30"} monthly messages</span>
            <span>{activePlan?.deepMemoryEnabled ? "Deep memory" : "Basic memory"}</span>
            <span>{monetizationComingSoon ? "Checkout paused" : "Wallet checkout ready"}</span>
          </div>
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
              <p>
                {monetizationComingSoon
                  ? "Creator monetization is coming soon."
                  : "Manage paid unlock revenue and payout requests."}
              </p>
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
        {plans.map((plan) => {
          const paidPlanId = plan.id === "plus" || plan.id === "ultra" ? plan.id : undefined;

          return (
            <article
              className={plan.id === activePlanId ? "pricing-card featured" : "pricing-card"}
              key={plan.id}
            >
              <div className="pricing-card-head">
                <WalletCards size={22} />
                <span>{paidPlanId ? "Wallet billing" : "Starter"}</span>
              </div>
              <h3>{plan.name}</h3>
              {plan.comingSoon ? <span className="coming-soon-pill">Coming soon</span> : null}
              <strong>
                {money(plan.monthlyPriceCents, plan.currency)}
                <span>/mo</span>
              </strong>
              <div className="plan-payment-note">
                <CreditCard size={15} />
                <span>{paidPlanId ? "Verified wallet checkout" : "Free access"}</span>
              </div>
              <ul>
                <li>
                  <Check size={15} /> {plan.monthlyMessageLimit.toLocaleString()} monthly messages
                </li>
                <li>
                  <Check size={15} /> {plan.deepMemoryEnabled ? "Deep memory" : "Basic memory"}
                </li>
                <li>
                  <Check size={15} /> {plan.adultModeEnabled ? "18+ spaces" : "Default spaces"}
                </li>
              </ul>
              {paidPlanId ? (
                <button
                  className="primary-action"
                  type="button"
                  disabled={monetizationComingSoon || paidPlanId === activePlanId}
                  onClick={() => void checkout(paidPlanId)}
                >
                  {monetizationComingSoon
                    ? "Coming soon"
                    : paidPlanId === activePlanId
                      ? "Current plan"
                      : "Upgrade"}
                </button>
              ) : null}
            </article>
          );
        })}
      </section>
      {activePayment && (
        <StellarCheckoutModal
          isOpen={isCheckoutOpen}
          onClose={() => setIsCheckoutOpen(false)}
          payment={activePayment}
          verifyPath="/api/v1/billing/stellar/verify"
          verifyBody={{ paymentId: activePayment.id }}
          onSuccess={() => {
            void load();
            setStatus("Plan activated.");
          }}
        />
      )}
    </div>
  );
}

function normalizeSettings(payload: Partial<SettingsResponse>): SettingsResponse {
  if (!payload.activePlanId) {
    throw new Error("Invalid settings.activePlanId");
  }
  if (typeof payload.planName !== "string") {
    throw new Error("Invalid settings.planName");
  }
  if (typeof payload.monthlyMessageLimit !== "number") {
    throw new Error("Invalid settings.monthlyMessageLimit");
  }

  return {
    displayName:
      payload.displayName === null || typeof payload.displayName === "string"
        ? payload.displayName
        : null,
    avatarUrl:
      payload.avatarUrl === null || typeof payload.avatarUrl === "string"
        ? payload.avatarUrl
        : null,
    adultModeEnabled: requiredBoolean(payload.adultModeEnabled, "settings.adultModeEnabled"),
    memoryEnabled: requiredBoolean(payload.memoryEnabled, "settings.memoryEnabled"),
    marketingOptIn: requiredBoolean(payload.marketingOptIn, "settings.marketingOptIn"),
    activePlanId: payload.activePlanId,
    planName: payload.planName,
    monthlyMessageLimit: payload.monthlyMessageLimit,
  };
}

function normalizeBilling(payload: Partial<BillingResponse>): BillingResponse {
  if (!Array.isArray(payload.plans) || payload.plans.length === 0) {
    throw new Error("Invalid billing.plans");
  }

  if (!payload.subscription) {
    throw new Error("Invalid billing.subscription");
  }

  return {
    monetizationEnabled: requiredBoolean(
      payload.monetizationEnabled,
      "billing.monetizationEnabled",
    ),
    comingSoon: requiredBoolean(payload.comingSoon, "billing.comingSoon"),
    plans: payload.plans,
    subscription: {
      planId: payload.subscription.planId,
      status: payload.subscription.status,
      currentPeriodEnd: payload.subscription.currentPeriodEnd,
    },
  };
}

function requiredBoolean(value: unknown, field: string): boolean {
  if (typeof value !== "boolean") {
    throw new Error(`Invalid ${field}`);
  }

  return value;
}

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.addEventListener("load", () => {
      if (typeof reader.result === "string") {
        resolve(reader.result);
      } else {
        reject(new Error("Could not read image."));
      }
    });
    reader.addEventListener("error", () => reject(new Error("Could not read image.")));
    reader.readAsDataURL(file);
  });
}
