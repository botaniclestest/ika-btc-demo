import { Buffer } from "buffer";

export function stripHexPrefix(value: string): string {
  return value.startsWith("0x") || value.startsWith("0X") ? value.slice(2) : value;
}

export function hexToBytes(value: string, label = "hex"): Uint8Array {
  const hex = stripHexPrefix(value).trim();

  if (hex.length === 0 || hex.length % 2 !== 0 || !/^[0-9a-fA-F]+$/.test(hex)) {
    throw new Error(`${label} must be an even-length hex string`);
  }

  return Uint8Array.from(Buffer.from(hex, "hex"));
}

export function bytesToHex(value: Uint8Array | Buffer): string {
  return Buffer.from(value).toString("hex");
}

export function reverseTxId(txid: string): Buffer {
  return Buffer.from(hexToBytes(txid, "txid")).reverse();
}

export function assertSats(value: number, label: string): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error(`${label} must be a non-negative safe integer amount of sats`);
  }
}
