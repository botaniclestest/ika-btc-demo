# SOL IKA BTC TX

A deliberately small Solana devnet + Ika pre-alpha Bitcoin testnet signing prototype.

The goal is one clean proof:

1. Connect a normal Solana devnet wallet.
2. Create or register an Ika dWallet secp256k1 public key.
3. Derive a Bitcoin testnet native SegWit P2WPKH address from that public key.
4. Fund that address with testnet BTC.
5. Build a Bitcoin testnet spend.
6. Ask the signing path to approve the Bitcoin sighash.
7. Attach the returned ECDSA signature and broadcast the raw transaction.

This project targets Bitcoin testnet native SegWit v0 P2WPKH addresses. Your address can be classified with the included `classifyBitcoinTestnetAddress` helper.

## Current Status

The Bitcoin transaction path is complete for testnet P2WPKH:

- derive a testnet address from a secp256k1 public key
- fetch UTXOs
- build the BIP143 P2WPKH sighash
- sign each digest
- finalize witness data
- broadcast the raw transaction

The app now includes both signing lanes:

- **Ika pre-alpha lane**: creates a Secp256k1 dWallet through the official Solana pre-alpha gRPC service, derives the dWallet PDA, approves the Bitcoin BIP143 preimage on Solana with `EcdsaDoubleSha256`, asks Ika for the ECDSA signature, finalizes the witness, and broadcasts the raw testnet transaction.
- **Local Solana-controlled lane**: asks your Solana wallet to sign a domain-separated authorization message, derives a deterministic local secp256k1 test key from that signature, and signs Bitcoin testnet spends. This lane is only a fallback/simulator for disposable testnet funds.

Ika's Solana pre-alpha is a development network with a mock signer and disposable state. The app is wired to the current devnet defaults from the official pre-alpha repo:

- dWallet gRPC: `https://pre-alpha-dev-1.ika.ika-network.net:443`
- Solana RPC: `https://api.devnet.solana.com`
- Ika dWallet program: `87W54kGYFQ1rgWqMeu4XTPHWXWmXSQCcjm8vCTfiq1oY`

Do not use mainnet funds. Do not use real private keys. Treat all Solana/Ika pre-alpha state as disposable.

## Quick Start

```bash
npm install
cp .env.example .env.local
npm run dev
```

Open `http://localhost:3000`.

## Useful Scripts

Derive a Bitcoin testnet P2WPKH address from a secp256k1 public key:

```bash
npm run btc:derive -- 02ab...
```

Inspect your existing testnet address:

```bash
npm run btc:inspect -- tb1q...your-testnet-address
```

Build a spend draft after the derived dWallet address has UTXOs:

```bash
npm run btc:build -- --pubkey 02ab... --to tb1q... --amount 1000
```

## Full Ika Testnet Loop

1. Connect Phantom or Solflare on Solana devnet.
2. Click `Create Ika dWallet`.
3. Send a tiny amount of testnet BTC to the displayed `tb1q...` address.
4. Click `Refresh`.
5. Enter the destination testnet address and sats.
6. Click `Build Sighash`.
7. Click `Sign with Ika`.
8. Click `Broadcast`.

If the pre-alpha service, CORS, wallet signing, or direct approval layout changes, use `Create Local Signer` and `Sign Locally` to exercise the Bitcoin side while the Ika adapter is adjusted.

## Project Layout

- `src/lib/bitcoin`: P2WPKH address derivation, UTXO lookup, transaction digest, signature finalization, broadcast helpers.
- `src/lib/ika`: Ika/Solana pre-alpha gRPC client, PDA derivation, approval instruction, and signing adapter.
- `src/components`: Browser UI for the four-button style MVP.
- `anchor/programs/ika_btc_policy`: Minimal owner-authorized BTC sighash approval program.
- `docs`: Notes on the Bitcoin sighash flow and Ika/Solana integration caveats.

## Verified Source Pointers

- Ika docs: https://docs.ika.xyz/
- Ika dWallet concept docs: https://docs.ika.xyz/docs/core-concepts/dwallets
- Ika Solana pre-alpha repo: https://github.com/dwallet-labs/ika-pre-alpha
- Bitcoin testnet explorer API used by default: https://blockstream.info/testnet/api/
