"use client";

import {
  Activity,
  AlertTriangle,
  ArrowDownToLine,
  Banknote,
  BarChart3,
  Brain,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock,
  Database,
  DollarSign,
  Gauge,
  Landmark,
  MessageSquareText,
  RefreshCw,
  Server,
  ShieldCheck,
  Sparkles,
  UserCheck,
  UsersRound,
  WalletCards,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { apiJson, money } from "../api";
import { renderRoleplayPreview } from "../roleplay-preview";

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
    walletAddress?: string | null;
    walletLast4?: string | null;
    providerReady?: boolean;
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
    walletAddress?: string | null;
    walletLast4?: string | null;
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

interface AdminCharacterReviewsResponse {
  characters: Array<{
    id: string;
    name: string;
    creatorName: string;
    description: string;
    marketplacePreview: string;
    category: string;
    rating: string;
    isAdult: boolean;
    tags: string[];
    traits: string[];
    speakingStyle: string | null;
    greeting: string;
    visibility: string;
    moderationStatus: string;
    avatarUrl: string | null;
    coverImageUrl: string | null;
    updatedAt: string;
  }>;
}

interface AdminAnalyticsResponse {
  generatedAt: string;
  rangeDays: number;
  kpis: {
    totalUsers: number;
    newUsers: number;
    activeUsers24h: number;
    activeUsers7d: number;
    activeUsersRange: number;
    activeConversations: number;
    userMessages: number;
    assistantMessages: number;
    modelCalls: number;
    averageModelLatencyMs: number;
    p95ModelLatencyMs: number;
    modelInputTokens: number;
    modelOutputTokens: number;
    estimatedModelCostUsd: number;
    safetyBlocks: number;
    safetyBlockRate: number;
    activeMemories: number;
    memoriesCreated: number;
    marketplaceInteractions: number;
    marketplaceChatStarts: number;
    paidRevenueCents: number;
    openPayoutCents: number;
    pendingOutbox: number;
    deadLetterOutbox: number;
  };
  growth: {
    planDistribution: Array<{ planId: string; users: number }>;
    timeSeries: Array<{
      day: string;
      signups: number;
      messages: number;
      modelCalls: number;
      safetyBlocks: number;
      revenueCents: number;
      marketplaceInteractions: number;
    }>;
  };
  marketplace: {
    interactions: number;
    views: number;
    profileOpens: number;
    chatStarts: number;
    messages: number;
    likes: number;
    saves: number;
    totalCharacters: number;
    publicCharacters: number;
    privateCharacters: number;
    pendingReviewCharacters: number;
    adultCharacters: number;
    ratings: number;
    averageRating: number;
    topCharacters: Array<{
      id: string;
      name: string;
      creatorName: string;
      category: string;
      rating: string;
      visibility: string;
      moderationStatus: string;
      isAdult: boolean;
      monetizationEnabled: boolean;
      priceCents: number;
      trendingScore: number;
      ratingAverage: number;
      ratingCount: number;
      interactions: number;
      messages: number;
      paidUnlocks: number;
      revenueCents: number;
    }>;
  };
  modelHealth: {
    calls: number;
    inputTokens: number;
    cachedInputTokens: number;
    outputTokens: number;
    estimatedCostUsd: number;
    averageLatencyMs: number;
    p95LatencyMs: number;
    routes: Array<{
      provider: string;
      model: string;
      calls: number;
      averageLatencyMs: number;
      inputTokens: number;
      cachedInputTokens: number;
      outputTokens: number;
      estimatedCostUsd: number;
    }>;
    imageGenerations: {
      images: number;
      estimatedCostUsd: number;
      routes: Array<{
        provider: string;
        model: string;
        purpose: string;
        aspectRatio: string;
        images: number;
        estimatedCostUsd: number;
      }>;
    };
    totalEstimatedCostUsd: number;
  };
  safety: {
    decisions: number;
    blockedDecisions: number;
    transformedDecisions: number;
    outputBlocks: number;
    actions: Array<{ action: string; count: number }>;
    categories: Array<{ category: string; count: number }>;
    recentBlocks: Array<{
      id: string;
      stage: string;
      action: string;
      reasonCode: string;
      categories: string[];
      userDisplayName: string;
      createdAt: string;
    }>;
  };
  memory: {
    activeFacts: number;
    createdFacts: number;
    evolutionProfiles: number;
    averageRelationshipDepth: number;
    averageMemoryCount: number;
    conversationsWithMemory: number;
    averageFactsPerConversation: number;
  };
  billing: {
    checkoutOrders: number;
    paidCheckoutOrders: number;
    characterPurchaseOrders: number;
    paidCharacterPurchases: number;
    paidRevenueCents: number;
    subscriptionRevenueCents: number;
    characterRevenueCents: number;
    platformFeeCents: number;
    openPayoutCount: number;
    openPayoutCents: number;
    pendingPayoutProfiles: number;
    activePaidSubscriptions: number;
    unprocessedWebhooks: number;
  };
  queues: {
    pending: number;
    failed: number;
    deadLetter: number;
    published24h: number;
    oldestOpenAgeSeconds: number;
    statuses: Array<{ status: string; count: number }>;
  };
  boundaries: Array<{
    name: string;
    role: string;
    port: number;
    topics: string[];
    openEvents: number;
    deadLetters: number;
    healthStatus: "ok" | "degraded";
    healthLatencyMs: number;
    healthDetail?: string;
    status: "ready" | "backlog" | "needs_attention";
  }>;
  auditTrail: Array<{
    id: string;
    action: string;
    resourceType: string;
    resourceId: string | null;
    actorDisplayName: string;
    createdAt: string;
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

const emptyReviews: AdminCharacterReviewsResponse = {
  characters: [],
};

const emptyAnalytics: AdminAnalyticsResponse = {
  generatedAt: new Date(0).toISOString(),
  rangeDays: 30,
  kpis: {
    totalUsers: 0,
    newUsers: 0,
    activeUsers24h: 0,
    activeUsers7d: 0,
    activeUsersRange: 0,
    activeConversations: 0,
    userMessages: 0,
    assistantMessages: 0,
    modelCalls: 0,
    averageModelLatencyMs: 0,
    p95ModelLatencyMs: 0,
    modelInputTokens: 0,
    modelOutputTokens: 0,
    estimatedModelCostUsd: 0,
    safetyBlocks: 0,
    safetyBlockRate: 0,
    activeMemories: 0,
    memoriesCreated: 0,
    marketplaceInteractions: 0,
    marketplaceChatStarts: 0,
    paidRevenueCents: 0,
    openPayoutCents: 0,
    pendingOutbox: 0,
    deadLetterOutbox: 0,
  },
  growth: { planDistribution: [], timeSeries: [] },
  marketplace: {
    interactions: 0,
    views: 0,
    profileOpens: 0,
    chatStarts: 0,
    messages: 0,
    likes: 0,
    saves: 0,
    totalCharacters: 0,
    publicCharacters: 0,
    privateCharacters: 0,
    pendingReviewCharacters: 0,
    adultCharacters: 0,
    ratings: 0,
    averageRating: 0,
    topCharacters: [],
  },
  modelHealth: {
    calls: 0,
    inputTokens: 0,
    cachedInputTokens: 0,
    outputTokens: 0,
    estimatedCostUsd: 0,
    averageLatencyMs: 0,
    p95LatencyMs: 0,
    routes: [],
    imageGenerations: {
      images: 0,
      estimatedCostUsd: 0,
      routes: [],
    },
    totalEstimatedCostUsd: 0,
  },
  safety: {
    decisions: 0,
    blockedDecisions: 0,
    transformedDecisions: 0,
    outputBlocks: 0,
    actions: [],
    categories: [],
    recentBlocks: [],
  },
  memory: {
    activeFacts: 0,
    createdFacts: 0,
    evolutionProfiles: 0,
    averageRelationshipDepth: 0,
    averageMemoryCount: 0,
    conversationsWithMemory: 0,
    averageFactsPerConversation: 0,
  },
  billing: {
    checkoutOrders: 0,
    paidCheckoutOrders: 0,
    characterPurchaseOrders: 0,
    paidCharacterPurchases: 0,
    paidRevenueCents: 0,
    subscriptionRevenueCents: 0,
    characterRevenueCents: 0,
    platformFeeCents: 0,
    openPayoutCount: 0,
    openPayoutCents: 0,
    pendingPayoutProfiles: 0,
    activePaidSubscriptions: 0,
    unprocessedWebhooks: 0,
  },
  queues: {
    pending: 0,
    failed: 0,
    deadLetter: 0,
    published24h: 0,
    oldestOpenAgeSeconds: 0,
    statuses: [],
  },
  boundaries: [],
  auditTrail: [],
};

type AdminTab = "analytics" | "reviews" | "ops" | "safety";
type PulseDay = AdminAnalyticsResponse["growth"]["timeSeries"][number];
type MarketplaceCharacter = AdminAnalyticsResponse["marketplace"]["topCharacters"][number];

const pulseMetrics: Array<{
  id: string;
  label: string;
  shortLabel: string;
  color: string;
  getValue: (day: PulseDay) => number;
}> = [
  {
    id: "messages",
    label: "Messages",
    shortLabel: "Msgs",
    color: "#ff1f6d",
    getValue: (day) => day.messages,
  },
  {
    id: "marketplaceInteractions",
    label: "Marketplace",
    shortLabel: "Market",
    color: "#b81758",
    getValue: (day) => day.marketplaceInteractions,
  },
  {
    id: "modelCalls",
    label: "Model calls",
    shortLabel: "Model",
    color: "#f6a6c5",
    getValue: (day) => day.modelCalls,
  },
  {
    id: "safetyBlocks",
    label: "Safety blocks",
    shortLabel: "Safety",
    color: "#f59e0b",
    getValue: (day) => day.safetyBlocks,
  },
];

function marketplaceCharacterMeta(character: MarketplaceCharacter) {
  const adultLabel = character.isAdult ? " - 18+" : "";
  return `${character.creatorName} - ${character.category} - ${character.rating}${adultLabel} - ${character.visibility}/${character.moderationStatus}`;
}

export default function AdminPage() {
  const [payload, setPayload] = useState<AdminMonetizationResponse>(emptyAdmin);
  const [analytics, setAnalytics] = useState<AdminAnalyticsResponse>(emptyAnalytics);
  const [reviews, setReviews] = useState<AdminCharacterReviewsResponse>(emptyReviews);
  const [activeTab, setActiveTab] = useState<AdminTab>("analytics");
  const [showAllBoundaries, setShowAllBoundaries] = useState(false);
  const [hasLiveData, setHasLiveData] = useState(false);
  const [status, setStatus] = useState("Loading admin command center...");

  useEffect(() => {
    void load();
  }, []);

  async function load() {
    try {
      const [analyticsData, monetizationData, reviewData] = await Promise.all([
        apiJson<AdminAnalyticsResponse>("/api/v1/admin/analytics?rangeDays=30"),
        apiJson<AdminMonetizationResponse>("/api/v1/admin/monetization"),
        apiJson<AdminCharacterReviewsResponse>("/api/v1/admin/characters/reviews"),
      ]);

      setAnalytics(analyticsData);
      setPayload(monetizationData);
      setReviews(reviewData);
      setHasLiveData(true);
      setStatus("");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Admin dashboard unavailable.");
    }
  }

  async function processPayout(
    payoutId: string,
    provider: "mock" | "manual" | "crypto",
    txHash?: string,
  ) {
    setStatus("Processing payout...");

    try {
      await apiJson(`/api/v1/admin/monetization/payouts/${encodeURIComponent(payoutId)}/process`, {
        method: "POST",
        body: JSON.stringify({ provider, txHash }),
      });
      await load();
      setStatus("Payout updated.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Could not process payout.");
    }
  }

  async function processCryptoPayout(payoutId: string) {
    const txHash = window.prompt("Paste the 0G payout transaction hash.");

    if (!txHash) {
      return;
    }

    await processPayout(payoutId, "crypto", txHash.trim());
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

  async function reviewCharacter(characterId: string, action: "approve" | "reject") {
    if (
      action === "reject" &&
      !window.confirm("Reject this character and keep it out of Discover?")
    ) {
      return;
    }

    setStatus(action === "approve" ? "Approving character..." : "Rejecting character...");

    try {
      await apiJson(`/api/v1/admin/characters/${encodeURIComponent(characterId)}/review`, {
        method: "POST",
        body: JSON.stringify({ action }),
      });
      await load();
      setStatus(action === "approve" ? "Character approved." : "Character rejected.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Could not review character.");
    }
  }

  const topKpis = [
    {
      label: "Active users",
      value: analytics.kpis.activeUsers7d.toLocaleString(),
      detail: `${analytics.kpis.activeUsers24h.toLocaleString()} today`,
      icon: UsersRound,
    },
    {
      label: "Messages",
      value: analytics.kpis.userMessages.toLocaleString(),
      detail: `${analytics.kpis.assistantMessages.toLocaleString()} replies`,
      icon: MessageSquareText,
    },
    {
      label: "Revenue",
      value: money(analytics.kpis.paidRevenueCents, "USD"),
      detail: `${money(analytics.billing.platformFeeCents, "USD")} fees`,
      icon: DollarSign,
    },
    {
      label: "Safety blocks",
      value: analytics.kpis.safetyBlocks.toLocaleString(),
      detail: `${Math.round(analytics.kpis.safetyBlockRate * 1000) / 10}% block rate`,
      icon: ShieldCheck,
    },
    {
      label: "Model p95",
      value: `${analytics.kpis.p95ModelLatencyMs}ms`,
      detail: `${analytics.kpis.modelCalls.toLocaleString()} calls`,
      icon: Gauge,
    },
    {
      label: "Queue risk",
      value: String(analytics.kpis.deadLetterOutbox),
      detail: `${analytics.kpis.pendingOutbox} pending`,
      icon: Database,
    },
  ];
  const tabs: Array<{ id: AdminTab; label: string; icon: typeof Activity }> = [
    { id: "analytics", label: "Analytics", icon: BarChart3 },
    { id: "reviews", label: "Reviews", icon: UserCheck },
    { id: "ops", label: "Payout ops", icon: WalletCards },
    { id: "safety", label: "Safety", icon: AlertTriangle },
  ];
  const boundaryStats = useMemo(() => {
    const statusCounts = analytics.boundaries.reduce(
      (counts, boundary) => ({
        ...counts,
        [boundary.status]: counts[boundary.status] + 1,
      }),
      { ready: 0, backlog: 0, needs_attention: 0 },
    );

    return {
      ...statusCounts,
      openEvents: analytics.boundaries.reduce((sum, boundary) => sum + boundary.openEvents, 0),
      deadLetters: analytics.boundaries.reduce((sum, boundary) => sum + boundary.deadLetters, 0),
    };
  }, [analytics.boundaries]);
  const visibleBoundaries = showAllBoundaries
    ? analytics.boundaries
    : analytics.boundaries.slice(0, 6);
  const safetyDecisionTotal = Math.max(0, analytics.safety.decisions);
  const safetyActionMax = Math.max(1, ...analytics.safety.actions.map((item) => item.count));
  const safetyCategoryMax = Math.max(1, ...analytics.safety.categories.map((item) => item.count));
  const totalAiCost =
    analytics.modelHealth.totalEstimatedCostUsd ||
    analytics.modelHealth.estimatedCostUsd +
      analytics.modelHealth.imageGenerations.estimatedCostUsd;

  return (
    <div className="app-page admin-page">
      <section className="admin-command-hero">
        <div>
          <span className="section-label">
            <ShieldCheck size={15} /> Admin
          </span>
          <h1>Command center.</h1>
          <p>
            Product health, marketplace momentum, model behavior, safety pressure, queue state, and
            creator money in one place.
          </p>
        </div>
        <button className="secondary-action compact" type="button" onClick={() => void load()}>
          <RefreshCw size={15} /> Refresh
        </button>
      </section>

      <nav className="admin-tabbar" aria-label="Admin sections">
        {tabs.map((tab) => (
          <button
            className={activeTab === tab.id ? "active" : ""}
            key={tab.id}
            type="button"
            onClick={() => setActiveTab(tab.id)}
          >
            <tab.icon size={16} /> {tab.label}
          </button>
        ))}
      </nav>

      {!hasLiveData ? (
        <section className="admin-panel compact-empty">
          <EmptyState icon={Activity} title="Loading live admin data" />
        </section>
      ) : null}

      {hasLiveData && activeTab === "analytics" ? (
        <>
          <section className="admin-kpi-grid" aria-label="Product overview">
            {topKpis.map((card) => (
              <article className="admin-kpi-card" key={card.label}>
                <card.icon size={22} />
                <span>{card.label}</span>
                <strong>{card.value}</strong>
                <small>{card.detail}</small>
              </article>
            ))}
          </section>

          <section className="admin-overview-grid">
            <article className="admin-panel admin-pulse-panel">
              <div className="panel-heading split admin-pulse-heading">
                <div>
                  <span className="section-label">
                    <BarChart3 size={15} /> Last {analytics.rangeDays} days
                  </span>
                  <h2>Product pulse</h2>
                </div>
                <small>Updated {formatTime(analytics.generatedAt)}</small>
              </div>
              <ProductPulse data={analytics.growth.timeSeries} metrics={pulseMetrics} />
            </article>

            <aside className="admin-side-stack" aria-label="Core operating groups">
              <article className="admin-panel compact">
                <div className="panel-heading">
                  <span className="section-label">
                    <UsersRound size={15} /> Growth
                  </span>
                  <h2>Users and plans</h2>
                </div>
                <MetricLine label="Total users" value={analytics.kpis.totalUsers} />
                <MetricLine label="New users" value={analytics.kpis.newUsers} />
                <MetricLine label="Active rooms" value={analytics.kpis.activeConversations} />
                <div className="admin-pill-list">
                  {analytics.growth.planDistribution.map((plan) => (
                    <span key={plan.planId}>
                      {plan.planId} <b>{plan.users}</b>
                    </span>
                  ))}
                </div>
              </article>

              <article className="admin-panel compact">
                <div className="panel-heading">
                  <span className="section-label">
                    <Activity size={15} /> Queue
                  </span>
                  <h2>Outbox health</h2>
                </div>
                <MetricLine label="Published in 24h" value={analytics.queues.published24h} />
                <MetricLine label="Failed" value={analytics.queues.failed} />
                <MetricLine label="Dead letters" value={analytics.queues.deadLetter} />
                <MetricLine
                  label="Oldest open"
                  value={formatDuration(analytics.queues.oldestOpenAgeSeconds)}
                />
              </article>
            </aside>
          </section>

          <section className="admin-bento-grid">
            <article className="admin-panel">
              <div className="panel-heading">
                <span className="section-label">
                  <Brain size={15} /> Memory
                </span>
                <h2>Personalization depth</h2>
              </div>
              <MetricLine label="Active facts" value={analytics.memory.activeFacts} />
              <MetricLine label="New facts" value={analytics.memory.createdFacts} />
              <MetricLine label="Evolution profiles" value={analytics.memory.evolutionProfiles} />
              <MetricLine
                label="Avg relationship depth"
                value={`${analytics.memory.averageRelationshipDepth}/100`}
              />
            </article>

            <article className="admin-panel wide">
              <div className="panel-heading split">
                <div>
                  <span className="section-label">
                    <Sparkles size={15} /> Marketplace
                  </span>
                  <h2>Characters pulling attention</h2>
                </div>
                <small>
                  {analytics.marketplace.totalCharacters.toLocaleString()} total |{" "}
                  {analytics.marketplace.publicCharacters.toLocaleString()} public |{" "}
                  {analytics.marketplace.adultCharacters.toLocaleString()} 18+
                </small>
              </div>
              <div className="admin-table compact-table">
                {analytics.marketplace.topCharacters.map((character) => (
                  <div className="admin-table-row" key={character.id}>
                    <span>
                      <strong>{character.name}</strong>
                      <small>{marketplaceCharacterMeta(character)}</small>
                    </span>
                    <b>{character.messages.toLocaleString()} msgs</b>
                    <b>{money(character.revenueCents, "USD")}</b>
                    <small>{character.ratingAverage.toFixed(1)} / 5</small>
                  </div>
                ))}
                {analytics.marketplace.topCharacters.length === 0 ? (
                  <EmptyState icon={Sparkles} title="No marketplace movement yet" />
                ) : null}
              </div>
            </article>

            <article className="admin-panel wide">
              <div className="panel-heading split">
                <div>
                  <span className="section-label">
                    <Server size={15} /> Boundaries
                  </span>
                  <h2>Service pressure</h2>
                </div>
                <button
                  className="secondary-action compact icon-right"
                  type="button"
                  onClick={() => setShowAllBoundaries((current) => !current)}
                >
                  {showAllBoundaries ? "Show less" : "Show all"}
                  {showAllBoundaries ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
                </button>
              </div>
              <div className="admin-pressure-summary">
                <span>
                  Ready <b>{boundaryStats.ready}</b>
                </span>
                <span>
                  Backlog <b>{boundaryStats.backlog}</b>
                </span>
                <span>
                  Attention <b>{boundaryStats.needs_attention}</b>
                </span>
                <span>
                  Open events <b>{boundaryStats.openEvents}</b>
                </span>
              </div>
              <div className="boundary-list compact">
                {visibleBoundaries.map((boundary) => (
                  <div className="boundary-row" key={boundary.name}>
                    <span className={`boundary-dot ${boundary.status}`} />
                    <span>
                      <strong>{boundary.name}</strong>
                      <small>
                        {boundary.healthStatus === "ok" ? "live" : "degraded"} -{" "}
                        {boundary.healthLatencyMs}ms - {boundary.openEvents} open -{" "}
                        {boundary.deadLetters} dead
                      </small>
                    </span>
                  </div>
                ))}
              </div>
            </article>

            <article className="admin-panel">
              <div className="panel-heading split">
                <div>
                  <span className="section-label">
                    <Gauge size={15} /> Model
                  </span>
                  <h2>Model health</h2>
                </div>
                <small>{formatUsdCost(totalAiCost)} AI spend</small>
              </div>
              <div className="admin-cost-summary">
                <span>
                  <small>Text</small>
                  <b>{formatUsdCost(analytics.modelHealth.estimatedCostUsd)}</b>
                </span>
                <span>
                  <small>Images</small>
                  <b>{formatUsdCost(analytics.modelHealth.imageGenerations.estimatedCostUsd)}</b>
                </span>
              </div>
              <div className="admin-model-meter-grid">
                <MetricLine label="Calls" value={analytics.modelHealth.calls} />
                <MetricLine
                  label="Avg latency"
                  value={`${analytics.modelHealth.averageLatencyMs}ms`}
                />
                <MetricLine label="P95 latency" value={`${analytics.modelHealth.p95LatencyMs}ms`} />
                <MetricLine
                  label="Input tokens"
                  value={formatCompactNumber(analytics.modelHealth.inputTokens)}
                />
                <MetricLine
                  label="Cached input"
                  value={formatCompactNumber(analytics.modelHealth.cachedInputTokens)}
                />
                <MetricLine
                  label="Output tokens"
                  value={formatCompactNumber(analytics.modelHealth.outputTokens)}
                />
              </div>
              <div className="admin-model-route-list">
                {analytics.modelHealth.routes.slice(0, 4).map((route) => (
                  <div className="admin-model-route" key={`${route.provider}:${route.model}`}>
                    <span>
                      <strong>{route.model}</strong>
                      <small>
                        {route.provider} - {route.calls.toLocaleString()} calls -{" "}
                        {route.averageLatencyMs}ms avg
                      </small>
                    </span>
                    <b>{formatUsdCost(route.estimatedCostUsd)}</b>
                  </div>
                ))}
                {analytics.modelHealth.imageGenerations.routes.slice(0, 3).map((route) => (
                  <div
                    className="admin-model-route"
                    key={`${route.provider}:${route.model}:${route.purpose}:${route.aspectRatio}`}
                  >
                    <span>
                      <strong>{route.purpose.replace(/_/g, " ")}</strong>
                      <small>
                        {route.model} - {route.images.toLocaleString()} images - {route.aspectRatio}
                      </small>
                    </span>
                    <b>{formatUsdCost(route.estimatedCostUsd)}</b>
                  </div>
                ))}
                {analytics.modelHealth.routes.length === 0 &&
                analytics.modelHealth.imageGenerations.routes.length === 0 ? (
                  <EmptyState icon={Gauge} title="No model calls yet" />
                ) : null}
              </div>
            </article>
          </section>
        </>
      ) : null}

      {hasLiveData && activeTab === "ops" ? (
        <>
          <section className="wallet-metric-grid">
            <SummaryCard
              detail={money(payload.summary.openPayoutCents, "USD")}
              icon={ArrowDownToLine}
              label="Open payouts"
              value={String(payload.summary.openPayoutCount)}
            />
            <SummaryCard
              detail="creator balances"
              icon={WalletCards}
              label="Available owed"
              value={money(payload.summary.availableCents, "USD")}
            />
            <SummaryCard
              detail="release window"
              icon={Landmark}
              label="Pending hold"
              value={money(payload.summary.pendingCents, "USD")}
            />
            <SummaryCard
              detail="lifetime"
              icon={Banknote}
              label="Platform fees"
              value={money(payload.summary.lifetimeFeeCents, "USD")}
            />
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
                        Wallet ending {profile.walletLast4 ?? profile.vpaLast4 ?? "new"} -{" "}
                        {profile.providerReady ? "verified" : "manual review"}
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
                  <EmptyState
                    icon={CheckCircle2}
                    title="No profile reviews"
                    text="New creator payout profiles will appear here before payout requests open."
                  />
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
                          {payout.status} - profile {payout.profileStatus ?? "missing"} - wallet{" "}
                          {payout.walletLast4 ?? payout.vpaLast4 ?? "unknown"}
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
                            onClick={() => void processCryptoPayout(payout.id)}
                          >
                            Crypto paid
                          </button>
                        </>
                      )}
                    </div>
                  </article>
                ))}
                {payload.pendingPayouts.length === 0 ? (
                  <EmptyState
                    icon={Sparkles}
                    title="No payout queue"
                    text="Approved creator requests will queue here with provider controls."
                  />
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
                      available {money(creator.availableCents, creator.currency)} - pending{" "}
                      {money(creator.pendingCents, creator.currency)}
                    </small>
                  </span>
                  <b>{money(creator.lifetimeEarnedCents, creator.currency)}</b>
                </div>
              ))}
              {payload.topCreators.length === 0 ? (
                <EmptyState
                  icon={UsersRound}
                  title="No creator balances"
                  text="Creator wallets appear as paid unlocks happen."
                />
              ) : null}
            </div>
          </section>
        </>
      ) : null}

      {hasLiveData && activeTab === "reviews" ? (
        <section className="wallet-table-panel admin-character-review-panel">
          <div className="panel-heading split">
            <div>
              <span className="section-label">
                <UserCheck size={15} /> Character review
              </span>
              <h2>Pending marketplace approvals</h2>
            </div>
            <small>
              {reviews.characters.length.toLocaleString()} waiting |{" "}
              {reviews.characters.filter((character) => character.isAdult).length.toLocaleString()}{" "}
              18+
            </small>
          </div>
          <div className="admin-character-review-list">
            {reviews.characters.map((character) => (
              <article className="admin-character-review-card" key={character.id}>
                <div className="admin-character-review-main">
                  {character.avatarUrl ? (
                    <img src={character.avatarUrl} alt={`${character.name} avatar`} />
                  ) : null}
                  <div className="admin-character-review-copy">
                    <div className="admin-character-review-title">
                      <span>
                        <strong>{character.name}</strong>
                        <small>
                          {character.creatorName} - {character.category} - {character.rating}
                          {character.isAdult ? " - 18+" : ""} - {character.visibility}/
                          {character.moderationStatus}
                        </small>
                      </span>
                    </div>
                    <p>
                      {renderRoleplayPreview(character.marketplacePreview || character.description)}
                    </p>
                    <small>{renderRoleplayPreview(character.greeting)}</small>
                    <div className="admin-review-tags">
                      {character.tags.slice(0, 6).map((tag) => (
                        <span key={`${character.id}:${tag}`}>{tag}</span>
                      ))}
                    </div>
                  </div>
                </div>
                <div className="admin-action-row">
                  <button
                    className="primary-action compact"
                    type="button"
                    onClick={() => void reviewCharacter(character.id, "approve")}
                  >
                    <CheckCircle2 size={15} /> Approve
                  </button>
                  <button
                    className="secondary-action compact"
                    type="button"
                    onClick={() => void reviewCharacter(character.id, "reject")}
                  >
                    <AlertTriangle size={15} /> Reject
                  </button>
                </div>
              </article>
            ))}
            {reviews.characters.length === 0 ? (
              <EmptyState
                icon={CheckCircle2}
                title="No character reviews"
                text="Mature, adult, or manually held characters will appear here before they enter Discover."
              />
            ) : null}
          </div>
        </section>
      ) : null}

      {hasLiveData && activeTab === "safety" ? (
        <section className="admin-safety-grid">
          <article className="admin-panel admin-safety-summary">
            <div className="panel-heading">
              <span className="section-label">
                <ShieldCheck size={15} /> Last 30 days
              </span>
              <h2>Safety overview</h2>
              <p className="admin-panel-helper">
                Real moderation decisions from chat input checks and model-output checks.
              </p>
            </div>
            <div className="admin-safety-metrics">
              <div className="admin-safety-tile">
                <span>Total checks</span>
                <strong>{analytics.safety.decisions.toLocaleString()}</strong>
                <small>Every recorded safety decision.</small>
              </div>
              <div className="admin-safety-tile">
                <span>Blocked messages</span>
                <strong>{analytics.safety.blockedDecisions.toLocaleString()}</strong>
                <small>
                  {formatPercent(analytics.safety.blockedDecisions, safetyDecisionTotal)} of checks.
                </small>
              </div>
              <div className="admin-safety-tile">
                <span>Rewritten messages</span>
                <strong>{analytics.safety.transformedDecisions.toLocaleString()}</strong>
                <small>
                  {formatPercent(analytics.safety.transformedDecisions, safetyDecisionTotal)} of
                  checks.
                </small>
              </div>
              <div className="admin-safety-tile">
                <span>Blocked replies</span>
                <strong>{analytics.safety.outputBlocks.toLocaleString()}</strong>
                <small>Unsafe model replies caught before users saw them.</small>
              </div>
            </div>
          </article>

          <article className="admin-panel admin-safety-card">
            <div className="panel-heading">
              <span className="section-label">
                <Activity size={15} /> Outcomes
              </span>
              <h2>Outcome mix</h2>
              <p className="admin-panel-helper">
                What the safety layer did after evaluating messages.
              </p>
            </div>
            <div className="admin-safety-list">
              {analytics.safety.actions.map((item) => (
                <SafetyBar
                  key={item.action}
                  label={formatSafetyLabel(item.action)}
                  value={item.count}
                  max={safetyActionMax}
                />
              ))}
              {analytics.safety.actions.length === 0 ? (
                <div className="admin-safety-empty">
                  <EmptyState
                    icon={ShieldCheck}
                    title="No safety outcomes yet"
                    text="Outcome counts appear after moderation decisions are recorded."
                  />
                </div>
              ) : null}
            </div>
          </article>

          <article className="admin-panel admin-safety-card">
            <div className="panel-heading">
              <span className="section-label">
                <AlertTriangle size={15} /> Categories
              </span>
              <h2>Flag categories</h2>
              <p className="admin-panel-helper">The reason groups behind blocks or rewrites.</p>
            </div>
            <div className="admin-safety-list">
              {analytics.safety.categories.map((category) => (
                <SafetyBar
                  key={category.category}
                  label={formatSafetyLabel(category.category)}
                  value={category.count}
                  max={safetyCategoryMax}
                />
              ))}
              {analytics.safety.categories.length === 0 ? (
                <div className="admin-safety-empty">
                  <EmptyState
                    icon={ShieldCheck}
                    title="No flag categories"
                    text="No blocked or rewritten messages had category tags in this range."
                  />
                </div>
              ) : null}
            </div>
          </article>

          <article className="admin-panel admin-safety-wide">
            <div className="panel-heading">
              <span className="section-label">
                <Clock size={15} /> Safety events
              </span>
              <h2>Blocked and rewritten messages</h2>
              <p className="admin-panel-helper">
                Recent messages where the system blocked content or rewrote it before delivery.
              </p>
            </div>
            <div className="admin-table compact-table">
              {analytics.safety.recentBlocks.map((item) => (
                <div className="admin-table-row" key={item.id}>
                  <span>
                    <strong>{formatSafetyLabel(item.reasonCode)}</strong>
                    <small>
                      {item.userDisplayName} - {formatSafetyLabel(item.stage)} -{" "}
                      {formatTime(item.createdAt)}
                    </small>
                  </span>
                  <b>{formatSafetyLabel(item.action)}</b>
                  <small>
                    {item.categories.map(formatSafetyLabel).join(", ") || "Uncategorized"}
                  </small>
                </div>
              ))}
              {analytics.safety.recentBlocks.length === 0 ? (
                <div className="admin-safety-empty">
                  <EmptyState
                    icon={ShieldCheck}
                    title="No blocked or rewritten messages"
                    text="Nothing in this 30-day window needed a block, rewrite, or output catch."
                  />
                </div>
              ) : null}
            </div>
          </article>

          <article className="admin-panel admin-safety-side">
            <div className="panel-heading">
              <span className="section-label">
                <Activity size={15} /> Audit
              </span>
              <h2>Admin activity log</h2>
              <p className="admin-panel-helper">
                Recent admin or system actions that may matter during review.
              </p>
            </div>
            <div className="admin-table compact-table">
              {analytics.auditTrail.map((item) => (
                <div className="admin-table-row" key={item.id}>
                  <span>
                    <strong>{formatSafetyLabel(item.action)}</strong>
                    <small>
                      {item.actorDisplayName} - {formatSafetyLabel(item.resourceType)} -{" "}
                      {formatTime(item.createdAt)}
                    </small>
                  </span>
                  <small>{item.resourceId ?? "n/a"}</small>
                </div>
              ))}
              {analytics.auditTrail.length === 0 ? (
                <div className="admin-safety-empty">
                  <EmptyState
                    icon={Activity}
                    title="No audit events"
                    text="Admin and system actions will show here."
                  />
                </div>
              ) : null}
            </div>
          </article>
        </section>
      ) : null}

      {status ? (
        <p className="floating-status" aria-live="polite">
          {status}
        </p>
      ) : null}
    </div>
  );
}

function ProductPulse(props: { data: PulseDay[]; metrics: typeof pulseMetrics }) {
  const [activeMetricId, setActiveMetricId] = useState(props.metrics[0]?.id ?? "messages");

  if (props.data.length === 0) {
    return (
      <div className="admin-pulse-empty">
        <EmptyState icon={BarChart3} title="No product pulse yet" />
      </div>
    );
  }

  const activeMetric =
    props.metrics.find((metric) => metric.id === activeMetricId) ?? props.metrics[0]!;
  const values = props.data.map((day) => activeMetric.getValue(day));
  const total = values.reduce((sum, value) => sum + value, 0);
  const average = props.data.length > 0 ? total / props.data.length : 0;
  const peakValue = Math.max(0, ...values);
  const maxValue = Math.max(1, peakValue);
  const width = 900;
  const height = 280;
  const padding = { top: 12, right: 18, bottom: 38, left: 52 };
  const innerWidth = width - padding.left - padding.right;
  const innerHeight = height - padding.top - padding.bottom;
  const barStep = props.data.length > 0 ? innerWidth / props.data.length : innerWidth;
  const barWidth = Math.max(3, Math.min(14, barStep * 0.34));
  const labelEvery = Math.max(1, Math.ceil(props.data.length / 6));

  return (
    <div className="admin-pulse-board">
      <div className="admin-pulse-toolbar">
        <div className="admin-pulse-summary">
          <span>
            Total <b>{formatCompactNumber(total)}</b>
          </span>
          <span>
            Average <b>{formatPulseAverage(average)}</b>
          </span>
          <span>
            Peak <b>{formatCompactNumber(peakValue)}</b>
          </span>
        </div>
        <div className="admin-pulse-toggle" aria-label="Product pulse metric">
          {props.metrics.map((metric) => (
            <button
              aria-pressed={activeMetric.id === metric.id}
              className={activeMetric.id === metric.id ? "active" : ""}
              key={metric.id}
              type="button"
              onClick={() => setActiveMetricId(metric.id)}
            >
              <span style={{ background: metric.color }} />
              {metric.shortLabel}
            </button>
          ))}
        </div>
      </div>
      <svg
        aria-label={`${activeMetric.label} pulse over ${props.data.length} days. Total ${total}, average ${formatPulseAverage(
          average,
        )}, peak ${peakValue}.`}
        className="admin-pulse-chart"
        role="img"
        viewBox={`0 0 ${width} ${height}`}
      >
        <title>{activeMetric.label} pulse</title>
        {[0, 0.25, 0.5, 0.75, 1].map((tick) => {
          const y = padding.top + innerHeight * tick;
          const value = Math.round(maxValue * (1 - tick));

          return (
            <g key={tick}>
              <line
                className="admin-pulse-gridline"
                x1={padding.left}
                x2={width - padding.right}
                y1={y}
                y2={y}
              />
              <text className="admin-pulse-y-label" x={padding.left - 12} y={y + 4}>
                {formatCompactNumber(value)}
              </text>
            </g>
          );
        })}
        {props.data.map((day, index) => {
          const value = values[index] ?? 0;
          const barHeight = value > 0 ? Math.max(3, (value / maxValue) * innerHeight) : 0;
          const x = padding.left + index * barStep + (barStep - barWidth) / 2;
          const y = padding.top + innerHeight - barHeight;

          return (
            <rect
              className="admin-pulse-bar"
              fill={activeMetric.color}
              height={barHeight}
              key={`${activeMetric.id}-${day.day}`}
              rx="3"
              width={barWidth}
              x={x}
              y={y}
            />
          );
        })}
        {props.data.map((day, index) =>
          index === 0 || index === props.data.length - 1 || index % labelEvery === 0 ? (
            <text
              className="admin-pulse-x-label"
              key={`pulse-label-${day.day}`}
              textAnchor="middle"
              x={padding.left + index * barStep + barStep / 2}
              y={height - 12}
            >
              {shortDate(day.day)}
            </text>
          ) : null,
        )}
      </svg>
    </div>
  );
}

function SummaryCard(props: {
  label: string;
  value: string;
  detail: string;
  icon: typeof ArrowDownToLine;
}) {
  return (
    <article className="wallet-metric">
      <props.icon size={22} />
      <span>{props.label}</span>
      <strong>{props.value}</strong>
      <small>{props.detail}</small>
    </article>
  );
}

function MetricLine(props: { label: string; value: number | string }) {
  return (
    <div className="admin-metric-line">
      <span>{props.label}</span>
      <strong>
        {typeof props.value === "number" ? props.value.toLocaleString() : props.value}
      </strong>
    </div>
  );
}

function SafetyBar(props: { label: string; value: number; max: number }) {
  const width = `${Math.min(100, Math.max(4, (props.value / Math.max(1, props.max)) * 100))}%`;

  return (
    <div className="admin-safety-bar-row">
      <div className="admin-safety-bar-top">
        <span>{props.label}</span>
        <b>{props.value.toLocaleString()}</b>
      </div>
      <div className="admin-safety-meter" aria-hidden="true">
        <span style={{ width }} />
      </div>
    </div>
  );
}

function EmptyState(props: { icon: typeof Sparkles; title: string; text?: string }) {
  return (
    <div className="dashboard-empty-card compact-empty">
      <props.icon size={20} />
      <h3>{props.title}</h3>
      {props.text ? <p>{props.text}</p> : null}
    </div>
  );
}

function formatPercent(value: number, total: number): string {
  if (total <= 0) {
    return "0%";
  }

  return new Intl.NumberFormat("en", {
    maximumFractionDigits: value / total >= 0.1 ? 1 : 2,
    style: "percent",
  }).format(value / total);
}

function formatSafetyLabel(value: string): string {
  const label = value
    .replace(/[_./-]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");

  if (!label) {
    return "Unknown";
  }

  return label.replace(/\b[a-z]/g, (letter) => letter.toUpperCase());
}

function shortDate(value: string): string {
  return new Intl.DateTimeFormat("en", { month: "short", day: "numeric" }).format(new Date(value));
}

function formatCompactNumber(value: number): string {
  return new Intl.NumberFormat("en", {
    maximumFractionDigits: value >= 10 ? 0 : 1,
    notation: "compact",
  }).format(value);
}

function formatPulseAverage(value: number): string {
  return new Intl.NumberFormat("en", {
    maximumFractionDigits: value >= 10 ? 0 : 1,
    notation: value >= 1000 ? "compact" : "standard",
  }).format(value);
}

function formatUsdCost(value: number): string {
  if (!Number.isFinite(value) || value <= 0) {
    return "$0";
  }

  if (value < 0.0001) {
    return `$${value.toFixed(8)}`;
  }

  if (value < 0.01) {
    return `$${value.toFixed(6)}`;
  }

  if (value < 1) {
    return `$${value.toFixed(4)}`;
  }

  return `$${value.toFixed(2)}`;
}

function formatTime(value: string): string {
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

function formatDuration(seconds: number): string {
  if (seconds <= 0) {
    return "none";
  }

  if (seconds < 60) {
    return `${seconds}s`;
  }

  if (seconds < 3600) {
    return `${Math.round(seconds / 60)}m`;
  }

  return `${Math.round(seconds / 3600)}h`;
}
