"use client";

import {
  Activity,
  ArrowDownToLine,
  ArrowRight,
  Banknote,
  CheckCircle2,
  Clock3,
  Coins,
  CreditCard,
  Landmark,
  RefreshCw,
  ReceiptText,
  ShieldCheck,
  Sparkles,
  WalletCards,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import { apiJson, money } from "../api";
import { requestWalletAddress } from "../crypto-payments";

interface WalletResponse {
  monetizationEnabled: boolean;
  comingSoon: boolean;
  wallet: {
    currency: string;
    pendingCents: number;
    availableCents: number;
    lifetimeEarnedCents: number;
    lifetimeFeeCents: number;
    lifetimePaidCents: number;
    updatedAt: string;
  };
  payoutProfile: {
    status: "draft" | "pending_review" | "verified" | "disabled";
    displayName: string;
    legalName: string | null;
    payoutMode: "crypto";
    vpaLast4: string | null;
    walletAddress?: string | null;
    walletLast4?: string | null;
    providerReady: boolean;
    updatedAt: string;
  } | null;
  ledgerEntries: Array<{
    id: string;
    type: string;
    amountCents: number;
    currency: string;
    status: string;
    availableAt: string;
    createdAt: string;
    characterName: string | null;
  }>;
  payouts: Array<{
    id: string;
    amountCents: number;
    currency: string;
    status: string;
    provider: string;
    providerPayoutId: string | null;
    failureReason: string | null;
    requestedAt: string;
    approvedAt: string | null;
    paidAt: string | null;
  }>;
  purchases: Array<{
    id: string;
    characterName: string;
    amountCents: number;
    currency: string;
    status: string;
    createdAt: string;
  }>;
  policy: {
    platformFeeBps: number;
    earningHoldDays: number;
    minimumPayoutCents: number;
  };
}

const emptyWallet: WalletResponse = {
  monetizationEnabled: false,
  comingSoon: true,
  wallet: {
    currency: "USD",
    pendingCents: 0,
    availableCents: 0,
    lifetimeEarnedCents: 0,
    lifetimeFeeCents: 0,
    lifetimePaidCents: 0,
    updatedAt: new Date().toISOString(),
  },
  payoutProfile: null,
  ledgerEntries: [],
  payouts: [],
  purchases: [],
  policy: {
    platformFeeBps: 3000,
    earningHoldDays: 7,
    minimumPayoutCents: 1000,
  },
};

export default function CreatorWalletPage() {
  const [wallet, setWallet] = useState<WalletResponse>(emptyWallet);
  const [displayName, setDisplayName] = useState("");
  const [legalName, setLegalName] = useState("");
  const [walletAddress, setWalletAddress] = useState("");
  const [payoutAmount, setPayoutAmount] = useState("");
  const [status, setStatus] = useState("Loading wallet...");

  useEffect(() => {
    void loadWallet();
  }, []);

  async function loadWallet() {
    try {
      const payload = await apiJson<WalletResponse>("/api/v1/monetization/wallet");
      setWallet(payload);
      setDisplayName(payload.payoutProfile?.displayName ?? "");
      setLegalName(payload.payoutProfile?.legalName ?? "");
      setWalletAddress(payload.payoutProfile?.walletAddress ?? "");
      setStatus("");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Wallet unavailable.");
    }
  }

  async function savePayoutProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!displayName.trim()) {
      setStatus("Enter the creator display name for payout records.");
      return;
    }

    if (!walletAddress.trim()) {
      setStatus("Enter a 0G wallet address for payouts.");
      return;
    }

    setStatus("Saving payout profile...");

    try {
      await apiJson("/api/v1/monetization/payout-profile", {
        method: "PATCH",
        body: JSON.stringify({
          displayName: displayName.trim(),
          legalName: legalName.trim(),
          payoutMode: "crypto",
          walletAddress: walletAddress.trim(),
        }),
      });
      await loadWallet();
      setStatus("Payout profile saved.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Could not save payout profile.");
    }
  }

  async function fillConnectedWallet() {
    setStatus("Connecting wallet...");

    try {
      setWalletAddress(await requestWalletAddress());
      setStatus("");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Could not read wallet address.");
    }
  }

  async function requestPayout(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const amountCents = Math.round(Number(payoutAmount) * 100);

    if (!Number.isFinite(amountCents) || amountCents <= 0) {
      setStatus("Enter a valid payout amount.");
      return;
    }

    setStatus("Requesting payout...");

    try {
      await apiJson("/api/v1/monetization/payouts", {
        method: "POST",
        body: JSON.stringify({ amountCents, currency: wallet.wallet.currency }),
      });
      setPayoutAmount("");
      await loadWallet();
      setStatus("Payout requested.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Could not request payout.");
    }
  }

  const netRate = useMemo(
    () => Math.max(0, 100 - wallet.policy.platformFeeBps / 100),
    [wallet.policy.platformFeeBps],
  );
  const profileStatus = wallet.payoutProfile?.status ?? "not set";
  const monetizationComingSoon = wallet.comingSoon;
  const profileReady =
    wallet.payoutProfile?.providerReady || wallet.payoutProfile?.status === "verified";
  const walletDisplay = walletAddress
    ? formatWalletAddress(walletAddress)
    : wallet.payoutProfile?.walletLast4
      ? `...${wallet.payoutProfile.walletLast4}`
      : "Not connected";
  const walletUpdatedAt = formatDate(wallet.wallet.updatedAt);
  const recentPurchases = wallet.purchases.slice(0, 5);
  const paymentSteps = [
    {
      label: "Buyer pays",
      detail: "Wallet transfer is verified before an unlock is granted.",
      active: wallet.purchases.length > 0 || wallet.ledgerEntries.length > 0,
      icon: Coins,
    },
    {
      label: "Earnings hold",
      detail: `${wallet.policy.earningHoldDays} day${
        wallet.policy.earningHoldDays === 1 ? "" : "s"
      } before balance becomes available.`,
      active: wallet.wallet.pendingCents > 0,
      icon: Clock3,
    },
    {
      label: "0G payout",
      detail: profileReady ? `Ready for ${walletDisplay}` : "Save and verify a wallet first.",
      active: profileReady,
      icon: ShieldCheck,
    },
  ];

  return (
    <div className="app-page wallet-page">
      <section className="wallet-hero payment-hero">
        <div className="payment-hero-copy">
          <span className="section-label">
            <WalletCards size={15} /> Creator wallet
          </span>
          <h1>Earn from characters people love.</h1>
          <p>
            {monetizationComingSoon
              ? "Creator monetization is coming soon."
              : "Track paid unlocks, held earnings, available balance, payout requests, and buyer purchases in one place."}
          </p>
          <div className="payment-hero-chips" aria-label="Wallet status">
            {monetizationComingSoon ? <span>Coming soon</span> : <span>Crypto live</span>}
            <span>{formatStatus(profileStatus)}</span>
            <span>{walletDisplay}</span>
          </div>
        </div>
        <div className="payment-command-card">
          <span>
            <Activity size={15} /> 0G settlement
          </span>
          <strong>{money(wallet.wallet.availableCents, wallet.wallet.currency)}</strong>
          <small>Available balance - updated {walletUpdatedAt}</small>
          <div className="payment-command-grid">
            <span>
              <b>{money(wallet.policy.minimumPayoutCents, wallet.wallet.currency)}</b>
              minimum
            </span>
            <span>
              <b>{netRate}%</b>
              creator net
            </span>
          </div>
          <button
            className="secondary-action compact"
            type="button"
            onClick={() => void loadWallet()}
          >
            <RefreshCw size={15} /> Refresh
          </button>
        </div>
      </section>

      <section className="wallet-metric-grid">
        <article className="wallet-metric primary">
          <Banknote size={22} />
          <span>Available</span>
          <strong>{money(wallet.wallet.availableCents, wallet.wallet.currency)}</strong>
          <small>Ready after hold and approval</small>
        </article>
        <article className="wallet-metric">
          <Clock3 size={22} />
          <span>Pending</span>
          <strong>{money(wallet.wallet.pendingCents, wallet.wallet.currency)}</strong>
          <small>{wallet.policy.earningHoldDays} day hold window</small>
        </article>
        <article className="wallet-metric">
          <Landmark size={22} />
          <span>Paid out</span>
          <strong>{money(wallet.wallet.lifetimePaidCents, wallet.wallet.currency)}</strong>
          <small>{wallet.payouts.length.toLocaleString()} payout requests</small>
        </article>
        <article className="wallet-metric">
          <ShieldCheck size={22} />
          <span>Creator net</span>
          <strong>{netRate}%</strong>
          <small>{wallet.policy.platformFeeBps / 100}% platform fee</small>
        </article>
      </section>

      <section className="payment-flow-strip" aria-label="0G payment flow">
        {paymentSteps.map((step) => (
          <article className={step.active ? "active" : ""} key={step.label}>
            <step.icon size={18} />
            <span>
              <strong>{step.label}</strong>
              <small>{step.detail}</small>
            </span>
          </article>
        ))}
      </section>

      <section className="wallet-grid">
        <form
          className="settings-card payout-card payout-profile-card"
          noValidate
          onSubmit={(event) => void savePayoutProfile(event)}
        >
          <div className="settings-card-title">
            <CreditCard size={19} />
            <div>
              <h2>Payout profile</h2>
              <p>Status: {profileStatus}</p>
            </div>
          </div>
          <div className="payment-status-panel">
            <span className={profileReady ? "memory-status positive" : "memory-status pending"}>
              {profileReady ? "Wallet ready" : "Needs setup"}
            </span>
            <strong>{walletDisplay}</strong>
            <small>Used for manual 0G payouts after admin approval.</small>
          </div>
          <label>
            Creator display name
            <input
              value={displayName}
              onChange={(event) => setDisplayName(event.target.value)}
              disabled={monetizationComingSoon}
            />
          </label>
          <label>
            Legal name
            <input
              value={legalName}
              onChange={(event) => setLegalName(event.target.value)}
              disabled={monetizationComingSoon}
            />
          </label>
          <label>
            0G wallet address
            <input
              value={walletAddress}
              onChange={(event) => setWalletAddress(event.target.value)}
              disabled={monetizationComingSoon}
              placeholder={
                wallet.payoutProfile?.walletLast4
                  ? `Saved ending ${wallet.payoutProfile.walletLast4}`
                  : "0x..."
              }
            />
          </label>
          <div className="payment-form-actions">
            <button
              className="secondary-action compact"
              type="button"
              disabled={monetizationComingSoon}
              onClick={() => void fillConnectedWallet()}
            >
              <WalletCards size={16} /> Use wallet
            </button>
            <button
              className="primary-action compact"
              type="submit"
              disabled={monetizationComingSoon}
            >
              {monetizationComingSoon ? "Coming soon" : "Save profile"}
            </button>
          </div>
          <small>
            Earnings are held for {wallet.policy.earningHoldDays} day
            {wallet.policy.earningHoldDays === 1 ? "" : "s"} before payout.
          </small>
        </form>

        <form
          className="settings-card payout-card payout-request-card"
          noValidate
          onSubmit={(event) => void requestPayout(event)}
        >
          <div className="settings-card-title">
            <ArrowDownToLine size={19} />
            <div>
              <h2>Request payout</h2>
              <p>Minimum {money(wallet.policy.minimumPayoutCents, wallet.wallet.currency)}.</p>
            </div>
          </div>
          <div className="payout-request-summary">
            <span>
              <small>Available</small>
              <strong>{money(wallet.wallet.availableCents, wallet.wallet.currency)}</strong>
            </span>
            <span>
              <small>Profile</small>
              <strong>{formatStatus(profileStatus)}</strong>
            </span>
          </div>
          <label>
            Amount
            <input
              inputMode="decimal"
              value={payoutAmount}
              onChange={(event) => setPayoutAmount(event.target.value)}
              disabled={monetizationComingSoon}
              placeholder="25.00"
            />
          </label>
          <button
            className="primary-action compact"
            type="submit"
            disabled={monetizationComingSoon || !profileReady}
          >
            {monetizationComingSoon ? "Coming soon" : "Request payout"}
          </button>
          <small>
            Admin approval is required before money leaves Hana. Failed crypto payouts are returned
            to your available balance.
          </small>
        </form>
      </section>

      <section className="wallet-ledger-grid">
        <article className="wallet-table-panel">
          <div className="panel-heading split">
            <div>
              <span className="section-label">
                <Banknote size={15} /> Ledger
              </span>
              <h2>Creator earnings</h2>
            </div>
          </div>
          <div className="wallet-table">
            {wallet.ledgerEntries.map((entry) => (
              <div className="wallet-table-row" key={entry.id}>
                <span>
                  <strong>{entry.characterName ?? entry.type}</strong>
                  <small>
                    {entry.status} · {new Date(entry.createdAt).toLocaleDateString()}
                  </small>
                </span>
                <b className={entry.amountCents >= 0 ? "positive" : "negative"}>
                  {money(entry.amountCents, entry.currency)}
                </b>
              </div>
            ))}
            {wallet.ledgerEntries.length === 0 ? (
              <div className="dashboard-empty-card compact-empty">
                <CheckCircle2 size={20} />
                <h3>No earnings yet</h3>
                <p>Publish a paid character and unlock revenue will appear here.</p>
                <Link className="secondary-action compact" href="/app/create">
                  Create character
                </Link>
              </div>
            ) : null}
          </div>
        </article>

        <article className="wallet-table-panel">
          <div className="panel-heading split">
            <div>
              <span className="section-label">
                <Landmark size={15} /> Payouts
              </span>
              <h2>Requests</h2>
            </div>
          </div>
          <div className="wallet-table">
            {wallet.payouts.map((payout) => (
              <div className="wallet-table-row" key={payout.id}>
                <span>
                  <strong>{payout.status}</strong>
                  <small>
                    {payout.provider} · {new Date(payout.requestedAt).toLocaleDateString()}
                  </small>
                </span>
                <b>{money(payout.amountCents, payout.currency)}</b>
              </div>
            ))}
            {wallet.payouts.length === 0 ? (
              <div className="dashboard-empty-card compact-empty">
                <Clock3 size={20} />
                <h3>No payout requests</h3>
                <p>Available earnings can be requested once your payout profile is verified.</p>
              </div>
            ) : null}
          </div>
        </article>
      </section>

      <section className="wallet-table-panel payment-purchases-panel">
        <div className="panel-heading split">
          <div>
            <span className="section-label">
              <ReceiptText size={15} /> Buyer payments
            </span>
            <h2>Recent unlocks</h2>
          </div>
          <Link className="secondary-action compact" href="/app/discover">
            Marketplace <ArrowRight size={15} />
          </Link>
        </div>
        <div className="wallet-table payment-purchase-list">
          {recentPurchases.map((purchase) => (
            <div className="wallet-table-row payment-purchase-row" key={purchase.id}>
              <span>
                <strong>{purchase.characterName}</strong>
                <small>
                  {formatStatus(purchase.status)} - {formatDate(purchase.createdAt)}
                </small>
              </span>
              <b>{money(purchase.amountCents, purchase.currency)}</b>
            </div>
          ))}
          {recentPurchases.length === 0 ? (
            <div className="dashboard-empty-card compact-empty">
              <Sparkles size={20} />
              <h3>No buyer payments</h3>
              <p>Paid character unlocks will appear here after successful 0G confirmation.</p>
              <Link className="secondary-action compact" href="/app/create">
                Create paid character
              </Link>
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

function formatStatus(value: string): string {
  const label = value.replace(/[_-]+/g, " ").trim();

  if (!label) {
    return "Unknown";
  }

  return label.replace(/\b[a-z]/g, (letter) => letter.toUpperCase());
}

function formatWalletAddress(value: string): string {
  const trimmed = value.trim();

  if (trimmed.length <= 14) {
    return trimmed || "Not connected";
  }

  return `${trimmed.slice(0, 6)}...${trimmed.slice(-4)}`;
}

function formatDate(value: string | null): string {
  if (!value) {
    return "No date";
  }

  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
  }).format(new Date(value));
}
