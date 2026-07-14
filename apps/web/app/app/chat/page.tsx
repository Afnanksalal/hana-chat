"use client";

import {
  Archive,
  ArrowLeft,
  AtSign,
  Bot,
  Check,
  Clock3,
  Hash,
  Lock,
  MessageSquareText,
  MinusCircle,
  Pencil,
  Plus,
  RotateCcw,
  Save,
  Search,
  Send,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Trash2,
  UserPlus,
  UsersRound,
  X,
} from "lucide-react";
import { useSearchParams } from "next/navigation";
import type { CSSProperties } from "react";
import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { HanaLogo } from "../../components/hana-logo";
import { MintFromChatModal } from "../components/mint-from-chat-modal";
import { apiJson, money } from "../api";
import { completeStellarPayment, type StellarPaymentIntent } from "../stellar-payments";
import { renderRoleplayContent, renderRoleplayPreview } from "../roleplay-preview";

interface ChatImagePart {
  type: "image";
  mediaId: string;
}

interface ChatTextPart {
  type: "text";
  content: string;
}

type ChatContentPart = ChatImagePart | ChatTextPart;

function parseChatContent(content: string): ChatContentPart[] {
  const parts: ChatContentPart[] = [];
  const imageRegex = /!\[hana-img\]\(mediaId:([a-f0-9-]{36})\)/g;
  let lastIndex = 0;
  let match;

  while ((match = imageRegex.exec(content)) !== null) {
    // Add text before the image
    if (match.index > lastIndex) {
      const textContent = content.slice(lastIndex, match.index);
      if (textContent.trim()) {
        parts.push({ type: "text", content: textContent });
      }
    }
    
    // Add the image
    if (match[1]) {
      parts.push({ type: "image", mediaId: match[1] });
    }
    lastIndex = imageRegex.lastIndex;
  }

  // Add remaining text
  if (lastIndex < content.length) {
    const textContent = content.slice(lastIndex);
    if (textContent.trim()) {
      parts.push({ type: "text", content: textContent });
    }
  }

  return parts.length > 0 ? parts : [{ type: "text", content }];
}

function renderChatContent(parts: ChatContentPart[], characterId: string | undefined, onMintClick: (mediaId: string) => void) {
  return parts.map((part, index) => {
    if (part.type === "image") {
      return (
        <div key={`img-${index}`} className="chat-image-bubble">
          <img
            src={`/api/v1/media/${part.mediaId}/file`}
            alt="AI generated image"
            className="chat-image"
          />
          <button
            className="chat-image-action"
            onClick={() => onMintClick(part.mediaId)}
          >
            Mint as NFT
          </button>
        </div>
      );
    }
    
    return (
      <div key={`text-${index}`} className="chat-text-content">
        {renderRoleplayContent(part.content)}
      </div>
    );
  });
}

type MemoryKind = "preference" | "boundary" | "relationship" | "canon" | "event" | "style";

interface CharacterSummary {
  id: string;
  name: string;
  description: string;
  rating: "general" | "teen" | "mature" | "adult";
  avatarUrl?: string;
  coverImageUrl?: string;
  greeting?: string;
  marketplacePreview?: string;
  marketplaceCategory?: string;
  tags?: string[];
  priceCents?: number;
  monetizationEnabled?: boolean;
  access?: {
    type: "free" | "creator" | "trial" | "locked" | "purchased";
    unlocked: boolean;
    trialLimit: number;
    trialUsed: number;
    trialRemaining: number;
  };
}

type CharacterPayload = CharacterSummary | { character?: CharacterSummary };

interface ConversationMember {
  characterId: string;
  name: string;
  description: string;
  avatarUrl: string;
  coverImageUrl: string;
  mentionSlug: string;
  position: number;
  rating: "general" | "teen" | "mature" | "adult";
}

interface SettingsResponse {
  adultModeEnabled: boolean;
}

type GroupResponseMode = "mentions" | "mentions_and_handoffs";

interface ConversationSummary {
  id: string;
  type?: "direct" | "group";
  title?: string;
  responseMode?: GroupResponseMode;
  characterId: string;
  updatedAt: string;
  character: CharacterSummary;
  members?: ConversationMember[];
  lastMessage: {
    id: string;
    role: "assistant" | "user" | "system";
    content: string;
    createdAt: string;
    speaker?: ConversationMember | null;
  } | null;
}

interface ChatMessage {
  id: string;
  role: "assistant" | "user";
  content: string;
  speaker?: ConversationMember | null;
}

interface MemoryFact {
  id: string;
  text: string;
  kind: MemoryKind;
  importance: number;
  isActive: boolean;
  characterId: string;
  conversationId: string;
}

interface TrialStatus {
  limit: number;
  used: number;
  remaining: number;
}

interface EvolutionSummary {
  stage: "new" | "warming" | "attuned" | "bonded";
  relationshipDepth: number;
  memoryCount: number;
  userMessageCount: number;
  summary: string;
  styleProfile: {
    preferences: string[];
    boundaries: string[];
    relationship: string[];
    canon: string[];
    style: string[];
    relationshipState: string;
    userProfile: string[];
    soul: string[];
    milestones: string[];
    adaptiveSkills: string[];
    openLoops: string[];
    recentSignals: string[];
  };
  updatedAt: string;
}

interface ChatResponse {
  accepted: boolean;
  duplicate?: boolean;
  conversationId?: string;
  assistantMessage?: {
    id: string;
    role: "assistant";
    content: string;
    speaker?: ConversationMember | null;
  };
  assistantMessages?: Array<{
    id: string;
    role: "assistant";
    content: string;
    speaker?: ConversationMember | null;
  }>;
  group?: {
    responseMode: GroupResponseMode;
    messageAudience?: "room" | "mentioned_bots";
    messageIntent?:
      | "public_greeting"
      | "public_room_message"
      | "directed_greeting"
      | "directed_prompt";
    botResponseQueued?: boolean;
    mentioned: Array<{ characterId: string; mentionSlug: string; name: string }>;
    handoffs?: Array<{
      fromCharacterId: string;
      toCharacterId: string;
      mentionSlug: string;
      triggerMessageId: string;
    }>;
  } | null;
  usage?: {
    used: number;
    limit: number;
  };
  trial?: TrialStatus | null;
  evolution?: EvolutionSummary | null;
  safety?: {
    action: string;
    reasonCode?: string;
  };
}

type PendingTurnStatus = "sending" | "failed";

interface PendingChatTurn {
  id: string;
  characterId: string;
  conversationId?: string;
  content: string;
  adultModeRequested: boolean;
  status: PendingTurnStatus;
  attempts: number;
  createdAt: string;
  updatedAt: string;
}

interface MemoriesResponse {
  memories: MemoryFact[];
}

interface CharacterPurchaseResponse {
  provider?: "stellar";
  internalPurchaseId?: string;
  activated?: boolean;
  alreadyPurchased?: boolean;
  trial?: boolean;
  trialLimit?: number;
  trialUsed?: number;
  trialRemaining?: number;
  payment?: StellarPaymentIntent;
  character?: {
    id: string;
    name: string;
    priceCents: number;
  };
}

interface MarketplaceResponse {
  characters: CharacterSummary[];
}

const memoryKinds: Array<{ id: MemoryKind; label: string }> = [
  { id: "preference", label: "Preference" },
  { id: "boundary", label: "Boundary" },
  { id: "relationship", label: "Relationship" },
  { id: "canon", label: "Canon" },
  { id: "event", label: "Event" },
  { id: "style", label: "Style" },
];
const pendingChatStorageKey = "hana:chat-pending-turns:v1";
const pendingChatTtlMs = 15 * 60 * 1_000;
const maxChatMessageChars = 8_000;

function formatRoomTimestamp(value: string): string {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "Fresh room";
  }

  const now = new Date();
  const sameDay = date.toDateString() === now.toDateString();

  if (sameDay) {
    return date.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  }

  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function replaceChatLocation(params?: URLSearchParams): void {
  if (typeof window === "undefined") {
    return;
  }

  const nextPath = params
    ? `${window.location.pathname}?${params.toString()}`
    : window.location.pathname;
  window.history.replaceState(null, "", nextPath);
}

function replaceWithConversation(conversationId: string): void {
  const params = new URLSearchParams();
  params.set("conversationId", conversationId);
  replaceChatLocation(params);
}

function replaceWithFreshRoom(characterId: string): void {
  const params = new URLSearchParams();
  params.set("characterId", characterId);
  params.set("new", "1");
  replaceChatLocation(params);
}

function readPendingTurns(): PendingChatTurn[] {
  if (typeof window === "undefined") {
    return [];
  }

  try {
    const parsed: unknown = JSON.parse(window.localStorage.getItem(pendingChatStorageKey) ?? "[]");
    const now = Date.now();
    const turns = Array.isArray(parsed)
      ? parsed.filter(isPendingTurn).filter((turn) => {
          const timestamp = new Date(turn.updatedAt).getTime();

          return Number.isFinite(timestamp) && now - timestamp <= pendingChatTtlMs;
        })
      : [];

    writePendingTurns(turns);
    return turns;
  } catch {
    return [];
  }
}

function writePendingTurns(turns: PendingChatTurn[]): void {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(pendingChatStorageKey, JSON.stringify(turns.slice(-20)));
}

function upsertPendingTurn(turn: PendingChatTurn): void {
  const turns = readPendingTurns();
  const index = turns.findIndex((item) => item.id === turn.id);

  if (index >= 0) {
    turns[index] = turn;
  } else {
    turns.push(turn);
  }

  writePendingTurns(turns);
}

function patchPendingTurn(id: string, patch: Partial<PendingChatTurn>): PendingChatTurn | null {
  const turns = readPendingTurns();
  const index = turns.findIndex((turn) => turn.id === id);

  if (index < 0) {
    return null;
  }

  const current = turns[index];

  if (!current) {
    return null;
  }

  const next: PendingChatTurn = { ...current, ...patch, updatedAt: new Date().toISOString() };
  turns[index] = next;
  writePendingTurns(turns);

  return next;
}

function removePendingTurn(id: string): void {
  writePendingTurns(readPendingTurns().filter((turn) => turn.id !== id));
}

function pendingTurnsFor(characterId: string, conversationId?: string): PendingChatTurn[] {
  return readPendingTurns().filter((turn) => {
    if (turn.characterId !== characterId) {
      return false;
    }

    return conversationId ? turn.conversationId === conversationId : !turn.conversationId;
  });
}

function mergePendingMessages(
  messages: ChatMessage[],
  characterId: string,
  conversationId?: string,
): ChatMessage[] {
  const next = [...messages];

  for (const turn of pendingTurnsFor(characterId, conversationId)) {
    const alreadyVisible = next.some(
      (message) =>
        message.id === turn.id || (message.role === "user" && message.content === turn.content),
    );

    if (!alreadyVisible) {
      next.push({ id: turn.id, role: "user", content: turn.content });
    }
  }

  return next;
}

function isPendingTurn(value: unknown): value is PendingChatTurn {
  if (!value || typeof value !== "object") {
    return false;
  }

  const record = value as Record<string, unknown>;

  return (
    typeof record["id"] === "string" &&
    typeof record["characterId"] === "string" &&
    typeof record["content"] === "string" &&
    typeof record["adultModeRequested"] === "boolean" &&
    (record["status"] === "sending" || record["status"] === "failed") &&
    typeof record["attempts"] === "number" &&
    typeof record["createdAt"] === "string" &&
    typeof record["updatedAt"] === "string" &&
    (record["conversationId"] === undefined || typeof record["conversationId"] === "string")
  );
}

function isUsableConversationId(value: string | undefined): value is string {
  return Boolean(value && value !== "undefined" && value !== "null");
}

function unwrapCharacterPayload(payload: CharacterPayload): CharacterSummary | undefined {
  if ("character" in payload) {
    return payload.character;
  }

  const record = payload as Partial<CharacterSummary>;

  return typeof record.id === "string" && typeof record.name === "string"
    ? (record as CharacterSummary)
    : undefined;
}

function characterFromMember(member: ConversationMember): CharacterSummary {
  return {
    id: member.characterId,
    name: member.name,
    description: member.description,
    rating: member.rating,
    avatarUrl: member.avatarUrl,
    coverImageUrl: member.coverImageUrl,
  };
}

function conversationDisplayTitle(conversation: ConversationSummary): string {
  if (conversation.type === "group") {
    return (
      conversation.title?.trim() ||
      groupTitleFromMembers(conversation.members ?? []) ||
      "Group chat"
    );
  }

  return conversation.character.name;
}

function groupTitleFromMembers(members: ConversationMember[]): string {
  const visible = members
    .slice(0, 3)
    .map((member) => member.name)
    .join(", ");

  return members.length > 3 ? `${visible} +${members.length - 3}` : visible;
}

function assistantMessagesFromPayload(payload: ChatResponse) {
  if (payload.assistantMessages?.length) {
    return payload.assistantMessages;
  }

  return payload.assistantMessage ? [payload.assistantMessage] : [];
}

function ChatExperience() {
  const searchParams = useSearchParams();
  const requestedCharacterId = searchParams.get("characterId");
  const requestedConversationId = searchParams.get("conversationId");
  const forceFreshRoom = searchParams.get("new") === "1" || searchParams.get("room") === "new";
  const [directCharacter, setDirectCharacter] = useState<CharacterSummary | undefined>();
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [activeConversation, setActiveConversation] = useState<ConversationSummary | undefined>();
  const [selectedCharacterId, setSelectedCharacterId] = useState(requestedCharacterId ?? "");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [memories, setMemories] = useState<MemoryFact[]>([]);
  const [memoryEdits, setMemoryEdits] = useState<Record<string, string>>({});
  const [memoryDraft, setMemoryDraft] = useState("");
  const [tuningDraft, setTuningDraft] = useState("");
  const [memoryKind, setMemoryKind] = useState<MemoryKind>("preference");
  const [draft, setDraft] = useState("");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [isUnlocking, setIsUnlocking] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [adultModeEnabled, setAdultModeEnabled] = useState(false);
  const [deleteArmed, setDeleteArmed] = useState(false);
  const [isDeletingConversation, setIsDeletingConversation] = useState(false);
  const [trialStatus, setTrialStatus] = useState<TrialStatus | null>(null);
  const [evolution, setEvolution] = useState<EvolutionSummary | null>(null);
  const [typingMessageId, setTypingMessageId] = useState<string | null>(null);
  const [groupBuilderOpen, setGroupBuilderOpen] = useState(false);
  const [groupCandidates, setGroupCandidates] = useState<CharacterSummary[]>([]);
  const [groupCandidateSearch, setGroupCandidateSearch] = useState("");
  const [groupTitleDraft, setGroupTitleDraft] = useState("");
  const [groupSelection, setGroupSelection] = useState<string[]>([]);
  const [groupAddSelection, setGroupAddSelection] = useState<string[]>([]);
  const [isGroupSaving, setIsGroupSaving] = useState(false);
  const [mintModalTarget, setMintModalTarget] = useState<{ mediaId: string; characterId: string } | null>(null);
  const streamRef = useRef<HTMLDivElement | null>(null);
  const draftInputRef = useRef<HTMLInputElement | null>(null);
  const assistantBufferRef = useRef("");
  const assistantVisibleRef = useRef("");
  const assistantMessageIdRef = useRef<string | null>(null);
  const assistantDoneRef = useRef(false);
  const assistantTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const draftCharacterCount = draft.length;
  const draftNearLimit = draftCharacterCount > maxChatMessageChars * 0.9;
  const draftLimitProgress = Math.min(100, (draftCharacterCount / maxChatMessageChars) * 100);
  const draftRemaining = Math.max(0, maxChatMessageChars - draftCharacterCount);
  const draftIsEmpty = draft.trim().length === 0;
  const activeIsGroup = activeConversation?.type === "group";
  const activeGroupMembers =
    activeConversation?.type === "group" ? (activeConversation.members ?? []) : [];

  useEffect(() => {
    let cancelled = false;

    void loadChatShell(() => cancelled);

    return () => {
      cancelled = true;
    };
  }, [forceFreshRoom, requestedCharacterId, requestedConversationId]);

  useEffect(() => {
    streamRef.current?.scrollTo({
      top: streamRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages.length, messages.at(-1)?.content]);

  useEffect(() => () => resetAssistantTyping(false), []);

  useEffect(() => {
    if (!groupBuilderOpen && !(settingsOpen && activeIsGroup)) {
      return;
    }

    void loadGroupCandidates();
  }, [activeIsGroup, groupBuilderOpen, settingsOpen]);

  const selectedCharacter = useMemo(
    () =>
      activeConversation?.character ??
      (directCharacter?.id === selectedCharacterId ? directCharacter : undefined),
    [activeConversation, directCharacter, selectedCharacterId],
  );
  const groupCandidateResults = useMemo(() => {
    const query = groupCandidateSearch.trim().toLowerCase();
    const members = new Set(activeGroupMembers.map((member) => member.characterId));

    return groupCandidates
      .filter((character) => {
        if (members.has(character.id) && !groupBuilderOpen) {
          return false;
        }

        if (!query) {
          return true;
        }

        return [
          character.name,
          character.description,
          character.marketplacePreview ?? "",
          ...(character.tags ?? []),
        ]
          .join(" ")
          .toLowerCase()
          .includes(query);
      })
      .slice(0, 24);
  }, [activeGroupMembers, groupBuilderOpen, groupCandidateSearch, groupCandidates]);

  useEffect(() => {
    document.body.classList.toggle("chat-room-open", Boolean(selectedCharacter));

    return () => {
      document.body.classList.remove("chat-room-open");
    };
  }, [selectedCharacter]);

  useEffect(() => {
    if (!selectedCharacter || isSending) {
      return;
    }

    const stalePendingTurn = pendingTurnsFor(selectedCharacter.id, activeConversation?.id).find(
      (turn) =>
        turn.status === "sending" &&
        turn.attempts < 4 &&
        Date.now() - new Date(turn.updatedAt).getTime() > 2_500,
    );

    if (!stalePendingTurn) {
      return;
    }

    setMessages((current) =>
      mergePendingMessages(current, selectedCharacter.id, activeConversation?.id),
    );
    void submitPendingTurn({
      ...stalePendingTurn,
      attempts: stalePendingTurn.attempts + 1,
      updatedAt: new Date().toISOString(),
    });
  }, [activeConversation?.id, isSending, selectedCharacter?.id]);

  useEffect(() => {
    setDeleteArmed(false);
  }, [activeConversation?.id, settingsOpen]);

  const filteredConversations = useMemo(() => {
    const query = search.trim().toLowerCase();

    if (!query) {
      return conversations;
    }

    return conversations.filter((conversation) =>
      [
        conversationDisplayTitle(conversation),
        conversation.character.name,
        conversation.character.description,
        ...(conversation.members ?? []).flatMap((member) => [
          member.name,
          `@${member.mentionSlug}`,
          member.description,
        ]),
        conversation.lastMessage?.content ?? "",
      ]
        .join(" ")
        .toLowerCase()
        .includes(query),
    );
  }, [conversations, search]);

  async function loadGroupCandidates() {
    try {
      const path = groupCandidateSearch.trim()
        ? `/api/v1/characters/marketplace?query=${encodeURIComponent(groupCandidateSearch.trim())}`
        : "/api/v1/characters/marketplace";
      const payload = await apiJson<MarketplaceResponse>(path);
      setGroupCandidates(Array.isArray(payload.characters) ? payload.characters : []);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Could not load characters.");
    }
  }

  async function loadChatShell(isCancelled: () => boolean) {
    try {
      const [conversationPayload, settingsPayload] = await Promise.all([
        apiJson<{ conversations: ConversationSummary[] }>("/api/v1/chat/conversations"),
        apiJson<SettingsResponse>("/api/v1/settings"),
      ]);

      if (isCancelled()) {
        return;
      }

      const conversationList = Array.isArray(conversationPayload.conversations)
        ? conversationPayload.conversations
        : [];

      setConversations(conversationList);
      setAdultModeEnabled(settingsPayload.adultModeEnabled);
      setStatus("");

      if (requestedConversationId) {
        if (activeConversation?.id === requestedConversationId) {
          setDirectCharacter(undefined);
          setSelectedCharacterId(activeConversation.characterId);
          return;
        }

        const requestedConversation = conversationList.find(
          (conversation) => conversation.id === requestedConversationId,
        );

        if (requestedConversation) {
          await openConversation(requestedConversation);
          return;
        }

        setDirectCharacter(undefined);
        setActiveConversation(undefined);
        setSelectedCharacterId("");
        setMessages([]);
        setMemories([]);
        setEvolution(null);
        setStatus("That room is not available on this account.");
        return;
      }

      if (!requestedCharacterId) {
        setDirectCharacter(undefined);
        return;
      }

      const existingConversation = forceFreshRoom
        ? undefined
        : conversationList.find(
            (conversation) =>
              conversation.type !== "group" && conversation.characterId === requestedCharacterId,
          );

      if (existingConversation) {
        await openConversation(existingConversation);
        return;
      }

      const characterPayload = await apiJson<CharacterPayload>(
        `/api/v1/characters/${encodeURIComponent(requestedCharacterId)}`,
      );
      const character = unwrapCharacterPayload(characterPayload);

      if (!isCancelled() && character) {
        startCharacterChat(character);
        replaceWithFreshRoom(character.id);
      }
    } catch (error) {
      if (!isCancelled()) {
        setStatus(error instanceof Error ? error.message : "Could not load chats.");
      }
    }
  }

  async function refreshConversations() {
    const payload = await apiJson<{ conversations: ConversationSummary[] }>(
      "/api/v1/chat/conversations",
    );
    const conversationList = Array.isArray(payload.conversations) ? payload.conversations : [];

    setConversations(conversationList);
    return conversationList;
  }

  async function openConversation(conversation: ConversationSummary) {
    setActiveConversation(conversation);
    setSelectedCharacterId(conversation.characterId);
    setDirectCharacter(undefined);
    setSettingsOpen(false);
    setDeleteArmed(false);
    setStatus("");
    setTrialStatus(null);
    replaceWithConversation(conversation.id);

    try {
      const payload = await apiJson<{
        messages: Array<{
          id: string;
          role: "assistant" | "user" | "system";
          content: string;
          speaker?: ConversationMember | null;
        }>;
        evolution?: EvolutionSummary | null;
      }>(`/api/v1/chat/conversations/${encodeURIComponent(conversation.id)}/messages`);
      const sourceMessages = Array.isArray(payload.messages) ? payload.messages : [];
      const persistedMessages = sourceMessages
        .filter(
          (
            message,
          ): message is {
            id: string;
            role: "assistant" | "user";
            content: string;
            speaker?: ConversationMember | null;
          } => message.role === "assistant" || message.role === "user",
        )
        .map((message) => ({
          id: message.id,
          role: message.role,
          content: message.content,
          speaker: message.speaker ?? null,
        }));
      setMessages(
        mergePendingMessages(persistedMessages, conversation.characterId, conversation.id),
      );
      setEvolution(payload.evolution ?? null);
      if (conversation.type === "group") {
        setMemories([]);
        setMemoryEdits({});
      } else {
        await loadScopedMemories(conversation.characterId, conversation.id);
      }
      setStatus("");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Could not open this chat.");
    }
  }

  function startCharacterChat(character: CharacterSummary) {
    resetAssistantTyping();
    setDirectCharacter(character);
    setActiveConversation(undefined);
    setSelectedCharacterId(character.id);
    setMessages(
      mergePendingMessages(
        [
          {
            id: "intro",
            role: "assistant",
            content:
              character.greeting?.trim() ||
              `*${character.name} settles into the room with you.* Tell me where you want the scene to begin.`,
          },
        ],
        character.id,
      ),
    );
    setMemories([]);
    setMemoryEdits({});
    setMemoryDraft("");
    setTuningDraft("");
    setDraft("");
    setEvolution(null);
    setTrialStatus(
      character.access?.type === "trial" || character.access?.type === "locked"
        ? {
            limit: character.access.trialLimit,
            used: character.access.trialUsed,
            remaining: character.access.trialRemaining,
          }
        : null,
    );
    setSettingsOpen(false);
    setDeleteArmed(false);
    setStatus("");
  }

  function toggleGroupSelection(characterId: string) {
    setGroupSelection((current) => {
      if (current.includes(characterId)) {
        return current.filter((id) => id !== characterId);
      }

      return current.length >= 10 ? current : [...current, characterId];
    });
  }

  function toggleGroupAddSelection(characterId: string) {
    const remainingSlots = Math.max(0, 10 - activeGroupMembers.length);

    setGroupAddSelection((current) => {
      if (current.includes(characterId)) {
        return current.filter((id) => id !== characterId);
      }

      return current.length >= remainingSlots ? current : [...current, characterId];
    });
  }

  function resetGroupBuilder() {
    setGroupBuilderOpen(false);
    setGroupTitleDraft("");
    setGroupSelection([]);
    setGroupCandidateSearch("");
  }

  async function createGroupConversation() {
    if (groupSelection.length < 2) {
      setStatus("Choose at least two bots.");
      return;
    }

    setIsGroupSaving(true);
    setStatus("Creating group...");

    try {
      const payload = await apiJson<{ conversation: { id: string } }>(
        "/api/v1/chat/group-conversations",
        {
          method: "POST",
          body: JSON.stringify({
            title: groupTitleDraft,
            characterIds: groupSelection,
          }),
        },
      );
      const nextConversations = await refreshConversations();
      const conversation = nextConversations.find((item) => item.id === payload.conversation.id);

      if (conversation) {
        resetGroupBuilder();
        await openConversation(conversation);
      }

      setStatus("");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Group could not be created.");
    } finally {
      setIsGroupSaving(false);
    }
  }

  async function addMembersToActiveGroup() {
    if (!activeConversation || !activeIsGroup || groupAddSelection.length === 0) {
      return;
    }

    setIsGroupSaving(true);
    setStatus("Updating group...");

    try {
      await apiJson<{ ok: boolean; members: ConversationMember[] }>(
        `/api/v1/chat/conversations/${encodeURIComponent(activeConversation.id)}/members`,
        {
          method: "POST",
          body: JSON.stringify({ characterIds: groupAddSelection }),
        },
      );
      const nextConversations = await refreshConversations();
      const conversation = nextConversations.find((item) => item.id === activeConversation.id);

      if (conversation) {
        setActiveConversation(conversation);
      }

      setGroupAddSelection([]);
      setStatus("");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Group could not be updated.");
    } finally {
      setIsGroupSaving(false);
    }
  }

  async function removeGroupMember(characterId: string) {
    if (!activeConversation || !activeIsGroup) {
      return;
    }

    setIsGroupSaving(true);
    setStatus("Updating group...");

    try {
      await apiJson<{ ok: boolean; members: ConversationMember[] }>(
        `/api/v1/chat/conversations/${encodeURIComponent(
          activeConversation.id,
        )}/members/${encodeURIComponent(characterId)}`,
        { method: "DELETE" },
      );
      const nextConversations = await refreshConversations();
      const conversation = nextConversations.find((item) => item.id === activeConversation.id);

      if (conversation) {
        setActiveConversation(conversation);
        setSelectedCharacterId(conversation.characterId);
      }

      setStatus("");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Group member could not be removed.");
    } finally {
      setIsGroupSaving(false);
    }
  }

  function insertMention(member: ConversationMember) {
    const handle = `@${member.mentionSlug}`;
    setDraft((current) => {
      const trimmedEnd = current.replace(/\s+$/g, "");
      const prefix = trimmedEnd ? `${trimmedEnd} ` : "";

      return `${prefix}${handle} `;
    });
    window.requestAnimationFrame(() => draftInputRef.current?.focus());
  }

  async function startFreshRoom(character = selectedCharacter) {
    if (!character) {
      return;
    }

    setStatus(`Starting a fresh room with ${character.name}...`);

    try {
      const payload = await apiJson<CharacterPayload>(
        `/api/v1/characters/${encodeURIComponent(character.id)}`,
      );
      const nextCharacter = unwrapCharacterPayload(payload) ?? character;

      startCharacterChat(nextCharacter);
      replaceWithFreshRoom(nextCharacter.id);
    } catch {
      startCharacterChat(character);
      replaceWithFreshRoom(character.id);
    }
  }

  async function deleteCurrentConversation() {
    if (!activeConversation || isDeletingConversation) {
      return;
    }

    if (!deleteArmed) {
      setDeleteArmed(true);
      setStatus("Tap Delete forever to remove this room.");
      return;
    }

    const deletedConversationId = activeConversation.id;
    setIsDeletingConversation(true);
    setStatus("Deleting chat...");

    try {
      await apiJson<{ ok: boolean; conversationId: string }>(
        `/api/v1/chat/conversations/${encodeURIComponent(deletedConversationId)}`,
        { method: "DELETE" },
      );
      resetAssistantTyping();
      await refreshConversations();
      setDirectCharacter(undefined);
      setActiveConversation(undefined);
      setSelectedCharacterId("");
      setMessages([]);
      setMemories([]);
      setMemoryEdits({});
      setMemoryDraft("");
      setTuningDraft("");
      setDraft("");
      setEvolution(null);
      setTrialStatus(null);
      setSettingsOpen(false);
      setDeleteArmed(false);
      replaceChatLocation();
      setStatus("Chat deleted.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Could not delete this chat.");
    } finally {
      setIsDeletingConversation(false);
    }
  }

  async function loadScopedMemories(nextCharacterId: string, nextConversationId: string) {
    if (!isUsableConversationId(nextConversationId)) {
      setMemories([]);
      setMemoryEdits({});
      return;
    }

    try {
      const payload = await apiJson<MemoriesResponse>(
        `/api/v1/memories?characterId=${encodeURIComponent(
          nextCharacterId,
        )}&conversationId=${encodeURIComponent(nextConversationId)}`,
      );
      const sourceMemories = Array.isArray(payload.memories) ? payload.memories : [];
      const activeMemories = sourceMemories.filter((memory) => memory.isActive);
      setMemories(activeMemories);
      setMemoryEdits(Object.fromEntries(activeMemories.map((memory) => [memory.id, memory.text])));
    } catch {
      setMemories([]);
      setMemoryEdits({});
    }
  }

  async function sendMessage() {
    const content = draft.trim();

    if (!selectedCharacter || isSending) {
      return;
    }

    if (!content) {
      setStatus("Write a message before sending.");
      return;
    }

    if (draft.length > maxChatMessageChars) {
      setStatus(`Messages must be ${maxChatMessageChars.toLocaleString()} characters or less.`);
      return;
    }

    if (!activeIsGroup && isPaidLocked(selectedCharacter, trialStatus)) {
      setStatus("Free trial finished. Unlock this character to keep chatting.");
      return;
    }

    const userMessage: ChatMessage = {
      id: crypto.randomUUID(),
      role: "user",
      content,
    };
    const now = new Date().toISOString();
    const pendingTurn: PendingChatTurn = {
      id: userMessage.id,
      characterId: selectedCharacter.id,
      content,
      adultModeRequested: shouldRequestAdultMode(selectedCharacter, adultModeEnabled),
      status: "sending",
      attempts: 1,
      createdAt: now,
      updatedAt: now,
      ...(activeConversation?.id ? { conversationId: activeConversation.id } : {}),
    };

    resetAssistantTyping();
    setDraft("");
    setMessages((current) => [...current, userMessage]);
    upsertPendingTurn(pendingTurn);
    await submitPendingTurn(pendingTurn);
  }

  async function submitPendingTurn(turn: PendingChatTurn) {
    if (!selectedCharacter || isSending) {
      return;
    }

    setIsSending(true);
    setStatus("Sending...");

    try {
      const response = await fetch("/api/v1/chat/messages/stream", {
        method: "POST",
        headers: {
          Accept: "text/event-stream",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          conversationId: turn.conversationId ?? activeConversation?.id,
          characterId: turn.characterId,
          content: turn.content,
          clientMessageId: turn.id,
          adultModeRequested: turn.adultModeRequested,
        }),
      });

      if (!response.ok) {
        throw new Error(`Chat stream failed with HTTP ${response.status}`);
      }

      let nextConversationId = turn.conversationId ?? activeConversation?.id;
      let assistantId: string | undefined;
      let assistantAdded = false;
      let replayingDuplicate = false;
      let wasBlocked = false;
      let noResponseQueued = false;

      await readChatStream(response, {
        ready: () => setStatus(""),
        blocked: (payload) => {
          wasBlocked = true;
          removePendingTurn(turn.id);
          resetAssistantTyping();
          setStatus(payload.safety?.reasonCode ?? "Message was not accepted.");
        },
        meta: (payload) => {
          nextConversationId = payload.conversationId ?? nextConversationId;
          replayingDuplicate = Boolean(payload.duplicate);
          if (nextConversationId) {
            patchPendingTurn(turn.id, { conversationId: nextConversationId, status: "sending" });
          }

          if (payload.trial) {
            setTrialStatus(payload.trial);
          }

          if (payload.evolution) {
            setEvolution(payload.evolution);
          }

          const assistantPayloads = assistantMessagesFromPayload(payload);

          if (assistantPayloads.length && !assistantAdded) {
            assistantId = assistantPayloads[0]?.id;
            assistantAdded = true;
            for (const message of assistantPayloads) {
              ensureAssistantMessage(message.id, {
                replaceExisting: replayingDuplicate,
                speaker: message.speaker ?? null,
              });
            }
          }
        },
        token: (payload) => {
          if (replayingDuplicate) {
            return;
          }

          const contentChunk = payload.content ?? "";
          const tokenMessageId = payload.messageId;

          if (tokenMessageId) {
            assistantId = assistantId ?? tokenMessageId;
            assistantAdded = true;
            appendAssistantToken(tokenMessageId, contentChunk, payload.speaker ?? null);
            return;
          }

          if (!assistantAdded) {
            assistantId = crypto.randomUUID();
            assistantAdded = true;
            queueAssistantText(assistantId, contentChunk);
            return;
          }

          if (assistantId) {
            queueAssistantText(assistantId, contentChunk);
          }
        },
        done: (payload) => {
          if (!payload.accepted) {
            removePendingTurn(turn.id);
            return;
          }

          nextConversationId = payload.conversationId ?? nextConversationId;
          removePendingTurn(turn.id);
          const finalAssistantMessages = assistantMessagesFromPayload(payload);

          if (finalAssistantMessages.length) {
            for (const message of finalAssistantMessages) {
              finalizeAssistantMessage(message.id, message.content, {
                speaker: message.speaker ?? null,
              });
            }
          } else if (payload.group) {
            const publicRoomPost =
              payload.group.messageAudience === "room" && payload.group.botResponseQueued === false;
            setTypingMessageId(null);
            resetAssistantTyping(false);
            if (publicRoomPost) {
              setStatus("");
            } else {
              noResponseQueued = true;
              setStatus("No bot answered.");
            }
          } else if (payload.assistantMessage) {
            assistantId = assistantId ?? payload.assistantMessage.id;
            completeAssistantText(assistantId, payload.assistantMessage.content, {
              replace: replayingDuplicate,
            });
          } else {
            assistantDoneRef.current = true;
          }

          if (payload.trial) {
            setTrialStatus(payload.trial);
          }

          if (payload.evolution) {
            setEvolution(payload.evolution);
          }
        },
        error: (payload) => {
          resetAssistantTyping();
          if (payload.code === "ENTITLEMENT_REQUIRED" && payload.details) {
            setTrialStatus({
              limit: numberDetail(payload.details, "trialLimit"),
              used: numberDetail(payload.details, "trialUsed"),
              remaining: numberDetail(payload.details, "trialRemaining"),
            });
          }
          throw new ChatStreamError(payload.message ?? "Chat stream failed.", payload.code);
        },
      });

      if (nextConversationId && !wasBlocked) {
        const nextConversations = await refreshConversations();
        const conversation = nextConversations.find((item) => item.id === nextConversationId);

        if (conversation) {
          setActiveConversation(conversation);
          setSelectedCharacterId(conversation.characterId);
          replaceWithConversation(conversation.id);
        }

        if (conversation?.type === "group") {
          setMemories([]);
          setMemoryEdits({});
        } else {
          await loadScopedMemories(turn.characterId, nextConversationId);
        }
      }

      if (!wasBlocked && !noResponseQueued) {
        setStatus("");
      }
    } catch (error) {
      if (error instanceof ChatStreamError && error.code === "CONFLICT") {
        patchPendingTurn(turn.id, { status: "sending", attempts: turn.attempts + 1 });
        setStatus("Message is still saving...");
        window.setTimeout(() => {
          if (!isSending) {
            const pending = readPendingTurns().find((item) => item.id === turn.id);

            if (pending && pending.attempts < 4) {
              void submitPendingTurn(pending);
            }
          }
        }, 1_400);
        return;
      }

      patchPendingTurn(turn.id, { status: "failed" });
      setStatus(error instanceof Error ? error.message : "Message failed.");
    } finally {
      setIsSending(false);
    }
  }

  function ensureAssistantMessage(
    messageId: string,
    options: { replaceExisting?: boolean; speaker?: ConversationMember | null } = {},
  ) {
    assistantMessageIdRef.current = messageId;
    setTypingMessageId(messageId);
    setMessages((current) =>
      current.some((message) => message.id === messageId)
        ? current.map((message) =>
            message.id === messageId && options.replaceExisting
              ? { ...message, content: "", speaker: options.speaker ?? message.speaker ?? null }
              : message.id === messageId && options.speaker
                ? { ...message, speaker: options.speaker }
                : message,
          )
        : [
            ...current,
            {
              id: messageId,
              role: "assistant",
              content: "",
              speaker: options.speaker ?? null,
            },
          ],
    );
    startAssistantAnimation();
  }

  function appendAssistantToken(
    messageId: string,
    content: string,
    speaker?: ConversationMember | null,
  ) {
    resetAssistantTyping(false);
    setTypingMessageId(messageId);
    setMessages((current) =>
      current.some((message) => message.id === messageId)
        ? current.map((message) =>
            message.id === messageId
              ? {
                  ...message,
                  content: `${message.content}${content}`,
                  speaker: speaker ?? message.speaker ?? null,
                }
              : message,
          )
        : [
            ...current,
            {
              id: messageId,
              role: "assistant",
              content,
              speaker: speaker ?? null,
            },
          ],
    );
  }

  function finalizeAssistantMessage(
    messageId: string,
    finalContent: string,
    options: { speaker?: ConversationMember | null } = {},
  ) {
    resetAssistantTyping(false);
    setTypingMessageId(null);
    setMessages((current) => {
      const nextMessage: ChatMessage = {
        id: messageId,
        role: "assistant",
        content: finalContent,
        speaker: options.speaker ?? null,
      };

      return current.some((message) => message.id === messageId)
        ? current.map((message) =>
            message.id === messageId
              ? {
                  ...nextMessage,
                  speaker: options.speaker ?? message.speaker ?? null,
                }
              : message,
          )
        : [...current, nextMessage];
    });
  }

  function queueAssistantText(messageId: string, content: string) {
    ensureAssistantMessage(messageId);
    assistantDoneRef.current = false;
    assistantBufferRef.current += content;
    startAssistantAnimation();
  }

  function completeAssistantText(
    messageId: string,
    finalContent: string,
    options: { replace?: boolean } = {},
  ) {
    if (options.replace) {
      resetAssistantTyping(false);
      assistantMessageIdRef.current = messageId;
      setTypingMessageId(null);
      setMessages((current) => {
        const nextMessage: ChatMessage = {
          id: messageId,
          role: "assistant",
          content: finalContent,
        };

        return current.some((message) => message.id === messageId)
          ? current.map((message) => (message.id === messageId ? nextMessage : message))
          : [...current, nextMessage];
      });
      resetAssistantTyping();
      return;
    }

    ensureAssistantMessage(messageId);
    const visible = assistantVisibleRef.current;
    const queued = `${visible}${assistantBufferRef.current}`;

    if (finalContent.startsWith(queued)) {
      assistantBufferRef.current += finalContent.slice(queued.length);
    } else if (!queued.startsWith(finalContent)) {
      assistantBufferRef.current = finalContent.startsWith(visible)
        ? finalContent.slice(visible.length)
        : finalContent;
      assistantVisibleRef.current = finalContent.startsWith(visible) ? visible : "";
      if (!finalContent.startsWith(visible)) {
        setMessages((current) =>
          current.map((message) =>
            message.id === messageId ? { ...message, content: "" } : message,
          ),
        );
      }
    }

    assistantDoneRef.current = true;
    startAssistantAnimation();
  }

  function startAssistantAnimation() {
    if (assistantTimerRef.current) {
      return;
    }

    assistantTimerRef.current = setInterval(() => {
      const messageId = assistantMessageIdRef.current;

      if (!messageId) {
        resetAssistantTyping();
        return;
      }

      if (!assistantBufferRef.current) {
        if (assistantDoneRef.current) {
          resetAssistantTyping();
        }

        return;
      }

      const take = assistantBufferRef.current.length > 180 ? 10 : 4;
      const chunk = assistantBufferRef.current.slice(0, take);
      assistantBufferRef.current = assistantBufferRef.current.slice(take);
      assistantVisibleRef.current += chunk;
      setMessages((current) =>
        current.map((message) =>
          message.id === messageId
            ? { ...message, content: `${message.content}${chunk}` }
            : message,
        ),
      );

      if (!assistantBufferRef.current && assistantDoneRef.current) {
        resetAssistantTyping();
      }
    }, 28);
  }

  function resetAssistantTyping(clearMessageState = true) {
    if (assistantTimerRef.current) {
      clearInterval(assistantTimerRef.current);
      assistantTimerRef.current = null;
    }

    assistantBufferRef.current = "";
    assistantVisibleRef.current = "";
    assistantMessageIdRef.current = null;
    assistantDoneRef.current = false;

    if (clearMessageState) {
      setTypingMessageId(null);
    }
  }

  async function addMemory(kind: MemoryKind, text: string) {
    const content = text.trim();

    if (!content || !selectedCharacter) {
      return;
    }

    setStatus("Saving memory...");

    try {
      const payload = await apiJson<{ conversationId: string; evolution?: EvolutionSummary }>(
        "/api/v1/memories",
        {
          method: "POST",
          body: JSON.stringify({
            characterId: selectedCharacter.id,
            ...(isUsableConversationId(activeConversation?.id)
              ? { conversationId: activeConversation.id }
              : {}),
            kind,
            text: content,
            importance: kind === "style" || kind === "boundary" ? 0.82 : 0.66,
          }),
        },
      );
      const nextConversations = await refreshConversations();
      const conversation = nextConversations.find((item) => item.id === payload.conversationId);

      if (conversation) {
        setActiveConversation(conversation);
        replaceWithConversation(conversation.id);
      }

      await loadScopedMemories(selectedCharacter.id, payload.conversationId);
      if (payload.evolution) {
        setEvolution(payload.evolution);
      }
      setStatus("");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Memory save failed.");
    }
  }

  async function saveMemory(memory: MemoryFact) {
    const text = memoryEdits[memory.id]?.trim();

    if (!text) {
      return;
    }

    setStatus("Updating memory...");

    try {
      const payload = await apiJson<{ evolution?: EvolutionSummary | null }>(
        `/api/v1/memories/${encodeURIComponent(memory.id)}`,
        {
          method: "PATCH",
          body: JSON.stringify({ text, importance: memory.importance }),
        },
      );
      if (isUsableConversationId(memory.conversationId)) {
        await loadScopedMemories(memory.characterId, memory.conversationId);
      }
      setEvolution(payload.evolution ?? null);
      setStatus("");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Memory update failed.");
    }
  }

  async function removeMemory(memory: MemoryFact) {
    setStatus("Removing memory...");

    try {
      const payload = await apiJson<{ evolution?: EvolutionSummary | null }>(
        `/api/v1/memories/${encodeURIComponent(memory.id)}`,
        {
          method: "DELETE",
        },
      );
      if (isUsableConversationId(memory.conversationId)) {
        await loadScopedMemories(memory.characterId, memory.conversationId);
      }
      setEvolution(payload.evolution ?? null);
      setStatus("");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Memory delete failed.");
    }
  }

  async function unlockSelectedCharacter() {
    if (!selectedCharacter || isUnlocking) {
      return;
    }

    setIsUnlocking(true);
    setStatus(`Preparing Stellar unlock for ${selectedCharacter.name}...`);

    try {
      const purchase = await apiJson<CharacterPurchaseResponse>(
        "/api/v1/monetization/character-purchases",
        {
          method: "POST",
          body: JSON.stringify({ characterId: selectedCharacter.id, provider: "stellar" }),
        },
      );

      if (purchase.trial) {
        setTrialStatus({
          limit: purchase.trialLimit ?? 30,
          used: purchase.trialUsed ?? 0,
          remaining: purchase.trialRemaining ?? 0,
        });
        setStatus(`${purchase.trialRemaining ?? 0} free trial messages left.`);
        return;
      }

      if (purchase.activated) {
        setTrialStatus(null);
        setStatus("Unlocked.");
        return;
      }

      if (purchase.provider !== "stellar" || !purchase.payment || !purchase.internalPurchaseId) {
        setStatus("Checkout could not start for this character.");
        return;
      }

      setStatus(
        `Confirm ${purchase.payment.amountDisplay} ${purchase.payment.assetCode} in your Stellar wallet.`,
      );
      await completeStellarPayment({
        payment: purchase.payment,
        verifyPath: "/api/v1/monetization/character-purchases/verify",
        verifyBody: {
          internalPurchaseId: purchase.internalPurchaseId,
          paymentId: purchase.payment.id,
        },
        onStatus: setStatus,
      });
      setTrialStatus(null);
      setStatus("Unlocked.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Could not unlock character.");
    } finally {
      setIsUnlocking(false);
    }
  }

  const paidLocked =
    selectedCharacter && !activeIsGroup ? isPaidLocked(selectedCharacter, trialStatus) : false;

  return (
    <div className={settingsOpen ? "app-page chat-layer settings-active" : "app-page chat-layer"}>
      <aside className={groupBuilderOpen ? "chat-inbox group-builder-active" : "chat-inbox"}>
        <div className="chat-inbox-header">
          <div>
            <span className="section-label">
              <MessageSquareText size={15} /> Chats
            </span>
            <h1>Your rooms</h1>
          </div>
          <button
            className={groupBuilderOpen ? "icon-control active" : "icon-control"}
            type="button"
            aria-label="New group chat"
            title="New group chat"
            onClick={() => setGroupBuilderOpen((current) => !current)}
          >
            <UsersRound size={18} />
          </button>
        </div>

        <label className="premium-search">
          <Search size={16} />
          <input
            aria-label="Search chats"
            placeholder="Search chats"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </label>

        {groupBuilderOpen ? (
          <section className="group-builder-panel">
            <div className="panel-heading split">
              <div>
                <Hash size={18} />
                <h3>New group</h3>
              </div>
              <button
                className="icon-control compact-icon"
                type="button"
                aria-label="Close group builder"
                title="Close group builder"
                onClick={resetGroupBuilder}
              >
                <X size={16} />
              </button>
            </div>
            <input
              aria-label="Group name"
              maxLength={80}
              placeholder="Group name"
              value={groupTitleDraft}
              onChange={(event) => setGroupTitleDraft(event.target.value)}
            />
            <label className="premium-search compact-search">
              <Search size={15} />
              <input
                aria-label="Search bots"
                placeholder="Search bots"
                value={groupCandidateSearch}
                onChange={(event) => setGroupCandidateSearch(event.target.value)}
              />
            </label>
            <div className="group-candidate-list premium-scroll">
              {groupCandidateResults.map((character) => {
                const active = groupSelection.includes(character.id);

                return (
                  <button
                    className={active ? "group-candidate active" : "group-candidate"}
                    type="button"
                    key={character.id}
                    aria-label={
                      active
                        ? `Remove ${character.name} from group selection`
                        : `Add ${character.name} to group selection`
                    }
                    aria-pressed={active}
                    disabled={!active && groupSelection.length >= 10}
                    onClick={() => toggleGroupSelection(character.id)}
                  >
                    <Avatar character={character} small />
                    <span>
                      <strong>{character.name}</strong>
                      <small>{character.rating}</small>
                    </span>
                    <span className="group-selection-indicator" aria-hidden="true">
                      {active ? <X size={14} /> : <Plus size={14} />}
                    </span>
                  </button>
                );
              })}
            </div>
            <button
              className="primary-action compact"
              type="button"
              disabled={isGroupSaving || groupSelection.length < 2}
              onClick={() => void createGroupConversation()}
            >
              <UsersRound size={16} /> Create {groupSelection.length}/10
            </button>
          </section>
        ) : null}

        <div className="chat-list premium-scroll">
          {filteredConversations.map((conversation) => (
            <button
              className={
                activeConversation?.id === conversation.id ? "chat-thread active" : "chat-thread"
              }
              type="button"
              key={conversation.id}
              onClick={() => void openConversation(conversation)}
            >
              {conversation.type === "group" ? (
                <GroupAvatarStack members={conversation.members ?? []} />
              ) : (
                <Avatar character={conversation.character} />
              )}
              <div className="chat-thread-copy">
                <div className="chat-thread-title">
                  <strong>{conversationDisplayTitle(conversation)}</strong>
                  <em>{formatRoomTimestamp(conversation.updatedAt)}</em>
                </div>
                <small>
                  {conversation.lastMessage?.speaker
                    ? `${conversation.lastMessage.speaker.name}: `
                    : ""}
                  {renderRoleplayPreview(conversation.lastMessage?.content ?? "No messages yet")}
                </small>
              </div>
              <Clock3 size={14} />
            </button>
          ))}

          {filteredConversations.length === 0 ? (
            <div className="mini-empty">
              <Bot size={18} />
              <p>No chats yet. Open Discover to start your first room.</p>
            </div>
          ) : null}
        </div>
      </aside>

      <section className={selectedCharacter ? "chat-room active" : "chat-room"}>
        {selectedCharacter ? (
          <>
            <header className="chat-room-header">
              <button
                className="icon-control mobile-back"
                type="button"
                aria-label="Back to chats"
                title="Back to chats"
                onClick={() => {
                  setSelectedCharacterId("");
                  setActiveConversation(undefined);
                  setMessages([]);
                  setMemories([]);
                  setEvolution(null);
                  setTrialStatus(null);
                  setDeleteArmed(false);
                  replaceChatLocation();
                }}
              >
                <ArrowLeft size={18} />
              </button>
              {activeIsGroup ? (
                <GroupAvatarStack members={activeGroupMembers} />
              ) : (
                <Avatar character={selectedCharacter} />
              )}
              <div>
                <h2>
                  {activeConversation
                    ? conversationDisplayTitle(activeConversation)
                    : selectedCharacter.name}
                </h2>
                <p>
                  {activeIsGroup
                    ? `${activeGroupMembers.length} bots | ${formatRoomTimestamp(
                        activeConversation?.updatedAt ?? new Date().toISOString(),
                      )} room`
                    : `${selectedCharacter.rating} mode${
                        activeConversation
                          ? ` | ${formatRoomTimestamp(
                              activeConversation.updatedAt,
                            )} room | ${memories.length} saved memories`
                          : " | fresh room"
                      }`}
                  {!activeIsGroup && trialStatus && selectedCharacter.monetizationEnabled
                    ? ` | trial ${trialStatus.remaining}/${trialStatus.limit}`
                    : ""}
                </p>
              </div>
              <div className="chat-actions">
                {!activeIsGroup ? (
                  <button
                    className="icon-control"
                    type="button"
                    aria-label="Start fresh room"
                    title="Start fresh room"
                    onClick={() => void startFreshRoom()}
                  >
                    <RotateCcw size={18} />
                  </button>
                ) : null}
                <button
                  className={settingsOpen ? "icon-control active" : "icon-control"}
                  type="button"
                  aria-label="Chat settings"
                  title="Chat settings"
                  onClick={() => setSettingsOpen((current) => !current)}
                >
                  {settingsOpen ? <X size={18} /> : <SlidersHorizontal size={18} />}
                </button>
              </div>
            </header>

            <div className="message-stream premium-scroll" ref={streamRef}>
              {messages.map((message) => (
                <div
                  className={[
                    "message-row",
                    message.role,
                    activeIsGroup &&
                    message.role === "user" &&
                    !messageMentionsGroupMember(message.content, activeGroupMembers)
                      ? "room-message"
                      : "",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                  key={message.id}
                >
                  {activeIsGroup && message.role === "assistant" && message.speaker ? (
                    <div className="message-speaker">
                      <Avatar character={characterFromMember(message.speaker)} small />
                      <span>{message.speaker.name}</span>
                      <small>@{message.speaker.mentionSlug}</small>
                    </div>
                  ) : null}
                  <div className="message-bubble">
                    {message.content ? (
                      renderChatContent(
                        parseChatContent(message.content),
                        message.speaker?.characterId ?? selectedCharacter.id,
                        (mediaId) => setMintModalTarget({ mediaId, characterId: message.speaker?.characterId ?? selectedCharacter.id })
                      )
                    ) : message.id === typingMessageId ? (
                      <span className="typing-indicator" aria-label="Typing">
                        <i />
                        <i />
                        <i />
                      </span>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>

            {paidLocked ? (
              <div className="chat-unlock-panel">
                <div>
                  <strong>Trial complete</strong>
                  <span>
                    Unlock {selectedCharacter.name} for{" "}
                    {money(selectedCharacter.priceCents ?? 0, "USD")} to keep this room evolving.
                  </span>
                </div>
                <button
                  className="primary-action compact"
                  type="button"
                  disabled={isUnlocking}
                  onClick={() => void unlockSelectedCharacter()}
                >
                  <Lock size={16} /> Unlock
                </button>
              </div>
            ) : (
              <form
                className="chat-composer"
                onSubmit={(event) => {
                  event.preventDefault();
                  void sendMessage();
                }}
              >
                {activeIsGroup ? (
                  <div className="mention-strip" aria-label="Mention bot">
                    {activeGroupMembers.map((member) => (
                      <button
                        type="button"
                        key={member.characterId}
                        onClick={() => insertMention(member)}
                      >
                        <AtSign size={14} />
                        <span>{member.mentionSlug}</span>
                      </button>
                    ))}
                  </div>
                ) : null}
                <div
                  className="chat-composer-field"
                  style={{ "--chat-limit-progress": `${draftLimitProgress}%` } as CSSProperties}
                >
                  <input
                    ref={draftInputRef}
                    aria-describedby="chat-message-limit"
                    aria-label={
                      activeIsGroup
                        ? `Message ${
                            activeConversation
                              ? conversationDisplayTitle(activeConversation)
                              : selectedCharacter.name
                          }`
                        : `Message ${selectedCharacter.name}`
                    }
                    maxLength={maxChatMessageChars}
                    placeholder={
                      activeIsGroup
                        ? "Message room or @bot..."
                        : `Message ${selectedCharacter.name}...`
                    }
                    value={draft}
                    onChange={(event) => {
                      setDraft(event.target.value);
                      if (
                        status === "Write a message before sending." ||
                        status === "No bot answered."
                      ) {
                        setStatus("");
                      }
                    }}
                  />
                  <span
                    className={
                      draftNearLimit ? "chat-composer-count near-limit" : "chat-composer-count"
                    }
                    id="chat-message-limit"
                    aria-live="polite"
                    aria-label={`${draftCharacterCount.toLocaleString()} of ${maxChatMessageChars.toLocaleString()} characters used. ${draftRemaining.toLocaleString()} remaining.`}
                  >
                    <span className="chat-composer-meter" aria-hidden="true">
                      <span />
                    </span>
                    <span>
                      {draftCharacterCount.toLocaleString()} /{" "}
                      {maxChatMessageChars.toLocaleString()}
                    </span>
                  </span>
                </div>
                <button
                  className="send-control"
                  type="submit"
                  aria-label="Send message"
                  disabled={isSending || draftIsEmpty}
                >
                  <Send size={18} />
                </button>
              </form>
            )}
          </>
        ) : (
          <div className="chat-empty-state">
            <HanaLogo size={82} />
            <span className="section-label">
              <Sparkles size={15} /> Hana Chat
            </span>
            <h2>Choose a chat to continue.</h2>
            <p>
              Your conversations stay organized by character, with memory and tuning inside each
              room.
            </p>
          </div>
        )}
      </section>

      {settingsOpen && selectedCharacter ? (
        <aside className="chat-settings-panel">
          <div className="settings-panel-header">
            <div>
              <span className="section-label">
                <SlidersHorizontal size={15} /> Chat settings
              </span>
              <h2>
                {activeConversation
                  ? conversationDisplayTitle(activeConversation)
                  : selectedCharacter.name}
              </h2>
            </div>
            <button
              className="icon-control"
              type="button"
              aria-label="Close chat settings"
              title="Close chat settings"
              onClick={() => setSettingsOpen(false)}
            >
              <X size={18} />
            </button>
          </div>

          {activeIsGroup ? (
            <section className="tuning-card group-members-card">
              <div className="panel-heading split">
                <div>
                  <UsersRound size={18} />
                  <h3>Group members</h3>
                </div>
                <span>{activeGroupMembers.length}/10</span>
              </div>
              <div className="group-member-list">
                {activeGroupMembers.map((member) => (
                  <article className="group-member-row" key={member.characterId}>
                    <Avatar character={characterFromMember(member)} small />
                    <span>
                      <strong>{member.name}</strong>
                      <small>@{member.mentionSlug}</small>
                    </span>
                    <button
                      className="icon-control compact-icon"
                      type="button"
                      aria-label={`Remove ${member.name}`}
                      title={`Remove ${member.name}`}
                      disabled={isGroupSaving || activeGroupMembers.length <= 2}
                      onClick={() => void removeGroupMember(member.characterId)}
                    >
                      <MinusCircle size={16} />
                    </button>
                  </article>
                ))}
              </div>

              {activeGroupMembers.length < 10 ? (
                <>
                  <label className="premium-search compact-search">
                    <Search size={15} />
                    <input
                      aria-label="Search bots to add"
                      placeholder="Search bots"
                      value={groupCandidateSearch}
                      onChange={(event) => setGroupCandidateSearch(event.target.value)}
                    />
                  </label>
                  <div className="group-candidate-list compact premium-scroll">
                    {groupCandidateResults
                      .filter(
                        (character) =>
                          !activeGroupMembers.some((member) => member.characterId === character.id),
                      )
                      .map((character) => {
                        const active = groupAddSelection.includes(character.id);
                        const remainingSlots = Math.max(0, 10 - activeGroupMembers.length);

                        return (
                          <button
                            className={active ? "group-candidate active" : "group-candidate"}
                            type="button"
                            key={character.id}
                            aria-label={
                              active
                                ? `Remove ${character.name} from add selection`
                                : `Add ${character.name} to this group`
                            }
                            aria-pressed={active}
                            disabled={!active && groupAddSelection.length >= remainingSlots}
                            onClick={() => toggleGroupAddSelection(character.id)}
                          >
                            <Avatar character={character} small />
                            <span>
                              <strong>{character.name}</strong>
                              <small>{character.rating}</small>
                            </span>
                            <span className="group-selection-indicator" aria-hidden="true">
                              {active ? <X size={14} /> : <Check size={14} />}
                            </span>
                          </button>
                        );
                      })}
                  </div>
                  <button
                    className="primary-action compact"
                    type="button"
                    disabled={isGroupSaving || groupAddSelection.length === 0}
                    onClick={() => void addMembersToActiveGroup()}
                  >
                    <UserPlus size={16} /> Add {groupAddSelection.length}
                  </button>
                </>
              ) : null}
            </section>
          ) : null}

          {!activeIsGroup ? (
            <section className="tuning-card evolution-card">
              <div className="panel-heading split">
                <div>
                  <Sparkles size={18} />
                  <h3>Evolving profile</h3>
                </div>
                <span>{evolution ? evolution.stage : "new"}</span>
              </div>
              <p>
                {evolution
                  ? evolution.summary
                  : "This room will adapt as saved memories and repeated choices build up."}
              </p>
              <div className="evolution-meter" aria-label="Relationship depth">
                <span style={{ width: `${evolution?.relationshipDepth ?? 0}%` }} />
              </div>
              <small>
                {evolution
                  ? `${evolution.relationshipDepth}/100 depth | ${evolution.memoryCount} memories | ${evolution.userMessageCount} turns`
                  : "0/100 depth | no saved memories yet"}
              </small>
            </section>
          ) : null}

          <section className="tuning-card room-control-card">
            <div className="panel-heading">
              <RotateCcw size={18} />
              <h3>Room controls</h3>
            </div>
            <div className="room-control-actions">
              {!activeIsGroup ? (
                <button
                  className="secondary-action compact"
                  type="button"
                  onClick={() => void startFreshRoom()}
                >
                  <Plus size={16} /> Start fresh room
                </button>
              ) : null}
            </div>
            <small>
              {activeConversation
                ? `Last active ${formatRoomTimestamp(activeConversation.updatedAt)}.`
                : "This is a clean room until you send the first message."}
            </small>
          </section>

          {activeConversation ? (
            <section
              className={deleteArmed ? "tuning-card danger-card armed" : "tuning-card danger-card"}
            >
              <div className="panel-heading">
                <Trash2 size={18} />
                <h3>Delete chat</h3>
              </div>
              <p>Remove this room from your chats and turn off the memories saved inside it.</p>
              <div className="room-control-actions">
                <button
                  className={deleteArmed ? "danger-action compact" : "secondary-action compact"}
                  type="button"
                  disabled={isDeletingConversation}
                  onClick={() => void deleteCurrentConversation()}
                >
                  <Trash2 size={16} /> {deleteArmed ? "Delete forever" : "Delete chat"}
                </button>
                {deleteArmed ? (
                  <button
                    className="secondary-action compact"
                    type="button"
                    disabled={isDeletingConversation}
                    onClick={() => {
                      setDeleteArmed(false);
                      setStatus("");
                    }}
                  >
                    <X size={16} /> Cancel
                  </button>
                ) : null}
              </div>
            </section>
          ) : null}

          {!activeIsGroup ? (
            <>
              <section className="tuning-card">
                <div className="panel-heading">
                  <Pencil size={18} />
                  <h3>Private tuning prompt</h3>
                </div>
                <textarea
                  value={tuningDraft}
                  onChange={(event) => setTuningDraft(event.target.value)}
                  placeholder={`Example: Keep ${selectedCharacter.name} more playful, slower paced, and protective in this chat.`}
                  rows={4}
                />
                <button
                  className="primary-action compact"
                  type="button"
                  onClick={() => {
                    void addMemory("style", tuningDraft);
                    setTuningDraft("");
                  }}
                >
                  <Save size={16} /> Save tuning
                </button>
              </section>

              <section className="tuning-card">
                <div className="panel-heading">
                  <Archive size={18} />
                  <h3>Add memory</h3>
                </div>
                <div className="segmented-control dense">
                  {memoryKinds.map((kind) => (
                    <button
                      className={kind.id === memoryKind ? "active" : ""}
                      type="button"
                      key={kind.id}
                      onClick={() => setMemoryKind(kind.id)}
                    >
                      {kind.label}
                    </button>
                  ))}
                </div>
                <textarea
                  value={memoryDraft}
                  onChange={(event) => setMemoryDraft(event.target.value)}
                  placeholder="Save a private note this character should remember in this chat."
                  rows={3}
                />
                <button
                  className="primary-action compact"
                  type="button"
                  onClick={() => {
                    void addMemory(memoryKind, memoryDraft);
                    setMemoryDraft("");
                  }}
                >
                  <Plus size={16} /> Add memory
                </button>
              </section>

              <section className="memory-editor-list premium-scroll">
                <div className="panel-heading">
                  <ShieldCheck size={18} />
                  <h3>Live context</h3>
                </div>
                {memories.map((memory) => (
                  <article className="memory-editor-card" key={memory.id}>
                    <span>{memory.kind}</span>
                    <textarea
                      value={memoryEdits[memory.id] ?? memory.text}
                      onChange={(event) =>
                        setMemoryEdits((current) => ({
                          ...current,
                          [memory.id]: event.target.value,
                        }))
                      }
                      rows={3}
                    />
                    <div>
                      <button
                        className="secondary-action compact"
                        type="button"
                        onClick={() => void removeMemory(memory)}
                      >
                        <Trash2 size={15} /> Remove
                      </button>
                      <button
                        className="primary-action compact"
                        type="button"
                        onClick={() => void saveMemory(memory)}
                      >
                        <Save size={15} /> Save
                      </button>
                    </div>
                  </article>
                ))}
                {memories.length === 0 ? (
                  <div className="mini-empty">
                    <Archive size={18} />
                    <p>Context appears here after you chat or save a private note.</p>
                  </div>
                ) : null}
              </section>
            </>
          ) : null}
        </aside>
      ) : null}

      {status ? <p className="floating-status">{status}</p> : null}

      {mintModalTarget && selectedCharacter && (
        <MintFromChatModal
          isOpen={Boolean(mintModalTarget)}
          onClose={() => setMintModalTarget(null)}
          mediaId={mintModalTarget.mediaId}
          characterId={mintModalTarget.characterId}
          characterName={selectedCharacter.name}
        />
      )}
    </div>
  );
}

function Avatar({ character, small = false }: { character: CharacterSummary; small?: boolean }) {
  return (
    <span className={small ? "companion-avatar small" : "companion-avatar"} aria-hidden="true">
      {character.avatarUrl ? (
        <img src={character.avatarUrl} alt="" className="companion-avatar-image" />
      ) : (
        <HanaLogo size={small ? 22 : 28} />
      )}
    </span>
  );
}

function GroupAvatarStack({ members }: { members: ConversationMember[] }) {
  const visibleMembers = members.slice(0, 3);

  return (
    <span className="group-avatar-stack" aria-hidden="true">
      {visibleMembers.map((member) => (
        <Avatar character={characterFromMember(member)} small key={member.characterId} />
      ))}
      {visibleMembers.length === 0 ? <UsersRound size={22} /> : null}
    </span>
  );
}

interface ChatStreamHandlers {
  ready: () => void;
  meta: (payload: ChatResponse) => void;
  token: (payload: {
    messageId?: string;
    content?: string;
    speaker?: ConversationMember | null;
  }) => void;
  blocked: (payload: ChatResponse) => void;
  done: (payload: ChatResponse) => void;
  error: (payload: { code?: string; message?: string; details?: Record<string, unknown> }) => void;
}

class ChatStreamError extends Error {
  public readonly code: string | undefined;

  public constructor(message: string, code?: string) {
    super(message);
    this.name = "ChatStreamError";
    this.code = code;
  }
}

async function readChatStream(response: Response, handlers: ChatStreamHandlers): Promise<void> {
  const reader = response.body?.getReader();

  if (!reader) {
    throw new Error("Chat stream did not return a readable body.");
  }

  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();

    if (done) {
      break;
    }

    buffer += decoder.decode(value, { stream: true });

    while (buffer.includes("\n\n")) {
      const boundary = buffer.indexOf("\n\n");
      const block = buffer.slice(0, boundary);
      buffer = buffer.slice(boundary + 2);
      dispatchChatStreamBlock(block, handlers);
    }
  }

  if (buffer.trim()) {
    dispatchChatStreamBlock(buffer, handlers);
  }
}

function dispatchChatStreamBlock(block: string, handlers: ChatStreamHandlers): void {
  const lines = block.split(/\r?\n/);
  const event = lines
    .find((line) => line.startsWith("event:"))
    ?.slice("event:".length)
    .trim();
  const data = lines
    .filter((line) => line.startsWith("data:"))
    .map((line) => line.slice("data:".length).trimStart())
    .join("\n");
  const payload = data ? safeJsonParse(data) : {};

  switch (event) {
    case "ready":
      handlers.ready();
      break;
    case "meta":
      handlers.meta(payload as ChatResponse);
      break;
    case "token":
      handlers.token(
        payload as {
          messageId?: string;
          content?: string;
          speaker?: ConversationMember | null;
        },
      );
      break;
    case "blocked":
      handlers.blocked(payload as ChatResponse);
      break;
    case "done":
      handlers.done(payload as ChatResponse);
      break;
    case "error":
      handlers.error(
        payload as { code?: string; message?: string; details?: Record<string, unknown> },
      );
      break;
    default:
      break;
  }
}

function safeJsonParse(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return {};
  }
}

function shouldRequestAdultMode(character: CharacterSummary, enabledInSettings: boolean): boolean {
  if (!enabledInSettings) {
    return false;
  }

  if (character.rating === "mature" || character.rating === "adult") {
    return true;
  }

  const adultTags = new Set(["adult", "nsfw", "spicy", "naughty", "sexual", "18+"]);
  const adultTextSignals = ["nsfw", "spicy", "naughty", "sexual", "18+", "explicit"];
  const freeformSignals =
    `${character.description} ${character.marketplacePreview ?? ""}`.toLowerCase();

  return (
    character.tags?.some((tag) => adultTags.has(tag.trim().toLowerCase())) ||
    adultTextSignals.some((signal) => freeformSignals.includes(signal))
  );
}

function isPaidLocked(character: CharacterSummary, trialStatus: TrialStatus | null): boolean {
  return Boolean(
    character.monetizationEnabled &&
    (character.priceCents ?? 0) > 0 &&
    trialStatus &&
    trialStatus.remaining <= 0,
  );
}

function numberDetail(details: Record<string, unknown>, key: string): number {
  const value = details[key];

  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function messageMentionsGroupMember(content: string, members: ConversationMember[]): boolean {
  return members.some((member) =>
    new RegExp(`@${escapeRegExp(member.mentionSlug)}\\b`, "i").test(content),
  );
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export default function ChatPage() {
  return (
    <Suspense fallback={null}>
      <ChatExperience />
    </Suspense>
  );
}
