"use client";

import {
  Activity,
  AlertTriangle,
  ArrowDownToLine,
  Banknote,
  BarChart3,
  Brain,
  CalendarDays,
  CheckCircle2,
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
    publicCharacters: number;
    pendingReviewCharacters: number;
    ratings: number;
    averageRating: number;
    topCharacters: Array<{
      id: string;
      name: string;
      creatorName: string;
      category: string;
      rating: string;
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
      outputTokens: number;
      estimatedCostUsd: number;
    }>;
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
    publicCharacters: 0,
    pendingReviewCharacters: 0,
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

type AdminTab = "analytics" | "ops" | "safety";

export default function AdminPage() {
  const [payload, setPayload] = useState<AdminMonetizationResponse>(emptyAdmin);
  const [analytics, setAnalytics] = useState<AdminAnalyticsResponse>(emptyAnalytics);
  const [activeTab, setActiveTab] = useState<AdminTab>("analytics");
  const [status, setStatus] = useState("Loading admin command center...");

  useEffect(() => {
    void load();
  }, []);

  async function load() {
    try {
      const [analyticsData, monetizationData] = await Promise.all([
        apiJson<AdminAnalyticsResponse>("/api/v1/admin/analytics?rangeDays=30"),
        apiJson<AdminMonetizationResponse>("/api/v1/admin/monetization"),
      ]);

      setAnalytics(analyticsData);
      setPayload(monetizationData);
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
    { id: "ops", label: "Payout ops", icon: WalletCards },
    { id: "safety", label: "Safety", icon: AlertTriangle },
  ];
  const maxSeriesValue = useMemo(
    () =>
      Math.max(
        1,
        ...analytics.growth.timeSeries.map(
          (day) => day.messages + day.marketplaceInteractions + day.modelCalls,
        ),
      ),
    [analytics.growth.timeSeries],
  );

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

      {activeTab === "analytics" ? (
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

          <section className="admin-analytics-grid">
            <article className="admin-panel wide">
              <div className="panel-heading split">
                <div>
                  <span className="section-label">
                    <CalendarDays size={15} /> Last {analytics.rangeDays} days
                  </span>
                  <h2>Daily product pulse</h2>
                </div>
                <small>Updated {formatTime(analytics.generatedAt)}</small>
              </div>
              <div className="admin-day-pulse premium-scroll" role="list">
                {analytics.growth.timeSeries.map((day) => {
                  const total = day.messages + day.marketplaceInteractions + day.modelCalls;
                  const intensity = Math.max(4, Math.round((total / maxSeriesValue) * 100));

                  return (
                    <article
                      aria-label={`${day.day}: ${day.messages} messages, ${day.marketplaceInteractions} marketplace interactions, ${day.modelCalls} model calls`}
                      className={
                        total === maxSeriesValue ? "admin-day-card peak" : "admin-day-card"
                      }
                      key={day.day}
                      role="listitem"
                    >
                      <div className="admin-day-top">
                        <span>{weekdayLabel(day.day)}</span>
                        <strong>{shortDate(day.day)}</strong>
                      </div>
                      <div className="admin-day-meter" aria-hidden="true">
                        <span style={{ width: `${intensity}%` }} />
                      </div>
                      <div className="admin-day-stats">
                        <span>
                          <i /> {day.messages.toLocaleString()} msgs
                        </span>
                        <span>
                          <b /> {day.marketplaceInteractions.toLocaleString()} market
                        </span>
                        <span>
                          <em /> {day.modelCalls.toLocaleString()} model
                        </span>
                      </div>
                      {day.revenueCents > 0 ? (
                        <small>{money(day.revenueCents, "USD")} revenue</small>
                      ) : null}
                    </article>
                  );
                })}
              </div>
              <div className="admin-chart-legend">
                <span>
                  <i /> Messages
                </span>
                <span>
                  <b /> Marketplace
                </span>
                <span>
                  <em /> Model calls
                </span>
              </div>
            </article>

            <article className="admin-panel">
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
                <small>{analytics.marketplace.publicCharacters} public</small>
              </div>
              <div className="admin-table compact-table">
                {analytics.marketplace.topCharacters.map((character) => (
                  <div className="admin-table-row" key={character.id}>
                    <span>
                      <strong>{character.name}</strong>
                      <small>
                        {character.creatorName} - {character.category} - {character.rating}
                      </small>
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

            <article className="admin-panel">
              <div className="panel-heading">
                <span className="section-label">
                  <Server size={15} /> Boundaries
                </span>
                <h2>Service pressure</h2>
              </div>
              <div className="boundary-list">
                {analytics.boundaries.map((boundary) => (
                  <div className="boundary-row" key={boundary.name}>
                    <span className={`boundary-dot ${boundary.status}`} />
                    <span>
                      <strong>{boundary.name}</strong>
                      <small>
                        {boundary.openEvents} open - {boundary.deadLetters} dead
                      </small>
                    </span>
                  </div>
                ))}
              </div>
            </article>

            <article className="admin-panel">
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
          </section>
        </>
      ) : null}

      {activeTab === "ops" ? (
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
                        {profile.payoutMode.toUpperCase()} ending {profile.vpaLast4 ?? "new"} -{" "}
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
                          {payout.status} - profile {payout.profileStatus ?? "missing"} - UPI{" "}
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

      {activeTab === "safety" ? (
        <section className="admin-analytics-grid">
          <article className="admin-panel">
            <div className="panel-heading">
              <span className="section-label">
                <AlertTriangle size={15} /> Decisions
              </span>
              <h2>Guardrail load</h2>
            </div>
            <MetricLine label="All decisions" value={analytics.safety.decisions} />
            <MetricLine label="Blocks" value={analytics.safety.blockedDecisions} />
            <MetricLine label="Transformations" value={analytics.safety.transformedDecisions} />
            <MetricLine label="Output catches" value={analytics.safety.outputBlocks} />
          </article>

          <article className="admin-panel">
            <div className="panel-heading">
              <span className="section-label">
                <ShieldCheck size={15} /> Categories
              </span>
              <h2>Top pressure points</h2>
            </div>
            <div className="admin-pill-list stacked">
              {analytics.safety.categories.map((category) => (
                <span key={category.category}>
                  {category.category} <b>{category.count}</b>
                </span>
              ))}
            </div>
          </article>

          <article className="admin-panel wide">
            <div className="panel-heading">
              <span className="section-label">
                <Clock size={15} /> Recent
              </span>
              <h2>Latest blocked or transformed events</h2>
            </div>
            <div className="admin-table compact-table">
              {analytics.safety.recentBlocks.map((item) => (
                <div className="admin-table-row" key={item.id}>
                  <span>
                    <strong>{item.reasonCode}</strong>
                    <small>
                      {item.userDisplayName} - {item.stage} - {formatTime(item.createdAt)}
                    </small>
                  </span>
                  <b>{item.action}</b>
                  <small>{item.categories.join(", ") || "uncategorized"}</small>
                </div>
              ))}
              {analytics.safety.recentBlocks.length === 0 ? (
                <EmptyState icon={ShieldCheck} title="No recent safety pressure" />
              ) : null}
            </div>
          </article>

          <article className="admin-panel wide">
            <div className="panel-heading">
              <span className="section-label">
                <Activity size={15} /> Audit
              </span>
              <h2>Operator and system trail</h2>
            </div>
            <div className="admin-table compact-table">
              {analytics.auditTrail.map((item) => (
                <div className="admin-table-row" key={item.id}>
                  <span>
                    <strong>{item.action}</strong>
                    <small>
                      {item.actorDisplayName} - {item.resourceType} - {formatTime(item.createdAt)}
                    </small>
                  </span>
                  <small>{item.resourceId ?? "n/a"}</small>
                </div>
              ))}
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

function EmptyState(props: { icon: typeof Sparkles; title: string; text?: string }) {
  return (
    <div className="dashboard-empty-card compact-empty">
      <props.icon size={20} />
      <h3>{props.title}</h3>
      {props.text ? <p>{props.text}</p> : null}
    </div>
  );
}

function shortDate(value: string): string {
  return new Intl.DateTimeFormat("en", { month: "short", day: "numeric" }).format(new Date(value));
}

function weekdayLabel(value: string): string {
  return new Intl.DateTimeFormat("en", { weekday: "short" }).format(new Date(value));
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
