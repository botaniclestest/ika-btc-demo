import { secp256k1 } from "@noble/curves/secp256k1";
import { bytesToHex, hexToBytes } from "../bitcoin/bytes";

const LOCAL_SIGNER_DOMAIN = "SOL_IKA_BTC_TX_LOCAL_SOLANA_CONTROLLED_SIGNER_V1";

export type LocalDwalletSigner = {
  mode: "local-solana-controlled";
  ownerSolanaAddress: string;
  authMessage: string;
  authSignatureHex: string;
  secp256k1PublicKeyHex: string;
  privateKeyHex: string;
};

function concatBytes(parts: Uint8Array[]): Uint8Array {
  const length = parts.reduce((sum, part) => sum + part.length, 0);
  const out = new Uint8Array(length);
  let offset = 0;

  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }

  return out;
}

async function sha256Bytes(bytes: Uint8Array): Promise<Uint8Array> {
  const arrayBuffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(arrayBuffer).set(bytes);
  const digest = await globalThis.crypto.subtle.digest("SHA-256", arrayBuffer);
  return new Uint8Array(digest);
}

export function buildLocalSignerAuthMessage(ownerSolanaAddress: string): string {
  return [
    "SOL_IKA_BTC_TX local signer authorization",
    `Domain: ${LOCAL_SIGNER_DOMAIN}`,
    `Solana owner: ${ownerSolanaAddress}`,
    "Network: bitcoin testnet",
    "Purpose: derive and use a local secp256k1 test signer for this demo only.",
  ].join("\n");
}

async function deriveValidSecp256k1PrivateKey(seedMaterial: Uint8Array): Promise<Uint8Array> {
  let candidate = await sha256Bytes(seedMaterial);
  let nonce = 0;

  while (!secp256k1.utils.isValidPrivateKey(candidate)) {
    candidate = await sha256Bytes(
      concatBytes([candidate, new Uint8Array([nonce & 0xff, (nonce >> 8) & 0xff])]),
    );
    nonce += 1;
  }

  return candidate;
}

export async function deriveLocalDwalletSigner(
  ownerSolanaAddress: string,
  solanaAuthSignature: Uint8Array,
): Promise<LocalDwalletSigner> {
  const authMessage = buildLocalSignerAuthMessage(ownerSolanaAddress);
  const seedMaterial = concatBytes([
    new TextEncoder().encode(LOCAL_SIGNER_DOMAIN),
    new TextEncoder().encode(ownerSolanaAddress),
    new TextEncoder().encode(authMessage),
    solanaAuthSignature,
  ]);
  const privateKey = await deriveValidSecp256k1PrivateKey(seedMaterial);
  const publicKey = secp256k1.getPublicKey(privateKey, true);

  return {
    mode: "local-solana-controlled",
    ownerSolanaAddress,
    authMessage,
    authSignatureHex: bytesToHex(solanaAuthSignature),
    secp256k1PublicKeyHex: bytesToHex(publicKey),
    privateKeyHex: bytesToHex(privateKey),
  };
}

export function signBitcoinDigestWithLocalSigner(
  signer: LocalDwalletSigner,
  bitcoinSighashHex: string,
): { compactSignatureHex: string; derSignatureHex: string } {
  const digest = hexToBytes(bitcoinSighashHex, "bitcoin sighash");

  if (digest.length !== 32) {
    throw new Error("Bitcoin sighash must be exactly 32 bytes");
  }

  const signature = secp256k1.sign(digest, hexToBytes(signer.privateKeyHex, "local signer private key"), {
    lowS: true,
    prehash: false,
  });

  return {
    compactSignatureHex: bytesToHex(signature.toCompactRawBytes()),
    derSignatureHex: bytesToHex(signature.toDERRawBytes()),
  };
}

export function signBitcoinDigestsWithLocalSigner(
  signer: LocalDwalletSigner,
  bitcoinSighashHexes: string[],
): { compactSignatureHex: string; derSignatureHex: string }[] {
  return bitcoinSighashHexes.map((sighashHex) => signBitcoinDigestWithLocalSigner(signer, sighashHex));
}
