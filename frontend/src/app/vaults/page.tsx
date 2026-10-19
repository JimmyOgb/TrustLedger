'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import {
  RUN_2_CONTRACTS,
  CONTRACT_ADDRESSES,
  getOnChainBalanceStrict,
  formatWeiRaw,
  formatWeiToGen,
} from '@/lib/genlayer';
import { shortenAddress } from '@/lib/wallet';
import {
  Landmark,
  Shield,
  Coins,
  RefreshCw,
  XCircle,
  Copy,
  Check,
  Lock,
  ArrowRight,
  Info,
  CheckCircle2,
} from 'lucide-react';

interface VaultItem {
  name: string;
  category: 'Escrow' | 'Recipient Vault';
  address: string;
  balanceWei: bigint | null;
  role: string;
  status: string;
  description: string;
}

export default function VaultsPage() {
  const [balances, setBalances] = useState<{
    escrow: bigint | null;
    freelancerVault: bigint | null;
    clientVault: bigint | null;
    v2Escrow: bigint | null;
  }>({
    escrow: null,
    freelancerVault: null,
    clientVault: null,
    v2Escrow: null,
  });

  const [loading, setLoading] = useState<boolean>(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [copiedText, setCopiedText] = useState<string | null>(null);

  const copyToClipboard = (text: string, label: string) => {
    if (!text) return;
    navigator.clipboard.writeText(text);
    setCopiedText(label);
    setTimeout(() => setCopiedText(null), 2500);
  };

  const loadBalances = useCallback(async () => {
    try {
      setLoading(true);
      setFetchError(null);

      const v2Address = '0x4Ec472F1fEc41cB89Fd11DfD788679786E874336';

      const [eBal, fvBal, cvBal, v2Bal] = await Promise.all([
        getOnChainBalanceStrict(RUN_2_CONTRACTS.escrow),
        getOnChainBalanceStrict(CONTRACT_ADDRESSES.freelancerVault),
        getOnChainBalanceStrict(CONTRACT_ADDRESSES.clientRefundVault),
        getOnChainBalanceStrict(v2Address).catch(() => 0n),
      ]);

      setBalances({
        escrow: eBal,
        freelancerVault: fvBal,
        clientVault: cvBal,
        v2Escrow: v2Bal,
      });
    } catch (err: any) {
      console.error('Error loading vault balances:', err);
      setFetchError(err?.message || 'Failed to read on-chain balances from StudioNet RPC');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadBalances();
  }, [loadBalances]);

  const vaultItems: VaultItem[] = [
    {
      name: 'Freelancer Recipient Vault',
      category: 'Recipient Vault',
      address: CONTRACT_ADDRESSES.freelancerVault,
      balanceWei: balances.freelancerVault,
      role: 'Beneficiary Payout Storage',
      status: 'Settled on StudioNet',
      description:
        'Independent recipient vault contract. Received Milestone 1 payout (150,000 wei) upon verified completion.',
    },
    {
      name: 'Client Refund Vault',
      category: 'Recipient Vault',
      address: CONTRACT_ADDRESSES.clientRefundVault,
      balanceWei: balances.clientVault,
      role: 'Depositor Refund Custody',
      status: 'Settled on StudioNet',
      description:
        'Independent refund vault contract. Received Milestone 2 refund (200,000 wei) following mutual arbitration resolution.',
    },
    {
      name: 'Preserved Run 2 Escrow Contract',
      category: 'Escrow',
      address: RUN_2_CONTRACTS.escrow,
      balanceWei: balances.escrow,
      role: 'Historical Project Escrow',
      status: 'Fully Settled (0 wei)',
      description:
        'Intelligent contract managing project milestones. Post-settlement balance is 0 wei after all funds were dispatched to recipient vaults.',
    },
    {
      name: 'TrustLedger V2 Escrow Contract',
      category: 'Escrow',
      address: '0x4Ec472F1fEc41cB89Fd11DfD788679786E874336',
      balanceWei: balances.v2Escrow,
      role: 'V2 Multi-Project Escrow',
      status: 'Pre-Deployment Safety Gate',
      description:
        'Deployed V2 Intelligent Contract instance. Currently zero liabilities and zero active vaults pending operator authorization.',
    },
  ];

  const totalVaultHoldings =
    (balances.freelancerVault ?? 0n) + (balances.clientVault ?? 0n);

  return (
    <div className="space-y-6">
      {/* Toast Feedback */}
      {copiedText && (
        <div className="fixed top-5 right-5 z-50 bg-blue-600 text-white px-4 py-2 rounded-xl shadow-xl flex items-center gap-2 text-xs font-semibold animate-in fade-in slide-in-from-top-2">
          <Check className="w-4 h-4" />
          <span>Copied {copiedText} to clipboard!</span>
        </div>
      )}

      {/* Header */}
      <div className="bg-[#090e1c] border border-slate-800 rounded-2xl p-5 sm:p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-500/10 text-blue-400 border border-blue-500/30">
              On-Chain Custody
            </span>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
              Live StudioNet
            </span>
          </div>
          <h1 className="text-xl sm:text-2xl font-bold text-white tracking-tight mt-1">
            Vaults & Contract Balances
          </h1>
          <p className="text-xs sm:text-sm text-slate-400">
            Authoritative balances read via StudioNet JSON-RPC (`eth_getBalance`). Distinguishing active escrow liabilities from independent recipient vaults.
          </p>
        </div>

        <button
          onClick={loadBalances}
          disabled={loading}
          className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium border border-slate-700 transition disabled:opacity-50 self-start sm:self-auto"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-blue-400' : ''}`} />
          <span>{loading ? 'Refreshing...' : 'Refresh Balances'}</span>
        </button>
      </div>

      {/* Error Banner */}
      {fetchError && (
        <div className="bg-rose-500/10 border border-rose-500/30 rounded-2xl p-4 flex items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <XCircle className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
            <div>
              <h4 className="text-sm font-semibold text-rose-300">Balance Fetch Error</h4>
              <p className="text-xs text-rose-200/80 mt-0.5 font-mono break-all">{fetchError}</p>
            </div>
          </div>
          <button
            onClick={loadBalances}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-rose-600/30 hover:bg-rose-600/50 text-rose-200 text-xs font-medium border border-rose-500/30 shrink-0 transition"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Retry</span>
          </button>
        </div>
      )}

      {/* Architecture Explainer Card */}
      <div className="bg-[#0a0f1d] border border-slate-800 rounded-2xl p-5 space-y-3">
        <div className="flex items-center gap-2 text-sm font-semibold text-white">
          <Info className="w-4 h-4 text-blue-400" />
          <span>Escrow vs. Recipient Vault Distinction</span>
        </div>
        <p className="text-xs text-slate-400 leading-relaxed">
          In TrustLedger, the <strong>Escrow Contract</strong> functions as a transit vault that temporarily locks funds during project execution. Once a milestone is approved or refunded, funds are dispatched to independent <strong>Recipient Vaults</strong>. This prevents honeypot accumulation in the escrow contract and ensures non-custodial sovereignty for both freelancer and client.
        </p>
        <div className="pt-1 flex flex-wrap items-center gap-4 text-xs font-mono">
          <span className="text-slate-400">Total Settled in Recipient Vaults:</span>
          <span className="text-emerald-400 font-bold">
            {formatWeiRaw(totalVaultHoldings)} ({formatWeiToGen(totalVaultHoldings)})
          </span>
        </div>
      </div>

      {/* Vaults Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {vaultItems.map((item, idx) => (
          <div
            key={idx}
            className="bg-[#0a0f1d] border border-slate-800 rounded-2xl p-5 space-y-4 flex flex-col justify-between"
          >
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span
                  className={`px-2.5 py-0.5 rounded-full text-[10px] font-semibold border ${
                    item.category === 'Recipient Vault'
                      ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                      : 'bg-blue-500/10 text-blue-400 border-blue-500/30'
                  }`}
                >
                  {item.category}
                </span>
                <span className="text-[11px] font-medium text-slate-400">{item.role}</span>
              </div>

              <div>
                <h3 className="text-base font-bold text-white">{item.name}</h3>
                <p className="text-xs text-slate-400 mt-1 leading-relaxed">{item.description}</p>
              </div>

              <div className="pt-2">
                <span className="text-[10px] text-slate-500 block mb-0.5 uppercase tracking-wider font-semibold">
                  Live StudioNet On-Chain Balance
                </span>
                <div className="flex items-baseline gap-2">
                  <span className="text-2xl font-bold font-mono text-white">
                    {item.balanceWei !== null ? formatWeiRaw(item.balanceWei) : '---'}
                  </span>
                  <span className="text-xs text-slate-400 font-mono">
                    {item.balanceWei !== null ? `(${formatWeiToGen(item.balanceWei)})` : ''}
                  </span>
                </div>
              </div>
            </div>

            <div className="pt-3 border-t border-slate-800/80 space-y-2 text-xs">
              <div className="flex items-center justify-between">
                <span className="text-slate-400">Contract Address</span>
                <button
                  onClick={() => copyToClipboard(item.address, item.name)}
                  className="font-mono text-blue-400 hover:text-blue-300 flex items-center gap-1"
                  title="Copy Address"
                >
                  <span>{shortenAddress(item.address, 4)}</span>
                  <Copy className="w-3 h-3" />
                </button>
              </div>

              <div className="flex items-center justify-between">
                <span className="text-slate-400">Settlement Status</span>
                <span className="text-slate-200 font-medium">{item.status}</span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
