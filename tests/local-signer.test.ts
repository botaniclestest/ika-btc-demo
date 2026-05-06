import { secp256k1 } from "@noble/curves/secp256k1";
import { describe, expect, it } from "vitest";
import { deriveP2wpkhTestnetAddress } from "../src/lib/bitcoin/address";
import { hexToBytes } from "../src/lib/bitcoin/bytes";
import {
  deriveLocalDwalletSigner,
  signBitcoinDigestWithLocalSigner,
} from "../src/lib/local-signer/solanaControlledSigner";

describe("local Solana-controlled signer", () => {
  it("derives a deterministic secp256k1 key and signs a Bitcoin digest", async () => {
    const owner = "1111111111111111111111111111111111111111111";
    const authSignature = new Uint8Array(64).fill(7);
    const signer = await deriveLocalDwalletSigner(owner, authSignature);
    const again = await deriveLocalDwalletSigner(owner, authSignature);
    const address = deriveP2wpkhTestnetAddress(signer.secp256k1PublicKeyHex);
    const digestHex = "00".repeat(32);
    const signature = signBitcoinDigestWithLocalSigner(signer, digestHex);

    expect(signer.secp256k1PublicKeyHex).toBe(again.secp256k1PublicKeyHex);
    expect(address.address.startsWith("tb1q")).toBe(true);
    expect(signature.compactSignatureHex).toHaveLength(128);
    expect(
      secp256k1.verify(
        hexToBytes(signature.compactSignatureHex),
        hexToBytes(digestHex),
        hexToBytes(signer.secp256k1PublicKeyHex),
        { prehash: false, lowS: true },
      ),
    ).toBe(true);
  });
});

