"use client";

import { Loader2, Sparkles, Wallet, X } from "lucide-react";
import { useEffect, useState } from "react";
import { apiJson } from "../api";
import { connectFreighterWallet } from "../stellar-wallet-client";
import { StellarCheckoutModal } from "./stellar-checkout-modal";
import type { StellarPaymentIntent } from "../stellar-payments";

interface MintFromChatModalProps {
  isOpen: boolean;
  onClose: () => void;
  mediaId: string;
  characterId: string;
  characterName: string;
}

export function MintFromChatModal({
  isOpen,
  onClose,
  mediaId,
  characterId,
  characterName,
}: MintFromChatModalProps) {
  const [title, setTitle] = useState(`${characterName} Vision`);
  const [description, setDescription] = useState(
    `AI-generated artwork from chat with ${characterName}`,
  );
  const [walletAddress, setWalletAddress] = useState("");
  const [royaltyBps, setRoyaltyBps] = useState(500);
  const [isMinting, setIsMinting] = useState(false);
  const [isConnectingWallet, setIsConnectingWallet] = useState(false);
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
        if (!cancelled) {
          setWalletAddress(address);
        }
      } catch {
        // Wallet not connected — user can type it manually
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
      setStatus(error instanceof Error ? error.message : "Failed to connect wallet");
    } finally {
      setIsConnectingWallet(false);
    }
  }

  async function handleMint() {
    if (!walletAddress.trim()) {
      setStatus("Please connect a wallet or enter a wallet address");
      return;
    }

    setIsMinting(true);
    setStatus("");

    try {
      const response = await apiJson<{
        ok?: boolean;
        assetId?: string;
        tokenId?: string;
        txHash?: string;
        provider?: string;
        payment?: StellarPaymentIntent;
      }>("/api/v1/nft/assets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          characterId,
          mediaAssetId: mediaId,
          title: title.trim(),
          description: description.trim(),
          ownerWalletAddress: walletAddress.trim(),
          royaltyBps,
        }),
      });

      if (response.provider === "stellar" && response.payment) {
        setActivePayment(response.payment);
        setIsCheckoutOpen(true);
        setStatus("Payment required to mint this NFT.");
      } else {
        setStatus("NFT minted successfully!");
        setTimeout(() => {
          onClose();
          setStatus("");
        }, 2000);
      }
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Failed to mint NFT");
    } finally {
      setIsMinting(false);
    }
  }

  return (
    <div className="mint-from-chat-modal-overlay">
      <div className="mint-from-chat-modal">
        <div className="mint-modal-header">
          <div className="mint-modal-title">
            <Sparkles size={18} />
            <h2>Mint as NFT</h2>
          </div>
          <button onClick={onClose} className="close-button" aria-label="Close">
            <X size={20} />
          </button>
        </div>

        <div className="mint-modal-content">
          <div className="mint-modal-preview">
            <img src={`/api/v1/media/${mediaId}/file`} alt="Preview" className="preview-image" />
            <div className="mint-preview-badge">
              <Sparkles size={12} />
              <span>AI Generated</span>
            </div>
          </div>

          <div className="mint-modal-form">
            <div className="form-group">
              <label htmlFor="mint-title">Title</label>
              <input
                id="mint-title"
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="form-input"
                placeholder="NFT title"
              />
            </div>

            <div className="form-group">
              <label htmlFor="mint-description">Description</label>
              <textarea
                id="mint-description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="form-textarea"
                placeholder="NFT description"
                rows={2}
              />
            </div>

            <div className="form-group">
              <label htmlFor="mint-wallet">Wallet Address</label>
              <div className="wallet-input-row">
                <input
                  id="mint-wallet"
                  type="text"
                  value={walletAddress}
                  onChange={(e) => setWalletAddress(e.target.value)}
                  className="form-input"
                  placeholder="G... (your Stellar address)"
                />
                <button
                  type="button"
                  className="wallet-connect-btn"
                  onClick={() => void handleConnectWallet()}
                  disabled={isConnectingWallet}
                  title="Connect Freighter wallet"
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

            <div className="form-group">
              <label htmlFor="mint-royalty">
                Creator royalty <strong>{royaltyBps / 100}%</strong>
              </label>
              <input
                id="mint-royalty"
                type="range"
                min="0"
                max="1000"
                step="50"
                value={royaltyBps}
                onChange={(e) => setRoyaltyBps(Number(e.target.value))}
                className="form-range"
              />
            </div>

            <p className="mint-price-note">
              <Sparkles size={13} />
              Mint fee: $1.00 USD in XLM · You own this NFT forever
            </p>

            {status && (
              <div
                className={`status-message ${
                  status.includes("success")
                    ? "success"
                    : status.includes("Payment")
                      ? "info"
                      : "error"
                }`}
              >
                {status}
              </div>
            )}

            <button
              onClick={() => void handleMint()}
              disabled={isMinting}
              className="mint-button"
              type="button"
            >
              {isMinting ? (
                <>
                  <Loader2 className="spinner" size={16} />
                  Preparing mint...
                </>
              ) : (
                <>
                  <Sparkles size={16} />
                  Pay &amp; Mint NFT
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
            setStatus("Minting paused. Resume payment or start over.");
          }}
          payment={activePayment}
          verifyPath="/api/v1/nft/assets"
          verifyBody={{
            characterId,
            mediaAssetId: mediaId,
            title: title.trim(),
            description: description.trim(),
            ownerWalletAddress: walletAddress.trim(),
            royaltyBps,
            paymentId: activePayment.id,
          }}
          onSuccess={() => {
            setIsCheckoutOpen(false);
            setStatus("NFT minted successfully!");
            setTimeout(() => {
              onClose();
              setStatus("");
            }, 2000);
          }}
        />
      )}
    </div>
  );
}
