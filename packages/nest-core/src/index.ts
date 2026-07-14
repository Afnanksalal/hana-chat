import "reflect-metadata";
import {
  ArgumentsHost,
  Catch,
  HttpException,
  Logger,
  ValidationPipe,
  type ExceptionFilter,
  type Type,
} from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { FastifyAdapter, type NestFastifyApplication } from "@nestjs/platform-fastify";
import { loadConfig } from "@hana/config";
import { DomainError } from "@hana/errors";
import { ZodError } from "zod";

export interface BootstrapNestServiceOptions {
  module: Type<unknown>;
  serviceName: string;
  port: number;
}

export async function bootstrapNestService(
  options: BootstrapNestServiceOptions,
): Promise<NestFastifyApplication> {
  const config = loadConfig();
  const app = await NestFactory.create<NestFastifyApplication>(
    options.module,
    new FastifyAdapter({
      logger: false,
      trustProxy: true,
      bodyLimit: Math.max(1_048_576, config.MEDIA_MAX_UPLOAD_BYTES * 2),
    }),
    {
      bufferLogs: true,
      rawBody: true,
    },
  );

  applySecurityHeaders(app);
  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true,
    }),
  );
  app.useGlobalFilters(new ApiExceptionFilter(config.NODE_ENV === "production"));
  const allowedOrigins = parseAllowedOrigins(config.WEB_ORIGINS, config.WEB_ORIGIN);

  app.enableCors({
    origin(origin, callback) {
      if (!origin || allowedOrigins.has(origin)) {
        callback(null, true);
        return;
      }

      callback(new Error(`CORS origin not allowed: ${origin}`), false);
    },
    credentials: true,
  });
  app.enableShutdownHooks();

  await app.listen(options.port, "0.0.0.0");

  Logger.log(`${options.serviceName} listening on ${options.port}`, options.serviceName);
  return app;
}

export function nowIso(): string {
  return new Date().toISOString();
}

function parseAllowedOrigins(origins: string, primaryOrigin: string): Set<string> {
  return new Set(
    [primaryOrigin, ...origins.split(",")]
      .map((origin) => origin.trim().replace(/\/$/, ""))
      .filter(Boolean),
  );
}

function applySecurityHeaders(app: NestFastifyApplication): void {
  const fastify = app.getHttpAdapter().getInstance() as {
    addHook: (
      name: "onRequest",
      handler: (
        request: unknown,
        reply: { header: (name: string, value: string) => void },
        done: () => void,
      ) => void,
    ) => void;
  };

  fastify.addHook("onRequest", (_request, reply, done) => {
    reply.header("Referrer-Policy", "strict-origin-when-cross-origin");
    reply.header("X-Content-Type-Options", "nosniff");
    reply.header("X-Frame-Options", "DENY");
    reply.header("X-Permitted-Cross-Domain-Policies", "none");
    reply.header("Permissions-Policy", "camera=(), geolocation=(), payment=()");
    done();
  });
}

@Catch()
class ApiExceptionFilter implements ExceptionFilter {
  public constructor(private readonly redactUnexpectedErrors: boolean) {}

  public catch(exception: unknown, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<{
      status: (statusCode: number) => { send: (payload: unknown) => void };
    }>();
    const normalized = normalizeException(exception, this.redactUnexpectedErrors);

    if (normalized.statusCode >= 500 || normalized.code === "INTERNAL") {
      console.error("[ApiExceptionFilter] Unexpected error caught:", exception);
    } else {
      console.warn(
        "[ApiExceptionFilter] Handled domain error:",
        normalized.code,
        normalized.message,
      );
    }

    response.status(normalized.statusCode).send({
      error: {
        code: normalized.code,
        message: normalized.message,
        details: normalized.details,
      },
    });
  }
}

function normalizeException(
  exception: unknown,
  redactUnexpectedErrors: boolean,
): {
  statusCode: number;
  code: string;
  message: string;
  details?: unknown;
} {
  const domainError = getDomainError(exception);

  if (domainError) {
    if (redactUnexpectedErrors && domainError.code === "INTERNAL") {
      return {
        statusCode: 500,
        code: "INTERNAL",
        message: "Internal server error",
      };
    }

    return {
      statusCode: statusCodeForDomainError(domainError.code),
      code: domainError.code,
      message: domainError.message,
      details: domainError.details,
    };
  }

  if (exception instanceof ZodError) {
    return {
      statusCode: 422,
      code: "VALIDATION_FAILED",
      message: "Request validation failed",
      details: exception.flatten(),
    };
  }

  if (exception instanceof HttpException) {
    const statusCode = exception.getStatus();
    const body = exception.getResponse();
    const message =
      typeof body === "object" && body && "message" in body
        ? formatHttpExceptionMessage((body as { message?: unknown }).message)
        : exception.message;

    return {
      statusCode,
      code: statusCode === 404 ? "RESOURCE_NOT_FOUND" : "HTTP_ERROR",
      message,
    };
  }

  if (exception instanceof Error) {
    return {
      statusCode: 500,
      code: "INTERNAL",
      message: redactUnexpectedErrors ? "Internal server error" : exception.message,
    };
  }

  return {
    statusCode: 500,
    code: "INTERNAL",
    message: "Unexpected error",
  };
}

function formatHttpExceptionMessage(message: unknown): string {
  if (Array.isArray(message)) {
    return message.filter((entry): entry is string => typeof entry === "string").join(", ");
  }

  return typeof message === "string" && message ? message : "Request failed";
}

function getDomainError(
  exception: unknown,
): { code: string; message: string; details?: Record<string, unknown> } | null {
  if (exception instanceof DomainError) {
    return {
      code: exception.code,
      message: exception.message,
      details: exception.details,
    };
  }

  if (!(exception instanceof Error) || exception.name !== "DomainError") {
    return null;
  }

  const maybeDomainError = exception as Error & {
    code?: unknown;
    details?: unknown;
  };

  if (typeof maybeDomainError.code !== "string") {
    return null;
  }

  const details =
    maybeDomainError.details &&
    typeof maybeDomainError.details === "object" &&
    !Array.isArray(maybeDomainError.details)
      ? (maybeDomainError.details as Record<string, unknown>)
      : undefined;

  return {
    code: maybeDomainError.code,
    message: exception.message,
    ...(details ? { details } : {}),
  };
}

function statusCodeForDomainError(code: string): number {
  switch (code) {
    case "AUTH_REQUIRED":
      return 401;
    case "AUTH_FORBIDDEN":
      return 403;
    case "VALIDATION_FAILED":
      return 422;
    case "RATE_LIMITED":
      return 429;
    case "ENTITLEMENT_REQUIRED":
      return 402;
    case "RESOURCE_NOT_FOUND":
      return 404;
    case "CONFLICT":
      return 409;
    case "RISK_BLOCKED":
    case "SAFETY_BLOCKED":
      return 403;
    default:
      return 500;
  }
}
