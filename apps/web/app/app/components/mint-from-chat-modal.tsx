"use client";

import { Loader2, Sparkles, X } from "lucide-react";
import { useState } from "react";
import { apiJson } from "../api";
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
  const [description, setDescription] = useState(`AI-generated artwork from chat with ${characterName}`);
  const [walletAddress, setWalletAddress] = useState("");
  const [royaltyBps, setRoyaltyBps] = useState(500);
  const [isMinting, setIsMinting] = useState(false);
  const [status, setStatus] = useState("");
  const [activePayment, setActivePayment] = useState<StellarPaymentIntent | null>(null);
  const [isCheckoutOpen, setIsCheckoutOpen] = useState(false);

  if (!isOpen) return null;

  async function handleMint() {
    if (!walletAddress.trim()) {
      setStatus("Please enter a wallet address");
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
        setStatus("Payment required. Please proceed with payment.");
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
          <h2>Mint as NFT</h2>
          <button onClick={onClose} className="close-button">
            <X size={20} />
          </button>
        </div>

        <div className="mint-modal-content">
          <div className="mint-modal-preview">
            <img src={`/api/v1/media/${mediaId}/file`} alt="Preview" className="preview-image" />
          </div>

          <div className="mint-modal-form">
            <div className="form-group">
              <label htmlFor="title">Title</label>
              <input
                id="title"
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="form-input"
                placeholder="NFT title"
              />
            </div>

            <div className="form-group">
              <label htmlFor="description">Description</label>
              <textarea
                id="description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="form-textarea"
                placeholder="NFT description"
                rows={3}
              />
            </div>

            <div className="form-group">
              <label htmlFor="wallet">Wallet Address</label>
              <input
                id="wallet"
                type="text"
                value={walletAddress}
                onChange={(e) => setWalletAddress(e.target.value)}
                className="form-input"
                placeholder="G..."
              />
            </div>

            <div className="form-group">
              <label htmlFor="royalty">Royalty ({royaltyBps / 100}%)</label>
              <input
                id="royalty"
                type="range"
                min="0"
                max="1000"
                step="50"
                value={royaltyBps}
                onChange={(e) => setRoyaltyBps(Number(e.target.value))}
                className="form-range"
              />
            </div>

            {status && (
              <div className={`status-message ${status.includes("success") ? "success" : "error"}`}>
                {status}
              </div>
            )}

            <button
              onClick={() => void handleMint()}
              disabled={isMinting}
              className="mint-button"
            >
              {isMinting ? (
                <>
                  <Loader2 className="spinner" size={16} />
                  Minting...
                </>
              ) : (
                <>
                  <Sparkles size={16} />
                  Mint NFT
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
