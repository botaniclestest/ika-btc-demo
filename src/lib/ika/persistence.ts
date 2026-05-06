import { Connection, PublicKey } from "@solana/web3.js";
import type { CreateDwalletResult } from "./client";
import { IKA_SOLANA_PREALPHA_CONFIG } from "./config";

const STORAGE_KEY = "ika_dwallets_v1";

export type PersistedDwallet = CreateDwalletResult & {
  savedAt: number;
};

export function savedDwallets(): PersistedDwallet[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as PersistedDwallet[]) : [];
  } catch {
    return [];
  }
}

export function saveDwallet(record: CreateDwalletResult) {
  const existing = savedDwallets().filter(
    (d) => d.secp256k1PublicKeyHex !== record.secp256k1PublicKeyHex,
  );
  existing.push({ ...record, savedAt: Date.now() });
  localStorage.setItem(STORAGE_KEY, JSON.stringify(existing));
}

export function removeDwallet(publicKeyHex: string) {
  const filtered = savedDwallets().filter(
    (d) => d.secp256k1PublicKeyHex !== publicKeyHex,
  );
  localStorage.setItem(STORAGE_KEY, JSON.stringify(filtered));
}

export function dwalletsByOwner(ownerAddress: string): PersistedDwallet[] {
  return savedDwallets().filter((d) => d.ownerSolanaAddress === ownerAddress);
}

export function parseSecp256k1Pubkey(accountDataBase64: string): string | null {
  try {
    const buf = Buffer.from(accountDataBase64, "base64");
    // Scan for 33-byte compressed secp256k1 pubkey (02/03 prefix)
    for (let i = 0; i < buf.length - 32; i++) {
      if ((buf[i] === 0x02 || buf[i] === 0x03)) {
        const candidate = buf.subarray(i, i + 33);
        // Verify the next byte is a likely boundary (0x00, length prefix, etc.)
        const next = i + 33 < buf.length ? buf[i + 33] : 0x00;
        if (next <= 0x21 && !(next >= 0x02 && next <= 0x03)) {
          return candidate.toString("hex");
        }
      }
    }
    return null;
  } catch {
    return null;
  }
}

// Legacy alias
export const parseDwalletPdaPubkey = parseSecp256k1Pubkey;

export function parseDwalletOwner(accountDataBase64: string): string | null {
  try {
    const buf = Buffer.from(accountDataBase64, "base64");
    if (buf.length < 34) return null;
    // Owner is at bytes 2-33 (32-byte Solana pubkey, LE)
    const ownerBytes = buf.subarray(2, 34);
    if (ownerBytes.every((b) => b === 0)) return null;
    return new PublicKey(ownerBytes).toBase58();
  } catch {
    return null;
  }
}

export type OnChainDwallet = {
  pda: string;
  pubkeyHex: string;
  owner: string;
  lamports: number;
};

export async function scanChainForDwallets(
  ownerAddress?: string,
): Promise<OnChainDwallet[]> {
  const connection = new Connection(IKA_SOLANA_PREALPHA_CONFIG.solanaRpcUrl);
  const programId = new PublicKey(IKA_SOLANA_PREALPHA_CONFIG.programId);

  const accounts = await connection.getProgramAccounts(programId, {
    filters: [
      // dWallet accounts are 153 bytes
      { dataSize: 153 },
    ],
  });

  const results: OnChainDwallet[] = [];
  for (const { pubkey, account } of accounts) {
    const pubkeyHex = parseSecp256k1Pubkey(
      Buffer.from(account.data).toString("base64"),
    );
    if (!pubkeyHex) continue;
    const owner = parseDwalletOwner(
      Buffer.from(account.data).toString("base64"),
    );
    if (ownerAddress && owner !== ownerAddress) continue;
    results.push({
      pda: pubkey.toBase58(),
      pubkeyHex,
      owner: owner ?? "unknown",
      lamports: account.lamports,
    });
  }

  return results;
}
