import { loadConfig, type AppConfig } from "@hana/config";
import { createDatabase } from "@hana/database";
import {
  StartPhoneVerificationRequestSchema,
  VerifyPhoneRequestSchema,
  type PhoneNumberE164,
  type RiskAction,
} from "@hana/contracts";
import { DomainError } from "@hana/errors";
import {
  encryptPhoneNumber,
  hashPhoneNumber,
  shouldAllowLineType,
  type PhoneLineType,
} from "@hana/identity-core";
import { calculateRiskScore, type RiskSignals } from "@hana/risk-core";
import { Body, Controller, Headers, Post } from "@nestjs/common";
import { sql } from "kysely";
import { randomInt, randomUUID, timingSafeEqual } from "node:crypto";
import { auditEvent, createSessionToken, hmacHex, sha256Hex } from "./session";

@Controller("/v1/auth/phone")
export class IdentityController {
  private readonly config = loadConfig();
  private readonly db = createDatabase(this.config);

  @Post("/start")
  public async startVerification(
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
    bypass?: "admin_otp_bypass";
  }> {
    const input = StartPhoneVerificationRequestSchema.parse(body);

    if (this.isAdminBypassPhone(input.phoneNumber)) {
      return this.issueAdminBypassSession(input.phoneNumber, input.deviceId, userAgent);
    }

    const phonePrecheck = await precheckPhoneIdentity(this.config, input.phoneNumber);
    const phoneHash = phonePrecheck.phoneHash;
    const deviceIdHash = input.deviceId ? sha256Hex(input.deviceId) : null;
    const userAgentHash = userAgent ? sha256Hex(userAgent) : null;
    const ipAddressHash = hashClientIp(forwardedFor, realIp);

    await enforcePhoneVerificationRateLimits(this.db, {
      phoneHash,
      deviceIdHash,
      ipAddressHash,
    });

    const riskSignals = await buildAuthRiskSignals(this.db, {
      phoneHash,
      deviceId: input.deviceId,
      deviceIdHash,
      ipAddressHash,
      lineType: phonePrecheck.lineType,
    });
    const riskScore = await scoreAuthRiskWithBoundary(this.config, riskSignals);
    const riskAction = riskActionForPhoneStart(phonePrecheck.lineTypeDecision, riskScore.action);

    await persistRiskSession(this.db, {
      phoneHash,
      deviceIdHash,
      ipAddressHash,
      action: "auth.phone.start",
      riskScore: riskScore.score,
      riskAction,
      signals: riskSignals,
    });

    if (riskAction === "block") {
      await auditEvent(this.db, {
        action: "auth.phone.blocked",
        resourceType: "identity.phone_verification",
        metadata: {
          riskScore: riskScore.score,
          reasons: riskScore.reasons,
        },
      });
      throw new DomainError("AUTH_FORBIDDEN", "This phone number cannot be verified right now");
    }

    const encryptedPhoneNumber = encryptPhoneNumber(
      input.phoneNumber,
      this.config.PHONE_ENCRYPTION_KEY_BASE64,
    ).value;
    const localCode = this.config.NODE_ENV === "development" ? "000000" : randomOtpCode();
    const providerVerification = await startOtpChallenge({
      config: this.config,
      phoneNumber: input.phoneNumber,
      localCode,
    });
    const codeHash =
      providerVerification.provider === "twilio_verify"
        ? `twilio:${providerVerification.providerVerificationId}`
        : hmacHex(`${phoneHash}.${localCode}`, this.config.SESSION_SECRET);
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

    const verification = await this.db
      .insertInto("identity.phone_verifications")
      .values({
        phone_hash: phoneHash,
        encrypted_phone_number: encryptedPhoneNumber,
        country_code: inferCountryCode(input.phoneNumber),
        code_hash: codeHash,
        risk_action: riskAction,
        expires_at: expiresAt,
        device_id_hash: deviceIdHash,
        user_agent_hash: userAgentHash,
        ip_address_hash: ipAddressHash,
        provider: providerVerification.provider,
        provider_verification_id: providerVerification.providerVerificationId,
      })
      .returning(["id"])
      .executeTakeFirstOrThrow();

    await auditEvent(this.db, {
      action: "auth.phone.start",
      resourceType: "identity.phone_verification",
      resourceId: verification.id,
      metadata: { riskAction, riskScore: riskScore.score, riskReasons: riskScore.reasons },
    });

    return {
      verificationId: verification.id,
      riskAction,
      ...(this.config.NODE_ENV === "development" ? { devCode: localCode } : {}),
    };
  }

  @Post("/verify")
  public async verifyCode(
    @Body() body: unknown,
    @Headers("user-agent") userAgent?: string,
    @Headers("x-forwarded-for") forwardedFor?: string,
    @Headers("x-real-ip") realIp?: string,
  ): Promise<{
    verified: boolean;
    userId: string;
    sessionToken: string;
  }> {
    const input = VerifyPhoneRequestSchema.parse(body);
    const phoneHash = hashPhoneNumber(input.phoneNumber, this.config.PHONE_HASH_SECRET);
    const deviceIdHash = input.deviceId ? sha256Hex(input.deviceId) : null;
    const ipAddressHash = hashClientIp(forwardedFor, realIp);
    const codeHash = hmacHex(`${phoneHash}.${input.code}`, this.config.SESSION_SECRET);
    const verification = await this.db
      .selectFrom("identity.phone_verifications")
      .select([
        "id",
        "attempts",
        "code_hash",
        "encrypted_phone_number",
        "country_code",
        "device_id_hash",
        "provider",
      ])
      .where("phone_hash", "=", phoneHash)
      .where("expires_at", ">", new Date())
      .where("verified_at", "is", null)
      .orderBy("created_at", "desc")
      .executeTakeFirst();
    const deviceApproved =
      !verification?.device_id_hash || verification.device_id_hash === deviceIdHash;
    const codeApproved =
      verification && deviceApproved
        ? await verifyOtpChallenge({
            config: this.config,
            phoneNumber: input.phoneNumber,
            code: input.code,
            localCodeHash: codeHash,
            storedCodeHash: verification.code_hash,
            provider: verification.provider,
          })
        : false;

    if (!verification || verification.attempts >= 5 || !codeApproved) {
      if (verification) {
        await this.db
          .updateTable("identity.phone_verifications")
          .set({ attempts: verification.attempts + 1 })
          .where("id", "=", verification.id)
          .execute();
      }

      throw new DomainError("AUTH_FORBIDDEN", "Invalid or expired verification code");
    }

    const existingCredential = await this.db
      .selectFrom("identity.phone_credentials")
      .select(["user_id"])
      .where("phone_hash", "=", phoneHash)
      .executeTakeFirst();

    const userId =
      existingCredential?.user_id ??
      (
        await this.db
          .insertInto("identity.users")
          .values({ display_name: "Hana User", status: "active" })
          .returning(["id"])
          .executeTakeFirstOrThrow()
      ).id;

    if (!existingCredential) {
      await this.db
        .insertInto("identity.phone_credentials")
        .values({
          user_id: userId,
          phone_hash: phoneHash,
          encrypted_phone_number: verification.encrypted_phone_number,
          country_code: verification.country_code,
          line_type: "unknown",
          is_primary: true,
        })
        .execute();

      await this.db
        .insertInto("identity.user_settings")
        .values({
          user_id: userId,
          display_name: "Hana User",
        })
        .onConflict((oc) => oc.column("user_id").doNothing())
        .execute();
    }

    await this.db
      .updateTable("identity.phone_verifications")
      .set({ verified_at: new Date() })
      .where("id", "=", verification.id)
      .execute();

    const session = await this.issueSession(userId, input.deviceId, userAgent, ipAddressHash);

    await auditEvent(this.db, {
      actorUserId: userId,
      action: "auth.phone.verify",
      resourceType: "identity.session",
      resourceId: session.sessionId,
    });

    return {
      verified: true,
      userId,
      sessionToken: session.sessionToken,
    };
  }

  private isAdminBypassPhone(phoneNumber: string): boolean {
    const configuredPhoneNumber =
      this.config.NODE_ENV === "production"
        ? this.config.ADMIN_OTP_BYPASS_PHONE_NUMBER
        : (this.config.DEV_ADMIN_PHONE_NUMBER ?? this.config.ADMIN_OTP_BYPASS_PHONE_NUMBER);

    return Boolean(configuredPhoneNumber) && phoneNumber === configuredPhoneNumber;
  }

  private async issueAdminBypassSession(
    phoneNumber: PhoneNumberE164,
    deviceId: string | undefined,
    userAgent: string | undefined,
  ): Promise<{
    verified: true;
    userId: string;
    sessionToken: string;
    bypass: "admin_otp_bypass";
  }> {
    const phoneHash = hashPhoneNumber(phoneNumber, this.config.PHONE_HASH_SECRET);
    const existingCredential = await this.db
      .selectFrom("identity.phone_credentials")
      .select(["user_id"])
      .where("phone_hash", "=", phoneHash)
      .executeTakeFirst();
    const userId =
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
        .insertInto("identity.phone_credentials")
        .values({
          user_id: userId,
          phone_hash: phoneHash,
          encrypted_phone_number: encryptPhoneNumber(
            phoneNumber,
            this.config.PHONE_ENCRYPTION_KEY_BASE64,
          ).value,
          country_code: inferCountryCode(phoneNumber),
          line_type: "admin_otp_bypass",
          is_primary: true,
        })
        .execute();
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
    await this.ensureAdminBypassEntitlements(userId);

    const session = await this.issueSession(userId, deviceId, userAgent);

    await auditEvent(this.db, {
      actorUserId: userId,
      action: "auth.admin_otp_bypass",
      resourceType: "identity.session",
      resourceId: session.sessionId,
      metadata: { otpBypass: true, production: this.config.NODE_ENV === "production" },
    });

    return {
      verified: true,
      userId,
      sessionToken: session.sessionToken,
      bypass: "admin_otp_bypass",
    };
  }

  private async ensureAdminBypassEntitlements(userId: string): Promise<void> {
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
        voice_enabled: true,
      })
      .onConflict((oc) =>
        oc.column("user_id").doUpdateSet({
          display_name: "Hana Admin",
          adult_mode_enabled: true,
          adult_verified_at: now,
          memory_enabled: true,
          voice_enabled: true,
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
        provider: "admin_otp_bypass",
        provider_subscription_id: `admin_otp_bypass_${userId}`,
        status: "active",
        current_period_start: now,
        current_period_end: currentPeriodEnd,
        cancel_at_period_end: false,
      })
      .execute();
  }

  private async issueSession(
    userId: string,
    deviceId: string | undefined,
    userAgent: string | undefined,
    ipAddressHash?: string | null,
  ): Promise<{ sessionId: string; sessionToken: string }> {
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    const session = await this.db
      .insertInto("identity.sessions")
      .values({
        user_id: userId,
        token_hash: sha256Hex(`pending.${randomUUID()}`),
        device_id: deviceId ?? null,
        ip_address_hash: ipAddressHash ?? null,
        user_agent_hash: userAgent ? sha256Hex(userAgent) : null,
        expires_at: expiresAt,
      })
      .returning(["id"])
      .executeTakeFirstOrThrow();
    const sessionToken = createSessionToken(session.id, expiresAt, this.config.SESSION_SECRET);

    await this.db
      .updateTable("identity.sessions")
      .set({ token_hash: sha256Hex(sessionToken) })
      .where("id", "=", session.id)
      .execute();

    return {
      sessionId: session.id,
      sessionToken,
    };
  }
}

function randomOtpCode(): string {
  return String(randomInt(100_000, 1_000_000));
}

function inferCountryCode(phoneNumber: string): string {
  const match = phoneNumber.match(/^\+(\d{1,3})/);

  return match?.[1] ?? "unknown";
}

type HanaDb = ReturnType<typeof createDatabase>;
type PhoneVerificationRateColumn = "phone_hash" | "device_id_hash" | "ip_address_hash";

interface OtpChallenge {
  provider: "local" | "twilio_verify";
  providerVerificationId: string | null;
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

async function precheckPhoneIdentity(
  config: AppConfig,
  phoneNumber: PhoneNumberE164,
): Promise<{
  phoneHash: string;
  lineType: PhoneLineType;
  lineTypeDecision: "allow" | "challenge" | "block";
}> {
  try {
    const response = await fetchWithTimeout(
      `${config.IDENTITY_SERVICE_URL.replace(/\/+$/, "")}/internal/identity/phone/risk-precheck`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phoneNumber }),
      },
      1_000,
    );

    if (response.ok) {
      const payload = (await response.json()) as Record<string, unknown>;
      const lineType = parsePhoneLineType(payload["lineType"]) ?? "unknown";
      const lineTypeDecision = parseLineTypeDecision(payload["lineTypeDecision"]);

      if (typeof payload["phoneHash"] === "string" && lineTypeDecision) {
        return {
          phoneHash: payload["phoneHash"],
          lineType,
          lineTypeDecision,
        };
      }
    }
  } catch {
    // Identity normalization/risk-precheck is a private boundary; the gateway keeps a safe fallback.
  }

  return {
    phoneHash: hashPhoneNumber(phoneNumber, config.PHONE_HASH_SECRET),
    lineType: "unknown",
    lineTypeDecision: shouldAllowLineType("unknown"),
  };
}

async function buildAuthRiskSignals(
  db: HanaDb,
  input: {
    phoneHash: string;
    deviceId: string | undefined;
    deviceIdHash: string | null;
    ipAddressHash: string | null;
    lineType: PhoneLineType;
  },
): Promise<RiskSignals> {
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
  const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const [
    otpRequestsLastHour,
    failedOtpAttemptsLastHour,
    accountsOnPhone,
    devicesOnPhone,
    accountsOnDevice,
    phonesOnDevice,
    accountsOnIpLastDay,
    otpRequestsOnIpLastHour,
  ] = await Promise.all([
    recentVerificationCount(db, "phone_hash", input.phoneHash, oneHourAgo),
    failedVerificationCount(db, "phone_hash", input.phoneHash, oneHourAgo),
    countRows(db, "identity.phone_credentials", "phone_hash", input.phoneHash),
    input.deviceIdHash
      ? countDistinctByFilter(db, "identity.phone_verifications", "device_id_hash", {
          column: "phone_hash",
          value: input.phoneHash,
          since: oneDayAgo,
        })
      : Promise.resolve(0),
    input.deviceId
      ? countDistinctByFilter(db, "identity.sessions", "user_id", {
          column: "device_id",
          value: input.deviceId,
          since: oneDayAgo,
        })
      : Promise.resolve(0),
    input.deviceIdHash
      ? countDistinctByFilter(db, "identity.phone_verifications", "phone_hash", {
          column: "device_id_hash",
          value: input.deviceIdHash,
          since: oneDayAgo,
        })
      : Promise.resolve(0),
    input.ipAddressHash
      ? countDistinctByFilter(db, "identity.sessions", "user_id", {
          column: "ip_address_hash",
          value: input.ipAddressHash,
          since: oneDayAgo,
        })
      : Promise.resolve(0),
    input.ipAddressHash
      ? recentVerificationCount(db, "ip_address_hash", input.ipAddressHash, oneHourAgo)
      : Promise.resolve(0),
  ]);

  return {
    phone: {
      lineType: input.lineType,
      otpRequestsLastHour,
      failedOtpAttemptsLastHour,
      accountsOnPhone,
      devicesOnPhone,
      simSwapRisk: "unknown",
    },
    device: {
      accountsOnDevice,
      phonesOnDevice,
      isEmulator: false,
      isRootedOrJailbroken: false,
      automationSuspected: false,
    },
    network: {
      accountsOnIpLastDay,
      otpRequestsOnIpLastHour,
      isDatacenter: false,
      isVpnOrProxy: false,
      countryMismatch: false,
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
      suspiciousClusterSize: Math.max(accountsOnPhone, accountsOnDevice, phonesOnDevice),
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
          reasons: payload["reasons"].filter((reason): reason is string => typeof reason === "string"),
        };
      }
    }
  } catch {
    // Risk service is the preferred boundary; risk-core is linked for resilient auth.
  }

  return calculateRiskScore(signals);
}

async function persistRiskSession(
  db: HanaDb,
  input: {
    phoneHash: string;
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
      phone_hash: input.phoneHash,
      device_id: input.deviceIdHash,
      ip_address_hash: input.ipAddressHash ?? "unknown",
      action: input.action,
      risk_score: input.riskScore,
      action_taken: input.riskAction,
      signals_json: input.signals,
    })
    .execute();
}

function riskActionForPhoneStart(
  lineTypeDecision: "allow" | "challenge" | "block",
  scoredAction: RiskAction,
): RiskAction {
  if (lineTypeDecision === "block" || scoredAction === "block") {
    return "block";
  }

  if (scoredAction === "manual_review" || scoredAction === "step_up" || scoredAction === "cooldown") {
    return scoredAction;
  }

  if (lineTypeDecision === "challenge" && scoredAction === "allow") {
    return "allow_with_limits";
  }

  return scoredAction;
}

async function enforcePhoneVerificationRateLimits(
  db: HanaDb,
  input: {
    phoneHash: string;
    deviceIdHash: string | null;
    ipAddressHash: string | null;
  },
): Promise<void> {
  const now = Date.now();
  const fifteenMinutesAgo = new Date(now - 15 * 60 * 1000);
  const oneDayAgo = new Date(now - 24 * 60 * 60 * 1000);

  await assertRecentVerificationLimit(db, {
    column: "phone_hash",
    value: input.phoneHash,
    since: fifteenMinutesAgo,
    limit: 3,
    reason: "phone_otp_short_window",
  });
  await assertRecentVerificationLimit(db, {
    column: "phone_hash",
    value: input.phoneHash,
    since: oneDayAgo,
    limit: 10,
    reason: "phone_otp_daily_window",
  });

  if (input.deviceIdHash) {
    await assertRecentVerificationLimit(db, {
      column: "device_id_hash",
      value: input.deviceIdHash,
      since: fifteenMinutesAgo,
      limit: 5,
      reason: "device_otp_short_window",
    });
    await assertRecentVerificationLimit(db, {
      column: "device_id_hash",
      value: input.deviceIdHash,
      since: oneDayAgo,
      limit: 20,
      reason: "device_otp_daily_window",
    });
  }

  if (input.ipAddressHash) {
    await assertRecentVerificationLimit(db, {
      column: "ip_address_hash",
      value: input.ipAddressHash,
      since: fifteenMinutesAgo,
      limit: 20,
      reason: "ip_otp_short_window",
    });
    await assertRecentVerificationLimit(db, {
      column: "ip_address_hash",
      value: input.ipAddressHash,
      since: oneDayAgo,
      limit: 100,
      reason: "ip_otp_daily_window",
    });
  }
}

async function assertRecentVerificationLimit(
  db: HanaDb,
  input: {
    column: PhoneVerificationRateColumn;
    value: string;
    since: Date;
    limit: number;
    reason: string;
  },
): Promise<void> {
  const count = await recentVerificationCount(db, input.column, input.value, input.since);

  if (count >= input.limit) {
    throw new DomainError("RATE_LIMITED", "Too many verification attempts. Try again later.", {
      reason: input.reason,
      limit: input.limit,
    });
  }
}

async function recentVerificationCount(
  db: HanaDb,
  column: PhoneVerificationRateColumn,
  value: string,
  since: Date,
): Promise<number> {
  const result = await db
    .selectFrom("identity.phone_verifications")
    .select((eb) => eb.fn.countAll<number>().as("count"))
    .where(column, "=", value)
    .where("created_at", ">=", since)
    .executeTakeFirst();

  return Number(result?.count ?? 0);
}

async function failedVerificationCount(
  db: HanaDb,
  column: PhoneVerificationRateColumn,
  value: string,
  since: Date,
): Promise<number> {
  const result = await db
    .selectFrom("identity.phone_verifications")
    .select((eb) => eb.fn.countAll<number>().as("count"))
    .where(column, "=", value)
    .where("created_at", ">=", since)
    .where("attempts", ">", 0)
    .executeTakeFirst();

  return Number(result?.count ?? 0);
}

async function countRows(
  db: HanaDb,
  table: "identity.phone_credentials",
  column: "phone_hash",
  value: string,
): Promise<number> {
  const result = await db
    .selectFrom(table)
    .select((eb) => eb.fn.countAll<number>().as("count"))
    .where(column, "=", value)
    .executeTakeFirst();

  return Number(result?.count ?? 0);
}

async function countDistinctByFilter(
  db: HanaDb,
  table: "identity.phone_verifications" | "identity.sessions",
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

async function startOtpChallenge(input: {
  config: AppConfig;
  phoneNumber: PhoneNumberE164;
  localCode: string;
}): Promise<OtpChallenge> {
  if (input.config.NODE_ENV !== "production") {
    void input.localCode;

    return { provider: "local", providerVerificationId: null };
  }

  const payload = await twilioVerifyRequest(input.config, "Verifications", {
    To: input.phoneNumber,
    Channel: "sms",
  });
  const verificationId = typeof payload["sid"] === "string" ? payload["sid"] : null;

  if (!verificationId) {
    throw new DomainError("INTERNAL", "OTP provider returned an invalid verification response");
  }

  return {
    provider: "twilio_verify",
    providerVerificationId: verificationId,
  };
}

async function verifyOtpChallenge(input: {
  config: AppConfig;
  phoneNumber: PhoneNumberE164;
  code: string;
  localCodeHash: string;
  storedCodeHash: string;
  provider: string;
}): Promise<boolean> {
  if (input.provider === "twilio_verify") {
    const payload = await twilioVerifyRequest(input.config, "VerificationCheck", {
      To: input.phoneNumber,
      Code: input.code,
    });

    return payload["status"] === "approved";
  }

  return constantTimeEqual(input.localCodeHash, input.storedCodeHash);
}

async function twilioVerifyRequest(
  config: AppConfig,
  path: "Verifications" | "VerificationCheck",
  form: Record<string, string>,
): Promise<Record<string, unknown>> {
  if (
    !config.TWILIO_ACCOUNT_SID ||
    !config.TWILIO_AUTH_TOKEN ||
    !config.TWILIO_VERIFY_SERVICE_SID
  ) {
    throw new DomainError("INTERNAL", "Twilio Verify is not configured");
  }

  const response = await fetch(
    `https://verify.twilio.com/v2/Services/${encodeURIComponent(
      config.TWILIO_VERIFY_SERVICE_SID,
    )}/${path}`,
    {
      method: "POST",
      headers: {
        Authorization: `Basic ${Buffer.from(
          `${config.TWILIO_ACCOUNT_SID}:${config.TWILIO_AUTH_TOKEN}`,
        ).toString("base64")}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams(form),
    },
  );

  if (!response.ok) {
    throw new DomainError("INTERNAL", "OTP provider request failed", {
      status: response.status,
    });
  }

  return (await response.json()) as Record<string, unknown>;
}

function constantTimeEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);

  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

function parsePhoneLineType(value: unknown): PhoneLineType | null {
  return value === "mobile" ||
    value === "landline" ||
    value === "fixed_voip" ||
    value === "non_fixed_voip" ||
    value === "toll_free" ||
    value === "unknown"
    ? value
    : null;
}

function parseLineTypeDecision(value: unknown): "allow" | "challenge" | "block" | null {
  return value === "allow" || value === "challenge" || value === "block" ? value : null;
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
