import { classifyBitcoinTestnetAddress } from "../src/lib/bitcoin/address";
import { fetchAddressTransactions, fetchAddressUtxos } from "../src/lib/bitcoin/explorer";
import { DEFAULT_RETURN_TESTNET_ADDRESS } from "../src/lib/ika/config";

const address = process.argv[2] ?? DEFAULT_RETURN_TESTNET_ADDRESS;
const classification = classifyBitcoinTestnetAddress(address);
const utxos = await fetchAddressUtxos(address);
const txs = await fetchAddressTransactions(address).catch(() => []);
const balanceSats = utxos.reduce((sum, utxo) => sum + utxo.value, 0);

console.log(
  JSON.stringify(
    {
      classification,
      balanceSats,
      utxoCount: utxos.length,
      txCount: txs.length,
      utxos,
    },
    null,
    2,
  ),
);

