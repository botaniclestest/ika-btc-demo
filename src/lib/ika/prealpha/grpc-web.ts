import { GrpcWebFetchTransport } from "@protobuf-ts/grpcweb-transport";
import { bytesToHex, hexToBytes } from "@/lib/bitcoin/bytes";
import { DWalletServiceClient } from "./generated/grpc-web/ika_dwallet.client";
import { defineBcsTypes } from "./bcs-types";

const {
  SignedRequestData,
  TransactionResponseData,
  UserSignature,
  VersionedDWalletDataAttestation,
  VersionedPresignDataAttestation,
} = defineBcsTypes();

export const IKA_CURVE_SECP256K1 = 0;
export const IKA_SIGNATURE_ALGORITHM_ECDSA_SECP256K1 = 0;
export const IKA_SIGNATURE_SCHEME_ECDSA_DOUBLE_SHA256 = 2;

export type RequestDataSigner = (signedRequestData: Uint8Array) => Promise<Uint8Array>;

export type NetworkSignedAttestationBytes = {
  attestationData: Uint8Array;
  networkSignature: Uint8Array;
  networkPubkey: Uint8Array;
  epoch: bigint;
};

export type IkaDkgResult = {
  sessionIdentifier: Uint8Array;
  publicKey: Uint8Array;
  attestation: NetworkSignedAttestationBytes;
};

export type IkaPresignResult = {
  presignSessionIdentifier: Uint8Array;
  attestation: NetworkSignedAttestationBytes;
};

export type IkaSignResult = {
  signature: Uint8Array;
};

export type SerializableIkaDwallet = {
  sessionIdentifierHex: string;
  publicKeyHex: string;
  attestationDataHex: string;
  networkSignatureHex: string;
  networkPubkeyHex: string;
  epoch: string;
};

type SignedRequest = ReturnType<typeof SignedRequestData.serialize>;

function randomBytes(length: number): Uint8Array {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return bytes;
}

function zeroBytes(length: number): Uint8Array {
  return new Uint8Array(length);
}

function toAttestationBytes(attestation: {
  attestation_data: number[] | Uint8Array;
  network_signature: number[] | Uint8Array;
  network_pubkey: number[] | Uint8Array;
  epoch: bigint | string | number;
}): NetworkSignedAttestationBytes {
  return {
    attestationData: new Uint8Array(attestation.attestation_data),
    networkSignature: new Uint8Array(attestation.network_signature),
    networkPubkey: new Uint8Array(attestation.network_pubkey),
    epoch: BigInt(attestation.epoch),
  };
}

function serializeAttestation(attestation: NetworkSignedAttestationBytes) {
  return {
    attestation_data: Array.from(attestation.attestationData),
    network_signature: Array.from(attestation.networkSignature),
    network_pubkey: Array.from(attestation.networkPubkey),
    epoch: attestation.epoch,
  };
}

function serializeDwallet(dwallet: IkaDkgResult): SerializableIkaDwallet {
  return {
    sessionIdentifierHex: bytesToHex(dwallet.sessionIdentifier),
    publicKeyHex: bytesToHex(dwallet.publicKey),
    attestationDataHex: bytesToHex(dwallet.attestation.attestationData),
    networkSignatureHex: bytesToHex(dwallet.attestation.networkSignature),
    networkPubkeyHex: bytesToHex(dwallet.attestation.networkPubkey),
    epoch: dwallet.attestation.epoch.toString(),
  };
}

export function deserializeDwallet(dwallet: SerializableIkaDwallet): IkaDkgResult {
  return {
    sessionIdentifier: hexToBytes(dwallet.sessionIdentifierHex, "Ika dWallet session identifier"),
    publicKey: hexToBytes(dwallet.publicKeyHex, "Ika dWallet public key"),
    attestation: {
      attestationData: hexToBytes(dwallet.attestationDataHex, "Ika attestation data"),
      networkSignature: hexToBytes(dwallet.networkSignatureHex, "Ika network signature"),
      networkPubkey: hexToBytes(dwallet.networkPubkeyHex, "Ika network public key"),
      epoch: BigInt(dwallet.epoch),
    },
  };
}

export function createIkaWebClient(baseUrl: string) {
  const transport = new GrpcWebFetchTransport({ baseUrl });
  const client = new DWalletServiceClient(transport);

  async function buildUserSignature(
    senderPubkey: Uint8Array,
    signedRequestData: Uint8Array,
    signRequestData?: RequestDataSigner,
  ): Promise<Uint8Array> {
    const signature = signRequestData
      ? await signRequestData(signedRequestData)
      : zeroBytes(64);

    return UserSignature.serialize({
      Ed25519: {
        signature: Array.from(signature),
        public_key: Array.from(senderPubkey),
      },
    }).toBytes();
  }

  async function submit(
    senderPubkey: Uint8Array,
    signedRequest: SignedRequest,
    signRequestData?: RequestDataSigner,
  ): Promise<Uint8Array> {
    const signedRequestData = signedRequest.toBytes();
    const userSignature = await buildUserSignature(senderPubkey, signedRequestData, signRequestData);
    const { response } = await client.submitTransaction({
      userSignature,
      signedRequestData,
    });

    return response.responseData;
  }

  async function requestSecp256k1Dkg(
    senderPubkey: Uint8Array,
    signRequestData?: RequestDataSigner,
  ): Promise<IkaDkgResult> {
    const sessionPreimage = randomBytes(32);
    const request = SignedRequestData.serialize({
      session_identifier_preimage: Array.from(sessionPreimage),
      epoch: 1n,
      chain_id: { Solana: true },
      intended_chain_sender: Array.from(senderPubkey),
      request: {
        DKG: {
          dwallet_network_encryption_public_key: Array.from(zeroBytes(32)),
          curve: { Secp256k1: true },
          centralized_public_key_share_and_proof: Array.from(zeroBytes(32)),
          user_secret_key_share: {
            Encrypted: {
              encrypted_centralized_secret_share_and_proof: Array.from(zeroBytes(32)),
              encryption_key: Array.from(zeroBytes(32)),
              signer_public_key: Array.from(senderPubkey),
            },
          },
          user_public_output: Array.from(zeroBytes(32)),
          sign_during_dkg_request: null,
        },
      },
    });

    const responseBytes = await submit(senderPubkey, request, signRequestData);
    const response = TransactionResponseData.parse(new Uint8Array(responseBytes));

    if (response.Error) {
      throw new Error(`Ika DKG failed: ${response.Error.message}`);
    }

    if (!response.Attestation) {
      throw new Error(`Ika DKG returned an unexpected response: ${JSON.stringify(response)}`);
    }

    const attestation = toAttestationBytes(response.Attestation);
    const payload = VersionedDWalletDataAttestation.parse(attestation.attestationData);

    if (!payload.V1) {
      throw new Error(`Ika DKG returned an unexpected attestation payload`);
    }

    return {
      sessionIdentifier: new Uint8Array(payload.V1.session_identifier),
      publicKey: new Uint8Array(payload.V1.public_key),
      attestation,
    };
  }

  async function requestSecp256k1Presign(
    senderPubkey: Uint8Array,
    sessionIdentifier: Uint8Array,
    signRequestData?: RequestDataSigner,
  ): Promise<IkaPresignResult> {
    const request = SignedRequestData.serialize({
      session_identifier_preimage: Array.from(sessionIdentifier),
      epoch: 1n,
      chain_id: { Solana: true },
      intended_chain_sender: Array.from(senderPubkey),
      request: {
        Presign: {
          dwallet_network_encryption_public_key: Array.from(zeroBytes(32)),
          curve: { Secp256k1: true },
          signature_algorithm: { ECDSASecp256k1: true },
        },
      },
    });

    const responseBytes = await submit(senderPubkey, request, signRequestData);
    const response = TransactionResponseData.parse(new Uint8Array(responseBytes));

    if (response.Error) {
      throw new Error(`Ika presign failed: ${response.Error.message}`);
    }

    if (!response.Attestation) {
      throw new Error(`Ika presign returned an unexpected response: ${JSON.stringify(response)}`);
    }

    const attestation = toAttestationBytes(response.Attestation);
    const payload = VersionedPresignDataAttestation.parse(attestation.attestationData);

    if (!payload.V1) {
      throw new Error(`Ika presign returned an unexpected attestation payload`);
    }

    return {
      presignSessionIdentifier: new Uint8Array(payload.V1.presign_session_identifier),
      attestation,
    };
  }

  async function requestSecp256k1Sign(
    senderPubkey: Uint8Array,
    dwallet: IkaDkgResult,
    message: Uint8Array,
    presignSessionIdentifier: Uint8Array,
    approvalTransactionSignature: Uint8Array,
    approvalSlot: bigint,
    signRequestData?: RequestDataSigner,
  ): Promise<IkaSignResult> {
    const request = SignedRequestData.serialize({
      session_identifier_preimage: Array.from(dwallet.sessionIdentifier),
      epoch: 1n,
      chain_id: { Solana: true },
      intended_chain_sender: Array.from(senderPubkey),
      request: {
        Sign: {
          message: Array.from(message),
          message_metadata: [],
          presign_session_identifier: Array.from(presignSessionIdentifier),
          message_centralized_signature: Array.from(zeroBytes(64)),
          dwallet_attestation: serializeAttestation(dwallet.attestation),
          approval_proof: {
            Solana: {
              transaction_signature: Array.from(approvalTransactionSignature),
              slot: approvalSlot,
            },
          },
        },
      },
    });

    const responseBytes = await submit(senderPubkey, request, signRequestData);
    const response = TransactionResponseData.parse(new Uint8Array(responseBytes));

    if (response.Signature) {
      return { signature: new Uint8Array(response.Signature.signature) };
    }

    if (response.Error) {
      throw new Error(`Ika sign failed: ${response.Error.message}`);
    }

    throw new Error(`Ika sign returned an unexpected response: ${JSON.stringify(response)}`);
  }

  return {
    requestSecp256k1Dkg,
    requestSecp256k1Presign,
    requestSecp256k1Sign,
    serializeDwallet,
  };
}
