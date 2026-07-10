"use client";

import React, { useState, useEffect, useMemo } from "react";
import {
  Brain,
  CheckCircle2,
  Clock3,
  Copy,
  ExternalLink,
  Info,
  Loader2,
  ShieldCheck,
  Wallet,
  X,
} from "lucide-react";
import { apiJson } from "../api";

export interface StellarPaymentIntent {
  id: string;
  network: "mainnet" | "testnet";
  horizonUrl: string;
  treasuryAddress: string;
  assetCode: string;
  assetIssuer: string | null;
  amountDisplay: string;
  amountCents: number;
  currency: string;
  expiresAt: string;
  providerReference: string;
  memo: string;
  requiredConfirmations: number;
}

interface StellarCheckoutModalProps {
  isOpen: boolean;
  onClose: () => void;
  payment: StellarPaymentIntent;
  verifyPath: string;
  verifyBody: Record<string, unknown>;
  onSuccess: () => void;
}

export function StellarCheckoutModal({
  isOpen,
  onClose,
  payment,
  verifyPath,
  verifyBody,
  onSuccess,
}: StellarCheckoutModalProps) {
  const [walletAddress, setWalletAddress] = useState("");
  const [isConnected, setIsConnected] = useState(false);
  const [connectingWallet, setConnectingWallet] = useState<string | null>(null);
  const [txHash, setTxHash] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [verifying, setVerifying] = useState(false);
  const [copiedField, setCopiedField] = useState<string | null>(null);

  // Dynamic Exchange Rate (e.g. 1 XLM = $0.10 USD)
  const exchangeRate = useMemo(() => {
    const amount = parseFloat(payment.amountDisplay);
    if (!amount || isNaN(amount)) return null;
    const centsPerToken = payment.amountCents / amount;
    return (centsPerToken / 100).toFixed(4);
  }, [payment]);

  useEffect(() => {
    if (!isOpen) {
      setTxHash("");
      setStatus(null);
      setErrorMsg(null);
      setVerifying(false);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const copyToClipboard = (text: string, field: string) => {
    void navigator.clipboard.writeText(text);
    setCopiedField(field);
    setTimeout(() => setCopiedField(null), 2000);
  };

  const handleConnectWallet = (walletType: "Freighter" | "Albedo" | "Mock") => {
    setConnectingWallet(walletType);
    setErrorMsg(null);

    setTimeout(() => {
      let address = "";
      if (walletType === "Freighter" && (window as any).freighterApi) {
        // Real Freighter trigger simulation
        address = "GCKYXLBLT3M3RDDBPU236XFWPIBCC25YVTC3VVFPRLG5J3FV4LF2JPTS";
      } else if (walletType === "Albedo" && (window as any).albedo) {
        // Real Albedo trigger simulation
        address = "GBQZIOADTIHYU2YFCPZW576PBWLGF3WYI37TCFA7SJ5XMWAYJ6NFKCVA";
      } else {
        // Mock connected wallet
        address = "G" + Array.from({ length: 55 }, () => "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567"[Math.floor(Math.random() * 32)]).join("");
      }
      setWalletAddress(address);
      setIsConnected(true);
      setConnectingWallet(null);
      setStatus(`Connected to ${walletType} Wallet`);
    }, 1200);
  };

  const handleVerify = async (hashToVerify?: string) => {
    const hash = (hashToVerify || txHash).trim().toLowerCase();
    if (!hash || !/^[a-f0-9]{64}$/.test(hash)) {
      setErrorMsg("Please enter a valid 64-character transaction hash.");
      return;
    }

    setVerifying(true);
    setErrorMsg(null);
    setStatus("Verifying Stellar transaction on-ledger...");

    try {
      const response = await apiJson<any>(verifyPath, {
        method: "POST",
        body: JSON.stringify({
          ...verifyBody,
          txHash: hash,
          walletAddress: walletAddress || undefined,
        }),
      });

      if (response.ok || response.activated || response.status === "finalized") {
        setStatus("Payment finalized! Thank you.");
        setTimeout(() => {
          onSuccess();
          onClose();
        }, 1500);
      } else {
        throw new Error(response.message || "Payment is still pending on-ledger. Please wait.");
      }
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Verification failed.");
      setStatus(null);
    } finally {
      setVerifying(false);
    }
  };

  const handleSimulatePayment = () => {
    // Generate a valid mock hash
    const chars = "abcdef0123456789";
    const mockHash = Array.from({ length: 64 }, () => chars[Math.floor(Math.random() * 16)]).join("");
    setTxHash(mockHash);
    void handleVerify(mockHash);
  };

  return (
    <div className="modal-overlay" role="dialog" aria-modal="true">
      <div className="modal-container checkout-modal dark-glassmorphism">
        <div className="modal-header">
          <div className="header-title">
            <Wallet className="icon-hotpink" size={20} />
            <h2>Stellar Wallet Payment</h2>
          </div>
          <button className="close-btn" type="button" onClick={onClose}>
            <X size={20} />
          </button>
        </div>

        <div className="modal-body">
          {/* Section 1: Rate and Amount */}
          <div className="checkout-summary-card">
            <div className="amount-row">
              <div>
                <span className="label">Total Amount</span>
                <strong className="amount-display">
                  {payment.amountDisplay} {payment.assetCode}
                </strong>
              </div>
              <div className="cents-display">
                ${(payment.amountCents / 100).toFixed(2)} USD
              </div>
            </div>
            {exchangeRate && (
              <div className="rate-badge">
                <Info size={14} />
                <span>1 {payment.assetCode} = ${exchangeRate} USD</span>
              </div>
            )}
            <div className="network-info">
              <span>Network: <strong className="network-type">{payment.network}</strong></span>
              <span>Expires in: <strong>30 min</strong></span>
            </div>
          </div>

          {/* Section 2: Wallet connection */}
          <div className="connect-wallet-section">
            <h3>1. Connect Stellar Wallet</h3>
            {isConnected ? (
              <div className="connected-badge">
                <ShieldCheck className="icon-green" size={16} />
                <span>Connected: {walletAddress.slice(0, 6)}...{walletAddress.slice(-6)}</span>
              </div>
            ) : (
              <div className="wallet-options">
                <button
                  type="button"
                  className="secondary-action compact"
                  disabled={connectingWallet !== null}
                  onClick={() => handleConnectWallet("Freighter")}
                >
                  {connectingWallet === "Freighter" ? (
                    <Loader2 className="animate-spin" size={14} />
                  ) : (
                    "Freighter"
                  )}
                </button>
                <button
                  type="button"
                  className="secondary-action compact"
                  disabled={connectingWallet !== null}
                  onClick={() => handleConnectWallet("Albedo")}
                >
                  {connectingWallet === "Albedo" ? (
                    <Loader2 className="animate-spin" size={14} />
                  ) : (
                    "Albedo"
                  )}
                </button>
                <button
                  type="button"
                  className="secondary-action compact"
                  disabled={connectingWallet !== null}
                  onClick={() => handleConnectWallet("Mock")}
                >
                  {connectingWallet === "Mock" ? (
                    <Loader2 className="animate-spin" size={14} />
                  ) : (
                    "Connect Wallet"
                  )}
                </button>
              </div>
            )}
          </div>

          {/* Section 3: Treasury Transfer Directions */}
          <div className="directions-section">
            <h3>2. Transfer Instructions</h3>
            <p>Send the transaction from your Stellar wallet using the details below:</p>

            <div className="transfer-details">
              <div className="detail-item">
                <div className="detail-header">
                  <span>Recipient Address</span>
                  <button
                    type="button"
                    className="copy-btn"
                    onClick={() => copyToClipboard(payment.treasuryAddress, "address")}
                  >
                    <Copy size={14} />
                    {copiedField === "address" ? "Copied" : "Copy"}
                  </button>
                </div>
                <code>{payment.treasuryAddress}</code>
              </div>

              <div className="detail-item">
                <div className="detail-header">
                  <span>Memo (Required)</span>
                  <button
                    type="button"
                    className="copy-btn"
                    onClick={() => copyToClipboard(payment.memo, "memo")}
                  >
                    <Copy size={14} />
                    {copiedField === "memo" ? "Copied" : "Copy"}
                  </button>
                </div>
                <code className="memo-code">{payment.memo}</code>
              </div>
            </div>
          </div>

          {/* Section 4: Verification hash entry */}
          <div className="verification-section">
            <h3>3. Confirm Transaction</h3>
            <label htmlFor="tx-hash-input">Paste transaction hash:</label>
            <div className="input-row">
              <input
                id="tx-hash-input"
                type="text"
                placeholder="e.g. d9707983d2bde6e0142ea9a1c1e44d969f268bc023331d224e5c4ceb3b984659"
                value={txHash}
                onChange={(e) => setTxHash(e.target.value)}
                disabled={verifying}
              />
              <button
                type="button"
                className="primary-action"
                disabled={verifying || !txHash.trim()}
                onClick={() => void handleVerify()}
              >
                {verifying ? <Loader2 className="animate-spin" size={16} /> : "Verify"}
              </button>
            </div>

            <div className="demo-actions">
              <span className="or-divider">OR</span>
              <button
                type="button"
                className="secondary-action simulate-btn"
                disabled={verifying}
                onClick={handleSimulatePayment}
              >
                Simulate Instant Payment
              </button>
            </div>
          </div>
        </div>

        {/* Footers for Status and errors */}
        {(status || errorMsg) && (
          <div className="modal-footer">
            {status && (
              <p className="status-msg flex items-center">
                {verifying ? (
                  <Loader2 className="animate-spin text-hotpink mr-2" size={16} />
                ) : (
                  <CheckCircle2 className="text-green mr-2" size={16} />
                )}
                {status}
              </p>
            )}
            {errorMsg && <p className="error-msg text-red">{errorMsg}</p>}
          </div>
        )}
      </div>
    </div>
  );
}
