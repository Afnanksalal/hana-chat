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
export type EmailAddress = Brand<string, "EmailAddress">;
export type DeviceId = Brand<string, "DeviceId">;
export type RiskSessionId = Brand<string, "RiskSessionId">;

export const IsoDateTimeSchema = z.string().datetime({ offset: true });

export const EmailAddressSchema = z
  .string()
  .trim()
  .toLowerCase()
  .email("Enter a valid email address")
  .max(254)
  .transform((value) => value as EmailAddress);

export const UsernameSchema = z
  .string()
  .trim()
  .min(2)
  .max(40)
  .regex(
    /^[A-Za-z0-9][A-Za-z0-9 ._-]*$/,
    "Use letters, numbers, spaces, dots, underscores, or dashes",
  );

export const EntitlementKeySchema = z.enum([
  "chat.free.daily_messages",
  "chat.plus.monthly_messages",
  "chat.ultra.monthly_messages",
  "memory.basic",
  "memory.deep",
  "adult.mode",
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

export const StartEmailAuthRequestSchema = z
  .object({
    mode: z.enum(["signup", "signin"]),
    email: EmailAddressSchema,
    username: UsernameSchema.optional(),
    deviceId: z.string().min(8).max(256).optional(),
    riskSessionId: z.string().optional(),
  })
  .superRefine((value, ctx) => {
    if (value.mode === "signup" && !value.username) {
      ctx.addIssue({
        code: "custom",
        path: ["username"],
        message: "Username is required to create an account",
      });
    }
  });

export type StartEmailAuthRequest = z.infer<typeof StartEmailAuthRequestSchema>;

export const VerifyEmailAuthRequestSchema = z.object({
  email: EmailAddressSchema,
  verificationId: z.string().uuid().optional(),
  code: z
    .string()
    .trim()
    .regex(/^\d{6,8}$/),
  deviceId: z.string().min(8).max(256).optional(),
  riskSessionId: z.string().optional(),
});

export type VerifyEmailAuthRequest = z.infer<typeof VerifyEmailAuthRequestSchema>;

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
  avatarUrl: z.string().max(500).optional().default("/assets/character-avatar-default.svg"),
  coverImageUrl: z.string().max(500).optional().default("/assets/character-cover-default.svg"),
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

export const GenerateMediaAssetRequestSchema = z.object({
  purpose: z.enum(["character_avatar", "character_cover"]),
  prompt: z.string().trim().min(12).max(8_000),
  characterName: z.string().trim().max(80).optional().default(""),
  style: z.string().trim().max(1_200).optional().default("premium fictional character art"),
  artDirection: z
    .enum(["anime", "semi_real", "cinematic", "editorial", "painted", "comic", "soft_3d"])
    .optional()
    .default("anime"),
  mood: z
    .enum(["auto", "soft", "dramatic", "neon", "cozy", "dark", "spicy", "fantasy"])
    .optional()
    .default("auto"),
  backdrop: z
    .enum(["auto", "studio", "city", "nature", "cafe", "bedroom", "fantasy", "nightlife"])
    .optional()
    .default("auto"),
  detailLevel: z.enum(["clean", "balanced", "rich"]).optional().default("balanced"),
  aspectRatio: z.enum(["1:1", "16:9", "3:4", "4:3"]).optional().default("1:1"),
  referenceImageUrl: z.string().trim().max(500).optional().default(""),
});

export type GenerateMediaAssetRequest = z.infer<typeof GenerateMediaAssetRequestSchema>;

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
  provider: z.enum(["crypto", "mock"]).default("crypto"),
});

export type CheckoutPlanRequest = z.infer<typeof CheckoutPlanRequestSchema>;

export const MonetizationProviderSchema = z.enum(["crypto", "mock"]);
export type MonetizationProvider = z.infer<typeof MonetizationProviderSchema>;

export const CreateCharacterPurchaseRequestSchema = z.object({
  characterId: z.string().min(1),
  provider: MonetizationProviderSchema.default("crypto"),
});

export type CreateCharacterPurchaseRequest = z.infer<typeof CreateCharacterPurchaseRequestSchema>;

export const VerifyCharacterPurchaseRequestSchema = z.object({
  internalPurchaseId: z.string().min(1),
  paymentId: z.string().min(1),
  txHash: z.string().regex(/^0x[a-fA-F0-9]{64}$/, "Enter a valid transaction hash"),
  walletAddress: z
    .string()
    .regex(/^0x[a-fA-F0-9]{40}$/, "Enter a valid wallet address")
    .optional(),
});

export type VerifyCharacterPurchaseRequest = z.infer<typeof VerifyCharacterPurchaseRequestSchema>;

export const UpsertPayoutProfileRequestSchema = z.object({
  displayName: z.string().min(2).max(120),
  legalName: z.string().min(2).max(160).optional().default(""),
  payoutMode: z.literal("crypto").default("crypto"),
  walletAddress: z.string().regex(/^0x[a-fA-F0-9]{40}$/, "Enter a valid wallet address"),
});

export type UpsertPayoutProfileRequest = z.infer<typeof UpsertPayoutProfileRequestSchema>;

export const RequestCreatorPayoutRequestSchema = z.object({
  amountCents: z.number().int().positive().max(1_000_000),
  currency: z.string().length(3).default("USD"),
});

export type RequestCreatorPayoutRequest = z.infer<typeof RequestCreatorPayoutRequestSchema>;

export const AdminProcessPayoutRequestSchema = z.object({
  provider: z.literal("crypto").default("crypto"),
  txHash: z.string().regex(/^0x[a-fA-F0-9]{64}$/, "Enter a valid transaction hash"),
  note: z.string().max(500).optional().default(""),
});

export type AdminProcessPayoutRequest = z.infer<typeof AdminProcessPayoutRequestSchema>;

export const AdminReviewCharacterRequestSchema = z.object({
  action: z.enum(["approve", "reject"]),
  note: z.string().max(500).optional().default(""),
});

export type AdminReviewCharacterRequest = z.infer<typeof AdminReviewCharacterRequestSchema>;

export const AdminAnalyticsQuerySchema = z.object({
  rangeDays: z.coerce.number().int().min(7).max(90).default(30),
});

export type AdminAnalyticsQuery = z.infer<typeof AdminAnalyticsQuerySchema>;

export const VerifyCryptoPaymentRequestSchema = z.object({
  paymentId: z.string().min(1),
  txHash: z.string().regex(/^0x[a-fA-F0-9]{64}$/, "Enter a valid transaction hash"),
  walletAddress: z
    .string()
    .regex(/^0x[a-fA-F0-9]{40}$/, "Enter a valid wallet address")
    .optional(),
});

export type VerifyCryptoPaymentRequest = z.infer<typeof VerifyCryptoPaymentRequestSchema>;

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
