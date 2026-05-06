export type ExplorerUtxo = {
  txid: string;
  vout: number;
  value: number;
  status: {
    confirmed: boolean;
    block_height?: number;
    block_hash?: string;
    block_time?: number;
  };
};

export type ExplorerTx = {
  txid: string;
  status: ExplorerUtxo["status"];
  fee?: number;
  vin?: unknown[];
  vout?: Array<{
    scriptpubkey: string;
    scriptpubkey_address?: string;
    value: number;
  }>;
};

export const DEFAULT_TESTNET_EXPLORER_API =
  process.env.NEXT_PUBLIC_BITCOIN_EXPLORER_API ?? "https://blockstream.info/testnet/api";

function explorerUrl(path: string, apiBase = DEFAULT_TESTNET_EXPLORER_API): string {
  return `${apiBase.replace(/\/$/, "")}${path}`;
}

async function readExplorerResponse(response: Response): Promise<string> {
  const text = await response.text();

  if (!response.ok) {
    throw new Error(`Bitcoin explorer request failed (${response.status}): ${text}`);
  }

  return text;
}

export async function fetchAddressUtxos(address: string, apiBase?: string): Promise<ExplorerUtxo[]> {
  const response = await fetch(explorerUrl(`/address/${address}/utxo`, apiBase), {
    cache: "no-store",
  });
  const text = await readExplorerResponse(response);
  return JSON.parse(text) as ExplorerUtxo[];
}

export async function fetchAddressTransactions(address: string, apiBase?: string): Promise<ExplorerTx[]> {
  const response = await fetch(explorerUrl(`/address/${address}/txs`, apiBase), {
    cache: "no-store",
  });
  const text = await readExplorerResponse(response);
  return JSON.parse(text) as ExplorerTx[];
}

export async function fetchTransactionHex(txid: string, apiBase?: string): Promise<string> {
  const response = await fetch(explorerUrl(`/tx/${txid}/hex`, apiBase), {
    cache: "no-store",
  });
  return readExplorerResponse(response);
}

export async function broadcastTransaction(rawTransactionHex: string, apiBase?: string): Promise<string> {
  const response = await fetch(explorerUrl("/tx", apiBase), {
    method: "POST",
    headers: {
      "content-type": "text/plain",
    },
    body: rawTransactionHex,
  });
  return readExplorerResponse(response);
}

