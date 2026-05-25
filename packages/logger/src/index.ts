import pino, { type LoggerOptions } from "pino";

export interface CreateLoggerOptions {
  service: string;
  level?: string;
  extra?: Record<string, unknown>;
}

export function createLogger(options: CreateLoggerOptions) {
  const loggerOptions: LoggerOptions = {
    level: options.level ?? process.env["LOG_LEVEL"] ?? "info",
    base: {
      service: options.service,
      ...options.extra,
    },
    redact: {
      paths: [
        "phoneNumber",
        "encryptedPhoneNumber",
        "email",
        "encryptedEmail",
        "code",
        "sessionToken",
        "token",
        "cookie",
        "headers.cookie",
        "authorization",
        "headers.authorization",
        "RAZORPAY_KEY_ID",
        "RAZORPAY_KEY_SECRET",
        "RAZORPAY_WEBHOOK_SECRET",
        "RAZORPAYX_ACCOUNT_NUMBER",
        "XAI_API_KEY",
        "EMAIL_HASH_SECRET",
        "EMAIL_ENCRYPTION_KEY_BASE64",
        "PAYOUT_ENCRYPTION_KEY_BASE64",
        "SMTP_PASSWORD",
        "SESSION_SECRET",
        "ADMIN_EMAIL",
        "ADMIN_STATIC_OTP",
      ],
      censor: "[redacted]",
    },
  };

  return pino(loggerOptions);
}
