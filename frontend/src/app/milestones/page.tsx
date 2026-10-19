'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import {
  RUN_2_CONTRACTS,
  Milestone,
  listMilestones,
  formatWeiRaw,
  formatWeiToGen,
} from '@/lib/genlayer';
import { shortenAddress } from '@/lib/wallet';
import {
  Layers,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  XCircle,
  ExternalLink,
  Copy,
  Check,
  Scale,
  FileCheck,
  ShieldAlert,
  Info,
} from 'lucide-react';

export default function MilestonesPage() {
  const [milestones, setMilestones] = useState<Milestone[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [copiedText, setCopiedText] = useState<string | null>(null);

  const copyToClipboard = (text: string, label: string) => {
    if (!text) return;
    navigator.clipboard.writeText(text);
    setCopiedText(label);
    setTimeout(() => setCopiedText(null), 2500);
  };

  const loadMilestones = useCallback(async () => {
    try {
      setLoading(true);
      setFetchError(null);

      const targetEscrow = RUN_2_CONTRACTS.escrow;
      const msList = await listMilestones(targetEscrow, 1);
      setMilestones(Array.isArray(msList) ? msList : []);
    } catch (err: any) {
      console.error('Error loading milestones:', err);
      setFetchError(err?.message || 'Failed to load milestones from StudioNet RPC');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadMilestones();
  }, [loadMilestones]);

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
              Preserved Run 2 Project #1
            </span>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
              Authoritative Consensus
            </span>
          </div>
          <h1 className="text-xl sm:text-2xl font-bold text-white tracking-tight mt-1">
            Milestones & Deliverable Evaluation
          </h1>
          <p className="text-xs sm:text-sm text-slate-400">
            Authoritative milestone records, submitted deliverable evidence, validator consensus verdicts, and arbitrator settlements.
          </p>
        </div>

        <button
          onClick={loadMilestones}
          disabled={loading}
          className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium border border-slate-700 transition disabled:opacity-50 self-start sm:self-auto"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-blue-400' : ''}`} />
          <span>{loading ? 'Refreshing...' : 'Refresh Records'}</span>
        </button>
      </div>

      {/* RPC Error Notice */}
      {fetchError && (
        <div className="bg-rose-500/10 border border-rose-500/30 rounded-2xl p-4 flex items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <XCircle className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
            <div>
              <h4 className="text-sm font-semibold text-rose-300">Milestone Read Error</h4>
              <p className="text-xs text-rose-200/80 mt-0.5 font-mono break-all">{fetchError}</p>
            </div>
          </div>
          <button
            onClick={loadMilestones}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-rose-600/30 hover:bg-rose-600/50 text-rose-200 text-xs font-medium border border-rose-500/30 shrink-0 transition"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Retry</span>
          </button>
        </div>
      )}

      {/* Non-simulated Policy Banner */}
      <div className="bg-[#0e1629] border border-slate-800 rounded-xl p-3.5 flex items-start gap-2.5 text-xs text-slate-400">
        <Info className="w-4 h-4 text-blue-400 shrink-0 mt-0.5" />
        <div>
          <strong>Authoritative On-Chain State:</strong> All milestones displayed are real historical records on GenLayer StudioNet. In accordance with platform integrity rules, no simulated action buttons (e.g. fake Submit Evidence, Release, or Dispute buttons) are presented when no real transaction can occur.
        </div>
      </div>

      {/* Milestones Cards */}
      <div className="space-y-6">
        {milestones.length > 0 ? (
          milestones.map((ms) => {
            let criteriaList: any[] = [];
            try {
              if (ms.acceptance_criteria_json) {
                criteriaList = JSON.parse(ms.acceptance_criteria_json);
              }
            } catch (e) {
              console.warn('Criteria parse error:', e);
            }

            return (
              <div
                key={ms.milestone_id}
                className="bg-[#0a0f1d] border border-slate-800 rounded-2xl p-6 space-y-5"
              >
                {/* Header Row */}
                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3 pb-4 border-b border-slate-800/80">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-sm font-bold text-blue-400">
                        Milestone #{ms.milestone_index}
                      </span>
                      <span
                        className={`px-2.5 py-0.5 rounded-full text-[11px] font-semibold ${
                          ms.status === 'RELEASED'
                            ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                            : 'bg-indigo-500/20 text-indigo-400 border border-indigo-500/30'
                        }`}
                      >
                        {ms.status}
                      </span>
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-mono bg-slate-800 text-slate-400 border border-slate-700">
                        ID: {ms.milestone_id}
                      </span>
                    </div>
                    <h2 className="text-lg font-bold text-white">{ms.title}</h2>
                    <p className="text-xs text-slate-400 max-w-2xl">{ms.description}</p>
                  </div>

                  <div className="text-right shrink-0">
                    <span className="text-xs text-slate-400 block">Milestone Amount</span>
                    <span className="text-xl font-bold font-mono text-white block">
                      {formatWeiRaw(ms.amount_wei)}
                    </span>
                    <span className="text-xs font-mono text-slate-400">
                      {formatWeiToGen(ms.amount_wei)}
                    </span>
                  </div>
                </div>

                {/* Accounting & Settlement Box */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                  <div className="bg-[#0e1629] p-3 rounded-xl border border-slate-800/60">
                    <span className="text-[10px] text-slate-400 block mb-1">Funded Escrow</span>
                    <span className="font-mono font-bold text-white block">
                      {formatWeiRaw(ms.funded_wei)}
                    </span>
                  </div>
                  <div className="bg-[#0e1629] p-3 rounded-xl border border-slate-800/60">
                    <span className="text-[10px] text-slate-400 block mb-1">Released Amount</span>
                    <span className="font-mono font-bold text-emerald-400 block">
                      {formatWeiRaw(ms.released_wei)}
                    </span>
                  </div>
                  <div className="bg-[#0e1629] p-3 rounded-xl border border-slate-800/60">
                    <span className="text-[10px] text-slate-400 block mb-1">Refunded Amount</span>
                    <span className="font-mono font-bold text-indigo-400 block">
                      {formatWeiRaw(ms.refunded_wei)}
                    </span>
                  </div>
                  <div className="bg-[#0e1629] p-3 rounded-xl border border-slate-800/60">
                    <span className="text-[10px] text-slate-400 block mb-1">Settlement Status</span>
                    <span className="font-semibold text-slate-200 block">
                      {ms.settlement_count > 0 ? 'Settled on StudioNet' : 'Pending'}
                    </span>
                  </div>
                </div>

                {/* Deliverable Evidence & Evaluation */}
                <div className="bg-[#0e1629] border border-slate-800/80 rounded-xl p-4 space-y-3 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-slate-200 flex items-center gap-1.5">
                      <FileCheck className="w-3.5 h-3.5 text-blue-400" />
                      <span>Submitted Evidence & Consensus Evaluation</span>
                    </span>
                    {ms.verdict !== 'NONE' && (
                      <span
                        className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                          ms.verdict === 'APPROVED'
                            ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                            : 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                        }`}
                      >
                        Consensus Verdict: {ms.verdict}
                      </span>
                    )}
                  </div>

                  <div className="space-y-2">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 text-[11px]">
                      <span className="text-slate-400">Evidence URL:</span>
                      {ms.evidence_url ? (
                        <a
                          href={ms.evidence_url}
                          target="_blank"
                          rel="noreferrer"
                          className="font-mono text-blue-400 hover:underline flex items-center gap-1 break-all"
                        >
                          <span>{ms.evidence_url}</span>
                          <ExternalLink className="w-3 h-3 shrink-0" />
                        </a>
                      ) : (
                        <span className="text-slate-500 italic">No external URL submitted</span>
                      )}
                    </div>

                    {ms.evidence_hash && (
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 text-[11px]">
                        <span className="text-slate-400">Evidence Hash:</span>
                        <span className="font-mono text-slate-300 break-all">{ms.evidence_hash}</span>
                      </div>
                    )}

                    {ms.submission_notes && (
                      <div className="text-[11px] bg-[#070b14] p-2.5 rounded-lg border border-slate-800 text-slate-300">
                        <span className="text-slate-500 block mb-0.5">Submission Notes:</span>
                        {ms.submission_notes}
                      </div>
                    )}

                    {ms.evaluation_rationale && (
                      <div className="text-[11px] bg-amber-500/10 border border-amber-500/30 p-2.5 rounded-lg text-amber-200">
                        <span className="text-amber-400 font-semibold block mb-0.5">
                          Multi-Validator Consensus Rationale:
                        </span>
                        {ms.evaluation_rationale}
                      </div>
                    )}
                  </div>
                </div>

                {/* Dispute & Arbitration Section */}
                {(ms.dispute_reason || ms.resolution_notes) && (
                  <div className="bg-[#0e1629] border border-slate-800/80 rounded-xl p-4 space-y-2.5 text-xs">
                    <div className="flex items-center gap-1.5 font-semibold text-slate-200">
                      <Scale className="w-3.5 h-3.5 text-indigo-400" />
                      <span>Dispute & Arbitrator Resolution Record</span>
                    </div>

                    {ms.dispute_reason && (
                      <div className="bg-rose-500/10 border border-rose-500/30 p-2.5 rounded-lg text-rose-200 text-[11px]">
                        <div className="flex justify-between items-center mb-0.5">
                          <span className="font-semibold text-rose-300">Dispute Raised:</span>
                          <span className="font-mono text-[10px] text-slate-400">
                            By {shortenAddress(ms.dispute_raised_by, 4)}
                          </span>
                        </div>
                        <p>{ms.dispute_reason}</p>
                      </div>
                    )}

                    {ms.resolution_notes && (
                      <div className="bg-emerald-500/10 border border-emerald-500/30 p-2.5 rounded-lg text-emerald-200 text-[11px]">
                        <span className="font-semibold text-emerald-300 block mb-0.5">
                          Arbitration Resolution Ruling:
                        </span>
                        <p>{ms.resolution_notes}</p>
                      </div>
                    )}
                  </div>
                )}

                {/* Acceptance Criteria Breakdown */}
                {criteriaList.length > 0 && (
                  <div className="space-y-2 text-xs">
                    <span className="font-semibold text-slate-300">
                      Agreed Acceptance Criteria ({criteriaList.length})
                    </span>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {criteriaList.map((crit, idx) => (
                        <div
                          key={idx}
                          className="bg-[#0e1629] border border-slate-800/60 p-3 rounded-xl flex items-start gap-2 text-[11px]"
                        >
                          <span className="font-mono font-bold text-blue-400 shrink-0">{crit.id}:</span>
                          <div className="space-y-0.5">
                            <p className="text-slate-300">{crit.description}</p>
                            <div className="flex items-center gap-2 text-[10px] text-slate-500">
                              <span>Weight: {crit.weight}%</span>
                              {crit.mandatory && <span className="text-amber-400">● Mandatory</span>}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            );
          })
        ) : loading ? (
          <div className="bg-[#0a0f1d] border border-slate-800 rounded-2xl p-12 text-center text-slate-400 text-sm">
            <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-3 text-blue-400" />
            <span>Loading authoritative milestones from GenLayer StudioNet...</span>
          </div>
        ) : (
          <div className="bg-[#0a0f1d] border border-slate-800 rounded-2xl p-12 text-center text-slate-400 text-sm">
            <span>No milestones found on target contract.</span>
          </div>
        )}
      </div>
    </div>
  );
}
