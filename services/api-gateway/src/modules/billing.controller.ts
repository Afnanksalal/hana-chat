import { loadConfig } from "@hana/config";
import {
  CheckoutPlanRequestSchema,
  RazorpayWebhookRequestSchema,
  VerifyRazorpayPaymentRequestSchema,
} from "@hana/contracts";
import { createDatabase } from "@hana/database";
import { DomainError } from "@hana/errors";
import { Body, Controller, Get, Headers, Post, Req } from "@nestjs/common";
import { createHmac, timingSafeEqual } from "node:crypto";
import { finalizeCharacterPurchase } from "./monetization.controller";
import { auditEvent, hmacHex, requireSession } from "./session";

type RawRequest = {
  rawBody?: Buffer;
};

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

    if (input.provider === "mock" && this.config.NODE_ENV === "production") {
      throw new DomainError("AUTH_FORBIDDEN", "Mock checkout is disabled in production");
    }

    if (
      input.provider === "mock" ||
      (!this.config.RAZORPAY_KEY_ID &&
        !this.config.RAZORPAY_KEY_SECRET &&
        this.config.NODE_ENV !== "production")
    ) {
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

    if (!this.config.RAZORPAY_KEY_ID || !this.config.RAZORPAY_KEY_SECRET) {
      throw new DomainError("INTERNAL", "Razorpay is not configured");
    }

    const internalOrder = await this.db
      .insertInto("billing.payment_orders")
      .values({
        user_id: session.userId,
        plan_id: input.planId,
        provider: "razorpay",
        provider_order_id: null,
        amount_cents: plan.monthly_price_cents,
        currency: plan.currency,
        status: "created",
        checkout_url: null,
        metadata_json: {},
      })
      .returning(["id"])
      .executeTakeFirstOrThrow();
    const razorpayOrder = await createRazorpayOrder({
      keyId: this.config.RAZORPAY_KEY_ID,
      keySecret: this.config.RAZORPAY_KEY_SECRET,
      amount: plan.monthly_price_cents,
      currency: plan.currency,
      receipt: internalOrder.id,
      notes: {
        internalOrderId: internalOrder.id,
        planId: input.planId,
        userId: session.userId,
      },
    });

    await this.db
      .updateTable("billing.payment_orders")
      .set({
        provider_order_id: razorpayOrder.id,
        metadata_json: razorpayOrder,
        updated_at: new Date(),
      })
      .where("id", "=", internalOrder.id)
      .execute();

    await auditEvent(this.db, {
      actorUserId: session.userId,
      action: "billing.checkout.razorpay",
      resourceType: "billing.payment_order",
      resourceId: internalOrder.id,
      metadata: { planId: input.planId, razorpayOrderId: razorpayOrder.id },
    });

    return {
      provider: "razorpay",
      internalOrderId: internalOrder.id,
      keyId: this.config.RAZORPAY_KEY_ID,
      order: {
        id: razorpayOrder.id,
        amount: razorpayOrder.amount,
        currency: razorpayOrder.currency,
      },
      plan: {
        id: plan.id,
        name: plan.name,
        monthlyPriceCents: plan.monthly_price_cents,
        currency: plan.currency,
      },
    };
  }

  @Post("/razorpay/verify")
  public async verifyRazorpayPayment(
    @Body() body: unknown,
    @Headers("authorization") authorization?: string,
  ) {
    const session = await requireSession(this.db, this.config, authorization);
    const input = VerifyRazorpayPaymentRequestSchema.parse(body);

    if (!this.config.RAZORPAY_KEY_SECRET) {
      throw new DomainError("INTERNAL", "Razorpay is not configured");
    }

    const order = await this.db
      .selectFrom("billing.payment_orders")
      .selectAll()
      .where("id", "=", input.internalOrderId)
      .where("user_id", "=", session.userId)
      .executeTakeFirst();

    if (!order || order.provider_order_id !== input.razorpayOrderId) {
      throw new DomainError("RESOURCE_NOT_FOUND", "Payment order not found");
    }

    const expected = hmacHex(
      `${order.provider_order_id}|${input.razorpayPaymentId}`,
      this.config.RAZORPAY_KEY_SECRET,
    );

    if (!safeEqual(expected, input.razorpaySignature)) {
      throw new DomainError("AUTH_FORBIDDEN", "Payment signature verification failed");
    }

    await this.db
      .updateTable("billing.payment_orders")
      .set({
        status: "paid",
        metadata_json: {
          ...(typeof order.metadata_json === "object" && order.metadata_json
            ? order.metadata_json
            : {}),
          razorpayPaymentId: input.razorpayPaymentId,
        },
        updated_at: new Date(),
      })
      .where("id", "=", order.id)
      .execute();

    await activateSubscription({
      db: this.db,
      userId: session.userId,
      planId: order.plan_id,
      provider: "razorpay",
      providerSubscriptionId: input.razorpayPaymentId,
    });

    await auditEvent(this.db, {
      actorUserId: session.userId,
      action: "billing.payment.verified",
      resourceType: "billing.payment_order",
      resourceId: order.id,
      metadata: { provider: "razorpay", planId: order.plan_id },
    });

    return { ok: true, planId: order.plan_id };
  }

  @Post("/webhooks/razorpay")
  public async razorpayWebhook(
    @Body() body: unknown,
    @Headers("x-razorpay-signature") signature?: string,
    @Headers("x-razorpay-event-id") eventId?: string,
    @Req() request?: RawRequest,
  ) {
    const rawBody = request?.rawBody?.toString("utf8") ?? JSON.stringify(body);

    if (!this.config.RAZORPAY_WEBHOOK_SECRET) {
      throw new DomainError("INTERNAL", "Razorpay webhook secret is not configured");
    }

    const expected = createHmac("sha256", this.config.RAZORPAY_WEBHOOK_SECRET)
      .update(rawBody)
      .digest("hex");

    if (!signature || !safeEqual(expected, signature)) {
      throw new DomainError("AUTH_FORBIDDEN", "Invalid Razorpay webhook signature");
    }

    const event = RazorpayWebhookRequestSchema.parse(body);
    const providerEventId = eventId ?? hmacHex(rawBody, this.config.RAZORPAY_WEBHOOK_SECRET);
    const webhookEvent = await this.db
      .insertInto("billing.webhook_events")
      .values({
        provider: "razorpay",
        provider_event_id: providerEventId,
        event_type: event.event,
        payload_json: event,
      })
      .onConflict((oc) => oc.columns(["provider", "provider_event_id"]).doNothing())
      .returning(["id"])
      .executeTakeFirst();

    if (!webhookEvent) {
      return { ok: true, duplicate: true, eventId: providerEventId };
    }

    const providerOrderId =
      nestedString(event.payload, ["payment", "entity", "order_id"]) ??
      nestedString(event.payload, ["order", "entity", "id"]);
    const providerPaymentId =
      nestedString(event.payload, ["payment", "entity", "id"]) ??
      nestedString(event.payload, ["order", "entity", "id"]);

    if (!providerOrderId) {
      await markWebhookProcessed(this.db, webhookEvent.id);
      return { ok: true, ignored: true };
    }

    const order = await this.db
      .selectFrom("billing.payment_orders")
      .selectAll()
      .where("provider", "=", "razorpay")
      .where("provider_order_id", "=", providerOrderId)
      .executeTakeFirst();

    if (!order) {
      const purchase = await this.db
        .selectFrom("billing.character_purchases")
        .selectAll()
        .where("provider", "=", "razorpay")
        .where("provider_order_id", "=", providerOrderId)
        .executeTakeFirst();

      if (!purchase || purchase.status === "paid") {
        await markWebhookProcessed(this.db, webhookEvent.id);
        return { ok: true, duplicate: Boolean(purchase), eventId: providerEventId };
      }

      if (event.event === "payment.captured" || event.event === "order.paid") {
        assertWebhookPaymentMatchesOrder(event, {
          amount_cents: purchase.amount_cents,
          currency: purchase.currency,
        });

        await finalizeCharacterPurchase(
          this.db,
          this.config,
          purchase.id,
          providerPaymentId ?? providerOrderId,
          { webhook: event, providerEventId },
        );
      }

      await markWebhookProcessed(this.db, webhookEvent.id);
      return { ok: true, purchaseId: purchase.id };
    }

    if (order.status === "paid") {
      await markWebhookProcessed(this.db, webhookEvent.id);
      return { ok: true, duplicate: Boolean(order), eventId: providerEventId };
    }

    if (event.event === "payment.captured" || event.event === "order.paid") {
      assertWebhookPaymentMatchesOrder(event, order);

      await this.db
        .updateTable("billing.payment_orders")
        .set({
          status: "paid",
          metadata_json: { eventId, webhook: event, providerPaymentId },
          updated_at: new Date(),
        })
        .where("id", "=", order.id)
        .execute();

      await activateSubscription({
        db: this.db,
        userId: order.user_id,
        planId: order.plan_id,
        provider: "razorpay",
        providerSubscriptionId: providerPaymentId ?? providerOrderId,
      });
    }

    await markWebhookProcessed(this.db, webhookEvent.id);

    return { ok: true };
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

async function createRazorpayOrder(input: {
  keyId: string;
  keySecret: string;
  amount: number;
  currency: string;
  receipt: string;
  notes: Record<string, string>;
}): Promise<{ id: string; amount: number; currency: string; status: string }> {
  const response = await fetch("https://api.razorpay.com/v1/orders", {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${input.keyId}:${input.keySecret}`).toString("base64")}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      amount: input.amount,
      currency: input.currency,
      receipt: input.receipt,
      notes: input.notes,
    }),
  });

  if (!response.ok) {
    throw new DomainError("INTERNAL", "Razorpay order creation failed", {
      status: response.status,
    });
  }

  const payload = (await response.json()) as {
    id?: string;
    amount?: number;
    currency?: string;
    status?: string;
  };

  if (!payload.id || typeof payload.amount !== "number" || !payload.currency) {
    throw new DomainError("INTERNAL", "Razorpay returned an invalid order payload");
  }

  return {
    id: payload.id,
    amount: payload.amount,
    currency: payload.currency,
    status: payload.status ?? "created",
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

async function markWebhookProcessed(
  db: ReturnType<typeof createDatabase>,
  webhookEventId: string,
): Promise<void> {
  await db
    .updateTable("billing.webhook_events")
    .set({ processed_at: new Date() })
    .where("id", "=", webhookEventId)
    .execute();
}

function assertWebhookPaymentMatchesOrder(
  event: { event: string; payload: Record<string, unknown> },
  order: {
    amount_cents: number;
    currency: string;
  },
): void {
  const amount =
    nestedNumber(event.payload, ["payment", "entity", "amount"]) ??
    nestedNumber(event.payload, ["order", "entity", "amount_paid"]);
  const currency =
    nestedString(event.payload, ["payment", "entity", "currency"]) ??
    nestedString(event.payload, ["order", "entity", "currency"]);
  const paymentStatus =
    nestedString(event.payload, ["payment", "entity", "status"]) ??
    nestedString(event.payload, ["order", "entity", "status"]);

  if (typeof amount === "number" && amount !== order.amount_cents) {
    throw new DomainError("AUTH_FORBIDDEN", "Webhook amount does not match the order");
  }

  if (currency && currency.toUpperCase() !== order.currency.toUpperCase()) {
    throw new DomainError("AUTH_FORBIDDEN", "Webhook currency does not match the order");
  }

  if (
    event.event === "payment.captured" &&
    paymentStatus &&
    paymentStatus.toLowerCase() !== "captured"
  ) {
    throw new DomainError("AUTH_FORBIDDEN", "Webhook payment is not captured");
  }
}

function nestedString(value: unknown, path: string[]): string | undefined {
  let current: unknown = value;

  for (const key of path) {
    if (!current || typeof current !== "object" || !(key in current)) {
      return undefined;
    }

    current = (current as Record<string, unknown>)[key];
  }

  return typeof current === "string" ? current : undefined;
}

function nestedNumber(value: unknown, path: string[]): number | undefined {
  let current: unknown = value;

  for (const key of path) {
    if (!current || typeof current !== "object" || !(key in current)) {
      return undefined;
    }

    current = (current as Record<string, unknown>)[key];
  }

  return typeof current === "number" ? current : undefined;
}

function safeEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);

  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}
