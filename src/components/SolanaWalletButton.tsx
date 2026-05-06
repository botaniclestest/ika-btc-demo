"use client";

import { PublicKey, type Connection, type Transaction } from "@solana/web3.js";
import { PlugZap, Unplug } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

type SolanaPublicKeyLike = {
  toBase58(): string;
};

type InjectedSolanaProvider = {
  isPhantom?: boolean;
  isSolflare?: boolean;
  publicKey?: SolanaPublicKeyLike;
  connect(options?: { onlyIfTrusted?: boolean }): Promise<{ publicKey: SolanaPublicKeyLike }>;
  disconnect(): Promise<void>;
  signMessage?(message: Uint8Array, encoding?: "utf8" | "hex"): Promise<{ signature: Uint8Array } | Uint8Array>;
  signTransaction?(transaction: Transaction): Promise<Transaction>;
  signAndSendTransaction?(transaction: Transaction): Promise<{ signature: string } | string>;
  on?(event: "connect" | "disconnect" | "accountChanged", handler: (...args: unknown[]) => void): void;
  off?(event: "connect" | "disconnect" | "accountChanged", handler: (...args: unknown[]) => void): void;
};

declare global {
  interface Window {
    solana?: InjectedSolanaProvider;
    solflare?: InjectedSolanaProvider;
  }
}

export type InjectedSolanaWalletState = {
  address: string | null;
  providerName: string;
  connected: boolean;
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  signMessage(message: Uint8Array): Promise<Uint8Array>;
  sendTransaction(transaction: Transaction, connection: Connection): Promise<{ signature: string; slot: number }>;
};

function detectProvider(): { provider?: InjectedSolanaProvider; providerName: string } {
  if (typeof window === "undefined") {
    return { providerName: "Browser" };
  }

  if (window.solana?.isPhantom) {
    return { provider: window.solana, providerName: "Phantom" };
  }

  if (window.solflare?.isSolflare) {
    return { provider: window.solflare, providerName: "Solflare" };
  }

  if (window.solana) {
    return { provider: window.solana, providerName: "Injected" };
  }

  return { providerName: "No wallet" };
}

export function useInjectedSolanaWallet(): InjectedSolanaWalletState {
  const [address, setAddress] = useState<string | null>(null);
  const [providerName, setProviderName] = useState("Browser");

  const refresh = useCallback(() => {
    const detected = detectProvider();
    setProviderName(detected.providerName);
    setAddress(detected.provider?.publicKey?.toBase58() ?? null);
  }, []);

  useEffect(() => {
    refresh();
    const { provider } = detectProvider();

    if (!provider?.on) {
      return;
    }

    const handleConnect = () => refresh();
    const handleDisconnect = () => setAddress(null);
    const handleAccountChanged = () => refresh();

    provider.on("connect", handleConnect);
    provider.on("disconnect", handleDisconnect);
    provider.on("accountChanged", handleAccountChanged);

    return () => {
      provider.off?.("connect", handleConnect);
      provider.off?.("disconnect", handleDisconnect);
      provider.off?.("accountChanged", handleAccountChanged);
    };
  }, [refresh]);

  async function connect() {
    const { provider, providerName: detectedProviderName } = detectProvider();
    setProviderName(detectedProviderName);

    if (!provider) {
      throw new Error("Install or unlock Phantom/Solflare in this browser");
    }

    const response = await provider.connect();
    setAddress(response.publicKey.toBase58());
  }

  async function disconnect() {
    const { provider } = detectProvider();
    await provider?.disconnect();
    setAddress(null);
  }

  async function signMessage(message: Uint8Array): Promise<Uint8Array> {
    const { provider } = detectProvider();

    if (!provider?.signMessage) {
      throw new Error("Connected Solana wallet does not expose signMessage");
    }

    const result = await provider.signMessage(message);
    return result instanceof Uint8Array ? result : result.signature;
  }

  async function sendTransaction(
    transaction: Transaction,
    connection: Connection,
  ): Promise<{ signature: string; slot: number }> {
    const { provider } = detectProvider();

    if (!provider?.publicKey) {
      throw new Error("Connect a Solana wallet before sending a transaction");
    }

    const latestBlockhash = await connection.getLatestBlockhash("confirmed");
    transaction.feePayer = new PublicKey(provider.publicKey.toBase58());
    transaction.recentBlockhash = latestBlockhash.blockhash;

    let signature: string;

    if (provider.signAndSendTransaction) {
      const result = await provider.signAndSendTransaction(transaction);
      signature = typeof result === "string" ? result : result.signature;
    } else if (provider.signTransaction) {
      const signed = await provider.signTransaction(transaction);
      signature = await connection.sendRawTransaction(signed.serialize(), {
        skipPreflight: false,
      });
    } else {
      throw new Error("Connected Solana wallet cannot send transactions");
    }

    const confirmation = await connection.confirmTransaction(
      {
        signature,
        blockhash: latestBlockhash.blockhash,
        lastValidBlockHeight: latestBlockhash.lastValidBlockHeight,
      },
      "confirmed",
    );

    if (confirmation.value.err) {
      throw new Error(`Solana transaction failed: ${JSON.stringify(confirmation.value.err)}`);
    }

    return { signature, slot: confirmation.context.slot };
  }

  return {
    address,
    providerName,
    connected: Boolean(address),
    connect,
    disconnect,
    signMessage,
    sendTransaction,
  };
}

export function SolanaWalletButton({ wallet }: { wallet: InjectedSolanaWalletState }) {
  async function handleConnectClick() {
    try {
      await wallet.connect();
    } catch (error) {
      window.alert(error instanceof Error ? error.message : String(error));
    }
  }

  async function handleDisconnectClick() {
    try {
      await wallet.disconnect();
    } catch (error) {
      window.alert(error instanceof Error ? error.message : String(error));
    }
  }

  if (wallet.connected) {
    return (
      <button className="wallet-button connected" type="button" onClick={handleDisconnectClick}>
        <Unplug size={18} />
        {wallet.address?.slice(0, 4)}...{wallet.address?.slice(-4)}
      </button>
    );
  }

  return (
    <button className="wallet-button" type="button" onClick={handleConnectClick}>
      <PlugZap size={18} />
      {wallet.providerName === "No wallet" ? "No Wallet" : `Connect ${wallet.providerName}`}
    </button>
  );
}
