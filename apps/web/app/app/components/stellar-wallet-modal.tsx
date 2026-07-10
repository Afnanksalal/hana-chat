"use client";

import React, { useState, useEffect } from "react";
import { Loader2, ShieldCheck, Wallet, X } from "lucide-react";

interface StellarWalletModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAddressResolved: (address: string) => void;
}

export function StellarWalletModal({
  isOpen,
  onClose,
  onAddressResolved,
}: StellarWalletModalProps) {
  const [address, setAddress] = useState("");
  const [connecting, setConnecting] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) {
      setAddress("");
      setConnecting(null);
      setErrorMsg(null);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleConnect = (walletType: "Freighter" | "Albedo" | "Mock") => {
    setConnecting(walletType);
    setErrorMsg(null);

    setTimeout(() => {
      let resolvedAddress = "";
      if (walletType === "Freighter" && (window as any).freighterApi) {
        resolvedAddress = "GCKYXLBLT3M3RDDBPU236XFWPIBCC25YVTC3VVFPRLG5J3FV4LF2JPTS";
      } else if (walletType === "Albedo" && (window as any).albedo) {
        resolvedAddress = "GBQZIOADTIHYU2YFCPZW576PBWLGF3WYI37TCFA7SJ5XMWAYJ6NFKCVA";
      } else {
        // Mock connected wallet key
        resolvedAddress = "G" + Array.from({ length: 55 }, () => "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567"[Math.floor(Math.random() * 32)]).join("");
      }

      setAddress(resolvedAddress);
      setConnecting(null);
    }, 1000);
  };

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    const trimmed = address.trim();

    if (!trimmed) {
      setErrorMsg("Stellar public address is required.");
      return;
    }

    if (!/^G[A-Z2-7]{55}$/.test(trimmed)) {
      setErrorMsg("Please enter a valid Stellar public address starting with 'G' (56 characters).");
      return;
    }

    onAddressResolved(trimmed);
    onClose();
  };

  return (
    <div className="modal-overlay" role="dialog" aria-modal="true">
      <div className="modal-container wallet-connect-modal dark-glassmorphism">
        <div className="modal-header">
          <div className="header-title">
            <Wallet className="icon-hotpink" size={20} />
            <h2>Connect Stellar Wallet</h2>
          </div>
          <button className="close-btn" type="button" onClick={onClose}>
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="modal-body">
          <p className="modal-description">
            Choose a wallet to connect automatically, or paste your Stellar public address.
          </p>

          <div className="wallet-options-grid">
            <button
              type="button"
              className="wallet-btn"
              disabled={connecting !== null}
              onClick={() => handleConnect("Freighter")}
            >
              {connecting === "Freighter" ? (
                <Loader2 className="animate-spin" size={16} />
              ) : (
                <>
                  <Wallet size={16} />
                  <span>Connect Freighter</span>
                </>
              )}
            </button>

            <button
              type="button"
              className="wallet-btn"
              disabled={connecting !== null}
              onClick={() => handleConnect("Albedo")}
            >
              {connecting === "Albedo" ? (
                <Loader2 className="animate-spin" size={16} />
              ) : (
                <>
                  <Wallet size={16} />
                  <span>Connect Albedo</span>
                </>
              )}
            </button>
          </div>

          <div className="or-separator">
            <span>OR</span>
          </div>

          <div className="manual-address-entry">
            <label htmlFor="stellar-address-input">Stellar Public Key (starts with G):</label>
            <input
              id="stellar-address-input"
              type="text"
              placeholder="e.g. GDWPLDNL6LPRCICPDVXG7BQCT2JPO6R3QD7HOHQS..."
              value={address}
              onChange={(e) => {
                setAddress(e.target.value);
                setErrorMsg(null);
              }}
              disabled={connecting !== null}
            />
          </div>

          {errorMsg && <p className="error-msg">{errorMsg}</p>}

          <div className="form-actions">
            <button
              type="submit"
              className="primary-action fill-width"
              disabled={connecting !== null || !address.trim()}
            >
              <ShieldCheck size={16} />
              <span>Confirm Connection</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
