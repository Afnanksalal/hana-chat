"use client";

import {
  ArrowRight,
  BadgeCheck,
  Gem,
  Image as ImageIcon,
  ListPlus,
  RefreshCw,
  Search,
  Sparkles,
  Tags,
  UserRound,
  WalletCards,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { apiJson, money } from "../api";
import { type StellarPaymentIntent } from "../stellar-payments";
import { StellarCheckoutModal } from "../components/stellar-checkout-modal";
import { StellarWalletModal } from "../components/stellar-wallet-modal";

interface CharacterSummary {
  id: string;
  name: string;
  avatarUrl?: string;
}

interface CharactersMineResponse {
  characters: CharacterSummary[];
}

interface MediaAssetResponse {
  id: string;
  url: string;
  purpose: "nft_art";
  mimeType: "image/png" | "image/jpeg" | "image/webp";
  byteSize: number;
  fileName: string;
  provider?: "xai";
  model?: string;
}

interface NftListing {
  id: string;
  priceCents: number;
  minOfferCents: number;
  currency: string;
  assetCode: string;
  expiresAt: string | null;
  asset: {
    id: string;
    title: string;
    description: string;
    imageUrl: string;
    contractId: string;
    tokenId: string;
    network: string;
    royaltyBps: number;
    ownerAddress: string;
    creatorAddress: string;
    mintTxHash: string | null;
    mintedAt: string | null;
    character: {
      id: string;
      name: string;
      avatarUrl: string | null;
    };
    creator: {
      displayName: string;
      avatarUrl: string | null;
    };
  };
}

interface NftMarketplaceResponse {
  enabled: boolean;
  platformFeeBps: number;
  maxRoyaltyBps: number;
  listings: NftListing[];
}

interface OwnedNftAsset {
  id: string;
  title: string;
  description: string;
  imageUrl: string;
  contractId: string;
  tokenId: string;
  network: string;
  status: "minting" | "minted" | "listed" | "sold" | "delisted" | "failed";
  moderationStatus: "approved" | "pending_review" | "rejected";
  creatorUserId: string;
  ownerUserId: string;
  ownerAddress: string;
  creatorAddress: string;
  royaltyBps: number;
  mintTxHash: string | null;
  failureReason: string | null;
  createdAt: string;
  mintedAt: string | null;
  listedAt: string | null;
  listing: {
    id: string;
    priceCents: number;
    minOfferCents: number;
    currency: string;
    status: "active" | "reserved";
    reservedUntil: string | null;
  } | null;
  character: {
    id: string;
    name: string;
  };
}

interface NftOffer {
  id: string;
  assetId: string;
  title: string;
  imageUrl: string;
  amountCents: number;
  currency: string;
  status: string;
  txHash: string | null;
  expiresAt: string | null;
  createdAt: string;
  canAccept: boolean;
}

interface NftMineResponse {
  enabled: boolean;
  platformFeeBps: number;
  maxRoyaltyBps: number;
  assets: OwnedNftAsset[];
  offers: NftOffer[];
}

interface CreateNftPaymentResponse {
  provider: "stellar";
  saleId?: string;
  offerId?: string;
  payment: StellarPaymentIntent;
}

const defaultMintPrompt =
  "Premium collectible portrait for this character, iconic pose, strong silhouette, rich detail, finished for collectors.";

const defaultMarketplacePolicy = {
  platformFeeBps: 0,
  maxRoyaltyBps: 1_000,
};

function formatHash(value: string): string {
  if (value.length <= 14) {
    return value;
  }

  return `${value.slice(0, 8)}...${value.slice(-6)}`;
}

function listingHasLiveReservation(listing: OwnedNftAsset["listing"]): boolean {
  return Boolean(
    listing?.status === "reserved" &&
    listing.reservedUntil !== null &&
    new Date(listing.reservedUntil).getTime() > Date.now(),
  );
}

function formatPercentFromBps(bps: number): string {
  return `${(bps / 100).toLocaleString("en", {
    maximumFractionDigits: 2,
    minimumFractionDigits: bps % 100 === 0 ? 0 : 2,
  })}%`;
}

function parseMoneyInput(value: string): number | null {
  const dollars = Number.parseFloat(value);

  if (!Number.isFinite(dollars) || dollars <= 0) {
    return null;
  }

  return Math.round(dollars * 100);
}

function parseDurationDays(value: string): number {
  const days = Number.parseInt(value, 10);

  if (!Number.isInteger(days)) {
    return 30;
  }

  return Math.min(180, Math.max(1, days));
}

function expiresAtFromDays(value: string): string {
  const expiresAt = new Date();
  expiresAt.setUTCDate(expiresAt.getUTCDate() + parseDurationDays(value));

  return expiresAt.toISOString();
}

function sellerNetEstimateCents(input: {
  amountCents: number;
  platformFeeBps: number;
  royaltyBps: number;
  isCreatorOwner: boolean;
}): number {
  const platformFeeCents = Math.floor((input.amountCents * input.platformFeeBps) / 10_000);
  const royaltyFeeCents = input.isCreatorOwner
    ? 0
    : Math.floor((input.amountCents * input.royaltyBps) / 10_000);

  return Math.max(0, input.amountCents - platformFeeCents - royaltyFeeCents);
}

function formatStatusLabel(value: string): string {
  return value
    .replace(/[_-]+/g, " ")
    .replace(/\b[a-z]/g, (letter) => letter.toUpperCase())
    .trim();
}

function CharacterPicker({
  characters,
  selectedCharacter,
  onSelect,
}: {
  characters: CharacterSummary[];
  selectedCharacter: CharacterSummary | undefined;
  onSelect: (characterId: string) => void;
}) {
  const [query, setQuery] = useState("");
  const filteredCharacters = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    if (!normalizedQuery) {
      return characters;
    }

    return characters.filter((character) => character.name.toLowerCase().includes(normalizedQuery));
  }, [characters, query]);

  return (
    <div className="nft-character-picker">
      <label className="nft-character-search">
        <Search size={16} />
        <input
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search characters"
          value={query}
        />
      </label>
      <div className="nft-character-options" role="listbox" aria-label="Creator characters">
        {filteredCharacters.map((character) => {
          const selected = character.id === selectedCharacter?.id;

          return (
            <button
              aria-selected={selected}
              className={selected ? "active" : ""}
              key={character.id}
              onClick={() => onSelect(character.id)}
              role="option"
              type="button"
            >
              <span className="nft-character-avatar" aria-hidden="true">
                {character.avatarUrl ? (
                  <img src={character.avatarUrl} alt="" />
                ) : (
                  <UserRound size={18} />
                )}
              </span>
              <span>
                <strong>{character.name}</strong>
                <small>{selected ? "Selected for this collectible" : "Use this character"}</small>
              </span>
              {selected ? <BadgeCheck size={16} /> : null}
            </button>
          );
        })}
        {filteredCharacters.length === 0 ? (
          <p className="nft-character-empty">No matching characters.</p>
        ) : null}
        {characters.length === 0 ? (
          <p className="nft-character-empty">Create a character before opening the studio.</p>
        ) : null}
      </div>
    </div>
  );
}

export default function NftStudioPage() {
  const [marketplace, setMarketplace] = useState<NftMarketplaceResponse>({
    enabled: false,
    ...defaultMarketplacePolicy,
    listings: [],
  });
  const [mine, setMine] = useState<NftMineResponse>({
    enabled: false,
    ...defaultMarketplacePolicy,
    assets: [],
    offers: [],
  });
  const [characters, setCharacters] = useState<CharacterSummary[]>([]);
  const [activeTab, setActiveTab] = useState<"market" | "studio">("market");
  const [selectedCharacterId, setSelectedCharacterId] = useState("");
  const [prompt, setPrompt] = useState(defaultMintPrompt);
  const [generated, setGenerated] = useState<MediaAssetResponse | null>(null);
  const [mintTitle, setMintTitle] = useState("");
  const [mintDescription, setMintDescription] = useState("");
  const [mintWallet, setMintWallet] = useState("");
  const [royaltyBps, setRoyaltyBps] = useState(500);
  const [listingDrafts, setListingDrafts] = useState<Record<string, string>>({});
  const [listingMinimumDrafts, setListingMinimumDrafts] = useState<Record<string, string>>({});
  const [listingDurationDrafts, setListingDurationDrafts] = useState<Record<string, string>>({});
  const [offerDrafts, setOfferDrafts] = useState<Record<string, string>>({});
  const [offerDurationDrafts, setOfferDurationDrafts] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [status, setStatus] = useState("Loading collectibles market...");

  const [connectedAddress, setConnectedAddress] = useState("");
  const [isWalletOpen, setIsWalletOpen] = useState(false);
  const [isCheckoutOpen, setIsCheckoutOpen] = useState(false);
  const [activePayment, setActivePayment] = useState<StellarPaymentIntent | null>(null);
  const [activeVerifyPath, setActiveVerifyPath] = useState("");
  const [activeVerifyBody, setActiveVerifyBody] = useState<Record<string, unknown>>({});
  const [pendingWalletAction, setPendingWalletAction] = useState<
    | { type: "buy"; target: NftListing }
    | { type: "offer"; target: { listing: NftListing; amountCents: number } }
    | { type: "mint"; target: null }
    | null
  >(null);

  useEffect(() => {
    void loadAll();
  }, []);

  const handleAddressResolved = (address: string) => {
    setConnectedAddress(address);
    if (pendingWalletAction) {
      const action = pendingWalletAction;
      setPendingWalletAction(null);

      if (action.type === "buy") {
        void executeBuyListing(action.target, address);
      } else if (action.type === "offer") {
        void executeMakeOffer(action.target.listing, action.target.amountCents, address);
      } else if (action.type === "mint") {
        setMintWallet(address);
      }
    }
  };

  const selectedCharacter = useMemo(
    () => characters.find((character) => character.id === selectedCharacterId) ?? characters[0],
    [characters, selectedCharacterId],
  );
  const nftReady = marketplace.enabled || mine.enabled;
  const platformFeeBps = marketplace.platformFeeBps || mine.platformFeeBps;
  const maxRoyaltyBps = marketplace.maxRoyaltyBps || mine.maxRoyaltyBps;

  useEffect(() => {
    if (!selectedCharacterId && characters[0]) {
      setSelectedCharacterId(characters[0].id);
    }
  }, [characters, selectedCharacterId]);

  async function loadAll() {
    setBusy("refresh");

    try {
      const [marketplacePayload, minePayload, charactersPayload] = await Promise.all([
        apiJson<NftMarketplaceResponse>("/api/v1/nft/marketplace"),
        apiJson<NftMineResponse>("/api/v1/nft/mine"),
        apiJson<CharactersMineResponse>("/api/v1/characters/mine"),
      ]);

      setMarketplace(marketplacePayload);
      setMine(minePayload);
      setCharacters(charactersPayload.characters);
      setStatus(
        marketplacePayload.enabled
          ? ""
          : "Collectibles trading is being activated. You can prepare artwork while the market is read-only.",
      );
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Collectibles market unavailable.");
    } finally {
      setBusy(null);
    }
  }

  async function generateNftArt() {
    if (!selectedCharacter) {
      setStatus("Create a character before generating collectible art.");
      return;
    }

    setBusy("generate");
    setStatus("Generating collectible art...");

    try {
      const media = await apiJson<MediaAssetResponse>("/api/v1/media/generate", {
        method: "POST",
        body: JSON.stringify({
          purpose: "nft_art",
          prompt,
          characterId: selectedCharacter.id,
          characterName: selectedCharacter.name,
          style: "premium collectible character artwork",
          artDirection: "semi_real",
          mood: "auto",
          backdrop: "auto",
          detailLevel: "rich",
          aspectRatio: "1:1",
        }),
      });

      setGenerated(media);
      setMintTitle(`${selectedCharacter.name} Genesis Art`);
      setMintDescription(
        `A creator collectible artwork for ${selectedCharacter.name} on Hana Chat.`,
      );
      setStatus("Art generated. Review ownership details, then create the collectible.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Could not generate collectible art.");
    } finally {
      setBusy(null);
    }
  }

  async function mintGeneratedArt() {
    if (!selectedCharacter || !generated) {
      setStatus("Generate collectible art before creating ownership.");
      return;
    }

    setBusy("mint");
    setStatus("Creating collectible ownership...");

    try {
      const payload = await apiJson<{ assetId: string; tokenId: string; txHash: string }>(
        "/api/v1/nft/assets",
        {
          method: "POST",
          body: JSON.stringify({
            characterId: selectedCharacter.id,
            mediaAssetId: generated.id,
            title: mintTitle,
            description: mintDescription,
            ownerWalletAddress: mintWallet,
            royaltyBps,
          }),
        },
      );

      setStatus(`Created ${payload.tokenId} with receipt ${formatHash(payload.txHash)}.`);
      setGenerated(null);
      await loadAll();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Collectible creation failed.");
    } finally {
      setBusy(null);
    }
  }

  async function listAsset(asset: OwnedNftAsset) {
    const priceCents = parseMoneyInput(listingDrafts[asset.id] ?? "");
    const minOfferCents = parseMoneyInput(listingMinimumDrafts[asset.id] ?? "");

    if (!priceCents) {
      setStatus("Enter a valid list price.");
      return;
    }

    if (!minOfferCents) {
      setStatus("Enter a valid minimum offer.");
      return;
    }

    if (minOfferCents > priceCents) {
      setStatus("Minimum offer cannot be higher than the list price.");
      return;
    }

    setBusy(`list:${asset.id}`);
    setStatus("Creating listing...");

    try {
      await apiJson(`/api/v1/nft/assets/${encodeURIComponent(asset.id)}/listings`, {
        method: "POST",
        body: JSON.stringify({
          priceCents,
          minOfferCents,
          currency: "USD",
          expiresAt: expiresAtFromDays(listingDurationDrafts[asset.id] ?? "30"),
        }),
      });
      setStatus("Collectible listed.");
      await loadAll();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Could not list collectible.");
    } finally {
      setBusy(null);
    }
  }

  async function cancelListing(asset: OwnedNftAsset) {
    if (!asset.listing) {
      return;
    }

    setBusy(`cancel:${asset.id}`);
    setStatus("Cancelling listing...");

    try {
      await apiJson(`/api/v1/nft/listings/${encodeURIComponent(asset.listing.id)}/cancel`, {
        method: "POST",
      });
      setStatus("Listing cancelled.");
      await loadAll();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Could not cancel listing.");
    } finally {
      setBusy(null);
    }
  }

  function buyListing(listing: NftListing) {
    if (connectedAddress) {
      void executeBuyListing(listing, connectedAddress);
    } else {
      setPendingWalletAction({ type: "buy", target: listing });
      setIsWalletOpen(true);
    }
  }

  async function executeBuyListing(listing: NftListing, buyerWalletAddress: string) {
    setBusy(`buy:${listing.id}`);
    setStatus("Preparing payment...");

    try {
      const checkout = await apiJson<CreateNftPaymentResponse>(
        `/api/v1/nft/listings/${encodeURIComponent(listing.id)}/purchase`,
        {
          method: "POST",
          body: JSON.stringify({ buyerWalletAddress }),
        },
      );

      if (!checkout.saleId) {
        throw new Error("Collectible sale did not start.");
      }

      setActivePayment(checkout.payment);
      setActiveVerifyPath("/api/v1/nft/purchases/verify");
      setActiveVerifyBody({
        saleId: checkout.saleId,
        paymentId: checkout.payment.id,
        buyerWalletAddress,
      });
      setIsCheckoutOpen(true);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Collectible purchase failed.");
    } finally {
      setBusy(null);
    }
  }

  function makeOffer(listing: NftListing) {
    const amountCents = parseMoneyInput(offerDrafts[listing.asset.id] ?? "");

    if (!amountCents) {
      setStatus("Enter a valid offer amount.");
      return;
    }

    if (amountCents < listing.minOfferCents) {
      setStatus(`Offer must be at least ${money(listing.minOfferCents, listing.currency)}.`);
      return;
    }

    if (connectedAddress) {
      void executeMakeOffer(listing, amountCents, connectedAddress);
    } else {
      setPendingWalletAction({
        type: "offer",
        target: { listing, amountCents },
      });
      setIsWalletOpen(true);
    }
  }

  async function executeMakeOffer(
    listing: NftListing,
    amountCents: number,
    buyerWalletAddress: string,
  ) {
    setBusy(`offer:${listing.asset.id}`);
    setStatus("Preparing payment...");

    try {
      const offer = await apiJson<CreateNftPaymentResponse>(
        `/api/v1/nft/assets/${encodeURIComponent(listing.asset.id)}/offers`,
        {
          method: "POST",
          body: JSON.stringify({
            amountCents,
            currency: listing.currency,
            buyerWalletAddress,
            expiresAt: expiresAtFromDays(offerDurationDrafts[listing.asset.id] ?? "30"),
          }),
        },
      );

      if (!offer.offerId) {
        throw new Error("Collectible offer did not start.");
      }

      setActivePayment(offer.payment);
      setActiveVerifyPath("/api/v1/nft/offers/verify");
      setActiveVerifyBody({
        offerId: offer.offerId,
        paymentId: offer.payment.id,
        buyerWalletAddress,
      });
      setIsCheckoutOpen(true);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Offer failed.");
    } finally {
      setBusy(null);
    }
  }

  async function acceptOffer(offer: NftOffer) {
    setBusy(`accept:${offer.id}`);
    setStatus("Accepting offer and transferring collectible...");

    try {
      await apiJson(`/api/v1/nft/offers/${encodeURIComponent(offer.id)}/accept`, {
        method: "POST",
        body: JSON.stringify({ offerId: offer.id }),
      });
      setStatus("Offer accepted.");
      await loadAll();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Could not accept offer.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="app-page nft-page">
      <section className="wallet-hero nft-hero">
        <div className="payment-hero-copy">
          <span className="section-label">
            <Gem size={15} /> Hana Collectibles
          </span>
          <h1>Creator collectibles</h1>
          <p>
            Launch character artwork, manage listings, review offers, and track creator earnings.
          </p>
        </div>
        <div className="payment-hero-chips" aria-label="Collectibles status">
          <span>{nftReady ? "Market live" : "Activation pending"}</span>
          <span>{marketplace.listings.length.toLocaleString()} listings</span>
          <span>{mine.assets.length.toLocaleString()} in vault</span>
          <span>Hana fee {formatPercentFromBps(platformFeeBps)}</span>
        </div>
      </section>

      <div className="nft-tabbar" role="tablist" aria-label="Collectibles sections">
        <button
          className={activeTab === "market" ? "active" : ""}
          onClick={() => setActiveTab("market")}
          type="button"
        >
          <Tags size={16} /> Market
        </button>
        <button
          className={activeTab === "studio" ? "active" : ""}
          onClick={() => setActiveTab("studio")}
          type="button"
        >
          <Sparkles size={16} /> Creator Studio
        </button>
        <button onClick={() => void loadAll()} type="button" disabled={busy === "refresh"}>
          <RefreshCw size={16} /> Refresh
        </button>
      </div>

      {status ? <p className="form-status">{status}</p> : null}

      {activeTab === "market" ? (
        <section className="nft-market-grid">
          {marketplace.listings.map((listing) => {
            const offerDuration = offerDurationDrafts[listing.asset.id] ?? "30";

            return (
              <article className="nft-card" key={listing.id}>
                <img src={listing.asset.imageUrl} alt="" />
                <div className="nft-card-body">
                  <span className="section-label">
                    <BadgeCheck size={14} /> {listing.asset.character.name}
                  </span>
                  <h2>{listing.asset.title}</h2>
                  <p>{listing.asset.description}</p>
                  <dl className="nft-facts">
                    <div>
                      <dt>Price</dt>
                      <dd>{money(listing.priceCents, listing.currency)}</dd>
                    </div>
                    <div>
                      <dt>Min offer</dt>
                      <dd>{money(listing.minOfferCents, listing.currency)}</dd>
                    </div>
                    <div>
                      <dt>Royalty</dt>
                      <dd>{formatPercentFromBps(listing.asset.royaltyBps)}</dd>
                    </div>
                  </dl>
                  <div className="nft-economics-strip">
                    <span>Hana fee {formatPercentFromBps(platformFeeBps)}</span>
                    <span>Offers expire in {parseDurationDays(offerDuration)} days</span>
                  </div>
                  <div className="nft-actions">
                    <button
                      className="primary-action compact"
                      type="button"
                      onClick={() => void buyListing(listing)}
                      disabled={Boolean(busy) || !nftReady}
                    >
                      Buy <WalletCards size={16} />
                    </button>
                    <div className="nft-offer-controls">
                      <label>
                        Offer amount
                        <input
                          inputMode="decimal"
                          placeholder={(listing.minOfferCents / 100).toFixed(2)}
                          value={offerDrafts[listing.asset.id] ?? ""}
                          onChange={(event) =>
                            setOfferDrafts((current) => ({
                              ...current,
                              [listing.asset.id]: event.target.value,
                            }))
                          }
                        />
                      </label>
                      <label>
                        Days
                        <input
                          inputMode="numeric"
                          max={180}
                          min={1}
                          type="number"
                          value={offerDuration}
                          onChange={(event) =>
                            setOfferDurationDrafts((current) => ({
                              ...current,
                              [listing.asset.id]: event.target.value,
                            }))
                          }
                        />
                      </label>
                    </div>
                    <button
                      className="secondary-action compact"
                      type="button"
                      onClick={() => void makeOffer(listing)}
                      disabled={Boolean(busy) || !nftReady}
                    >
                      Make offer <ArrowRight size={16} />
                    </button>
                  </div>
                </div>
              </article>
            );
          })}
          {marketplace.listings.length === 0 ? (
            <article className="settings-card empty-state">
              <Gem size={24} />
              <h2>No collectibles listed yet</h2>
              <p>Live character collectibles will appear here as creators publish them.</p>
            </article>
          ) : null}
        </section>
      ) : (
        <section className="nft-studio-grid">
          <article className="settings-card nft-mint-card">
            <div className="settings-card-title">
              <ImageIcon />
              <div>
                <h2>Create a collectible</h2>
                <p>Generate character art, set royalties, and prepare it for collectors.</p>
              </div>
            </div>
            <div className="nft-policy-strip">
              <span>
                <strong>Hana fee</strong>
                {formatPercentFromBps(platformFeeBps)}
              </span>
              <span>
                <strong>Royalty cap</strong>
                {formatPercentFromBps(maxRoyaltyBps)}
              </span>
              <span>
                <strong>Offer floors</strong>
                Seller controlled
              </span>
            </div>
            <div className="nft-mint-controls">
              <div className="nft-field-block">
                <span className="nft-field-label">Character</span>
                <CharacterPicker
                  characters={characters}
                  selectedCharacter={selectedCharacter}
                  onSelect={setSelectedCharacterId}
                />
              </div>
              <label>
                Art direction
                <textarea value={prompt} onChange={(event) => setPrompt(event.target.value)} />
              </label>
            </div>
            <button
              className="primary-action compact"
              type="button"
              onClick={() => void generateNftArt()}
              disabled={Boolean(busy) || !selectedCharacter}
            >
              Generate art <Sparkles size={16} />
            </button>

            {generated ? (
              <div className="nft-generated-preview">
                <div className="nft-generated-art">
                  <img src={generated.url} alt="" />
                  <span>{selectedCharacter?.name ?? "Generated"} artwork</span>
                </div>
                <div className="nft-mint-fields">
                  <label>
                    Title
                    <input
                      value={mintTitle}
                      onChange={(event) => setMintTitle(event.target.value)}
                    />
                  </label>
                  <label>
                    Recipient wallet
                    <div className="input-with-button">
                      <input
                        value={mintWallet}
                        onChange={(event) => setMintWallet(event.target.value.trim())}
                        placeholder="G..."
                      />
                      <button
                        type="button"
                        className="secondary-action compact"
                        onClick={() => {
                          setPendingWalletAction({ type: "mint", target: null });
                          setIsWalletOpen(true);
                        }}
                      >
                        Connect
                      </button>
                    </div>
                  </label>
                  <label className="wide">
                    Description
                    <textarea
                      value={mintDescription}
                      onChange={(event) => setMintDescription(event.target.value)}
                    />
                  </label>
                  <label>
                    Royalty %
                    <input
                      inputMode="decimal"
                      min={0}
                      max={maxRoyaltyBps / 100}
                      step={0.25}
                      type="number"
                      value={royaltyBps / 100}
                      onChange={(event) =>
                        setRoyaltyBps(Math.round(Number(event.target.value || 0) * 100))
                      }
                    />
                  </label>
                  <button
                    className="primary-action compact nft-mint-submit"
                    type="button"
                    onClick={() => void mintGeneratedArt()}
                    disabled={Boolean(busy) || !nftReady}
                  >
                    Create collectible <Gem size={16} />
                  </button>
                </div>
              </div>
            ) : null}
          </article>

          <article className="settings-card nft-owned-panel">
            <div className="settings-card-title">
              <ListPlus />
              <div>
                <h2>Vault and offers</h2>
                <p>Manage live listings, offer floors, and buyer offers.</p>
              </div>
            </div>
            <div className="nft-owned-list">
              {mine.assets.map((asset) => {
                const listPriceCents = parseMoneyInput(listingDrafts[asset.id] ?? "");
                const sellerNetCents = listPriceCents
                  ? sellerNetEstimateCents({
                      amountCents: listPriceCents,
                      platformFeeBps,
                      royaltyBps: asset.royaltyBps,
                      isCreatorOwner: asset.creatorUserId === asset.ownerUserId,
                    })
                  : null;

                return (
                  <div className="nft-owned-row" key={asset.id}>
                    <img src={asset.imageUrl} alt="" />
                    <div>
                      <strong>{asset.title}</strong>
                      <small>
                        {formatStatusLabel(asset.status)} -{" "}
                        {asset.mintedAt
                          ? `created ${new Date(asset.mintedAt).toLocaleDateString()}`
                          : "pending"}
                      </small>
                      {asset.listing ? (
                        <div className="nft-inline-listing active">
                          <span>
                            <b>
                              {asset.listing.status === "reserved"
                                ? "Checkout reserved"
                                : money(asset.listing.priceCents, asset.listing.currency)}
                            </b>
                            <small>
                              Min offer {money(asset.listing.minOfferCents, asset.listing.currency)}
                            </small>
                          </span>
                          <button
                            className="secondary-action compact"
                            type="button"
                            onClick={() => void cancelListing(asset)}
                            disabled={
                              Boolean(busy) || !nftReady || listingHasLiveReservation(asset.listing)
                            }
                          >
                            Cancel
                          </button>
                        </div>
                      ) : asset.status === "minted" ? (
                        <div className="nft-listing-form">
                          <label>
                            List price
                            <input
                              inputMode="decimal"
                              placeholder="49.00"
                              value={listingDrafts[asset.id] ?? ""}
                              onChange={(event) =>
                                setListingDrafts((current) => ({
                                  ...current,
                                  [asset.id]: event.target.value,
                                }))
                              }
                            />
                          </label>
                          <label>
                            Min offer
                            <input
                              inputMode="decimal"
                              placeholder="39.00"
                              value={listingMinimumDrafts[asset.id] ?? ""}
                              onChange={(event) =>
                                setListingMinimumDrafts((current) => ({
                                  ...current,
                                  [asset.id]: event.target.value,
                                }))
                              }
                            />
                          </label>
                          <label>
                            Days
                            <input
                              inputMode="numeric"
                              max={180}
                              min={1}
                              type="number"
                              value={listingDurationDrafts[asset.id] ?? "30"}
                              onChange={(event) =>
                                setListingDurationDrafts((current) => ({
                                  ...current,
                                  [asset.id]: event.target.value,
                                }))
                              }
                            />
                          </label>
                          <div className="nft-fee-preview">
                            <span>Hana fee {formatPercentFromBps(platformFeeBps)}</span>
                            <span>
                              Seller net{" "}
                              {sellerNetCents === null
                                ? "after fees"
                                : money(sellerNetCents, "USD")}
                            </span>
                          </div>
                          <button
                            className="secondary-action compact"
                            type="button"
                            onClick={() => void listAsset(asset)}
                            disabled={Boolean(busy) || !nftReady}
                          >
                            List
                          </button>
                        </div>
                      ) : null}
                    </div>
                  </div>
                );
              })}
              {mine.assets.length === 0 ? <p>No collectibles in your vault yet.</p> : null}
            </div>
            <div className="nft-offer-list">
              <h3>Buyer offers</h3>
              {mine.offers.map((offer) => (
                <div className="nft-offer-row" key={offer.id}>
                  <img src={offer.imageUrl} alt="" />
                  <div>
                    <strong>{offer.title}</strong>
                    <small>
                      {formatStatusLabel(offer.status)} - {money(offer.amountCents, offer.currency)}
                    </small>
                  </div>
                  {offer.canAccept ? (
                    <button
                      className="primary-action compact"
                      type="button"
                      onClick={() => void acceptOffer(offer)}
                      disabled={Boolean(busy) || !nftReady}
                    >
                      Accept
                    </button>
                  ) : null}
                </div>
              ))}
              {mine.offers.length === 0 ? <p>No buyer offers yet.</p> : null}
            </div>
          </article>
        </section>
      )}
      <StellarWalletModal
        isOpen={isWalletOpen}
        onClose={() => setIsWalletOpen(false)}
        onAddressResolved={handleAddressResolved}
      />
      {activePayment && (
        <StellarCheckoutModal
          isOpen={isCheckoutOpen}
          onClose={() => setIsCheckoutOpen(false)}
          payment={activePayment}
          verifyPath={activeVerifyPath}
          verifyBody={activeVerifyBody}
          onSuccess={() => {
            setStatus("Transaction verified and action completed.");
            void loadAll();
          }}
        />
      )}
    </div>
  );
}
