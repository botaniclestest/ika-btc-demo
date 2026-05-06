export type IkaSolanaPrealphaConfig = {
  solanaRpcUrl: string;
  grpcEndpoint: string;
  programId: string;
};

export const IKA_SOLANA_PREALPHA_CONFIG: IkaSolanaPrealphaConfig = {
  solanaRpcUrl: process.env.NEXT_PUBLIC_SOLANA_RPC ?? "https://api.devnet.solana.com",
  grpcEndpoint:
    process.env.NEXT_PUBLIC_IKA_SOLANA_GRPC ?? "https://pre-alpha-dev-1.ika.ika-network.net:443",
  programId:
    process.env.NEXT_PUBLIC_IKA_SOLANA_PROGRAM_ID ?? "87W54kGYFQ1rgWqMeu4XTPHWXWmXSQCcjm8vCTfiq1oY",
};

export const DEFAULT_RETURN_TESTNET_ADDRESS =
  process.env.NEXT_PUBLIC_RETURN_TESTNET_ADDRESS ?? "";
