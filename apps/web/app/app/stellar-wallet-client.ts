"use client";

import { getNetwork, isConnected, requestAccess, signTransaction } from "@stellar/freighter-api";
import { Asset, Horizon, Memo, Networks, Operation, TransactionBuilder } from "@stellar/stellar-sdk";
import { apiJson } from "./api";
import type { StellarPaymentIntent } from "./stellar-payments";

export interface StellarWalletAsset {
  assetCode: string;
  assetIssuer: string | null;
  assetType: string;
  balance: string;
  availableBalance: string;
  checkoutSupported: boolean;
}

export interface StellarWalletSnapshot {
  address: string;
  network: "mainnet" | "testnet";
  funded: boolean;
  checkoutAsset: {
    assetCode: string;
    assetIssuer: string | null;
    unitPriceCents: number;
    quoteCurrency: "USD";
  };
  assets: StellarWalletAsset[];
}

export interface SubmittedStellarPayment {
  txHash: string;
  walletAddress: string;
}

let freighterConnectionCount = 0;

export async function connectFreighterWallet(
  expectedNetwork?: "mainnet" | "testnet",
): Promise<string> {
  freighterConnectionCount++;
  const connection = await isConnected();

  if (connection.error) {
    throw new Error(freighterErrorMessage(connection.error));
  }

  if (!connection.isConnected) {
    throw new Error("Freighter is not installed or is not available in this browser.");
  }

  const access = await requestAccess();

  if (access.error) {
    throw new Error(freighterErrorMessage(access.error));
  }

  if (!isStellarAddress(access.address)) {
    throw new Error("Freighter did not return a valid Stellar public address.");
  }

  if (expectedNetwork) {
    const walletNetwork = await getNetwork();

    if (walletNetwork.error) {
      throw new Error(freighterErrorMessage(walletNetwork.error));
    }

    const requiredNetwork = expectedNetwork === "mainnet" ? "PUBLIC" : "TESTNET";

    if (walletNetwork.network !== requiredNetwork) {
      throw new Error(
        `Switch Freighter to ${expectedNetwork === "mainnet" ? "Mainnet" : "Testnet"} and try again.`,
      );
    }
  }

  return access.address;
}

export function cleanupFreighterConnection(): void {
  freighterConnectionCount = Math.max(0, freighterConnectionCount - 1);
}

export async function loadStellarWallet(address: string): Promise<StellarWalletSnapshot> {
  if (!isStellarAddress(address)) {
    throw new Error("Enter a valid Stellar public address.");
  }

  return apiJson<StellarWalletSnapshot>(
    `/api/v1/billing/stellar/wallet/${encodeURIComponent(address)}`,
  );
}

export async function submitStellarPaymentWithFreighter(input: {
  payment: StellarPaymentIntent;
  walletAddress?: string;
}): Promise<SubmittedStellarPayment> {
  const signerAddress = await connectFreighterWallet(input.payment.network);
  const expectedAddress = input.walletAddress?.trim();

  if (expectedAddress && signerAddress !== expectedAddress) {
    throw new Error("Freighter is connected to a different wallet than the checkout address.");
  }

  const networkPassphrase = stellarNetworkPassphrase(input.payment.network);
  const server = new Horizon.Server(input.payment.horizonUrl, {
    allowHttp: input.payment.horizonUrl.startsWith("http://"),
  });
  const sourceAccount = await server.loadAccount(signerAddress);
  const fee = await server.fetchBaseFee();
  const expiresInSeconds = Math.floor(
    (new Date(input.payment.expiresAt).getTime() - Date.now()) / 1_000,
  );

  if (!Number.isFinite(expiresInSeconds) || expiresInSeconds <= 0) {
    throw new Error("This checkout has expired. Start checkout again to get a fresh memo.");
  }

  const transaction = new TransactionBuilder(sourceAccount, {
    fee: String(fee),
    networkPassphrase,
  })
    .addOperation(
      Operation.payment({
        destination: input.payment.treasuryAddress,
        asset: stellarAsset(input.payment),
        amount: input.payment.amountDisplay,
      }),
    )
    .addMemo(Memo.text(input.payment.memo))
    .setTimeout(Math.max(60, Math.min(expiresInSeconds, 900)))
    .build();

  const signed = await signTransaction(transaction.toXDR(), {
    networkPassphrase,
    address: signerAddress,
  });

  if (signed.error) {
    throw new Error(freighterErrorMessage(signed.error));
  }

  if (!signed.signedTxXdr) {
    throw new Error("Freighter did not return a signed transaction.");
  }

  const signedTransaction = TransactionBuilder.fromXDR(signed.signedTxXdr, networkPassphrase);
  const submitted = await server.submitTransaction(signedTransaction);
  const txHash = submitted.hash?.toLowerCase();

  if (!txHash || !/^[a-f0-9]{64}$/.test(txHash)) {
    throw new Error("Stellar accepted the transaction without returning a transaction hash.");
  }

  return { txHash, walletAddress: signerAddress };
}

export function isStellarAddress(value: string): boolean {
  return /^G[A-Z2-7]{55}$/.test(value.trim());
}

function stellarAsset(payment: Pick<StellarPaymentIntent, "assetCode" | "assetIssuer">): Asset {
  if (payment.assetCode.toUpperCase() === "XLM") {
    return Asset.native();
  }

  if (!payment.assetIssuer) {
    throw new Error(`Missing issuer for ${payment.assetCode}.`);
  }

  return new Asset(payment.assetCode, payment.assetIssuer);
}

function stellarNetworkPassphrase(network: "mainnet" | "testnet"): string {
  return network === "mainnet" ? Networks.PUBLIC : Networks.TESTNET;
}

function freighterErrorMessage(error: unknown): string {
  if (typeof error === "string") {
    return error;
  }

  if (error && typeof error === "object" && "message" in error) {
    const message = (error as { message?: unknown }).message;

    if (typeof message === "string") {
      return message;
    }
  }

  return "Freighter could not connect to this app.";
}
