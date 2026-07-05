"use client";

import { apiJson } from "./api";

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

export interface StellarVerificationResponse {
  ok?: boolean;
  status?: "pending" | "finalized";
  activated?: boolean;
}

export async function completeStellarPayment<TResponse extends StellarVerificationResponse>(input: {
  payment: StellarPaymentIntent;
  verifyPath: string;
  verifyBody: Record<string, unknown>;
  onStatus: (status: string) => void;
}): Promise<TResponse> {
  input.onStatus(
    `Send ${input.payment.amountDisplay} ${input.payment.assetCode} to ${formatStellarAddress(
      input.payment.treasuryAddress,
    )} with memo ${input.payment.memo}.`,
  );

  const txHash = window
    .prompt(
      [
        `Send ${input.payment.amountDisplay} ${input.payment.assetCode}`,
        `To: ${input.payment.treasuryAddress}`,
        `Memo: ${input.payment.memo}`,
        "",
        "Paste the Stellar transaction hash after your wallet submits it.",
      ].join("\n"),
    )
    ?.trim()
    .toLowerCase();

  if (!txHash) {
    throw new Error("Stellar transaction hash is required to verify payment.");
  }

  const result = await apiJson<TResponse>(input.verifyPath, {
    method: "POST",
    body: JSON.stringify({
      ...input.verifyBody,
      txHash,
    }),
  });

  if (result.ok || result.activated || result.status === "finalized") {
    return result;
  }

  throw new Error("Stellar payment was not finalized yet. Try verification again after it lands.");
}

export function readStellarAddressFromUser(): string {
  const address = window.prompt("Paste your Stellar public address (starts with G).")?.trim();

  if (!address) {
    throw new Error("Stellar address is required.");
  }

  if (!/^G[A-Z2-7]{55}$/.test(address)) {
    throw new Error("Enter a valid Stellar public address.");
  }

  return address;
}

export function formatStellarAddress(address: string): string {
  if (address.length <= 12) {
    return address;
  }

  return `${address.slice(0, 6)}...${address.slice(-6)}`;
}
