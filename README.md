# Ika BTC Demo

A Solana devnet + Ika pre-alpha Bitcoin testnet signing prototype.

Create an Ika MPC dWallet on Solana, derive a Bitcoin testnet address from it, fund it, then sign and broadcast a real BTC transaction — all authorized through your Solana wallet.

## How It Works

```
Phantom/Solflare  ──▶  approve_message CPI  ──▶  Ika dWallet Program
        │                                              │
        │                                    Ika mock signer produces
        │                                    ECDSA sig on BIP143 preimage
        ▼                                              │
  BTC tx builder ◀─────────────────────────────────────┘
        │
        ▼
  Bitcoin testnet broadcast
```

The dWallet's secp256k1 key is split between your side and the Ika mock signer via MPC. No single private key exists anywhere. Your Solana wallet authorizes each signing request on-chain through Ika's `approve_message` instruction.

## The UI

A clean 3-step wizard guides the flow:

1. **Create dWallet** — Connects to Ika pre-alpha gRPC, requests DKG, stores result in localStorage
2. **Fund & Check** — Shows derived BTC testnet P2WPKH address with QR code, fetches UTXOs from Blockstream
3. **Spend BTC** — Build transaction, sign with Ika (requires Phantom confirmation), broadcast to testnet

Resume your dWallet across sessions — saved to localStorage, with optional chain scanning via `getProgramAccounts`.

## Quick Start

```bash
npm install
cp .env.example .env.local   # edit if needed
npm run dev
```

Open `http://localhost:3000`. Connect a Solana devnet wallet (Phantom or Solflare).

## Scripts

```bash
npm run btc:derive -- 02ab...              # derive BTC address from pubkey
npm run btc:inspect -- tb1q...             # inspect a testnet address
npm run btc:build -- --pubkey 02ab... --to tb1q... --amount 1000  # build spend draft
npm test                                    # run all tests
```

## Project Layout

| Directory | Purpose |
|---|---|
| `src/lib/bitcoin` | P2WPKH address derivation, BIP143 sighash, UTXO selection, witness finalization, broadcast |
| `src/lib/ika` | Ika gRPC client, PDA derivation, approval instruction builder, dWallet persistence |
| `src/components` | React UI — wallet button, 3-step wizard, debug panel |
| `src/app` | Next.js app shell, global styles |
| `anchor/` | Anchor shell for custom policy program (not deployed — uses Ika's public program) |
| `scripts/` | CLI tools for deriving, inspecting, and building BTC transactions |
| `tests/` | Vitest tests for address derivation and local signer determinism |

## Devnet Defaults

| Setting | Value |
|---|---|
| Solana RPC | `https://api.devnet.solana.com` |
| Ika gRPC | `https://pre-alpha-dev-1.ika.ika-network.net:443` |
| Ika Program ID | `87W54kGYFQ1rgWqMeu4XTPHWXWmXSQCcjm8vCTfiq1oY` |
| BTC Explorer | `https://blockstream.info/testnet/api` |

Override via `.env.local` — see `.env.example` for all options.

## Caveats

- **Ika pre-alpha** uses a single mock signer, not distributed MPC. The devnet program state may be wiped at any time.
- **No mainnet.** Testnet BTC and Solana devnet only.
- **This is not a wallet.** No seed phrases, no recovery paths, no production security.
- **Same address, new session:** The dWallet PDA and secp256k1 public key are permanent on-chain. Reconnect the same Solana wallet and use the chain scanner or localStorage resume to keep signing with the same BTC address — no new DKG needed.

## References

- [Ika dWallet docs](https://docs.ika.xyz/)
- [Ika Solana pre-alpha repo](https://github.com/dwallet-labs/ika-pre-alpha)
- [Bitcoin testnet explorer API](https://blockstream.info/testnet/api/)
