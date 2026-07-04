import { loadConfig, type AppConfig } from "@hana/config";
import {
  StartEmailAuthRequestSchema,
  VerifyEmailAuthRequestSchema,
  type RiskAction,
} from "@hana/contracts";
import { createDatabase, type HanaDatabase } from "@hana/database";
import { DomainError } from "@hana/errors";
import {
  emailDomain,
  encryptEmailAddress,
  hashEmailAddress,
  normalizeEmailAddress,
} from "@hana/identity-core";
import { calculateRiskScore, type RiskSignals } from "@hana/risk-core";
import { Body, Controller, Headers, Post } from "@nestjs/common";
import { sql, type Kysely, type Transaction } from "kysely";
import nodemailer, { type Transporter } from "nodemailer";
import type SMTPPool from "nodemailer/lib/smtp-pool";
import { randomInt, randomUUID, timingSafeEqual } from "node:crypto";
import { auditEvent, createSessionToken, hmacHex, sha256Hex } from "./session";

type Db = Kysely<HanaDatabase>;
type Tx = Transaction<HanaDatabase>;
type DbExecutor = Db | Tx;
type EmailVerificationRateColumn = "email_hash" | "device_id_hash" | "ip_address_hash";
type EmailDeliveryProvider = "local" | "smtp" | "sendgrid";

let pooledMailer: Transporter<SMTPPool.SentMessageInfo> | null = null;

@Controller("/v1/auth/email")
export class EmailAuthController {
  private readonly config = loadConfig();
  private readonly db = createDatabase(this.config);

  @Post("/start")
  public async start(
    @Body() body: unknown,
    @Headers("user-agent") userAgent?: string,
    @Headers("x-forwarded-for") forwardedFor?: string,
    @Headers("x-real-ip") realIp?: string,
  ): Promise<{
    verificationId?: string;
    riskAction?: RiskAction;
    devCode?: string;
    verified?: boolean;
    userId?: string;
    sessionToken?: string;
  }> {
    const input = StartEmailAuthRequestSchema.parse(body);
    const email = normalizeEmailAddress(input.email);
    const emailHash = hashEmailAddress(email, this.config.EMAIL_HASH_SECRET);
    const deviceIdHash = input.deviceId ? sha256Hex(input.deviceId) : null;
    const userAgentHash = userAgent ? sha256Hex(userAgent) : null;
    const ipAddressHash = hashClientIp(forwardedFor, realIp);
    const configuredAdminEmail = this.isConfiguredAdminEmail(email);
    const configuredSmokeEmail = this.isConfiguredSmokeEmail(email);
    const staticSmokeCode = this.staticSmokeOtpFor(email);

    if (!staticSmokeCode) {
      await enforceEmailVerificationRateLimits(this.db, {
        emailHash,
        deviceIdHash,
        ipAddressHash,
      });
    }

    if (configuredAdminEmail) {
      await this.ensureConfiguredAdminAccount(email);
    }

    const existingCredential = await this.db
      .selectFrom("identity.email_credentials")
      .select(["user_id"])
      .where("email_hash", "=", emailHash)
      .executeTakeFirst();

    if (input.mode === "signup") {
      if (existingCredential) {
        throw new DomainError(
          "CONFLICT",
          "An account already exists for this email. Sign in instead.",
        );
      }

      if (!configuredSmokeEmail) {
        await assertAccountCreationSignalsAvailable(this.db, this.config, {
          ipAddressHash,
          deviceIdHash,
        });
      }
    }

    if (input.mode === "signin" && !existingCredential) {
      throw new DomainError(
        "RESOURCE_NOT_FOUND",
        "No account exists for this email yet. Create one first.",
      );
    }

    const riskSignals = await buildEmailAuthRiskSignals(this.db, {
      emailHash,
      deviceIdHash,
      ipAddressHash,
    });
    const riskScore = await scoreAuthRiskWithBoundary(this.config, riskSignals);
    const riskAction = riskScore.action;

    await persistRiskSession(this.db, {
      emailHash,
      deviceIdHash,
      ipAddressHash,
      action: "auth.email.start",
      riskScore: riskScore.score,
      riskAction,
      signals: riskSignals,
    });

    assertStartRiskAllowed(riskAction, riskScore.reasons);

    const verificationId = randomUUID();
    const localCode = staticSmokeCode ?? randomNumericCode(this.config.AUTH_EMAIL_CODE_LENGTH);
    const codeHash = hmacHex(
      `${emailHash}.${verificationId}.${localCode}`,
      this.config.SESSION_SECRET,
    );
    const expiresAt = new Date(Date.now() + this.config.AUTH_EMAIL_CODE_TTL_MINUTES * 60 * 1000);
    const encryptedEmail = encryptEmailAddress(
      email,
      this.config.EMAIL_ENCRYPTION_KEY_BASE64,
    ).value;
    const delivery = staticSmokeCode
      ? { provider: "local" as const, messageId: null }
      : await sendEmailCode({
          config: this.config,
          to: email,
          code: localCode,
          mode: input.mode,
        });

    await this.db
      .insertInto("identity.email_verifications")
      .values({
        id: verificationId,
        email_hash: emailHash,
        encrypted_email: encryptedEmail,
        email_domain: emailDomain(email),
        username: input.mode === "signup" ? (input.username ?? null) : null,
        code_hash: codeHash,
        purpose: input.mode,
        risk_action: riskAction,
        expires_at: expiresAt,
        device_id_hash: deviceIdHash,
        user_agent_hash: userAgentHash,
        ip_address_hash: ipAddressHash,
        provider: delivery.provider,
        provider_message_id: delivery.messageId,
      })
      .execute();

    await auditEvent(this.db, {
      action: "auth.email.start",
      resourceType: "identity.email_verification",
      resourceId: verificationId,
      metadata: {
        mode: input.mode,
        emailDomain: emailDomain(email),
        provider: delivery.provider,
        configuredAdminEmail,
        smokeStaticOtp: Boolean(staticSmokeCode),
        riskAction,
        riskScore: riskScore.score,
        riskReasons: riskScore.reasons,
      },
    });

    return {
      verificationId,
      riskAction,
      ...(this.config.NODE_ENV === "production" ? {} : { devCode: localCode }),
    };
  }

  @Post("/verify")
  public async verify(
    @Body() body: unknown,
    @Headers("user-agent") userAgent?: string,
    @Headers("x-forwarded-for") forwardedFor?: string,
    @Headers("x-real-ip") realIp?: string,
  ): Promise<{
    verified: boolean;
    userId: string;
    sessionToken: string;
  }> {
    const input = VerifyEmailAuthRequestSchema.parse(body);
    const email = normalizeEmailAddress(input.email);
    const emailHash = hashEmailAddress(email, this.config.EMAIL_HASH_SECRET);
    const deviceIdHash = input.deviceId ? sha256Hex(input.deviceId) : null;
    const ipAddressHash = hashClientIp(forwardedFor, realIp);
    const configuredAdminEmail = this.isConfiguredAdminEmail(email);
    const configuredSmokeEmail = this.isConfiguredSmokeEmail(email);
    const verification = await findPendingEmailVerification(this.db, {
      emailHash,
      ...(input.verificationId ? { verificationId: input.verificationId } : {}),
    });

    if (!verification) {
      throw new DomainError("AUTH_FORBIDDEN", "Invalid or expired verification code");
    }

    const codeHash = hmacHex(
      `${emailHash}.${verification.id}.${input.code}`,
      this.config.SESSION_SECRET,
    );
    const deviceApproved =
      !verification.device_id_hash || verification.device_id_hash === deviceIdHash;
    const codeApproved =
      deviceApproved &&
      verification.attempts < this.config.AUTH_MAX_EMAIL_CODE_ATTEMPTS &&
      constantTimeEqual(codeHash, verification.code_hash);

    if (!codeApproved) {
      await this.db
        .updateTable("identity.email_verifications")
        .set({ attempts: verification.attempts + 1 })
        .where("id", "=", verification.id)
        .execute();

      throw new DomainError("AUTH_FORBIDDEN", "Invalid or expired verification code");
    }

    const userId = await completeEmailAuth(this.db, this.config, {
      verification,
      emailHash,
      email,
      ipAddressHash,
      deviceIdHash,
      skipAccountSignalClaims: configuredAdminEmail || configuredSmokeEmail,
    });
    if (configuredAdminEmail) {
      await this.ensureConfiguredAdminAccount(email, userId);
    }

    const session = await issueSession(this.db, this.config, {
      userId,
      deviceId: input.deviceId,
      userAgent,
      ipAddressHash,
    });

    await auditEvent(this.db, {
      actorUserId: userId,
      action: "auth.email.verify",
      resourceType: "identity.session",
      resourceId: session.sessionId,
      metadata: { mode: verification.purpose, emailDomain: emailDomain(email) },
    });

    return {
      verified: true,
      userId,
      sessionToken: session.sessionToken,
    };
  }

  private isConfiguredAdminEmail(email: ReturnType<typeof normalizeEmailAddress>): boolean {
    return Boolean(this.config.ADMIN_EMAIL) && email === this.config.ADMIN_EMAIL;
  }

  private isConfiguredSmokeEmail(email: ReturnType<typeof normalizeEmailAddress>): boolean {
    return (
      Boolean(this.config.SMOKE_EMAIL_DOMAIN && this.config.SMOKE_STATIC_OTP) &&
      emailDomain(email) === this.config.SMOKE_EMAIL_DOMAIN
    );
  }

  private staticSmokeOtpFor(email: ReturnType<typeof normalizeEmailAddress>): string | undefined {
    return this.isConfiguredSmokeEmail(email) ? this.config.SMOKE_STATIC_OTP : undefined;
  }

  private async ensureConfiguredAdminAccount(
    email: ReturnType<typeof normalizeEmailAddress>,
    preferredUserId?: string,
  ): Promise<string> {
    const emailHash = hashEmailAddress(email, this.config.EMAIL_HASH_SECRET);
    const existingCredential = await this.db
      .selectFrom("identity.email_credentials")
      .select(["user_id"])
      .where("email_hash", "=", emailHash)
      .executeTakeFirst();
    const userId =
      preferredUserId ??
      existingCredential?.user_id ??
      (
        await this.db
          .insertInto("identity.users")
          .values({ display_name: "Hana Admin", status: "active" })
          .returning(["id"])
          .executeTakeFirstOrThrow()
      ).id;

    if (!existingCredential) {
      await this.db
        .insertInto("identity.email_credentials")
        .values({
          user_id: userId,
          email_hash: emailHash,
          encrypted_email: encryptEmailAddress(email, this.config.EMAIL_ENCRYPTION_KEY_BASE64)
            .value,
          email_domain: emailDomain(email),
          is_primary: true,
        })
        .execute();
    }

    if (preferredUserId && existingCredential && existingCredential.user_id !== preferredUserId) {
      throw new DomainError(
        "CONFLICT",
        "Configured admin email is already linked to another account",
      );
    }

    await this.db
      .updateTable("identity.users")
      .set({ status: "active", updated_at: new Date() })
      .where("id", "=", userId)
      .execute();
    await this.db
      .insertInto("identity.user_roles")
      .values({
        user_id: userId,
        role: "admin",
        granted_by: userId,
      })
      .onConflict((oc) => oc.columns(["user_id", "role"]).doNothing())
      .execute();
    await this.ensureConfiguredAdminEntitlements(userId);

    await auditEvent(this.db, {
      actorUserId: userId,
      action: "auth.admin_email.ensure",
      resourceType: "identity.user",
      resourceId: userId,
      metadata: {
        emailDomain: emailDomain(email),
        source: "configured_admin_email",
      },
    });

    return userId;
  }

  private async ensureConfiguredAdminEntitlements(userId: string): Promise<void> {
    const now = new Date();
    const currentPeriodEnd = new Date(now);
    currentPeriodEnd.setUTCFullYear(currentPeriodEnd.getUTCFullYear() + 1);

    await this.db
      .insertInto("identity.user_settings")
      .values({
        user_id: userId,
        display_name: "Hana Admin",
        adult_mode_enabled: true,
        adult_verified_at: now,
        memory_enabled: true,
      })
      .onConflict((oc) =>
        oc.column("user_id").doUpdateSet({
          adult_mode_enabled: true,
          adult_verified_at: now,
          memory_enabled: true,
          updated_at: now,
        }),
      )
      .execute();

    const activeUltra = await this.db
      .selectFrom("billing.subscriptions")
      .select(["id"])
      .where("user_id", "=", userId)
      .where("plan_id", "=", "ultra")
      .where("status", "in", ["active", "trialing"])
      .where("current_period_end", ">", now)
      .executeTakeFirst();

    if (activeUltra) {
      return;
    }

    await this.db
      .updateTable("billing.subscriptions")
      .set({ status: "canceled", updated_at: now })
      .where("user_id", "=", userId)
      .where("status", "in", ["active", "trialing"])
      .execute();
    await this.db
      .insertInto("billing.subscriptions")
      .values({
        user_id: userId,
        plan_id: "ultra",
        provider: "configured_admin_email",
        provider_subscription_id: `configured_admin_email_${userId}`,
        status: "active",
        current_period_start: now,
        current_period_end: currentPeriodEnd,
        cancel_at_period_end: false,
      })
      .execute();
  }
}

async function findPendingEmailVerification(
  db: Db,
  input: { emailHash: string; verificationId?: string },
) {
  let query = db
    .selectFrom("identity.email_verifications")
    .selectAll()
    .where("email_hash", "=", input.emailHash)
    .where("expires_at", ">", new Date())
    .where("verified_at", "is", null);

  if (input.verificationId) {
    query = query.where("id", "=", input.verificationId);
  }

  return query.orderBy("created_at", "desc").executeTakeFirst();
}

async function completeEmailAuth(
  db: Db,
  config: AppConfig,
  input: {
    verification: NonNullable<Awaited<ReturnType<typeof findPendingEmailVerification>>>;
    emailHash: string;
    email: ReturnType<typeof normalizeEmailAddress>;
    ipAddressHash: string | null;
    deviceIdHash: string | null;
    skipAccountSignalClaims?: boolean;
  },
): Promise<string> {
  return db.transaction().execute(async (tx) => {
    const existingCredential = await tx
      .selectFrom("identity.email_credentials")
      .select(["user_id"])
      .where("email_hash", "=", input.emailHash)
      .executeTakeFirst();

    if (input.verification.purpose === "signin" && !existingCredential) {
      throw new DomainError(
        "RESOURCE_NOT_FOUND",
        "No account exists for this email yet. Create one first.",
      );
    }

    if (existingCredential) {
      if (!input.skipAccountSignalClaims) {
        await assertAccountSignalsAvailableForUser(tx, config, {
          userId: existingCredential.user_id,
          ipAddressHash: input.ipAddressHash,
          deviceIdHash: input.deviceIdHash,
        });
        await claimAccountSignals(tx, config, {
          userId: existingCredential.user_id,
          ipAddressHash: input.ipAddressHash,
          deviceIdHash: input.deviceIdHash,
        });
      }
      await markVerificationUsed(tx, input.verification.id);

      return existingCredential.user_id;
    }

    if (!input.verification.username) {
      throw new DomainError("VALIDATION_FAILED", "Username is required to create an account");
    }

    if (!input.skipAccountSignalClaims) {
      await assertAccountCreationSignalsAvailable(tx, config, {
        ipAddressHash: input.ipAddressHash,
        deviceIdHash: input.deviceIdHash,
      });
    }

    const user = await tx
      .insertInto("identity.users")
      .values({ display_name: input.verification.username, status: "active" })
      .returning(["id"])
      .executeTakeFirstOrThrow();

    await tx
      .insertInto("identity.email_credentials")
      .values({
        user_id: user.id,
        email_hash: input.emailHash,
        encrypted_email: input.verification.encrypted_email,
        email_domain: emailDomain(input.email),
        is_primary: true,
      })
      .execute();
    await tx
      .insertInto("identity.user_settings")
      .values({
        user_id: user.id,
        display_name: input.verification.username,
      })
      .onConflict((oc) => oc.column("user_id").doNothing())
      .execute();
    if (!input.skipAccountSignalClaims) {
      await claimAccountSignals(tx, config, {
        userId: user.id,
        ipAddressHash: input.ipAddressHash,
        deviceIdHash: input.deviceIdHash,
      });
    }
    await markVerificationUsed(tx, input.verification.id);

    return user.id;
  });
}

async function markVerificationUsed(db: DbExecutor, verificationId: string): Promise<void> {
  await db
    .updateTable("identity.email_verifications")
    .set({ verified_at: new Date() })
    .where("id", "=", verificationId)
    .execute();
}

async function issueSession(
  db: Db,
  config: AppConfig,
  input: {
    userId: string;
    deviceId: string | undefined;
    userAgent: string | undefined;
    ipAddressHash: string | null;
  },
): Promise<{ sessionId: string; sessionToken: string }> {
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
  const session = await db
    .insertInto("identity.sessions")
    .values({
      user_id: input.userId,
      token_hash: sha256Hex(`pending.${randomUUID()}`),
      device_id: input.deviceId ?? null,
      ip_address_hash: input.ipAddressHash,
      user_agent_hash: input.userAgent ? sha256Hex(input.userAgent) : null,
      expires_at: expiresAt,
    })
    .returning(["id"])
    .executeTakeFirstOrThrow();
  const sessionToken = createSessionToken(session.id, expiresAt, config.SESSION_SECRET);

  await db
    .updateTable("identity.sessions")
    .set({ token_hash: sha256Hex(sessionToken) })
    .where("id", "=", session.id)
    .execute();

  return {
    sessionId: session.id,
    sessionToken,
  };
}

async function assertAccountCreationSignalsAvailable(
  db: DbExecutor,
  config: AppConfig,
  input: { ipAddressHash: string | null; deviceIdHash: string | null },
): Promise<void> {
  if (config.AUTH_ONE_ACCOUNT_PER_IP && input.ipAddressHash) {
    const claim = await db
      .selectFrom("identity.account_ip_claims")
      .select(["user_id"])
      .where("ip_address_hash", "=", input.ipAddressHash)
      .executeTakeFirst();

    if (claim) {
      throw new DomainError("AUTH_FORBIDDEN", "This network already has an account.");
    }
  }

  if (config.AUTH_ONE_ACCOUNT_PER_DEVICE && input.deviceIdHash) {
    const claim = await db
      .selectFrom("identity.account_device_claims")
      .select(["user_id"])
      .where("device_id_hash", "=", input.deviceIdHash)
      .executeTakeFirst();

    if (claim) {
      throw new DomainError("AUTH_FORBIDDEN", "This device already has an account.");
    }
  }
}

async function assertAccountSignalsAvailableForUser(
  db: DbExecutor,
  config: AppConfig,
  input: { userId: string; ipAddressHash: string | null; deviceIdHash: string | null },
): Promise<void> {
  if (config.AUTH_ONE_ACCOUNT_PER_IP && input.ipAddressHash) {
    const claim = await db
      .selectFrom("identity.account_ip_claims")
      .select(["user_id"])
      .where("ip_address_hash", "=", input.ipAddressHash)
      .executeTakeFirst();

    if (claim && claim.user_id !== input.userId) {
      throw new DomainError("AUTH_FORBIDDEN", "This network is linked to another account.");
    }
  }

  if (config.AUTH_ONE_ACCOUNT_PER_DEVICE && input.deviceIdHash) {
    const claim = await db
      .selectFrom("identity.account_device_claims")
      .select(["user_id"])
      .where("device_id_hash", "=", input.deviceIdHash)
      .executeTakeFirst();

    if (claim && claim.user_id !== input.userId) {
      throw new DomainError("AUTH_FORBIDDEN", "This device is linked to another account.");
    }
  }
}

async function claimAccountSignals(
  db: DbExecutor,
  config: AppConfig,
  input: { userId: string; ipAddressHash: string | null; deviceIdHash: string | null },
): Promise<void> {
  const now = new Date();

  if (config.AUTH_ONE_ACCOUNT_PER_IP && input.ipAddressHash) {
    await db
      .insertInto("identity.account_ip_claims")
      .values({
        ip_address_hash: input.ipAddressHash,
        user_id: input.userId,
        last_seen_at: now,
      })
      .onConflict((oc) =>
        oc.column("ip_address_hash").doUpdateSet({
          last_seen_at: now,
        }),
      )
      .execute();
  }

  if (config.AUTH_ONE_ACCOUNT_PER_DEVICE && input.deviceIdHash) {
    await db
      .insertInto("identity.account_device_claims")
      .values({
        device_id_hash: input.deviceIdHash,
        user_id: input.userId,
        last_seen_at: now,
      })
      .onConflict((oc) =>
        oc.column("device_id_hash").doUpdateSet({
          last_seen_at: now,
        }),
      )
      .execute();
  }
}

async function enforceEmailVerificationRateLimits(
  db: Db,
  input: {
    emailHash: string;
    deviceIdHash: string | null;
    ipAddressHash: string | null;
  },
): Promise<void> {
  const now = Date.now();
  const fifteenMinutesAgo = new Date(now - 15 * 60 * 1000);
  const oneDayAgo = new Date(now - 24 * 60 * 60 * 1000);

  await assertRecentEmailVerificationLimit(db, {
    column: "email_hash",
    value: input.emailHash,
    since: fifteenMinutesAgo,
    limit: 3,
    reason: "email_code_short_window",
  });
  await assertRecentEmailVerificationLimit(db, {
    column: "email_hash",
    value: input.emailHash,
    since: oneDayAgo,
    limit: 10,
    reason: "email_code_daily_window",
  });

  if (input.deviceIdHash) {
    await assertRecentEmailVerificationLimit(db, {
      column: "device_id_hash",
      value: input.deviceIdHash,
      since: fifteenMinutesAgo,
      limit: 5,
      reason: "device_email_code_short_window",
    });
    await assertRecentEmailVerificationLimit(db, {
      column: "device_id_hash",
      value: input.deviceIdHash,
      since: oneDayAgo,
      limit: 30,
      reason: "device_email_code_daily_window",
    });
  }

  if (input.ipAddressHash) {
    await assertRecentEmailVerificationLimit(db, {
      column: "ip_address_hash",
      value: input.ipAddressHash,
      since: fifteenMinutesAgo,
      limit: 10,
      reason: "ip_email_code_short_window",
    });
    await assertRecentEmailVerificationLimit(db, {
      column: "ip_address_hash",
      value: input.ipAddressHash,
      since: oneDayAgo,
      limit: 50,
      reason: "ip_email_code_daily_window",
    });
  }
}

async function assertRecentEmailVerificationLimit(
  db: Db,
  input: {
    column: EmailVerificationRateColumn;
    value: string;
    since: Date;
    limit: number;
    reason: string;
  },
): Promise<void> {
  const count = await recentEmailVerificationCount(db, input.column, input.value, input.since);

  if (count >= input.limit) {
    throw new DomainError("RATE_LIMITED", "Too many verification attempts. Try again later.", {
      reason: input.reason,
      limit: input.limit,
    });
  }
}

async function recentEmailVerificationCount(
  db: Db,
  column: EmailVerificationRateColumn,
  value: string,
  since: Date,
): Promise<number> {
  const result = await db
    .selectFrom("identity.email_verifications")
    .select((eb) => eb.fn.countAll<number>().as("count"))
    .where(column, "=", value)
    .where("created_at", ">=", since)
    .executeTakeFirst();

  return Number(result?.count ?? 0);
}

async function failedEmailVerificationCount(
  db: Db,
  column: EmailVerificationRateColumn,
  value: string,
  since: Date,
): Promise<number> {
  const result = await db
    .selectFrom("identity.email_verifications")
    .select((eb) => eb.fn.countAll<number>().as("count"))
    .where(column, "=", value)
    .where("created_at", ">=", since)
    .where("attempts", ">", 0)
    .executeTakeFirst();

  return Number(result?.count ?? 0);
}

async function buildEmailAuthRiskSignals(
  db: Db,
  input: {
    emailHash: string;
    deviceIdHash: string | null;
    ipAddressHash: string | null;
  },
): Promise<RiskSignals> {
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
  const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const [
    codeRequestsLastHour,
    failedCodeAttemptsLastHour,
    accountsOnEmail,
    accountsOnDevice,
    emailsOnDevice,
    accountsOnIpLastDay,
    codeRequestsOnIpLastHour,
  ] = await Promise.all([
    recentEmailVerificationCount(db, "email_hash", input.emailHash, oneHourAgo),
    failedEmailVerificationCount(db, "email_hash", input.emailHash, oneHourAgo),
    countEmailCredentials(db, input.emailHash),
    input.deviceIdHash ? countDeviceClaims(db, input.deviceIdHash) : Promise.resolve(0),
    input.deviceIdHash
      ? countDistinctByFilter(db, "identity.email_verifications", "email_hash", {
          column: "device_id_hash",
          value: input.deviceIdHash,
          since: oneDayAgo,
        })
      : Promise.resolve(0),
    input.ipAddressHash ? countIpClaims(db, input.ipAddressHash) : Promise.resolve(0),
    input.ipAddressHash
      ? recentEmailVerificationCount(db, "ip_address_hash", input.ipAddressHash, oneHourAgo)
      : Promise.resolve(0),
  ]);

  return {
    identity: {
      credentialType: "email",
      verificationRequestsLastHour: codeRequestsLastHour,
      failedVerificationAttemptsLastHour: failedCodeAttemptsLastHour,
      accountsOnCredential: accountsOnEmail,
      devicesOnCredential: emailsOnDevice,
      highRiskCredential: false,
    },
    device: {
      accountsOnDevice,
      credentialsOnDevice: emailsOnDevice,
      isEmulator: false,
      isRootedOrJailbroken: false,
      automationSuspected: false,
    },
    network: {
      accountsOnIpLastDay,
      verificationRequestsOnIpLastHour: codeRequestsOnIpLastHour,
      isDatacenter: false,
      isVpnOrProxy: false,
    },
    behavior: {
      freeQuotaExhaustionsLastWeek: 0,
      duplicatePromptRate: 0,
      reportRate: 0,
    },
    payment: {
      accountsOnPaymentMethod: 0,
      chargebackCount: 0,
    },
    graph: {
      suspiciousClusterSize: Math.max(accountsOnEmail, accountsOnDevice, emailsOnDevice),
      referralClusterRisk: 0,
    },
  };
}

async function scoreAuthRiskWithBoundary(
  config: AppConfig,
  signals: RiskSignals,
): Promise<{ score: number; action: RiskAction; reasons: string[] }> {
  try {
    const response = await fetchWithTimeout(
      `${config.RISK_SERVICE_URL.replace(/\/+$/, "")}/internal/risk/score`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(signals),
      },
      1_000,
    );

    if (response.ok) {
      const payload = (await response.json()) as Record<string, unknown>;
      const action = parseRiskAction(payload["action"]);

      if (typeof payload["score"] === "number" && action && Array.isArray(payload["reasons"])) {
        return {
          score: payload["score"],
          action,
          reasons: payload["reasons"].filter(
            (reason): reason is string => typeof reason === "string",
          ),
        };
      }
    }
  } catch {
    // Risk service is preferred; risk-core keeps auth resilient during private-service restarts.
  }

  return calculateRiskScore(signals);
}

async function persistRiskSession(
  db: Db,
  input: {
    emailHash: string;
    deviceIdHash: string | null;
    ipAddressHash: string | null;
    action: string;
    riskScore: number;
    riskAction: RiskAction;
    signals: RiskSignals;
  },
): Promise<void> {
  await db
    .insertInto("identity.risk_sessions")
    .values({
      user_id: null,
      phone_hash: null,
      email_hash: input.emailHash,
      device_id: input.deviceIdHash,
      ip_address_hash: input.ipAddressHash ?? "unknown",
      action: input.action,
      risk_score: input.riskScore,
      action_taken: input.riskAction,
      signals_json: input.signals,
    })
    .execute();
}

async function sendEmailCode(input: {
  config: AppConfig;
  to: ReturnType<typeof normalizeEmailAddress>;
  code: string;
  mode: "signup" | "signin";
}): Promise<{ provider: EmailDeliveryProvider; messageId: string | null }> {
  if (input.config.EMAIL_PROVIDER === "local") {
    if (input.config.NODE_ENV === "production") {
      throw new DomainError("INTERNAL", "Email delivery is not configured");
    }

    return { provider: "local", messageId: null };
  }

  const message = buildVerificationEmailMessage(input);

  if (input.config.EMAIL_PROVIDER === "sendgrid") {
    return sendGridEmailCode(input.config, input.to, message);
  }

  if (!input.config.SMTP_HOST) {
    if (input.config.NODE_ENV === "production") {
      throw new DomainError("INTERNAL", "Email delivery is not configured");
    }

    return { provider: "local", messageId: null };
  }

  const info = await getMailer(input.config).sendMail({
    from: input.config.SMTP_FROM,
    to: input.to,
    subject: message.subject,
    text: message.text,
    html: message.html,
  });

  return {
    provider: "smtp",
    messageId: typeof info.messageId === "string" ? info.messageId : null,
  };
}

function getMailer(config: AppConfig): Transporter<SMTPPool.SentMessageInfo> {
  if (pooledMailer) {
    return pooledMailer;
  }

  const auth = config.SMTP_USER
    ? {
        user: config.SMTP_USER,
        pass: config.SMTP_PASSWORD ?? "",
      }
    : undefined;

  pooledMailer = nodemailer.createTransport({
    host: config.SMTP_HOST,
    port: config.SMTP_PORT,
    secure: config.SMTP_SECURE,
    ignoreTLS: config.SMTP_IGNORE_TLS,
    tls: {
      rejectUnauthorized: config.SMTP_TLS_REJECT_UNAUTHORIZED,
    },
    pool: true,
    maxConnections: config.SMTP_POOL_MAX_CONNECTIONS,
    maxMessages: config.SMTP_POOL_MAX_MESSAGES,
    ...(auth ? { auth } : {}),
  });

  return pooledMailer;
}

function buildVerificationEmailMessage(input: {
  config: AppConfig;
  code: string;
  mode: "signup" | "signin";
}): { subject: string; text: string; html: string } {
  const ttlMinutes = input.config.AUTH_EMAIL_CODE_TTL_MINUTES;

  return {
    subject:
      input.mode === "signup" ? "Confirm your Hana Chat account" : "Your Hana Chat sign-in code",
    text: `Your Hana Chat verification code is ${input.code}. It expires in ${ttlMinutes} minutes.`,
    html: verificationEmailHtml(input.code, ttlMinutes),
  };
}

async function sendGridEmailCode(
  config: AppConfig,
  to: ReturnType<typeof normalizeEmailAddress>,
  message: { subject: string; text: string; html: string },
): Promise<{ provider: "sendgrid"; messageId: string | null }> {
  if (!config.SENDGRID_API_KEY) {
    throw new DomainError("INTERNAL", "SendGrid delivery is not configured");
  }

  const response = await fetchWithTimeout(
    `${config.SENDGRID_API_BASE_URL.replace(/\/+$/, "")}/v3/mail/send`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.SENDGRID_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        personalizations: [{ to: [{ email: to }] }],
        from: parseEmailSender(config.SENDGRID_FROM),
        subject: message.subject,
        content: [
          { type: "text/plain", value: message.text },
          { type: "text/html", value: message.html },
        ],
        categories: ["auth", "email-otp"],
      }),
    },
    5_000,
  );

  if (response.status !== 202) {
    const details = await response.text().catch(() => "");

    throw new DomainError("INTERNAL", "SendGrid email delivery failed", {
      status: response.status,
      details: details.slice(0, 500),
    });
  }

  return {
    provider: "sendgrid",
    messageId: response.headers.get("x-message-id"),
  };
}

function parseEmailSender(value: string): { email: string; name?: string } {
  const match = value.match(/^\s*(?:"?([^"<]*)"?\s*)?<([^<>@\s]+@[^<>@\s]+)>\s*$/);

  if (!match) {
    return { email: value.trim() };
  }

  const name = match[1]?.trim();

  const email = match[2];

  if (!email) {
    return { email: value.trim() };
  }

  return {
    email,
    ...(name ? { name } : {}),
  };
}

function verificationEmailHtml(code: string, ttlMinutes: number): string {
  return `<!doctype html>
<html>
  <body style="margin:0;background:#050507;color:#ffffff;font-family:Arial,sans-serif;">
    <main style="max-width:520px;margin:0 auto;padding:32px 20px;">
      <h1 style="font-size:24px;line-height:1.2;margin:0 0 16px;">Hana Chat</h1>
      <p style="font-size:16px;line-height:1.5;color:#f4d7e5;">Use this code to continue:</p>
      <p style="font-size:34px;font-weight:800;letter-spacing:6px;color:#ff1f7a;margin:20px 0;">${code}</p>
      <p style="font-size:14px;line-height:1.5;color:#bda8b2;">This code expires in ${ttlMinutes} minutes. If you did not request it, you can ignore this email.</p>
    </main>
  </body>
</html>`;
}

function assertStartRiskAllowed(action: RiskAction, reasons: string[]): void {
  if (action === "block" || action === "manual_review") {
    throw new DomainError("AUTH_FORBIDDEN", "This sign-in cannot continue right now", { reasons });
  }

  if (action === "cooldown") {
    throw new DomainError("RATE_LIMITED", "Too many verification attempts. Try again later.", {
      reasons,
    });
  }
}

function randomNumericCode(length: number): string {
  const min = 10 ** (length - 1);
  const max = 10 ** length;

  return String(randomInt(min, max));
}

function hashClientIp(forwardedFor?: string, realIp?: string): string | null {
  const candidate =
    forwardedFor
      ?.split(",")
      .map((value) => value.trim())
      .find(Boolean) ??
    realIp?.trim() ??
    null;

  return candidate ? sha256Hex(candidate) : null;
}

async function countEmailCredentials(db: Db, emailHash: string): Promise<number> {
  const result = await db
    .selectFrom("identity.email_credentials")
    .select((eb) => eb.fn.countAll<number>().as("count"))
    .where("email_hash", "=", emailHash)
    .executeTakeFirst();

  return Number(result?.count ?? 0);
}

async function countDeviceClaims(db: Db, deviceIdHash: string): Promise<number> {
  const result = await db
    .selectFrom("identity.account_device_claims")
    .select((eb) => eb.fn.countAll<number>().as("count"))
    .where("device_id_hash", "=", deviceIdHash)
    .executeTakeFirst();

  return Number(result?.count ?? 0);
}

async function countIpClaims(db: Db, ipAddressHash: string): Promise<number> {
  const result = await db
    .selectFrom("identity.account_ip_claims")
    .select((eb) => eb.fn.countAll<number>().as("count"))
    .where("ip_address_hash", "=", ipAddressHash)
    .executeTakeFirst();

  return Number(result?.count ?? 0);
}

async function countDistinctByFilter(
  db: Db,
  table: "identity.email_verifications" | "identity.sessions",
  distinctColumn: string,
  filter: { column: string; value: string; since: Date },
): Promise<number> {
  const result = await db
    .selectFrom(table)
    .select(sql<number>`count(distinct ${sql.ref(distinctColumn)})`.as("count"))
    .where(sql.ref(filter.column), "=", filter.value)
    .where("created_at", ">=", filter.since)
    .executeTakeFirst();

  return Number(result?.count ?? 0);
}

function constantTimeEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);

  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

function parseRiskAction(value: unknown): RiskAction | null {
  return value === "allow" ||
    value === "allow_with_limits" ||
    value === "step_up" ||
    value === "cooldown" ||
    value === "block" ||
    value === "manual_review"
    ? value
    : null;
}

async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs: number,
): Promise<Response> {
  const abortController = new AbortController();
  const timeout = setTimeout(() => abortController.abort(), timeoutMs);

  return fetch(url, { ...init, signal: abortController.signal }).finally(() =>
    clearTimeout(timeout),
  );
}
