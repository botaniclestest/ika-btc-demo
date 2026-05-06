import { deriveP2wpkhTestnetAddress } from "../src/lib/bitcoin/address";
import { fetchAddressUtxos } from "../src/lib/bitcoin/explorer";
import { buildP2wpkhSpend } from "../src/lib/bitcoin/transaction";
import { DEFAULT_RETURN_TESTNET_ADDRESS } from "../src/lib/ika/config";

function readFlag(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index === -1 ? undefined : process.argv[index + 1];
}

const publicKeyHex = readFlag("--pubkey");
const destinationAddress = readFlag("--to") ?? DEFAULT_RETURN_TESTNET_ADDRESS;
const amountSats = Number(readFlag("--amount") ?? "1000");
const feeRateSatVb = Number(readFlag("--fee-rate") ?? "2");

if (!publicKeyHex) {
  throw new Error("Usage: npm run btc:build -- --pubkey 02ab... --to tb1q... --amount 1000 --fee-rate 2");
}

const derived = deriveP2wpkhTestnetAddress(publicKeyHex);
const utxos = await fetchAddressUtxos(derived.address);
const spend = buildP2wpkhSpend({
  fromPublicKeyHex: derived.publicKeyHex,
  utxos,
  toAddress: destinationAddress,
  amountSats,
  changeAddress: derived.address,
  feeRateSatVb,
});

console.log(
  JSON.stringify(
    {
      sourceAddress: derived.address,
      destinationAddress,
      ...spend,
    },
    null,
    2,
  ),
);

