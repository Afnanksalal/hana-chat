import { z } from "zod";

export type Brand<T, TBrand extends string> = T & { readonly __brand: TBrand };

export type UserId = Brand<string, "UserId">;
export type AccountId = Brand<string, "AccountId">;
export type CharacterId = Brand<string, "CharacterId">;
export type CharacterVersionId = Brand<string, "CharacterVersionId">;
export type ConversationId = Brand<string, "ConversationId">;
export type MessageId = Brand<string, "MessageId">;
export type MemoryId = Brand<string, "MemoryId">;
export type ModelCallId = Brand<string, "ModelCallId">;
export type PhoneNumberE164 = Brand<string, "PhoneNumberE164">;
export type DeviceId = Brand<string, "DeviceId">;
export type RiskSessionId = Brand<string, "RiskSessionId">;

export const IsoDateTimeSchema = z.string().datetime({ offset: true });

export const E164PhoneNumberSchema = z
  .string()
  .regex(/^\+[1-9]\d{7,14}$/, "Phone number must be normalized E.164")
  .transform((value) => value as PhoneNumberE164);

export const EntitlementKeySchema = z.enum([
  "chat.free.daily_messages",
  "chat.plus.monthly_messages",
  "chat.ultra.monthly_messages",
  "memory.basic",
  "memory.deep",
  "adult.mode",
  "voice.tts",
  "voice.realtime",
  "creator.private_characters",
  "creator.paid_characters",
]);

export type EntitlementKey = z.infer<typeof EntitlementKeySchema>;

export const MemoryScopeSchema = z.enum(["character_canon", "conversation", "safety", "system"]);

export type MemoryScope = z.infer<typeof MemoryScopeSchema>;

export const MemoryKindSchema = z.enum([
  "preference",
  "boundary",
  "relationship",
  "canon",
  "event",
  "style",
  "safety",
  "system",
]);

export type MemoryKind = z.infer<typeof MemoryKindSchema>;

export const RiskActionSchema = z.enum([
  "allow",
  "allow_with_limits",
  "step_up",
  "cooldown",
  "block",
  "manual_review",
]);

export type RiskAction = z.infer<typeof RiskActionSchema>;

export const CharacterRatingSchema = z.enum(["general", "teen", "mature", "adult"]);
export type CharacterRating = z.infer<typeof CharacterRatingSchema>;

export const CharacterTemplateSchema = z.enum([
  "blank",
  "soft-romance",
  "sharp-rival",
  "fantasy-companion",
  "comfort-friend",
  "mentor",
]);
export type CharacterTemplate = z.infer<typeof CharacterTemplateSchema>;

export const CharacterModelProfileSchema = z.enum(["fast", "balanced", "immersive", "premium"]);
export type CharacterModelProfile = z.infer<typeof CharacterModelProfileSchema>;

export const CharacterMarketplaceEventTypeSchema = z.enum([
  "view",
  "profile_open",
  "chat_start",
  "message",
  "like",
  "save",
]);
export type CharacterMarketplaceEventType = z.infer<typeof CharacterMarketplaceEventTypeSchema>;

export const ChatRoleSchema = z.enum(["system", "developer", "user", "assistant", "tool"]);
export type ChatRole = z.infer<typeof ChatRoleSchema>;

export const ChatMessageSchema = z.object({
  id: z.string().optional(),
  role: ChatRoleSchema,
  content: z.string().min(1).max(20_000),
  createdAt: IsoDateTimeSchema.optional(),
});

export type ChatMessage = z.infer<typeof ChatMessageSchema>;

export const StartPhoneVerificationRequestSchema = z.object({
  phoneNumber: E164PhoneNumberSchema,
  deviceId: z.string().min(8).max(256).optional(),
  riskSessionId: z.string().optional(),
});

export type StartPhoneVerificationRequest = z.infer<typeof StartPhoneVerificationRequestSchema>;

export const VerifyPhoneRequestSchema = z.object({
  phoneNumber: E164PhoneNumberSchema,
  code: z.string().regex(/^\d{4,8}$/),
  deviceId: z.string().min(8).max(256).optional(),
  riskSessionId: z.string().optional(),
});

export type VerifyPhoneRequest = z.infer<typeof VerifyPhoneRequestSchema>;

export const CreateCharacterRequestSchema = z.object({
  name: z.string().min(1).max(80),
  description: z.string().min(1).max(800),
  greeting: z.string().min(1).max(1_200),
  personaPrompt: z.string().min(1).max(8_000),
  scenarioPrompt: z.string().max(2_500).optional().default(""),
  firstMessageStyle: z.string().max(240).optional().default(""),
  creatorNotes: z.string().max(1_500).optional().default(""),
  speakingStyle: z.string().max(500).optional().default(""),
  personalityTraits: z.array(z.string().min(1).max(32)).max(10).default([]),
  exampleDialogues: z.array(z.string().min(1).max(500)).max(8).default([]),
  avatarUrl: z.string().max(500).optional().default("/assets/hana-icon-head.png"),
  coverImageUrl: z.string().max(500).optional().default("/assets/hana-hero.png"),
  templateId: CharacterTemplateSchema.default("blank"),
  marketplaceCategory: z.string().min(1).max(48).default("featured"),
  marketplacePreview: z.string().max(220).optional().default(""),
  modelProfile: CharacterModelProfileSchema.default("balanced"),
  rating: CharacterRatingSchema,
  tags: z.array(z.string().min(1).max(32)).max(12).default([]),
  isPrivate: z.boolean().default(true),
  priceCents: z.number().int().min(0).max(99_99).default(0),
  monetizationEnabled: z.boolean().default(false),
});

export type CreateCharacterRequest = z.infer<typeof CreateCharacterRequestSchema>;

export const PublishCharacterRequestSchema = z.object({
  characterId: z.string().min(1),
  marketplaceNotes: z.string().max(1_000).optional(),
  priceCents: z.number().int().min(0).max(99_99).optional(),
  monetizationEnabled: z.boolean().optional(),
});

export type PublishCharacterRequest = z.infer<typeof PublishCharacterRequestSchema>;

export const RecordCharacterEventRequestSchema = z.object({
  type: CharacterMarketplaceEventTypeSchema,
});

export type RecordCharacterEventRequest = z.infer<typeof RecordCharacterEventRequestSchema>;

export const RateCharacterRequestSchema = z.object({
  score: z.number().int().min(1).max(5),
});

export type RateCharacterRequest = z.infer<typeof RateCharacterRequestSchema>;

export const MediaUploadPurposeSchema = z.enum([
  "character_avatar",
  "character_cover",
  "user_avatar",
]);
export type MediaUploadPurpose = z.infer<typeof MediaUploadPurposeSchema>;

export const CreateMediaAssetRequestSchema = z.object({
  purpose: MediaUploadPurposeSchema,
  fileName: z.string().min(1).max(180),
  mimeType: z.enum(["image/png", "image/jpeg", "image/webp"]),
  contentBase64: z.string().min(1),
});

export type CreateMediaAssetRequest = z.infer<typeof CreateMediaAssetRequestSchema>;

export const SendChatMessageRequestSchema = z.object({
  conversationId: z.string().optional(),
  characterId: z.string().min(1),
  content: z.string().min(1).max(8_000),
  clientMessageId: z.string().min(8).max(128),
  adultModeRequested: z.boolean().default(false),
});

export type SendChatMessageRequest = z.infer<typeof SendChatMessageRequestSchema>;

export const UpdateSettingsRequestSchema = z.object({
  displayName: z.string().min(1).max(80).nullable().optional(),
  avatarUrl: z
    .string()
    .max(500)
    .refine(
      (value) => value.startsWith("/api/v1/media/") || value.startsWith("/assets/"),
      "Avatar must be an uploaded Hana image",
    )
    .nullable()
    .optional(),
  adultModeEnabled: z.boolean().optional(),
  memoryEnabled: z.boolean().optional(),
  voiceEnabled: z.boolean().optional(),
  marketingOptIn: z.boolean().optional(),
});

export type UpdateSettingsRequest = z.infer<typeof UpdateSettingsRequestSchema>;

export const UpdateMemoryRequestSchema = z.object({
  text: z.string().min(1).max(1_000).optional(),
  isActive: z.boolean().optional(),
  importance: z.number().min(0).max(1).optional(),
});

export type UpdateMemoryRequest = z.infer<typeof UpdateMemoryRequestSchema>;

export const CheckoutPlanRequestSchema = z.object({
  planId: z.enum(["plus", "ultra"]),
  provider: z.enum(["razorpay", "mock"]).default("razorpay"),
});

export type CheckoutPlanRequest = z.infer<typeof CheckoutPlanRequestSchema>;

export const MonetizationProviderSchema = z.enum(["razorpay", "mock"]);
export type MonetizationProvider = z.infer<typeof MonetizationProviderSchema>;

export const CreateCharacterPurchaseRequestSchema = z.object({
  characterId: z.string().min(1),
  provider: MonetizationProviderSchema.default("razorpay"),
});

export type CreateCharacterPurchaseRequest = z.infer<typeof CreateCharacterPurchaseRequestSchema>;

export const VerifyCharacterPurchaseRequestSchema = z.object({
  internalPurchaseId: z.string().min(1),
  razorpayOrderId: z.string().min(1),
  razorpayPaymentId: z.string().min(1),
  razorpaySignature: z.string().min(1),
});

export type VerifyCharacterPurchaseRequest = z.infer<typeof VerifyCharacterPurchaseRequestSchema>;

export const UpsertPayoutProfileRequestSchema = z.object({
  displayName: z.string().min(2).max(120),
  legalName: z.string().min(2).max(160).optional().default(""),
  payoutMode: z.literal("upi").default("upi"),
  vpa: z
    .string()
    .min(3)
    .max(128)
    .regex(/^[a-zA-Z0-9.\-_]{2,}@[a-zA-Z][a-zA-Z0-9.\-_]{1,}$/, "Enter a valid UPI ID"),
});

export type UpsertPayoutProfileRequest = z.infer<typeof UpsertPayoutProfileRequestSchema>;

export const RequestCreatorPayoutRequestSchema = z.object({
  amountCents: z.number().int().positive().max(1_000_000),
  currency: z.string().length(3).default("USD"),
});

export type RequestCreatorPayoutRequest = z.infer<typeof RequestCreatorPayoutRequestSchema>;

export const AdminProcessPayoutRequestSchema = z.object({
  provider: z.enum(["mock", "razorpayx", "manual"]).default("mock"),
  note: z.string().max(500).optional().default(""),
});

export type AdminProcessPayoutRequest = z.infer<typeof AdminProcessPayoutRequestSchema>;

export const VerifyRazorpayPaymentRequestSchema = z.object({
  internalOrderId: z.string().min(1),
  razorpayOrderId: z.string().min(1),
  razorpayPaymentId: z.string().min(1),
  razorpaySignature: z.string().min(1),
});

export type VerifyRazorpayPaymentRequest = z.infer<typeof VerifyRazorpayPaymentRequestSchema>;

export const RazorpayWebhookRequestSchema = z.object({
  event: z.string().min(1),
  payload: z.record(z.string(), z.unknown()),
});

export type RazorpayWebhookRequest = z.infer<typeof RazorpayWebhookRequestSchema>;

export const ApiHealthResponseSchema = z.object({
  service: z.string(),
  status: z.enum(["ok", "degraded"]),
  version: z.string(),
  time: IsoDateTimeSchema,
});

export type ApiHealthResponse = z.infer<typeof ApiHealthResponseSchema>;

export const ModelProviderSchema = z.enum(["xai", "nous", "openrouter", "local", "custom"]);
export type ModelProviderName = z.infer<typeof ModelProviderSchema>;

export const ModelReasoningEffortSchema = z.enum(["none", "low", "medium", "high"]);
export type ModelReasoningEffort = z.infer<typeof ModelReasoningEffortSchema>;
