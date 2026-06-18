"use client";

import { apiJson } from "./api";

export interface CryptoPaymentIntent {
  id: string;
  chainId: number;
  chainName: string;
  rpcUrl: string;
  treasuryAddress: string;
  tokenAddress: string | null;
  tokenSymbol: string;
  tokenDecimals: number;
  amountAtomic: string;
  amountHex: string;
  amountDisplay: string;
  amountCents: number;
  currency: string;
  expiresAt: string;
  providerReference: string;
  requiredConfirmations: number;
}

export interface CryptoVerificationResponse {
  ok?: boolean;
  status?: "pending" | "finalized";
  activated?: boolean;
  confirmationCount?: number;
  requiredConfirmations?: number;
}

interface EthereumProvider {
  request: (input: { method: string; params?: unknown[] }) => Promise<unknown>;
}

declare global {
  interface Window {
    ethereum?: EthereumProvider;
  }
}

export async function completeCryptoPayment<TResponse extends CryptoVerificationResponse>(input: {
  payment: CryptoPaymentIntent;
  verifyPath: string;
  verifyBody: Record<string, unknown>;
  onStatus: (status: string) => void;
}): Promise<TResponse> {
  const transfer = await sendCryptoPayment(input.payment);

  for (let attempt = 0; attempt < 24; attempt += 1) {
    const result = await apiJson<TResponse>(input.verifyPath, {
      method: "POST",
      body: JSON.stringify({
        ...input.verifyBody,
        txHash: transfer.txHash,
        walletAddress: transfer.walletAddress,
      }),
    });

    if (result.ok || result.activated || result.status === "finalized") {
      return result;
    }

    const confirmationCount = result.confirmationCount ?? 0;
    const requiredConfirmations =
      result.requiredConfirmations ?? input.payment.requiredConfirmations;
    input.onStatus(
      `Waiting for 0G confirmations ${confirmationCount}/${requiredConfirmations}...`,
    );
    await delay(5_000);
  }

  throw new Error("0G payment is still confirming. Try verification again in a minute.");
}

export async function requestWalletAddress(): Promise<string> {
  const provider = ethereumProvider();
  const accounts = await provider.request({ method: "eth_requestAccounts" });

  if (!Array.isArray(accounts) || typeof accounts[0] !== "string") {
    throw new Error("Wallet did not return an account.");
  }

  return accounts[0];
}

async function sendCryptoPayment(payment: CryptoPaymentIntent): Promise<{
  txHash: string;
  walletAddress: string;
}> {
  const provider = ethereumProvider();
  const walletAddress = await requestWalletAddress();
  const chainIdHex = `0x${payment.chainId.toString(16)}`;

  await ensureChain(provider, payment, chainIdHex);

  const txHash = await provider.request({
    method: "eth_sendTransaction",
    params: [
      {
        from: walletAddress,
        to: payment.treasuryAddress,
        value: payment.amountHex,
        chainId: chainIdHex,
      },
    ],
  });

  if (typeof txHash !== "string") {
    throw new Error("Wallet did not return a transaction hash.");
  }

  return { txHash, walletAddress };
}

async function ensureChain(
  provider: EthereumProvider,
  payment: CryptoPaymentIntent,
  chainIdHex: string,
): Promise<void> {
  try {
    await provider.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: chainIdHex }],
    });
  } catch (error) {
    if (!isWalletChainMissingError(error)) {
      throw error;
    }

    await provider.request({
      method: "wallet_addEthereumChain",
      params: [
        {
          chainId: chainIdHex,
          chainName: payment.chainName,
          nativeCurrency: {
            name: payment.tokenSymbol,
            symbol: payment.tokenSymbol,
            decimals: payment.tokenDecimals,
          },
          rpcUrls: [payment.rpcUrl],
        },
      ],
    });
  }
}

function ethereumProvider(): EthereumProvider {
  if (!window.ethereum) {
    throw new Error("Install or open MetaMask to pay with 0G.");
  }

  return window.ethereum;
}

function isWalletChainMissingError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === 4902
  );
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}
