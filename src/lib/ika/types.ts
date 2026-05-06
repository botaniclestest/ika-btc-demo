export type DwalletRecord = {
  id?: string;
  secp256k1PublicKeyHex: string;
  sessionIdentifierHex?: string;
  dwalletPda?: string;
  dkgAttestationDataHex?: string;
  networkSignatureHex?: string;
  networkPubkeyHex?: string;
  epoch?: string;
  authorityPda?: string;
  ownerSolanaAddress?: string;
};

export type IkaApprovalRequest = {
  dwallet: DwalletRecord;
  ownerSolanaAddress: string;
  bitcoinSigningPreimageHex: string;
  sighashType: number;
  bitcoinSighashHex?: string;
  amountSats?: number;
  destinationAddress?: string;
  unsignedTransactionHex?: string;
};

export type IkaSignatureResult = {
  messageApprovalAccount?: string;
  signatureHex: string;
  signatureEncoding: "der" | "compact-rs";
  transactionSignature?: string;
};
