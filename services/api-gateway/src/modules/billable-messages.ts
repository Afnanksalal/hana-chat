import { type HanaDatabase } from "@hana/database";
import { sql, type Kysely } from "kysely";

type Db = Kysely<HanaDatabase>;

interface UserMessageCountInput {
  userId: string;
  characterId?: string;
  since?: Date;
}

export function monthlyBillingWindowStart(now = new Date()): Date {
  const start = new Date(now);
  start.setUTCDate(1);
  start.setUTCHours(0, 0, 0, 0);
  return start;
}

export function dailyBillingWindowStart(now = new Date()): Date {
  const start = new Date(now);
  start.setUTCHours(0, 0, 0, 0);
  return start;
}

export async function acceptedUserMessageCount(
  db: Db,
  input: UserMessageCountInput,
): Promise<number> {
  const result = await db
    .selectFrom("chat.messages as user_messages")
    .select((eb) => eb.fn.countAll<number>().as("count"))
    .where("user_messages.user_id", "=", input.userId)
    .where("user_messages.role", "=", "user")
    .$if(input.characterId !== undefined, (qb) =>
      qb.where("user_messages.character_id", "=", input.characterId ?? ""),
    )
    .$if(input.since !== undefined, (qb) =>
      qb.where("user_messages.created_at", ">=", input.since ?? new Date(0)),
    )
    .executeTakeFirst();

  return Number(result?.count ?? 0);
}

export async function completedUserTurnCount(
  db: Db,
  input: UserMessageCountInput,
): Promise<number> {
  const result = await db
    .selectFrom("chat.messages as user_messages")
    .select((eb) => eb.fn.countAll<number>().as("count"))
    .where("user_messages.user_id", "=", input.userId)
    .where("user_messages.role", "=", "user")
    .where(completedAssistantReplyExists())
    .$if(input.characterId !== undefined, (qb) =>
      qb.where("user_messages.character_id", "=", input.characterId ?? ""),
    )
    .$if(input.since !== undefined, (qb) =>
      qb.where("user_messages.created_at", ">=", input.since ?? new Date(0)),
    )
    .executeTakeFirst();

  return Number(result?.count ?? 0);
}

function completedAssistantReplyExists() {
  return sql<boolean>`exists (
    select 1
    from chat.messages as assistant_messages
    where assistant_messages.conversation_id = user_messages.conversation_id
      and assistant_messages.user_id = user_messages.user_id
      and assistant_messages.character_id = user_messages.character_id
      and assistant_messages.role = 'assistant'
      and assistant_messages.metadata_json->>'kind' is distinct from 'greeting'
      and (
        assistant_messages.metadata_json->>'sourceUserMessageId' = user_messages.id::text
        or (
          assistant_messages.created_at >= user_messages.created_at
          and not exists (
            select 1
            from chat.messages as later_user_messages
            where later_user_messages.conversation_id = user_messages.conversation_id
              and later_user_messages.user_id = user_messages.user_id
              and later_user_messages.character_id = user_messages.character_id
              and later_user_messages.role = 'user'
              and later_user_messages.created_at > user_messages.created_at
              and later_user_messages.created_at < assistant_messages.created_at
          )
        )
      )
  )`;
}
