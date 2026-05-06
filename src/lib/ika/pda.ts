import { PublicKey } from "@solana/web3.js";

export const IKA_SEED_DWALLET = "dwallet";
export const IKA_SEED_DWALLET_COORDINATOR = "dwallet_coordinator";
export const IKA_SEED_MESSAGE_APPROVAL = "message_approval";
export const IKA_SEED_CPI_AUTHORITY = "__ika_cpi_authority";

export function dwalletPdaSeeds(curve: number, publicKey: Uint8Array): Buffer[] {
  const payload = Buffer.alloc(2 + publicKey.length);
  payload.writeUInt16LE(curve, 0);
  Buffer.from(publicKey).copy(payload, 2);

  const seeds = [Buffer.from(IKA_SEED_DWALLET)];

  for (let index = 0; index < payload.length; index += 32) {
    seeds.push(payload.subarray(index, Math.min(index + 32, payload.length)));
  }

  return seeds;
}

export function findDwalletPda(
  programId: PublicKey,
  curve: number,
  publicKey: Uint8Array,
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(dwalletPdaSeeds(curve, publicKey), programId);
}

export function findDwalletCoordinatorPda(programId: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync([Buffer.from(IKA_SEED_DWALLET_COORDINATOR)], programId);
}

export function findMessageApprovalPda(
  programId: PublicKey,
  curve: number,
  publicKey: Uint8Array,
  signatureScheme: number,
  messageDigest: Uint8Array,
  messageMetadataDigest?: Uint8Array,
): [PublicKey, number] {
  if (messageDigest.length !== 32) {
    throw new Error("MessageApproval message digest must be 32 bytes");
  }

  const signatureSchemeSeed = Buffer.alloc(2);
  signatureSchemeSeed.writeUInt16LE(signatureScheme, 0);

  const seeds = [
    ...dwalletPdaSeeds(curve, publicKey),
    Buffer.from(IKA_SEED_MESSAGE_APPROVAL),
    signatureSchemeSeed,
    Buffer.from(messageDigest),
  ];

  if (messageMetadataDigest && messageMetadataDigest.some((byte) => byte !== 0)) {
    if (messageMetadataDigest.length !== 32) {
      throw new Error("MessageApproval metadata digest must be 32 bytes");
    }

    seeds.push(Buffer.from(messageMetadataDigest));
  }

  return PublicKey.findProgramAddressSync(seeds, programId);
}

export function findCpiAuthority(programId: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync([Buffer.from(IKA_SEED_CPI_AUTHORITY)], programId);
}

