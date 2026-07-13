"use client";

import {
  CheckCircle2,
  Clock3,
  Copy,
  Info,
  Loader2,
  RefreshCw,
  ShieldCheck,
  Wallet,
  X,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { apiJson } from "../api";
import type { StellarPaymentIntent } from "../stellar-payments";
import {
  loadStellarWallet,
  submitStellarPaymentWithFreighter,
  type StellarWalletSnapshot,
} from "../stellar-wallet-client";
import { StellarWalletModal } from "./stellar-wallet-modal";

interface VerificationResponse {
  ok?: boolean;
  activated?: boolean;
  status?: string;
  message?: string;
}

interface StellarCheckoutModalProps {
  isOpen: boolean;
  onClose: () => void;
  payment: StellarPaymentIntent;
  openWalletOnStart?: boolean;
  verifyPath: string;
  verifyBody: Record<string, unknown>;
  onSuccess: () => void;
}

export function StellarCheckoutModal({
  isOpen,
  onClose,
  payment,
  openWalletOnStart = false,
  verifyPath,
  verifyBody,
  onSuccess,
}: StellarCheckoutModalProps) {
  const [walletAddress, setWalletAddress] = useState("");
  const [wallet, setWallet] = useState<StellarWalletSnapshot | null>(null);
  const [walletModalOpen, setWalletModalOpen] = useState(false);
  const [loadingWallet, setLoadingWallet] = useState(false);
  const [txHash, setTxHash] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [verifying, setVerifying] = useState(false);
  const [payingWithWallet, setPayingWithWallet] = useState(false);
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [clock, setClock] = useState(() => Date.now());

  const exchangeRate = useMemo(() => {
    const amount = Number(payment.amountDisplay);
    return Number.isFinite(amount) && amount > 0 ? payment.amountCents / 100 / amount : null;
  }, [payment.amountCents, payment.amountDisplay]);
  const paymentAsset = wallet?.assets.find(
    (asset) =>
      asset.assetCode === payment.assetCode && asset.assetIssuer === payment.assetIssuer,
  );
  const paymentAssetBalance = paymentAsset ? Number(paymentAsset.availableBalance) : null;
  const requiredAmount = Number(payment.amountDisplay);
  const hasEnoughPaymentAsset =
    paymentAssetBalance !== null &&
    Number.isFinite(paymentAssetBalance) &&
    Number.isFinite(requiredAmount) &&
    paymentAssetBalance >= requiredAmount;
  const isExpired = new Date(payment.expiresAt).getTime() <= clock;
  const expiresIn = formatTimeRemaining(payment.expiresAt, clock);

  useEffect(() => {
    if (!isOpen) {
      setWalletAddress("");
      setWallet(null);
      setWalletModalOpen(false);
      setTxHash("");
      setStatus(null);
      setErrorMessage(null);
      setVerifying(false);
      setPayingWithWallet(false);
      return;
    }

    setClock(Date.now());
    setWalletModalOpen(openWalletOnStart);
    const interval = window.setInterval(() => setClock(Date.now()), 30_000);
    return () => window.clearInterval(interval);
  }, [isOpen, openWalletOnStart, payment.id]);

  if (!isOpen) return null;

  async function copyToClipboard(text: string, field: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedField(field);
      window.setTimeout(() => setCopiedField(null), 2_000);
    } catch {
      setErrorMessage("Clipboard access is unavailable. Select and copy the value manually.");
    }
  }

  async function useWalletAddress(address: string) {
    setWalletAddress(address);
    setLoadingWallet(true);
    setErrorMessage(null);

    try {
      const snapshot = await loadStellarWallet(address);
      setWallet(snapshot);
      setStatus("Wallet connected. Review the asset balance and locked rate before paying.");
    } catch (error) {
      setWallet(null);
      setErrorMessage(error instanceof Error ? error.message : "Could not load wallet assets.");
    } finally {
      setLoadingWallet(false);
    }
  }

  async function verifyPayment(nextTxHash = txHash, nextWalletAddress = walletAddress) {
    const hash = nextTxHash.trim().toLowerCase();

    if (!/^[a-f0-9]{64}$/.test(hash)) {
      setErrorMessage("Enter a valid 64-character Stellar transaction hash.");
      return;
    }

    setVerifying(true);
    setErrorMessage(null);
    setStatus("Verifying the transaction on Stellar...");

    try {
      const response = await apiJson<VerificationResponse>(verifyPath, {
        method: "POST",
        body: JSON.stringify({
          ...verifyBody,
          txHash: hash,
          walletAddress: nextWalletAddress || undefined,
        }),
      });

      if (!response.ok && !response.activated && response.status !== "finalized") {
        throw new Error(response.message || "The payment has not finalized yet.");
      }

      setStatus("Payment verified. Your purchase is active.");
      onSuccess();
      onClose();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Payment verification failed.");
      setStatus(null);
    } finally {
      setVerifying(false);
    }
  }

  async function payWithFreighter() {
    setPayingWithWallet(true);
    setErrorMessage(null);
    setStatus("Opening Freighter to sign the exact checkout payment...");

    try {
      const freighterInput: Parameters<typeof submitStellarPaymentWithFreighter>[0] = { payment };

      if (walletAddress) {
        freighterInput.walletAddress = walletAddress;
      }

      const submitted = await submitStellarPaymentWithFreighter(freighterInput);

      setWalletAddress(submitted.walletAddress);
      setTxHash(submitted.txHash);
      setStatus("Payment submitted. Verifying it on Stellar...");
      await verifyPayment(submitted.txHash, submitted.walletAddress);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Freighter payment failed.");
      setStatus(null);
    } finally {
      setPayingWithWallet(false);
    }
  }

  return (
    <>
      <div
        className="modal-overlay"
        role="dialog"
        aria-modal="true"
        aria-labelledby="checkout-title"
      >
        <div className="modal-container checkout-modal">
          <div className="modal-header">
            <div className="header-title">
              <Wallet className="icon-hotpink" size={20} />
              <h2 id="checkout-title">Wallet checkout</h2>
            </div>
            <button className="close-btn" type="button" onClick={onClose} aria-label="Close checkout">
              <X size={20} />
            </button>
          </div>

          <div className="modal-body">
            <section className="checkout-summary-card" aria-label="Payment amount and rate">
              <div className="amount-row">
                <div>
                  <span className="label">Amount due</span>
                  <strong className="amount-display">
                    {payment.amountDisplay} {payment.assetCode}
                  </strong>
                </div>
                <div className="cents-display">
                  {formatMoney(payment.amountCents, payment.currency)}
                </div>
              </div>
              {exchangeRate !== null ? (
                <div className="rate-badge">
                  <Info size={14} />
                  <span>
                    1 {payment.assetCode} = {formatMoney(exchangeRate * 100, payment.currency)} ·
                    locked for this checkout
                  </span>
                </div>
              ) : null}
              <div className="network-info">
                <span>
                  Network: <strong className="network-type">{payment.network}</strong>
                </span>
                <span>
                  <Clock3 size={12} /> <strong>{expiresIn}</strong>
                </span>
              </div>
            </section>

            <section className="connect-wallet-section">
              <div className="checkout-section-heading">
                <h3>1. Connect wallet</h3>
                {walletAddress ? (
                  <button
                    type="button"
                    className="copy-btn"
                    onClick={() => setWalletModalOpen(true)}
                  >
                    Change
                  </button>
                ) : null}
              </div>
              {walletAddress ? (
                <>
                  <div className="connected-wallet-card">
                    <span className="connected-badge">
                      <ShieldCheck className="icon-green" size={16} />
                      {formatAddress(walletAddress)}
                    </span>
                    <div className="connected-wallet-balance">
                      <small>{payment.assetCode} available</small>
                      <strong>
                        {loadingWallet
                          ? "Loading..."
                          : paymentAsset
                            ? `${formatAssetBalance(paymentAsset.availableBalance)} ${payment.assetCode}`
                            : `No ${payment.assetCode} balance`}
                      </strong>
                    </div>
                  </div>
                  {!loadingWallet && paymentAsset && !hasEnoughPaymentAsset ? (
                    <div className="wallet-trustline-warning">
                      <p>
                        This wallet has less {payment.assetCode} than this checkout requires.
                      </p>
                    </div>
                  ) : null}
                  {!loadingWallet && !paymentAsset ? (
                    <div className="wallet-trustline-warning">
                      <p>
                        <strong>Trustline required:</strong> Your wallet does not have a trustline for the checkout asset ({payment.assetCode}). You must establish a trustline in your wallet to complete the payment.
                      </p>
                    </div>
                  ) : null}
                </>
              ) : (
                <button
                  type="button"
                  className="wallet-open-button"
                  onClick={() => setWalletModalOpen(true)}
                >
                  <Wallet size={18} />
                  <span>
                    <strong>Open wallet</strong>
                    <small>View all assets and the accepted checkout rate</small>
                  </span>
                </button>
              )}
            </section>

            <section className="directions-section">
              <h3>2. Send payment</h3>
              <p>
                In your wallet, send the exact asset and amount below. The memo is required for Hana
                to match your payment.
              </p>
              <button
                type="button"
                className="wallet-submit-button"
                disabled={
                  payingWithWallet ||
                  verifying ||
                  loadingWallet ||
                  isExpired ||
                  (Boolean(walletAddress) && (!paymentAsset || !hasEnoughPaymentAsset))
                }
                onClick={() => void payWithFreighter()}
              >
                {payingWithWallet ? (
                  <Loader2 className="animate-spin" size={17} />
                ) : (
                  <Wallet size={17} />
                )}
                <span>
                  <strong>{payingWithWallet ? "Waiting for Freighter..." : "Pay with Freighter"}</strong>
                  <small>Sign and submit the exact checkout transaction</small>
                </span>
              </button>
              <div className="transfer-details">
                <PaymentDetail
                  label="Asset"
                  value={
                    payment.assetIssuer
                      ? `${payment.assetCode} · issuer ${formatAddress(payment.assetIssuer)}`
                      : `${payment.assetCode} · native asset`
                  }
                  copied={copiedField === "asset"}
                  onCopy={() => void copyToClipboard(payment.assetCode, "asset")}
                />
                <PaymentDetail
                  label="Recipient"
                  value={payment.treasuryAddress}
                  copied={copiedField === "address"}
                  onCopy={() => void copyToClipboard(payment.treasuryAddress, "address")}
                />
                <PaymentDetail
                  label="Memo · required"
                  value={payment.memo}
                  emphasized
                  copied={copiedField === "memo"}
                  onCopy={() => void copyToClipboard(payment.memo, "memo")}
                />
              </div>
            </section>

            <section className="verification-section">
              <h3>3. Verify transaction</h3>
              <label htmlFor="tx-hash-input">Transaction hash</label>
              <div className="input-row">
                <input
                  id="tx-hash-input"
                  type="text"
                  autoComplete="off"
                  spellCheck={false}
                  placeholder="64-character Stellar transaction hash"
                  value={txHash}
                  onChange={(event) => {
                    setTxHash(event.target.value);
                    setErrorMessage(null);
                  }}
                  disabled={verifying}
                />
                <button
                  type="button"
                  className="primary-action"
                  disabled={verifying || !/^[a-fA-F0-9]{64}$/.test(txHash.trim())}
                  onClick={() => void verifyPayment()}
                >
                  {verifying ? <Loader2 className="animate-spin" size={16} /> : <RefreshCw size={16} />}
                  Verify
                </button>
              </div>
            </section>

            {status ? (
              <p className="status-msg" aria-live="polite">
                {verifying ? (
                  <Loader2 className="animate-spin" size={16} />
                ) : (
                  <CheckCircle2 size={16} />
                )}
                {status}
              </p>
            ) : null}
            {errorMessage ? (
              <p className="error-msg" aria-live="assertive">
                {errorMessage}
              </p>
            ) : null}
          </div>
        </div>
      </div>

      <StellarWalletModal
        isOpen={walletModalOpen}
        network={payment.network}
        onClose={() => setWalletModalOpen(false)}
        onAddressResolved={(address) => void useWalletAddress(address)}
      />
    </>
  );
}

function PaymentDetail({
  label,
  value,
  emphasized = false,
  copied,
  onCopy,
}: {
  label: string;
  value: string;
  emphasized?: boolean;
  copied: boolean;
  onCopy: () => void;
}) {
  return (
    <div className="detail-item">
      <div className="detail-header">
        <span>{label}</span>
        <button type="button" className="copy-btn" onClick={onCopy}>
          <Copy size={14} /> {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <code className={emphasized ? "memo-code" : undefined}>{value}</code>
    </div>
  );
}

function formatAddress(address: string): string {
  return address.length > 18 ? `${address.slice(0, 8)}...${address.slice(-6)}` : address;
}

function formatMoney(amountCents: number, currency: string): string {
  return new Intl.NumberFormat("en", {
    style: "currency",
    currency,
    minimumFractionDigits: amountCents < 100 ? 2 : 0,
    maximumFractionDigits: 4,
  }).format(amountCents / 100);
}

function formatAssetBalance(value: string): string {
  const amount = Number(value);
  return Number.isFinite(amount)
    ? new Intl.NumberFormat("en", { maximumFractionDigits: 7 }).format(amount)
    : value;
}

function formatTimeRemaining(expiresAt: string, now: number): string {
  const milliseconds = new Date(expiresAt).getTime() - now;

  if (!Number.isFinite(milliseconds) || milliseconds <= 0) return "Expired";

  const minutes = Math.max(1, Math.ceil(milliseconds / 60_000));
  return `${minutes} min left`;
}
