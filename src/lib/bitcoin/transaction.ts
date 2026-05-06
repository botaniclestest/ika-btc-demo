import * as bitcoin from "bitcoinjs-lib";
import { Buffer } from "buffer";
import { BITCOIN_TESTNET, getP2wpkhScriptCode, normalizeSecp256k1PublicKeyHex } from "./address";
import { assertSats, bytesToHex, hexToBytes, reverseTxId } from "./bytes";
import type { ExplorerUtxo } from "./explorer";

export const DEFAULT_SIGHASH_TYPE = bitcoin.Transaction.SIGHASH_ALL;
export const P2WPKH_DUST_SATS = 294;

export type SpendBuildInput = {
  fromPublicKeyHex: string;
  utxos: ExplorerUtxo[];
  toAddress: string;
  amountSats: number;
  changeAddress: string;
  feeRateSatVb?: number;
};

export type SpendInputDigest = {
  inputIndex: number;
  txid: string;
  vout: number;
  valueSats: number;
  sighashType: number;
  bip143PreimageHex: string;
  sighashHex: string;
};

export type BuiltP2wpkhSpend = {
  unsignedTransactionHex: string;
  selectedUtxos: ExplorerUtxo[];
  inputDigests: SpendInputDigest[];
  totalInputSats: number;
  amountSats: number;
  feeSats: number;
  changeSats: number;
  virtualBytes: number;
};

export type FinalizeSignatureInput = {
  derSignatureHex?: string;
  compactSignatureHex?: string;
  sighashType?: number;
};

export function estimateP2wpkhVirtualBytes(inputCount: number, outputCount: number): number {
  return 10 + inputCount * 68 + outputCount * 31;
}

function uint32LE(value: number): Buffer {
  const buffer = Buffer.alloc(4);
  buffer.writeUInt32LE(value >>> 0);
  return buffer;
}

function uint64LE(value: number): Buffer {
  assertSats(value, "uint64");
  const buffer = Buffer.alloc(8);
  buffer.writeBigUInt64LE(BigInt(value));
  return buffer;
}

function encodeVarInt(value: number): Buffer {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error("varint value must be a non-negative safe integer");
  }

  if (value < 0xfd) {
    return Buffer.from([value]);
  }

  if (value <= 0xffff) {
    const buffer = Buffer.alloc(3);
    buffer[0] = 0xfd;
    buffer.writeUInt16LE(value, 1);
    return buffer;
  }

  if (value <= 0xffffffff) {
    const buffer = Buffer.alloc(5);
    buffer[0] = 0xfe;
    buffer.writeUInt32LE(value, 1);
    return buffer;
  }

  const buffer = Buffer.alloc(9);
  buffer[0] = 0xff;
  buffer.writeBigUInt64LE(BigInt(value), 1);
  return buffer;
}

function hash256(chunks: Buffer[]): Buffer {
  return bitcoin.crypto.hash256(Buffer.concat(chunks));
}

function serializeOutput(output: { value: number | bigint; script: Buffer }): Buffer {
  const value = typeof output.value === "bigint" ? Number(output.value) : output.value;
  return Buffer.concat([uint64LE(value), encodeVarInt(output.script.length), output.script]);
}

export function buildP2wpkhBip143Preimage(
  tx: bitcoin.Transaction,
  inputIndex: number,
  scriptCode: Buffer,
  valueSats: number,
  sighashType = DEFAULT_SIGHASH_TYPE,
): Buffer {
  const input = tx.ins[inputIndex];

  if (!input) {
    throw new Error(`Input ${inputIndex} does not exist`);
  }

  const hashPrevouts = hash256(
    tx.ins.flatMap((txInput) => [Buffer.from(txInput.hash), uint32LE(txInput.index)]),
  );
  const hashSequence = hash256(tx.ins.map((txInput) => uint32LE(txInput.sequence)));
  const hashOutputs = hash256(tx.outs.map((output) => serializeOutput(output)));

  return Buffer.concat([
    uint32LE(tx.version),
    hashPrevouts,
    hashSequence,
    Buffer.from(input.hash),
    uint32LE(input.index),
    encodeVarInt(scriptCode.length),
    scriptCode,
    uint64LE(valueSats),
    uint32LE(input.sequence),
    hashOutputs,
    uint32LE(tx.locktime),
    uint32LE(sighashType),
  ]);
}

export function selectUtxosForSpend(
  utxos: ExplorerUtxo[],
  amountSats: number,
  feeRateSatVb = 2,
): { selectedUtxos: ExplorerUtxo[]; feeSats: number; changeSats: number; virtualBytes: number } {
  assertSats(amountSats, "amountSats");

  const sorted = [...utxos].sort((a, b) => {
    if (a.status.confirmed !== b.status.confirmed) {
      return a.status.confirmed ? -1 : 1;
    }

    return b.value - a.value;
  });

  const selectedUtxos: ExplorerUtxo[] = [];
  let totalInputSats = 0;

  for (const utxo of sorted) {
    selectedUtxos.push(utxo);
    totalInputSats += utxo.value;

    const withChangeVbytes = estimateP2wpkhVirtualBytes(selectedUtxos.length, 2);
    const withChangeFee = Math.ceil(withChangeVbytes * feeRateSatVb);
    const withChange = totalInputSats - amountSats - withChangeFee;

    if (withChange >= P2WPKH_DUST_SATS) {
      return {
        selectedUtxos,
        feeSats: withChangeFee,
        changeSats: withChange,
        virtualBytes: withChangeVbytes,
      };
    }

    const noChangeVbytes = estimateP2wpkhVirtualBytes(selectedUtxos.length, 1);
    const noChangeFee = Math.ceil(noChangeVbytes * feeRateSatVb);

    if (totalInputSats >= amountSats + noChangeFee) {
      return {
        selectedUtxos,
        feeSats: totalInputSats - amountSats,
        changeSats: 0,
        virtualBytes: noChangeVbytes,
      };
    }
  }

  throw new Error("Insufficient testnet BTC for amount plus estimated fee");
}

export function buildP2wpkhSpend(input: SpendBuildInput): BuiltP2wpkhSpend {
  const feeRateSatVb = input.feeRateSatVb ?? 2;
  const { selectedUtxos, feeSats, changeSats, virtualBytes } = selectUtxosForSpend(
    input.utxos,
    input.amountSats,
    feeRateSatVb,
  );
  const publicKeyHex = normalizeSecp256k1PublicKeyHex(input.fromPublicKeyHex);
  const scriptCode = getP2wpkhScriptCode(publicKeyHex);
  const tx = new bitcoin.Transaction();

  tx.version = 2;

  for (const utxo of selectedUtxos) {
    tx.addInput(reverseTxId(utxo.txid), utxo.vout, 0xfffffffd);
  }

  tx.addOutput(bitcoin.address.toOutputScript(input.toAddress, BITCOIN_TESTNET), input.amountSats);

  if (changeSats > 0) {
    tx.addOutput(bitcoin.address.toOutputScript(input.changeAddress, BITCOIN_TESTNET), changeSats);
  }

  const inputDigests = selectedUtxos.map((utxo, inputIndex) => {
    const bip143Preimage = buildP2wpkhBip143Preimage(
      tx,
      inputIndex,
      scriptCode,
      utxo.value,
      DEFAULT_SIGHASH_TYPE,
    );
    const sighashHex = tx
      .hashForWitnessV0(inputIndex, scriptCode, utxo.value, DEFAULT_SIGHASH_TYPE)
      .toString("hex");

    if (bitcoin.crypto.hash256(bip143Preimage).toString("hex") !== sighashHex) {
      throw new Error("Internal BIP143 preimage check failed");
    }

    return {
      inputIndex,
      txid: utxo.txid,
      vout: utxo.vout,
      valueSats: utxo.value,
      sighashType: DEFAULT_SIGHASH_TYPE,
      bip143PreimageHex: bip143Preimage.toString("hex"),
      sighashHex,
    };
  });

  return {
    unsignedTransactionHex: tx.toHex(),
    selectedUtxos,
    inputDigests,
    totalInputSats: selectedUtxos.reduce((sum, utxo) => sum + utxo.value, 0),
    amountSats: input.amountSats,
    feeSats,
    changeSats,
    virtualBytes,
  };
}

export function normalizeBitcoinSignature(input: FinalizeSignatureInput): Buffer {
  const sighashType = input.sighashType ?? DEFAULT_SIGHASH_TYPE;

  if (input.compactSignatureHex) {
    const compact = Buffer.from(hexToBytes(input.compactSignatureHex, "compact ECDSA signature"));

    if (compact.length !== 64) {
      throw new Error("Compact ECDSA signature must be exactly 64 bytes (r || s)");
    }

    return bitcoin.script.signature.encode(compact, sighashType);
  }

  if (input.derSignatureHex) {
    const der = Buffer.from(hexToBytes(input.derSignatureHex, "DER ECDSA signature"));
    return Buffer.concat([der, Buffer.from([sighashType])]);
  }

  throw new Error("Provide either derSignatureHex or compactSignatureHex");
}

export function finalizeP2wpkhSpend(
  unsignedTransactionHex: string,
  publicKeyHex: string,
  signatures: FinalizeSignatureInput[],
): string {
  const tx = bitcoin.Transaction.fromHex(unsignedTransactionHex);
  const pubkey = Buffer.from(normalizeSecp256k1PublicKeyHex(publicKeyHex), "hex");

  if (signatures.length !== tx.ins.length) {
    throw new Error(`Expected ${tx.ins.length} signatures, received ${signatures.length}`);
  }

  signatures.forEach((signature, inputIndex) => {
    tx.setWitness(inputIndex, [normalizeBitcoinSignature(signature), pubkey]);
  });

  return tx.toHex();
}

export function transactionVirtualSize(rawTransactionHex: string): number {
  return bitcoin.Transaction.fromHex(rawTransactionHex).virtualSize();
}

export function summarizeSpend(build: BuiltP2wpkhSpend): string {
  return [
    `inputs=${build.selectedUtxos.length}`,
    `send=${build.amountSats}`,
    `fee=${build.feeSats}`,
    `change=${build.changeSats}`,
    `vbytes=${build.virtualBytes}`,
    `digests=${build.inputDigests.map((digest) => bytesToHex(Buffer.from(digest.sighashHex, "hex"))).join(",")}`,
  ].join(" ");
}
