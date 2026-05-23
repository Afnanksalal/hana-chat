"use client";

import {
  ArrowDownToLine,
  Banknote,
  CheckCircle2,
  Landmark,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  UserCheck,
  UsersRound,
  WalletCards,
} from "lucide-react";
import { useEffect, useState } from "react";
import { apiJson, money } from "../api";

interface AdminMonetizationResponse {
  summary: {
    pendingCents: number;
    availableCents: number;
    lifetimeEarnedCents: number;
    lifetimeFeeCents: number;
    lifetimePaidCents: number;
    openPayoutCount: number;
    openPayoutCents: number;
  };
  pendingPayouts: Array<{
    id: string;
    creatorUserId: string;
    creatorName: string;
    profileStatus: string | null;
    vpaLast4: string | null;
    amountCents: number;
    currency: string;
    status: string;
    provider: string;
    providerPayoutId: string | null;
    failureReason: string | null;
    requestedAt: string;
  }>;
  pendingProfiles: Array<{
    creatorUserId: string;
    displayName: string;
    status: string;
    payoutMode: string;
    vpaLast4: string | null;
    providerReady: boolean;
    updatedAt: string;
  }>;
  topCreators: Array<{
    creatorUserId: string;
    displayName: string;
    currency: string;
    availableCents: number;
    pendingCents: number;
    lifetimeEarnedCents: number;
    lifetimePaidCents: number;
  }>;
}

const emptyAdmin: AdminMonetizationResponse = {
  summary: {
    pendingCents: 0,
    availableCents: 0,
    lifetimeEarnedCents: 0,
    lifetimeFeeCents: 0,
    lifetimePaidCents: 0,
    openPayoutCount: 0,
    openPayoutCents: 0,
  },
  pendingPayouts: [],
  pendingProfiles: [],
  topCreators: [],
};

export default function AdminMonetizationPage() {
  const [payload, setPayload] = useState<AdminMonetizationResponse>(emptyAdmin);
  const [status, setStatus] = useState("Loading monetization ops...");

  useEffect(() => {
    void load();
  }, []);

  async function load() {
    try {
      const data = await apiJson<AdminMonetizationResponse>("/api/v1/admin/monetization");
      setPayload(data);
      setStatus("");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Admin dashboard unavailable.");
    }
  }

  async function processPayout(payoutId: string, provider: "mock" | "manual" | "razorpayx") {
    setStatus("Processing payout...");

    try {
      await apiJson(`/api/v1/admin/monetization/payouts/${encodeURIComponent(payoutId)}/process`, {
        method: "POST",
        body: JSON.stringify({ provider }),
      });
      await load();
      setStatus("Payout updated.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Could not process payout.");
    }
  }

  async function refreshPayout(payoutId: string) {
    setStatus("Refreshing payout...");

    try {
      await apiJson(`/api/v1/admin/monetization/payouts/${encodeURIComponent(payoutId)}/refresh`, {
        method: "POST",
      });
      await load();
      setStatus("Payout refreshed.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Could not refresh payout.");
    }
  }

  async function verifyProfile(creatorUserId: string) {
    setStatus("Verifying payout profile...");

    try {
      await apiJson(
        `/api/v1/admin/monetization/payout-profiles/${encodeURIComponent(creatorUserId)}/verify`,
        { method: "POST" },
      );
      await load();
      setStatus("Payout profile verified.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Could not verify payout profile.");
    }
  }

  const summaryCards = [
    {
      label: "Open payouts",
      value: String(payload.summary.openPayoutCount),
      detail: money(payload.summary.openPayoutCents, "USD"),
      icon: ArrowDownToLine,
    },
    {
      label: "Available owed",
      value: money(payload.summary.availableCents, "USD"),
      detail: "creator balances",
      icon: WalletCards,
    },
    {
      label: "Pending hold",
      value: money(payload.summary.pendingCents, "USD"),
      detail: "release window",
      icon: Landmark,
    },
    {
      label: "Platform fees",
      value: money(payload.summary.lifetimeFeeCents, "USD"),
      detail: "lifetime",
      icon: Banknote,
    },
  ];

  return (
    <div className="app-page admin-page">
      <section className="wallet-hero">
        <div>
          <span className="section-label">
            <ShieldCheck size={15} /> Admin
          </span>
          <h1>Creator monetization ops.</h1>
          <p>
            Review payout profiles, process creator payouts, refresh provider status, and watch the
            marketplace ledger without touching the database.
          </p>
        </div>
        <button className="secondary-action compact" type="button" onClick={() => void load()}>
          <RefreshCw size={15} /> Refresh
        </button>
      </section>

      <section className="wallet-metric-grid">
        {summaryCards.map((card) => (
          <article className="wallet-metric" key={card.label}>
            <card.icon size={22} />
            <span>{card.label}</span>
            <strong>{card.value}</strong>
            <small>{card.detail}</small>
          </article>
        ))}
      </section>

      <section className="admin-grid">
        <article className="wallet-table-panel">
          <div className="panel-heading split">
            <div>
              <span className="section-label">
                <UserCheck size={15} /> Review queue
              </span>
              <h2>Payout profiles</h2>
            </div>
          </div>
          <div className="admin-card-list">
            {payload.pendingProfiles.map((profile) => (
              <article className="admin-review-card" key={profile.creatorUserId}>
                <div>
                  <strong>{profile.displayName}</strong>
                  <small>
                    {profile.payoutMode.toUpperCase()} ending {profile.vpaLast4 ?? "new"} ·{" "}
                    {profile.providerReady ? "provider linked" : "manual review"}
                  </small>
                </div>
                <button
                  className="primary-action compact"
                  type="button"
                  onClick={() => void verifyProfile(profile.creatorUserId)}
                >
                  Verify
                </button>
              </article>
            ))}
            {payload.pendingProfiles.length === 0 ? (
              <div className="dashboard-empty-card compact-empty">
                <CheckCircle2 size={20} />
                <h3>No profile reviews</h3>
                <p>New creator payout profiles will appear here before they can request payouts.</p>
              </div>
            ) : null}
          </div>
        </article>

        <article className="wallet-table-panel">
          <div className="panel-heading split">
            <div>
              <span className="section-label">
                <ArrowDownToLine size={15} /> Payout queue
              </span>
              <h2>Creator payouts</h2>
            </div>
          </div>
          <div className="admin-payout-list">
            {payload.pendingPayouts.map((payout) => (
              <article className="admin-payout-card" key={payout.id}>
                <div className="admin-payout-main">
                  <span>
                    <strong>{payout.creatorName}</strong>
                    <small>
                      {payout.status} · profile {payout.profileStatus ?? "missing"} · UPI{" "}
                      {payout.vpaLast4 ?? "unknown"}
                    </small>
                  </span>
                  <b>{money(payout.amountCents, payout.currency)}</b>
                </div>
                <div className="admin-action-row">
                  {payout.status === "processing" ? (
                    <button
                      className="secondary-action compact"
                      type="button"
                      onClick={() => void refreshPayout(payout.id)}
                    >
                      <RefreshCw size={15} /> Refresh
                    </button>
                  ) : (
                    <>
                      <button
                        className="primary-action compact"
                        type="button"
                        onClick={() => void processPayout(payout.id, "mock")}
                      >
                        Mock paid
                      </button>
                      <button
                        className="secondary-action compact"
                        type="button"
                        onClick={() => void processPayout(payout.id, "manual")}
                      >
                        Manual paid
                      </button>
                      <button
                        className="secondary-action compact"
                        type="button"
                        onClick={() => void processPayout(payout.id, "razorpayx")}
                      >
                        RazorpayX
                      </button>
                    </>
                  )}
                </div>
              </article>
            ))}
            {payload.pendingPayouts.length === 0 ? (
              <div className="dashboard-empty-card compact-empty">
                <Sparkles size={20} />
                <h3>No payout queue</h3>
                <p>Approved creator requests will queue here with provider controls.</p>
              </div>
            ) : null}
          </div>
        </article>
      </section>

      <section className="wallet-table-panel">
        <div className="panel-heading split">
          <div>
            <span className="section-label">
              <UsersRound size={15} /> Creators
            </span>
            <h2>Top creator balances</h2>
          </div>
        </div>
        <div className="wallet-table">
          {payload.topCreators.map((creator) => (
            <div className="wallet-table-row" key={creator.creatorUserId}>
              <span>
                <strong>{creator.displayName}</strong>
                <small>
                  available {money(creator.availableCents, creator.currency)} · pending{" "}
                  {money(creator.pendingCents, creator.currency)}
                </small>
              </span>
              <b>{money(creator.lifetimeEarnedCents, creator.currency)}</b>
            </div>
          ))}
          {payload.topCreators.length === 0 ? (
            <div className="dashboard-empty-card compact-empty">
              <UsersRound size={20} />
              <h3>No creator balances</h3>
              <p>
                Creator wallets are created as characters are published and paid unlocks happen.
              </p>
            </div>
          ) : null}
        </div>
      </section>

      {status ? (
        <p className="floating-status" aria-live="polite">
          {status}
        </p>
      ) : null}
    </div>
  );
}
