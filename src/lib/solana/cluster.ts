import { clusterApiUrl } from "@solana/web3.js";
import { IKA_SOLANA_PREALPHA_CONFIG } from "../ika/config";

export const SOLANA_DEVNET_RPC_URL =
  process.env.NEXT_PUBLIC_SOLANA_RPC ?? IKA_SOLANA_PREALPHA_CONFIG.solanaRpcUrl ?? clusterApiUrl("devnet");

