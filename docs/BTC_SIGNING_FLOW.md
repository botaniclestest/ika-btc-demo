# Bitcoin P2WPKH Signing Flow

This prototype targets Bitcoin testnet P2WPKH because your current `tb1q...` address is native SegWit v0 with a 20-byte witness program.

## Flow

1. Get the Ika dWallet secp256k1 public key.
2. Compress it to 33 bytes if needed.
3. Derive `HASH160(compressed_pubkey)`.
4. Encode a testnet P2WPKH address.
5. Fetch UTXOs for that address.
6. Build a version 2 Bitcoin transaction with:
   - inputs from the dWallet-derived address
   - one destination output
   - optional change back to the dWallet-derived address
7. For each input, build the BIP143 signing preimage and verify that `double_sha256(preimage)` equals `hashForWitnessV0(input_index, scriptCode, prevout_value, SIGHASH_ALL)`.
8. Send each BIP143 preimage to the Solana/Ika approval path with `EcdsaDoubleSha256`.
9. Convert the returned ECDSA signature to Bitcoin witness format:
   - DER signature plus one sighash byte, or
   - compact `r || s` encoded to DER plus one sighash byte
10. Set each input witness to `[signature_plus_sighash_type, compressed_pubkey]`.
11. Broadcast the final raw transaction to Bitcoin testnet.

## Main Trap

Bitcoin P2WPKH does not sign the raw transaction bytes. It signs `double_sha256(BIP143_preimage)`, which includes the previous output amount and `scriptCode`.

Ika's Solana pre-alpha approval PDA is keyed by `keccak256(message)`, but the dWallet network signs according to the signature scheme. For this project, `message` is the BIP143 preimage and the scheme is `EcdsaDoubleSha256`, so Ika signs the same digest Bitcoin expects.

## Files

- `src/lib/bitcoin/address.ts`: address derivation and testnet address classification.
- `src/lib/bitcoin/transaction.ts`: UTXO selection, BIP143 preimage/digest generation, witness finalization.
- `src/lib/bitcoin/explorer.ts`: Blockstream testnet API adapter.
