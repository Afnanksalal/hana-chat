import { postgresConnectionString, type AppConfig } from "@hana/config";
import { Kysely, PostgresDialect, sql, type ColumnType, type Generated } from "kysely";
import { Pool } from "pg";

export type TimestampColumn = ColumnType<Date, Date | string | undefined, Date | string>;
export type DefaultColumn<T> = ColumnType<T, T | undefined, T>;

export interface IdentityUsersTable {
  id: Generated<string>;
  created_at: TimestampColumn;
  updated_at: TimestampColumn;
  status: DefaultColumn<"active" | "limited" | "suspended" | "deleted">;
  display_name: string | null;
  avatar_url: DefaultColumn<string | null>;
}

export interface IdentityPhoneCredentialsTable {
  id: Generated<string>;
  user_id: string;
  phone_hash: string;
  encrypted_phone_number: string;
  country_code: string;
  line_type: string;
  carrier_name: string | null;
  verified_at: TimestampColumn;
  is_primary: DefaultColumn<boolean>;
}

export interface IdentityPhoneVerificationsTable {
  id: Generated<string>;
  phone_hash: string;
  encrypted_phone_number: string;
  country_code: string;
  code_hash: string;
  risk_action: string;
  attempts: DefaultColumn<number>;
  expires_at: TimestampColumn;
  verified_at: TimestampColumn | null;
  created_at: TimestampColumn;
  device_id_hash: string | null;
  user_agent_hash: string | null;
  ip_address_hash: string | null;
  provider: DefaultColumn<"local" | "twilio_verify">;
  provider_verification_id: string | null;
}

export interface IdentityEmailCredentialsTable {
  id: Generated<string>;
  user_id: string;
  email_hash: string;
  encrypted_email: string;
  email_domain: string;
  verified_at: TimestampColumn;
  is_primary: DefaultColumn<boolean>;
}

export interface IdentityEmailVerificationsTable {
  id: Generated<string>;
  email_hash: string;
  encrypted_email: string;
  email_domain: string;
  username: string | null;
  code_hash: string;
  purpose: "signup" | "signin";
  risk_action: string;
  attempts: DefaultColumn<number>;
  expires_at: TimestampColumn;
  verified_at: TimestampColumn | null;
  created_at: TimestampColumn;
  device_id_hash: string | null;
  user_agent_hash: string | null;
  ip_address_hash: string | null;
  provider: DefaultColumn<"local" | "smtp">;
  provider_message_id: string | null;
}

export interface IdentityAccountIpClaimsTable {
  ip_address_hash: string;
  user_id: string;
  created_at: TimestampColumn;
  last_seen_at: TimestampColumn;
}

export interface IdentityAccountDeviceClaimsTable {
  device_id_hash: string;
  user_id: string;
  created_at: TimestampColumn;
  last_seen_at: TimestampColumn;
}

export interface IdentityRiskSessionsTable {
  id: Generated<string>;
  user_id: string | null;
  phone_hash: string | null;
  email_hash: string | null;
  device_id: string | null;
  ip_address_hash: string;
  action: string;
  risk_score: number;
  action_taken: string;
  signals_json: unknown;
  created_at: TimestampColumn;
}

export interface IdentitySessionsTable {
  id: Generated<string>;
  user_id: string;
  token_hash: string;
  device_id: string | null;
  ip_address_hash: string | null;
  user_agent_hash: string | null;
  created_at: TimestampColumn;
  last_seen_at: TimestampColumn;
  expires_at: TimestampColumn;
  revoked_at: TimestampColumn | null;
}

export interface IdentityUserSettingsTable {
  user_id: string;
  display_name: string | null;
  adult_verified_at: TimestampColumn | null;
  adult_mode_enabled: DefaultColumn<boolean>;
  memory_enabled: DefaultColumn<boolean>;
  marketing_opt_in: DefaultColumn<boolean>;
  created_at: TimestampColumn;
  updated_at: TimestampColumn;
}

export interface IdentityUserRolesTable {
  user_id: string;
  role: "admin" | "support" | "moderator";
  granted_by: string | null;
  created_at: TimestampColumn;
}

export interface CreatorCharactersTable {
  id: Generated<string>;
  creator_user_id: string;
  created_at: TimestampColumn;
  updated_at: TimestampColumn;
  name: string;
  description: string;
  current_version_id: string | null;
  visibility: DefaultColumn<"private" | "public" | "unlisted">;
  moderation_status: DefaultColumn<"draft" | "pending_review" | "approved" | "rejected">;
  slug: string | null;
  avatar_url: string | null;
  cover_image_url: string | null;
  template_id: string | null;
  marketplace_category: DefaultColumn<string>;
  marketplace_preview: string | null;
  model_profile: DefaultColumn<"fast" | "balanced" | "immersive" | "premium">;
  price_cents: DefaultColumn<number>;
  monetization_enabled: DefaultColumn<boolean>;
  published_at: TimestampColumn | null;
  marketplace_stats_json: unknown;
}

export interface CreatorCharacterVersionsTable {
  id: Generated<string>;
  character_id: string;
  version: number;
  name: string;
  description: string;
  persona_prompt: string;
  greeting: string;
  scenario_prompt: string | null;
  first_message_style: string | null;
  creator_notes: string | null;
  personality_traits: string[];
  speaking_style: string | null;
  memory_scope: DefaultColumn<string>;
  example_dialogues_json: unknown;
  rating: "general" | "teen" | "mature" | "adult";
  tags: string[];
  created_by: string;
  created_at: TimestampColumn;
}

export interface CreatorMediaAssetsTable {
  id: Generated<string>;
  owner_user_id: string;
  created_at: TimestampColumn;
  updated_at: TimestampColumn;
  purpose: "character_avatar" | "character_cover" | "user_avatar";
  storage_provider: DefaultColumn<"local">;
  storage_key: string;
  public_url: string;
  original_file_name: string;
  mime_type: "image/png" | "image/jpeg" | "image/webp";
  byte_size: number;
  sha256_hex: string;
  width: number | null;
  height: number | null;
  metadata_json: unknown;
}

export interface CreatorCharacterEngagementEventsTable {
  id: Generated<string>;
  character_id: string;
  actor_user_id: string | null;
  event_type: "view" | "profile_open" | "chat_start" | "message" | "like" | "save";
  created_at: TimestampColumn;
  metadata_json: unknown;
}

export interface CreatorCharacterRatingsTable {
  character_id: string;
  user_id: string;
  score: number;
  created_at: TimestampColumn;
  updated_at: TimestampColumn;
}

export interface ChatConversationsTable {
  id: Generated<string>;
  user_id: string;
  character_id: string;
  created_at: TimestampColumn;
  updated_at: TimestampColumn;
  status: DefaultColumn<"active" | "archived" | "deleted">;
}

export interface ChatConversationEvolutionTable {
  conversation_id: string;
  user_id: string;
  character_id: string;
  stage: DefaultColumn<"new" | "warming" | "attuned" | "bonded">;
  relationship_depth: DefaultColumn<number>;
  memory_count: DefaultColumn<number>;
  user_message_count: DefaultColumn<number>;
  source_memory_ids: DefaultColumn<string[]>;
  style_profile_json: DefaultColumn<unknown>;
  summary: DefaultColumn<string>;
  created_at: TimestampColumn;
  updated_at: TimestampColumn;
  last_evolved_at: TimestampColumn;
}

export interface ChatMessagesTable {
  id: Generated<string>;
  conversation_id: string;
  user_id: string;
  character_id: string;
  role: "user" | "assistant" | "system";
  content: string;
  client_message_id: string | null;
  created_at: TimestampColumn;
  metadata_json: unknown;
}

export interface MemoryFactsTable {
  id: Generated<string>;
  user_id: string;
  character_id: string | null;
  conversation_id: string | null;
  scope: string;
  kind: string;
  text: string;
  normalized_text: string;
  confidence: number;
  importance: number;
  emotional_weight: number;
  source_message_ids: string[];
  created_at: TimestampColumn;
  updated_at: TimestampColumn;
  last_used_at: TimestampColumn | null;
  is_active: DefaultColumn<boolean>;
  superseded_by: string | null;
}

export interface MemoryDecentralizedSnapshotsTable {
  id: Generated<string>;
  user_id: string;
  character_id: string | null;
  conversation_id: string | null;
  snapshot_kind: "conversation_memory" | "creator_soul_pack" | "user_export";
  storage_network: string;
  root_hash: string;
  tx_hash: string | null;
  manifest_hash: string;
  encryption_mode: string;
  encryption_key_ref: string;
  status: "pending_upload" | "uploaded" | "confirmed" | "failed" | "disabled" | "unrecoverable";
  source_memory_ids: DefaultColumn<string[]>;
  manifest_json: unknown;
  idempotency_key: string;
  failure_reason: string | null;
  created_at: TimestampColumn;
  updated_at: TimestampColumn;
  confirmed_at: TimestampColumn | null;
}

export interface AnalyticsModelCallsTable {
  id: Generated<string>;
  user_id: string | null;
  provider: string;
  model: string;
  reasoning_effort: string;
  input_tokens: number;
  cached_input_tokens: number;
  output_tokens: number;
  estimated_cost_usd: string;
  cost_in_usd_ticks: DefaultColumn<number | null>;
  latency_ms: number;
  created_at: TimestampColumn;
}

export interface SafetyDecisionsTable {
  id: Generated<string>;
  user_id: string | null;
  conversation_id: string | null;
  message_id: string | null;
  stage: string;
  policy_version: string;
  action: string;
  categories: string[];
  confidence: number;
  reason_code: string;
  created_at: TimestampColumn;
}

export interface BillingPlansTable {
  id: "free" | "plus" | "ultra";
  name: string;
  monthly_price_cents: number;
  currency: string;
  monthly_message_limit: number;
  deep_memory_enabled: boolean;
  adult_mode_enabled: boolean;
  creator_paid_characters_enabled: boolean;
  is_active: boolean;
  created_at: TimestampColumn;
}

export interface BillingSubscriptionsTable {
  id: Generated<string>;
  user_id: string;
  plan_id: "free" | "plus" | "ultra";
  provider: string;
  provider_subscription_id: string | null;
  status: "active" | "trialing" | "past_due" | "canceled" | "incomplete";
  current_period_start: TimestampColumn;
  current_period_end: TimestampColumn;
  cancel_at_period_end: boolean;
  created_at: TimestampColumn;
  updated_at: TimestampColumn;
}

export interface BillingWebhookEventsTable {
  id: Generated<string>;
  provider: string;
  provider_event_id: string;
  event_type: string;
  payload_json: unknown;
  received_at: TimestampColumn;
  processed_at: TimestampColumn | null;
}

export interface BillingPaymentOrdersTable {
  id: Generated<string>;
  user_id: string;
  plan_id: "plus" | "ultra";
  provider: "razorpay" | "mock" | "crypto";
  provider_order_id: string | null;
  amount_cents: number;
  currency: string;
  status: "created" | "paid" | "failed" | "expired";
  checkout_url: string | null;
  metadata_json: unknown;
  created_at: TimestampColumn;
  updated_at: TimestampColumn;
}

export interface BillingCreditLedgerEntriesTable {
  id: Generated<string>;
  user_id: string;
  created_at: TimestampColumn;
  kind: string;
  amount: number;
  balance_after: number;
  reference_id: string | null;
  metadata_json: unknown;
}

export interface BillingCreatorEarningsTable {
  id: Generated<string>;
  creator_user_id: string;
  character_id: string;
  source_user_id: string | null;
  amount_cents: number;
  currency: string;
  platform_fee_cents: number;
  status: "pending" | "available" | "paid" | "reversed";
  created_at: TimestampColumn;
  available_at: TimestampColumn;
  paid_out_at: TimestampColumn | null;
}

export interface BillingCreatorWalletsTable {
  creator_user_id: string;
  currency: DefaultColumn<string>;
  pending_cents: DefaultColumn<number>;
  available_cents: DefaultColumn<number>;
  lifetime_earned_cents: DefaultColumn<number>;
  lifetime_fee_cents: DefaultColumn<number>;
  lifetime_paid_cents: DefaultColumn<number>;
  created_at: TimestampColumn;
  updated_at: TimestampColumn;
}

export interface BillingCreatorPayoutProfilesTable {
  creator_user_id: string;
  status: DefaultColumn<"draft" | "pending_review" | "verified" | "disabled">;
  display_name: string;
  legal_name: string | null;
  payout_mode: DefaultColumn<"upi" | "crypto">;
  encrypted_vpa: string | null;
  vpa_last4: string | null;
  razorpay_contact_id: string | null;
  razorpay_fund_account_id: string | null;
  metadata_json: unknown;
  created_at: TimestampColumn;
  updated_at: TimestampColumn;
}

export interface BillingCharacterPurchasesTable {
  id: Generated<string>;
  user_id: string;
  character_id: string;
  creator_user_id: string;
  amount_cents: number;
  currency: string;
  platform_fee_cents: number;
  creator_net_cents: number;
  provider: "mock" | "razorpay" | "crypto";
  provider_order_id: string | null;
  provider_payment_id: string | null;
  status: "created" | "paid" | "failed" | "refunded";
  idempotency_key: string;
  metadata_json: unknown;
  created_at: TimestampColumn;
  updated_at: TimestampColumn;
}

export interface BillingCreatorLedgerEntriesTable {
  id: Generated<string>;
  creator_user_id: string;
  character_id: string | null;
  source_user_id: string | null;
  entry_type:
    | "sale_gross"
    | "platform_fee"
    | "payout_reserve"
    | "payout_release"
    | "refund_reversal"
    | "admin_adjustment";
  amount_cents: number;
  currency: string;
  status: "pending" | "available" | "settled" | "reversed";
  available_at: TimestampColumn;
  reference_type: string;
  reference_id: string;
  idempotency_key: string;
  metadata_json: unknown;
  created_at: TimestampColumn;
}

export interface BillingCreatorPayoutsTable {
  id: Generated<string>;
  creator_user_id: string;
  requested_by_user_id: string;
  approved_by_user_id: string | null;
  amount_cents: number;
  currency: string;
  status: "requested" | "approved" | "processing" | "paid" | "failed" | "canceled";
  provider: "manual" | "mock" | "razorpayx" | "crypto";
  provider_payout_id: string | null;
  idempotency_key: string;
  failure_reason: string | null;
  metadata_json: unknown;
  requested_at: TimestampColumn;
  approved_at: TimestampColumn | null;
  paid_at: TimestampColumn | null;
  updated_at: TimestampColumn;
}

export interface BillingCryptoPaymentsTable {
  id: Generated<string>;
  buyer_user_id: string;
  purpose: string;
  chain_id: number;
  token_address: string | null;
  amount_atomic: string;
  amount_cents: number;
  currency: string;
  wallet_address: string | null;
  provider_reference: string;
  tx_hash: string | null;
  status: "created" | "pending" | "finalizing" | "finalized" | "failed" | "expired" | "refunded";
  expires_at: TimestampColumn;
  finalized_at: TimestampColumn | null;
  metadata_json: unknown;
  created_at: TimestampColumn;
  updated_at: TimestampColumn;
}

export interface BillingCryptoPayoutAccountsTable {
  id: Generated<string>;
  creator_user_id: string;
  chain_id: number;
  wallet_address: string;
  token_preference: string | null;
  status: "draft" | "pending_review" | "verified" | "disabled";
  metadata_json: unknown;
  created_at: TimestampColumn;
  updated_at: TimestampColumn;
  verified_at: TimestampColumn | null;
}

export interface Web3ChainTransactionsTable {
  id: Generated<string>;
  chain_id: number;
  tx_hash: string;
  provider_reference: string | null;
  direction: "inbound" | "outbound";
  status: "detected" | "confirming" | "confirmed" | "reorged" | "failed";
  block_number: string | null;
  confirmation_count: DefaultColumn<number>;
  raw_payload_hash: string | null;
  metadata_json: unknown;
  created_at: TimestampColumn;
  updated_at: TimestampColumn;
  confirmed_at: TimestampColumn | null;
}

export interface PlatformAuditEventsTable {
  id: Generated<string>;
  actor_user_id: string | null;
  action: string;
  resource_type: string;
  resource_id: string | null;
  ip_address_hash: string | null;
  user_agent_hash: string | null;
  metadata_json: unknown;
  created_at: TimestampColumn;
}

export interface PlatformOutboxEventsTable {
  id: Generated<string>;
  topic: string;
  event_key: string;
  idempotency_key: string;
  payload_json: unknown;
  schema_version: number;
  status: DefaultColumn<"pending" | "processing" | "published" | "failed" | "dead_letter">;
  attempts: DefaultColumn<number>;
  occurred_at: TimestampColumn;
  next_attempt_at: TimestampColumn | null;
  last_error: string | null;
  locked_at: TimestampColumn | null;
  locked_by: string | null;
}

export interface HanaDatabase {
  "identity.users": IdentityUsersTable;
  "identity.phone_credentials": IdentityPhoneCredentialsTable;
  "identity.phone_verifications": IdentityPhoneVerificationsTable;
  "identity.email_credentials": IdentityEmailCredentialsTable;
  "identity.email_verifications": IdentityEmailVerificationsTable;
  "identity.account_ip_claims": IdentityAccountIpClaimsTable;
  "identity.account_device_claims": IdentityAccountDeviceClaimsTable;
  "identity.risk_sessions": IdentityRiskSessionsTable;
  "identity.sessions": IdentitySessionsTable;
  "identity.user_settings": IdentityUserSettingsTable;
  "identity.user_roles": IdentityUserRolesTable;
  "creator.characters": CreatorCharactersTable;
  "creator.character_versions": CreatorCharacterVersionsTable;
  "creator.media_assets": CreatorMediaAssetsTable;
  "creator.character_engagement_events": CreatorCharacterEngagementEventsTable;
  "creator.character_ratings": CreatorCharacterRatingsTable;
  "chat.conversations": ChatConversationsTable;
  "chat.conversation_evolution": ChatConversationEvolutionTable;
  "chat.messages": ChatMessagesTable;
  "memory.facts": MemoryFactsTable;
  "memory.decentralized_snapshots": MemoryDecentralizedSnapshotsTable;
  "safety.decisions": SafetyDecisionsTable;
  "analytics.model_calls": AnalyticsModelCallsTable;
  "billing.plans": BillingPlansTable;
  "billing.subscriptions": BillingSubscriptionsTable;
  "billing.webhook_events": BillingWebhookEventsTable;
  "billing.payment_orders": BillingPaymentOrdersTable;
  "billing.credit_ledger_entries": BillingCreditLedgerEntriesTable;
  "billing.creator_earnings": BillingCreatorEarningsTable;
  "billing.creator_wallets": BillingCreatorWalletsTable;
  "billing.creator_payout_profiles": BillingCreatorPayoutProfilesTable;
  "billing.character_purchases": BillingCharacterPurchasesTable;
  "billing.creator_ledger_entries": BillingCreatorLedgerEntriesTable;
  "billing.creator_payouts": BillingCreatorPayoutsTable;
  "billing.crypto_payments": BillingCryptoPaymentsTable;
  "billing.crypto_payout_accounts": BillingCryptoPayoutAccountsTable;
  "web3.chain_transactions": Web3ChainTransactionsTable;
  "platform.audit_events": PlatformAuditEventsTable;
  "platform.outbox_events": PlatformOutboxEventsTable;
}

export function createDatabase(config: AppConfig): Kysely<HanaDatabase> {
  return new Kysely<HanaDatabase>({
    dialect: new PostgresDialect({
      pool: new Pool({
        connectionString: postgresConnectionString(config),
        max: 10,
      }),
    }),
  });
}

export async function checkDatabaseConnection(config: AppConfig): Promise<void> {
  const db = createDatabase(config);

  try {
    await sql`select 1`.execute(db);
  } finally {
    await db.destroy();
  }
}
