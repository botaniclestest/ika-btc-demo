# Ika / Solana Pre-Alpha Notes

The project uses the official `dwallet-labs/ika-pre-alpha` Solana material as the integration target.

Current devnet defaults:

- Solana RPC: `https://api.devnet.solana.com`
- dWallet gRPC: `https://pre-alpha-dev-1.ika.ika-network.net:443`
- Ika dWallet program: `87W54kGYFQ1rgWqMeu4XTPHWXWmXSQCcjm8vCTfiq1oY`

The pre-alpha disclaimer matters: signing uses a mock signer, interfaces can change, and all on-chain/program data can be wiped. This prototype is only for Bitcoin testnet funds.

## Implemented Adapter

`src/lib/ika/client.ts` now performs the practical browser flow:

1. Create a Secp256k1 dWallet with the gRPC `DKG` request.
2. Store the dWallet session identifier, public key, PDA, and DKG attestation.
3. Build a Solana `approve_message` instruction for `EcdsaDoubleSha256`.
4. Allocate a Secp256k1 ECDSA presign with gRPC `Presign`.
5. Submit gRPC `Sign` with the Solana approval transaction signature.
6. Return the 64-byte compact ECDSA signature for Bitcoin witness finalization.

The MessageApproval PDA uses:

```text
["dwallet", chunks(curve_u16_le || public_key), "message_approval", scheme_u16_le, keccak256(message)]
```

For Bitcoin P2WPKH, `message` is the BIP143 preimage and the on-chain `signature_scheme` is `EcdsaDoubleSha256` (`2`). Ika then signs `double_sha256(message)`, which is the Bitcoin witness digest.

## Direct Approval Caveat

The official docs currently describe both direct user authority and CPI authority patterns, but several reference pages still show older `approve_message` account/data layouts. This app uses the newer 100-byte layout and coordinator account documented in the on-chain/CPI pages, with the connected Solana wallet as the direct authority.

If devnet rejects direct authority approval, the next concrete step is deploying the included Anchor policy program and using its CPI authority PDA for `approve_message`.

## Local Completion Mode

`src/lib/local-signer/solanaControlledSigner.ts` remains as a local completion lane. It proves the Bitcoin testnet construction/finalization loop without depending on Ika pre-alpha availability, but it is not MPC and is not Ika.

