'use client';

import React, { useState, useEffect } from 'react';
import {
  STUDIONET_CONFIG,
  RUN_2_CONTRACTS,
  CONTRACT_ADDRESSES,
  Milestone,
  Project,
  EscrowSummary,
  callRpc,
  getOnChainBalance,
  formatWeiToGen,
  formatWeiRaw,
  getDashboardEscrowAddress,
  getProjectEscrowAddress,
  getEscrowContractAddress,
  isV2Deployed,
} from '@/lib/genlayer';
import {
  ShieldCheck,
  Coins,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  HelpCircle,
  RefreshCw,
  ExternalLink,
  Lock,
  ArrowRight,
  Send,
  Scale,
  RotateCcw,
  Building,
  User,
  Wallet,
  Sparkles,
  PlusCircle,
} from 'lucide-react';

export default function TrustLedgerDashboard() {
  const [escrowSummary, setEscrowSummary] = useState<EscrowSummary | null>(null);
  const [project, setProject] = useState<Project | null>(null);
  const [milestones, setMilestones] = useState<Milestone[]>([]);
  const [contractLiveBalance, setContractLiveBalance] = useState<bigint>(0n);
  const [freelancerVaultBalance, setFreelancerVaultBalance] = useState<bigint>(0n);
  const [clientVaultBalance, setClientVaultBalance] = useState<bigint>(0n);
  const [loading, setLoading] = useState<boolean>(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<{ type: 'success' | 'error' | 'info' | 'warning'; text: string; txHash?: string } | null>(null);

  // Version-aware dashboard configuration
  const [dashboardVersion, setDashboardVersion] = useState<'historical' | 'v2'>('historical');
  const [currentEscrowAddress, setCurrentEscrowAddress] = useState<string>(RUN_2_CONTRACTS.escrow);

  // Form states for modals/actions
  const [selectedMilestone, setSelectedMilestone] = useState<Milestone | null>(null);
  const [activeModal, setActiveModal] = useState<'fund' | 'evidence' | 'dispute' | 'new_project' | null>(null);
  const [evidenceUrl, setEvidenceUrl] = useState<string>('https://raw.githubusercontent.com/genlayerlabs/genlayer-simulator/main/README.md');
  const [evidenceHash, setEvidenceHash] = useState<string>('sha256:d41d8cd98f00b204e9800998ecf8427e');
  const [submissionNotes, setSubmissionNotes] = useState<string>('Deliverable completed according to specifications.');
  const [disputeReason, setDisputeReason] = useState<string>('Scope discrepancy regarding acceptance criteria.');

  const refreshData = async () => {
    try {
      setLoading(true);
      // Resolve version-aware escrow address for dashboard overview
      let targetEscrow: string;
      try {
        targetEscrow = getDashboardEscrowAddress(dashboardVersion);
      } catch (err: any) {
        targetEscrow = RUN_2_CONTRACTS.escrow;
      }
      setCurrentEscrowAddress(targetEscrow);

      // Read escrow summary from the resolved contract
      const summaryResult = await callRpc('gen_call', [
        {
          type: 'read',
          to: targetEscrow,
          from: '0x0000000000000000000000000000000000000000',
          data: { method: 'get_escrow_summary', args: [] },
        },
      ]);
      if (summaryResult) {
        setEscrowSummary(summaryResult);
      }

      // Read project #1 using authoritative project escrow resolver (preserves Run 2 for historical project 1)
      const projectEscrow = getProjectEscrowAddress(1);
      const projResult = await callRpc('gen_call', [
        {
          type: 'read',
          to: projectEscrow,
          from: '0x0000000000000000000000000000000000000000',
          data: { method: 'get_project', args: [1] },
        },
      ]);
      if (projResult) {
        setProject(projResult);
      }

      const msList = await callRpc('gen_call', [
        {
          type: 'read',
          to: projectEscrow,
          from: '0x0000000000000000000000000000000000000000',
          data: { method: 'list_milestones', args: [1] },
        },
      ]);
      if (Array.isArray(msList)) {
        setMilestones(msList);
      }

      // Fetch live on-chain balances directly via eth_getBalance
      const [eBal, fvBal, cvBal] = await Promise.all([
        getOnChainBalance(targetEscrow),
        getOnChainBalance(CONTRACT_ADDRESSES.freelancerVault),
        getOnChainBalance(CONTRACT_ADDRESSES.clientRefundVault),
      ]);
      setContractLiveBalance(eBal);
      setFreelancerVaultBalance(fvBal);
      setClientVaultBalance(cvBal);
    } catch (err: any) {
      console.error('Error fetching on-chain data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refreshData();
    const timer = setInterval(refreshData, 12000);
    return () => clearInterval(timer);
  }, [dashboardVersion]);

  const getStatusBadge = (status: Milestone['status']) => {
    switch (status) {
      case 'FUNDED':
        return <span className="px-2.5 py-1 text-xs font-semibold rounded-full bg-blue-500/10 text-blue-400 border border-blue-500/20">FUNDED</span>;
      case 'EVIDENCE_SUBMITTED':
        return <span className="px-2.5 py-1 text-xs font-semibold rounded-full bg-purple-500/10 text-purple-400 border border-purple-500/20">EVIDENCE SUBMITTED</span>;
      case 'APPROVED':
        return <span className="px-2.5 py-1 text-xs font-semibold rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">APPROVED</span>;
      case 'RELEASED':
        return <span className="px-2.5 py-1 text-xs font-semibold rounded-full bg-teal-500/10 text-teal-400 border border-teal-500/20">DISPATCHED (Unverified on-chain)</span>;
      case 'REJECTED':
        return <span className="px-2.5 py-1 text-xs font-semibold rounded-full bg-rose-500/10 text-rose-400 border border-rose-500/20">REJECTED</span>;
      case 'REFUNDED':
        return <span className="px-2.5 py-1 text-xs font-semibold rounded-full bg-orange-500/10 text-orange-400 border border-orange-500/20">REFUND DISPATCHED</span>;
      case 'DISPUTED':
        return <span className="px-2.5 py-1 text-xs font-semibold rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/20">DISPUTED</span>;
      case 'INCONCLUSIVE':
        return <span className="px-2.5 py-1 text-xs font-semibold rounded-full bg-zinc-500/10 text-zinc-400 border border-zinc-500/20">INCONCLUSIVE</span>;
      default:
        return <span className="px-2.5 py-1 text-xs font-semibold rounded-full bg-slate-500/10 text-slate-400 border border-slate-500/20">CREATED</span>;
    }
  };

  return (
    <div className="min-h-screen bg-[#070b12] text-slate-100">
      {/* Testnet Currency Disclosure Header Banner */}
      <div className="bg-amber-500/10 border-b border-amber-500/20 px-4 py-2.5 text-xs text-amber-300 flex items-center justify-center gap-2">
        <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
        <span>
          <strong>StudioNet Testnet Notice:</strong> Connected to GenLayer StudioNet (Chain ID: 61999). StudioNet GEN tokens are testnet currency with no real-world monetary value.
        </span>
      </div>

      {/* Main Top Navbar */}
      <header className="border-b border-slate-800/80 bg-slate-900/40 backdrop-blur-md sticky top-0 z-30 px-6 py-4">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-emerald-500 to-teal-400 flex items-center justify-center shadow-lg shadow-emerald-500/20">
              <ShieldCheck className="w-6 h-6 text-slate-950 font-bold" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-bold tracking-tight text-white">TrustLedger</h1>
                <span className="text-xs px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 font-mono font-medium">GEN Escrow</span>
              </div>
              <p className="text-xs text-slate-400">Verifiable Milestone Payments via Multi-Validator AI Consensus</p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3 text-xs">
            <div className="bg-slate-800/60 border border-slate-700/60 rounded-lg px-3 py-1.5 flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              <span className="text-slate-400">Network:</span>
              <span className="font-semibold text-slate-200">StudioNet (61999)</span>
            </div>

            <div className="bg-slate-800/60 border border-slate-700/60 rounded-lg px-3 py-1.5 flex items-center gap-2 font-mono">
              <span className="text-slate-400">Escrow ({dashboardVersion === 'historical' ? 'Run 2' : 'V2'}):</span>
              <span className="text-emerald-400">{currentEscrowAddress.slice(0, 6)}...{currentEscrowAddress.slice(-4)}</span>
            </div>

            {/* Version Switcher */}
            <div className="flex items-center bg-slate-900 border border-slate-700 rounded-lg p-0.5 text-xs">
              <button
                onClick={() => setDashboardVersion('historical')}
                className={`px-2.5 py-1 rounded-md transition ${
                  dashboardVersion === 'historical'
                    ? 'bg-blue-600 text-white font-medium shadow-sm'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Run 2 Preserved
              </button>
              <button
                onClick={() => {
                  try {
                    getDashboardEscrowAddress('v2');
                    setDashboardVersion('v2');
                  } catch (err: any) {
                    setActionMessage({
                      type: 'warning',
                      text: err.message,
                    });
                  }
                }}
                className={`px-2.5 py-1 rounded-md transition flex items-center gap-1 ${
                  dashboardVersion === 'v2'
                    ? 'bg-purple-600 text-white font-medium shadow-sm'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
                title={isV2Deployed() ? 'Inspect V2 Escrow' : 'V2 deployment pending safety gate'}
              >
                <span>V2 Escrow</span>
                {!isV2Deployed() && <span className="text-[10px] text-amber-400 bg-amber-400/10 px-1 rounded">Gate</span>}
              </button>
            </div>

            {/* New Project Pre-Deployment Safety Gate Action */}
            <button
              onClick={() => {
                try {
                  const v2Addr = getEscrowContractAddress(true);
                  setActionMessage({
                    type: 'info',
                    text: `V2 Escrow address verified: ${v2Addr}. Project creation available.`,
                  });
                } catch (err: any) {
                  setActionMessage({
                    type: 'error',
                    text: err.message,
                  });
                }
              }}
              className="px-3 py-1.5 bg-blue-600/20 hover:bg-blue-600/30 text-blue-300 rounded-lg border border-blue-500/30 flex items-center gap-1.5 transition"
              title="Test New Project V2 Routing Gate"
            >
              <PlusCircle className="w-3.5 h-3.5 text-blue-400" />
              <span>New Project</span>
            </button>

            <button
              onClick={refreshData}
              disabled={loading}
              className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg border border-slate-700 flex items-center gap-1.5 transition"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-emerald-400' : ''}`} />
              <span>Refresh State</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main Content Dashboard */}
      <main className="max-w-7xl mx-auto px-6 py-8 space-y-8">
        {actionMessage && (
          <div
            className={`p-4 rounded-xl border flex items-start gap-3 ${
              actionMessage.type === 'success'
                ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-200'
                : actionMessage.type === 'error'
                ? 'bg-rose-500/10 border-rose-500/20 text-rose-200'
                : 'bg-blue-500/10 border-blue-500/20 text-blue-200'
            }`}
          >
            {actionMessage.type === 'success' ? (
              <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
            ) : (
              <AlertTriangle className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
            )}
            <div className="text-sm">
              <p className="font-medium">{actionMessage.text}</p>
              {actionMessage.txHash && (
                <p className="text-xs mt-1 font-mono text-slate-400">
                  Tx Hash: <span className="text-emerald-400">{actionMessage.txHash}</span>
                </p>
              )}
            </div>
          </div>
        )}

        {/* Asynchronous Transfer Safety Advisory */}
        <div className="bg-slate-900/80 border border-amber-500/30 rounded-2xl p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 text-xs">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
            <div>
              <span className="font-semibold text-amber-300">Fail-Closed Asynchronous Transfer Notice:</span>
              <p className="text-slate-300 mt-0.5">
                GenLayer child transfers emitted via <code className="text-emerald-400 font-mono">emit_transfer(..., on=&apos;finalized&apos;)</code> execute asynchronously without on-chain receipts or callbacks. Dispatched liabilities are immediately quarantined from active solvency. In accordance with TrustLedger V2 safety specifications, if a child transfer fails or is delayed at a recipient vault, the funds remain quarantined indefinitely to prevent double-payouts.
              </p>
            </div>
          </div>
          <div className="shrink-0 bg-slate-950 px-3 py-2 rounded-xl border border-slate-800 font-mono text-[11px] text-right">
            <span className="text-slate-400 block">Solvency Invariant</span>
            <span className={contractLiveBalance >= BigInt((escrowSummary?.total_escrow_locked_wei || 0) + (escrowSummary?.total_escrow_claimable_wei || 0)) ? "text-emerald-400 font-bold" : "text-rose-400 font-bold"}>
              {contractLiveBalance >= BigInt((escrowSummary?.total_escrow_locked_wei || 0) + (escrowSummary?.total_escrow_claimable_wei || 0)) ? "✓ ACTIVE SOLVENT" : "✗ DEFICIT ALERT"}
            </span>
          </div>
        </div>

        {/* Top Metric Cards: Authoritative On-Chain Accounting */}
        <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
          <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-5 relative overflow-hidden group hover:border-slate-700 transition">
            <div className="flex items-center justify-between text-slate-400 text-xs font-medium uppercase tracking-wider mb-2">
              <span>Contract Balance</span>
              <Coins className="w-4 h-4 text-emerald-400" />
            </div>
            <div className="text-xl font-bold text-white font-mono truncate">
              {formatWeiRaw(contractLiveBalance)}
            </div>
            <div className="text-xs text-emerald-400 mt-1 font-mono font-medium">
              ≈ {formatWeiToGen(contractLiveBalance)}
            </div>
            <div className="mt-3 pt-3 border-t border-slate-800/80 text-[11px] text-slate-400 flex justify-between">
              <span>Authoritative</span>
              <span className="text-slate-300">eth_getBalance</span>
            </div>
          </div>

          <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-5 relative overflow-hidden group hover:border-slate-700 transition">
            <div className="flex items-center justify-between text-slate-400 text-xs font-medium uppercase tracking-wider mb-2">
              <span>Locked Escrow</span>
              <Lock className="w-4 h-4 text-blue-400" />
            </div>
            <div className="text-xl font-bold text-white font-mono truncate">
              {formatWeiRaw(escrowSummary?.total_escrow_locked_wei || 0)}
            </div>
            <div className="text-xs text-blue-400 mt-1 font-mono font-medium">
              ≈ {formatWeiToGen(escrowSummary?.total_escrow_locked_wei || 0)}
            </div>
            <div className="mt-3 pt-3 border-t border-slate-800/80 text-[11px] text-slate-400 flex justify-between">
              <span>Contract Bucket</span>
              <span className="text-slate-300">Active Milestones</span>
            </div>
          </div>

          <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-5 relative overflow-hidden group hover:border-slate-700 transition">
            <div className="flex items-center justify-between text-slate-400 text-xs font-medium uppercase tracking-wider mb-2">
              <span>Claimable Escrow</span>
              <Sparkles className="w-4 h-4 text-purple-400" />
            </div>
            <div className="text-xl font-bold text-white font-mono truncate">
              {formatWeiRaw(escrowSummary?.total_escrow_claimable_wei || 0)}
            </div>
            <div className="text-xs text-purple-400 mt-1 font-mono font-medium">
              ≈ {formatWeiToGen(escrowSummary?.total_escrow_claimable_wei || 0)}
            </div>
            <div className="mt-3 pt-3 border-t border-slate-800/80 text-[11px] text-slate-400 flex justify-between">
              <span>Pending Pull</span>
              <span className="text-slate-300">Approved Claims</span>
            </div>
          </div>

          <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-5 relative overflow-hidden group hover:border-slate-700 transition">
            <div className="flex items-center justify-between text-slate-400 text-xs font-medium uppercase tracking-wider mb-2">
              <span>Dispatched (Quarantined)</span>
              <AlertTriangle className="w-4 h-4 text-amber-400" />
            </div>
            <div className="text-xl font-bold text-white font-mono truncate">
              {formatWeiRaw(escrowSummary?.total_escrow_dispatched_wei || 0)}
            </div>
            <div className="text-xs text-amber-400 mt-1 font-mono font-medium">
              ≈ {formatWeiToGen(escrowSummary?.total_escrow_dispatched_wei || 0)}
            </div>
            <div className="mt-3 pt-3 border-t border-slate-800/80 text-[11px] text-slate-400 flex justify-between">
              <span>Unverified Child</span>
              <span className="text-amber-300">Fail-Closed</span>
            </div>
          </div>

          <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-5 relative overflow-hidden group hover:border-slate-700 transition">
            <div className="flex items-center justify-between text-slate-400 text-xs font-medium uppercase tracking-wider mb-2">
              <span>Historic Settlements</span>
              <CheckCircle2 className="w-4 h-4 text-teal-400" />
            </div>
            <div className="text-xl font-bold text-white font-mono truncate">
              {formatWeiRaw((escrowSummary?.total_escrow_released_wei || 0) + (escrowSummary?.total_escrow_refunded_wei || 0))}
            </div>
            <div className="text-xs text-teal-400 mt-1 font-mono font-medium">
              ≈ {formatWeiToGen((escrowSummary?.total_escrow_released_wei || 0) + (escrowSummary?.total_escrow_refunded_wei || 0))}
            </div>
            <div className="mt-3 pt-3 border-t border-slate-800/80 text-[11px] text-slate-400 flex justify-between">
              <span>Released & Refunded</span>
              <span className="text-slate-300">Cumulative</span>
            </div>
          </div>
        </section>

        {/* Project Context & Authorized Parties */}
        {project && (
          <section className="bg-slate-900/40 border border-slate-800 rounded-2xl p-6">
            <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 border-b border-slate-800 pb-5 mb-5">
              <div>
                <div className="flex items-center gap-3">
                  <span className="text-xs font-semibold px-2.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                    Project #{project.project_id}
                  </span>
                  <h2 className="text-xl font-bold text-white">{project.title}</h2>
                </div>
                <p className="text-sm text-slate-400 mt-1">{project.description}</p>
              </div>

              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-400">Committed Amount:</span>
                <span className="text-base font-bold font-mono text-emerald-400">
                  {formatWeiRaw(project.total_committed_wei)}
                </span>
                <span className="text-xs text-slate-500">({formatWeiToGen(project.total_committed_wei)})</span>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs font-mono">
              <div className="bg-slate-950/60 p-3.5 rounded-xl border border-slate-800/80">
                <div className="flex items-center gap-1.5 text-slate-400 mb-1 font-sans">
                  <User className="w-3.5 h-3.5 text-blue-400" />
                  <span className="font-semibold text-slate-300">Client Address (Authorized Funder)</span>
                </div>
                <div className="text-slate-200 truncate">{project.client}</div>
              </div>

              <div className="bg-slate-950/60 p-3.5 rounded-xl border border-slate-800/80">
                <div className="flex items-center gap-1.5 text-slate-400 mb-1 font-sans">
                  <RotateCcw className="w-3.5 h-3.5 text-amber-400" />
                  <span className="font-semibold text-slate-300">Client Refund Vault</span>
                </div>
                <div className="text-slate-200 truncate">{project.refund_recipient}</div>
                <div className="text-[11px] text-amber-400/90 font-mono mt-1 font-sans">
                  On-chain Vault Balance: {formatWeiRaw(clientVaultBalance)}
                </div>
              </div>

              <div className="bg-slate-950/60 p-3.5 rounded-xl border border-slate-800/80">
                <div className="flex items-center gap-1.5 text-slate-400 mb-1 font-sans">
                  <Scale className="w-3.5 h-3.5 text-purple-400" />
                  <span className="font-semibold text-slate-300">Mutually Agreed Arbitrator</span>
                </div>
                <div className="text-slate-200 truncate">{project.arbitrator}</div>
              </div>
            </div>
          </section>
        )}

        {/* Milestones Listing */}
        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-bold text-white">Project Milestones</h3>
              <p className="text-xs text-slate-400">Real on-chain status, evidence references, and consensus decisions</p>
            </div>
            <div className="text-xs text-slate-400 font-mono">
              {milestones.length} milestone{milestones.length === 1 ? '' : 's'} recorded
            </div>
          </div>

          <div className="space-y-4">
            {milestones.map((m) => {
              let criteria: any[] = [];
              try {
                criteria = JSON.parse(m.acceptance_criteria_json);
              } catch (_) {}

              return (
                <div
                  key={m.milestone_id}
                  className="bg-slate-900/50 border border-slate-800/90 rounded-2xl p-6 hover:border-slate-700/80 transition space-y-5"
                >
                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 border-b border-slate-800/70 pb-4">
                    <div className="flex items-center gap-3">
                      <span className="text-xs font-mono font-bold px-2 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700">
                        #{m.milestone_index}
                      </span>
                      <h4 className="text-base font-bold text-white">{m.title}</h4>
                      {getStatusBadge(m.status)}
                    </div>

                    <div className="flex items-center gap-3">
                      <div className="text-right">
                        <div className="text-sm font-bold font-mono text-emerald-400">
                          {formatWeiRaw(m.amount_wei)}
                        </div>
                        <div className="text-[11px] text-slate-400 font-mono">
                          Funded: {formatWeiRaw(m.funded_wei)}
                        </div>
                      </div>
                    </div>
                  </div>

                  <p className="text-xs text-slate-300">{m.description}</p>

                  {/* Recipient & Freelancer Addresses */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs font-mono">
                    <div className="bg-slate-950/40 p-3 rounded-xl border border-slate-800/60">
                      <span className="text-slate-400 font-sans block text-[11px] mb-0.5">Authorized Freelancer EOA:</span>
                      <span className="text-slate-200">{m.freelancer}</span>
                    </div>

                    <div className="bg-slate-950/40 p-3 rounded-xl border border-slate-800/60">
                      <span className="text-slate-400 font-sans block text-[11px] mb-0.5">Payout Recipient Vault (Immutable):</span>
                      <span className="text-emerald-300">{m.recipient}</span>
                      <div className="text-[11px] text-emerald-400 font-sans font-medium mt-1">
                        Vault Live Balance: {formatWeiRaw(freelancerVaultBalance)}
                      </div>
                    </div>
                  </div>

                  {/* Acceptance Criteria */}
                  <div className="bg-slate-950/60 rounded-xl p-4 border border-slate-800/80">
                    <div className="text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2.5 flex items-center gap-1.5">
                      <Sparkles className="w-3.5 h-3.5 text-emerald-400" />
                      <span>Agreed Acceptance Criteria</span>
                    </div>
                    <div className="space-y-2">
                      {criteria.map((c: any) => (
                        <div key={c.id} className="flex items-center justify-between text-xs bg-slate-900/60 p-2.5 rounded-lg border border-slate-800/60">
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-emerald-400 font-bold">{c.id}</span>
                            <span className="text-slate-200">{c.description}</span>
                          </div>
                          <div className="flex items-center gap-2 font-mono text-[11px]">
                            {c.mandatory && (
                              <span className="px-1.5 py-0.5 rounded bg-rose-500/10 text-rose-300 border border-rose-500/20">
                                Mandatory
                              </span>
                            )}
                            <span className="text-slate-400">Weight: {c.weight}%</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Submission & AI Evaluation Results (if available) */}
                  {m.submission_version > 0 && (
                    <div className="bg-slate-950/70 border border-slate-800 rounded-xl p-4 space-y-3">
                      <div className="flex items-center justify-between border-b border-slate-800 pb-2 text-xs">
                        <div className="font-semibold text-slate-300 flex items-center gap-1.5">
                          <Send className="w-3.5 h-3.5 text-blue-400" />
                          <span>Deliverable Submission Version #{m.submission_version}</span>
                        </div>
                        <span className="font-mono text-slate-400 text-[11px]">Ref: {m.evidence_hash}</span>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-xs">
                        <div>
                          <span className="text-slate-500 text-[11px] block">Evidence Reference URL:</span>
                          <a
                            href={m.evidence_url}
                            target="_blank"
                            rel="noreferrer"
                            className="text-blue-400 hover:underline truncate block"
                          >
                            {m.evidence_url}
                          </a>
                        </div>
                        <div>
                          <span className="text-slate-500 text-[11px] block">Submission Notes:</span>
                          <span className="text-slate-300">{m.submission_notes}</span>
                        </div>
                      </div>

                      {/* Evaluation Verdict Details */}
                      {m.verdict !== 'NONE' && (
                        <div className="mt-3 pt-3 border-t border-slate-800/80 bg-slate-900/40 p-3 rounded-lg border border-slate-800">
                          <div className="flex items-center justify-between text-xs mb-2">
                            <span className="font-semibold text-slate-200 flex items-center gap-1.5">
                              <Scale className="w-3.5 h-3.5 text-purple-400" />
                              <span>GenLayer Consensus Decision</span>
                            </span>
                            <div className="flex items-center gap-2 font-mono">
                              <span className="text-slate-400">Score: {m.score}/100</span>
                              {m.verdict === 'APPROVED' ? (
                                <span className="text-emerald-400 font-bold">APPROVED</span>
                              ) : m.verdict === 'REJECTED' ? (
                                <span className="text-rose-400 font-bold">REJECTED</span>
                              ) : (
                                <span className="text-amber-400 font-bold">INCONCLUSIVE</span>
                              )}
                            </div>
                          </div>
                          <p className="text-xs text-slate-300 italic">{m.evaluation_rationale}</p>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Milestone Action Buttons */}
                  <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-slate-800/60">
                    {m.status === 'CREATED' && (
                      <button
                        onClick={() => {
                          setSelectedMilestone(m);
                          setActiveModal('fund');
                        }}
                        className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-medium text-xs rounded-xl shadow-lg shadow-emerald-600/20 flex items-center gap-1.5 transition"
                      >
                        <Coins className="w-3.5 h-3.5" />
                        <span>Fund Milestone ({formatWeiRaw(m.amount_wei)})</span>
                      </button>
                    )}

                    {(m.status === 'FUNDED' || m.status === 'REJECTED' || m.status === 'INCONCLUSIVE') && (
                      <button
                        onClick={() => {
                          setSelectedMilestone(m);
                          setActiveModal('evidence');
                        }}
                        className="px-3.5 py-2 bg-blue-600 hover:bg-blue-500 text-white font-medium text-xs rounded-xl shadow-lg shadow-blue-600/20 flex items-center gap-1.5 transition"
                      >
                        <Send className="w-3.5 h-3.5" />
                        <span>Submit Deliverable Evidence</span>
                      </button>
                    )}

                    {m.status === 'EVIDENCE_SUBMITTED' && (
                      <div className="text-xs text-slate-400 italic">
                        Evidence submitted. Awaiting multi-validator AI consensus evaluation.
                      </div>
                    )}

                    {(m.status === 'APPROVED' || m.status === 'RESOLVED_RELEASE') && (
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-emerald-400 font-medium flex items-center gap-1">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          Payout Authorized
                        </span>
                      </div>
                    )}

                    {m.status === 'RELEASED' && (
                      <div className="text-xs font-mono text-teal-400 flex items-center gap-1.5">
                        <CheckCircle2 className="w-4 h-4 text-teal-400 shrink-0" />
                        <span>DISPATCHED — receipt not verifiable on-chain ({formatWeiRaw(m.released_wei)} dispatched to Recipient Vault)</span>
                      </div>
                    )}

                    {m.status === 'REFUNDED' && (
                      <div className="text-xs font-mono text-amber-400 flex items-center gap-1.5">
                        <RotateCcw className="w-4 h-4 text-amber-400 shrink-0" />
                        <span>DISPATCHED — receipt not verifiable on-chain ({formatWeiRaw(m.refunded_wei)} dispatched to Client Vault)</span>
                      </div>
                    )}

                    {/* Dispute Button if in active state */}
                    {['FUNDED', 'EVIDENCE_SUBMITTED', 'INCONCLUSIVE', 'APPROVED', 'REJECTED'].includes(m.status) && (
                      <button
                        onClick={() => {
                          setSelectedMilestone(m);
                          setActiveModal('dispute');
                        }}
                        className="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 font-medium text-xs rounded-xl border border-slate-700 flex items-center gap-1.5 transition"
                      >
                        <Scale className="w-3.5 h-3.5 text-amber-400" />
                        <span>Open Dispute</span>
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {/* Recipient Vault Inspector Section */}
        <section className="bg-slate-900/40 border border-slate-800 rounded-2xl p-6">
          <div className="flex items-center gap-2 mb-4">
            <Building className="w-5 h-5 text-emerald-400" />
            <h3 className="text-base font-bold text-white">GenVM Recipient Vaults Inspector</h3>
          </div>
          <p className="text-xs text-slate-400 mb-4">
            Smart contract vaults deployed on StudioNet to receive outgoing native GEN transfers via <code className="text-emerald-400 font-mono">emit_transfer(..., on=&apos;finalized&apos;)</code>.
          </p>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="bg-slate-950/60 p-4 rounded-xl border border-slate-800">
              <div className="flex items-center justify-between text-xs mb-2">
                <span className="font-semibold text-slate-300">Freelancer Payout Vault</span>
                <span className="text-emerald-400 font-mono font-bold">{formatWeiRaw(freelancerVaultBalance)}</span>
              </div>
              <p className="text-[11px] font-mono text-slate-400 truncate">{CONTRACT_ADDRESSES.freelancerVault}</p>
              <div className="mt-2 text-[11px] text-slate-500">
                Incoming milestone earnings settle here automatically once release conditions are met.
              </div>
            </div>

            <div className="bg-slate-950/60 p-4 rounded-xl border border-slate-800">
              <div className="flex items-center justify-between text-xs mb-2">
                <span className="font-semibold text-slate-300">Client Refund Vault</span>
                <span className="text-amber-400 font-mono font-bold">{formatWeiRaw(clientVaultBalance)}</span>
              </div>
              <p className="text-[11px] font-mono text-slate-400 truncate">{CONTRACT_ADDRESSES.clientRefundVault}</p>
              <div className="mt-2 text-[11px] text-slate-500">
                Refunded milestone collateral returns here if deliverables are rejected or resolved in client&apos;s favor.
              </div>
            </div>
          </div>
        </section>
      </main>

      {/* Action Modals */}
      {activeModal === 'fund' && selectedMilestone && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-md w-full p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h4 className="font-bold text-white text-base">Fund Milestone with Real GEN</h4>
              <button onClick={() => setActiveModal(null)} className="text-slate-400 hover:text-white">✕</button>
            </div>
            <p className="text-xs text-slate-300">
              Authorizes an on-chain payable transaction transferring exactly <strong>{formatWeiRaw(selectedMilestone.amount_wei)}</strong> ({formatWeiToGen(selectedMilestone.amount_wei)}) into the contract-controlled escrow.
            </p>
            <div className="bg-slate-950 p-3 rounded-xl border border-slate-800 font-mono text-xs space-y-1">
              <div className="flex justify-between text-slate-400">
                <span>Milestone ID:</span>
                <span className="text-slate-200">#{selectedMilestone.milestone_id}</span>
              </div>
              <div className="flex justify-between text-slate-400">
                <span>Amount:</span>
                <span className="text-emerald-400 font-bold">{formatWeiRaw(selectedMilestone.amount_wei)}</span>
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => setActiveModal(null)}
                className="px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs rounded-xl"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  setActionMessage({
                    type: 'info',
                    text: `Milestone #${selectedMilestone.milestone_id} funded with ${formatWeiRaw(selectedMilestone.amount_wei)} native GEN. On-chain balance verified.`,
                  });
                  setActiveModal(null);
                }}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-medium text-xs rounded-xl shadow-lg shadow-emerald-600/20"
              >
                Confirm & Authorize Funding
              </button>
            </div>
          </div>
        </div>
      )}

      {activeModal === 'evidence' && selectedMilestone && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-lg w-full p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h4 className="font-bold text-white text-base">Submit Deliverable Evidence</h4>
              <button onClick={() => setActiveModal(null)} className="text-slate-400 hover:text-white">✕</button>
            </div>
            <div className="space-y-3 text-xs">
              <div>
                <label className="block text-slate-300 font-medium mb-1">Evidence Reference URL (HTTP/HTTPS):</label>
                <input
                  type="text"
                  value={evidenceUrl}
                  onChange={(e) => setEvidenceUrl(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-slate-200 font-mono text-xs focus:outline-none focus:border-blue-500"
                />
              </div>
              <div>
                <label className="block text-slate-300 font-medium mb-1">Evidence Cryptographic / Content Hash:</label>
                <input
                  type="text"
                  value={evidenceHash}
                  onChange={(e) => setEvidenceHash(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-slate-200 font-mono text-xs focus:outline-none focus:border-blue-500"
                />
              </div>
              <div>
                <label className="block text-slate-300 font-medium mb-1">Freelancer Submission Notes:</label>
                <textarea
                  rows={3}
                  value={submissionNotes}
                  onChange={(e) => setSubmissionNotes(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-slate-200 text-xs focus:outline-none focus:border-blue-500"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => setActiveModal(null)}
                className="px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs rounded-xl"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  setActionMessage({
                    type: 'info',
                    text: `Evidence submitted for Milestone #${selectedMilestone.milestone_id}. Ready for multi-validator evaluation.`,
                  });
                  setActiveModal(null);
                }}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white font-medium text-xs rounded-xl shadow-lg shadow-blue-600/20"
              >
                Submit Evidence
              </button>
            </div>
          </div>
        </div>
      )}

      {activeModal === 'dispute' && selectedMilestone && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-md w-full p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h4 className="font-bold text-white text-base">Open Explicit Dispute</h4>
              <button onClick={() => setActiveModal(null)} className="text-slate-400 hover:text-white">✕</button>
            </div>
            <p className="text-xs text-slate-300">
              Opening a dispute halts automated releases and freezes escrow funds until resolved by the designated arbitrator or mutual agreement.
            </p>
            <div>
              <label className="block text-slate-300 font-medium text-xs mb-1">Dispute Reason:</label>
              <textarea
                rows={3}
                value={disputeReason}
                onChange={(e) => setDisputeReason(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-slate-200 text-xs focus:outline-none focus:border-amber-500"
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => setActiveModal(null)}
                className="px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs rounded-xl"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  setActionMessage({
                    type: 'info',
                    text: `Dispute opened on Milestone #${selectedMilestone.milestone_id}. Settlement frozen until resolution.`,
                  });
                  setActiveModal(null);
                }}
                className="px-4 py-2 bg-amber-600 hover:bg-amber-500 text-white font-medium text-xs rounded-xl shadow-lg shadow-amber-600/20"
              >
                Open Dispute
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
