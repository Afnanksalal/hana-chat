declare module "@stellar/stellar-sdk/contract" {
  export const Client: {
    from(options: Record<string, unknown>): Promise<Record<string, unknown>>;
  };

  export function basicNodeSigner(
    keypair: { publicKey(): string },
    networkPassphrase: string,
  ): { signTransaction: unknown };
}
