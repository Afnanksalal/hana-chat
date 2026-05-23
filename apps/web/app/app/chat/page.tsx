"use client";

import {
  Archive,
  ArrowLeft,
  Bot,
  Clock3,
  Lock,
  MessageSquareText,
  Mic2,
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
  X,
} from "lucide-react";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { HanaLogo } from "../../components/hana-logo";
import { apiJson, money } from "../api";

type MemoryKind = "preference" | "boundary" | "relationship" | "canon" | "event" | "style";

interface CharacterSummary {
  id: string;
  name: string;
  description: string;
  rating: "general" | "teen" | "mature" | "adult";
  avatarUrl?: string;
  coverImageUrl?: string;
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

interface ConversationSummary {
  id: string;
  characterId: string;
  updatedAt: string;
  character: CharacterSummary;
  lastMessage: {
    id: string;
    role: "assistant" | "user" | "system";
    content: string;
    createdAt: string;
  } | null;
}

interface ChatMessage {
  id: string;
  role: "assistant" | "user";
  content: string;
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
  };
  updatedAt: string;
}

interface ChatResponse {
  accepted: boolean;
  conversationId?: string;
  assistantMessage?: {
    id: string;
    role: "assistant";
    content: string;
  };
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

interface MemoriesResponse {
  memories: MemoryFact[];
}

interface CharacterPurchaseResponse {
  provider?: "mock" | "razorpay";
  internalPurchaseId?: string;
  activated?: boolean;
  alreadyPurchased?: boolean;
  trial?: boolean;
  trialLimit?: number;
  trialUsed?: number;
  trialRemaining?: number;
  keyId?: string;
  order?: {
    id: string;
    amount: number;
    currency: string;
  };
  character?: {
    id: string;
    name: string;
    priceCents: number;
  };
}

type RazorpayCheckout = new (options: {
  key: string;
  order_id: string;
  amount: number;
  currency: string;
  name: string;
  description: string;
  handler: (response: {
    razorpay_order_id: string;
    razorpay_payment_id: string;
    razorpay_signature: string;
  }) => void;
}) => {
  open: () => void;
};

declare global {
  interface Window {
    Razorpay?: RazorpayCheckout;
  }
}

const memoryKinds: Array<{ id: MemoryKind; label: string }> = [
  { id: "preference", label: "Preference" },
  { id: "boundary", label: "Boundary" },
  { id: "relationship", label: "Relationship" },
  { id: "canon", label: "Canon" },
  { id: "event", label: "Event" },
  { id: "style", label: "Style" },
];

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
  const [trialStatus, setTrialStatus] = useState<TrialStatus | null>(null);
  const [evolution, setEvolution] = useState<EvolutionSummary | null>(null);
  const [typingMessageId, setTypingMessageId] = useState<string | null>(null);
  const streamRef = useRef<HTMLDivElement | null>(null);
  const assistantBufferRef = useRef("");
  const assistantVisibleRef = useRef("");
  const assistantMessageIdRef = useRef<string | null>(null);
  const assistantDoneRef = useRef(false);
  const assistantTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

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

  const selectedCharacter = useMemo(
    () =>
      activeConversation?.character ??
      (directCharacter?.id === selectedCharacterId ? directCharacter : undefined),
    [activeConversation, directCharacter, selectedCharacterId],
  );

  useEffect(() => {
    document.body.classList.toggle("chat-room-open", Boolean(selectedCharacter));

    return () => {
      document.body.classList.remove("chat-room-open");
    };
  }, [selectedCharacter]);

  const filteredConversations = useMemo(() => {
    const query = search.trim().toLowerCase();

    if (!query) {
      return conversations;
    }

    return conversations.filter((conversation) =>
      [
        conversation.character.name,
        conversation.character.description,
        conversation.lastMessage?.content ?? "",
      ]
        .join(" ")
        .toLowerCase()
        .includes(query),
    );
  }, [conversations, search]);
  async function loadChatShell(isCancelled: () => boolean) {
    try {
      const conversationPayload = await apiJson<{ conversations: ConversationSummary[] }>(
        "/api/v1/chat/conversations",
      );

      if (isCancelled()) {
        return;
      }

      setConversations(conversationPayload.conversations);
      setStatus("");

      if (requestedConversationId) {
        const requestedConversation = conversationPayload.conversations.find(
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
        : conversationPayload.conversations.find(
            (conversation) => conversation.characterId === requestedCharacterId,
          );

      if (existingConversation) {
        await openConversation(existingConversation);
        return;
      }

      const characterPayload = await apiJson<{ character: CharacterSummary }>(
        `/api/v1/characters/${encodeURIComponent(requestedCharacterId)}`,
      );

      if (!isCancelled()) {
        startCharacterChat(characterPayload.character);
        replaceWithFreshRoom(characterPayload.character.id);
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
    setConversations(payload.conversations);
    return payload.conversations;
  }

  async function openConversation(conversation: ConversationSummary) {
    setActiveConversation(conversation);
    setSelectedCharacterId(conversation.characterId);
    setDirectCharacter(undefined);
    setSettingsOpen(false);
    setStatus("");
    setTrialStatus(null);
    replaceWithConversation(conversation.id);

    try {
      const payload = await apiJson<{
        messages: Array<{ id: string; role: "assistant" | "user" | "system"; content: string }>;
        evolution?: EvolutionSummary | null;
      }>(`/api/v1/chat/conversations/${encodeURIComponent(conversation.id)}/messages`);
      setMessages(
        payload.messages
          .filter(
            (message): message is { id: string; role: "assistant" | "user"; content: string } =>
              message.role === "assistant" || message.role === "user",
          )
          .map((message) => ({
            id: message.id,
            role: message.role,
            content: message.content,
          })),
      );
      setEvolution(payload.evolution ?? null);
      await loadScopedMemories(conversation.characterId, conversation.id);
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
    setMessages([
      {
        id: "intro",
        role: "assistant",
        content: `I am ${character.name}. Tell me where you want the scene to begin.`,
      },
    ]);
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
    setStatus("");
  }

  async function startFreshRoom(character = selectedCharacter) {
    if (!character) {
      return;
    }

    setStatus(`Starting a fresh room with ${character.name}...`);

    try {
      const payload = await apiJson<{ character: CharacterSummary }>(
        `/api/v1/characters/${encodeURIComponent(character.id)}`,
      );
      startCharacterChat(payload.character);
      replaceWithFreshRoom(payload.character.id);
    } catch {
      startCharacterChat(character);
      replaceWithFreshRoom(character.id);
    }
  }

  async function loadScopedMemories(nextCharacterId: string, nextConversationId: string) {
    try {
      const payload = await apiJson<MemoriesResponse>(
        `/api/v1/memories?characterId=${encodeURIComponent(
          nextCharacterId,
        )}&conversationId=${encodeURIComponent(nextConversationId)}`,
      );
      const activeMemories = payload.memories.filter((memory) => memory.isActive);
      setMemories(activeMemories);
      setMemoryEdits(Object.fromEntries(activeMemories.map((memory) => [memory.id, memory.text])));
    } catch {
      setMemories([]);
      setMemoryEdits({});
    }
  }

  async function sendMessage() {
    const content = draft.trim();

    if (!content || !selectedCharacter || isSending) {
      return;
    }

    if (isPaidLocked(selectedCharacter, trialStatus)) {
      setStatus("Free trial finished. Unlock this character to keep chatting.");
      return;
    }

    const userMessage: ChatMessage = {
      id: crypto.randomUUID(),
      role: "user",
      content,
    };

    resetAssistantTyping();
    setDraft("");
    setMessages((current) => [...current, userMessage]);
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
          conversationId: activeConversation?.id,
          characterId: selectedCharacter.id,
          content,
          clientMessageId: userMessage.id,
          adultModeRequested: false,
        }),
      });

      if (!response.ok) {
        throw new Error(`Chat stream failed with HTTP ${response.status}`);
      }

      let nextConversationId = activeConversation?.id;
      let assistantId: string | undefined;
      let assistantAdded = false;
      let wasBlocked = false;

      await readChatStream(response, {
        ready: () => setStatus(""),
        blocked: (payload) => {
          wasBlocked = true;
          resetAssistantTyping();
          setStatus(payload.safety?.reasonCode ?? "Message was not accepted.");
        },
        meta: (payload) => {
          nextConversationId = payload.conversationId ?? nextConversationId;
          if (payload.trial) {
            setTrialStatus(payload.trial);
          }

          if (payload.evolution) {
            setEvolution(payload.evolution);
          }

          if (payload.assistantMessage?.id && !assistantAdded) {
            assistantId = payload.assistantMessage.id;
            assistantAdded = true;
            ensureAssistantMessage(assistantId);
          }
        },
        token: (payload) => {
          const contentChunk = payload.content ?? "";

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
            return;
          }

          nextConversationId = payload.conversationId ?? nextConversationId;

          if (payload.assistantMessage) {
            assistantId = assistantId ?? payload.assistantMessage.id;
            completeAssistantText(assistantId, payload.assistantMessage.content);
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
          throw new Error(payload.message ?? "Chat stream failed.");
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

        await loadScopedMemories(selectedCharacter.id, nextConversationId);
      }

      if (!wasBlocked) {
        setStatus("");
      }
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Message failed.");
    } finally {
      setIsSending(false);
    }
  }

  function ensureAssistantMessage(messageId: string) {
    assistantMessageIdRef.current = messageId;
    setTypingMessageId(messageId);
    setMessages((current) =>
      current.some((message) => message.id === messageId)
        ? current
        : [...current, { id: messageId, role: "assistant", content: "" }],
    );
    startAssistantAnimation();
  }

  function queueAssistantText(messageId: string, content: string) {
    ensureAssistantMessage(messageId);
    assistantDoneRef.current = false;
    assistantBufferRef.current += content;
    startAssistantAnimation();
  }

  function completeAssistantText(messageId: string, finalContent: string) {
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
            conversationId: activeConversation?.id,
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
      await loadScopedMemories(memory.characterId, memory.conversationId);
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
      await loadScopedMemories(memory.characterId, memory.conversationId);
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
    setStatus(`Opening checkout for ${selectedCharacter.name}...`);

    try {
      const purchase = await apiJson<CharacterPurchaseResponse>(
        "/api/v1/monetization/character-purchases",
        {
          method: "POST",
          body: JSON.stringify({ characterId: selectedCharacter.id, provider: "razorpay" }),
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

      if (purchase.activated || purchase.provider === "mock") {
        setTrialStatus(null);
        setStatus("Unlocked.");
        return;
      }

      if (
        purchase.provider !== "razorpay" ||
        !purchase.keyId ||
        !purchase.order ||
        !purchase.internalPurchaseId
      ) {
        setStatus("Checkout could not start for this character.");
        return;
      }

      const Razorpay = await loadRazorpay();
      const checkout = new Razorpay({
        key: purchase.keyId,
        order_id: purchase.order.id,
        amount: purchase.order.amount,
        currency: purchase.order.currency,
        name: "Hana Chat",
        description: `Unlock ${purchase.character?.name ?? selectedCharacter.name}`,
        handler: (response) => {
          void apiJson("/api/v1/monetization/character-purchases/verify", {
            method: "POST",
            body: JSON.stringify({
              internalPurchaseId: purchase.internalPurchaseId,
              razorpayOrderId: response.razorpay_order_id,
              razorpayPaymentId: response.razorpay_payment_id,
              razorpaySignature: response.razorpay_signature,
            }),
          })
            .then(() => {
              setTrialStatus(null);
              setStatus("Unlocked.");
            })
            .catch((error: unknown) =>
              setStatus(error instanceof Error ? error.message : "Payment verification failed."),
            );
        },
      });

      checkout.open();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Could not unlock character.");
    } finally {
      setIsUnlocking(false);
    }
  }

  const paidLocked = selectedCharacter ? isPaidLocked(selectedCharacter, trialStatus) : false;

  return (
    <div className={settingsOpen ? "app-page chat-layer settings-active" : "app-page chat-layer"}>
      <aside className="chat-inbox">
        <div className="chat-inbox-header">
          <div>
            <span className="section-label">
              <MessageSquareText size={15} /> Chats
            </span>
            <h1>Your rooms</h1>
          </div>
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
              <Avatar character={conversation.character} />
              <div className="chat-thread-copy">
                <div className="chat-thread-title">
                  <strong>{conversation.character.name}</strong>
                  <em>{formatRoomTimestamp(conversation.updatedAt)}</em>
                </div>
                <small>{conversation.lastMessage?.content ?? "No messages yet"}</small>
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
                onClick={() => {
                  setSelectedCharacterId("");
                  setActiveConversation(undefined);
                  setMessages([]);
                  setMemories([]);
                  setEvolution(null);
                  setTrialStatus(null);
                  replaceChatLocation();
                }}
              >
                <ArrowLeft size={18} />
              </button>
              <Avatar character={selectedCharacter} />
              <div>
                <h2>{selectedCharacter.name}</h2>
                <p>
                  {selectedCharacter.rating} mode
                  {activeConversation
                    ? ` | ${formatRoomTimestamp(activeConversation.updatedAt)} room | ${memories.length} saved memories`
                    : " | fresh room"}
                  {trialStatus && selectedCharacter.monetizationEnabled
                    ? ` | trial ${trialStatus.remaining}/${trialStatus.limit}`
                    : ""}
                </p>
              </div>
              <div className="chat-actions">
                <button
                  className="icon-control"
                  type="button"
                  aria-label="Start fresh room"
                  title="Start fresh room"
                  onClick={() => void startFreshRoom()}
                >
                  <RotateCcw size={18} />
                </button>
                <button
                  className="icon-control"
                  type="button"
                  aria-label="Voice"
                  onClick={() => setStatus("Voice is managed from your account plan.")}
                >
                  <Mic2 size={18} />
                </button>
                <button
                  className={settingsOpen ? "icon-control active" : "icon-control"}
                  type="button"
                  aria-label="Chat settings"
                  onClick={() => setSettingsOpen((current) => !current)}
                >
                  {settingsOpen ? <X size={18} /> : <SlidersHorizontal size={18} />}
                </button>
              </div>
            </header>

            <div className="message-stream premium-scroll" ref={streamRef}>
              {messages.map((message) => (
                <div className={`message-row ${message.role}`} key={message.id}>
                  <div className="message-bubble">
                    {message.content ? (
                      renderRoleplayContent(message.content)
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
                <input
                  aria-label={`Message ${selectedCharacter.name}`}
                  placeholder={`Message ${selectedCharacter.name}...`}
                  value={draft}
                  onChange={(event) => setDraft(event.target.value)}
                />
                <button
                  className="send-control"
                  type="submit"
                  aria-label="Send message"
                  disabled={isSending}
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
              <h2>{selectedCharacter.name}</h2>
            </div>
            <button
              className="icon-control"
              type="button"
              aria-label="Close chat settings"
              onClick={() => setSettingsOpen(false)}
            >
              <X size={18} />
            </button>
          </div>

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

          <section className="tuning-card room-control-card">
            <div className="panel-heading">
              <RotateCcw size={18} />
              <h3>Room controls</h3>
            </div>
            <button
              className="secondary-action compact"
              type="button"
              onClick={() => void startFreshRoom()}
            >
              <Plus size={16} /> Start fresh room
            </button>
            <small>
              {activeConversation
                ? `Last active ${formatRoomTimestamp(activeConversation.updatedAt)}.`
                : "This is a clean room until you send the first message."}
            </small>
          </section>

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
        </aside>
      ) : null}

      {status ? <p className="floating-status">{status}</p> : null}
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

interface ChatStreamHandlers {
  ready: () => void;
  meta: (payload: ChatResponse) => void;
  token: (payload: { content?: string }) => void;
  blocked: (payload: ChatResponse) => void;
  done: (payload: ChatResponse) => void;
  error: (payload: { code?: string; message?: string; details?: Record<string, unknown> }) => void;
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
      handlers.token(payload as { content?: string });
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

function renderRoleplayContent(content: string) {
  const parts = content.split(/(\*[^*\n]{1,220}\*)/g);

  return parts.map((part, index) => {
    if (!part) {
      return null;
    }

    if (part.startsWith("*") && part.endsWith("*") && part.length > 2) {
      return <em key={`${part}-${index}`}>{part.slice(1, -1)}</em>;
    }

    return part.split("\n").map((line, lineIndex, lines) => (
      <span key={`${index}-${lineIndex}`}>
        {line}
        {lineIndex < lines.length - 1 ? <br /> : null}
      </span>
    ));
  });
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

async function loadRazorpay(): Promise<RazorpayCheckout> {
  if (window.Razorpay) {
    return window.Razorpay;
  }

  await new Promise<void>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://checkout.razorpay.com/v1/checkout.js";
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Checkout script failed to load."));
    document.body.appendChild(script);
  });

  if (!window.Razorpay) {
    throw new Error("Checkout is unavailable.");
  }

  return window.Razorpay;
}

export default function ChatPage() {
  return (
    <Suspense fallback={null}>
      <ChatExperience />
    </Suspense>
  );
}
