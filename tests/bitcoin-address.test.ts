import { describe, expect, it } from "vitest";
import * as bitcoin from "bitcoinjs-lib";
import { classifyBitcoinTestnetAddress, deriveP2wpkhTestnetAddress } from "../src/lib/bitcoin/address";
import { buildP2wpkhSpend } from "../src/lib/bitcoin/transaction";

const GENERATOR_COMPRESSED_PUBLIC_KEY =
  "0279be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798";

describe("Bitcoin testnet address helpers", () => {
  it("derives native SegWit testnet addresses from compressed secp256k1 keys", () => {
    const derived = deriveP2wpkhTestnetAddress(GENERATOR_COMPRESSED_PUBLIC_KEY);

    expect(derived.address.startsWith("tb1q")).toBe(true);
    expect(derived.outputScriptHex).toHaveLength(44);
    expect(derived.publicKeyHex).toBe(GENERATOR_COMPRESSED_PUBLIC_KEY);
  });

  it("classifies a generated testnet P2WPKH address correctly", () => {
    const derived = deriveP2wpkhTestnetAddress(GENERATOR_COMPRESSED_PUBLIC_KEY);
    const classification = classifyBitcoinTestnetAddress(derived.address);

    expect(classification.kind).toBe("p2wpkh-testnet");
    expect(classification.witnessProgramBytes).toBe(20);
  });

  it("exposes the BIP143 preimage whose hash is the witness digest", () => {
    const derived = deriveP2wpkhTestnetAddress(GENERATOR_COMPRESSED_PUBLIC_KEY);
    const spend = buildP2wpkhSpend({
      fromPublicKeyHex: GENERATOR_COMPRESSED_PUBLIC_KEY,
      utxos: [
        {
          txid: "11".repeat(32),
          vout: 0,
          value: 20_000,
          status: { confirmed: true },
        },
      ],
      toAddress: derived.address,
      amountSats: 1_000,
      changeAddress: derived.address,
      feeRateSatVb: 2,
    });
    const digest = spend.inputDigests[0];

    expect(bitcoin.crypto.hash256(Buffer.from(digest.bip143PreimageHex, "hex")).toString("hex")).toBe(
      digest.sighashHex,
    );
  });
});
