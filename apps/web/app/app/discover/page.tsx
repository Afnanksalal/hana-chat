"use client";

import {
  ArrowRight,
  BadgeCheck,
  Compass,
  Flame,
  Heart,
  Lock,
  Search,
  Sparkles,
  Star,
  TrendingUp,
} from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { apiJson, money } from "../api";

interface CharacterSummary {
  id: string;
  name: string;
  description: string;
  rating: "general" | "teen" | "mature" | "adult";
  tags: string[];
  avatarUrl?: string;
  coverImageUrl?: string;
  marketplaceCategory?: string;
  marketplacePreview?: string;
  modelProfile?: string;
  priceCents: number;
  monetizationEnabled: boolean;
  marketplaceStats?: {
    views: number;
    profileOpens: number;
    chatStarts: number;
    chats: number;
    messages: number;
    likes: number;
    saves: number;
    interactions: number;
    trendingScore: number;
  };
}

interface MarketplaceResponse {
  characters: CharacterSummary[];
}

interface CharacterPurchaseResponse {
  provider?: "mock" | "razorpay";
  internalPurchaseId?: string;
  activated?: boolean;
  alreadyPurchased?: boolean;
  free?: boolean;
  ownedByCreator?: boolean;
  trial?: boolean;
  trialLimit?: number;
  trialUsed?: number;
  trialRemaining?: number;
  keyId?: string;
  order?: {
    id: string;
    amount: number;
    currency: string;
  };
  character?: {
    id: string;
    name: string;
    priceCents: number;
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

const categories = ["all", "romance", "fantasy", "comfort", "drama", "anime", "original"];

function freshChatPath(characterId: string): string {
  return `/app/chat?characterId=${encodeURIComponent(characterId)}&new=1`;
}

function DiscoverExperience() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const query = searchParams.get("query")?.trim() ?? "";
  const [characters, setCharacters] = useState<CharacterSummary[]>([]);
  const [category, setCategory] = useState("all");
  const [localSearch, setLocalSearch] = useState(query);
  const [remoteQuery, setRemoteQuery] = useState(query);
  const [status, setStatus] = useState("Loading characters...");
  const viewedCharacterIds = useRef(new Set<string>());

  useEffect(() => {
    let mounted = true;
    const path = remoteQuery
      ? `/api/v1/characters/marketplace?query=${encodeURIComponent(remoteQuery)}`
      : "/api/v1/characters/marketplace";

    apiJson<MarketplaceResponse>(path)
      .then((payload) => {
        if (mounted) {
          setCharacters(payload.characters);
          setStatus(payload.characters.length > 0 ? "" : "No public characters yet.");
        }
      })
      .catch((error: unknown) => {
        if (mounted) {
          setStatus(error instanceof Error ? error.message : "Could not load marketplace.");
        }
      });

    return () => {
      mounted = false;
    };
  }, [remoteQuery]);

  useEffect(() => {
    setLocalSearch(query);
    setRemoteQuery(query);
  }, [query]);

  useEffect(() => {
    const timeout = setTimeout(() => {
      setRemoteQuery(localSearch.trim());
    }, 250);

    return () => clearTimeout(timeout);
  }, [localSearch]);

  const visibleCharacters = useMemo(() => {
    const normalizedSearch = localSearch.trim().toLowerCase();

    return characters.filter((character) => {
      const categoryMatches =
        category === "all" || character.marketplaceCategory?.toLowerCase() === category;
      const searchMatches =
        !normalizedSearch ||
        [character.name, character.description, character.marketplacePreview, ...character.tags]
          .filter(Boolean)
          .join(" ")
          .toLowerCase()
          .includes(normalizedSearch);

      return categoryMatches && searchMatches;
    });
  }, [category, characters, localSearch]);

  const featured = visibleCharacters[0];
  const remaining = featured ? visibleCharacters.slice(1) : visibleCharacters;

  useEffect(() => {
    for (const character of visibleCharacters.slice(0, 12)) {
      if (viewedCharacterIds.current.has(character.id)) {
        continue;
      }

      viewedCharacterIds.current.add(character.id);
      void recordCharacterEvent(character.id, "view");
    }
  }, [visibleCharacters]);

  async function openCharacter(character: CharacterSummary) {
    setStatus(
      character.monetizationEnabled && character.priceCents > 0
        ? `Opening ${character.name}'s trial...`
        : `Opening ${character.name}...`,
    );

    await recordCharacterEvent(character.id, "profile_open");

    if (!character.monetizationEnabled || character.priceCents <= 0) {
      router.push(freshChatPath(character.id));
      return;
    }

    try {
      const purchase = await apiJson<CharacterPurchaseResponse>(
        "/api/v1/monetization/character-purchases",
        {
          method: "POST",
          body: JSON.stringify({ characterId: character.id, provider: "razorpay" }),
        },
      );

      if (purchase.activated || purchase.provider === "mock") {
        if (purchase.trial) {
          setStatus(`${purchase.trialRemaining ?? 0} free trial messages left.`);
        }
        router.push(freshChatPath(character.id));
        return;
      }

      if (
        purchase.provider !== "razorpay" ||
        !purchase.keyId ||
        !purchase.order ||
        !purchase.internalPurchaseId
      ) {
        setStatus("Checkout could not start for this character.");
        return;
      }

      const Razorpay = await loadRazorpay();
      const checkout = new Razorpay({
        key: purchase.keyId,
        order_id: purchase.order.id,
        amount: purchase.order.amount,
        currency: purchase.order.currency,
        name: "Hana Chat",
        description: `Unlock ${purchase.character?.name ?? character.name}`,
        handler: (response) => {
          void apiJson("/api/v1/monetization/character-purchases/verify", {
            method: "POST",
            body: JSON.stringify({
              internalPurchaseId: purchase.internalPurchaseId,
              razorpayOrderId: response.razorpay_order_id,
              razorpayPaymentId: response.razorpay_payment_id,
              razorpaySignature: response.razorpay_signature,
            }),
          })
            .then(() => {
              setStatus("Unlocked.");
              router.push(freshChatPath(character.id));
            })
            .catch((error: unknown) =>
              setStatus(error instanceof Error ? error.message : "Payment verification failed."),
            );
        },
      });

      checkout.open();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Could not unlock character.");
    }
  }

  return (
    <div className="app-page discover-page">
      <section className="marketplace-hero">
        <div>
          <span className="section-label">
            <Compass size={16} /> Discover
          </span>
          <h1>Find your next favorite character.</h1>
          <p>
            Browse original companions, story partners, rivals, and comfort chats built by creators.
          </p>
        </div>
        <form
          className="marketplace-search"
          onSubmit={(event) => {
            event.preventDefault();
          }}
        >
          <Search size={18} />
          <input
            aria-label="Search characters"
            placeholder="Search romance, fantasy, rivals..."
            value={localSearch}
            onChange={(event) => setLocalSearch(event.target.value)}
          />
        </form>
      </section>

      <div className="category-strip" aria-label="Marketplace categories">
        {categories.map((item) => (
          <button
            className={category === item ? "active" : ""}
            key={item}
            type="button"
            onClick={() => setCategory(item)}
          >
            {item}
          </button>
        ))}
      </div>

      {featured ? (
        <section className="featured-character">
          <div className="featured-cover">
            <img src={featured.coverImageUrl ?? "/assets/hana-hero.png"} alt="" />
          </div>
          <div className="featured-content">
            <div className="featured-avatar">
              <img src={featured.avatarUrl ?? "/assets/hana-icon-head.png"} alt="" />
            </div>
            <span>
              <Flame size={15} /> {marketplaceLabel(featured)}
            </span>
            <h2>{featured.name}</h2>
            <p>{featured.marketplacePreview || featured.description}</p>
            <div className="chip-row">
              {featured.tags.slice(0, 5).map((tag) => (
                <span key={tag}>{tag}</span>
              ))}
            </div>
            <div className="market-stats">
              {featured.monetizationEnabled && featured.priceCents > 0 ? (
                <span>
                  <Lock size={15} /> {money(featured.priceCents, "USD")}
                </span>
              ) : null}
              {featured.monetizationEnabled && featured.priceCents > 0 ? (
                <span>
                  <Sparkles size={15} /> 30-message trial
                </span>
              ) : null}
              <span>
                <TrendingUp size={15} /> {formatCompact(featured.marketplaceStats?.chatStarts ?? 0)}{" "}
                chats
              </span>
              <span>
                <Heart size={15} /> {formatCompact(featured.marketplaceStats?.likes ?? 0)}
              </span>
              <span>
                <Star size={15} /> {featured.rating}
              </span>
            </div>
            <button
              className="primary-action"
              type="button"
              onClick={() => void openCharacter(featured)}
            >
              {featured.monetizationEnabled && featured.priceCents > 0
                ? "Try 30 free"
                : "Start chat"}{" "}
              <ArrowRight size={18} />
            </button>
          </div>
        </section>
      ) : null}

      <section className="marketplace-grid">
        {remaining.map((character) => {
          const price =
            character.monetizationEnabled && character.priceCents > 0
              ? `30 free | ${money(character.priceCents, "USD")}`
              : "Included";

          return (
            <article className="market-card" key={character.id}>
              <div className="market-card-cover">
                <img src={character.coverImageUrl ?? "/assets/hana-hero.png"} alt="" />
              </div>
              <div className="market-card-body">
                <div className="market-card-avatar">
                  <img src={character.avatarUrl ?? "/assets/hana-icon-head.png"} alt="" />
                </div>
                <div className="market-card-title">
                  <h2>{character.name}</h2>
                  <span>
                    {character.monetizationEnabled ? <Lock size={13} /> : <BadgeCheck size={13} />}
                    {price}
                  </span>
                </div>
                <p>{character.marketplacePreview || character.description}</p>
                <div className="chip-row">
                  {character.tags.slice(0, 3).map((tag) => (
                    <span key={tag}>{tag}</span>
                  ))}
                </div>
                <div className="market-card-footer">
                  <span>
                    <Sparkles size={14} /> {character.modelProfile ?? "balanced"}
                  </span>
                  <span>
                    <TrendingUp size={14} />{" "}
                    {formatCompact(character.marketplaceStats?.interactions ?? 0)}
                  </span>
                  <button
                    className="icon-control"
                    type="button"
                    aria-label={`Open ${character.name}`}
                    onClick={() => void openCharacter(character)}
                  >
                    <ArrowRight size={18} />
                  </button>
                </div>
              </div>
            </article>
          );
        })}
      </section>

      {visibleCharacters.length === 0 ? (
        <section className="empty-state">
          <Compass size={24} />
          <h2>No matches yet</h2>
          <p>Try another category or create the character you wanted to find.</p>
          <Link className="secondary-action compact" href="/app/create">
            Create character <ArrowRight size={16} />
          </Link>
        </section>
      ) : null}

      {status ? (
        <p className="form-status" aria-live="polite">
          {status}
        </p>
      ) : null}
    </div>
  );
}

export default function DiscoverPage() {
  return (
    <Suspense fallback={null}>
      <DiscoverExperience />
    </Suspense>
  );
}

function formatCompact(value: number): string {
  return new Intl.NumberFormat("en", { notation: "compact" }).format(value);
}

function marketplaceLabel(character: CharacterSummary): string {
  const score = character.marketplaceStats?.trendingScore ?? 0;

  return score > 0 ? "Trending now" : "Recently published";
}

async function recordCharacterEvent(
  characterId: string,
  type: "view" | "profile_open",
): Promise<void> {
  await apiJson(`/api/v1/characters/${encodeURIComponent(characterId)}/events`, {
    method: "POST",
    body: JSON.stringify({ type }),
  }).catch(() => undefined);
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
