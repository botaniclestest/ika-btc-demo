import bs58 from "bs58";
import { PublicKey, TransactionInstruction } from "@solana/web3.js";
import { hexToBytes, bytesToHex } from "@/lib/bitcoin/bytes";
import { IKA_SOLANA_PREALPHA_CONFIG } from "./config";
import { buildDirectSecp256k1BitcoinApprovalIx } from "./approval";
import { findDwalletPda } from "./pda";
import type { DwalletRecord, IkaApprovalRequest, IkaSignatureResult } from "./types";
import {
  createIkaWebClient,
  deserializeDwallet,
  IKA_CURVE_SECP256K1,
  type RequestDataSigner,
  type SerializableIkaDwallet,
} from "./prealpha/grpc-web";

export class IkaPrealphaAdapterError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "IkaPrealphaAdapterError";
  }
}

export type CreateDwalletInput = {
  owner: PublicKey;
  signRequestData?: RequestDataSigner;
};

export type CreateDwalletResult = DwalletRecord & {
  dwalletId: string;
  secp256k1PublicKeyHex: string;
};

export type ApprovalTransactionSender = (
  instruction: TransactionInstruction,
) => Promise<{ signature: string; slot: number }>;

export type ApproveBitcoinWithIkaInput = IkaApprovalRequest & {
  sendApprovalTransaction: ApprovalTransactionSender;
  signRequestData?: RequestDataSigner;
};

function getProgramId(): PublicKey {
  return new PublicKey(IKA_SOLANA_PREALPHA_CONFIG.programId);
}

function recordToSerializable(record: DwalletRecord): SerializableIkaDwallet {
  if (
    !record.sessionIdentifierHex ||
    !record.dkgAttestationDataHex ||
    !record.networkSignatureHex ||
    !record.networkPubkeyHex ||
    !record.epoch
  ) {
    throw new IkaPrealphaAdapterError("Create a real Ika dWallet before using Ika signing");
  }

  return {
    sessionIdentifierHex: record.sessionIdentifierHex,
    publicKeyHex: record.secp256k1PublicKeyHex,
    attestationDataHex: record.dkgAttestationDataHex,
    networkSignatureHex: record.networkSignatureHex,
    networkPubkeyHex: record.networkPubkeyHex,
    epoch: record.epoch,
  };
}

export async function createDwalletOnIka(input: CreateDwalletInput): Promise<CreateDwalletResult> {
  const programId = getProgramId();
  const ikaClient = createIkaWebClient(IKA_SOLANA_PREALPHA_CONFIG.grpcEndpoint);
  const dwallet = await ikaClient.requestSecp256k1Dkg(
    input.owner.toBytes(),
    input.signRequestData,
  );
  const [dwalletPda] = findDwalletPda(programId, IKA_CURVE_SECP256K1, dwallet.publicKey);

  return {
    dwalletId: bytesToHex(dwallet.sessionIdentifier),
    sessionIdentifierHex: bytesToHex(dwallet.sessionIdentifier),
    secp256k1PublicKeyHex: bytesToHex(dwallet.publicKey),
    dwalletPda: dwalletPda.toBase58(),
    dkgAttestationDataHex: bytesToHex(dwallet.attestation.attestationData),
    networkSignatureHex: bytesToHex(dwallet.attestation.networkSignature),
    networkPubkeyHex: bytesToHex(dwallet.attestation.networkPubkey),
    epoch: dwallet.attestation.epoch.toString(),
    ownerSolanaAddress: input.owner.toBase58(),
  };
}

export async function approveBitcoinSighashWithIka(
  request: ApproveBitcoinWithIkaInput,
): Promise<IkaSignatureResult> {
  const programId = getProgramId();
  const owner = new PublicKey(request.ownerSolanaAddress);
  const dwallet = deserializeDwallet(recordToSerializable(request.dwallet));
  const message = hexToBytes(request.bitcoinSigningPreimageHex, "Bitcoin BIP143 signing preimage");
  const approvalDraft = buildDirectSecp256k1BitcoinApprovalIx({
    programId,
    payer: owner,
    authority: owner,
    dwalletPublicKey: dwallet.publicKey,
    message,
  });
  const approval = await request.sendApprovalTransaction(approvalDraft.instruction);
  const ikaClient = createIkaWebClient(IKA_SOLANA_PREALPHA_CONFIG.grpcEndpoint);
  const presign = await ikaClient.requestSecp256k1Presign(
    owner.toBytes(),
    dwallet.sessionIdentifier,
    request.signRequestData,
  );
  const signature = await ikaClient.requestSecp256k1Sign(
    owner.toBytes(),
    dwallet,
    message,
    presign.presignSessionIdentifier,
    bs58.decode(approval.signature),
    BigInt(approval.slot),
    request.signRequestData,
  );

  return {
    messageApprovalAccount: approvalDraft.messageApprovalPda.toBase58(),
    signatureHex: bytesToHex(signature.signature),
    signatureEncoding: signature.signature.length === 64 ? "compact-rs" : "der",
    transactionSignature: approval.signature,
  };
}

export function isIkaPrealphaAdapterError(error: unknown): error is IkaPrealphaAdapterError {
  return error instanceof IkaPrealphaAdapterError;
}

