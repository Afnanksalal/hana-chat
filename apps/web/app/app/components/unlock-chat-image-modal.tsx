"use client";

import { Image, Loader2, Lock, Sparkles, Wallet, X } from "lucide-react";
import { useEffect, useState } from "react";
import { apiJson } from "../api";
import { connectFreighterWallet } from "../stellar-wallet-client";
import { StellarCheckoutModal } from "./stellar-checkout-modal";
import type { StellarPaymentIntent } from "../stellar-payments";

interface UnlockChatImageModalProps {
  isOpen: boolean;
  onClose: () => void;
  mediaId: string;
  characterId: string;
  characterName: string;
  /** Called when the image is successfully unlocked + minted */
  onUnlocked: (mediaId: string, imageUrl: string, nftAssetId: string) => void;
}

export function UnlockChatImageModal({
  isOpen,
  onClose,
  mediaId,
  characterId,
  characterName,
  onUnlocked,
}: UnlockChatImageModalProps) {
  const [walletAddress, setWalletAddress] = useState("");
  const [isConnectingWallet, setIsConnectingWallet] = useState(false);
  const [isUnlocking, setIsUnlocking] = useState(false);
  const [status, setStatus] = useState("");
  const [activePayment, setActivePayment] = useState<StellarPaymentIntent | null>(null);
  const [isCheckoutOpen, setIsCheckoutOpen] = useState(false);

  // Auto-detect connected Freighter wallet on open
  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    void (async () => {
      try {
        const address = await connectFreighterWallet();
        if (!cancelled) setWalletAddress(address);
      } catch {
        // Wallet not connected — user can type it or connect manually
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isOpen]);

  if (!isOpen) return null;

  async function handleConnectWallet() {
    setIsConnectingWallet(true);
    setStatus("");
    try {
      const address = await connectFreighterWallet();
      setWalletAddress(address);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Could not connect wallet");
    } finally {
      setIsConnectingWallet(false);
    }
  }

  async function handleUnlock() {
    if (!walletAddress.trim()) {
      setStatus("Connect your Stellar wallet to unlock");
      return;
    }

    setIsUnlocking(true);
    setStatus("");

    try {
      const response = await apiJson<{
        ok?: boolean;
        provider?: string;
        payment?: StellarPaymentIntent;
        nftAssetId?: string;
        imageUrl?: string;
        alreadyUnlocked?: boolean;
        mintPending?: boolean;
      }>("/api/v1/nft/chat-image/unlock", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mediaAssetId: mediaId,
          ownerWalletAddress: walletAddress.trim(),
        }),
      });

      if (response.alreadyUnlocked && response.imageUrl && response.nftAssetId) {
        setStatus("Already unlocked!");
        onUnlocked(mediaId, response.imageUrl, response.nftAssetId);
        setTimeout(onClose, 1200);
        return;
      }

      if (response.provider === "stellar" && response.payment) {
        setActivePayment(response.payment);
        setIsCheckoutOpen(true);
        setStatus("Complete checkout to unlock this scene.");
        return;
      }

      setStatus("Unexpected response. Please try again.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Failed to initiate unlock");
    } finally {
      setIsUnlocking(false);
    }
  }

  const verifyBody = {
    mediaAssetId: mediaId,
    characterId,
    ownerWalletAddress: walletAddress.trim(),
    paymentId: activePayment?.id,
  };

  return (
    <div className="unlock-image-overlay">
      <div className="unlock-image-modal">
        <div className="unlock-modal-header">
          <div className="unlock-modal-title">
            <Lock size={17} />
            <h2>Unlock scene</h2>
          </div>
          <button onClick={onClose} className="close-button" type="button" aria-label="Close">
            <X size={20} />
          </button>
        </div>

        <div className="unlock-modal-body">
          <div className="unlock-preview-wrap">
            <div className="unlock-preview-placeholder" aria-hidden="true">
              <Sparkles size={34} />
            </div>
            <div className="unlock-preview-lock">
              <Lock size={32} />
              <span>Locked scene</span>
            </div>
          </div>

          <div className="unlock-modal-info">
            <div className="unlock-price-card">
              <Sparkles size={18} />
              <div>
                <strong>Secure checkout</strong>
                <p>Reveal this scene and add it to your collection.</p>
              </div>
            </div>

            <div className="unlock-split-row">
              <span>
                <Image size={13} />
                {characterName}'s creator earns from the unlock.
              </span>
              <span>
                <Sparkles size={13} />
                Ownership proof is created after payment clears.
              </span>
            </div>

            <div className="unlock-wallet-group">
              <label htmlFor="unlock-wallet" className="unlock-label">
                Your Stellar wallet
              </label>
              <div className="wallet-input-row">
                <input
                  id="unlock-wallet"
                  type="text"
                  value={walletAddress}
                  onChange={(e) => setWalletAddress(e.target.value)}
                  className="form-input"
                  placeholder="G... (collection wallet)"
                />
                <button
                  type="button"
                  className="wallet-connect-btn"
                  onClick={() => void handleConnectWallet()}
                  disabled={isConnectingWallet}
                  title="Connect Freighter"
                  aria-label="Connect Freighter wallet"
                >
                  {isConnectingWallet ? (
                    <Loader2 size={15} className="spinner" />
                  ) : (
                    <Wallet size={15} />
                  )}
                </button>
              </div>
              {walletAddress && (
                <p className="wallet-detected">
                  <span className="wallet-dot" />
                  {walletAddress.slice(0, 6)}...{walletAddress.slice(-4)}
                </p>
              )}
            </div>

            {status && (
              <div
                className={`status-message ${
                  status.includes("Already") || status.includes("success")
                    ? "success"
                    : status.includes("Complete") || status.includes("payment")
                      ? "info"
                      : "error"
                }`}
              >
                {status}
              </div>
            )}

            <button
              type="button"
              className="unlock-pay-btn"
              onClick={() => void handleUnlock()}
              disabled={isUnlocking}
            >
              {isUnlocking ? (
                <>
                  <Loader2 size={16} className="spinner" />
                  Preparing payment…
                </>
              ) : (
                <>
                  <Lock size={16} />
                  Unlock scene
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      {isCheckoutOpen && activePayment && (
        <StellarCheckoutModal
          isOpen={isCheckoutOpen}
          onClose={() => {
            setIsCheckoutOpen(false);
            setStatus("Payment paused. Click Unlock to resume.");
          }}
          payment={activePayment}
          verifyPath="/api/v1/nft/chat-image/unlock"
          verifyBody={verifyBody}
          onSuccess={() => {
            setIsCheckoutOpen(false);
            setStatus("Unlocked. Scene added to your collection.");
            onUnlocked(mediaId, `/api/v1/media/${mediaId}/file`, "pending");
            setTimeout(onClose, 1800);
          }}

        />
      )}
    </div>
  );
}
