import { keccak_256 } from "@noble/hashes/sha3.js";
import { PublicKey, SystemProgram, TransactionInstruction } from "@solana/web3.js";
import {
  IKA_CURVE_SECP256K1,
  IKA_SIGNATURE_SCHEME_ECDSA_DOUBLE_SHA256,
} from "./prealpha/grpc-web";
import { findDwalletCoordinatorPda, findDwalletPda, findMessageApprovalPda } from "./pda";

export const IKA_APPROVE_MESSAGE_DISCRIMINATOR = 8;

export type IkaApproveMessageDraft = {
  instruction: TransactionInstruction;
  messageApprovalPda: PublicKey;
  messageApprovalBump: number;
  messageDigest: Uint8Array;
  messageMetadataDigest: Uint8Array;
  dwalletPda: PublicKey;
  coordinatorPda: PublicKey;
};

export function keccak256(data: Uint8Array): Uint8Array {
  return keccak_256(data);
}

export function buildDirectSecp256k1BitcoinApprovalIx(input: {
  programId: PublicKey;
  payer: PublicKey;
  authority: PublicKey;
  dwalletPublicKey: Uint8Array;
  message: Uint8Array;
}): IkaApproveMessageDraft {
  const messageDigest = keccak256(input.message);
  const messageMetadataDigest = new Uint8Array(32);
  const [dwalletPda] = findDwalletPda(
    input.programId,
    IKA_CURVE_SECP256K1,
    input.dwalletPublicKey,
  );
  const [coordinatorPda] = findDwalletCoordinatorPda(input.programId);
  const [messageApprovalPda, messageApprovalBump] = findMessageApprovalPda(
    input.programId,
    IKA_CURVE_SECP256K1,
    input.dwalletPublicKey,
    IKA_SIGNATURE_SCHEME_ECDSA_DOUBLE_SHA256,
    messageDigest,
    messageMetadataDigest,
  );

  const data = Buffer.alloc(100);
  data[0] = IKA_APPROVE_MESSAGE_DISCRIMINATOR;
  data[1] = messageApprovalBump;
  Buffer.from(messageDigest).copy(data, 2);
  Buffer.from(messageMetadataDigest).copy(data, 34);
  input.authority.toBuffer().copy(data, 66);
  data.writeUInt16LE(IKA_SIGNATURE_SCHEME_ECDSA_DOUBLE_SHA256, 98);

  return {
    instruction: new TransactionInstruction({
      programId: input.programId,
      keys: [
        { pubkey: coordinatorPda, isSigner: false, isWritable: false },
        { pubkey: messageApprovalPda, isSigner: false, isWritable: true },
        { pubkey: dwalletPda, isSigner: false, isWritable: false },
        { pubkey: input.authority, isSigner: true, isWritable: false },
        { pubkey: input.payer, isSigner: true, isWritable: true },
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      ],
      data,
    }),
    messageApprovalPda,
    messageApprovalBump,
    messageDigest,
    messageMetadataDigest,
    dwalletPda,
    coordinatorPda,
  };
}
