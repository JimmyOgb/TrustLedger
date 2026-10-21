'use client';
import React, { useCallback, useEffect, useState } from 'react';
import { RUN_2_CONTRACTS, getOnChainBalance, checkRpcHealth, formatWeiToGen } from '@/lib/genlayer';
import { V2_ADDRESS, v2Summary, v2Deployer, v2IsVaultApproved, fetchGasPriceWei, writeGateOpen } from '@/lib/escrow';
import { useWallet } from '@/lib/wallet';
import { RefreshCw } from 'lucide-react';

type Row = { label: string; value: string; error?: boolean };

/** Live V2 contract/network diagnostics. Every value is read from chain; failures are shown, never defaulted. */
export function V2LivePanel() {
  const wallet = useWallet();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const out: Row[] = [];
    const add = async (label: string, fn: () => Promise<string>) => {
      try { out.push({ label, value: await fn() }); } catch (e: any) { out.push({ label, value: `ERROR: ${e?.message || e}`, error: true }); }
    };
    await add('RPC (same-origin proxy)', async () => { const h = await checkRpcHealth(); if (!h.ok) throw new Error(h.error); return `chain ${h.chainIdHex} (${parseInt(h.chainIdHex!, 16)}) · ${h.latencyMs} ms`; });
    await add('Gas price', async () => `${await fetchGasPriceWei()} wei`);
    await add('V2 contract', async () => V2_ADDRESS ?? (() => { throw new Error('unconfigured'); })());
    await add('V2 write gate', async () => (writeGateOpen() ? 'OPEN (NEXT_PUBLIC_V2_DEPLOYED=true; preview only)' : 'CLOSED (NEXT_PUBLIC_V2_DEPLOYED=false)'));
    await add('V2 native balance', async () => { const b = await getOnChainBalance(V2_ADDRESS!); return `${b} wei (${formatWeiToGen(b)})`; });
    await add('V2 deployer', () => v2Deployer());
    await add('V2 escrow summary', async () => {
      const s = await v2Summary();
      const covered = BigInt(s.contract_balance_wei) >= BigInt(s.total_escrow_locked_wei) + BigInt(s.total_escrow_claimable_wei);
      return `projects ${s.project_count} · milestones ${s.milestone_count} · claims ${s.claim_count} · locked ${s.total_escrow_locked_wei} · claimable ${s.total_escrow_claimable_wei} · dispatched ${s.total_escrow_dispatched_wei} wei · invariant balance ≥ locked+claimable: ${covered ? 'HOLDS' : 'VIOLATED'}`;
    });
    for (const [name, addr] of [['Run 2 freelancer vault', RUN_2_CONTRACTS.freelancerVault], ['Run 2 client refund vault', RUN_2_CONTRACTS.clientRefundVault]] as const) {
      await add(`Approved on V2: ${name}`, async () => `${addr} → ${await v2IsVaultApproved(addr)}`);
    }
    if (wallet.address) await add('Connected wallet balance', async () => `${wallet.address} · ${await getOnChainBalance(wallet.address!)} wei`);
    setRows(out);
    setLoading(false);
  }, [wallet.address]);

  useEffect(() => { load(); }, [load]);

  return (
    <div className="bg-[#0a0f1d] border border-slate-800 rounded-2xl p-5 space-y-2 text-xs" data-testid="v2-live-panel">
      <div className="flex items-center justify-between">
        <div className="text-sm font-semibold text-white">Live V2 contract and network state</div>
        <button onClick={load} aria-label="refresh"><RefreshCw className={`w-3.5 h-3.5 text-slate-400 ${loading ? 'animate-spin' : ''}`} /></button>
      </div>
      <dl className="grid grid-cols-1 sm:grid-cols-3 gap-x-3 gap-y-1">
        {rows.map((r) => (
          <React.Fragment key={r.label}>
            <dt className="text-slate-400">{r.label}</dt>
            <dd className={`sm:col-span-2 font-mono text-[11px] break-all ${r.error ? 'text-rose-300' : 'text-slate-200'}`}>{r.value}</dd>
          </React.Fragment>
        ))}
      </dl>
      <p className="text-[10px] text-slate-500">Withdrawals on V2 require the destination vault to be approved by the deployer via register_approved_vault. Unapproved destinations cause withdraw_claim to revert.</p>
    </div>
  );
}
