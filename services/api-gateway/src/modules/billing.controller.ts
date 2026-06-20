import { loadConfig } from "@hana/config";
import { CheckoutPlanRequestSchema, VerifyCryptoPaymentRequestSchema } from "@hana/contracts";
import { createDatabase } from "@hana/database";
import { DomainError } from "@hana/errors";
import { Body, Controller, Get, Headers, Post } from "@nestjs/common";
import { createCryptoPaymentIntent, verifyCryptoPaymentIntent } from "./crypto-payments";
import { auditEvent, requireSession } from "./session";

@Controller("/v1/billing")
export class BillingController {
  private readonly config = loadConfig();
  private readonly db = createDatabase(this.config);

  @Get("/plans")
  public async plans(@Headers("authorization") authorization?: string) {
    const session = await requireSession(this.db, this.config, authorization);
    const [plans, subscription] = await Promise.all([
      this.db
        .selectFrom("billing.plans")
        .selectAll()
        .where("is_active", "=", true)
        .orderBy("monthly_price_cents", "asc")
        .execute(),
      currentSubscription(this.db, session.userId),
    ]);

    return {
      monetizationEnabled: this.config.MONETIZATION_ENABLED,
      comingSoon: !this.config.MONETIZATION_ENABLED,
      paymentsProvider: this.config.OG_PAYMENTS_ENABLED ? "crypto" : "disabled",
      plans: plans.map((plan) => ({
        id: plan.id,
        name: plan.name,
        monthlyPriceCents: plan.monthly_price_cents,
        currency: plan.currency,
        monthlyMessageLimit: plan.monthly_message_limit,
        deepMemoryEnabled: plan.deep_memory_enabled,
        adultModeEnabled: plan.adult_mode_enabled,
        creatorPaidCharactersEnabled: plan.creator_paid_characters_enabled,
        comingSoon: !this.config.MONETIZATION_ENABLED && plan.id !== "free",
      })),
      subscription,
    };
  }

  @Post("/checkout")
  public async checkout(@Body() body: unknown, @Headers("authorization") authorization?: string) {
    const session = await requireSession(this.db, this.config, authorization);
    const input = CheckoutPlanRequestSchema.parse(body);

    if (!this.config.MONETIZATION_ENABLED) {
      throw new DomainError("ENTITLEMENT_REQUIRED", "Paid plans are coming soon.");
    }

    const plan = await this.db
      .selectFrom("billing.plans")
      .selectAll()
      .where("id", "=", input.planId)
      .where("is_active", "=", true)
      .executeTakeFirstOrThrow();
    const subscription = await currentSubscription(this.db, session.userId);

    if (subscription.planId === input.planId && subscription.currentPeriodEnd) {
      throw new DomainError("CONFLICT", "This plan is already active", {
        planId: input.planId,
      });
    }

    if (input.provider === "mock") {
      if (this.config.NODE_ENV === "production") {
        throw new DomainError("AUTH_FORBIDDEN", "Mock checkout is disabled in production");
      }

      const order = await this.db
        .insertInto("billing.payment_orders")
        .values({
          user_id: session.userId,
          plan_id: input.planId,
          provider: "mock",
          provider_order_id: null,
          amount_cents: plan.monthly_price_cents,
          currency: plan.currency,
          status: "paid",
          checkout_url: null,
          metadata_json: { activatedBy: "mock_checkout" },
        })
        .returning(["id"])
        .executeTakeFirstOrThrow();

      await activateSubscription({
        db: this.db,
        userId: session.userId,
        planId: input.planId,
        provider: "mock",
        providerSubscriptionId: `mock_${order.id}`,
      });

      await auditEvent(this.db, {
        actorUserId: session.userId,
        action: "billing.checkout.mock",
        resourceType: "billing.payment_order",
        resourceId: order.id,
        metadata: { planId: input.planId },
      });

      return {
        provider: "mock",
        internalOrderId: order.id,
        activated: true,
        planId: input.planId,
      };
    }

    const internalOrder = await this.db
      .insertInto("billing.payment_orders")
      .values({
        user_id: session.userId,
        plan_id: input.planId,
        provider: "crypto",
        provider_order_id: null,
        amount_cents: plan.monthly_price_cents,
        currency: plan.currency,
        status: "created",
        checkout_url: null,
        metadata_json: {},
      })
      .returning(["id"])
      .executeTakeFirstOrThrow();
    const payment = await createCryptoPaymentIntent({
      db: this.db,
      config: this.config,
      buyerUserId: session.userId,
      purpose: `subscription:${internalOrder.id}`,
      amountCents: plan.monthly_price_cents,
      currency: plan.currency,
      metadata: {
        type: "subscription",
        internalOrderId: internalOrder.id,
        planId: input.planId,
      },
    });

    await this.db
      .updateTable("billing.payment_orders")
      .set({
        provider_order_id: payment.id,
        metadata_json: {
          cryptoPaymentId: payment.id,
          providerReference: payment.providerReference,
        },
        updated_at: new Date(),
      })
      .where("id", "=", internalOrder.id)
      .execute();

    await auditEvent(this.db, {
      actorUserId: session.userId,
      action: "billing.checkout.crypto",
      resourceType: "billing.payment_order",
      resourceId: internalOrder.id,
      metadata: { planId: input.planId, cryptoPaymentId: payment.id },
    });

    return {
      provider: "crypto",
      internalOrderId: internalOrder.id,
      payment,
      plan: {
        id: plan.id,
        name: plan.name,
        monthlyPriceCents: plan.monthly_price_cents,
        currency: plan.currency,
      },
    };
  }

  @Post("/crypto/verify")
  public async verifyCryptoPayment(
    @Body() body: unknown,
    @Headers("authorization") authorization?: string,
  ) {
    const session = await requireSession(this.db, this.config, authorization);
    const input = VerifyCryptoPaymentRequestSchema.parse(body);
    const verification = await verifyCryptoPaymentIntent({
      db: this.db,
      config: this.config,
      buyerUserId: session.userId,
      paymentId: input.paymentId,
      txHash: input.txHash,
      walletAddress: input.walletAddress,
      expectedPurposePrefix: "subscription:",
    });
    const payment = await this.db
      .selectFrom("billing.crypto_payments")
      .select(["id", "metadata_json"])
      .where("id", "=", input.paymentId)
      .where("buyer_user_id", "=", session.userId)
      .executeTakeFirstOrThrow();
    const metadata = asRecord(payment.metadata_json);
    const internalOrderId =
      typeof metadata["internalOrderId"] === "string" ? metadata["internalOrderId"] : null;

    if (!internalOrderId) {
      throw new DomainError("INTERNAL", "Crypto payment is missing subscription metadata");
    }

    const order = await this.db
      .selectFrom("billing.payment_orders")
      .selectAll()
      .where("id", "=", internalOrderId)
      .where("user_id", "=", session.userId)
      .executeTakeFirst();

    if (!order || order.provider !== "crypto" || order.provider_order_id !== input.paymentId) {
      throw new DomainError("RESOURCE_NOT_FOUND", "Payment order not found");
    }

    if (verification.status === "pending") {
      await this.db
        .updateTable("billing.payment_orders")
        .set({ status: "created", updated_at: new Date() })
        .where("id", "=", order.id)
        .where("status", "!=", "paid")
        .execute();

      return {
        ok: false,
        status: "pending",
        confirmationCount: verification.confirmationCount,
        requiredConfirmations: verification.requiredConfirmations,
        paymentId: input.paymentId,
      };
    }

    if (order.status !== "paid") {
      await this.db
        .updateTable("billing.payment_orders")
        .set({
          status: "paid",
          metadata_json: {
            ...asRecord(order.metadata_json),
            cryptoPaymentId: input.paymentId,
            txHash: verification.txHash,
            walletAddress: verification.walletAddress,
          },
          updated_at: new Date(),
        })
        .where("id", "=", order.id)
        .execute();

      await activateSubscription({
        db: this.db,
        userId: session.userId,
        planId: order.plan_id,
        provider: "crypto",
        providerSubscriptionId: verification.txHash,
      });

      await auditEvent(this.db, {
        actorUserId: session.userId,
        action: "billing.payment.crypto.verified",
        resourceType: "billing.payment_order",
        resourceId: order.id,
        metadata: {
          provider: "crypto",
          planId: order.plan_id,
          txHash: verification.txHash,
          walletAddress: verification.walletAddress,
        },
      });
    }

    return {
      ok: true,
      status: "finalized",
      planId: order.plan_id,
      paymentId: input.paymentId,
      txHash: verification.txHash,
    };
  }
}

async function currentSubscription(db: ReturnType<typeof createDatabase>, userId: string) {
  const subscription = await db
    .selectFrom("billing.subscriptions")
    .select(["id", "plan_id", "provider", "status", "current_period_end"])
    .where("user_id", "=", userId)
    .where("status", "in", ["active", "trialing"])
    .where("current_period_end", ">", new Date())
    .orderBy("current_period_end", "desc")
    .executeTakeFirst();

  if (!subscription) {
    return {
      id: null,
      planId: "free",
      provider: "system",
      status: "active",
      currentPeriodEnd: null,
    };
  }

  return {
    id: subscription.id,
    planId: subscription.plan_id,
    provider: subscription.provider,
    status: subscription.status,
    currentPeriodEnd: subscription.current_period_end.toISOString(),
  };
}

async function activateSubscription(input: {
  db: ReturnType<typeof createDatabase>;
  userId: string;
  planId: "plus" | "ultra";
  provider: string;
  providerSubscriptionId: string;
}): Promise<void> {
  const now = new Date();
  const currentPeriodEnd = new Date(now);
  currentPeriodEnd.setUTCMonth(currentPeriodEnd.getUTCMonth() + 1);

  await input.db.transaction().execute(async (tx) => {
    await tx
      .updateTable("billing.subscriptions")
      .set({ status: "canceled", updated_at: now })
      .where("user_id", "=", input.userId)
      .where("status", "in", ["active", "trialing"])
      .execute();

    await tx
      .insertInto("billing.subscriptions")
      .values({
        user_id: input.userId,
        plan_id: input.planId,
        provider: input.provider,
        provider_subscription_id: input.providerSubscriptionId,
        status: "active",
        current_period_start: now,
        current_period_end: currentPeriodEnd,
        cancel_at_period_end: false,
      })
      .execute();
  });
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}
