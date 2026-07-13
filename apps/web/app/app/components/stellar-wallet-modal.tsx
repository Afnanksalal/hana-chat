"use client";

import { Check, Coins, Loader2, PlugZap, ShieldCheck, Wallet, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  cleanupFreighterConnection,
  connectFreighterWallet,
  isStellarAddress,
  loadStellarWallet,
  type StellarWalletAsset,
  type StellarWalletSnapshot,
} from "../stellar-wallet-client";

interface StellarWalletModalProps {
  isOpen: boolean;
  network?: "mainnet" | "testnet";
  onClose: () => void;
  onAddressResolved: (address: string) => void;
}

export function StellarWalletModal({
  isOpen,
  network,
  onClose,
  onAddressResolved,
}: StellarWalletModalProps) {
  const networkLabel = network === "mainnet" ? "Mainnet" : "Testnet";
  const [address, setAddress] = useState("");
  const [connecting, setConnecting] = useState(false);
  const [loadingAssets, setLoadingAssets] = useState(false);
  const [wallet, setWallet] = useState<StellarWalletSnapshot | null>(null);
  const [selectedAssetKey, setSelectedAssetKey] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!isOpen) {
      // Cancel any pending requests
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
        abortControllerRef.current = null;
      }
      // Cleanup Freighter connection
      cleanupFreighterConnection();
      setAddress("");
      setConnecting(false);
      setLoadingAssets(false);
      setWallet(null);
      setSelectedAssetKey(null);
      setErrorMessage(null);
    } else {
      // Create new abort controller when modal opens
      abortControllerRef.current = new AbortController();
    }

    // Cleanup on unmount
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      cleanupFreighterConnection();
    };
  }, [isOpen]);

  const selectedAsset = useMemo(
    () => wallet?.assets.find((asset) => assetKey(asset) === selectedAssetKey) ?? null,
    [selectedAssetKey, wallet],
  );

  const hasCheckoutAsset = useMemo(
    () => wallet?.assets.some((asset) => asset.checkoutSupported) ?? false,
    [wallet],
  );

  if (!isOpen) return null;

  async function connectFreighter() {
    // Prevent connection if modal is closing
    if (!isOpen || abortControllerRef.current?.signal.aborted) return;

    setConnecting(true);
    setErrorMessage(null);

    try {
      const nextAddress = await connectFreighterWallet(network);

      // Check if modal was closed during connection
      if (abortControllerRef.current?.signal.aborted) return;

      setAddress(nextAddress);
      await inspectWallet(nextAddress);
    } catch (error) {
      if (!abortControllerRef.current?.signal.aborted) {
        setErrorMessage(error instanceof Error ? error.message : "Wallet connection failed.");
      }
    } finally {
      if (!abortControllerRef.current?.signal.aborted) {
        setConnecting(false);
      }
    }
  }

  async function inspectWallet(value = address) {
    const trimmed = value.trim();

    if (!isStellarAddress(trimmed)) {
      setErrorMessage("Enter a valid Stellar public address starting with G.");
      return;
    }

    // Prevent inspection if modal is closing
    if (!isOpen || abortControllerRef.current?.signal.aborted) return;

    setLoadingAssets(true);
    setErrorMessage(null);

    try {
      const snapshot = await loadStellarWallet(trimmed);

      // Check if modal was closed during inspection
      if (abortControllerRef.current?.signal.aborted) return;

      const checkoutAsset = snapshot.assets.find((asset) => asset.checkoutSupported);
      const firstAsset = checkoutAsset ?? snapshot.assets[0] ?? null;

      setWallet(snapshot);
      setSelectedAssetKey(firstAsset ? assetKey(firstAsset) : null);
    } catch (error) {
      if (!abortControllerRef.current?.signal.aborted) {
        setWallet(null);
        setSelectedAssetKey(null);
        setErrorMessage(error instanceof Error ? error.message : "Could not load wallet assets.");
      }
    } finally {
      if (!abortControllerRef.current?.signal.aborted) {
        setLoadingAssets(false);
      }
    }
  }

  function confirmAddress() {
    const trimmed = address.trim();

    if (!isStellarAddress(trimmed)) {
      setErrorMessage("Enter a valid Stellar public address starting with G.");
      return;
    }

    onAddressResolved(trimmed);
    onClose();
  }

  return (
    <div className="modal-overlay" role="dialog" aria-modal="true" aria-labelledby="wallet-title">
      <div className="modal-container wallet-connect-modal">
        <div className="modal-header">
          <div className="header-title">
            <Wallet className="icon-hotpink" size={20} />
            <h2 id="wallet-title">Connect Stellar wallet</h2>
          </div>
          <button className="close-btn" type="button" onClick={onClose} aria-label="Close wallet">
            <X size={20} />
          </button>
        </div>

        <div className="modal-body">
          <p className="modal-description">
            Connect Freighter on {networkLabel} to open your wallet, or use a public address to
            inspect every asset in the account. Hana never asks for your secret key.
          </p>

          <button
            type="button"
            className="wallet-provider-button"
            disabled={connecting || loadingAssets}
            onClick={() => void connectFreighter()}
          >
            {connecting ? <Loader2 className="animate-spin" size={18} /> : <PlugZap size={18} />}
            <span>
              <strong>{connecting ? "Opening Freighter..." : "Connect Freighter"}</strong>
              <small>{networkLabel} browser wallet</small>
            </span>
          </button>

          <div className="or-separator">
            <span>OR USE A PUBLIC ADDRESS</span>
          </div>

          <div className="manual-address-entry">
            <label htmlFor="stellar-address-input">Stellar public address</label>
            <div className="input-with-button">
              <input
                id="stellar-address-input"
                type="text"
                autoComplete="off"
                spellCheck={false}
                placeholder="G..."
                value={address}
                onChange={(event) => {
                  setAddress(event.target.value.toUpperCase());
                  setWallet(null);
                  setSelectedAssetKey(null);
                  setErrorMessage(null);
                }}
                disabled={connecting || loadingAssets}
              />
              <button
                type="button"
                className="secondary-action compact"
                disabled={connecting || loadingAssets || !isStellarAddress(address)}
                onClick={() => void inspectWallet()}
              >
                {loadingAssets ? <Loader2 className="animate-spin" size={16} /> : "View assets"}
              </button>
            </div>
          </div>

          {wallet && !hasCheckoutAsset ? (
            <div className="wallet-trustline-warning" style={{ marginBottom: "15px" }}>
              <p>
                <strong>Trustline required:</strong> This wallet does not have a trustline for the required checkout asset ({wallet.checkoutAsset.assetCode}). You must establish a trustline in your wallet to complete payments or receive payouts.
              </p>
            </div>
          ) : null}

          {wallet ? (
            <section className="wallet-assets-panel" aria-label="Wallet assets">
              <div className="wallet-assets-heading">
                <span>
                  <Coins size={16} /> Assets
                </span>
                <small>{wallet.funded ? `${wallet.assets.length} found` : "Account not funded"}</small>
              </div>
              <div className="wallet-asset-list">
                {wallet.assets.map((asset) => {
                  const selected = assetKey(asset) === selectedAssetKey;

                  return (
                    <button
                      className={selected ? "wallet-asset-row selected" : "wallet-asset-row"}
                      type="button"
                      key={assetKey(asset)}
                      onClick={() => setSelectedAssetKey(assetKey(asset))}
                    >
                      <span className="asset-symbol">{asset.assetCode.slice(0, 4)}</span>
                      <span>
                        <strong>{asset.assetCode}</strong>
                        <small>{asset.assetIssuer ? "Issued asset" : "Native Stellar asset"}</small>
                      </span>
                      <span className="asset-balance">
                        <strong>{formatAssetBalance(asset.availableBalance)}</strong>
                        <small>{asset.checkoutSupported ? "Checkout ready" : "Wallet balance"}</small>
                      </span>
                      {selected ? <Check size={16} /> : null}
                    </button>
                  );
                })}
                {wallet.assets.length === 0 ? (
                  <div className="wallet-assets-empty">
                    <Coins size={18} />
                    <span>This address has no assets on {wallet.network}.</span>
                  </div>
                ) : null}
              </div>

              {selectedAsset ? (
                <div className="wallet-rate-card" aria-live="polite">
                  <span>Selected asset</span>
                  <strong>{selectedAsset.assetCode}</strong>
                  <p>
                    {selectedAsset.checkoutSupported
                      ? `1 ${selectedAsset.assetCode} = ${formatRate(
                          wallet.checkoutAsset.unitPriceCents,
                          wallet.checkoutAsset.quoteCurrency,
                        )} locked checkout rate`
                      : `Hana checkout currently accepts ${wallet.checkoutAsset.assetCode}; this asset is shown as a wallet balance only.`}
                  </p>
                </div>
              ) : null}
            </section>
          ) : null}

          {errorMessage ? <p className="error-msg">{errorMessage}</p> : null}

          <button
            type="button"
            className="primary-action fill-width"
            disabled={connecting || loadingAssets || !isStellarAddress(address)}
            onClick={confirmAddress}
          >
            <ShieldCheck size={16} />
            Use this public address
          </button>
        </div>
      </div>
    </div>
  );
}

function assetKey(asset: Pick<StellarWalletAsset, "assetCode" | "assetIssuer">): string {
  return `${asset.assetCode}:${asset.assetIssuer ?? "native"}`;
}

function formatAssetBalance(value: string): string {
  const amount = Number(value);

  if (!Number.isFinite(amount)) return value;

  return new Intl.NumberFormat("en", { maximumFractionDigits: 7 }).format(amount);
}

function formatRate(unitPriceCents: number, currency: string): string {
  return new Intl.NumberFormat("en", {
    style: "currency",
    currency,
    minimumFractionDigits: unitPriceCents < 100 ? 2 : 0,
    maximumFractionDigits: 4,
  }).format(unitPriceCents / 100);
}
