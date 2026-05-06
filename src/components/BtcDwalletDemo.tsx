"use client";

import { Connection, PublicKey, Transaction } from "@solana/web3.js";
import { CheckCircle2, ChevronDown, Clipboard, ExternalLink, History, KeyRound, Loader2, Plus, RadioTower, RotateCcw, Send, ShieldCheck, Trash2, Wallet } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { deriveP2wpkhTestnetAddress } from "@/lib/bitcoin/address";
import { broadcastTransaction, fetchAddressTransactions, fetchAddressUtxos, type ExplorerTx, type ExplorerUtxo } from "@/lib/bitcoin/explorer";
import { buildP2wpkhSpend, finalizeP2wpkhSpend, type BuiltP2wpkhSpend } from "@/lib/bitcoin/transaction";
import { DEFAULT_RETURN_TESTNET_ADDRESS, IKA_SOLANA_PREALPHA_CONFIG } from "@/lib/ika/config";
import { approveBitcoinSighashWithIka, createDwalletOnIka, type CreateDwalletResult } from "@/lib/ika/client";
import { dwalletsByOwner, parseDwalletPdaPubkey, removeDwallet, saveDwallet, scanChainForDwallets, type OnChainDwallet, type PersistedDwallet } from "@/lib/ika/persistence";
import { SolanaWalletButton, useInjectedSolanaWallet } from "./SolanaWalletButton";

type Step = 1 | 2 | 3;

function formatSats(value: number): string {
  return `${value.toLocaleString()} sats`;
}

function trimMiddle(value: string, left = 10, right = 10): string {
  if (value.length <= left + right + 3) return value;
  return `${value.slice(0, left)}...${value.slice(-right)}`;
}

function copyToClipboard(value: string) {
  return navigator.clipboard.writeText(value);
}

function timeAgo(ts: number): string {
  const seconds = Math.floor((Date.now() - ts) / 1000);
  if (seconds < 60) return "just now";
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}

const STEP_LABELS: Record<Step, string> = { 1: "Create dWallet", 2: "Fund & Check", 3: "Spend BTC" };

export function BtcDwalletDemo() {
  const wallet = useInjectedSolanaWallet();

  const [ikaDwallet, setIkaDwallet] = useState<CreateDwalletResult | null>(null);
  const [dwalletPublicKeyHex, setDwalletPublicKeyHex] = useState("");
  const [destinationAddress, setDestinationAddress] = useState(DEFAULT_RETURN_TESTNET_ADDRESS);
  const [amountSats, setAmountSats] = useState(1000);
  const [feeRateSatVb, setFeeRateSatVb] = useState(2);
  const [utxos, setUtxos] = useState<ExplorerUtxo[]>([]);
  const [txs, setTxs] = useState<ExplorerTx[]>([]);
  const [spendBuild, setSpendBuild] = useState<BuiltP2wpkhSpend | null>(null);
  const [finalRawTx, setFinalRawTx] = useState("");
  const [broadcastResult, setBroadcastResult] = useState<string | null>(null);
  const [status, setStatus] = useState("Connect your Solana devnet wallet to begin");
  const [loading, setLoading] = useState(false);
  const [showDebug, setShowDebug] = useState(false);
  const [resumedDwallets, setResumedDwallets] = useState<PersistedDwallet[]>([]);
  const [pdaLookupInput, setPdaLookupInput] = useState("");
  const [pdaLookupPubkey, setPdaLookupPubkey] = useState<string | null>(null);
  const [pdaLookupError, setPdaLookupError] = useState("");
  const [chainDwallets, setChainDwallets] = useState<OnChainDwallet[]>([]);
  const [scanning, setScanning] = useState(false);

  const loadSaved = useCallback(() => {
    if (!wallet.address) { setResumedDwallets([]); return; }
    setResumedDwallets(dwalletsByOwner(wallet.address));
  }, [wallet.address]);

  useEffect(() => { loadSaved(); }, [wallet.address, loadSaved]);

  const activePubkeyHex = ikaDwallet?.secp256k1PublicKeyHex ?? dwalletPublicKeyHex;

  const derivedAddress = useMemo(() => {
    if (!activePubkeyHex.trim()) return null;
    try { return deriveP2wpkhTestnetAddress(activePubkeyHex); }
    catch { return null; }
  }, [activePubkeyHex]);

  const balance = utxos.reduce((sum, utxo) => sum + utxo.value, 0);

  const currentStep: Step = finalRawTx
    ? 3
    : (ikaDwallet || derivedAddress)
      ? 2
      : 1;

  function stepClass(step: Step) {
    if (step < currentStep) return "step-done";
    if (step === currentStep) return "step-active";
    return "step-pending";
  }

  function resumeDwallet(d: PersistedDwallet) {
    setIkaDwallet(d);
    setDwalletPublicKeyHex(d.secp256k1PublicKeyHex);
    setSpendBuild(null);
    setFinalRawTx("");
    setBroadcastResult(null);
    setStatus(`Resumed dWallet — BTC: ${trimMiddle(deriveP2wpkhTestnetAddress(d.secp256k1PublicKeyHex).address)}`);
  }

  function deleteSavedDwallet(pubkeyHex: string) {
    removeDwallet(pubkeyHex);
    loadSaved();
    if (ikaDwallet?.secp256k1PublicKeyHex === pubkeyHex) {
      setIkaDwallet(null);
      setDwalletPublicKeyHex("");
      setStatus("dWallet removed");
    }
  }

  async function handlePdaLookup() {
    setPdaLookupError("");
    setPdaLookupPubkey(null);
    const pda = pdaLookupInput.trim();
    if (!pda) return;
    try {
      new PublicKey(pda);
    } catch {
      setPdaLookupError("Invalid Solana address");
      return;
    }
    try {
      const response = await fetch(IKA_SOLANA_PREALPHA_CONFIG.solanaRpcUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "getAccountInfo",
          params: [pda, { encoding: "base64" }],
        }),
      });
      const data = await response.json();
      if (!data.result?.value?.data?.[0]) {
        setPdaLookupError("Account not found or not owned by Ika");
        return;
      }
      if (data.result.value.owner !== IKA_SOLANA_PREALPHA_CONFIG.programId) {
        setPdaLookupError("Account exists but is not owned by the Ika program");
        return;
      }
      const pubkey = parseDwalletPdaPubkey(data.result.value.data[0]);
      if (!pubkey) { setPdaLookupError("Could not parse secp256k1 pubkey from account data"); return; }
      setPdaLookupPubkey(pubkey);
    } catch {
      setPdaLookupError("Failed to fetch account data");
    }
  }

  async function handleScanChain() {
    setScanning(true);
    setChainDwallets([]);
    setStatus("Scanning Solana devnet for dWallets...");
    try {
      const results = await scanChainForDwallets(wallet.address ?? undefined);
      setChainDwallets(results);
      setStatus(`Found ${results.length} dWallet(s) on chain${wallet.address ? " for your wallet" : ""}`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    } finally {
      setScanning(false);
    }
  }

  async function handleCreateIkaDwallet() {
    if (!wallet.address) { setStatus("Connect a Solana devnet wallet first"); return; }
    setLoading(true);
    try {
      setStatus("Requesting Ika dWallet DKG (pre-alpha mock signer)...");
      const result = await createDwalletOnIka({
        owner: new PublicKey(wallet.address),
      });
      setIkaDwallet(result);
      setDwalletPublicKeyHex(result.secp256k1PublicKeyHex);
      setSpendBuild(null);
      setFinalRawTx("");
      setBroadcastResult(null);
      saveDwallet(result);
      loadSaved();
      setStatus(`Ika dWallet created — BTC: ${trimMiddle(deriveP2wpkhTestnetAddress(result.secp256k1PublicKeyHex).address)}`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    } finally {
      setLoading(false);
    }
  }

  async function handleLookup() {
    const address = derivedAddress?.address;
    if (!address) { setStatus("Create a dWallet first"); return; }
    setLoading(true);
    setStatus(`Looking up UTXOs for ${trimMiddle(address)}...`);
    try {
      const [nextUtxos, nextTxs] = await Promise.all([
        fetchAddressUtxos(address),
        fetchAddressTransactions(address).catch(() => []),
      ]);
      setUtxos(nextUtxos);
      setTxs(nextTxs);
      setStatus(`Found ${nextUtxos.length} UTXO(s), ${formatSats(nextUtxos.reduce((sum, u) => sum + u.value, 0))}`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    } finally {
      setLoading(false);
    }
  }

  function handleBuildSpend() {
    if (!derivedAddress) { setStatus("Create a dWallet first"); return; }
    if (utxos.length === 0) { setStatus("No UTXOs found — fund the BTC address first"); return; }
    try {
      const build = buildP2wpkhSpend({
        fromPublicKeyHex: derivedAddress.publicKeyHex,
        utxos,
        toAddress: destinationAddress,
        amountSats,
        changeAddress: derivedAddress.address,
        feeRateSatVb,
      });
      setSpendBuild(build);
      setFinalRawTx("");
      setBroadcastResult(null);
      setStatus(`Transaction built — ${formatSats(build.amountSats)} send + ${formatSats(build.feeSats)} fee`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    }
  }

  async function handleSignAndFinalize() {
    if (!wallet.address) { setStatus("Connect a Solana devnet wallet first"); return; }
    if (!spendBuild || !derivedAddress) { setStatus("Build a transaction first"); return; }
    if (!ikaDwallet) { setStatus("Create or resume an Ika dWallet first"); return; }
    if (ikaDwallet.secp256k1PublicKeyHex !== derivedAddress.publicKeyHex) {
      setStatus("dWallet public key mismatch — recreate the dWallet"); return;
    }
    setLoading(true);
    try {
      const connection = new Connection(IKA_SOLANA_PREALPHA_CONFIG.solanaRpcUrl, "confirmed");
      const ikaSignatures: { signatureHex: string; signatureEncoding: "der" | "compact-rs" }[] = [];
      for (const digest of spendBuild.inputDigests) {
        setStatus(`Awaiting wallet approval ${digest.inputIndex + 1}/${spendBuild.inputDigests.length}...`);
        const result = await approveBitcoinSighashWithIka({
          dwallet: ikaDwallet,
          ownerSolanaAddress: wallet.address,
          bitcoinSigningPreimageHex: digest.bip143PreimageHex,
          bitcoinSighashHex: digest.sighashHex,
          sighashType: digest.sighashType,
          amountSats,
          destinationAddress,
          unsignedTransactionHex: spendBuild.unsignedTransactionHex,
          sendApprovalTransaction: (instruction) =>
            wallet.sendTransaction(new Transaction().add(instruction), connection),
        });
        ikaSignatures.push({ signatureHex: result.signatureHex, signatureEncoding: result.signatureEncoding });
      }
      const finalized = finalizeP2wpkhSpend(
        spendBuild.unsignedTransactionHex,
        derivedAddress.publicKeyHex,
        ikaSignatures.map((sig) =>
          sig.signatureEncoding === "compact-rs"
            ? { compactSignatureHex: sig.signatureHex }
            : { derSignatureHex: sig.signatureHex },
        ),
      );
      setFinalRawTx(finalized);
      setStatus(`Signed ${ikaSignatures.length} input(s) with Ika — ready to broadcast`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    } finally {
      setLoading(false);
    }
  }

  async function handleBroadcast() {
    if (!finalRawTx) { setStatus("Sign the transaction first"); return; }
    setLoading(true);
    setStatus("Broadcasting to Bitcoin testnet...");
    try {
      const txid = await broadcastTransaction(finalRawTx);
      setBroadcastResult(txid);
      setStatus(`Broadcast! TXID: ${txid}`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">Solana devnet / Bitcoin testnet</p>
          <h1>BTC dWallet Demo</h1>
        </div>
        <SolanaWalletButton wallet={wallet} />
      </header>

      <section className="status-strip">
        <div><span>Solana RPC</span><strong>{IKA_SOLANA_PREALPHA_CONFIG.solanaRpcUrl}</strong></div>
        <div><span>Ika gRPC</span><strong>{IKA_SOLANA_PREALPHA_CONFIG.grpcEndpoint}</strong></div>
        <div><span>Program</span><strong>{trimMiddle(IKA_SOLANA_PREALPHA_CONFIG.programId, 8, 8)}</strong></div>
        <div><span>Status</span><strong>{status}</strong></div>
      </section>

      {/* Saved dWallets */}
      {wallet.address && (
        <section className="saved-section">
          <article className="tool history-tool">
            <div className="tool-heading">
              <History aria-hidden /><h2>Your dWallets</h2>
              <button className="debug-toggle" type="button" disabled={scanning} onClick={handleScanChain} style={{ marginLeft: "auto" }}>
                {scanning ? <Loader2 size={14} className="spin" /> : null}
                Scan chain
              </button>
            </div>

            {/* Chain scan results */}
            {chainDwallets.length > 0 && (
              <div className="history-list" style={{ marginBottom: 12 }}>
                {chainDwallets.map((d) => {
                  const addr = deriveP2wpkhTestnetAddress(d.pubkeyHex);
                  return (
                    <div key={d.pda} className="saved-dwallet-row">
                      <div>
                        <strong>{trimMiddle(addr.address, 14, 14)}</strong>
                        <span>PDA: {trimMiddle(d.pda, 8, 8)} | Owner: {trimMiddle(d.owner, 8, 8)}</span>
                      </div>
                      <button type="button" className="secondary-action saved-btn" onClick={() => {
                        setDwalletPublicKeyHex(d.pubkeyHex);
                        setIkaDwallet(null);
                        setStatus(`Loaded pubkey on-chain — you can check UTXOs in Step 2. To sign, create a new dWallet or resume from a saved one.`);
                      }}>
                        Load pubkey
                      </button>
                    </div>
                  );
                })}
              </div>
            )}

            {/* LocalStorage saved dWallets */}
            {resumedDwallets.length > 0 && (
              <div className="history-list">
                {resumedDwallets.map((d) => {
                  const addr = deriveP2wpkhTestnetAddress(d.secp256k1PublicKeyHex);
                  const isActive = ikaDwallet?.secp256k1PublicKeyHex === d.secp256k1PublicKeyHex;
                  return (
                    <div key={d.secp256k1PublicKeyHex} className={`saved-dwallet-row ${isActive ? "active-row" : ""}`}>
                      <div>
                        <strong>{trimMiddle(addr.address, 16, 16)}</strong>
                        <span>{timeAgo(d.savedAt)}</span>
                      </div>
                      <div className="saved-actions">
                        {!isActive && (
                          <button type="button" className="secondary-action saved-btn" onClick={() => resumeDwallet(d)}>
                            <RotateCcw size={14} /> Resume
                          </button>
                        )}
                        {isActive && <span className="active-badge">Active</span>}
                        <button type="button" className="icon-button saved-btn" onClick={() => deleteSavedDwallet(d.secp256k1PublicKeyHex)}>
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {!scanning && chainDwallets.length === 0 && resumedDwallets.length === 0 && (
              <p className="muted-text">No saved dWallets yet. Create one or scan the chain.</p>
            )}
          </article>
        </section>
      )}

      {/* On-chain PDA lookup */}
      {wallet.address && (
        <details className="debug-details" style={{ marginBottom: 12 }}>
          <summary className="debug-summary"><ChevronDown size={14} /> Lookup dWallet on chain (by PDA address)</summary>
          <div style={{ display: "flex", gap: 8, alignItems: "flex-end", marginTop: 8 }}>
            <label className="stacked-field" style={{ flex: 1 }}>
              <span>dWallet PDA address</span>
              <input value={pdaLookupInput} onChange={(e) => setPdaLookupInput(e.target.value)} placeholder="EcttQs6N82..." />
            </label>
            <button className="secondary-action" type="button" style={{ width: "auto", padding: "0 16px" }} onClick={handlePdaLookup}>
              Lookup
            </button>
          </div>
          {pdaLookupError && <p style={{ color: "var(--red)", fontSize: "0.82rem", marginTop: 8 }}>{pdaLookupError}</p>}
          {pdaLookupPubkey && (
            <div style={{ marginTop: 8 }}>
              <div className="field-row"><span>Public Key</span><strong>{trimMiddle(pdaLookupPubkey, 12, 12)}</strong></div>
              <div className="field-row"><span>BTC Address</span><strong>{deriveP2wpkhTestnetAddress(pdaLookupPubkey).address}</strong></div>
              <button className="secondary-action" type="button" onClick={() => { setDwalletPublicKeyHex(pdaLookupPubkey); setIkaDwallet(null); setStatus("On-chain pubkey loaded — use Dev: manual signing"); }}>
                Use this pubkey
              </button>
            </div>
          )}
        </details>
      )}

      <section className="wizard-steps">
        {([1, 2, 3] as Step[]).map((step) => (
          <div key={step} className={`wizard-step ${stepClass(step)}`}>
            <div className="step-badge">
              {step < currentStep ? <CheckCircle2 size={20} /> : step === currentStep && loading ? <Loader2 size={20} className="spin" /> : step}
            </div>
            <span>{STEP_LABELS[step]}</span>
          </div>
        ))}
      </section>

      {/* Step 1 — Create Ika dWallet */}
      <section className={`step-panel ${currentStep >= 1 ? "" : "step-hidden"}`}>
        <article className="tool step-1-tool">
          <div className="tool-heading"><ShieldCheck aria-hidden /><h2>Step 1 — Create Ika dWallet</h2></div>
          <div className="field-row"><span>Solana Wallet</span><strong>{wallet.address ? trimMiddle(wallet.address) : "Disconnected"}</strong></div>
          {ikaDwallet && (
            <>
              <div className="field-row"><span>dWallet ID</span><strong>{trimMiddle(ikaDwallet.dwalletId ?? "", 8, 8)}</strong></div>
              {ikaDwallet.dwalletPda && (
                <div className="field-row"><span>dWallet PDA</span><strong>{trimMiddle(ikaDwallet.dwalletPda, 8, 8)}</strong></div>
              )}
              <div className="field-row"><span>BTC Address</span><strong>{derivedAddress?.address ?? "—"}</strong></div>
              {derivedAddress && (
                <div className="qr-line">
                  <QRCodeSVG value={derivedAddress.address} size={116} />
                  <button type="button" className="icon-button" aria-label="Copy BTC address" onClick={() => copyToClipboard(derivedAddress.address)}><Clipboard size={18} /></button>
                </div>
              )}
            </>
          )}
          <div className="create-actions">
            <button className="primary-action" type="button" disabled={loading} onClick={handleCreateIkaDwallet}>
              {loading ? <Loader2 size={18} className="spin" /> : <Plus size={18} />}
              New Ika dWallet
            </button>
          </div>
          <details className="debug-details">
            <summary className="debug-summary"><ChevronDown size={14} /> Dev: Manual public key</summary>
            <label className="stacked-field">
              <span>secp256k1 public key hex</span>
              <textarea value={dwalletPublicKeyHex} onChange={(e) => { setDwalletPublicKeyHex(e.target.value); setIkaDwallet(null); }} placeholder="02..." rows={2} />
            </label>
            {derivedAddress && !ikaDwallet && (
              <div className="field-row"><span>BTC Address</span><strong>{derivedAddress.address}</strong></div>
            )}
          </details>
        </article>
      </section>

      {/* Step 2 — Fund & Check */}
      <section className={`step-panel ${currentStep >= 2 ? "" : "step-disabled"}`}>
        <article className="tool step-2-tool">
          <div className="tool-heading"><RadioTower aria-hidden /><h2>Step 2 — Fund &amp; Check UTXOs</h2></div>
          {ikaDwallet || derivedAddress ? (
            <>
              <div className="field-row"><span>Balance</span><strong>{formatSats(balance)}</strong></div>
              <button className="primary-action" type="button" disabled={loading} onClick={handleLookup}>
                {loading ? <Loader2 size={18} className="spin" /> : <RadioTower size={18} />} Refresh UTXOs
              </button>
              {utxos.length > 0 ? (
                <div className="utxo-list">
                  {utxos.slice(0, 6).map((utxo) => (
                    <div key={`${utxo.txid}:${utxo.vout}`} className="utxo-row">
                      <span>{trimMiddle(utxo.txid, 8, 8)}:{utxo.vout}</span>
                      <strong>{formatSats(utxo.value)}</strong>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="muted-text">Send testnet BTC to {trimMiddle(derivedAddress?.address ?? "", 16, 16)} then refresh</p>
              )}
            </>
          ) : (
            <p className="muted-text">Complete Step 1 to see your BTC address</p>
          )}
        </article>
      </section>

      {/* Step 3 — Spend BTC */}
      <section className={`step-panel ${currentStep >= 2 ? "" : "step-disabled"}`}>
        <article className="tool spend-tool">
          <div className="tool-heading"><Send aria-hidden /><h2>Step 3 — Spend BTC</h2></div>
          {!ikaDwallet && derivedAddress && (
            <p className="muted-text" style={{ marginBottom: 12 }}>
              No signing session loaded. Resume a saved dWallet from "Your dWallets" above, or create a new one.
            </p>
          )}
          <label className="stacked-field">
            <span>Destination address</span>
            <input value={destinationAddress} onChange={(e) => setDestinationAddress(e.target.value)} />
          </label>
          <div className="two-up">
            <label className="stacked-field"><span>Amount (sats)</span><input type="number" min={1} value={amountSats} onChange={(e) => setAmountSats(Number(e.target.value))} /></label>
            <label className="stacked-field"><span>Fee rate (sat/vB)</span><input type="number" min={1} value={feeRateSatVb} onChange={(e) => setFeeRateSatVb(Number(e.target.value))} /></label>
          </div>
          <button className="primary-action" type="button" disabled={loading || utxos.length === 0} onClick={handleBuildSpend}>
            <ShieldCheck size={18} /> Build Transaction
          </button>
          {spendBuild && (
            <>
              <div className="field-row"><span>Fee</span><strong>{formatSats(spendBuild.feeSats)}</strong></div>
              <div className="field-row"><span>Change</span><strong>{formatSats(spendBuild.changeSats)}</strong></div>
              <div className="field-row"><span>Inputs</span><strong>{spendBuild.inputDigests.length}</strong></div>
              <button className="primary-action" type="button" disabled={loading} onClick={handleSignAndFinalize}>
                {loading ? <Loader2 size={18} className="spin" /> : <KeyRound size={18} />}
                {loading ? "Signing... (check wallet)" : "Sign with Ika"}
              </button>
              {finalRawTx && (
                <>
                  <button className="secondary-action" type="button" disabled={loading} onClick={handleBroadcast}>
                    {loading ? <Loader2 size={18} className="spin" /> : <ExternalLink size={18} />} Broadcast to Bitcoin Testnet
                  </button>
                  {broadcastResult && <code>TXID: {broadcastResult}</code>}
                  <details className="debug-details">
                    <summary className="debug-summary"><ChevronDown size={14} /> Raw transaction hex</summary>
                    <code className="raw-hex">{finalRawTx}</code>
                  </details>
                </>
              )}
            </>
          )}
        </article>
      </section>

      {/* Debug toggle */}
      <section style={{ marginTop: 16, textAlign: "right" }}>
        <button className="debug-toggle" type="button" onClick={() => setShowDebug(!showDebug)}>
          <ChevronDown size={14} style={{ transform: showDebug ? "rotate(180deg)" : undefined }} />
          {showDebug ? "Hide" : "Show"} debug info
        </button>
        {showDebug && (
          <article className="tool history-tool" style={{ marginTop: 8 }}>
            <div className="tool-heading"><ExternalLink aria-hidden /><h2>Debug Info</h2></div>
            {ikaDwallet && (
              <details open>
                <summary>dWallet Record</summary>
                <pre className="debug-pre">{JSON.stringify({ ...ikaDwallet, secp256k1PublicKeyHex: trimMiddle(ikaDwallet.secp256k1PublicKeyHex) }, null, 2)}</pre>
              </details>
            )}
            {spendBuild && (
              <details>
                <summary>Sighash Digests</summary>
                {spendBuild.inputDigests.map((d) => (
                  <code key={d.inputIndex}>Input {d.inputIndex}: {d.txid}:{d.vout}{"\n"}sighash: {d.sighashHex}{"\n"}preimage: {d.bip143PreimageHex}</code>
                ))}
              </details>
            )}
            {txs.length > 0 && (
              <details>
                <summary>Transaction History ({txs.length})</summary>
                <div className="history-list">
                  {txs.map((tx) => (
                    <a key={tx.txid} href={`https://blockstream.info/testnet/tx/${tx.txid}`} target="_blank" rel="noreferrer">
                      <span>{trimMiddle(tx.txid, 12, 12)}</span>
                      <strong className={tx.status.confirmed ? "" : "tx-badge-mempool"}>{tx.status.confirmed ? "confirmed" : "mempool"}</strong>
                    </a>
                  ))}
                </div>
              </details>
            )}
          </article>
        )}
      </section>
    </main>
  );
}
