import { loadConfig, type AppConfig } from "@hana/config";
import {
  AcceptNftOfferRequestSchema,
  CreateNftAssetRequestSchema,
  CreateNftListingPurchaseRequestSchema,
  CreateNftListingRequestSchema,
  CreateNftOfferRequestSchema,
  VerifyNftListingPurchaseRequestSchema,
  VerifyNftOfferRequestSchema,
} from "@hana/contracts";
import { createDatabase, type HanaDatabase } from "@hana/database";
import { DomainError } from "@hana/errors";
import {
  buildHanaNftMetadata,
  deriveCreatorArtNftTokenId,
  mintHanaNft,
  normalizeStellarAddress,
  transferHanaNft,
} from "@hana/stellar-bridge";
import { Body, Controller, Get, Headers, Param, Post, Query } from "@nestjs/common";
import { Kysely, type Insertable } from "kysely";
import { randomUUID } from "node:crypto";
import { auditEvent, requireSession } from "./session";
import {
  createStellarPaymentIntent,
  toStellarPaymentIntent,
  verifyStellarPaymentIntent,
} from "./stellar-payments";

type Db = Kysely<HanaDatabase>;
type CreatorLedgerEntryInsert = Insertable<HanaDatabase["billing.creator_ledger_entries"]>;

@Controller("/v1/nft")
export class NftController {
  private readonly config = loadConfig();
  private readonly db = createDatabase(this.config);

  @Get("/marketplace")
  public async marketplace(@Query("limit") limit?: string) {
    const rows = await this.db
      .selectFrom("web3.nft_listings as listings")
      .innerJoin("web3.nft_assets as assets", "assets.id", "listings.nft_asset_id")
      .innerJoin("creator.characters as characters", "characters.id", "assets.character_id")
      .leftJoin("identity.users as creators", "creators.id", "assets.creator_user_id")
      .select([
        "listings.id as listing_id",
        "listings.price_cents",
        "listings.min_offer_cents",
        "listings.currency",
        "listings.asset_code",
        "listings.expires_at",
        "assets.id as asset_id",
        "assets.title",
        "assets.description",
        "assets.image_url",
        "assets.contract_id",
        "assets.token_id",
        "assets.network",
        "assets.royalty_bps",
        "assets.owner_address",
        "assets.creator_address",
        "assets.mint_tx_hash",
        "assets.minted_at",
        "characters.id as character_id",
        "characters.name as character_name",
        "characters.avatar_url as character_avatar_url",
        "creators.display_name as creator_display_name",
        "creators.avatar_url as creator_avatar_url",
      ])
      .where((eb) =>
        eb.or([
          eb("listings.status", "=", "active"),
          eb.and([
            eb("listings.status", "=", "reserved"),
            eb("listings.reserved_until", "is not", null),
            eb("listings.reserved_until", "<=", new Date()),
          ]),
        ]),
      )
      .where("assets.moderation_status", "=", "approved")
      .where("assets.status", "in", ["listed", "minted"])
      .where((eb) =>
        eb.or([eb("listings.expires_at", "is", null), eb("listings.expires_at", ">", new Date())]),
      )
      .orderBy("listings.created_at", "desc")
      .limit(clampLimit(limit, 48))
      .execute();

    return {
      enabled: this.nftConfigured(),
      platformFeeBps: this.config.CREATOR_PLATFORM_FEE_BPS,
      maxRoyaltyBps: 1_000,
      listings: rows.map((row) => ({
        id: row.listing_id,
        priceCents: row.price_cents,
        minOfferCents: row.min_offer_cents,
        currency: row.currency,
        assetCode: row.asset_code,
        expiresAt: row.expires_at?.toISOString() ?? null,
        asset: {
          id: row.asset_id,
          title: row.title,
          description: row.description,
          imageUrl: row.image_url,
          contractId: row.contract_id,
          tokenId: row.token_id,
          network: row.network,
          royaltyBps: row.royalty_bps,
          ownerAddress: row.owner_address,
          creatorAddress: row.creator_address,
          mintTxHash: row.mint_tx_hash,
          mintedAt: row.minted_at?.toISOString() ?? null,
          character: {
            id: row.character_id,
            name: row.character_name,
            avatarUrl: row.character_avatar_url,
          },
          creator: {
            displayName: row.creator_display_name ?? "Creator",
            avatarUrl: row.creator_avatar_url,
          },
        },
      })),
    };
  }

  @Get("/mine")
  public async mine(@Headers("authorization") authorization?: string) {
    const session = await requireSession(this.db, this.config, authorization);
    const [assets, offers] = await Promise.all([
      this.db
        .selectFrom("web3.nft_assets as assets")
        .leftJoin("web3.nft_listings as listings", (join) =>
          join
            .onRef("listings.nft_asset_id", "=", "assets.id")
            .on((eb) =>
              eb.or([eb("listings.status", "=", "active"), eb("listings.status", "=", "reserved")]),
            ),
        )
        .innerJoin("creator.characters as characters", "characters.id", "assets.character_id")
        .select([
          "assets.id",
          "assets.title",
          "assets.description",
          "assets.image_url",
          "assets.contract_id",
          "assets.token_id",
          "assets.network",
          "assets.status",
          "assets.moderation_status",
          "assets.creator_user_id",
          "assets.owner_user_id",
          "assets.owner_address",
          "assets.creator_address",
          "assets.royalty_bps",
          "assets.mint_tx_hash",
          "assets.failure_reason",
          "assets.created_at",
          "assets.minted_at",
          "assets.listed_at",
          "listings.id as listing_id",
          "listings.price_cents",
          "listings.min_offer_cents",
          "listings.currency",
          "listings.status as listing_status",
          "listings.reserved_until as listing_reserved_until",
          "characters.id as character_id",
          "characters.name as character_name",
        ])
        .where((eb) =>
          eb.or([
            eb("assets.creator_user_id", "=", session.userId),
            eb("assets.owner_user_id", "=", session.userId),
          ]),
        )
        .orderBy("assets.created_at", "desc")
        .limit(100)
        .execute(),
      this.db
        .selectFrom("web3.nft_offers as offers")
        .innerJoin("web3.nft_assets as assets", "assets.id", "offers.nft_asset_id")
        .select([
          "offers.id",
          "offers.nft_asset_id",
          "offers.amount_cents",
          "offers.currency",
          "offers.status",
          "offers.tx_hash",
          "offers.expires_at",
          "offers.created_at",
          "assets.title",
          "assets.image_url",
          "assets.owner_user_id",
        ])
        .where((eb) =>
          eb.or([
            eb("offers.buyer_user_id", "=", session.userId),
            eb("assets.owner_user_id", "=", session.userId),
          ]),
        )
        .orderBy("offers.created_at", "desc")
        .limit(50)
        .execute(),
    ]);

    return {
      enabled: this.nftConfigured(),
      platformFeeBps: this.config.CREATOR_PLATFORM_FEE_BPS,
      maxRoyaltyBps: 1_000,
      assets: assets.map((asset) => ({
        id: asset.id,
        title: asset.title,
        description: asset.description,
        imageUrl: asset.image_url,
        contractId: asset.contract_id,
        tokenId: asset.token_id,
        network: asset.network,
        status: asset.status,
        moderationStatus: asset.moderation_status,
        creatorUserId: asset.creator_user_id,
        ownerUserId: asset.owner_user_id,
        ownerAddress: asset.owner_address,
        creatorAddress: asset.creator_address,
        royaltyBps: asset.royalty_bps,
        mintTxHash: asset.mint_tx_hash,
        failureReason: asset.failure_reason,
        createdAt: asset.created_at.toISOString(),
        mintedAt: asset.minted_at?.toISOString() ?? null,
        listedAt: asset.listed_at?.toISOString() ?? null,
        listing: asset.listing_id
          ? {
              id: asset.listing_id,
              priceCents: asset.price_cents,
              minOfferCents: asset.min_offer_cents,
              currency: asset.currency,
              status: asset.listing_status,
              reservedUntil: asset.listing_reserved_until?.toISOString() ?? null,
            }
          : null,
        character: {
          id: asset.character_id,
          name: asset.character_name,
        },
      })),
      offers: offers.map((offer) => ({
        id: offer.id,
        assetId: offer.nft_asset_id,
        title: offer.title,
        imageUrl: offer.image_url,
        amountCents: offer.amount_cents,
        currency: offer.currency,
        status: offer.status,
        txHash: offer.tx_hash,
        expiresAt: offer.expires_at?.toISOString() ?? null,
        createdAt: offer.created_at.toISOString(),
        canAccept: offer.owner_user_id === session.userId && offer.status === "funded",
      })),
    };
  }

  @Get("/assets/:assetId/metadata")
  public async metadata(@Param("assetId") assetId: string) {
    const asset = await this.db
      .selectFrom("web3.nft_assets")
      .select(["metadata_json"])
      .where("id", "=", assetId)
      .executeTakeFirst();

    if (!asset) {
      throw new DomainError("RESOURCE_NOT_FOUND", "NFT asset not found");
    }

    return asset.metadata_json;
  }

  @Post("/assets")
  public async createAsset(
    @Body() body: unknown,
    @Headers("authorization") authorization?: string,
  ) {
    const session = await requireSession(this.db, this.config, authorization);
    const input = CreateNftAssetRequestSchema.parse(body);

    assertNftReady(this.config);

    const ownerAddress = normalizeStellarAddress(input.ownerWalletAddress, "ownerWalletAddress");
    const contractId = this.config.STELLAR_NFT_CONTRACT_ID!;
    const [character, media] = await Promise.all([
      this.db
        .selectFrom("creator.characters")
        .select(["id", "creator_user_id", "name", "visibility", "moderation_status"])
        .where("id", "=", input.characterId)
        .executeTakeFirst(),
      this.db
        .selectFrom("creator.media_assets")
        .select(["id", "owner_user_id", "purpose", "public_url", "sha256_hex", "metadata_json"])
        .where("id", "=", input.mediaAssetId)
        .executeTakeFirst(),
    ]);

    if (!character) {
      throw new DomainError("RESOURCE_NOT_FOUND", "Character not found");
    }

    if (!media || media.owner_user_id !== session.userId) {
      throw new DomainError("RESOURCE_NOT_FOUND", "Creator image not found");
    }

    if (!["character_avatar", "character_cover", "nft_art"].includes(media.purpose)) {
      throw new DomainError("VALIDATION_FAILED", "Only creator-owned character art can be minted");
    }

    const mediaMetadata = asRecord(media.metadata_json);
    const mediaCharacterId = optionalString(mediaMetadata["characterId"]);
    const isLockedChatImage = mediaMetadata["lockedChatImage"] === true;

    if (isLockedChatImage) {
      throw new DomainError("VALIDATION_FAILED", "Locked chat images must use the unlock flow");
    }

    if (character.creator_user_id !== session.userId) {
      throw new DomainError("RESOURCE_NOT_FOUND", "Creator character not found");
    }

    if (media.purpose === "nft_art" && mediaCharacterId !== character.id) {
      throw new DomainError("VALIDATION_FAILED", "Creator art is not attached to this character");
    }

    const assetId = randomUUID();
    const tokenId = deriveCreatorArtNftTokenId({
      mediaSha256Hex: media.sha256_hex,
      characterId: character.id,
      creatorUserId: session.userId,
    });
    const existingAsset = await this.db
      .selectFrom("web3.nft_assets")
      .select(["id", "creator_user_id", "token_id", "status", "mint_tx_hash"])
      .where("media_asset_id", "=", media.id)
      .executeTakeFirst();

    if (existingAsset && existingAsset.creator_user_id !== session.userId) {
      throw new DomainError("CONFLICT", "Creator image is already attached to another NFT");
    }

    if (
      existingAsset &&
      ["minted", "listed", "delisted"].includes(existingAsset.status) &&
      existingAsset.mint_tx_hash
    ) {
      return {
        ok: true,
        assetId: existingAsset.id,
        tokenId: existingAsset.token_id,
        txHash: existingAsset.mint_tx_hash,
      };
    }

    if (existingAsset?.status === "minting") {
      throw new DomainError("CONFLICT", "NFT mint is already in progress");
    }

    if (existingAsset && existingAsset.status !== "failed") {
      throw new DomainError("CONFLICT", "Creator image is already attached to an NFT");
    }

    const nftAssetId = existingAsset?.status === "failed" ? existingAsset.id : assetId;
    const imageUrl = absoluteProductUrl(this.config, media.public_url);
    const metadataUri = absoluteProductUrl(
      this.config,
      `/api/v1/nft/assets/${nftAssetId}/metadata`,
    );
    const { metadata, metadataHash } = buildHanaNftMetadata({
      id: nftAssetId,
      title: input.title,
      description: input.description,
      imageUrl,
      mediaSha256Hex: media.sha256_hex,
      creatorUserId: session.userId,
      characterId: character.id,
      characterName: character.name,
      network: this.config.STELLAR_NETWORK,
      contractId,
      tokenId,
      royaltyBps: input.royaltyBps,
    });
    const now = new Date();

    if (existingAsset?.status === "failed") {
      await this.db
        .updateTable("web3.nft_assets")
        .set({
          owner_user_id: session.userId,
          character_id: character.id,
          contract_id: contractId,
          token_id: tokenId,
          network: this.config.STELLAR_NETWORK,
          title: input.title,
          description: input.description,
          image_url: imageUrl,
          metadata_uri: metadataUri,
          metadata_hash: metadataHash,
          royalty_bps: input.royaltyBps,
          creator_address: ownerAddress,
          owner_address: ownerAddress,
          mint_tx_hash: null,
          status: "minting",
          moderation_status: "approved",
          failure_reason: null,
          metadata_json: metadata,
          updated_at: now,
        })
        .where("id", "=", nftAssetId)
        .execute();
    } else {
      await this.db
        .insertInto("web3.nft_assets")
        .values({
          id: nftAssetId,
          creator_user_id: session.userId,
          owner_user_id: session.userId,
          character_id: character.id,
          media_asset_id: media.id,
          contract_id: contractId,
          token_id: tokenId,
          network: this.config.STELLAR_NETWORK,
          title: input.title,
          description: input.description,
          image_url: imageUrl,
          metadata_uri: metadataUri,
          metadata_hash: metadataHash,
          royalty_bps: input.royaltyBps,
          creator_address: ownerAddress,
          owner_address: ownerAddress,
          mint_tx_hash: null,
          status: "minting",
          moderation_status: "approved",
          failure_reason: null,
          metadata_json: metadata,
          updated_at: now,
        })
        .execute();
    }

    try {
      const mint = await mintHanaNft({
        rpcUrl: this.config.STELLAR_RPC_URL,
        network: this.config.STELLAR_NETWORK,
        contractId,
        serverSecret: resolveServerSecret(this.config),
        ownerAddress,
        creatorAddress: ownerAddress,
        tokenId,
        metadataUri,
        royaltyBps: input.royaltyBps,
      });

      await this.db.transaction().execute(async (tx) => {
        await tx
          .updateTable("web3.nft_assets")
          .set({
            status: "minted",
            mint_tx_hash: mint.txHash,
            minted_at: new Date(),
            updated_at: new Date(),
          })
          .where("id", "=", nftAssetId)
          .execute();
        await tx
          .insertInto("web3.nft_ownership_events")
          .values({
            nft_asset_id: nftAssetId,
            from_user_id: null,
            to_user_id: session.userId,
            from_address: null,
            to_address: ownerAddress,
            tx_hash: mint.txHash,
            event_type: "mint",
            metadata_json: { tokenId },
          })
          .execute();
      });

      await auditEvent(this.db, {
        actorUserId: session.userId,
        action: "nft.asset.mint",
        resourceType: "web3.nft_asset",
        resourceId: nftAssetId,
        metadata: { tokenId, txHash: mint.txHash },
      });

      return { ok: true, assetId: nftAssetId, tokenId, txHash: mint.txHash };
    } catch (error) {
      await this.db
        .updateTable("web3.nft_assets")
        .set({
          status: "failed",
          failure_reason: error instanceof Error ? error.message : "NFT mint failed",
          updated_at: new Date(),
        })
        .where("id", "=", nftAssetId)
        .execute();
      throw error;
    }
  }

  /**
   * POST /v1/nft/chat-image/unlock
   * Creates a checkout for a locked chat image and mints ownership after payment clears.
   * Creator/platform split follows the configured creator fee policy.
   *
   * First call (no paymentId/txHash) → creates a Stellar payment intent and returns it.
   * Second call (with paymentId + txHash) → verifies payment, records unlock, mints NFT.
   */
  @Get("/chat-image/unlocks")
  public async chatImageUnlocks(
    @Query("mediaIds") mediaIds: string | undefined,
    @Headers("authorization") authorization?: string,
  ) {
    const session = await requireSession(this.db, this.config, authorization);
    const ids = (mediaIds ?? "")
      .split(",")
      .map((id) => id.trim())
      .filter((id) => /^[0-9a-fA-F-]{36}$/.test(id))
      .slice(0, 100);

    if (ids.length === 0) {
      return { mediaIds: [] };
    }

    const rows = await this.db
      .selectFrom("chat.image_unlocks")
      .select(["media_asset_id"])
      .where("buyer_user_id", "=", session.userId)
      .where("media_asset_id", "in", ids)
      .where("status", "in", ["paid", "minted", "failed"])
      .execute();

    return { mediaIds: rows.map((row) => row.media_asset_id) };
  }

  @Post("/chat-image/unlock")
  public async unlockChatImage(
    @Body() body: unknown,
    @Headers("authorization") authorization?: string,
  ) {
    const session = await requireSession(this.db, this.config, authorization);
    assertNftReady(this.config);

    // Validate body shape manually (no shared schema needed for this endpoint)
    const input = (() => {
      const b = body as Record<string, unknown>;
      if (
        !b ||
        typeof b["mediaAssetId"] !== "string" ||
        typeof b["ownerWalletAddress"] !== "string"
      ) {
        throw new DomainError(
          "VALIDATION_FAILED",
          "mediaAssetId and ownerWalletAddress are required",
        );
      }
      return {
        mediaAssetId: b["mediaAssetId"],
        ownerWalletAddress: b["ownerWalletAddress"],
        characterId: typeof b["characterId"] === "string" ? b["characterId"] : undefined,
        paymentId: typeof b["paymentId"] === "string" ? b["paymentId"] : undefined,
        txHash: typeof b["txHash"] === "string" ? b["txHash"] : undefined,
        title: typeof b["title"] === "string" ? b["title"] : undefined,
        description: typeof b["description"] === "string" ? b["description"] : undefined,
        royaltyBps: typeof b["royaltyBps"] === "number" ? b["royaltyBps"] : 500,
      };
    })();

    const ownerAddress = normalizeStellarAddress(input.ownerWalletAddress, "ownerWalletAddress");

    // Look up the media asset (must be nft_art owned by any user — it's a chat image)
    const media = await this.db
      .selectFrom("creator.media_assets")
      .select(["id", "owner_user_id", "purpose", "public_url", "sha256_hex", "metadata_json"])
      .where("id", "=", input.mediaAssetId)
      .executeTakeFirst();

    if (!media || media.purpose !== "nft_art") {
      throw new DomainError("RESOURCE_NOT_FOUND", "Chat image not found");
    }

    const mediaMetadata = asRecord(media.metadata_json);
    const characterId = optionalString(mediaMetadata["characterId"]);

    if (mediaMetadata["lockedChatImage"] !== true || !characterId) {
      throw new DomainError("RESOURCE_NOT_FOUND", "Locked chat image not found");
    }

    const character = await this.db
      .selectFrom("creator.characters")
      .select(["id", "creator_user_id", "name", "visibility"])
      .where("id", "=", characterId)
      .executeTakeFirst();

    if (!character) {
      throw new DomainError("RESOURCE_NOT_FOUND", "Character not found");
    }

    // Check if already unlocked by this user
    const existingUnlock = await this.db
      .selectFrom("chat.image_unlocks")
      .selectAll()
      .where("media_asset_id", "=", media.id)
      .where("buyer_user_id", "=", session.userId)
      .executeTakeFirst();

    if (
      existingUnlock &&
      existingUnlock.status === "minted" &&
      existingUnlock.nft_asset_id
    ) {
      return {
        ok: true,
        alreadyUnlocked: true,
        nftAssetId: existingUnlock.nft_asset_id,
        imageUrl: media.public_url,
        mintPending: existingUnlock.status !== "minted",
      };
    }
    const paidUnlockForRetry =
      existingUnlock &&
      ["paid", "failed"].includes(existingUnlock.status) &&
      existingUnlock.nft_asset_id
        ? existingUnlock
        : null;

    const creatorPayout = await this.db
      .selectFrom("billing.creator_payout_profiles as profiles")
      .innerJoin("billing.crypto_payout_accounts as crypto", (join) =>
        join
          .onRef("crypto.creator_user_id", "=", "profiles.creator_user_id")
          .on("crypto.chain_id", "=", stellarNetworkChainId(this.config)),
      )
      .select(["crypto.wallet_address"])
      .where("profiles.creator_user_id", "=", character.creator_user_id)
      .where("profiles.status", "=", "verified")
      .where("crypto.status", "=", "verified")
      .executeTakeFirst();

    if (!creatorPayout?.wallet_address) {
      throw new DomainError("ENTITLEMENT_REQUIRED", "This collection is not ready for checkout");
    }

    const creatorAddress = normalizeStellarAddress(
      creatorPayout.wallet_address,
      "creatorWalletAddress",
    );

    const pricing = chatImageUnlockPricing({
      amountCents: this.config.CHAT_IMAGE_UNLOCK_AMOUNT_CENTS,
      tokenUsdCents: this.config.STELLAR_PAYMENT_TOKEN_USD_CENTS,
      platformFeeBps: this.config.CREATOR_PLATFORM_FEE_BPS,
    });
    const purpose = `chat_image_unlock:${media.id}`;

    // Phase 1: create or reuse the payment intent.
    if (!paidUnlockForRetry && (!input.paymentId || !input.txHash)) {
      // Reuse existing pending/created payment if available
      const existingPayment = await this.db
        .selectFrom("billing.crypto_payments")
        .selectAll()
        .where("purpose", "=", purpose)
        .where("buyer_user_id", "=", session.userId)
        .where("status", "in", ["created", "pending", "finalizing"])
        .orderBy("created_at", "desc")
        .executeTakeFirst();

      if (existingPayment) {
        const paymentIntent = toStellarPaymentIntent(existingPayment, this.config);
        return { provider: "stellar", payment: paymentIntent };
      }

      const payment = await createStellarPaymentIntent({
        db: this.db,
        config: this.config,
        buyerUserId: session.userId,
        purpose,
        amountCents: pricing.amountCents,
        currency: "USD",
        metadata: {
          type: "chat_image_unlock",
          mediaAssetId: media.id,
          characterId: character.id,
          tokenAmount: pricing.tokenAmountDisplay,
          platformFeeBps: this.config.CREATOR_PLATFORM_FEE_BPS,
        },
      });

      return { provider: "stellar", payment };
    }

    // Phase 2: verify payment.
    if (!paidUnlockForRetry) {
      if (!input.paymentId || !input.txHash) {
        throw new DomainError("VALIDATION_FAILED", "paymentId and txHash are required");
      }

      const verification = await verifyStellarPaymentIntent({
        db: this.db,
        config: this.config,
        buyerUserId: session.userId,
        paymentId: input.paymentId,
        txHash: input.txHash,
        walletAddress: input.ownerWalletAddress,
        expectedPurposePrefix: "chat_image_unlock:",
      });

      if (verification.status === "pending") {
        return { ok: false, status: "pending" };
      }
    }

    // Phase 3: record unlock and mint the collectible.
    const contractId = this.config.STELLAR_NFT_CONTRACT_ID!;
    const existingAsset = await this.db
      .selectFrom("web3.nft_assets")
      .select(["id", "owner_user_id", "status", "token_id", "mint_tx_hash"])
      .where("media_asset_id", "=", media.id)
      .executeTakeFirst();

    if (
      paidUnlockForRetry &&
      existingAsset?.status === "minted" &&
      existingAsset.mint_tx_hash
    ) {
      await this.db
        .updateTable("chat.image_unlocks")
        .set({ status: "minted", updated_at: new Date() })
        .where("id", "=", paidUnlockForRetry.id)
        .execute();

      return {
        ok: true,
        alreadyUnlocked: true,
        nftAssetId: existingAsset.id,
        tokenId: existingAsset.token_id,
        txHash: existingAsset.mint_tx_hash,
        imageUrl: media.public_url,
      };
    }

    if (existingAsset && existingAsset.owner_user_id !== session.userId) {
      throw new DomainError("CONFLICT", "Chat image is already attached to another wallet");
    }

    const unlockPaymentId = paidUnlockForRetry?.payment_id ?? input.paymentId!;
    const nftAssetId = existingUnlock?.nft_asset_id ?? existingAsset?.id ?? randomUUID();
    const tokenId = deriveCreatorArtNftTokenId({
      mediaSha256Hex: media.sha256_hex,
      characterId: character.id,
      creatorUserId: character.creator_user_id,
    });
    const imageUrl = absoluteProductUrl(this.config, media.public_url);
    const metadataUri = absoluteProductUrl(this.config, `/api/v1/nft/assets/${nftAssetId}/metadata`);
    const title = input.title?.trim() || `${character.name} Vision`;
    const description = input.description?.trim() || `Unlocked AI artwork from chat with ${character.name}`;
    const { metadata, metadataHash } = buildHanaNftMetadata({
      id: nftAssetId,
      title,
      description,
      imageUrl,
      mediaSha256Hex: media.sha256_hex,
      creatorUserId: character.creator_user_id,
      characterId: character.id,
      characterName: character.name,
      network: this.config.STELLAR_NETWORK,
      contractId,
      tokenId,
      royaltyBps: input.royaltyBps,
    });

    const now = new Date();

    // Insert NFT asset and unlock record in a transaction
    await this.db.transaction().execute(async (tx) => {
      // Upsert creator wallet for the character creator
      await tx
        .insertInto("billing.creator_wallets")
        .values({
          creator_user_id: character.creator_user_id,
          currency: "USD",
          pending_cents: 0,
          available_cents: 0,
          lifetime_earned_cents: 0,
          lifetime_fee_cents: 0,
          updated_at: now,
        })
        .onConflict((oc) => oc.column("creator_user_id").doNothing())
        .execute();

      // Record creator's ledger entry
      const creatorLedger = await tx
        .insertInto("billing.creator_ledger_entries")
        .values({
          creator_user_id: character.creator_user_id,
          character_id: character.id,
          source_user_id: session.userId,
          entry_type: "sale_gross",
          amount_cents: pricing.creatorShareCents,
          currency: "USD",
          status: "pending",
          available_at: new Date(
            now.getTime() + this.config.CREATOR_EARNING_HOLD_DAYS * 24 * 60 * 60 * 1_000,
          ),
          reference_type: "chat.image_unlock",
          reference_id: media.id,
          idempotency_key: `chat-img-unlock:${unlockPaymentId}:creator`,
          metadata_json: {
            type: "chat_image_unlock",
            mediaAssetId: media.id,
            platformFeeBps: this.config.CREATOR_PLATFORM_FEE_BPS,
          },
        })
        .onConflict((oc) => oc.column("idempotency_key").doNothing())
        .returning(["id"])
        .executeTakeFirst();

      // Update creator wallet pending balance
      if (creatorLedger) {
        await tx
          .updateTable("billing.creator_wallets")
          .set((eb) => ({
            pending_cents: eb("pending_cents", "+", pricing.creatorShareCents),
            lifetime_earned_cents: eb("lifetime_earned_cents", "+", pricing.creatorShareCents),
            lifetime_fee_cents: eb("lifetime_fee_cents", "+", pricing.platformShareCents),
            updated_at: now,
          }))
          .where("creator_user_id", "=", character.creator_user_id)
          .execute();
      }

      if (existingAsset) {
        await tx
          .updateTable("web3.nft_assets")
          .set({
            creator_user_id: character.creator_user_id,
            owner_user_id: session.userId,
            character_id: character.id,
            contract_id: contractId,
            token_id: tokenId,
            network: this.config.STELLAR_NETWORK,
            title,
            description,
            image_url: imageUrl,
            metadata_uri: metadataUri,
            metadata_hash: metadataHash,
            royalty_bps: input.royaltyBps,
            creator_address: creatorAddress,
            owner_address: ownerAddress,
            mint_tx_hash: null,
            status: "minting",
            moderation_status: "approved",
            failure_reason: null,
            metadata_json: metadata,
            updated_at: now,
          })
          .where("id", "=", existingAsset.id)
          .execute();
      } else {
        await tx
          .insertInto("web3.nft_assets")
          .values({
            id: nftAssetId,
            creator_user_id: character.creator_user_id,
            owner_user_id: session.userId,
            character_id: character.id,
            media_asset_id: media.id,
            contract_id: contractId,
            token_id: tokenId,
            network: this.config.STELLAR_NETWORK,
            title,
            description,
            image_url: imageUrl,
            metadata_uri: metadataUri,
            metadata_hash: metadataHash,
            royalty_bps: input.royaltyBps,
            creator_address: creatorAddress,
            owner_address: ownerAddress,
            mint_tx_hash: null,
            status: "minting",
            moderation_status: "approved",
            failure_reason: null,
            metadata_json: metadata,
            updated_at: now,
          })
          .execute();
      }

      // Record unlock
      await tx
        .insertInto("chat.image_unlocks")
        .values({
          media_asset_id: media.id,
          buyer_user_id: session.userId,
          character_id: character.id,
          payment_id: unlockPaymentId,
          nft_asset_id: nftAssetId,
          status: "paid",
          amount_xlm: pricing.tokenAmountDisplay,
          creator_share_xlm: pricing.creatorShareTokenDisplay,
          platform_share_xlm: pricing.platformShareTokenDisplay,
          updated_at: now,
        })
        .onConflict((oc) =>
          oc.columns(["buyer_user_id", "media_asset_id"]).doUpdateSet({
            status: "paid",
            nft_asset_id: nftAssetId,
            payment_id: unlockPaymentId,
            amount_xlm: pricing.tokenAmountDisplay,
            creator_share_xlm: pricing.creatorShareTokenDisplay,
            platform_share_xlm: pricing.platformShareTokenDisplay,
            updated_at: now,
          }),
        )
        .execute();
    });

    // Mint outside the database transaction. A failed mint leaves the paid image viewable and retryable.
    try {
      const mint = await mintHanaNft({
        rpcUrl: this.config.STELLAR_RPC_URL,
        network: this.config.STELLAR_NETWORK,
        contractId,
        serverSecret: resolveServerSecret(this.config),
        ownerAddress,
        creatorAddress,
        tokenId,
        metadataUri,
        royaltyBps: input.royaltyBps,
      });

      await this.db.transaction().execute(async (tx) => {
        await tx
          .updateTable("web3.nft_assets")
          .set({ status: "minted", mint_tx_hash: mint.txHash, minted_at: new Date(), updated_at: new Date() })
          .where("id", "=", nftAssetId)
          .execute();
        await tx
          .insertInto("web3.nft_ownership_events")
          .values({
            nft_asset_id: nftAssetId,
            from_user_id: null,
            to_user_id: session.userId,
            from_address: null,
            to_address: ownerAddress,
            tx_hash: mint.txHash,
            event_type: "mint",
            metadata_json: { tokenId, source: "chat_image_unlock" },
          })
          .execute();
        await tx
          .updateTable("chat.image_unlocks")
          .set({ status: "minted", updated_at: new Date() })
          .where("media_asset_id", "=", media.id)
          .where("buyer_user_id", "=", session.userId)
          .execute();
      });

      await auditEvent(this.db, {
        actorUserId: session.userId,
        action: "nft.chat_image.unlocked",
        resourceType: "web3.nft_asset",
        resourceId: nftAssetId,
        metadata: { tokenId, txHash: mint.txHash, mediaAssetId: media.id },
      });

      return {
        ok: true,
        nftAssetId,
        tokenId,
        txHash: mint.txHash,
        imageUrl: media.public_url,
      };
    } catch (error) {
      await this.db
        .updateTable("web3.nft_assets")
        .set({ status: "failed", failure_reason: error instanceof Error ? error.message : "Mint failed", updated_at: new Date() })
        .where("id", "=", nftAssetId)
        .execute();
      await this.db
        .updateTable("chat.image_unlocks")
        .set({ status: "paid", updated_at: new Date() })
        .where("media_asset_id", "=", media.id)
        .where("buyer_user_id", "=", session.userId)
        .execute();
      // Payment was finalized; return partial success so the frontend can show the image.
      return {
        ok: true,
        nftAssetId,
        imageUrl: media.public_url,
        mintPending: true,
      };
    }
  }


  @Post("/assets/:assetId/listings")
  public async createListing(
    @Param("assetId") assetId: string,
    @Body() body: unknown,
    @Headers("authorization") authorization?: string,
  ) {

    const session = await requireSession(this.db, this.config, authorization);
    const input = CreateNftListingRequestSchema.parse(body);
    assertNftReady(this.config);
    const expiresAt = input.expiresAt ? requireFutureDate(input.expiresAt, "Listing") : null;
    const minOfferCents = input.minOfferCents ?? input.priceCents;

    const asset = await this.db
      .selectFrom("web3.nft_assets")
      .selectAll()
      .where("id", "=", assetId)
      .executeTakeFirst();

    if (!asset || asset.owner_user_id !== session.userId) {
      throw new DomainError("RESOURCE_NOT_FOUND", "Owned NFT asset not found");
    }

    if (!["minted", "delisted"].includes(asset.status)) {
      throw new DomainError("CONFLICT", "NFT is not ready to list");
    }

    if (asset.moderation_status !== "approved") {
      throw new DomainError("CONFLICT", "NFT needs review before listing");
    }

    const listing = await this.db.transaction().execute(async (tx) => {
      const created = await tx
        .insertInto("web3.nft_listings")
        .values({
          nft_asset_id: asset.id,
          seller_user_id: session.userId,
          seller_address: asset.owner_address,
          price_cents: input.priceCents,
          min_offer_cents: minOfferCents,
          currency: input.currency,
          asset_code: this.config.STELLAR_PAYMENT_ASSET_CODE,
          asset_issuer: this.config.STELLAR_PAYMENT_ASSET_ISSUER ?? null,
          status: "active",
          reserved_by_user_id: null,
          reserved_sale_id: null,
          reserved_until: null,
          expires_at: expiresAt,
          updated_at: new Date(),
        })
        .returning(["id"])
        .executeTakeFirstOrThrow();

      await tx
        .updateTable("web3.nft_assets")
        .set({ status: "listed", listed_at: new Date(), updated_at: new Date() })
        .where("id", "=", asset.id)
        .execute();

      return created;
    });

    await auditEvent(this.db, {
      actorUserId: session.userId,
      action: "nft.listing.create",
      resourceType: "web3.nft_listing",
      resourceId: listing.id,
      metadata: { assetId: asset.id, priceCents: input.priceCents, minOfferCents },
    });

    return { ok: true, listingId: listing.id };
  }

  @Post("/listings/:listingId/cancel")
  public async cancelListing(
    @Param("listingId") listingId: string,
    @Headers("authorization") authorization?: string,
  ) {
    const session = await requireSession(this.db, this.config, authorization);
    assertNftReady(this.config);

    const cancelled = await this.db.transaction().execute(async (tx) => {
      const listing = await tx
        .selectFrom("web3.nft_listings as listings")
        .innerJoin("web3.nft_assets as assets", "assets.id", "listings.nft_asset_id")
        .select([
          "listings.id",
          "listings.nft_asset_id",
          "listings.status",
          "listings.reserved_until",
          "assets.owner_user_id",
        ])
        .where("listings.id", "=", listingId)
        .forUpdate()
        .executeTakeFirst();

      if (!listing || listing.owner_user_id !== session.userId) {
        throw new DomainError("RESOURCE_NOT_FOUND", "Owned NFT listing not found");
      }

      const hasLiveReservation =
        listing.status === "reserved" &&
        listing.reserved_until &&
        listing.reserved_until.getTime() > Date.now();

      if (listing.status !== "active" && listing.status !== "reserved") {
        throw new DomainError("CONFLICT", "NFT listing is not active");
      }

      if (hasLiveReservation) {
        throw new DomainError("CONFLICT", "NFT listing has a live checkout reservation");
      }

      await tx
        .updateTable("web3.nft_listings")
        .set({
          status: "cancelled",
          reserved_by_user_id: null,
          reserved_sale_id: null,
          reserved_until: null,
          updated_at: new Date(),
        })
        .where("id", "=", listing.id)
        .execute();
      await tx
        .updateTable("web3.nft_assets")
        .set({ status: "minted", updated_at: new Date() })
        .where("id", "=", listing.nft_asset_id)
        .execute();

      return listing;
    });

    await auditEvent(this.db, {
      actorUserId: session.userId,
      action: "nft.listing.cancel",
      resourceType: "web3.nft_listing",
      resourceId: cancelled.id,
      metadata: { assetId: cancelled.nft_asset_id },
    });

    return { ok: true, listingId: cancelled.id };
  }

  @Post("/listings/:listingId/purchase")
  public async createListingPurchase(
    @Param("listingId") listingId: string,
    @Body() body: unknown,
    @Headers("authorization") authorization?: string,
  ) {
    const session = await requireSession(this.db, this.config, authorization);
    const input = CreateNftListingPurchaseRequestSchema.parse({ ...asRecord(body), listingId });
    assertNftReady(this.config);

    const buyerAddress = normalizeStellarAddress(input.buyerWalletAddress, "buyerWalletAddress");
    const reservation = await this.db.transaction().execute(async (tx) => {
      const listing = await tx
        .selectFrom("web3.nft_listings as listings")
        .innerJoin("web3.nft_assets as assets", "assets.id", "listings.nft_asset_id")
        .select([
          "listings.id",
          "listings.price_cents",
          "listings.currency",
          "listings.seller_user_id",
          "listings.seller_address",
          "listings.status as listing_status",
          "listings.expires_at",
          "listings.reserved_until",
          "assets.id as asset_id",
          "assets.title",
          "assets.creator_user_id",
          "assets.royalty_bps",
          "assets.owner_user_id",
        ])
        .where("listings.id", "=", input.listingId)
        .forUpdate()
        .executeTakeFirst();

      if (!listing) {
        throw new DomainError("RESOURCE_NOT_FOUND", "Active NFT listing not found");
      }

      if (listing.seller_user_id === session.userId) {
        throw new DomainError("CONFLICT", "You already own this NFT");
      }

      if (listing.owner_user_id !== listing.seller_user_id) {
        throw new DomainError("CONFLICT", "NFT listing is no longer available");
      }

      const now = new Date();
      if (listing.expires_at && listing.expires_at.getTime() <= now.getTime()) {
        await tx
          .updateTable("web3.nft_listings")
          .set({ status: "expired", updated_at: now })
          .where("id", "=", listing.id)
          .execute();
        throw new DomainError("RESOURCE_NOT_FOUND", "Active NFT listing not found");
      }

      const reservationExpired =
        listing.listing_status === "reserved" &&
        listing.reserved_until &&
        listing.reserved_until.getTime() <= now.getTime();

      if (listing.listing_status !== "active" && !reservationExpired) {
        throw new DomainError("CONFLICT", "NFT listing is already reserved");
      }

      if (reservationExpired) {
        await tx
          .updateTable("web3.nft_sales")
          .set({
            status: "failed",
            failure_reason: "Payment reservation expired",
            updated_at: now,
          })
          .where("listing_id", "=", listing.id)
          .where("status", "=", "pending_payment")
          .execute();
      }

      const fees = saleFees({
        amountCents: listing.price_cents,
        platformFeeBps: this.config.CREATOR_PLATFORM_FEE_BPS,
        royaltyBps: listing.royalty_bps,
        sellerUserId: listing.seller_user_id,
        creatorUserId: listing.creator_user_id,
      });
      const sale = await tx
        .insertInto("web3.nft_sales")
        .values({
          nft_asset_id: listing.asset_id,
          listing_id: listing.id,
          offer_id: null,
          seller_user_id: listing.seller_user_id,
          buyer_user_id: session.userId,
          seller_address: listing.seller_address,
          buyer_address: buyerAddress,
          amount_cents: listing.price_cents,
          currency: listing.currency,
          platform_fee_cents: fees.platformFeeCents,
          royalty_fee_cents: fees.royaltyFeeCents,
          seller_net_cents: fees.sellerNetCents,
          provider_payment_id: null,
          payment_tx_hash: null,
          transfer_tx_hash: null,
          status: "pending_payment",
          failure_reason: null,
          metadata_json: { title: listing.title },
          updated_at: now,
        })
        .returning(["id"])
        .executeTakeFirstOrThrow();
      const reservedUntil = new Date(now);
      reservedUntil.setUTCMinutes(
        reservedUntil.getUTCMinutes() + this.config.STELLAR_PAYMENT_INTENT_TTL_MINUTES,
      );

      await tx
        .updateTable("web3.nft_listings")
        .set({
          status: "reserved",
          reserved_by_user_id: session.userId,
          reserved_sale_id: sale.id,
          reserved_until: reservedUntil,
          updated_at: now,
        })
        .where("id", "=", listing.id)
        .execute();

      return { listing, sale };
    });
    const payment = await createStellarPaymentIntent({
      db: this.db,
      config: this.config,
      buyerUserId: session.userId,
      purpose: `nft_sale:${reservation.sale.id}`,
      amountCents: reservation.listing.price_cents,
      currency: reservation.listing.currency,
      metadata: {
        type: "nft_sale",
        saleId: reservation.sale.id,
        listingId: reservation.listing.id,
        assetId: reservation.listing.asset_id,
      },
    });

    await this.db
      .updateTable("web3.nft_sales")
      .set({ provider_payment_id: payment.id, updated_at: new Date() })
      .where("id", "=", reservation.sale.id)
      .execute();

    return { provider: "stellar", saleId: reservation.sale.id, payment };
  }

  @Post("/purchases/verify")
  public async verifyListingPurchase(
    @Body() body: unknown,
    @Headers("authorization") authorization?: string,
  ) {
    const session = await requireSession(this.db, this.config, authorization);
    const input = VerifyNftListingPurchaseRequestSchema.parse(body);
    assertNftReady(this.config);

    const verification = await verifyStellarPaymentIntent({
      db: this.db,
      config: this.config,
      buyerUserId: session.userId,
      paymentId: input.paymentId,
      txHash: input.txHash,
      walletAddress: input.buyerWalletAddress,
      expectedPurposePrefix: "nft_sale:",
    });
    if (verification.purpose !== `nft_sale:${input.saleId}`) {
      throw new DomainError("AUTH_FORBIDDEN", "Stellar payment intent does not match this sale");
    }
    const sale = await this.markListingSaleTransferring({
      saleId: input.saleId,
      buyerUserId: session.userId,
      paymentId: verification.paymentId,
      txHash: verification.txHash,
    });

    try {
      const transfer = await transferHanaNft({
        rpcUrl: this.config.STELLAR_RPC_URL,
        network: this.config.STELLAR_NETWORK,
        contractId: sale.contractId,
        serverSecret: resolveServerSecret(this.config),
        tokenId: sale.tokenId,
        fromAddress: sale.sellerAddress,
        toAddress: sale.buyerAddress,
        saleReference: `sale:${sale.saleId}`,
      });

      await finalizeNftSale(this.db, this.config, {
        ...sale,
        transferTxHash: transfer.txHash,
        eventType: "sale_transfer",
      });

      return { ok: true, status: "finalized", saleId: sale.saleId, txHash: transfer.txHash };
    } catch (error) {
      await this.failSale(sale.saleId, error);
      throw error;
    }
  }

  @Post("/assets/:assetId/offers")
  public async createOffer(
    @Param("assetId") assetId: string,
    @Body() body: unknown,
    @Headers("authorization") authorization?: string,
  ) {
    const session = await requireSession(this.db, this.config, authorization);
    const input = CreateNftOfferRequestSchema.parse(body);
    assertNftReady(this.config);
    const expiresAt = input.expiresAt ? requireFutureDate(input.expiresAt, "Offer") : null;

    const asset = await this.db
      .selectFrom("web3.nft_assets as assets")
      .leftJoin("web3.nft_listings as listings", (join) =>
        join
          .onRef("listings.nft_asset_id", "=", "assets.id")
          .on((eb) =>
            eb.or([eb("listings.status", "=", "active"), eb("listings.status", "=", "reserved")]),
          ),
      )
      .select([
        "assets.id",
        "assets.title",
        "assets.owner_user_id",
        "assets.status",
        "assets.moderation_status",
        "listings.min_offer_cents",
      ])
      .where("assets.id", "=", assetId)
      .executeTakeFirst();

    if (
      !asset ||
      !["minted", "listed"].includes(asset.status) ||
      asset.moderation_status !== "approved"
    ) {
      throw new DomainError("RESOURCE_NOT_FOUND", "NFT asset not found");
    }

    if (asset.owner_user_id === session.userId) {
      throw new DomainError("CONFLICT", "You already own this NFT");
    }

    if (asset.min_offer_cents !== null && input.amountCents < asset.min_offer_cents) {
      throw new DomainError(
        "VALIDATION_FAILED",
        `Offer must be at least ${asset.min_offer_cents} cents`,
      );
    }

    const offer = await this.db
      .insertInto("web3.nft_offers")
      .values({
        nft_asset_id: asset.id,
        buyer_user_id: session.userId,
        buyer_address: normalizeStellarAddress(input.buyerWalletAddress, "buyerWalletAddress"),
        amount_cents: input.amountCents,
        currency: input.currency,
        asset_code: this.config.STELLAR_PAYMENT_ASSET_CODE,
        asset_issuer: this.config.STELLAR_PAYMENT_ASSET_ISSUER ?? null,
        provider_payment_id: null,
        tx_hash: null,
        status: "created",
        expires_at: expiresAt,
        metadata_json: { title: asset.title },
        updated_at: new Date(),
      })
      .returning(["id"])
      .executeTakeFirstOrThrow();
    const payment = await createStellarPaymentIntent({
      db: this.db,
      config: this.config,
      buyerUserId: session.userId,
      purpose: `nft_offer:${offer.id}`,
      amountCents: input.amountCents,
      currency: input.currency,
      metadata: { type: "nft_offer", offerId: offer.id, assetId: asset.id },
    });

    await this.db
      .updateTable("web3.nft_offers")
      .set({ provider_payment_id: payment.id, updated_at: new Date() })
      .where("id", "=", offer.id)
      .execute();

    return { provider: "stellar", offerId: offer.id, payment };
  }

  @Post("/offers/verify")
  public async verifyOffer(
    @Body() body: unknown,
    @Headers("authorization") authorization?: string,
  ) {
    const session = await requireSession(this.db, this.config, authorization);
    const input = VerifyNftOfferRequestSchema.parse(body);
    assertNftReady(this.config);

    const verification = await verifyStellarPaymentIntent({
      db: this.db,
      config: this.config,
      buyerUserId: session.userId,
      paymentId: input.paymentId,
      txHash: input.txHash,
      walletAddress: input.buyerWalletAddress,
      expectedPurposePrefix: "nft_offer:",
    });
    if (verification.purpose !== `nft_offer:${input.offerId}`) {
      throw new DomainError("AUTH_FORBIDDEN", "Stellar payment intent does not match this offer");
    }

    const updatedOffer = await this.db
      .updateTable("web3.nft_offers")
      .set({
        status: "funded",
        tx_hash: verification.txHash,
        funded_at: new Date(),
        updated_at: new Date(),
      })
      .where("id", "=", input.offerId)
      .where("buyer_user_id", "=", session.userId)
      .where("provider_payment_id", "=", verification.paymentId)
      .returning(["id"])
      .executeTakeFirst();

    if (!updatedOffer) {
      throw new DomainError("RESOURCE_NOT_FOUND", "NFT offer not found");
    }

    return { ok: true, status: "finalized", offerId: input.offerId };
  }

  @Post("/offers/:offerId/accept")
  public async acceptOffer(
    @Param("offerId") offerId: string,
    @Body() body: unknown,
    @Headers("authorization") authorization?: string,
  ) {
    const session = await requireSession(this.db, this.config, authorization);
    const input = AcceptNftOfferRequestSchema.parse({ ...asRecord(body), offerId });
    assertNftReady(this.config);

    const sale = await this.createSaleFromOffer(input.offerId, session.userId);

    try {
      const transfer = await transferHanaNft({
        rpcUrl: this.config.STELLAR_RPC_URL,
        network: this.config.STELLAR_NETWORK,
        contractId: sale.contractId,
        serverSecret: resolveServerSecret(this.config),
        tokenId: sale.tokenId,
        fromAddress: sale.sellerAddress,
        toAddress: sale.buyerAddress,
        saleReference: `offer:${sale.offerId}`,
      });

      await finalizeNftSale(this.db, this.config, {
        ...sale,
        transferTxHash: transfer.txHash,
        eventType: "offer_transfer",
      });

      return { ok: true, status: "finalized", saleId: sale.saleId, txHash: transfer.txHash };
    } catch (error) {
      await this.failSale(sale.saleId, error);
      throw error;
    }
  }

  private nftConfigured(): boolean {
    return Boolean(
      this.config.STELLAR_ENABLED &&
      this.config.STELLAR_PAYMENTS_ENABLED &&
      this.config.STELLAR_NFT_ENABLED &&
      this.config.STELLAR_NFT_CONTRACT_ID &&
      this.config.STELLAR_SERVER_KEY_REF,
    );
  }

  private async markListingSaleTransferring(input: {
    saleId: string;
    buyerUserId: string;
    paymentId: string;
    txHash: string;
  }): Promise<NftSaleSettlement> {
    return this.db.transaction().execute(async (tx) => {
      const sale = await tx
        .selectFrom("web3.nft_sales as sales")
        .innerJoin("web3.nft_assets as assets", "assets.id", "sales.nft_asset_id")
        .innerJoin("web3.nft_listings as listings", "listings.id", "sales.listing_id")
        .select([
          "sales.id as sale_id",
          "sales.nft_asset_id",
          "sales.listing_id",
          "sales.offer_id",
          "sales.seller_user_id",
          "sales.buyer_user_id",
          "sales.seller_address",
          "sales.buyer_address",
          "sales.provider_payment_id",
          "sales.amount_cents",
          "sales.currency",
          "sales.platform_fee_cents",
          "sales.royalty_fee_cents",
          "sales.seller_net_cents",
          "sales.status as sale_status",
          "assets.creator_user_id",
          "assets.character_id",
          "assets.contract_id",
          "assets.token_id",
          "assets.owner_user_id",
          "assets.owner_address",
          "listings.status as listing_status",
          "listings.reserved_by_user_id",
          "listings.reserved_sale_id",
          "listings.reserved_until",
        ])
        .where("sales.id", "=", input.saleId)
        .where("sales.buyer_user_id", "=", input.buyerUserId)
        .forUpdate()
        .executeTakeFirst();

      if (!sale) {
        throw new DomainError("RESOURCE_NOT_FOUND", "NFT sale not found");
      }

      if (sale.sale_status === "transferred") {
        throw new DomainError("CONFLICT", "NFT sale is already transferred");
      }

      if (sale.provider_payment_id !== input.paymentId) {
        throw new DomainError("AUTH_FORBIDDEN", "Stellar payment intent does not match this sale");
      }

      if (
        sale.listing_status !== "reserved" ||
        sale.reserved_sale_id !== sale.sale_id ||
        sale.reserved_by_user_id !== input.buyerUserId ||
        !sale.reserved_until ||
        sale.reserved_until.getTime() <= Date.now() ||
        sale.owner_user_id !== sale.seller_user_id
      ) {
        throw new DomainError("CONFLICT", "NFT listing is no longer available");
      }

      await tx
        .updateTable("web3.nft_sales")
        .set({
          provider_payment_id: input.paymentId,
          payment_tx_hash: input.txHash,
          status: "transferring",
          paid_at: new Date(),
          updated_at: new Date(),
        })
        .where("id", "=", sale.sale_id)
        .execute();

      return saleSettlementFromRow(sale, input.txHash);
    });
  }

  private async createSaleFromOffer(
    offerId: string,
    sellerUserId: string,
  ): Promise<NftSaleSettlement> {
    return this.db.transaction().execute(async (tx) => {
      const offer = await tx
        .selectFrom("web3.nft_offers as offers")
        .innerJoin("web3.nft_assets as assets", "assets.id", "offers.nft_asset_id")
        .select([
          "offers.id as offer_id",
          "offers.nft_asset_id",
          "offers.buyer_user_id",
          "offers.buyer_address",
          "offers.amount_cents",
          "offers.currency",
          "offers.provider_payment_id",
          "offers.tx_hash",
          "offers.status as offer_status",
          "offers.expires_at",
          "assets.creator_user_id",
          "assets.owner_user_id",
          "assets.owner_address",
          "assets.character_id",
          "assets.contract_id",
          "assets.token_id",
          "assets.royalty_bps",
        ])
        .where("offers.id", "=", offerId)
        .forUpdate()
        .executeTakeFirst();

      if (!offer || offer.owner_user_id !== sellerUserId) {
        throw new DomainError("RESOURCE_NOT_FOUND", "Funded NFT offer not found");
      }

      if (offer.offer_status !== "funded" || !offer.provider_payment_id || !offer.tx_hash) {
        throw new DomainError("CONFLICT", "NFT offer is not funded");
      }

      if (offer.expires_at && offer.expires_at.getTime() <= Date.now()) {
        await tx
          .updateTable("web3.nft_offers")
          .set({ status: "expired", updated_at: new Date() })
          .where("id", "=", offer.offer_id)
          .execute();
        throw new DomainError("CONFLICT", "NFT offer has expired");
      }

      const fees = saleFees({
        amountCents: offer.amount_cents,
        platformFeeBps: this.config.CREATOR_PLATFORM_FEE_BPS,
        royaltyBps: offer.royalty_bps,
        sellerUserId,
        creatorUserId: offer.creator_user_id,
      });
      const existingSale = await tx
        .selectFrom("web3.nft_sales")
        .select(["id"])
        .where("offer_id", "=", offer.offer_id)
        .where("status", "in", ["failed", "paid", "transferring"])
        .orderBy("created_at", "desc")
        .forUpdate()
        .executeTakeFirst();
      const sale =
        existingSale ??
        (await tx
          .insertInto("web3.nft_sales")
          .values({
            nft_asset_id: offer.nft_asset_id,
            listing_id: null,
            offer_id: offer.offer_id,
            seller_user_id: sellerUserId,
            buyer_user_id: offer.buyer_user_id,
            seller_address: offer.owner_address,
            buyer_address: offer.buyer_address,
            amount_cents: offer.amount_cents,
            currency: offer.currency,
            platform_fee_cents: fees.platformFeeCents,
            royalty_fee_cents: fees.royaltyFeeCents,
            seller_net_cents: fees.sellerNetCents,
            provider_payment_id: offer.provider_payment_id,
            payment_tx_hash: offer.tx_hash,
            transfer_tx_hash: null,
            status: "transferring",
            failure_reason: null,
            metadata_json: { offerId: offer.offer_id },
            paid_at: new Date(),
            updated_at: new Date(),
          })
          .returning(["id"])
          .executeTakeFirstOrThrow());

      if (existingSale) {
        await tx
          .updateTable("web3.nft_sales")
          .set({
            provider_payment_id: offer.provider_payment_id,
            payment_tx_hash: offer.tx_hash,
            transfer_tx_hash: null,
            status: "transferring",
            failure_reason: null,
            paid_at: new Date(),
            updated_at: new Date(),
          })
          .where("id", "=", existingSale.id)
          .execute();
      }

      await tx
        .updateTable("web3.nft_offers")
        .set({ status: "accepted", accepted_at: new Date(), updated_at: new Date() })
        .where("id", "=", offer.offer_id)
        .execute();

      return {
        saleId: sale.id,
        assetId: offer.nft_asset_id,
        listingId: null,
        offerId: offer.offer_id,
        sellerUserId,
        buyerUserId: offer.buyer_user_id,
        creatorUserId: offer.creator_user_id,
        characterId: offer.character_id,
        sellerAddress: offer.owner_address,
        buyerAddress: offer.buyer_address,
        contractId: offer.contract_id,
        tokenId: offer.token_id,
        amountCents: offer.amount_cents,
        currency: offer.currency,
        platformFeeCents: fees.platformFeeCents,
        royaltyFeeCents: fees.royaltyFeeCents,
        sellerNetCents: fees.sellerNetCents,
        paymentTxHash: offer.tx_hash,
      };
    });
  }

  private async failSale(saleId: string, error: unknown): Promise<void> {
    const reason = error instanceof Error ? error.message : "NFT transfer failed";

    await this.db.transaction().execute(async (tx) => {
      const sale = await tx
        .selectFrom("web3.nft_sales")
        .select(["id", "listing_id", "offer_id", "buyer_user_id"])
        .where("id", "=", saleId)
        .forUpdate()
        .executeTakeFirst();

      if (!sale) {
        return;
      }

      await tx
        .updateTable("web3.nft_sales")
        .set({
          status: sale.listing_id ? "paid" : "failed",
          failure_reason: reason,
          updated_at: new Date(),
        })
        .where("id", "=", saleId)
        .execute();

      if (sale.listing_id) {
        const reservedUntil = new Date();
        reservedUntil.setUTCMinutes(
          reservedUntil.getUTCMinutes() + this.config.STELLAR_PAYMENT_INTENT_TTL_MINUTES,
        );
        await tx
          .updateTable("web3.nft_listings")
          .set({
            status: "reserved",
            reserved_by_user_id: sale.buyer_user_id,
            reserved_sale_id: sale.id,
            reserved_until: reservedUntil,
            updated_at: new Date(),
          })
          .where("id", "=", sale.listing_id)
          .execute();
      }

      if (sale.offer_id) {
        await tx
          .updateTable("web3.nft_offers")
          .set({ status: "funded", accepted_at: null, updated_at: new Date() })
          .where("id", "=", sale.offer_id)
          .execute();
      }
    });
  }
}

interface NftSaleSettlement {
  saleId: string;
  assetId: string;
  listingId: string | null;
  offerId: string | null;
  sellerUserId: string;
  buyerUserId: string;
  creatorUserId: string;
  characterId: string;
  sellerAddress: string;
  buyerAddress: string;
  contractId: string;
  tokenId: string;
  amountCents: number;
  currency: string;
  platformFeeCents: number;
  royaltyFeeCents: number;
  sellerNetCents: number;
  paymentTxHash: string;
}

async function finalizeNftSale(
  db: Db,
  config: AppConfig,
  input: NftSaleSettlement & {
    transferTxHash: string;
    eventType: "sale_transfer" | "offer_transfer";
  },
): Promise<void> {
  const now = new Date();
  const availableAt = new Date(now);
  availableAt.setUTCDate(availableAt.getUTCDate() + config.CREATOR_EARNING_HOLD_DAYS);

  await db.transaction().execute(async (tx) => {
    await ensureCreatorWallet(tx, input.sellerUserId, input.currency);
    if (input.royaltyFeeCents > 0 && input.creatorUserId !== input.sellerUserId) {
      await ensureCreatorWallet(tx, input.creatorUserId, input.currency);
    }

    await tx
      .updateTable("web3.nft_sales")
      .set({
        status: "transferred",
        transfer_tx_hash: input.transferTxHash,
        transferred_at: now,
        updated_at: now,
      })
      .where("id", "=", input.saleId)
      .execute();
    await tx
      .updateTable("web3.nft_assets")
      .set({
        owner_user_id: input.buyerUserId,
        owner_address: input.buyerAddress,
        status: "minted",
        sold_at: now,
        updated_at: now,
      })
      .where("id", "=", input.assetId)
      .execute();

    if (input.listingId) {
      await tx
        .updateTable("web3.nft_listings")
        .set({
          status: "sold",
          reserved_by_user_id: null,
          reserved_sale_id: null,
          reserved_until: null,
          sold_at: now,
          updated_at: now,
        })
        .where("id", "=", input.listingId)
        .execute();
    }

    if (input.offerId) {
      await tx
        .updateTable("web3.nft_offers")
        .set({ status: "accepted", accepted_at: now, updated_at: now })
        .where("id", "=", input.offerId)
        .execute();
      await tx
        .updateTable("web3.nft_listings")
        .set({
          status: "cancelled",
          reserved_by_user_id: null,
          reserved_sale_id: null,
          reserved_until: null,
          updated_at: now,
        })
        .where("nft_asset_id", "=", input.assetId)
        .where("status", "in", ["active", "reserved"])
        .execute();
    }

    await tx
      .insertInto("web3.nft_ownership_events")
      .values({
        nft_asset_id: input.assetId,
        from_user_id: input.sellerUserId,
        to_user_id: input.buyerUserId,
        from_address: input.sellerAddress,
        to_address: input.buyerAddress,
        tx_hash: input.transferTxHash,
        event_type: input.eventType,
        metadata_json: { saleId: input.saleId, paymentTxHash: input.paymentTxHash },
      })
      .execute();

    const ledgerRows: CreatorLedgerEntryInsert[] = [
      {
        creator_user_id: input.sellerUserId,
        character_id: input.characterId,
        source_user_id: input.buyerUserId,
        entry_type: "sale_gross" as const,
        amount_cents: input.amountCents,
        currency: input.currency,
        status: "pending" as const,
        available_at: availableAt,
        reference_type: "web3.nft_sale",
        reference_id: input.saleId,
        idempotency_key: `nft-sale:${input.saleId}:gross`,
        metadata_json: { tokenId: input.tokenId },
      },
      {
        creator_user_id: input.sellerUserId,
        character_id: input.characterId,
        source_user_id: input.buyerUserId,
        entry_type: "platform_fee" as const,
        amount_cents: -input.platformFeeCents,
        currency: input.currency,
        status: "pending" as const,
        available_at: availableAt,
        reference_type: "web3.nft_sale",
        reference_id: input.saleId,
        idempotency_key: `nft-sale:${input.saleId}:platform-fee`,
        metadata_json: { platformFeeBps: config.CREATOR_PLATFORM_FEE_BPS },
      },
    ];

    if (input.royaltyFeeCents > 0 && input.creatorUserId !== input.sellerUserId) {
      ledgerRows.push({
        creator_user_id: input.creatorUserId,
        character_id: input.characterId,
        source_user_id: input.buyerUserId,
        entry_type: "sale_gross",
        amount_cents: input.royaltyFeeCents,
        currency: input.currency,
        status: "pending",
        available_at: availableAt,
        reference_type: "web3.nft_sale",
        reference_id: input.saleId,
        idempotency_key: `nft-sale:${input.saleId}:royalty`,
        metadata_json: { royalty: true, tokenId: input.tokenId },
      });
    }

    await tx
      .insertInto("billing.creator_ledger_entries")
      .values(ledgerRows)
      .onConflict((oc) => oc.column("idempotency_key").doNothing())
      .execute();

    await tx
      .updateTable("billing.creator_wallets")
      .set((eb) => ({
        pending_cents: eb("pending_cents", "+", input.sellerNetCents),
        lifetime_earned_cents: eb("lifetime_earned_cents", "+", input.sellerNetCents),
        lifetime_fee_cents: eb("lifetime_fee_cents", "+", input.platformFeeCents),
        updated_at: now,
      }))
      .where("creator_user_id", "=", input.sellerUserId)
      .execute();

    if (input.royaltyFeeCents > 0 && input.creatorUserId !== input.sellerUserId) {
      await tx
        .updateTable("billing.creator_wallets")
        .set((eb) => ({
          pending_cents: eb("pending_cents", "+", input.royaltyFeeCents),
          lifetime_earned_cents: eb("lifetime_earned_cents", "+", input.royaltyFeeCents),
          updated_at: now,
        }))
        .where("creator_user_id", "=", input.creatorUserId)
        .execute();
    }
  });
}

async function ensureCreatorWallet(db: Db, creatorUserId: string, currency: string): Promise<void> {
  await db
    .insertInto("billing.creator_wallets")
    .values({
      creator_user_id: creatorUserId,
      currency,
      pending_cents: 0,
      available_cents: 0,
      lifetime_earned_cents: 0,
      lifetime_fee_cents: 0,
      lifetime_paid_cents: 0,
      updated_at: new Date(),
    })
    .onConflict((oc) => oc.column("creator_user_id").doNothing())
    .execute();
}

function saleSettlementFromRow(
  row: {
    sale_id: string;
    nft_asset_id: string;
    listing_id: string | null;
    offer_id: string | null;
    seller_user_id: string;
    buyer_user_id: string;
    creator_user_id: string;
    character_id: string;
    seller_address: string;
    buyer_address: string;
    contract_id: string;
    token_id: string;
    amount_cents: number;
    currency: string;
    platform_fee_cents: number;
    royalty_fee_cents: number;
    seller_net_cents: number;
  },
  paymentTxHash: string,
): NftSaleSettlement {
  return {
    saleId: row.sale_id,
    assetId: row.nft_asset_id,
    listingId: row.listing_id,
    offerId: row.offer_id,
    sellerUserId: row.seller_user_id,
    buyerUserId: row.buyer_user_id,
    creatorUserId: row.creator_user_id,
    characterId: row.character_id,
    sellerAddress: row.seller_address,
    buyerAddress: row.buyer_address,
    contractId: row.contract_id,
    tokenId: row.token_id,
    amountCents: row.amount_cents,
    currency: row.currency,
    platformFeeCents: row.platform_fee_cents,
    royaltyFeeCents: row.royalty_fee_cents,
    sellerNetCents: row.seller_net_cents,
    paymentTxHash,
  };
}

function saleFees(input: {
  amountCents: number;
  platformFeeBps: number;
  royaltyBps: number;
  sellerUserId: string;
  creatorUserId: string;
}): {
  platformFeeCents: number;
  royaltyFeeCents: number;
  sellerNetCents: number;
} {
  const platformFeeCents = Math.floor((input.amountCents * input.platformFeeBps) / 10_000);
  const royaltyFeeCents =
    input.sellerUserId === input.creatorUserId
      ? 0
      : Math.floor((input.amountCents * input.royaltyBps) / 10_000);
  const sellerNetCents = input.amountCents - platformFeeCents - royaltyFeeCents;

  if (sellerNetCents < 0) {
    throw new DomainError("VALIDATION_FAILED", "NFT sale fees exceed sale amount");
  }

  return { platformFeeCents, royaltyFeeCents, sellerNetCents };
}

function chatImageUnlockPricing(input: {
  amountCents: number;
  tokenUsdCents: number;
  platformFeeBps: number;
}): {
  tokenAmountDisplay: string;
  amountCents: number;
  creatorShareCents: number;
  platformShareCents: number;
  creatorShareTokenDisplay: string;
  platformShareTokenDisplay: string;
} {
  const amountCents = input.amountCents;
  const tokenAmount = amountCents / input.tokenUsdCents;
  const platformShareCents = Math.floor((amountCents * input.platformFeeBps) / 10_000);
  const creatorShareCents = amountCents - platformShareCents;

  return {
    tokenAmountDisplay: tokenAmount.toFixed(7),
    amountCents,
    creatorShareCents,
    platformShareCents,
    creatorShareTokenDisplay: (creatorShareCents / input.tokenUsdCents).toFixed(7),
    platformShareTokenDisplay: (platformShareCents / input.tokenUsdCents).toFixed(7),
  };
}

function stellarNetworkChainId(config: AppConfig): number {
  return config.STELLAR_NETWORK === "mainnet" ? 1 : 2;
}

function assertNftReady(config: AppConfig): void {
  if (!config.STELLAR_ENABLED || !config.STELLAR_PAYMENTS_ENABLED || !config.STELLAR_NFT_ENABLED) {
    throw new DomainError("ENTITLEMENT_REQUIRED", "NFT marketplace is not enabled.");
  }

  if (!config.STELLAR_NFT_CONTRACT_ID) {
    throw new DomainError("INTERNAL", "NFT contract is not configured");
  }

  resolveServerSecret(config);
}

function resolveServerSecret(config: AppConfig): string {
  const keyRef = config.STELLAR_SERVER_KEY_REF?.trim();

  if (!keyRef) {
    throw new DomainError("INTERNAL", "NFT signer is not configured");
  }

  const envName = keyRef.startsWith("env:") ? keyRef.slice(4) : keyRef;
  const secret = process.env[envName] ?? (/^S[A-Z2-7]{55}$/.test(keyRef) ? keyRef : undefined);

  if (!secret) {
    throw new DomainError("INTERNAL", "NFT signer secret is not available");
  }

  return secret;
}

function absoluteProductUrl(config: AppConfig, pathOrUrl: string): string {
  if (pathOrUrl.startsWith("https://")) {
    return pathOrUrl;
  }

  return new URL(pathOrUrl, config.WEB_ORIGIN).toString();
}

function clampLimit(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed)) return fallback;
  return Math.min(100, Math.max(1, parsed));
}

function requireFutureDate(value: string, label: string): Date {
  const parsed = new Date(value);

  if (parsed.getTime() <= Date.now()) {
    throw new DomainError("VALIDATION_FAILED", `${label} expiry must be in the future`);
  }

  const maxExpiry = new Date();
  maxExpiry.setUTCDate(maxExpiry.getUTCDate() + 180);

  if (parsed.getTime() > maxExpiry.getTime()) {
    throw new DomainError("VALIDATION_FAILED", `${label} expiry cannot exceed 180 days`);
  }

  return parsed;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}
