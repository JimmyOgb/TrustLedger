'use client';
import React, { useEffect, useState } from 'react';
import { useWallet } from '@/lib/wallet';
import { formatWeiToGen } from '@/lib/genlayer';
import { executeV2, fetchGasPriceWei, writeGateOpen } from '@/lib/escrow';
import { isTerminal, isInFlight, type TxSpec, type TxUpdate } from '@/lib/escrow-core';
import { AlertTriangle, CheckCircle2, Loader2, Lock, XCircle } from 'lucide-react';

export type PendingTx = Omit<TxSpec, 'caller'> & { onFinished?: (u: TxUpdate) => void };

const PHASE_STYLE: Record<string, string> = {
  confirmed: 'text-emerald-300 border-emerald-500/40 bg-emerald-500/10',
  unverified: 'text-amber-300 border-amber-500/40 bg-amber-500/10',
  timeout: 'text-amber-300 border-amber-500/40 bg-amber-500/10',
};

/** Shared guard: wallet connected on StudioNet and gate open. Returns a reason string or null. */
export function useWriteBlocker(): string | null {
  const w = useWallet();
  if (!writeGateOpen()) return 'V2 writes are disabled: NEXT_PUBLIC_V2_DEPLOYED=false (pre-readiness safety gate).';
  if (!w.providerAvailable) return 'No browser wallet detected.';
  if (!w.isConnected || !w.address) return 'Connect a wallet to submit transactions.';
  if (w.isWrongNetwork) return 'Wallet is on the wrong network. Switch to GenLayer StudioNet (61999).';
  return null;
}

export function TxConfirmDialog({ tx, onClose }: { tx: PendingTx | null; onClose: () => void }) {
  const wallet = useWallet();
  const [update, setUpdate] = useState<TxUpdate | null>(null);
  const [gasPrice, setGasPrice] = useState<string>('…');

  useEffect(() => {
    setUpdate(null);
    if (tx) fetchGasPriceWei().then((g) => setGasPrice(`${g} wei`)).catch((e) => setGasPrice(`unavailable (${e?.message || e})`));
  }, [tx]);

  if (!tx) return null;
  const running = update !== null && !isTerminal(update.phase);
  const blocker = !writeGateOpen() ? 'Deployment gate closed.' : !wallet.address ? 'Wallet not connected.' : wallet.isWrongNetwork ? 'Wrong network.' : null;

  const confirm = async () => {
    if (!wallet.address || running || isInFlight(tx.key)) return;
    const res = await executeV2({ ...tx, caller: wallet.address }, setUpdate);
    tx.onFinished?.(res);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4" role="dialog" aria-modal="true" data-testid="tx-dialog">
      <div className="w-full max-w-lg bg-[#0a0f1d] border border-slate-700 rounded-2xl p-5 space-y-4 text-xs">
        <h3 className="text-sm font-bold text-white">Confirm transaction: {tx.action}</h3>
        <dl className="grid grid-cols-3 gap-x-3 gap-y-1.5 font-mono text-[11px]">
          <dt className="text-slate-400 font-sans">Network</dt><dd className="col-span-2 text-white">GenLayer StudioNet (61999)</dd>
          <dt className="text-slate-400 font-sans">Contract</dt><dd className="col-span-2 text-blue-300 break-all" data-testid="tx-contract">{tx.contract}</dd>
          <dt className="text-slate-400 font-sans">Caller</dt><dd className="col-span-2 text-slate-200 break-all" data-testid="tx-caller">{wallet.address ?? 'not connected'}</dd>
          <dt className="text-slate-400 font-sans">Method</dt><dd className="col-span-2 text-emerald-300">{tx.method}</dd>
          <dt className="text-slate-400 font-sans">Arguments</dt>
          <dd className="col-span-2"><pre className="whitespace-pre-wrap break-all text-slate-300 text-[10px] bg-black/30 p-2 rounded">{JSON.stringify(tx.args, (_k, v) => (typeof v === 'bigint' ? v.toString() : v), 2)}</pre></dd>
          <dt className="text-slate-400 font-sans">GEN value</dt>
          <dd className="col-span-2 text-white" data-testid="tx-value">{tx.valueWei.toString()} wei ({formatWeiToGen(tx.valueWei)})</dd>
          <dt className="text-slate-400 font-sans">Gas price</dt><dd className="col-span-2 text-slate-300">{gasPrice} (read from RPC)</dd>
        </dl>

        {update && (
          <div className={`border rounded-xl p-3 space-y-1 ${PHASE_STYLE[update.phase] ?? (isTerminal(update.phase) ? 'text-rose-300 border-rose-500/40 bg-rose-500/10' : 'text-blue-300 border-blue-500/40 bg-blue-500/10')}`} data-testid="tx-status">
            <div className="flex items-center gap-2 font-semibold uppercase">
              {running ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : update.phase === 'confirmed' ? <CheckCircle2 className="w-3.5 h-3.5" /> : update.phase === 'unverified' || update.phase === 'timeout' ? <AlertTriangle className="w-3.5 h-3.5" /> : <XCircle className="w-3.5 h-3.5" />}
              <span data-testid="tx-phase">{update.phase.replace('_', ' ')}</span>
              {update.chainStatus && <span className="font-mono normal-case text-[10px] opacity-80">chain: {update.chainStatus}{update.executionResult ? ` / ${update.executionResult}` : ''}</span>}
            </div>
            {update.hash && <div className="font-mono text-[10px] break-all" data-testid="tx-hash">tx: {update.hash}</div>}
            {update.message && <div className="text-[11px]">{update.message}</div>}
          </div>
        )}

        <div className="flex gap-2 justify-end">
          <button type="button" onClick={onClose} disabled={running} className="px-3 py-2 rounded-lg border border-slate-700 text-slate-300 disabled:opacity-50">
            {update && isTerminal(update.phase) ? 'Close' : 'Cancel'}
          </button>
          {(!update || (isTerminal(update.phase) && !['confirmed', 'unverified', 'timeout'].includes(update.phase))) && (
            <button type="button" onClick={confirm} disabled={!!blocker || running} className="px-3 py-2 rounded-lg bg-blue-600 text-white font-semibold disabled:opacity-50 flex items-center gap-1.5" data-testid="tx-confirm">
              {blocker ? <Lock className="w-3.5 h-3.5" /> : null}
              {blocker ?? (update ? 'Retry (re-checks state)' : 'Sign & submit')}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export function WriteBlockerNotice() {
  const b = useWriteBlocker();
  if (!b) return null;
  return (
    <div className="flex items-start gap-2 bg-amber-500/10 border border-amber-500/30 text-amber-200 rounded-xl p-3 text-xs" data-testid="write-blocker">
      <Lock className="w-4 h-4 shrink-0 mt-0.5" />
      <span>{b}</span>
    </div>
  );
}
