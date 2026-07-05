import { loadConfig, type AppConfig } from "@hana/config";
import {
  AdminProcessPayoutRequestSchema,
  CreateCharacterPurchaseRequestSchema,
  RequestCreatorPayoutRequestSchema,
  UpsertPayoutProfileRequestSchema,
  VerifyCharacterPurchaseRequestSchema,
} from "@hana/contracts";
import { createDatabase, type HanaDatabase } from "@hana/database";
import { DomainError } from "@hana/errors";
import { Body, Controller, Get, Headers, Param, Patch, Post } from "@nestjs/common";
import { Kysely, sql } from "kysely";
import { randomUUID } from "node:crypto";
import { completedUserTurnCount } from "./billable-messages";
import {
  assertStellarPaymentsEnabled,
  createStellarPaymentIntent,
  verifyStellarPaymentIntent,
  verifyStellarPayoutTransfer,
} from "./stellar-payments";
import { normalizeStellarAddress as normalizeAddress } from "@hana/stellar-bridge";
import { auditEvent, requireAdmin, requireSession } from "./session";

type Db = Kysely<HanaDatabase>;
type PayoutProvider = "stellar";

@Controller("/v1/monetization")
export class MonetizationController {
  private readonly config = loadConfig();
  private readonly db = createDatabase(this.config);

  @Get("/wallet")
  public async wallet(@Headers("authorization") authorization?: string) {
    const session = await requireSession(this.db, this.config, authorization);

    await releasePendingEarnings(this.db, session.userId);
    await ensureCreatorWallet(this.db, session.userId, "USD");

    const [wallet, profile, ledgerEntries, payouts, purchases] = await Promise.all([
      this.db
        .selectFrom("billing.creator_wallets")
        .selectAll()
        .where("creator_user_id", "=", session.userId)
        .executeTakeFirstOrThrow(),
      this.db
        .selectFrom("billing.creator_payout_profiles as profiles")
        .leftJoin("billing.crypto_payout_accounts as crypto", (join) =>
          join
            .onRef("crypto.creator_user_id", "=", "profiles.creator_user_id")
            .on("crypto.chain_id", "=", this.config.STELLAR_NETWORK === "mainnet" ? 1 : 2),
        )
        .select([
          "profiles.status",
          "profiles.display_name",
          "profiles.legal_name",
          "profiles.payout_mode",
          "profiles.vpa_last4",
          "profiles.updated_at",
          "crypto.wallet_address as crypto_wallet_address",
          "crypto.status as crypto_status",
        ])
        .where("profiles.creator_user_id", "=", session.userId)
        .executeTakeFirst(),
      this.db
        .selectFrom("billing.creator_ledger_entries as ledger")
        .leftJoin("creator.characters as characters", "characters.id", "ledger.character_id")
        .select([
          "ledger.id",
          "ledger.entry_type",
          "ledger.amount_cents",
          "ledger.currency",
          "ledger.status",
          "ledger.available_at",
          "ledger.created_at",
          "characters.name as character_name",
        ])
        .where("ledger.creator_user_id", "=", session.userId)
        .orderBy("ledger.created_at", "desc")
        .limit(50)
        .execute(),
      this.db
        .selectFrom("billing.creator_payouts")
        .select([
          "id",
          "amount_cents",
          "currency",
          "status",
          "provider",
          "provider_payout_id",
          "failure_reason",
          "requested_at",
          "approved_at",
          "paid_at",
        ])
        .where("creator_user_id", "=", session.userId)
        .orderBy("requested_at", "desc")
        .limit(20)
        .execute(),
      this.db
        .selectFrom("billing.character_purchases as purchases")
        .innerJoin("creator.characters as characters", "characters.id", "purchases.character_id")
        .select([
          "purchases.id",
          "purchases.amount_cents",
          "purchases.currency",
          "purchases.status",
          "purchases.created_at",
          "characters.name as character_name",
        ])
        .where("purchases.user_id", "=", session.userId)
        .orderBy("purchases.created_at", "desc")
        .limit(20)
        .execute(),
    ]);

    return {
      monetizationEnabled: this.config.MONETIZATION_ENABLED,
      comingSoon: !this.config.MONETIZATION_ENABLED,
      wallet: toWalletSummary(wallet),
      payoutProfile: profile
        ? {
            status: profile.status,
            displayName: profile.display_name,
            legalName: profile.legal_name,
            payoutMode: profile.payout_mode,
            vpaLast4: profile.vpa_last4,
            walletAddress: profile.crypto_wallet_address,
            walletLast4: profile.crypto_wallet_address?.slice(-4) ?? profile.vpa_last4,
            providerReady: Boolean(
              profile.crypto_wallet_address &&
              profile.status === "verified" &&
              profile.crypto_status === "verified",
            ),
            updatedAt: profile.updated_at.toISOString(),
          }
        : null,
      ledgerEntries: ledgerEntries.map((entry) => ({
        id: entry.id,
        type: entry.entry_type,
        amountCents: entry.amount_cents,
        currency: entry.currency,
        status: entry.status,
        availableAt: entry.available_at.toISOString(),
        createdAt: entry.created_at.toISOString(),
        characterName: entry.character_name,
      })),
      payouts: payouts.map((payout) => ({
        id: payout.id,
        amountCents: payout.amount_cents,
        currency: payout.currency,
        status: payout.status,
        provider: payout.provider,
        providerPayoutId: payout.provider_payout_id,
        failureReason: payout.failure_reason,
        requestedAt: payout.requested_at.toISOString(),
        approvedAt: payout.approved_at?.toISOString() ?? null,
        paidAt: payout.paid_at?.toISOString() ?? null,
      })),
      purchases: purchases.map((purchase) => ({
        id: purchase.id,
        characterName: purchase.character_name,
        amountCents: purchase.amount_cents,
        currency: purchase.currency,
        status: purchase.status,
        createdAt: purchase.created_at.toISOString(),
      })),
      policy: {
        platformFeeBps: this.config.CREATOR_PLATFORM_FEE_BPS,
        earningHoldDays: this.config.CREATOR_EARNING_HOLD_DAYS,
        minimumPayoutCents: this.config.CREATOR_MIN_PAYOUT_CENTS,
        paidCharacterTrialMessages: this.config.CREATOR_PAID_CHARACTER_TRIAL_MESSAGES,
      },
    };
  }

  @Patch("/payout-profile")
  public async upsertPayoutProfile(
    @Body() body: unknown,
    @Headers("authorization") authorization?: string,
  ) {
    const session = await requireSession(this.db, this.config, authorization);
    const input = UpsertPayoutProfileRequestSchema.parse(body);

    assertMonetizationEnabled(this.config);

    const walletAddress = normalizeAddress(input.walletAddress, "walletAddress");
    const now = new Date();
    const status: "pending_review" = "pending_review";
    const stellarChainId = this.config.STELLAR_NETWORK === "mainnet" ? 1 : 2;
    const metadata: Record<string, unknown> = {
      provider: "stellar",
      network: this.config.STELLAR_NETWORK,
      walletAddress,
      assetCode: this.config.STELLAR_PAYMENT_ASSET_CODE,
    };

    await ensureCreatorWallet(this.db, session.userId, "USD");
    await this.db.transaction().execute(async (tx) => {
      await tx
        .insertInto("billing.creator_payout_profiles")
        .values({
          creator_user_id: session.userId,
          status,
          display_name: input.displayName,
          legal_name: input.legalName || null,
          payout_mode: "stellar",
          encrypted_vpa: null,
          vpa_last4: walletAddress.slice(-4),
          metadata_json: metadata,
          updated_at: now,
        })
        .onConflict((oc) =>
          oc.column("creator_user_id").doUpdateSet({
            status,
            display_name: input.displayName,
            legal_name: input.legalName || null,
            payout_mode: "stellar",
            encrypted_vpa: null,
            vpa_last4: walletAddress.slice(-4),
            metadata_json: metadata,
            updated_at: now,
          }),
        )
        .execute();

      await tx
        .insertInto("billing.crypto_payout_accounts")
        .values({
          creator_user_id: session.userId,
          chain_id: stellarChainId,
          wallet_address: walletAddress,
          stellar_address: walletAddress,
          token_preference: this.config.STELLAR_PAYMENT_ASSET_CODE,
          status,
          metadata_json: metadata,
          updated_at: now,
          verified_at: null,
        })
        .onConflict((oc) =>
          oc.columns(["creator_user_id", "chain_id"]).doUpdateSet({
            wallet_address: walletAddress,
            stellar_address: walletAddress,
            token_preference: this.config.STELLAR_PAYMENT_ASSET_CODE,
            status,
            metadata_json: metadata,
            updated_at: now,
            verified_at: null,
          }),
        )
        .execute();
    });

    await auditEvent(this.db, {
      actorUserId: session.userId,
      action: "monetization.payout_profile.upsert",
      resourceType: "billing.creator_payout_profile",
      resourceId: session.userId,
      metadata: { status, provider: metadata["provider"] },
    });

    return {
      ok: true,
      payoutProfile: {
        status,
        displayName: input.displayName,
        payoutMode: "stellar",
        walletAddress,
        walletLast4: walletAddress.slice(-4),
        providerReady: false,
      },
    };
  }

  @Post("/character-purchases")
  public async createCharacterPurchase(
    @Body() body: unknown,
    @Headers("authorization") authorization?: string,
  ) {
    const session = await requireSession(this.db, this.config, authorization);
    const input = CreateCharacterPurchaseRequestSchema.parse(body);

    assertMonetizationEnabled(this.config);

    const character = await this.db
      .selectFrom("creator.characters as characters")
      .select([
        "characters.id",
        "characters.creator_user_id",
        "characters.name",
        "characters.visibility",
        "characters.moderation_status",
        "characters.price_cents",
        "characters.monetization_enabled",
      ])
      .where("characters.id", "=", input.characterId)
      .executeTakeFirst();

    if (!character) {
      throw new DomainError("RESOURCE_NOT_FOUND", "Character not found");
    }

    if (character.visibility !== "public" || character.moderation_status !== "approved") {
      throw new DomainError("AUTH_FORBIDDEN", "Character is not available for purchase");
    }

    if (character.creator_user_id === session.userId) {
      return { activated: true, ownedByCreator: true };
    }

    if (!character.monetization_enabled || character.price_cents <= 0) {
      return { activated: true, free: true };
    }

    const existingPaid = await hasPaidCharacterAccess(this.db, session.userId, character.id);

    if (existingPaid) {
      return { activated: true, alreadyPurchased: true };
    }

    const trial = await paidCharacterTrialStatus(
      this.db,
      this.config,
      session.userId,
      character.id,
    );

    if (trial.remaining > 0) {
      return {
        activated: true,
        trial: true,
        characterId: character.id,
        trialLimit: trial.limit,
        trialUsed: trial.used,
        trialRemaining: trial.remaining,
      };
    }

    const provider = resolvePaymentProvider(input.provider);
    const platformFeeCents = platformFee(
      character.price_cents,
      this.config.CREATOR_PLATFORM_FEE_BPS,
    );
    const purchase = await this.db
      .insertInto("billing.character_purchases")
      .values({
        user_id: session.userId,
        character_id: character.id,
        creator_user_id: character.creator_user_id,
        amount_cents: character.price_cents,
        currency: "USD",
        platform_fee_cents: platformFeeCents,
        creator_net_cents: character.price_cents - platformFeeCents,
        provider,
        provider_order_id: null,
        provider_payment_id: null,
        status: "created",
        idempotency_key: `character_purchase:${session.userId}:${character.id}`,
        metadata_json: { characterName: character.name },
      })
      .onConflict((oc) => oc.column("idempotency_key").doNothing())
      .returning(["id"])
      .executeTakeFirst();
    const purchaseId =
      purchase?.id ??
      (
        await this.db
          .selectFrom("billing.character_purchases")
          .select(["id", "status"])
          .where("idempotency_key", "=", `character_purchase:${session.userId}:${character.id}`)
          .executeTakeFirstOrThrow()
      ).id;

    const payment = await createStellarPaymentIntent({
      db: this.db,
      config: this.config,
      buyerUserId: session.userId,
      purpose: `character:${purchaseId}`,
      amountCents: character.price_cents,
      currency: "USD",
      metadata: {
        type: "character_purchase",
        internalPurchaseId: purchaseId,
        characterId: character.id,
        creatorUserId: character.creator_user_id,
        buyerUserId: session.userId,
        characterName: character.name,
      },
    });

    await this.db
      .updateTable("billing.character_purchases")
      .set({
        provider_order_id: payment.id,
        metadata_json: {
          characterName: character.name,
          stellarPaymentId: payment.id,
          providerReference: payment.providerReference,
        },
        updated_at: new Date(),
      })
      .where("id", "=", purchaseId)
      .execute();

    return {
      provider: "stellar",
      internalPurchaseId: purchaseId,
      payment,
      character: {
        id: character.id,
        name: character.name,
        priceCents: character.price_cents,
      },
    };
  }

  @Post("/character-purchases/verify")
  public async verifyCharacterPurchase(
    @Body() body: unknown,
    @Headers("authorization") authorization?: string,
  ) {
    const session = await requireSession(this.db, this.config, authorization);
    const input = VerifyCharacterPurchaseRequestSchema.parse(body);

    assertMonetizationEnabled(this.config);

    const purchase = await this.db
      .selectFrom("billing.character_purchases")
      .selectAll()
      .where("id", "=", input.internalPurchaseId)
      .where("user_id", "=", session.userId)
      .executeTakeFirst();

    if (
      !purchase ||
      purchase.provider !== "stellar" ||
      purchase.provider_order_id !== input.paymentId
    ) {
      throw new DomainError("RESOURCE_NOT_FOUND", "Purchase order not found");
    }

    const verification = await verifyStellarPaymentIntent({
      db: this.db,
      config: this.config,
      buyerUserId: session.userId,
      paymentId: input.paymentId,
      txHash: input.txHash,
      walletAddress: input.walletAddress,
      expectedPurposePrefix: `character:${purchase.id}`,
    });

    if (verification.status === "pending") {
      return {
        ok: false,
        status: "pending",
        characterId: purchase.character_id,
      };
    }

    await finalizeCharacterPurchase(this.db, this.config, purchase.id, verification.txHash, {
      provider: "stellar",
      stellarPaymentId: input.paymentId,
      walletAddress: verification.walletAddress,
    });

    return {
      ok: true,
      status: "finalized",
      activated: true,
      characterId: purchase.character_id,
      txHash: verification.txHash,
    };
  }

  @Post("/payouts")
  public async requestPayout(
    @Body() body: unknown,
    @Headers("authorization") authorization?: string,
  ) {
    const session = await requireSession(this.db, this.config, authorization);
    const input = RequestCreatorPayoutRequestSchema.parse(body);

    assertMonetizationEnabled(this.config);

    await releasePendingEarnings(this.db, session.userId);

    const profile = await this.db
      .selectFrom("billing.creator_payout_profiles as profiles")
      .leftJoin("billing.crypto_payout_accounts as crypto", (join) =>
        join
          .onRef("crypto.creator_user_id", "=", "profiles.creator_user_id")
          .on("crypto.chain_id", "=", this.config.STELLAR_NETWORK === "mainnet" ? 1 : 2),
      )
      .select(["profiles.status", "crypto.status as crypto_status", "crypto.wallet_address"])
      .where("profiles.creator_user_id", "=", session.userId)
      .executeTakeFirst();

    if (
      !profile ||
      profile.status !== "verified" ||
      profile.crypto_status !== "verified" ||
      !profile.wallet_address
    ) {
      throw new DomainError(
        "ENTITLEMENT_REQUIRED",
        "Set up a verified Stellar payout wallet first",
      );
    }

    if (input.amountCents < this.config.CREATOR_MIN_PAYOUT_CENTS) {
      throw new DomainError("CONFLICT", "Payout amount is below the minimum", {
        minimumPayoutCents: this.config.CREATOR_MIN_PAYOUT_CENTS,
      });
    }

    const payout = await this.db.transaction().execute(async (tx) => {
      const wallet = await tx
        .selectFrom("billing.creator_wallets")
        .selectAll()
        .where("creator_user_id", "=", session.userId)
        .forUpdate()
        .executeTakeFirstOrThrow();

      if (wallet.currency !== input.currency) {
        throw new DomainError("CONFLICT", "Wallet currency does not match payout currency");
      }

      if (wallet.available_cents < input.amountCents) {
        throw new DomainError("CONFLICT", "Not enough available balance");
      }

      const created = await tx
        .insertInto("billing.creator_payouts")
        .values({
          creator_user_id: session.userId,
          requested_by_user_id: session.userId,
          amount_cents: input.amountCents,
          currency: input.currency,
          status: "requested",
          provider: "stellar",
          idempotency_key: `payout:${session.userId}:${randomUUID()}`,
          metadata_json: {},
        })
        .returning(["id"])
        .executeTakeFirstOrThrow();

      await tx
        .insertInto("billing.creator_ledger_entries")
        .values({
          creator_user_id: session.userId,
          entry_type: "payout_reserve",
          amount_cents: -input.amountCents,
          currency: input.currency,
          status: "available",
          available_at: new Date(),
          reference_type: "billing.creator_payout",
          reference_id: created.id,
          idempotency_key: `payout:${created.id}:reserve`,
          metadata_json: {},
        })
        .execute();

      await tx
        .updateTable("billing.creator_wallets")
        .set({
          available_cents: wallet.available_cents - input.amountCents,
          updated_at: new Date(),
        })
        .where("creator_user_id", "=", session.userId)
        .execute();

      return created;
    });

    await auditEvent(this.db, {
      actorUserId: session.userId,
      action: "monetization.payout.request",
      resourceType: "billing.creator_payout",
      resourceId: payout.id,
      metadata: { amountCents: input.amountCents, currency: input.currency },
    });

    return { ok: true, payoutId: payout.id };
  }
}

@Controller("/v1/admin/monetization")
export class AdminMonetizationController {
  private readonly config = loadConfig();
  private readonly db = createDatabase(this.config);

  @Get()
  public async overview(@Headers("authorization") authorization?: string) {
    await requireAdmin(this.db, this.config, authorization);
    await releaseAllDueEarnings(this.db);

    const [walletTotals, payoutTotals, pendingPayouts, pendingProfiles, topCreators] =
      await Promise.all([
        this.db
          .selectFrom("billing.creator_wallets")
          .select([
            sql<number>`coalesce(sum(pending_cents), 0)::integer`.as("pending_cents"),
            sql<number>`coalesce(sum(available_cents), 0)::integer`.as("available_cents"),
            sql<number>`coalesce(sum(lifetime_earned_cents), 0)::integer`.as(
              "lifetime_earned_cents",
            ),
            sql<number>`coalesce(sum(lifetime_fee_cents), 0)::integer`.as("lifetime_fee_cents"),
            sql<number>`coalesce(sum(lifetime_paid_cents), 0)::integer`.as("lifetime_paid_cents"),
          ])
          .executeTakeFirstOrThrow(),
        this.db
          .selectFrom("billing.creator_payouts")
          .select([
            sql<number>`count(*)::integer`.as("count"),
            sql<number>`coalesce(sum(amount_cents), 0)::integer`.as("amount_cents"),
          ])
          .where("status", "in", ["requested", "approved", "processing"])
          .executeTakeFirstOrThrow(),
        this.db
          .selectFrom("billing.creator_payouts as payouts")
          .innerJoin("identity.users as users", "users.id", "payouts.creator_user_id")
          .leftJoin(
            "billing.creator_payout_profiles as profiles",
            "profiles.creator_user_id",
            "payouts.creator_user_id",
          )
          .leftJoin("billing.crypto_payout_accounts as crypto", (join) =>
            join
              .onRef("crypto.creator_user_id", "=", "payouts.creator_user_id")
              .on("crypto.chain_id", "=", this.config.STELLAR_NETWORK === "mainnet" ? 1 : 2),
          )
          .select([
            "payouts.id",
            "payouts.creator_user_id",
            "users.display_name",
            "profiles.display_name as payout_display_name",
            "profiles.status as profile_status",
            "profiles.vpa_last4",
            "crypto.wallet_address as crypto_wallet_address",
            "crypto.status as crypto_status",
            "payouts.amount_cents",
            "payouts.currency",
            "payouts.status",
            "payouts.provider",
            "payouts.provider_payout_id",
            "payouts.failure_reason",
            "payouts.requested_at",
          ])
          .where("payouts.status", "in", ["requested", "approved", "processing", "failed"])
          .orderBy("payouts.requested_at", "asc")
          .limit(50)
          .execute(),
        this.db
          .selectFrom("billing.creator_payout_profiles as profiles")
          .innerJoin("identity.users as users", "users.id", "profiles.creator_user_id")
          .leftJoin("billing.crypto_payout_accounts as crypto", (join) =>
            join
              .onRef("crypto.creator_user_id", "=", "profiles.creator_user_id")
              .on("crypto.chain_id", "=", this.config.STELLAR_NETWORK === "mainnet" ? 1 : 2),
          )
          .select([
            "profiles.creator_user_id",
            "profiles.display_name",
            "users.display_name as user_display_name",
            "profiles.status",
            "profiles.payout_mode",
            "profiles.vpa_last4",
            "crypto.wallet_address as crypto_wallet_address",
            "crypto.status as crypto_status",
            "profiles.updated_at",
          ])
          .where("profiles.status", "=", "pending_review")
          .orderBy("profiles.updated_at", "asc")
          .limit(50)
          .execute(),
        this.db
          .selectFrom("billing.creator_wallets as wallets")
          .innerJoin("identity.users as users", "users.id", "wallets.creator_user_id")
          .select([
            "wallets.creator_user_id",
            "users.display_name",
            "wallets.currency",
            "wallets.available_cents",
            "wallets.pending_cents",
            "wallets.lifetime_earned_cents",
            "wallets.lifetime_paid_cents",
          ])
          .orderBy("wallets.lifetime_earned_cents", "desc")
          .limit(20)
          .execute(),
      ]);

    return {
      summary: {
        pendingCents: walletTotals.pending_cents,
        availableCents: walletTotals.available_cents,
        lifetimeEarnedCents: walletTotals.lifetime_earned_cents,
        lifetimeFeeCents: walletTotals.lifetime_fee_cents,
        lifetimePaidCents: walletTotals.lifetime_paid_cents,
        openPayoutCount: payoutTotals.count,
        openPayoutCents: payoutTotals.amount_cents,
      },
      pendingPayouts: pendingPayouts.map((payout) => ({
        id: payout.id,
        creatorUserId: payout.creator_user_id,
        creatorName: payout.payout_display_name ?? payout.display_name ?? "Creator",
        profileStatus: payout.profile_status,
        vpaLast4: payout.crypto_wallet_address?.slice(-4) ?? payout.vpa_last4,
        walletAddress: payout.crypto_wallet_address,
        walletLast4: payout.crypto_wallet_address?.slice(-4) ?? payout.vpa_last4,
        providerReady: Boolean(
          payout.crypto_wallet_address &&
          payout.profile_status === "verified" &&
          payout.crypto_status === "verified",
        ),
        amountCents: payout.amount_cents,
        currency: payout.currency,
        status: payout.status,
        provider: payout.provider,
        providerPayoutId: payout.provider_payout_id,
        failureReason: payout.failure_reason,
        requestedAt: payout.requested_at.toISOString(),
      })),
      pendingProfiles: pendingProfiles.map((profile) => ({
        creatorUserId: profile.creator_user_id,
        displayName: profile.display_name || profile.user_display_name || "Creator",
        status: profile.status,
        payoutMode: profile.payout_mode,
        vpaLast4: profile.crypto_wallet_address?.slice(-4) ?? profile.vpa_last4,
        walletAddress: profile.crypto_wallet_address,
        walletLast4: profile.crypto_wallet_address?.slice(-4) ?? profile.vpa_last4,
        providerReady: Boolean(
          profile.crypto_wallet_address &&
          profile.status === "verified" &&
          profile.crypto_status === "verified",
        ),
        updatedAt: profile.updated_at.toISOString(),
      })),
      topCreators: topCreators.map((creator) => ({
        creatorUserId: creator.creator_user_id,
        displayName: creator.display_name ?? "Creator",
        currency: creator.currency,
        availableCents: creator.available_cents,
        pendingCents: creator.pending_cents,
        lifetimeEarnedCents: creator.lifetime_earned_cents,
        lifetimePaidCents: creator.lifetime_paid_cents,
      })),
    };
  }

  @Post("/payouts/:payoutId/process")
  public async processPayout(
    @Param("payoutId") payoutId: string,
    @Body() body: unknown,
    @Headers("authorization") authorization?: string,
  ) {
    const admin = await requireAdmin(this.db, this.config, authorization);
    const input = AdminProcessPayoutRequestSchema.parse(body);
    const provider = input.provider;
    const payout = await this.db
      .selectFrom("billing.creator_payouts as payouts")
      .innerJoin(
        "billing.creator_payout_profiles as profiles",
        "profiles.creator_user_id",
        "payouts.creator_user_id",
      )
      .leftJoin("billing.crypto_payout_accounts as crypto", (join) =>
        join
          .onRef("crypto.creator_user_id", "=", "payouts.creator_user_id")
          .on("crypto.chain_id", "=", this.config.STELLAR_NETWORK === "mainnet" ? 1 : 2),
      )
      .select([
        "payouts.id",
        "payouts.creator_user_id",
        "payouts.amount_cents",
        "payouts.currency",
        "payouts.status",
        "profiles.status as profile_status",
        "crypto.wallet_address as crypto_wallet_address",
        "crypto.status as crypto_status",
      ])
      .where("payouts.id", "=", payoutId)
      .executeTakeFirst();

    if (!payout) {
      throw new DomainError("RESOURCE_NOT_FOUND", "Payout not found");
    }

    if (!["requested", "approved"].includes(payout.status)) {
      throw new DomainError("CONFLICT", "Payout is not ready for processing", {
        status: payout.status,
      });
    }

    if (payout.profile_status !== "verified") {
      throw new DomainError("CONFLICT", "Creator payout profile is not verified");
    }

    if (payout.crypto_status !== "verified" || !payout.crypto_wallet_address) {
      throw new DomainError("CONFLICT", "Creator Stellar payout wallet is not verified");
    }

    const providerResult = await verifyStellarPayoutTransfer({
      db: this.db,
      config: this.config,
      payoutId: payout.id,
      amountCents: payout.amount_cents,
      txHash: input.txHash,
      creatorWalletAddress: payout.crypto_wallet_address,
      metadata: {
        note: input.note,
        creatorUserId: payout.creator_user_id,
        verifiedBy: admin.userId,
      },
    });

    await this.markPayoutProcessed({
      payoutId: payout.id,
      adminUserId: admin.userId,
      provider,
      providerPayoutId: providerResult.txHash,
      status: "paid",
      metadata: { note: input.note, providerResult },
    });

    return {
      ok: true,
      payoutId: payout.id,
      status: "paid",
      providerPayoutId: providerResult.txHash,
    };
  }

  @Post("/payouts/:payoutId/refresh")
  public async refreshPayout(
    @Param("payoutId") payoutId: string,
    @Headers("authorization") authorization?: string,
  ) {
    const admin = await requireAdmin(this.db, this.config, authorization);
    const payout = await this.db
      .selectFrom("billing.creator_payouts as payouts")
      .leftJoin("billing.crypto_payout_accounts as crypto", (join) =>
        join
          .onRef("crypto.creator_user_id", "=", "payouts.creator_user_id")
          .on("crypto.chain_id", "=", this.config.STELLAR_NETWORK === "mainnet" ? 1 : 2),
      )
      .select([
        "payouts.id",
        "payouts.creator_user_id",
        "payouts.amount_cents",
        "payouts.status",
        "payouts.provider",
        "payouts.provider_payout_id",
        "crypto.wallet_address as crypto_wallet_address",
        "crypto.status as crypto_status",
      ])
      .where("payouts.id", "=", payoutId)
      .executeTakeFirst();

    if (!payout) {
      throw new DomainError("RESOURCE_NOT_FOUND", "Payout not found");
    }

    if (payout.status !== "processing") {
      return { ok: true, payoutId, status: payout.status };
    }

    if (payout.provider !== "stellar" || !payout.provider_payout_id) {
      throw new DomainError("CONFLICT", "Only Stellar payouts can be refreshed");
    }

    if (payout.crypto_status !== "verified" || !payout.crypto_wallet_address) {
      throw new DomainError("CONFLICT", "Creator Stellar payout wallet is not verified");
    }

    const providerResult = await verifyStellarPayoutTransfer({
      db: this.db,
      config: this.config,
      payoutId: payout.id,
      amountCents: payout.amount_cents,
      txHash: payout.provider_payout_id,
      creatorWalletAddress: payout.crypto_wallet_address,
      metadata: {
        creatorUserId: payout.creator_user_id,
        refreshedBy: admin.userId,
      },
    });

    if (providerResult.status === "finalized") {
      await this.markPayoutProcessed({
        payoutId: payout.id,
        adminUserId: admin.userId,
        provider: "stellar",
        providerPayoutId: payout.provider_payout_id,
        status: "paid",
        metadata: { providerResult, refreshedBy: admin.userId },
      });

      return { ok: true, payoutId, status: "paid" };
    }

    return { ok: true, payoutId, status: "processing" };
  }

  @Post("/payout-profiles/:creatorUserId/verify")
  public async verifyPayoutProfile(
    @Param("creatorUserId") creatorUserId: string,
    @Headers("authorization") authorization?: string,
  ) {
    const admin = await requireAdmin(this.db, this.config, authorization);
    const profile = await this.db
      .selectFrom("billing.creator_payout_profiles")
      .select(["creator_user_id", "status"])
      .where("creator_user_id", "=", creatorUserId)
      .executeTakeFirst();

    if (!profile) {
      throw new DomainError("RESOURCE_NOT_FOUND", "Payout profile not found");
    }

    await this.db.transaction().execute(async (tx) => {
      await tx
        .updateTable("billing.creator_payout_profiles")
        .set({
          status: "verified",
          metadata_json: sql`metadata_json || ${JSON.stringify({
            verifiedBy: admin.userId,
            verifiedAt: new Date().toISOString(),
          })}::jsonb`,
          updated_at: new Date(),
        })
        .where("creator_user_id", "=", creatorUserId)
        .execute();

      await tx
        .updateTable("billing.crypto_payout_accounts")
        .set({
          status: "verified",
          verified_at: new Date(),
          metadata_json: sql`metadata_json || ${JSON.stringify({
            verifiedBy: admin.userId,
            verifiedAt: new Date().toISOString(),
          })}::jsonb`,
          updated_at: new Date(),
        })
        .where("creator_user_id", "=", creatorUserId)
        .where("chain_id", "=", this.config.STELLAR_NETWORK === "mainnet" ? 1 : 2)
        .execute();
    });

    await auditEvent(this.db, {
      actorUserId: admin.userId,
      action: "admin.monetization.payout_profile.verify",
      resourceType: "billing.creator_payout_profile",
      resourceId: creatorUserId,
      metadata: { previousStatus: profile.status },
    });

    return { ok: true, creatorUserId, status: "verified" };
  }

  private async markPayoutProcessed(input: {
    payoutId: string;
    adminUserId: string;
    provider: PayoutProvider;
    providerPayoutId: string;
    status: "processing" | "paid";
    metadata: Record<string, unknown>;
  }): Promise<void> {
    const now = new Date();

    await this.db.transaction().execute(async (tx) => {
      const payout = await tx
        .selectFrom("billing.creator_payouts")
        .selectAll()
        .where("id", "=", input.payoutId)
        .forUpdate()
        .executeTakeFirstOrThrow();

      await tx
        .updateTable("billing.creator_payouts")
        .set({
          approved_by_user_id: input.adminUserId,
          approved_at: payout.approved_at ?? now,
          paid_at: input.status === "paid" ? now : null,
          status: input.status,
          provider: input.provider,
          provider_payout_id: input.providerPayoutId,
          metadata_json: input.metadata,
          updated_at: now,
        })
        .where("id", "=", input.payoutId)
        .execute();

      if (input.status === "paid" && payout.status !== "paid") {
        await tx
          .updateTable("billing.creator_wallets")
          .set((eb) => ({
            lifetime_paid_cents: eb("lifetime_paid_cents", "+", payout.amount_cents),
            updated_at: now,
          }))
          .where("creator_user_id", "=", payout.creator_user_id)
          .execute();
        await tx
          .updateTable("billing.creator_ledger_entries")
          .set({ status: "settled" })
          .where("reference_type", "=", "billing.creator_payout")
          .where("reference_id", "=", payout.id)
          .where("entry_type", "=", "payout_reserve")
          .execute();
      }
    });

    await auditEvent(this.db, {
      actorUserId: input.adminUserId,
      action: "admin.monetization.payout.process",
      resourceType: "billing.creator_payout",
      resourceId: input.payoutId,
      metadata: { provider: input.provider, status: input.status },
    });
  }

  private async markPayoutFailed(input: {
    payoutId: string;
    adminUserId: string;
    failureReason: string;
    metadata: Record<string, unknown>;
  }): Promise<void> {
    const now = new Date();

    await this.db.transaction().execute(async (tx) => {
      const payout = await tx
        .selectFrom("billing.creator_payouts")
        .selectAll()
        .where("id", "=", input.payoutId)
        .forUpdate()
        .executeTakeFirstOrThrow();

      if (payout.status === "failed" || payout.status === "paid") {
        return;
      }

      await tx
        .updateTable("billing.creator_payouts")
        .set({
          status: "failed",
          failure_reason: input.failureReason,
          metadata_json: input.metadata,
          updated_at: now,
        })
        .where("id", "=", input.payoutId)
        .execute();

      await tx
        .insertInto("billing.creator_ledger_entries")
        .values({
          creator_user_id: payout.creator_user_id,
          entry_type: "payout_release",
          amount_cents: payout.amount_cents,
          currency: payout.currency,
          status: "available",
          available_at: now,
          reference_type: "billing.creator_payout",
          reference_id: payout.id,
          idempotency_key: `payout:${payout.id}:release`,
          metadata_json: { failureReason: input.failureReason },
        })
        .onConflict((oc) => oc.column("idempotency_key").doNothing())
        .execute();

      await tx
        .updateTable("billing.creator_wallets")
        .set((eb) => ({
          available_cents: eb("available_cents", "+", payout.amount_cents),
          updated_at: now,
        }))
        .where("creator_user_id", "=", payout.creator_user_id)
        .execute();

      await tx
        .updateTable("billing.creator_ledger_entries")
        .set({ status: "reversed" })
        .where("reference_type", "=", "billing.creator_payout")
        .where("reference_id", "=", payout.id)
        .where("entry_type", "=", "payout_reserve")
        .execute();
    });

    await auditEvent(this.db, {
      actorUserId: input.adminUserId,
      action: "admin.monetization.payout.failed",
      resourceType: "billing.creator_payout",
      resourceId: input.payoutId,
      metadata: { failureReason: input.failureReason },
    });
  }
}

export async function hasPaidCharacterAccess(
  db: Db,
  userId: string,
  characterId: string,
): Promise<boolean> {
  const paid = await db
    .selectFrom("billing.character_purchases")
    .select(["id"])
    .where("user_id", "=", userId)
    .where("character_id", "=", characterId)
    .where("status", "=", "paid")
    .executeTakeFirst();

  return Boolean(paid);
}

export async function finalizeCharacterPurchase(
  db: Db,
  config: AppConfig,
  purchaseId: string,
  providerPaymentId: string,
  metadata: Record<string, unknown>,
): Promise<void> {
  const now = new Date();
  const availableAt = new Date(now);
  availableAt.setUTCDate(availableAt.getUTCDate() + config.CREATOR_EARNING_HOLD_DAYS);

  await db.transaction().execute(async (tx) => {
    const purchase = await tx
      .selectFrom("billing.character_purchases")
      .selectAll()
      .where("id", "=", purchaseId)
      .forUpdate()
      .executeTakeFirstOrThrow();

    if (purchase.status === "paid") {
      return;
    }

    await ensureCreatorWallet(tx, purchase.creator_user_id, purchase.currency);
    await tx
      .updateTable("billing.character_purchases")
      .set({
        status: "paid",
        provider_payment_id: providerPaymentId,
        metadata_json: { ...asRecord(purchase.metadata_json), ...metadata },
        updated_at: now,
      })
      .where("id", "=", purchase.id)
      .execute();

    await tx
      .insertInto("billing.creator_ledger_entries")
      .values([
        {
          creator_user_id: purchase.creator_user_id,
          character_id: purchase.character_id,
          source_user_id: purchase.user_id,
          entry_type: "sale_gross",
          amount_cents: purchase.amount_cents,
          currency: purchase.currency,
          status: "pending",
          available_at: availableAt,
          reference_type: "billing.character_purchase",
          reference_id: purchase.id,
          idempotency_key: `purchase:${purchase.id}:gross`,
          metadata_json: {},
        },
        {
          creator_user_id: purchase.creator_user_id,
          character_id: purchase.character_id,
          source_user_id: purchase.user_id,
          entry_type: "platform_fee",
          amount_cents: -purchase.platform_fee_cents,
          currency: purchase.currency,
          status: "pending",
          available_at: availableAt,
          reference_type: "billing.character_purchase",
          reference_id: purchase.id,
          idempotency_key: `purchase:${purchase.id}:fee`,
          metadata_json: { platformFeeBps: config.CREATOR_PLATFORM_FEE_BPS },
        },
      ])
      .onConflict((oc) => oc.column("idempotency_key").doNothing())
      .execute();

    await tx
      .insertInto("billing.creator_earnings")
      .values({
        creator_user_id: purchase.creator_user_id,
        character_id: purchase.character_id,
        source_user_id: purchase.user_id,
        amount_cents: purchase.creator_net_cents,
        currency: purchase.currency,
        platform_fee_cents: purchase.platform_fee_cents,
        status: "pending",
        available_at: availableAt,
      })
      .execute();

    await tx
      .updateTable("billing.creator_wallets")
      .set((eb) => ({
        pending_cents: eb("pending_cents", "+", purchase.creator_net_cents),
        lifetime_earned_cents: eb("lifetime_earned_cents", "+", purchase.creator_net_cents),
        lifetime_fee_cents: eb("lifetime_fee_cents", "+", purchase.platform_fee_cents),
        updated_at: now,
      }))
      .where("creator_user_id", "=", purchase.creator_user_id)
      .execute();

    await tx
      .updateTable("creator.characters")
      .set({
        marketplace_stats_json: sql`jsonb_set(
          coalesce(marketplace_stats_json, '{}'::jsonb),
          '{revenueCents}',
          to_jsonb(coalesce((marketplace_stats_json->>'revenueCents')::integer, 0) + ${purchase.amount_cents}),
          true
        )`,
        updated_at: now,
      })
      .where("id", "=", purchase.character_id)
      .execute();
  });
}

export async function releasePendingEarnings(db: Db, creatorUserId: string): Promise<void> {
  const now = new Date();

  await db.transaction().execute(async (tx) => {
    const due = await tx
      .selectFrom("billing.creator_ledger_entries")
      .select(["currency", sql<number>`coalesce(sum(amount_cents), 0)::integer`.as("amount_cents")])
      .where("creator_user_id", "=", creatorUserId)
      .where("status", "=", "pending")
      .where("available_at", "<=", now)
      .groupBy("currency")
      .execute();

    for (const item of due) {
      if (item.amount_cents === 0) {
        continue;
      }

      await tx
        .updateTable("billing.creator_wallets")
        .set((eb) => ({
          pending_cents: eb("pending_cents", "-", item.amount_cents),
          available_cents: eb("available_cents", "+", item.amount_cents),
          updated_at: now,
        }))
        .where("creator_user_id", "=", creatorUserId)
        .where("currency", "=", item.currency)
        .execute();
    }

    await tx
      .updateTable("billing.creator_ledger_entries")
      .set({ status: "available" })
      .where("creator_user_id", "=", creatorUserId)
      .where("status", "=", "pending")
      .where("available_at", "<=", now)
      .execute();

    await tx
      .updateTable("billing.creator_earnings")
      .set({ status: "available" })
      .where("creator_user_id", "=", creatorUserId)
      .where("status", "=", "pending")
      .where("available_at", "<=", now)
      .execute();
  });
}

async function releaseAllDueEarnings(db: Db): Promise<void> {
  const creators = await db
    .selectFrom("billing.creator_ledger_entries")
    .select("creator_user_id")
    .where("status", "=", "pending")
    .where("available_at", "<=", new Date())
    .groupBy("creator_user_id")
    .execute();

  for (const creator of creators) {
    await releasePendingEarnings(db, creator.creator_user_id);
  }
}

async function ensureCreatorWallet(db: Db, creatorUserId: string, currency: string): Promise<void> {
  await db
    .insertInto("billing.creator_wallets")
    .values({
      creator_user_id: creatorUserId,
      currency,
    })
    .onConflict((oc) => oc.column("creator_user_id").doNothing())
    .execute();
}

export interface PaidCharacterTrialStatus {
  limit: number;
  used: number;
  remaining: number;
}

export async function paidCharacterTrialStatus(
  db: Db,
  config: AppConfig,
  userId: string,
  characterId: string,
): Promise<PaidCharacterTrialStatus> {
  const limit = config.CREATOR_PAID_CHARACTER_TRIAL_MESSAGES;

  if (limit <= 0) {
    return { limit, used: 0, remaining: 0 };
  }

  const used = await completedUserTurnCount(db, {
    userId,
    characterId,
  });

  return {
    limit,
    used,
    remaining: Math.max(0, limit - used),
  };
}

function resolvePaymentProvider(provider: "stellar"): "stellar" {
  return provider;
}

function assertMonetizationEnabled(config: AppConfig): void {
  if (!config.MONETIZATION_ENABLED) {
    throw new DomainError("ENTITLEMENT_REQUIRED", "Creator monetization is coming soon.");
  }
}

function platformFee(amountCents: number, feeBps: number): number {
  return Math.floor((amountCents * feeBps) / 10_000);
}

function toWalletSummary(wallet: {
  currency: string;
  pending_cents: number;
  available_cents: number;
  lifetime_earned_cents: number;
  lifetime_fee_cents: number;
  lifetime_paid_cents: number;
  updated_at: Date;
}) {
  return {
    currency: wallet.currency,
    pendingCents: wallet.pending_cents,
    availableCents: wallet.available_cents,
    lifetimeEarnedCents: wallet.lifetime_earned_cents,
    lifetimeFeeCents: wallet.lifetime_fee_cents,
    lifetimePaidCents: wallet.lifetime_paid_cents,
    updatedAt: wallet.updated_at.toISOString(),
  };
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}
