import { secp256k1 } from "@noble/curves/secp256k1";
import * as bitcoin from "bitcoinjs-lib";
import { Buffer } from "buffer";
import { bytesToHex, hexToBytes } from "./bytes";

export const BITCOIN_TESTNET = bitcoin.networks.testnet;

export type BitcoinAddressKind =
  | "p2pkh-testnet"
  | "p2sh-testnet"
  | "p2wpkh-testnet"
  | "p2wsh-testnet"
  | "p2tr-testnet"
  | "unknown-testnet";

export type DerivedP2wpkhAddress = {
  address: string;
  publicKeyHex: string;
  outputScriptHex: string;
  witnessVersion: 0;
  network: "bitcoin-testnet";
};

export type BitcoinAddressClassification = {
  address: string;
  kind: BitcoinAddressKind;
  outputScriptHex: string;
  witnessProgramBytes?: number;
};

export function normalizeSecp256k1PublicKeyHex(publicKeyHex: string): string {
  const publicKey = hexToBytes(publicKeyHex, "secp256k1 public key");

  if (publicKey.length === 33 && (publicKey[0] === 0x02 || publicKey[0] === 0x03)) {
    return bytesToHex(publicKey);
  }

  if (publicKey.length === 65 && publicKey[0] === 0x04) {
    const compressed = secp256k1.ProjectivePoint.fromHex(publicKey).toRawBytes(true);
    return bytesToHex(compressed);
  }

  throw new Error("Expected a compressed 33-byte or uncompressed 65-byte secp256k1 public key");
}

export function deriveP2wpkhTestnetAddress(publicKeyHex: string): DerivedP2wpkhAddress {
  const normalizedPublicKeyHex = normalizeSecp256k1PublicKeyHex(publicKeyHex);
  const pubkey = Buffer.from(normalizedPublicKeyHex, "hex");
  const payment = bitcoin.payments.p2wpkh({ pubkey, network: BITCOIN_TESTNET });

  if (!payment.address || !payment.output) {
    throw new Error("Failed to derive Bitcoin testnet P2WPKH payment");
  }

  return {
    address: payment.address,
    publicKeyHex: normalizedPublicKeyHex,
    outputScriptHex: payment.output.toString("hex"),
    witnessVersion: 0,
    network: "bitcoin-testnet",
  };
}

export function classifyBitcoinTestnetAddress(address: string): BitcoinAddressClassification {
  const outputScript = bitcoin.address.toOutputScript(address, BITCOIN_TESTNET);
  const outputScriptHex = outputScript.toString("hex");

  if (outputScript.length === 25 && outputScript[0] === 0x76 && outputScript[1] === 0xa9) {
    return { address, kind: "p2pkh-testnet", outputScriptHex };
  }

  if (outputScript.length === 23 && outputScript[0] === 0xa9 && outputScript[1] === 0x14) {
    return { address, kind: "p2sh-testnet", outputScriptHex };
  }

  if (outputScript.length === 22 && outputScript[0] === 0x00 && outputScript[1] === 0x14) {
    return { address, kind: "p2wpkh-testnet", outputScriptHex, witnessProgramBytes: 20 };
  }

  if (outputScript.length === 34 && outputScript[0] === 0x00 && outputScript[1] === 0x20) {
    return { address, kind: "p2wsh-testnet", outputScriptHex, witnessProgramBytes: 32 };
  }

  if (outputScript.length === 34 && outputScript[0] === 0x51 && outputScript[1] === 0x20) {
    return { address, kind: "p2tr-testnet", outputScriptHex, witnessProgramBytes: 32 };
  }

  return { address, kind: "unknown-testnet", outputScriptHex };
}

export function getP2wpkhScriptCode(publicKeyHex: string): Buffer {
  const pubkey = Buffer.from(normalizeSecp256k1PublicKeyHex(publicKeyHex), "hex");
  const p2wpkh = bitcoin.payments.p2wpkh({ pubkey, network: BITCOIN_TESTNET });
  const keyHash = p2wpkh.hash;

  if (!keyHash) {
    throw new Error("Failed to compute HASH160(public key)");
  }

  const p2pkh = bitcoin.payments.p2pkh({ hash: keyHash, network: BITCOIN_TESTNET });

  if (!p2pkh.output) {
    throw new Error("Failed to compute P2WPKH scriptCode");
  }

  return p2pkh.output;
}
