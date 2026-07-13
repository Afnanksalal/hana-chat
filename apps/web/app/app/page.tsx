"use client";

import {
  Activity,
  ArrowRight,
  BookHeart,
  Brain,
  Check,
  Compass,
  CreditCard,
  Crown,
  Flame,
  MessageSquareText,
  Plus,
  ShieldCheck,
  Sparkles,
  Wand2,
  WalletCards,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { apiJson, money } from "./api";
import { StellarCheckoutModal } from "./components/stellar-checkout-modal";
import { renderRoleplayPreview } from "./roleplay-preview";
import type { StellarPaymentIntent } from "./stellar-payments";

interface DashboardResponse {
  user: {
    displayName: string;
    roles?: string[];
  };
  plan: {
    id: string;
    name: string;
  };
  usage: {
    monthlyMessagesUsed: number;
    monthlyMessagesLimit: number;
    messagesRemaining: number;
  };
  counts: {
    savedMemories: number;
    createdCharacters: number;
    activeConversations: number;
  };
  nextAction: string;
}

interface CharacterSummary {
  id: string;
  name: string;
  description: string;
  avatarUrl?: string;
  marketplacePreview?: string;
  marketplaceCategory?: string;
  rating?: string;
  tags?: string[];
}

interface ConversationSummary {
  id: string;
  characterId: string;
  updatedAt: string;
  character: CharacterSummary;
  lastMessage: {
    id: string;
    role: string;
    content: string;
    createdAt: string;
  } | null;
}

interface BillingPlan {
  id: string;
  name: string;
  monthlyPriceCents: number;
  monthlyCredits?: number;
  monthlyMessageLimit: number;
  deepMemoryEnabled: boolean;
  adultModeEnabled: boolean;
  comingSoon: boolean;
  currency: string;
}

interface BillingResponse {
  comingSoon: boolean;
  plans: BillingPlan[];
  subscription: {
    planId: string;
  };
}

interface CheckoutResponse {
  payment?: StellarPaymentIntent;
}

export default function AppHomePage() {
  const [dashboard, setDashboard] = useState<DashboardResponse | null>(null);
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [characters, setCharacters] = useState<CharacterSummary[]>([]);
  const [billing, setBilling] = useState<BillingResponse | null>(null);
  const [activePayment, setActivePayment] = useState<StellarPaymentIntent | null>(null);
  const [isCheckoutOpen, setIsCheckoutOpen] = useState(false);
  const [preparingPlanId, setPreparingPlanId] = useState<string | null>(null);
  const [status, setStatus] = useState("");

  useEffect(() => {
    let mounted = true;

    Promise.all([
      apiJson<DashboardResponse>("/api/v1/dashboard"),
      apiJson<{ conversations: ConversationSummary[] }>("/api/v1/chat/conversations"),
      apiJson<{ characters: CharacterSummary[] }>("/api/v1/characters/recommended"),
      apiJson<BillingResponse>("/api/v1/billing/plans"),
    ])
      .then(([dashboardPayload, conversationPayload, characterPayload, billingPayload]) => {
        if (mounted) {
          setDashboard(normalizeDashboard(dashboardPayload));
          setConversations(
            Array.isArray(conversationPayload.conversations)
              ? conversationPayload.conversations
              : [],
          );
          setCharacters(
            Array.isArray(characterPayload.characters) ? characterPayload.characters : [],
          );
          setBilling(normalizeBilling(billingPayload));
          setStatus("");
        }
      })
      .catch((error: unknown) => {
        if (mounted) {
          setStatus(error instanceof Error ? error.message : "Dashboard unavailable");
        }
      });

    return () => {
      mounted = false;
    };
  }, []);

  if (!dashboard) {
    return (
      <div className="app-page dashboard-page">
        <section className="dashboard-hero">
          <div className="dashboard-hero-copy">
            <span className="section-label">
              <Sparkles size={15} /> Welcome back
            </span>
            <h1>{status ? "Dashboard unavailable" : "Loading your rooms"}</h1>
            <p>{status || "Fetching your live account, rooms, memories, and plan state."}</p>
            <div className="dashboard-actions">
              <Link className="primary-action" href="/app/chat">
                Open chat <ArrowRight size={18} />
              </Link>
              <Link className="secondary-action" href="/app/discover">
                Browse characters <Compass size={18} />
              </Link>
            </div>
          </div>
        </section>
      </div>
    );
  }

  const usagePercent = Math.min(
    100,
    Math.round(
      (dashboard.usage.monthlyMessagesUsed / Math.max(1, dashboard.usage.monthlyMessagesLimit)) *
        100,
    ),
  );
  const featuredCharacters = characters
    .filter((character) => !conversations.some((item) => item.characterId === character.id))
    .slice(0, 3);
  const recentConversations = conversations.slice(0, 4);
  const isAdmin = dashboard.user.roles?.includes("admin") ?? false;
  const plans = billing?.plans ?? [];
  const activePlanId = billing?.subscription.planId ?? dashboard.plan.id;
  const monetizationComingSoon = billing?.comingSoon ?? true;
  const healthItems = [
    {
      label: "Credits left",
      value: dashboard.usage.messagesRemaining.toLocaleString(),
      icon: MessageSquareText,
    },
    {
      label: "Active rooms",
      value: String(dashboard.counts.activeConversations),
      icon: BookHeart,
    },
    { label: "Saved memories", value: String(dashboard.counts.savedMemories), icon: Brain },
    { label: "Plan", value: dashboard.plan.name, icon: WalletCards },
  ];

  async function openPlanWallet(plan: BillingPlan) {
    if (plan.id === "free" || plan.id === activePlanId || monetizationComingSoon) {
      return;
    }

    setPreparingPlanId(plan.id);
    setStatus("");

    try {
      const checkout = await apiJson<CheckoutResponse>("/api/v1/billing/checkout", {
        method: "POST",
        body: JSON.stringify({ planId: plan.id, provider: "stellar" }),
      });

      if (!checkout.payment) {
        throw new Error("Wallet checkout could not start.");
      }

      setActivePayment(checkout.payment);
      setIsCheckoutOpen(true);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Could not open wallet checkout.");
    } finally {
      setPreparingPlanId(null);
    }
  }

  return (
    <div className="app-page dashboard-page">
      <section className="dashboard-hero">
        <div className="dashboard-hero-copy">
          <span className="section-label">
            <Sparkles size={15} /> Welcome back
          </span>
          <h1>{greetingFor(dashboard.user.displayName)}</h1>
          <p>
            Your rooms, saved context, creator tools, and premium controls are ready. Pick up a
            story or build the next character people obsess over.
          </p>
          <div className="dashboard-actions">
            <Link className="primary-action" href="/app/chat">
              Continue chatting <ArrowRight size={18} />
            </Link>
            <Link className="secondary-action" href="/app/create">
              Create character <Plus size={18} />
            </Link>
          </div>
        </div>

        <div className="dashboard-hero-card">
          <img className="dashboard-mascot large" src="/assets/hana-mascot.png" alt="" />
          <div>
            <span>Monthly energy</span>
            <strong>{dashboard.usage.messagesRemaining.toLocaleString()}</strong>
            <p>credits left on {dashboard.plan.name}</p>
          </div>
          <div className="usage-meter" aria-label={`${usagePercent}% monthly usage used`}>
            <span style={{ width: `${usagePercent}%` }} />
          </div>
        </div>
      </section>

      <section className="metric-grid premium-metric-grid" aria-label="Account overview">
        {healthItems.map((item) => (
          <article className="metric-card premium-metric-card" key={item.label}>
            <item.icon size={22} />
            <span>{item.label}</span>
            <strong>{item.value}</strong>
          </article>
        ))}
      </section>

      <section
        className="dashboard-panel dashboard-pricing-panel"
        aria-labelledby="dashboard-pricing-title"
      >
        <div className="panel-heading split">
          <div>
            <span className="section-label">
              <WalletCards size={15} /> Plans and pricing
            </span>
            <h2 id="dashboard-pricing-title">Choose your Hana plan</h2>
          </div>
          <span className="dashboard-pricing-network">
            <CreditCard size={15} /> Freighter {activePayment?.network ?? "testnet"}
          </span>
        </div>

        <div className="pricing-grid app-pricing premium-plan-grid" aria-label="Hana plans">
          {plans.map((plan) => {
            const isCurrentPlan = plan.id === activePlanId;
            const isPaidPlan = plan.id !== "free";
            const isPreparing = preparingPlanId === plan.id;
            const checkoutPaused = monetizationComingSoon || plan.comingSoon;

            return (
              <article
                className={
                  isCurrentPlan || plan.id === "plus" ? "pricing-card featured" : "pricing-card"
                }
                key={plan.id}
              >
                <div className="pricing-card-head">
                  <WalletCards size={22} />
                  <span>{isPaidPlan ? "Freighter Testnet" : "Starter"}</span>
                </div>
                <div>
                  <h3>{plan.name}</h3>
                  {isPaidPlan ? (
                    <button
                      className="dashboard-price-button"
                      type="button"
                      disabled={checkoutPaused || isCurrentPlan || Boolean(preparingPlanId)}
                      onClick={() => void openPlanWallet(plan)}
                    >
                      <strong>
                        {money(plan.monthlyPriceCents, plan.currency)}
                        <span>/mo</span>
                      </strong>
                      <small>Click price to open Freighter</small>
                    </button>
                  ) : (
                    <strong>
                      {money(plan.monthlyPriceCents, plan.currency)}
                      <span>/mo</span>
                    </strong>
                  )}
                </div>
                <div className="plan-payment-note">
                  <CreditCard size={15} />
                  <span>{isPaidPlan ? "Open wallet to continue" : "Free access"}</span>
                </div>
                <ul>
                  <li>
                    <Check size={15} /> {planCredits(plan).toLocaleString()} monthly credits
                  </li>
                  <li>
                    <Check size={15} /> {plan.deepMemoryEnabled ? "Deep memory" : "Basic memory"}
                  </li>
                  <li>
                    <Check size={15} /> {plan.adultModeEnabled ? "18+ spaces" : "Default spaces"}
                  </li>
                </ul>
                {isPaidPlan ? (
                  <button
                    className="primary-action"
                    type="button"
                    disabled={checkoutPaused || isCurrentPlan || Boolean(preparingPlanId)}
                    onClick={() => void openPlanWallet(plan)}
                  >
                    {checkoutPaused
                      ? "Checkout paused"
                      : isCurrentPlan
                        ? "Current plan"
                        : isPreparing
                          ? "Opening wallet..."
                          : "Choose plan"}
                    {!checkoutPaused && !isCurrentPlan ? <WalletCards size={16} /> : null}
                  </button>
                ) : (
                  <span className="dashboard-plan-included">Included with your account</span>
                )}
              </article>
            );
          })}
        </div>
      </section>

      <section className="dashboard-grid">
        <article className="dashboard-panel recent-panel">
          <div className="panel-heading split">
            <div>
              <span className="section-label">
                <MessageSquareText size={15} /> Recent rooms
              </span>
              <h2>Jump back in</h2>
            </div>
            <Link className="secondary-action compact" href="/app/chat">
              Open all <ArrowRight size={15} />
            </Link>
          </div>

          <div className="dashboard-room-list">
            {recentConversations.map((conversation) => (
              <Link
                className="dashboard-room-row"
                href={`/app/chat?characterId=${encodeURIComponent(
                  conversation.characterId,
                )}&conversationId=${encodeURIComponent(conversation.id)}`}
                key={conversation.id}
              >
                <img
                  src={conversation.character.avatarUrl ?? "/assets/character-avatar-default.svg"}
                  alt=""
                />
                <span>
                  <strong>{conversation.character.name}</strong>
                  <small>
                    {renderRoleplayPreview(conversation.lastMessage?.content ?? "No messages yet")}
                  </small>
                </span>
                <ArrowRight size={16} />
              </Link>
            ))}
            {recentConversations.length === 0 ? (
              <div className="dashboard-empty-card">
                <MessageSquareText size={22} />
                <h3>No rooms yet</h3>
                <p>Start with a public character and Hana will keep the thread here.</p>
                <Link className="primary-action compact" href="/app/discover">
                  Browse characters
                </Link>
              </div>
            ) : null}
          </div>
        </article>

        <aside className="dashboard-panel command-panel">
          <div className="panel-heading split">
            <div>
              <span className="section-label">
                <Crown size={15} /> Studio
              </span>
              <h2>Creator lane</h2>
            </div>
          </div>
          <div className="command-list">
            <Link href="/app/create">
              <Wand2 size={18} />
              <span>
                <strong>Build a character</strong>
                <small>Persona, greeting, images, market profile.</small>
              </span>
            </Link>
            <Link href="/app/memory">
              <Brain size={18} />
              <span>
                <strong>Memory Vault</strong>
                <small>Room snapshots, exports, and soul-pack archives.</small>
              </span>
            </Link>
            <Link href="/app/wallet">
              <WalletCards size={18} />
              <span>
                <strong>Creator wallet</strong>
                <small>Monetization setup and payout readiness.</small>
              </span>
            </Link>
            <Link href="/app/discover">
              <Compass size={18} />
              <span>
                <strong>Study marketplace</strong>
                <small>See what rooms are pulling attention.</small>
              </span>
            </Link>
            <Link href="/app/settings">
              <ShieldCheck size={18} />
              <span>
                <strong>Account controls</strong>
                <small>Plan, 18+ access, memory, and profile.</small>
              </span>
            </Link>
            {isAdmin ? (
              <Link href="/app/admin">
                <Activity size={18} />
                <span>
                  <strong>Admin command center</strong>
                  <small>Analytics, queues, safety, and payouts.</small>
                </span>
              </Link>
            ) : null}
          </div>
        </aside>

        <article className="dashboard-panel discovery-panel">
          <div className="panel-heading split">
            <div>
              <span className="section-label">
                <Flame size={15} /> Suggested tonight
              </span>
              <h2>New rooms to try</h2>
            </div>
            <Link className="secondary-action compact" href="/app/discover">
              Discover <ArrowRight size={15} />
            </Link>
          </div>

          <div className="dashboard-character-grid">
            {featuredCharacters.map((character) => (
              <Link
                className="dashboard-character-card"
                href={`/app/chat?characterId=${encodeURIComponent(character.id)}`}
                key={character.id}
              >
                <img src={character.avatarUrl ?? "/assets/character-avatar-default.svg"} alt="" />
                <span>{character.marketplaceCategory ?? character.rating ?? "featured"}</span>
                <h3>{character.name}</h3>
                <p>
                  {renderRoleplayPreview(character.marketplacePreview ?? character.description)}
                </p>
              </Link>
            ))}
          </div>
        </article>
      </section>

      {activePayment ? (
        <StellarCheckoutModal
          isOpen={isCheckoutOpen}
          onClose={() => setIsCheckoutOpen(false)}
          payment={activePayment}
          openWalletOnStart
          verifyPath="/api/v1/billing/stellar/verify"
          verifyBody={{ paymentId: activePayment.id }}
          onSuccess={() => {
            setStatus("Plan activated.");
            void refreshBilling();
          }}
        />
      ) : null}

      {status ? <p className="floating-status">{status}</p> : null}
    </div>
  );

  async function refreshBilling() {
    try {
      setBilling(normalizeBilling(await apiJson<BillingResponse>("/api/v1/billing/plans")));
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Could not refresh your plan.");
    }
  }
}

function greetingFor(displayName: string): string {
  const firstName = displayName.trim().split(/\s+/)[0] || "there";

  return `Your rooms are ready, ${firstName}.`;
}

function normalizeDashboard(payload: Partial<DashboardResponse>): DashboardResponse {
  return {
    user: {
      displayName: requiredString(payload.user?.displayName, "dashboard.user.displayName"),
      roles: Array.isArray(payload.user?.roles) ? payload.user.roles : [],
    },
    plan: {
      id: requiredString(payload.plan?.id, "dashboard.plan.id"),
      name: requiredString(payload.plan?.name, "dashboard.plan.name"),
    },
    usage: {
      monthlyMessagesUsed: requiredNumber(
        payload.usage?.monthlyMessagesUsed,
        "dashboard.usage.monthlyMessagesUsed",
      ),
      monthlyMessagesLimit: requiredNumber(
        payload.usage?.monthlyMessagesLimit,
        "dashboard.usage.monthlyMessagesLimit",
      ),
      messagesRemaining: requiredNumber(
        payload.usage?.messagesRemaining,
        "dashboard.usage.messagesRemaining",
      ),
    },
    counts: {
      savedMemories: requiredNumber(
        payload.counts?.savedMemories,
        "dashboard.counts.savedMemories",
      ),
      createdCharacters: requiredNumber(
        payload.counts?.createdCharacters,
        "dashboard.counts.createdCharacters",
      ),
      activeConversations: requiredNumber(
        payload.counts?.activeConversations,
        "dashboard.counts.activeConversations",
      ),
    },
    nextAction: requiredString(payload.nextAction, "dashboard.nextAction"),
  };
}

function normalizeBilling(payload: Partial<BillingResponse>): BillingResponse {
  if (!Array.isArray(payload.plans) || payload.plans.length === 0) {
    throw new Error("Invalid billing.plans");
  }

  if (!payload.subscription || typeof payload.subscription.planId !== "string") {
    throw new Error("Invalid billing.subscription");
  }

  const plans = payload.plans.filter(isBillingPlan);

  if (plans.length === 0) {
    throw new Error("Invalid billing.plans");
  }

  return {
    comingSoon: payload.comingSoon === true,
    plans,
    subscription: { planId: payload.subscription.planId },
  };
}

function isBillingPlan(value: unknown): value is BillingPlan {
  if (!value || typeof value !== "object") return false;

  const plan = value as Partial<BillingPlan>;
  return (
    typeof plan.id === "string" &&
    typeof plan.name === "string" &&
    typeof plan.monthlyPriceCents === "number" &&
    typeof plan.monthlyMessageLimit === "number" &&
    (plan.monthlyCredits === undefined || typeof plan.monthlyCredits === "number") &&
    typeof plan.deepMemoryEnabled === "boolean" &&
    typeof plan.adultModeEnabled === "boolean" &&
    typeof plan.comingSoon === "boolean" &&
    typeof plan.currency === "string"
  );
}

function planCredits(plan: BillingPlan): number {
  return plan.monthlyCredits ?? plan.monthlyMessageLimit;
}

function requiredString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`Invalid ${field}`);
  }

  return value;
}

function requiredNumber(value: unknown, field: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`Invalid ${field}`);
  }

  return value;
}
