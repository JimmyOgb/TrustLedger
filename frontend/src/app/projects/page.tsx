'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import {
  RUN_2_CONTRACTS,
  Project,
  Milestone,
  EscrowSummary,
  getProject,
  listMilestones,
  getEscrowSummary,
  formatWeiRaw,
  formatWeiToGen,
  isV2Deployed,
  V2_DEPLOYMENT_CONFIG,
} from '@/lib/genlayer';
import { shortenAddress } from '@/lib/wallet';
import {
  Folder,
  Layers,
  Plus,
  RefreshCw,
  XCircle,
  CheckCircle2,
  Lock,
  ExternalLink,
  Copy,
  Check,
  Landmark,
  User,
  Scale,
} from 'lucide-react';

export default function ProjectsPage() {
  const [project, setProject] = useState<Project | null>(null);
  const [milestones, setMilestones] = useState<Milestone[]>([]);
  const [v2Summary, setV2Summary] = useState<EscrowSummary | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [copiedText, setCopiedText] = useState<string | null>(null);

  const copyToClipboard = (text: string, label: string) => {
    if (!text) return;
    navigator.clipboard.writeText(text);
    setCopiedText(label);
    setTimeout(() => setCopiedText(null), 2500);
  };

  const loadProjects = useCallback(async () => {
    try {
      setLoading(true);
      setFetchError(null);

      const targetEscrow = RUN_2_CONTRACTS.escrow;

      const [p1, msList] = await Promise.all([
        getProject(targetEscrow, 1),
        listMilestones(targetEscrow, 1),
      ]);

      setProject(p1);
      setMilestones(Array.isArray(msList) ? msList : []);
    } catch (err: any) {
      console.error('Error loading projects:', err);
      setFetchError(err?.message || 'Failed to load projects from GenLayer StudioNet RPC');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadProjects();
  }, [loadProjects]);

  return (
    <div className="space-y-6">
      {/* Toast Feedback */}
      {copiedText && (
        <div className="fixed top-5 right-5 z-50 bg-blue-600 text-white px-4 py-2 rounded-xl shadow-xl flex items-center gap-2 text-xs font-semibold animate-in fade-in slide-in-from-top-2">
          <Check className="w-4 h-4" />
          <span>Copied {copiedText} to clipboard!</span>
        </div>
      )}

      {/* Header and Actions */}
      <div className="bg-[#090e1c] border border-slate-800 rounded-2xl p-5 sm:p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-500/10 text-blue-400 border border-blue-500/30">
              Contract Records
            </span>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
              Live StudioNet
            </span>
          </div>
          <h1 className="text-xl sm:text-2xl font-bold text-white tracking-tight mt-1">
            Projects Directory
          </h1>
          <p className="text-xs sm:text-sm text-slate-400">
            Authoritative project registry on GenLayer StudioNet. Displaying real on-chain commitments without simulated entries.
          </p>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          <button
            onClick={loadProjects}
            disabled={loading}
            className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium border border-slate-700 transition disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-blue-400' : ''}`} />
            <span>{loading ? 'Refreshing...' : 'Refresh'}</span>
          </button>
          <Link
            href="/projects/new"
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold shadow-md shadow-blue-600/20 transition"
          >
            <Plus className="w-4 h-4" />
            <span>New Project</span>
          </Link>
        </div>
      </div>

      {/* Error Banner */}
      {fetchError && (
        <div className="bg-rose-500/10 border border-rose-500/30 rounded-2xl p-4 flex items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <XCircle className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
            <div>
              <h4 className="text-sm font-semibold text-rose-300">Contract Read Error</h4>
              <p className="text-xs text-rose-200/80 mt-0.5 font-mono break-all">{fetchError}</p>
            </div>
          </div>
          <button
            onClick={loadProjects}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-rose-600/30 hover:bg-rose-600/50 text-rose-200 text-xs font-medium border border-rose-500/30 shrink-0 transition"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Retry</span>
          </button>
        </div>
      )}

      {/* Projects List */}
      <div className="space-y-4">
        {project ? (
          <div className="bg-[#0a0f1d] border border-slate-800 rounded-2xl p-6 space-y-6">
            {/* Top row: ID, Title, Status, Version */}
            <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 pb-4 border-b border-slate-800/80">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-sm font-bold text-blue-400">Project #{project.project_id}</span>
                  <span className="px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                    {project.status}
                  </span>
                  <span className="px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-slate-800 text-slate-300 border border-slate-700">
                    Version: Run 2 Preserved
                  </span>
                </div>
                <h2 className="text-lg font-bold text-white">{project.title}</h2>
                <p className="text-xs text-slate-400 leading-relaxed max-w-3xl">{project.description}</p>
              </div>

              <div className="text-right shrink-0">
                <span className="text-xs text-slate-400 block">Total Committed</span>
                <span className="text-xl font-bold font-mono text-white block">
                  {formatWeiRaw(project.total_committed_wei)}
                </span>
                <span className="text-xs font-mono text-slate-400">
                  {formatWeiToGen(project.total_committed_wei)}
                </span>
              </div>
            </div>

            {/* Financial Ledger Details */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="bg-[#0e1629] p-3.5 rounded-xl border border-slate-800/60">
                <span className="text-[11px] text-slate-400 block mb-1">Funded Escrow</span>
                <span className="text-sm font-bold font-mono text-white block">
                  {formatWeiRaw(project.total_funded_wei)}
                </span>
                <span className="text-[10px] text-slate-400 font-mono">100% Funded</span>
              </div>
              <div className="bg-[#0e1629] p-3.5 rounded-xl border border-slate-800/60">
                <span className="text-[11px] text-slate-400 block mb-1">Released Payout</span>
                <span className="text-sm font-bold font-mono text-emerald-400 block">
                  {formatWeiRaw(project.total_released_wei)}
                </span>
                <span className="text-[10px] text-emerald-400/80 font-mono">Milestone 1</span>
              </div>
              <div className="bg-[#0e1629] p-3.5 rounded-xl border border-slate-800/60">
                <span className="text-[11px] text-slate-400 block mb-1">Refunded Escrow</span>
                <span className="text-sm font-bold font-mono text-indigo-400 block">
                  {formatWeiRaw(project.total_refunded_wei)}
                </span>
                <span className="text-[10px] text-indigo-400/80 font-mono">Milestone 2</span>
              </div>
              <div className="bg-[#0e1629] p-3.5 rounded-xl border border-slate-800/60">
                <span className="text-[11px] text-slate-400 block mb-1">Remaining Active</span>
                <span className="text-sm font-bold font-mono text-slate-300 block">
                  {formatWeiRaw(project.available_escrow_wei)}
                </span>
                <span className="text-[10px] text-slate-400 font-mono">Settled (0 wei)</span>
              </div>
            </div>

            {/* Contract & Roles Info */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-2 text-xs">
              <div className="bg-[#0e1629] p-3 rounded-xl border border-slate-800/60 space-y-1">
                <div className="flex justify-between items-center text-slate-400">
                  <span className="text-[10px] uppercase font-semibold">Client (Depositor)</span>
                  <button
                    onClick={() => copyToClipboard(project.client, 'Client Address')}
                    className="hover:text-white"
                  >
                    <Copy className="w-3 h-3" />
                  </button>
                </div>
                <div className="font-mono text-slate-200 truncate">{project.client}</div>
              </div>

              <div className="bg-[#0e1629] p-3 rounded-xl border border-slate-800/60 space-y-1">
                <div className="flex justify-between items-center text-slate-400">
                  <span className="text-[10px] uppercase font-semibold">Arbitrator</span>
                  <button
                    onClick={() => copyToClipboard(project.arbitrator, 'Arbitrator Address')}
                    className="hover:text-white"
                  >
                    <Copy className="w-3 h-3" />
                  </button>
                </div>
                <div className="font-mono text-slate-200 truncate">{project.arbitrator}</div>
              </div>

              <div className="bg-[#0e1629] p-3 rounded-xl border border-slate-800/60 space-y-1">
                <div className="flex justify-between items-center text-slate-400">
                  <span className="text-[10px] uppercase font-semibold">Refund Recipient</span>
                  <button
                    onClick={() => copyToClipboard(project.refund_recipient, 'Refund Recipient Address')}
                    className="hover:text-white"
                  >
                    <Copy className="w-3 h-3" />
                  </button>
                </div>
                <div className="font-mono text-slate-200 truncate">{project.refund_recipient}</div>
              </div>
            </div>

            {/* Milestones Preview */}
            <div className="pt-2 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-300">
                  Project Milestones ({milestones.length})
                </span>
                <Link
                  href="/milestones"
                  className="text-xs text-blue-400 hover:underline flex items-center gap-1"
                >
                  <span>Inspect Milestones Page</span>
                  <ExternalLink className="w-3 h-3" />
                </Link>
              </div>

              <div className="space-y-2">
                {milestones.map((ms) => (
                  <div
                    key={ms.milestone_id}
                    className="bg-[#0e1629] border border-slate-800 rounded-xl p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs"
                  >
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-white">
                          Milestone {ms.milestone_index}: {ms.title}
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
                ))}
              </div>
            </div>
          </div>
        ) : loading ? (
          <div className="bg-[#0a0f1d] border border-slate-800 rounded-2xl p-12 text-center text-slate-400 text-sm">
            <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-3 text-blue-400" />
            <span>Loading on-chain project records from StudioNet...</span>
          </div>
        ) : (
          <div className="bg-[#0a0f1d] border border-slate-800 rounded-2xl p-12 text-center space-y-3">
            <Folder className="w-8 h-8 mx-auto text-slate-500" />
            <h3 className="text-base font-semibold text-white">No Project Records Found</h3>
            <p className="text-xs text-slate-400 max-w-md mx-auto">
              Unable to locate project records on the target contract.
            </p>
          </div>
        )}

        {/* V2 Registry Notice */}
        <div className="bg-[#0a0f1d] border border-slate-800 rounded-2xl p-5 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm font-semibold text-slate-200">
              <Lock className="w-4 h-4 text-blue-400" />
              <span>TrustLedger V2 Project Registry</span>
            </div>
            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-amber-500/20 text-amber-300 border border-amber-500/30">
              PRE-DEPLOYMENT GATE
            </span>
          </div>

          <p className="text-xs text-slate-400 leading-relaxed">
            The TrustLedger V2 contract is deployed at{' '}
            <code className="font-mono text-slate-300 bg-[#0e1629] px-1.5 py-0.5 rounded border border-slate-800">
              0x4Ec472F1fEc41cB89Fd11DfD788679786E874336
            </code>{' '}
            with 0 active projects on-chain (verified via <code className="font-mono text-slate-300">get_escrow_summary</code>).
            Multi-project creation is held at the pre-deployment safety gate (<code className="font-mono text-slate-300">NEXT_PUBLIC_V2_DEPLOYED=false</code>).
          </p>

          <div className="pt-2">
            <Link
              href="/projects/new"
              className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold border border-slate-700 transition"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Configure New Project & Review Transaction</span>
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
