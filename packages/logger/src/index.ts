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
        "TWILIO_AUTH_TOKEN",
        "PHONE_HASH_SECRET",
        "PHONE_ENCRYPTION_KEY_BASE64",
        "SESSION_SECRET",
      ],
      censor: "[redacted]",
    },
  };

  return pino(loggerOptions);
}
