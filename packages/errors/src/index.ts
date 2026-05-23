export type ErrorCode =
  | "AUTH_REQUIRED"
  | "AUTH_FORBIDDEN"
  | "VALIDATION_FAILED"
  | "RATE_LIMITED"
  | "RISK_BLOCKED"
  | "ENTITLEMENT_REQUIRED"
  | "SAFETY_BLOCKED"
  | "MODEL_PROVIDER_FAILED"
  | "RESOURCE_NOT_FOUND"
  | "CONFLICT"
  | "INTERNAL";

export class DomainError extends Error {
  public override readonly name = "DomainError";

  public constructor(
    public readonly code: ErrorCode,
    message: string,
    public readonly details: Record<string, unknown> = {},
  ) {
    super(message);
  }
}

export function assertCondition(
  condition: unknown,
  code: ErrorCode,
  message: string,
  details: Record<string, unknown> = {},
): asserts condition {
  if (!condition) {
    throw new DomainError(code, message, details);
  }
}

export function toErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}
