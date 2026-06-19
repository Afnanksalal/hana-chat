"use client";

import {
  Archive,
  Brain,
  CheckCircle2,
  Clock3,
  Database,
  Download,
  FileJson,
  HardDriveUpload,
  KeyRound,
  Layers3,
  MessageSquareText,
  RefreshCw,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { apiJson } from "../api";

interface MemoryVaultResponse {
  settings: {
    ogEnabled: boolean;
    storageEnabled: boolean;
    uploadEnabled: boolean;
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
  snapshots: Array<{
    id: string;
    kind: string;
    network: string;
    rootHash: string;
    txHash: string | null;
    manifestHash: string;
    encryptionMode: string;
    status: string;
    sourceMemoryCount: number;
    failureReason: string | null;
    characterId: string | null;
    conversationId: string | null;
    characterName: string | null;
    createdAt: string;
    updatedAt: string;
    confirmedAt: string | null;
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
    ogEnabled: false,
    storageEnabled: false,
    uploadEnabled: false,
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
  snapshots: [],
};

export default function MemoryVaultPage() {
  const [vault, setVault] = useState<MemoryVaultResponse>(emptyVault);
  const [characters, setCharacters] = useState<CreatorCharacterSummary[]>([]);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [status, setStatus] = useState("Loading memory vault...");

  useEffect(() => {
    void loadVault();
  }, []);

  async function loadVault() {
    try {
      const [vaultPayload, characterPayload] = await Promise.all([
        apiJson<MemoryVaultResponse>("/api/v1/og/memory/vault"),
        apiJson<{ characters: CreatorCharacterSummary[] }>("/api/v1/characters/mine"),
      ]);

      setVault(normalizeVault(vaultPayload));
      setCharacters(Array.isArray(characterPayload.characters) ? characterPayload.characters : []);
      setStatus("");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Memory vault unavailable.");
    }
  }

  async function queueRoomSnapshot(conversationId: string) {
    setBusyAction(`room:${conversationId}`);
    setStatus("Queueing room snapshot...");

    try {
      await apiJson("/api/v1/og/memory/snapshots", {
        method: "POST",
        body: JSON.stringify({ conversationId }),
      });
      await loadVault();
      setStatus("Room snapshot queued.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Could not queue snapshot.");
    } finally {
      setBusyAction(null);
    }
  }

  async function queueExport() {
    setBusyAction("export");
    setStatus("Queueing memory export...");

    try {
      await apiJson("/api/v1/og/memory/exports", { method: "POST" });
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
      await apiJson(`/api/v1/og/memory/creator-soul-packs/${encodeURIComponent(characterId)}`, {
        method: "POST",
      });
      await loadVault();
      setStatus("Soul-pack archive queued.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Could not queue soul-pack archive.");
    } finally {
      setBusyAction(null);
    }
  }

  const storageLabel = vault.settings.uploadEnabled
    ? "0G upload active"
    : vault.settings.storageEnabled
      ? "Commitments active"
      : "0G storage off";
  const newestSnapshot = vault.snapshots[0] ?? null;
  const creatorArchiveReady = characters.length > 0;
  const uploadedTotal = vault.summary.uploadedSnapshots + vault.summary.confirmedSnapshots;
  const uploadRate =
    vault.summary.snapshots > 0 ? Math.round((uploadedTotal / vault.summary.snapshots) * 100) : 0;
  const vaultHealth =
    vault.summary.failedSnapshots > 0
      ? `${vault.summary.failedSnapshots} failed`
      : vault.summary.pendingSnapshots > 0
        ? `${vault.summary.pendingSnapshots} pending`
        : "Healthy";
  const latestProof = newestSnapshot?.txHash ?? newestSnapshot?.rootHash ?? null;
  const proofRows = [
    ["Network", vault.settings.network],
    ["Storage", storageLabel],
    ["Root", formatHash(newestSnapshot?.rootHash ?? null)],
    ["Manifest", formatHash(newestSnapshot?.manifestHash ?? null)],
  ];
  const metricCards = useMemo(
    () => [
      {
        label: "Snapshots",
        value: vault.summary.snapshots.toLocaleString(),
        detail: `${uploadRate}% uploaded or confirmed`,
        icon: Database,
      },
      {
        label: "Rooms",
        value: vault.summary.roomsWithMemory.toLocaleString(),
        detail: "with active memory",
        icon: MessageSquareText,
      },
      {
        label: "Pending",
        value: vault.summary.pendingSnapshots.toLocaleString(),
        detail: "waiting for upload",
        icon: Clock3,
      },
      {
        label: "Network",
        value: vault.settings.network,
        detail: vaultHealth,
        icon: ShieldCheck,
      },
    ],
    [uploadRate, vault, vaultHealth],
  );

  return (
    <div className="app-page wallet-page memory-page">
      <section className="wallet-hero memory-hero memory-command-hero">
        <div className="memory-hero-copy">
          <div className="memory-titlebar">
            <span className="section-label">
              <Brain size={15} /> Memory Vault
            </span>
            <button
              className="secondary-action compact"
              type="button"
              onClick={() => void loadVault()}
            >
              <RefreshCw size={15} /> Refresh
            </button>
          </div>
          <h1>0G memory control room</h1>
          <p>
            Review what is remembered, package private exports, and publish encrypted proofs without
            hunting through chat history.
          </p>
          <div className="memory-status-strip" aria-label="0G memory status">
            <StatusPill
              tone={vault.settings.ogEnabled ? "positive" : "pending"}
              label={vault.settings.ogEnabled ? "0G enabled" : "0G disabled"}
            />
            <StatusPill
              tone={vault.settings.uploadEnabled ? "positive" : "pending"}
              label={storageLabel}
            />
            {newestSnapshot ? (
              <StatusPill
                tone={statusClass(newestSnapshot.status)}
                label={`Latest ${formatStatus(newestSnapshot.status)}`}
              />
            ) : null}
          </div>
          <div className="memory-integrity-meter">
            <div>
              <span>Upload coverage</span>
              <strong>{uploadRate}%</strong>
            </div>
            <i aria-hidden="true">
              <span style={{ width: `${uploadRate}%` }} />
            </i>
          </div>
        </div>
        <div
          className="memory-proof-card memory-proof-terminal"
          aria-label="Latest 0G memory proof"
        >
          <div className="memory-terminal-header">
            <span>
              <KeyRound size={15} /> Proof stream
            </span>
            <b>{vaultHealth}</b>
          </div>
          <strong>{formatHash(latestProof)}</strong>
          <small>
            {newestSnapshot
              ? `${formatSnapshotKind(newestSnapshot.kind)} - ${formatDate(newestSnapshot.createdAt)}`
              : "Create a snapshot to publish the first encrypted commitment."}
          </small>
          <dl className="memory-proof-list">
            {proofRows.map(([label, value]) => (
              <div key={label}>
                <dt>{label}</dt>
                <dd>{value}</dd>
              </div>
            ))}
          </dl>
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

      <section className="wallet-grid memory-action-grid memory-operations-grid">
        <article className="wallet-table-panel memory-action-panel">
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
              <small>
                {vault.summary.snapshots.toLocaleString()} decentralized records created
              </small>
            </span>
          </div>
          <div className="memory-process-list" aria-label="Export process">
            <span>
              <CheckCircle2 size={15} /> Encrypt memory facts
            </span>
            <span>
              <Layers3 size={15} /> Write manifest hash
            </span>
            <span>
              <ShieldCheck size={15} /> Queue 0G proof
            </span>
          </div>
        </article>

        <article className="wallet-table-panel memory-action-panel">
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
              <small>Archive character context into portable 0G packages.</small>
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
      </section>

      <section className="wallet-ledger-grid">
        <article className="wallet-table-panel memory-rooms-panel">
          <div className="panel-heading split">
            <div>
              <span className="section-label">
                <MessageSquareText size={15} /> Remembered rooms
              </span>
              <h2>Conversation snapshots</h2>
            </div>
          </div>
          <div className="wallet-table">
            {vault.rooms.map((room) => (
              <div className="wallet-table-row memory-room-row" key={room.conversationId}>
                <img
                  className="memory-room-avatar"
                  src={room.characterAvatarUrl ?? "/assets/character-avatar-default.svg"}
                  alt=""
                />
                <span>
                  <strong>{room.characterName}</strong>
                  <small>
                    {room.memoryCount.toLocaleString()} facts - {formatDate(room.latestMemoryAt)}
                  </small>
                </span>
                <div className="memory-action-buttons">
                  <Link
                    className="secondary-action compact"
                    href={`/app/chat?characterId=${encodeURIComponent(
                      room.characterId,
                    )}&conversationId=${encodeURIComponent(room.conversationId)}`}
                  >
                    Open
                  </Link>
                  <button
                    className="primary-action compact"
                    type="button"
                    disabled={busyAction !== null}
                    onClick={() => void queueRoomSnapshot(room.conversationId)}
                  >
                    <HardDriveUpload size={15} /> Snapshot
                  </button>
                </div>
              </div>
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

        <article className="wallet-table-panel memory-snapshot-panel">
          <div className="panel-heading split">
            <div>
              <span className="section-label">
                <FileJson size={15} /> 0G records
              </span>
              <h2>Snapshot ledger</h2>
            </div>
          </div>
          <div className="wallet-table">
            {vault.snapshots.map((snapshot) => (
              <div className="wallet-table-row memory-snapshot-row" key={snapshot.id}>
                <span>
                  <strong>{formatSnapshotKind(snapshot.kind)}</strong>
                  <small>
                    {snapshot.characterName ?? snapshot.network} - {snapshot.sourceMemoryCount}{" "}
                    sources - {formatDate(snapshot.createdAt)}
                  </small>
                  <small className="memory-hash">root {formatHash(snapshot.rootHash)}</small>
                  {snapshot.txHash ? (
                    <small className="memory-hash">tx {formatHash(snapshot.txHash)}</small>
                  ) : null}
                  {snapshot.failureReason ? <small>{snapshot.failureReason}</small> : null}
                </span>
                <b className={`memory-status ${statusClass(snapshot.status)}`}>
                  {formatStatus(snapshot.status)}
                </b>
              </div>
            ))}
            {vault.snapshots.length === 0 ? (
              <div className="dashboard-empty-card compact-empty">
                <FileJson size={20} />
                <h3>No decentralized records</h3>
                <p>Queued snapshots will create encrypted 0G records.</p>
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
      ogEnabled: Boolean(payload.settings?.ogEnabled),
      storageEnabled: Boolean(payload.settings?.storageEnabled),
      uploadEnabled: Boolean(payload.settings?.uploadEnabled),
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
    snapshots: Array.isArray(payload.snapshots) ? payload.snapshots : [],
  };
}

function StatusPill(props: { label: string; tone?: string }) {
  return (
    <span className={props.tone ? `memory-pill ${props.tone}` : "memory-pill"}>{props.label}</span>
  );
}

function formatSnapshotKind(value: string): string {
  if (value === "conversation_memory") {
    return "Conversation memory";
  }

  if (value === "user_export") {
    return "User export";
  }

  if (value === "creator_soul_pack") {
    return "Creator soul-pack";
  }

  return formatStatus(value);
}

function statusClass(value: string): string {
  if (value === "uploaded" || value === "confirmed") {
    return "positive";
  }

  if (value === "failed" || value === "unrecoverable") {
    return "negative";
  }

  return "pending";
}

function formatStatus(value: string): string {
  const label = value.replace(/[_-]+/g, " ").trim();

  if (!label) {
    return "Unknown";
  }

  return label.replace(/\b[a-z]/g, (letter) => letter.toUpperCase());
}

function formatHash(value: string | null): string {
  if (!value) {
    return "pending";
  }

  if (value.length <= 18) {
    return value;
  }

  return `${value.slice(0, 10)}...${value.slice(-6)}`;
}

function formatDate(value: string | null): string {
  if (!value) {
    return "No date";
  }

  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}
