import { deriveP2wpkhTestnetAddress } from "../src/lib/bitcoin/address";

const publicKeyHex = process.argv[2];

if (!publicKeyHex) {
  throw new Error("Usage: npm run btc:derive -- <compressed-or-uncompressed-secp256k1-public-key-hex>");
}

const derived = deriveP2wpkhTestnetAddress(publicKeyHex);
console.log(JSON.stringify(derived, null, 2));

