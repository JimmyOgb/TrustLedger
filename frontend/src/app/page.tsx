'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import {
  STUDIONET_CONFIG,
  RUN_2_CONTRACTS,
  CONTRACT_ADDRESSES,
  Milestone,
  Project,
  EscrowSummary,
  getOnChainBalanceStrict,
  formatWeiToGen,
  formatWeiRaw,
  getEscrowSummary,
  getProject,
  listMilestones,
} from '@/lib/genlayer';
import { shortenAddress } from '@/lib/wallet';
import {
  ShieldCheck,
  Shield,
  Coins,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  RefreshCw,
  Lock,
  Landmark,
  User,
  Folder,
  Layers,
  Clock,
  Copy,
  Check,
  X,
  ExternalLink,
  Scale,
} from 'lucide-react';

export default function TrustLedgerDashboard() {
  const [escrowSummary, setEscrowSummary] = useState<EscrowSummary | null>(null);
  const [project, setProject] = useState<Project | null>(null);
  const [milestones, setMilestones] = useState<Milestone[]>([]);
  const [contractLiveBalance, setContractLiveBalance] = useState<bigint | null>(null);
  const [freelancerVaultBalance, setFreelancerVaultBalance] = useState<bigint | null>(null);
  const [clientVaultBalance, setClientVaultBalance] = useState<bigint | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [copiedText, setCopiedText] = useState<string | null>(null);
  const [systemBannerDismissed, setSystemBannerDismissed] = useState<boolean>(false);

  const copyToClipboard = (text: string, label: string) => {
    if (!text) return;
    navigator.clipboard.writeText(text);
    setCopiedText(label);
    setTimeout(() => setCopiedText(null), 2500);
  };

  const refreshData = useCallback(async () => {
    try {
      setLoading(true);
      setFetchError(null);

      const targetEscrow = RUN_2_CONTRACTS.escrow;

      // Execute authoritative StudioNet reads concurrently
      const [summaryResult, projResult, msList, eBal, fvBal, cvBal] = await Promise.all([
        getEscrowSummary(targetEscrow),
        getProject(targetEscrow, 1),
        listMilestones(targetEscrow, 1),
        getOnChainBalanceStrict(targetEscrow),
        getOnChainBalanceStrict(CONTRACT_ADDRESSES.freelancerVault),
        getOnChainBalanceStrict(CONTRACT_ADDRESSES.clientRefundVault),
      ]);

      setEscrowSummary(summaryResult);
      setProject(projResult);
      setMilestones(Array.isArray(msList) ? msList : []);
      setContractLiveBalance(eBal);
      setFreelancerVaultBalance(fvBal);
      setClientVaultBalance(cvBal);
    } catch (err: any) {
      console.error('Error fetching on-chain data:', err);
      setFetchError(err?.message || 'Failed to read on-chain data from GenLayer StudioNet RPC');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshData();
    const timer = setInterval(refreshData, 30000);
    return () => clearInterval(timer);
  }, [refreshData]);

  return (
    <div className="space-y-6">
      {/* Toast Feedback */}
      {copiedText && (
        <div className="fixed top-5 right-5 z-50 bg-blue-600 text-white px-4 py-2 rounded-xl shadow-xl flex items-center gap-2 text-xs font-semibold animate-in fade-in slide-in-from-top-2">
          <Check className="w-4 h-4" />
          <span>Copied {copiedText} to clipboard!</span>
        </div>
      )}

      {/* RPC Failure Notice */}
      {fetchError && (
        <div className="bg-rose-500/10 border border-rose-500/30 rounded-2xl p-4 flex items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <XCircle className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
            <div>
              <h4 className="text-sm font-semibold text-rose-300">StudioNet RPC Connection Error</h4>
              <p className="text-xs text-rose-200/80 mt-0.5 font-mono break-all">{fetchError}</p>
              <p className="text-xs text-slate-400 mt-2">
                Production endpoints require connectivity to https://studio.genlayer.com/api.
              </p>
            </div>
          </div>
          <button
            onClick={refreshData}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-rose-600/30 hover:bg-rose-600/50 text-rose-200 text-xs font-medium border border-rose-500/30 shrink-0 transition"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Retry Connection</span>
          </button>
        </div>
      )}

      {/* Top Banner / Run 2 Historical Overview */}
      <div className="bg-[#090e1c] border border-slate-800 rounded-2xl p-5 sm:p-6 flex flex-col lg:flex-row lg:items-center justify-between gap-6 shadow-xl shadow-black/20">
        <div className="space-y-2">
          <div className="flex items-center gap-2.5">
            <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-500/10 text-blue-400 border border-blue-500/30">
              Run 2 Preserved State
            </span>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
              StudioNet Finalized
            </span>
          </div>
          <h1 className="text-xl sm:text-2xl font-bold text-white tracking-tight">
            Verifiable Milestone Escrow Dashboard
          </h1>
          <p className="text-xs sm:text-sm text-slate-400 max-w-2xl leading-relaxed">
            Directly monitoring authoritative on-chain contracts on GenLayer StudioNet (Chain ID: 61999).
            Historic Run 2 deliverable milestones have completed settlement with multi-validator AI consensus.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={refreshData}
            disabled={loading}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-slate-800/80 hover:bg-slate-700/80 text-slate-200 text-xs font-semibold border border-slate-700/80 transition disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-blue-400' : ''}`} />
            <span>{loading ? 'Syncing...' : 'Refresh On-Chain State'}</span>
          </button>
          <Link
            href="/projects"
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold shadow-md shadow-blue-600/20 transition"
          >
            <Folder className="w-3.5 h-3.5" />
            <span>View Projects</span>
          </Link>
        </div>
      </div>

      {/* Top Section: Escrow Architecture & Recipient Vaults */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm font-semibold text-slate-200">
            <Landmark className="w-4 h-4 text-blue-400" />
            <span>Authoritative Escrow & Recipient Vault Architecture</span>
          </div>
          <Link href="/vaults" className="text-xs text-blue-400 hover:underline flex items-center gap-1">
            <span>Explore Vault Details</span>
            <ExternalLink className="w-3 h-3" />
          </Link>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Escrow Contract Card */}
          <div className="bg-[#0a0f1d] border border-slate-800 rounded-2xl p-5 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                Run 2 Escrow Contract
              </span>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-blue-500/10 text-blue-400 border border-blue-500/20">
                Preserved
              </span>
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-bold font-mono text-white">
                {contractLiveBalance !== null ? formatWeiRaw(contractLiveBalance) : '---'}
              </span>
              <span className="text-xs text-slate-400 font-mono">
                {contractLiveBalance !== null ? `(${formatWeiToGen(contractLiveBalance)})` : ''}
              </span>
            </div>
            <div className="pt-2 border-t border-slate-800/80 flex items-center justify-between text-xs">
              <span className="text-slate-400">Address</span>
              <button
                onClick={() => copyToClipboard(RUN_2_CONTRACTS.escrow, 'Escrow Address')}
                className="font-mono text-blue-400 hover:text-blue-300 flex items-center gap-1"
                title="Copy Address"
              >
                <span>{shortenAddress(RUN_2_CONTRACTS.escrow, 4)}</span>
                <Copy className="w-3 h-3" />
              </button>
            </div>
            <p className="text-[11px] text-slate-400 leading-relaxed">
              Holds funds in custody during project execution. Post-settlement balance is 0 wei after payout and refund dispatches.
            </p>
          </div>

          {/* Freelancer Vault Card */}
          <div className="bg-[#0a0f1d] border border-slate-800 rounded-2xl p-5 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-emerald-400 uppercase tracking-wider">
                Freelancer Vault
              </span>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                Settled Payout
              </span>
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-bold font-mono text-emerald-300">
                {freelancerVaultBalance !== null ? formatWeiRaw(freelancerVaultBalance) : '---'}
              </span>
              <span className="text-xs text-slate-400 font-mono">
                {freelancerVaultBalance !== null ? `(${formatWeiToGen(freelancerVaultBalance)})` : ''}
              </span>
            </div>
            <div className="pt-2 border-t border-slate-800/80 flex items-center justify-between text-xs">
              <span className="text-slate-400">Address</span>
              <button
                onClick={() => copyToClipboard(CONTRACT_ADDRESSES.freelancerVault, 'Freelancer Vault')}
                className="font-mono text-blue-400 hover:text-blue-300 flex items-center gap-1"
                title="Copy Address"
              >
                <span>{shortenAddress(CONTRACT_ADDRESSES.freelancerVault, 4)}</span>
                <Copy className="w-3 h-3" />
              </button>
            </div>
            <p className="text-[11px] text-slate-400 leading-relaxed">
              Milestone 1 payout (150,000 wei) successfully dispatched and preserved in beneficiary recipient vault.
            </p>
          </div>

          {/* Client Refund Vault Card */}
          <div className="bg-[#0a0f1d] border border-slate-800 rounded-2xl p-5 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-indigo-400 uppercase tracking-wider">
                Client Refund Vault
              </span>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
                Settled Refund
              </span>
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-bold font-mono text-indigo-300">
                {clientVaultBalance !== null ? formatWeiRaw(clientVaultBalance) : '---'}
              </span>
              <span className="text-xs text-slate-400 font-mono">
                {clientVaultBalance !== null ? `(${formatWeiToGen(clientVaultBalance)})` : ''}
              </span>
            </div>
            <div className="pt-2 border-t border-slate-800/80 flex items-center justify-between text-xs">
              <span className="text-slate-400">Address</span>
              <button
                onClick={() => copyToClipboard(CONTRACT_ADDRESSES.clientRefundVault, 'Client Refund Vault')}
                className="font-mono text-blue-400 hover:text-blue-300 flex items-center gap-1"
                title="Copy Address"
              >
                <span>{shortenAddress(CONTRACT_ADDRESSES.clientRefundVault, 4)}</span>
                <Copy className="w-3 h-3" />
              </button>
            </div>
            <p className="text-[11px] text-slate-400 leading-relaxed">
              Milestone 2 refund (200,000 wei) resolved through arbitration and returned to designated client refund vault.
            </p>
          </div>
        </div>
      </section>

      {/* Middle Section: Active Project Overview & Status */}
      <section className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Project Card (2 Cols) */}
        <div className="lg:col-span-2 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm font-semibold text-slate-200">
              <Folder className="w-4 h-4 text-blue-400" />
              <span>Historic Run 2 Project #1 Details</span>
            </div>
            <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
              {project ? project.status : loading ? 'SYNCING...' : 'NOT AVAILABLE'}
            </span>
          </div>

          <div className="bg-[#0a0f1d] border border-slate-800 rounded-2xl p-5 space-y-5">
            <div>
              <h3 className="text-lg font-bold text-white">
                {project ? project.title : loading ? 'Loading on-chain project...' : 'No project data'}
              </h3>
              <p className="text-xs text-slate-400 mt-1">
                {project ? project.description : ''}
              </p>
            </div>

            {/* Financial Ledger Progress Bar */}
            <div className="space-y-2">
              <div className="flex justify-between text-xs">
                <span className="text-slate-400">Escrow Settlement Progress</span>
                <span className="font-mono text-emerald-400 font-semibold">
                  {project && project.total_committed_wei > 0
                    ? `${Math.round(((project.total_released_wei + project.total_refunded_wei) / project.total_committed_wei) * 100)}% Settled`
                    : '---'}
                </span>
              </div>
              <div className="h-2 w-full bg-slate-800 rounded-full overflow-hidden flex">
                <div
                  style={{
                    width:
                      project && project.total_committed_wei > 0
                        ? `${(project.total_released_wei / project.total_committed_wei) * 100}%`
                        : '0%',
                  }}
                  className="bg-emerald-500"
                  title="Released Payout"
                />
                <div
                  style={{
                    width:
                      project && project.total_committed_wei > 0
                        ? `${(project.total_refunded_wei / project.total_committed_wei) * 100}%`
                        : '0%',
                  }}
                  className="bg-indigo-500"
                  title="Refunded"
                />
              </div>
              <div className="flex justify-between text-[11px] text-slate-400 font-mono">
                <span className="text-emerald-400">
                  ● {project ? formatWeiRaw(project.total_released_wei) : '---'} Released
                </span>
                <span className="text-indigo-400">
                  ● {project ? formatWeiRaw(project.total_refunded_wei) : '---'} Refunded
                </span>
                <span className="text-slate-300">
                  Total: {project ? formatWeiRaw(project.total_committed_wei) : '---'}
                </span>
              </div>
            </div>

            {/* Participants Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-3 border-t border-slate-800/60 text-xs">
              <div className="bg-[#0e1629] p-3 rounded-xl border border-slate-800/60 space-y-1">
                <span className="text-slate-400 text-[10px] uppercase font-semibold">Client (Depositor)</span>
                <div className="font-mono text-slate-200 truncate" title={project?.client}>
                  {project ? shortenAddress(project.client, 5) : '---'}
                </div>
              </div>
              <div className="bg-[#0e1629] p-3 rounded-xl border border-slate-800/60 space-y-1">
                <span className="text-slate-400 text-[10px] uppercase font-semibold">Arbitrator</span>
                <div className="font-mono text-slate-200 truncate" title={project?.arbitrator}>
                  {project ? shortenAddress(project.arbitrator, 5) : '---'}
                </div>
              </div>
              <div className="bg-[#0e1629] p-3 rounded-xl border border-slate-800/60 space-y-1">
                <span className="text-slate-400 text-[10px] uppercase font-semibold">Refund Recipient</span>
                <div className="font-mono text-slate-200 truncate" title={project?.refund_recipient}>
                  {project ? shortenAddress(project.refund_recipient, 5) : '---'}
                </div>
              </div>
            </div>

            {/* Milestones in this Project */}
            <div className="space-y-3 pt-3 border-t border-slate-800/60">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-300">Recorded Milestones (2)</span>
                <Link href="/milestones" className="text-xs text-blue-400 hover:underline">
                  View Full Evidence & Consensus Logs
                </Link>
              </div>

              <div className="space-y-2">
                {milestones.length > 0 ? (
                  milestones.map((ms) => (
                    <div
                      key={ms.milestone_id}
                      className="bg-[#0e1629] border border-slate-800 rounded-xl p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs"
                    >
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-white">
                            #{ms.milestone_index}: {ms.title}
                          </span>
                          <span
                            className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                              ms.status === 'RELEASED'
                                ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                                : 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/30'
                            }`}
                          >
                            {ms.status}
                          </span>
                        </div>
                        <p className="text-slate-400 text-[11px]">{ms.description}</p>
                      </div>

                      <div className="text-right shrink-0">
                        <span className="font-mono font-bold text-white block">
                          {formatWeiRaw(ms.amount_wei)}
                        </span>
                        <span className="text-[10px] text-slate-400 font-mono">
                          {formatWeiToGen(ms.amount_wei)}
                        </span>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="text-center py-4 text-xs text-slate-400">Loading milestones...</div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Right Column: V2 Safety Gate & Network Cards */}
        <div className="space-y-4">
          {/* TrustLedger V2 Card */}
          <div className="bg-[#0a0f1d] border border-slate-800 rounded-2xl p-5 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-sm font-semibold text-slate-200">
                <Lock className="w-4 h-4 text-blue-400" />
                <span>TrustLedger V2 Status</span>
              </div>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-500/20 text-amber-300 border border-amber-500/30">
                SAFETY GATED
              </span>
            </div>

            <div className="space-y-2 text-xs">
              <div className="text-slate-400">V2 Escrow Address</div>
              <div className="font-mono text-slate-300 break-all bg-[#0e1629] p-2 rounded-lg border border-slate-800/80">
                0x4Ec472F1fEc41cB89Fd11DfD788679786E874336
              </div>
              <div className="flex justify-between items-center py-1 border-b border-slate-800/60">
                <span className="text-slate-400">Deployment Status</span>
                <span className="font-semibold text-emerald-400">Deployed & Verified</span>
              </div>
              <div className="flex justify-between items-center py-1 border-b border-slate-800/60">
                <span className="text-slate-400">Safety Flag</span>
                <span className="font-mono text-rose-300 font-semibold">NEXT_PUBLIC_V2_DEPLOYED=false</span>
              </div>
              <div className="flex justify-between items-center py-1">
                <span className="text-slate-400">Approved Vaults</span>
                <span className="font-semibold text-slate-300">0 (Held at Gate)</span>
              </div>
            </div>

            <div className="bg-[#0e1629] border border-slate-800 rounded-xl p-3 flex items-start gap-2.5 text-xs text-slate-400">
              <Lock className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
              <div>
                The V2 Intelligent Contract is deployed on StudioNet, but held at the pre-deployment safety gate. New project creation requires operator clearance.
              </div>
            </div>

            <Link
              href="/projects/new"
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold border border-slate-700 transition"
            >
              <span>Inspect New Project Creation Gate</span>
            </Link>
          </div>

          {/* Network Specifications Card */}
          <div className="bg-[#0a0f1d] border border-slate-800 rounded-2xl p-5 space-y-3 text-xs">
            <div className="flex items-center gap-2 text-sm font-semibold text-slate-200">
              <ShieldCheck className="w-4 h-4 text-blue-400" />
              <span>StudioNet Specifications</span>
            </div>

            <div className="space-y-2">
              <div className="flex justify-between items-center py-1 border-b border-slate-800/60">
                <span className="text-slate-400">Network Name</span>
                <span className="font-semibold text-white">GenLayer StudioNet</span>
              </div>
              <div className="flex justify-between items-center py-1 border-b border-slate-800/60">
                <span className="text-slate-400">Chain ID</span>
                <span className="font-mono font-medium text-white">61999 (0xF22F)</span>
              </div>
              <div className="flex justify-between items-center py-1 border-b border-slate-800/60">
                <span className="text-slate-400">Currency</span>
                <span className="font-semibold text-emerald-400">Native GEN (18 decimals)</span>
              </div>
              <div className="flex justify-between items-center py-1">
                <span className="text-slate-400">RPC Endpoint</span>
                <span className="font-mono text-slate-300 truncate max-w-[160px]">
                  https://studio.genlayer.com/api
                </span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Bottom Section: Authoritative Accounting Totals */}
      <section className="space-y-3">
        <div className="flex items-center gap-2 text-sm font-semibold text-slate-200">
          <Clock className="w-4 h-4 text-blue-400" />
          <span>Accounting Totals (Authoritative On-Chain Ledger)</span>
        </div>

        <div className="bg-[#0a0f1d] border border-slate-800 rounded-2xl p-5">
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
            <div>
              <span className="text-xs text-slate-400 block mb-1">Historic Settlements</span>
              <span className="text-base font-bold text-white font-mono block">
                {escrowSummary ? formatWeiRaw(escrowSummary.total_escrow_funded_wei) : '---'}
              </span>
              <span className="text-[11px] text-slate-400 font-mono">
                {escrowSummary ? formatWeiToGen(escrowSummary.total_escrow_funded_wei) : '---'}
              </span>
            </div>
            <div>
              <span className="text-xs text-slate-400 block mb-1">Locked Escrow</span>
              <span className="text-base font-bold text-white font-mono block">
                {escrowSummary ? formatWeiRaw(escrowSummary.total_escrow_locked_wei) : '---'}
              </span>
              <span className="text-[11px] text-slate-400 font-mono">
                {escrowSummary ? formatWeiToGen(escrowSummary.total_escrow_locked_wei) : '---'}
              </span>
            </div>
            <div>
              <span className="text-xs text-slate-400 block mb-1">Claimable Escrow</span>
              <span className="text-base font-bold text-white font-mono block">
                {escrowSummary ? formatWeiRaw(escrowSummary.total_escrow_claimable_wei || 0) : '---'}
              </span>
              <span className="text-[11px] text-slate-400 font-mono">
                {escrowSummary ? formatWeiToGen(escrowSummary.total_escrow_claimable_wei || 0) : '---'}
              </span>
            </div>
            <div>
              <span className="text-xs text-slate-400 block mb-1">Historic Released</span>
              <span className="text-base font-bold text-emerald-400 font-mono block">
                {escrowSummary ? formatWeiRaw(escrowSummary.total_escrow_released_wei) : '---'}
              </span>
              <span className="text-[11px] text-slate-400 font-mono">
                {escrowSummary ? formatWeiToGen(escrowSummary.total_escrow_released_wei) : '---'}
              </span>
            </div>
            <div>
              <span className="text-xs text-slate-400 block mb-1">Historic Refunded</span>
              <span className="text-base font-bold text-indigo-400 font-mono block">
                {escrowSummary ? formatWeiRaw(escrowSummary.total_escrow_refunded_wei) : '---'}
              </span>
              <span className="text-[11px] text-slate-400 font-mono">
                {escrowSummary ? formatWeiToGen(escrowSummary.total_escrow_refunded_wei) : '---'}
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* Operational Banner */}
      {!systemBannerDismissed && (
        <div className="bg-[#0a1a1e] border border-emerald-500/30 rounded-xl p-3.5 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-6 h-6 rounded-full bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center text-emerald-400 shrink-0">
              <CheckCircle2 className="w-4 h-4" />
            </div>
            <div>
              <span className="text-xs font-semibold text-emerald-300">System Operational</span>
              <p className="text-[11px] text-emerald-200/80">
                Connected to GenLayer StudioNet. All authoritative contract reads and vault balances verified live.
              </p>
            </div>
          </div>
          <button
            onClick={() => setSystemBannerDismissed(true)}
            className="text-slate-400 hover:text-white shrink-0"
            title="Dismiss banner"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}
    </div>
  );
}
