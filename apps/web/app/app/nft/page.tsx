"use client";

import {
  ArrowRight,
  BadgeCheck,
  Gem,
  Image as ImageIcon,
  ListPlus,
  RefreshCw,
  Sparkles,
  Tags,
  WalletCards,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { apiJson, money } from "../api";
import {
  completeStellarPayment,
  formatStellarAddress,
  readStellarAddressFromUser,
  type StellarPaymentIntent,
} from "../stellar-payments";

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
  "A polished collectible key art image for this character, iconic pose, strong silhouette, premium marketplace-ready finish.";

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

export default function NftStudioPage() {
  const [marketplace, setMarketplace] = useState<NftMarketplaceResponse>({
    enabled: false,
    listings: [],
  });
  const [mine, setMine] = useState<NftMineResponse>({ enabled: false, assets: [], offers: [] });
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
  const [offerDrafts, setOfferDrafts] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [status, setStatus] = useState("Loading NFT marketplace...");

  useEffect(() => {
    void loadAll();
  }, []);

  const selectedCharacter = useMemo(
    () => characters.find((character) => character.id === selectedCharacterId) ?? characters[0],
    [characters, selectedCharacterId],
  );
  const nftReady = marketplace.enabled || mine.enabled;

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
          : "NFT contract configuration is required before minting or trading can run.",
      );
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "NFT marketplace unavailable.");
    } finally {
      setBusy(null);
    }
  }

  async function generateNftArt() {
    if (!selectedCharacter) {
      setStatus("Create a character before generating NFT art.");
      return;
    }

    setBusy("generate");
    setStatus("Generating NFT art...");

    try {
      const media = await apiJson<MediaAssetResponse>("/api/v1/media/generate", {
        method: "POST",
        body: JSON.stringify({
          purpose: "nft_art",
          prompt,
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
        `A creator-minted collectible artwork for ${selectedCharacter.name} on Hana Chat.`,
      );
      setStatus("Art generated. Review it, add ownership details, then mint.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Could not generate NFT art.");
    } finally {
      setBusy(null);
    }
  }

  async function mintGeneratedArt() {
    if (!selectedCharacter || !generated) {
      setStatus("Generate NFT art before minting.");
      return;
    }

    setBusy("mint");
    setStatus("Minting NFT...");

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

      setStatus(`Minted ${payload.tokenId} in transaction ${formatHash(payload.txHash)}.`);
      setGenerated(null);
      await loadAll();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "NFT mint failed.");
    } finally {
      setBusy(null);
    }
  }

  async function listAsset(asset: OwnedNftAsset) {
    const dollars = Number.parseFloat(listingDrafts[asset.id] ?? "");

    if (!Number.isFinite(dollars) || dollars <= 0) {
      setStatus("Enter a valid list price.");
      return;
    }

    setBusy(`list:${asset.id}`);
    setStatus("Creating listing...");

    try {
      await apiJson(`/api/v1/nft/assets/${encodeURIComponent(asset.id)}/listings`, {
        method: "POST",
        body: JSON.stringify({ priceCents: Math.round(dollars * 100), currency: "USD" }),
      });
      setStatus("NFT listed.");
      await loadAll();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Could not list NFT.");
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

  async function buyListing(listing: NftListing) {
    setBusy(`buy:${listing.id}`);

    try {
      const buyerWalletAddress = readStellarAddressFromUser();
      const checkout = await apiJson<CreateNftPaymentResponse>(
        `/api/v1/nft/listings/${encodeURIComponent(listing.id)}/purchase`,
        {
          method: "POST",
          body: JSON.stringify({ buyerWalletAddress }),
        },
      );

      if (!checkout.saleId) {
        throw new Error("NFT sale did not start.");
      }

      await completeStellarPayment({
        payment: checkout.payment,
        verifyPath: "/api/v1/nft/purchases/verify",
        verifyBody: {
          saleId: checkout.saleId,
          paymentId: checkout.payment.id,
          buyerWalletAddress,
        },
        onStatus: setStatus,
      });
      setStatus("NFT transferred.");
      await loadAll();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "NFT purchase failed.");
    } finally {
      setBusy(null);
    }
  }

  async function makeOffer(listing: NftListing) {
    const dollars = Number.parseFloat(offerDrafts[listing.asset.id] ?? "");

    if (!Number.isFinite(dollars) || dollars <= 0) {
      setStatus("Enter a valid offer amount.");
      return;
    }

    setBusy(`offer:${listing.asset.id}`);

    try {
      const buyerWalletAddress = readStellarAddressFromUser();
      const offer = await apiJson<CreateNftPaymentResponse>(
        `/api/v1/nft/assets/${encodeURIComponent(listing.asset.id)}/offers`,
        {
          method: "POST",
          body: JSON.stringify({
            amountCents: Math.round(dollars * 100),
            currency: "USD",
            buyerWalletAddress,
          }),
        },
      );

      if (!offer.offerId) {
        throw new Error("NFT offer did not start.");
      }

      await completeStellarPayment({
        payment: offer.payment,
        verifyPath: "/api/v1/nft/offers/verify",
        verifyBody: {
          offerId: offer.offerId,
          paymentId: offer.payment.id,
          buyerWalletAddress,
        },
        onStatus: setStatus,
      });
      setStatus("Offer funded.");
      await loadAll();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Offer failed.");
    } finally {
      setBusy(null);
    }
  }

  async function acceptOffer(offer: NftOffer) {
    setBusy(`accept:${offer.id}`);
    setStatus("Accepting offer and transferring NFT...");

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
            <Gem size={15} /> NFT Studio
          </span>
          <h1>Mint and trade creator art</h1>
          <p>
            Generate character artwork, mint it to your wallet, list it, and settle sales with
            on-chain transfer proof.
          </p>
        </div>
        <div className="payment-hero-chips" aria-label="NFT status">
          <span>{marketplace.enabled || mine.enabled ? "Minting ready" : "Read-only"}</span>
          <span>{marketplace.listings.length.toLocaleString()} listings</span>
          <span>{mine.assets.length.toLocaleString()} owned</span>
        </div>
      </section>

      <div className="nft-tabbar" role="tablist" aria-label="NFT sections">
        <button
          className={activeTab === "market" ? "active" : ""}
          onClick={() => setActiveTab("market")}
          type="button"
        >
          <Tags size={16} /> Marketplace
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
          {marketplace.listings.map((listing) => (
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
                    <dt>Royalty</dt>
                    <dd>{listing.asset.royaltyBps / 100}%</dd>
                  </div>
                  <div>
                    <dt>Owner</dt>
                    <dd>{formatStellarAddress(listing.asset.ownerAddress)}</dd>
                  </div>
                </dl>
                <div className="nft-actions">
                  <button
                    className="primary-action compact"
                    type="button"
                    onClick={() => void buyListing(listing)}
                    disabled={Boolean(busy) || !nftReady}
                  >
                    Buy <WalletCards size={16} />
                  </button>
                  <label>
                    Offer
                    <input
                      inputMode="decimal"
                      placeholder="25.00"
                      value={offerDrafts[listing.asset.id] ?? ""}
                      onChange={(event) =>
                        setOfferDrafts((current) => ({
                          ...current,
                          [listing.asset.id]: event.target.value,
                        }))
                      }
                    />
                  </label>
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
          ))}
          {marketplace.listings.length === 0 ? (
            <article className="settings-card empty-state">
              <Gem size={24} />
              <h2>No active NFT listings</h2>
              <p>
                Mint creator art from the Studio tab and list it when the contract is configured.
              </p>
            </article>
          ) : null}
        </section>
      ) : (
        <section className="nft-studio-grid">
          <article className="settings-card nft-mint-card">
            <div className="settings-card-title">
              <ImageIcon />
              <div>
                <h2>Generate and mint</h2>
                <p>Create character art and mint it to a Stellar wallet.</p>
              </div>
            </div>
            <label>
              Character
              <select
                value={selectedCharacter?.id ?? ""}
                onChange={(event) => setSelectedCharacterId(event.target.value)}
              >
                {characters.map((character) => (
                  <option key={character.id} value={character.id}>
                    {character.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Art direction
              <textarea value={prompt} onChange={(event) => setPrompt(event.target.value)} />
            </label>
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
                <img src={generated.url} alt="" />
                <label>
                  Title
                  <input value={mintTitle} onChange={(event) => setMintTitle(event.target.value)} />
                </label>
                <label>
                  Description
                  <textarea
                    value={mintDescription}
                    onChange={(event) => setMintDescription(event.target.value)}
                  />
                </label>
                <label>
                  Owner wallet
                  <input
                    value={mintWallet}
                    onChange={(event) => setMintWallet(event.target.value.trim())}
                    placeholder="G..."
                  />
                </label>
                <label>
                  Royalty %
                  <input
                    inputMode="decimal"
                    min={0}
                    max={10}
                    step={0.25}
                    type="number"
                    value={royaltyBps / 100}
                    onChange={(event) =>
                      setRoyaltyBps(Math.round(Number(event.target.value || 0) * 100))
                    }
                  />
                </label>
                <button
                  className="primary-action compact"
                  type="button"
                  onClick={() => void mintGeneratedArt()}
                  disabled={Boolean(busy) || !nftReady}
                >
                  Mint NFT <Gem size={16} />
                </button>
              </div>
            ) : null}
          </article>

          <article className="settings-card nft-owned-panel">
            <div className="settings-card-title">
              <ListPlus />
              <div>
                <h2>Your NFTs</h2>
                <p>List minted art or review funded offers.</p>
              </div>
            </div>
            <div className="nft-owned-list">
              {mine.assets.map((asset) => (
                <div className="nft-owned-row" key={asset.id}>
                  <img src={asset.imageUrl} alt="" />
                  <div>
                    <strong>{asset.title}</strong>
                    <small>
                      {asset.status} -{" "}
                      {asset.mintTxHash ? `tx ${formatHash(asset.mintTxHash)}` : "no tx"}
                    </small>
                    {asset.listing ? (
                      <div className="nft-inline-listing">
                        <span>
                          {asset.listing.status === "reserved"
                            ? "Reserved"
                            : money(asset.listing.priceCents, asset.listing.currency)}
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
                      <div className="nft-inline-listing">
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
              ))}
              {mine.assets.length === 0 ? <p>No minted creator art yet.</p> : null}
            </div>
            <div className="nft-offer-list">
              <h3>Offers</h3>
              {mine.offers.map((offer) => (
                <div className="nft-offer-row" key={offer.id}>
                  <img src={offer.imageUrl} alt="" />
                  <div>
                    <strong>{offer.title}</strong>
                    <small>
                      {offer.status} - {money(offer.amountCents, offer.currency)}
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
              {mine.offers.length === 0 ? <p>No offers yet.</p> : null}
            </div>
          </article>
        </section>
      )}
    </div>
  );
}
