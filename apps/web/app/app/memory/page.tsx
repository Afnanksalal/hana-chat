"use client";

import {
  Archive,
  Brain,
  CheckCircle2,
  Download,
  Eye,
  EyeOff,
  Layers3,
  MessageSquareText,
  RefreshCw,
  Search,
  ShieldCheck,
  Sparkles,
  Trash2,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { apiJson } from "../api";

interface MemoryFact {
  id: string;
  characterId: string;
  conversationId: string | null;
  scope: string;
  kind: string;
  text: string;
  confidence: number;
  importance: number;
  emotionalWeight: number;
  createdAt: string;
  updatedAt: string;
  isActive: boolean;
}

interface MemoryVaultResponse {
  settings: {
    stellarEnabled: boolean;
    storageEnabled: boolean;
    nftEnabled: boolean;
    network: string;
  };
  summary: {
    snapshots: number;
    uploadedSnapshots: number;
    confirmedSnapshots: number;
    failedSnapshots: number;
    pendingSnapshots: number;
    roomsWithMemory: number;
  };
  rooms: Array<{
    conversationId: string;
    characterId: string;
    characterName: string;
    characterAvatarUrl: string | null;
    memoryCount: number;
    latestMemoryAt: string | null;
  }>;
}

interface CreatorCharacterSummary {
  id: string;
  name: string;
  avatarUrl?: string | null;
  visibility: string;
  moderationStatus: string;
  updatedAt: string;
}

const emptyVault: MemoryVaultResponse = {
  settings: {
    stellarEnabled: false,
    storageEnabled: false,
    nftEnabled: false,
    network: "testnet",
  },
  summary: {
    snapshots: 0,
    uploadedSnapshots: 0,
    confirmedSnapshots: 0,
    failedSnapshots: 0,
    pendingSnapshots: 0,
    roomsWithMemory: 0,
  },
  rooms: [],
};

export default function SuperMemoryPage() {
  const [vault, setVault] = useState<MemoryVaultResponse>(emptyVault);
  const [characters, setCharacters] = useState<CreatorCharacterSummary[]>([]);
  const [memories, setMemories] = useState<MemoryFact[]>([]);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [status, setStatus] = useState("Loading super memory...");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCharacterFilter, setSelectedCharacterFilter] = useState("");

  useEffect(() => {
    void loadVault();
  }, []);

  async function loadVault() {
    try {
      const [vaultPayload, characterPayload, memoriesPayload] = await Promise.all([
        apiJson<MemoryVaultResponse>("/api/v1/stellar/memory/vault"),
        apiJson<{ characters: CreatorCharacterSummary[] }>("/api/v1/characters/mine"),
        apiJson<{ memories: MemoryFact[] }>("/api/v1/memories"),
      ]);

      setVault(normalizeVault(vaultPayload));
      setCharacters(Array.isArray(characterPayload.characters) ? characterPayload.characters : []);
      setMemories(Array.isArray(memoriesPayload.memories) ? memoriesPayload.memories : []);
      setStatus("");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Super memory vault unavailable.");
    }
  }

  async function deleteMemoryFact(memoryId: string) {
    setBusyAction(`delete:${memoryId}`);
    setStatus("Deleting memory fact...");

    try {
      await apiJson(`/api/v1/memories/${encodeURIComponent(memoryId)}`, {
        method: "DELETE",
      });
      setStatus("Memory fact deleted.");
      await loadVault();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Could not delete memory fact.");
    } finally {
      setBusyAction(null);
    }
  }

  async function toggleMemoryActive(memoryId: string, currentActive: boolean) {
    setBusyAction(`toggle:${memoryId}`);
    setStatus(currentActive ? "Deactivating memory fact..." : "Activating memory fact...");

    try {
      await apiJson(`/api/v1/memories/${encodeURIComponent(memoryId)}`, {
        method: "PATCH",
        body: JSON.stringify({ isActive: !currentActive }),
      });
      setStatus(currentActive ? "Memory fact deactivated." : "Memory fact activated.");
      await loadVault();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Could not update memory fact.");
    } finally {
      setBusyAction(null);
    }
  }

  async function queueExport() {
    setBusyAction("export");
    setStatus("Queueing memory export...");

    try {
      await apiJson("/api/v1/stellar/memory/exports", { method: "POST" });
      await loadVault();
      setStatus("Memory export queued.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Could not queue memory export.");
    } finally {
      setBusyAction(null);
    }
  }

  async function queueSoulPack(characterId: string) {
    setBusyAction(`soul:${characterId}`);
    setStatus("Queueing soul-pack archive...");

    try {
      await apiJson(
        `/api/v1/stellar/memory/creator-soul-packs/${encodeURIComponent(characterId)}`,
        {
          method: "POST",
        },
      );
      await loadVault();
      setStatus("Soul-pack archive queued.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Could not queue soul-pack archive.");
    } finally {
      setBusyAction(null);
    }
  }

  const creatorArchiveReady = characters.length > 0;
  const groupedRooms = useMemo(() => groupMemoryRooms(vault.rooms), [vault.rooms]);

  // Filter memories based on search query and selected character filter
  const filteredMemories = useMemo(() => {
    return memories.filter((mem) => {
      const matchesSearch = mem.text.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesCharacter = selectedCharacterFilter
        ? mem.characterId === selectedCharacterFilter
        : true;
      return matchesSearch && matchesCharacter;
    });
  }, [memories, searchQuery, selectedCharacterFilter]);

  const metricCards = useMemo(() => {
    return [
      {
        label: "Memory Facts",
        value: memories.filter((m) => m.isActive).length.toLocaleString(),
        detail: `${memories.filter((m) => !m.isActive).length} inactive triggers`,
        icon: Brain,
      },
      {
        label: "Remembered Rooms",
        value: vault.summary.roomsWithMemory.toLocaleString(),
        detail: "with active history",
        icon: MessageSquareText,
      },
      {
        label: "Archive Packages",
        value: characters.length.toLocaleString(),
        detail: "portable soul-packs",
        icon: Archive,
      },
      {
        label: "Database Integrity",
        value: "Healthy",
        detail: "Neo4j + Qdrant sync",
        icon: ShieldCheck,
      },
    ];
  }, [memories, vault, characters]);

  return (
    <div className="app-page wallet-page memory-page">
      <section className="wallet-hero memory-hero memory-command-hero">
        <div className="memory-hero-copy">
          <div className="memory-titlebar">
            <span className="section-label">
              <Brain size={15} /> Super Memory
            </span>
            <button
              className="secondary-action compact"
              type="button"
              onClick={() => void loadVault()}
            >
              <RefreshCw size={15} /> Refresh
            </button>
          </div>
          <h1>Super memory</h1>
          <p>
            Explore and curate cognitive facts, relationships, and context models retained by your
            companions.
          </p>
        </div>

        {/* Feature Highlights of Super Memory */}
        <div className="memory-proof-card memory-proof-terminal" aria-label="Super memory status">
          <div className="memory-terminal-header">
            <span>
              <Sparkles size={15} /> Cognitive Stack
            </span>
            <b>Active</b>
          </div>
          <strong>Vector + Graph projections</strong>
          <small>
            Memory remains local, private, and exact-scoped per user, per companion, and per room.
          </small>
          <div className="memory-features-summary">
            <div className="feature-item">
              <CheckCircle2 size={14} className="icon-hotpink" />
              <span>Neo4j Graph Context</span>
            </div>
            <div className="feature-item">
              <CheckCircle2 size={14} className="icon-hotpink" />
              <span>Qdrant Vector Retrieval</span>
            </div>
            <div className="feature-item">
              <CheckCircle2 size={14} className="icon-hotpink" />
              <span>Two-Stage LLM Curation</span>
            </div>
          </div>
        </div>
      </section>

      <section className="wallet-metric-grid memory-metric-grid">
        {metricCards.map((card) => (
          <article className="wallet-metric memory-stat-card" key={card.label}>
            <card.icon size={22} />
            <span>{card.label}</span>
            <strong>{card.value}</strong>
            <small>{card.detail}</small>
          </article>
        ))}
      </section>

      {/* SEARCH AND EXPLORER SECTION */}
      <section className="memory-explorer-section">
        <div className="panel-heading split">
          <div>
            <h2>Explore Active Facts</h2>
            <p>Directly search and manage cognitive blocks saved in your database.</p>
          </div>
        </div>

        <div className="explorer-filters">
          <div className="search-input-wrapper">
            <Search size={18} />
            <input
              type="text"
              placeholder="Search memories by keyword..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>

          <select
            value={selectedCharacterFilter}
            onChange={(e) => setSelectedCharacterFilter(e.target.value)}
            aria-label="Filter by companion"
          >
            <option value="">All Companions</option>
            {characters.map((char) => (
              <option key={char.id} value={char.id}>
                {char.name}
              </option>
            ))}
          </select>
        </div>

        <div className="memory-facts-grid">
          {filteredMemories.map((memory) => {
            const charName =
              characters.find((c) => c.id === memory.characterId)?.name || "Companion";
            return (
              <article
                key={memory.id}
                className={`memory-fact-card ${memory.isActive ? "active" : "inactive"}`}
              >
                <div className="fact-header">
                  <span className="char-badge">{charName}</span>
                  <span className={`kind-badge ${memory.kind}`}>{memory.kind}</span>
                </div>
                <p className="fact-text">{memory.text}</p>
                <div className="fact-footer">
                  <div className="fact-stats">
                    <span>
                      Salience: <strong>{Math.round(memory.importance * 100)}%</strong>
                    </span>
                    <span>
                      Confidence: <strong>{Math.round(memory.confidence * 100)}%</strong>
                    </span>
                  </div>
                  <div className="fact-actions">
                    <button
                      type="button"
                      title={memory.isActive ? "Deactivate Fact" : "Activate Fact"}
                      disabled={busyAction !== null}
                      onClick={() => void toggleMemoryActive(memory.id, memory.isActive)}
                    >
                      {memory.isActive ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                    <button
                      type="button"
                      title="Delete Fact"
                      className="delete-btn"
                      disabled={busyAction !== null}
                      onClick={() => void deleteMemoryFact(memory.id)}
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
              </article>
            );
          })}

          {filteredMemories.length === 0 && (
            <div className="explorer-empty-card">
              <Brain size={40} className="icon-muted" />
              <h3>No memory facts found</h3>
              <p>Type a different search term or select another companion filter.</p>
            </div>
          )}
        </div>
      </section>

      <section className="memory-bento-grid">
        <article className="wallet-table-panel memory-action-panel memory-export-panel">
          <div className="panel-heading split">
            <div>
              <span className="section-label">
                <Download size={15} /> Export
              </span>
              <h2>Personal memory export</h2>
            </div>
            <button
              className="primary-action compact memory-primary-action"
              type="button"
              disabled={busyAction !== null || vault.summary.roomsWithMemory === 0}
              onClick={() => void queueExport()}
            >
              <Download size={15} /> Export all
            </button>
          </div>
          <div className="memory-action-copy">
            <Brain size={22} />
            <span>
              <b>{vault.summary.roomsWithMemory.toLocaleString()}</b>
              <strong>rooms ready</strong>
              <small>{memories.length.toLocaleString()} cognitive records prepared</small>
            </span>
          </div>
          <div className="memory-process-list" aria-label="Export process">
            <span>
              <CheckCircle2 size={15} /> Format JSON Facts
            </span>
            <span>
              <Layers3 size={15} /> Pack Room Continuity
            </span>
            <span>
              <ShieldCheck size={15} /> Seal Export Zip
            </span>
          </div>
        </article>

        <article className="wallet-table-panel memory-action-panel memory-soul-panel">
          <div className="panel-heading split">
            <div>
              <span className="section-label">
                <Archive size={15} /> Creator archive
              </span>
              <h2>Soul-packs</h2>
            </div>
          </div>
          <div className="memory-action-copy compact">
            <Archive size={22} />
            <span>
              <b>{characters.length.toLocaleString()}</b>
              <strong>creator characters</strong>
              <small>Archive character context into portable packages.</small>
            </span>
          </div>
          <div className="wallet-table memory-creator-list">
            {characters.slice(0, 4).map((character) => (
              <div className="wallet-table-row memory-creator-row" key={character.id}>
                <span>
                  <strong>{character.name}</strong>
                  <small>
                    {formatStatus(character.visibility)} -{" "}
                    {formatStatus(character.moderationStatus)}
                  </small>
                </span>
                <button
                  className="secondary-action compact"
                  type="button"
                  disabled={busyAction !== null}
                  onClick={() => void queueSoulPack(character.id)}
                >
                  <Archive size={15} /> Archive
                </button>
              </div>
            ))}
            {!creatorArchiveReady ? (
              <div className="dashboard-empty-card compact-empty">
                <Sparkles size={20} />
                <h3>No creator characters</h3>
                <p>Character archives appear after you build in Creator Studio.</p>
                <Link className="secondary-action compact" href="/app/create">
                  Create character
                </Link>
              </div>
            ) : null}
          </div>
        </article>

        <article className="wallet-table-panel memory-rooms-panel">
          <div className="panel-heading split">
            <div>
              <span className="section-label">
                <MessageSquareText size={15} /> Remembered rooms
              </span>
              <h2>Conversation contexts</h2>
            </div>
          </div>
          <div className="memory-character-list">
            {groupedRooms.map((group) => (
              <article className="memory-character-card" key={group.characterId}>
                <img
                  className="memory-room-avatar"
                  src={group.characterAvatarUrl ?? "/assets/character-avatar-default.svg"}
                  alt=""
                />
                <div className="memory-character-main">
                  <strong>{group.characterName}</strong>
                  <small>
                    {group.roomCount.toLocaleString()} rooms -{" "}
                    {group.totalMemoryCount.toLocaleString()} facts - latest{" "}
                    {formatDate(group.latestMemoryAt)}
                  </small>
                  <div className="memory-room-mini-list">
                    {group.recentRooms.map((room) => (
                      <span key={room.conversationId}>
                        {formatDate(room.latestMemoryAt)} - {room.memoryCount.toLocaleString()}{" "}
                        facts
                      </span>
                    ))}
                    {group.extraRoomCount > 0 ? (
                      <span>{group.extraRoomCount.toLocaleString()} more rooms</span>
                    ) : null}
                  </div>
                </div>
                <div className="memory-action-buttons">
                  <Link
                    className="secondary-action compact"
                    href={`/app/chat?characterId=${encodeURIComponent(
                      group.characterId,
                    )}&conversationId=${encodeURIComponent(group.latestConversationId)}`}
                  >
                    Open
                  </Link>
                </div>
              </article>
            ))}
            {vault.rooms.length === 0 ? (
              <div className="dashboard-empty-card compact-empty">
                <MessageSquareText size={20} />
                <h3>No room memory yet</h3>
                <p>Rooms with active memory will appear here.</p>
                <Link className="secondary-action compact" href="/app/chat">
                  Open chat
                </Link>
              </div>
            ) : null}
          </div>
        </article>
      </section>

      {status ? (
        <p className="floating-status" aria-live="polite">
          {status}
        </p>
      ) : null}
    </div>
  );
}

function normalizeVault(payload: Partial<MemoryVaultResponse>): MemoryVaultResponse {
  return {
    settings: {
      stellarEnabled: Boolean(payload.settings?.stellarEnabled),
      storageEnabled: Boolean(payload.settings?.storageEnabled),
      nftEnabled: Boolean(payload.settings?.nftEnabled),
      network: payload.settings?.network || "testnet",
    },
    summary: {
      snapshots: payload.summary?.snapshots ?? 0,
      uploadedSnapshots: payload.summary?.uploadedSnapshots ?? 0,
      confirmedSnapshots: payload.summary?.confirmedSnapshots ?? 0,
      failedSnapshots: payload.summary?.failedSnapshots ?? 0,
      pendingSnapshots: payload.summary?.pendingSnapshots ?? 0,
      roomsWithMemory: payload.summary?.roomsWithMemory ?? 0,
    },
    rooms: Array.isArray(payload.rooms) ? payload.rooms : [],
  };
}

function groupMemoryRooms(rooms: MemoryVaultResponse["rooms"]) {
  const groups: Record<
    string,
    {
      characterId: string;
      characterName: string;
      characterAvatarUrl: string | null;
      roomCount: number;
      totalMemoryCount: number;
      latestMemoryAt: string | null;
      latestConversationId: string;
      recentRooms: Array<{
        conversationId: string;
        latestMemoryAt: string | null;
        memoryCount: number;
      }>;
    }
  > = {};

  for (const room of rooms) {
    const existing = groups[room.characterId];
    if (existing) {
      existing.roomCount += 1;
      existing.totalMemoryCount += room.memoryCount;
      if (
        room.latestMemoryAt &&
        (!existing.latestMemoryAt || room.latestMemoryAt > existing.latestMemoryAt)
      ) {
        existing.latestMemoryAt = room.latestMemoryAt;
        existing.latestConversationId = room.conversationId;
      }
      existing.recentRooms.push({
        conversationId: room.conversationId,
        latestMemoryAt: room.latestMemoryAt,
        memoryCount: room.memoryCount,
      });
    } else {
      groups[room.characterId] = {
        characterId: room.characterId,
        characterName: room.characterName,
        characterAvatarUrl: room.characterAvatarUrl,
        roomCount: 1,
        totalMemoryCount: room.memoryCount,
        latestMemoryAt: room.latestMemoryAt,
        latestConversationId: room.conversationId,
        recentRooms: [
          {
            conversationId: room.conversationId,
            latestMemoryAt: room.latestMemoryAt,
            memoryCount: room.memoryCount,
          },
        ],
      };
    }
  }

  return Object.values(groups)
    .map((group) => {
      const sortedRooms = [...group.recentRooms].sort((a, b) => {
        const timeA = a.latestMemoryAt ? new Date(a.latestMemoryAt).getTime() : 0;
        const timeB = b.latestMemoryAt ? new Date(b.latestMemoryAt).getTime() : 0;
        return timeB - timeA;
      });
      return {
        ...group,
        recentRooms: sortedRooms.slice(0, 3),
        extraRoomCount: Math.max(0, group.roomCount - 3),
      };
    })
    .sort((a, b) => {
      const timeA = a.latestMemoryAt ? new Date(a.latestMemoryAt).getTime() : 0;
      const timeB = b.latestMemoryAt ? new Date(b.latestMemoryAt).getTime() : 0;
      return timeB - timeA;
    });
}

function formatStatus(value: string): string {
  const label = value.replace(/[_-]+/g, " ").trim();

  if (!label) {
    return "Unknown";
  }

  return label.replace(/\b[a-z]/g, (letter) => letter.toUpperCase());
}

function formatDate(value: string | null): string {
  if (!value) {
    return "No date";
  }

  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
  }).format(new Date(value));
}
