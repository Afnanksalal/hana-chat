"use client";

import {
  ArrowRight,
  BookHeart,
  Brain,
  Compass,
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
import { useEffect, useMemo, useState } from "react";
import { apiJson } from "./api";

interface DashboardResponse {
  user: {
    displayName: string;
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

const fallbackDashboard: DashboardResponse = {
  user: { displayName: "Hana User" },
  plan: { id: "free", name: "Free" },
  usage: { monthlyMessagesUsed: 0, monthlyMessagesLimit: 900, messagesRemaining: 900 },
  counts: { savedMemories: 0, createdCharacters: 0, activeConversations: 0 },
  nextAction: "Start with Hana",
};

export default function AppHomePage() {
  const [dashboard, setDashboard] = useState<DashboardResponse>(fallbackDashboard);
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [characters, setCharacters] = useState<CharacterSummary[]>([]);
  const [status, setStatus] = useState("");

  useEffect(() => {
    let mounted = true;

    Promise.all([
      apiJson<DashboardResponse>("/api/v1/dashboard"),
      apiJson<{ conversations: ConversationSummary[] }>("/api/v1/chat/conversations"),
      apiJson<{ characters: CharacterSummary[] }>("/api/v1/characters/recommended"),
    ])
      .then(([dashboardPayload, conversationPayload, characterPayload]) => {
        if (mounted) {
          setDashboard(dashboardPayload);
          setConversations(conversationPayload.conversations);
          setCharacters(characterPayload.characters);
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

  const usagePercent = Math.min(
    100,
    Math.round(
      (dashboard.usage.monthlyMessagesUsed / Math.max(1, dashboard.usage.monthlyMessagesLimit)) *
        100,
    ),
  );
  const featuredCharacters = useMemo(
    () =>
      characters
        .filter((character) => !conversations.some((item) => item.characterId === character.id))
        .slice(0, 3),
    [characters, conversations],
  );
  const recentConversations = conversations.slice(0, 4);
  const healthItems = [
    {
      label: "Messages left",
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
            <p>messages left on {dashboard.plan.name}</p>
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
                href={`/app/chat?characterId=${encodeURIComponent(conversation.characterId)}`}
                key={conversation.id}
              >
                <img
                  src={conversation.character.avatarUrl ?? "/assets/hana-icon-head.png"}
                  alt=""
                />
                <span>
                  <strong>{conversation.character.name}</strong>
                  <small>{conversation.lastMessage?.content ?? "No messages yet"}</small>
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
            <Link href="/app/wallet">
              <WalletCards size={18} />
              <span>
                <strong>Creator wallet</strong>
                <small>Paid unlocks, balances, and payout requests.</small>
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
                <small>Plan, 18+ access, voice, and memory.</small>
              </span>
            </Link>
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
                <img src={character.avatarUrl ?? "/assets/hana-icon-head.png"} alt="" />
                <span>{character.marketplaceCategory ?? character.rating ?? "featured"}</span>
                <h3>{character.name}</h3>
                <p>{character.marketplacePreview ?? character.description}</p>
              </Link>
            ))}
          </div>
        </article>
      </section>

      {status ? <p className="floating-status">{status}</p> : null}
    </div>
  );
}

function greetingFor(displayName: string): string {
  const firstName = displayName.trim().split(/\s+/)[0] || "there";

  return `Your night is ready, ${firstName}.`;
}
