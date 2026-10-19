'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import {
  isV2Deployed,
  V2_DEPLOYMENT_CONFIG,
  isValidContractAddress,
  formatWeiRaw,
  formatWeiToGen,
} from '@/lib/genlayer';
import { useWallet, shortenAddress } from '@/lib/wallet';
import {
  ShieldAlert,
  Lock,
  ArrowLeft,
  CheckCircle2,
  AlertTriangle,
  Info,
  Code,
  FileText,
  Wallet,
  ExternalLink,
} from 'lucide-react';

export default function NewProjectPage() {
  const wallet = useWallet();
  const v2Active = isV2Deployed();

  // Form input state
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [refundRecipient, setRefundRecipient] = useState(wallet.address || '');
  const [arbitrator, setArbitrator] = useState('');
  const [milestoneTitle, setMilestoneTitle] = useState('');
  const [milestoneDesc, setMilestoneDesc] = useState('');
  const [milestoneAmount, setMilestoneAmount] = useState('');

  // Validation
  const errors: string[] = [];
  if (title.trim().length > 0 && title.trim().length < 3) {
    errors.push('Project title must be at least 3 characters.');
  }
  if (description.trim().length > 0 && description.trim().length < 5) {
    errors.push('Project description must be at least 5 characters.');
  }
  if (refundRecipient.trim() && !isValidContractAddress(refundRecipient.trim())) {
    errors.push('Refund recipient must be a valid 42-character hex address (0x...).');
  }
  if (arbitrator.trim() && !isValidContractAddress(arbitrator.trim())) {
    errors.push('Arbitrator must be a valid 42-character hex address (0x...).');
  }
  const parsedAmt = parseInt(milestoneAmount, 10);
  if (isNaN(parsedAmt) || parsedAmt <= 0) {
    errors.push('Milestone amount must be a positive integer in wei.');
  }

  const isValid =
    title.trim().length >= 3 &&
    description.trim().length >= 5 &&
    isValidContractAddress(refundRecipient.trim()) &&
    isValidContractAddress(arbitrator.trim()) &&
    !isNaN(parsedAmt) &&
    parsedAmt > 0;

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      {/* Back button */}
      <div>
        <Link
          href="/projects"
          className="inline-flex items-center gap-2 text-xs font-medium text-slate-400 hover:text-white transition"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>Back to Projects</span>
        </Link>
      </div>

      {/* Header */}
      <div className="bg-[#090e1c] border border-slate-800 rounded-2xl p-5 sm:p-6 space-y-2">
        <div className="flex items-center gap-2">
          <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-500/10 text-blue-400 border border-blue-500/30">
            Intelligent Contract Invocation
          </span>
          <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-500/10 text-amber-300 border border-amber-500/30">
            Safety Gate Enforced
          </span>
        </div>
        <h1 className="text-xl sm:text-2xl font-bold text-white tracking-tight">
          Create New Milestone Escrow Project
        </h1>
        <p className="text-xs sm:text-sm text-slate-400 max-w-2xl leading-relaxed">
          Configure project parameters, assign escrow participants, and preview the GenLayer StudioNet transaction calldata.
        </p>
      </div>

      {/* V2 Safety Gate Notice */}
      <div className="bg-[#161208] border border-amber-500/40 rounded-2xl p-5 sm:p-6 space-y-4">
        <div className="flex items-start gap-3">
          <div className="w-8 h-8 rounded-xl bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-amber-400 shrink-0 mt-0.5">
            <Lock className="w-4 h-4" />
          </div>
          <div className="space-y-1.5">
            <h3 className="text-sm font-bold text-amber-200">
              Pre-Deployment Safety Gate Active (NEXT_PUBLIC_V2_DEPLOYED=false)
            </h3>
            <p className="text-xs text-amber-300/90 leading-relaxed">
              &quot;TrustLedger V2 has not yet been deployed to StudioNet. New project creation is held at the pre-deployment safety gate.&quot;
            </p>
            <div className="text-xs text-slate-300 space-y-1 pt-1">
              <p>
                <strong>Diagnostic Verification:</strong> The TrustLedger V2 contract is deployed on StudioNet at{' '}
                <code className="font-mono text-amber-300 bg-black/40 px-1 py-0.5 rounded border border-amber-500/30">
                  0x4Ec472F1fEc41cB89Fd11DfD788679786E874336
                </code>{' '}
                (Tx: <code className="font-mono text-slate-400">0x8cf1...db82</code>, Deployer:{' '}
                <code className="font-mono text-slate-400">0x1dc6...D6B2</code>).
              </p>
              <p className="text-slate-400">
                <strong>Readiness Prerequisites:</strong> Zero recipient vaults have been pre-approved on V2 (<code className="font-mono">is_vault_approved = false</code>), zero native GEN has been funded, and operator clearance has not been released. Transaction submission is safely blocked to protect network funds until verified readiness.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Main Form & Transaction Preview */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        {/* Form Inputs (3 cols) */}
        <div className="lg:col-span-3 bg-[#0a0f1d] border border-slate-800 rounded-2xl p-5 sm:p-6 space-y-4">
          <h2 className="text-sm font-bold text-white flex items-center gap-2">
            <FileText className="w-4 h-4 text-blue-400" />
            <span>Project Parameters</span>
          </h2>

          <div className="space-y-3 text-xs">
            <div>
              <label className="block text-slate-300 font-medium mb-1">
                Project Title <span className="text-rose-400">*</span>
              </label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g., StudioNet Autonomous Deliverable System"
                className="w-full bg-[#0e1629] border border-slate-800 rounded-xl px-3.5 py-2.5 text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 transition text-xs"
              />
              <span className="text-[10px] text-slate-500 mt-1 block">Minimum 3 characters required.</span>
            </div>

            <div>
              <label className="block text-slate-300 font-medium mb-1">
                Project Description <span className="text-rose-400">*</span>
              </label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Detailed description of deliverable and milestone scope..."
                rows={3}
                className="w-full bg-[#0e1629] border border-slate-800 rounded-xl px-3.5 py-2.5 text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 transition text-xs"
              />
              <span className="text-[10px] text-slate-500 mt-1 block">Minimum 5 characters required.</span>
            </div>

            <div>
              <label className="block text-slate-300 font-medium mb-1">
                Refund Recipient Address <span className="text-rose-400">*</span>
              </label>
              <input
                type="text"
                value={refundRecipient}
                onChange={(e) => setRefundRecipient(e.target.value)}
                placeholder="0x..."
                className="w-full bg-[#0e1629] border border-slate-800 rounded-xl px-3.5 py-2.5 text-white font-mono placeholder-slate-500 focus:outline-none focus:border-blue-500 transition text-xs"
              />
              <span className="text-[10px] text-slate-500 mt-1 block">
                Destination vault or address for refunded escrow in case of rejected milestone.
              </span>
            </div>

            <div>
              <label className="block text-slate-300 font-medium mb-1">
                Arbitrator Address <span className="text-rose-400">*</span>
              </label>
              <input
                type="text"
                value={arbitrator}
                onChange={(e) => setArbitrator(e.target.value)}
                placeholder="0x..."
                className="w-full bg-[#0e1629] border border-slate-800 rounded-xl px-3.5 py-2.5 text-white font-mono placeholder-slate-500 focus:outline-none focus:border-blue-500 transition text-xs"
              />
              <span className="text-[10px] text-slate-500 mt-1 block">
                Designated arbitrator EOA or contract for resolving contested disputes.
              </span>
            </div>

            {/* Initial Milestone */}
            <div className="pt-3 border-t border-slate-800/80 space-y-3">
              <span className="text-xs font-semibold text-slate-300 block">Initial Milestone Specification</span>
              <div>
                <label className="block text-slate-400 mb-1">Milestone Title</label>
                <input
                  type="text"
                  value={milestoneTitle}
                  onChange={(e) => setMilestoneTitle(e.target.value)}
                  className="w-full bg-[#0e1629] border border-slate-800 rounded-xl px-3 py-2 text-white text-xs"
                />
              </div>
              <div>
                <label className="block text-slate-400 mb-1">Milestone Amount (wei)</label>
                <input
                  type="number"
                  value={milestoneAmount}
                  onChange={(e) => setMilestoneAmount(e.target.value)}
                  className="w-full bg-[#0e1629] border border-slate-800 rounded-xl px-3 py-2 text-white font-mono text-xs"
                />
                <span className="text-[10px] text-slate-500 mt-0.5 block font-mono">
                  {formatWeiRaw(parsedAmt || 0)} ≈ {formatWeiToGen(parsedAmt || 0)}
                </span>
              </div>
            </div>

            {/* Validation errors summary */}
            {errors.length > 0 && (
              <div className="bg-rose-500/10 border border-rose-500/30 rounded-xl p-3 space-y-1">
                {errors.map((err, idx) => (
                  <div key={idx} className="flex items-center gap-1.5 text-rose-300 text-[11px]">
                    <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                    <span>{err}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Transaction Preview & Action (2 cols) */}
        <div className="lg:col-span-2 space-y-4">
          <div className="bg-[#0a0f1d] border border-slate-800 rounded-2xl p-5 space-y-4 text-xs">
            <h2 className="text-sm font-bold text-white flex items-center gap-2">
              <Code className="w-4 h-4 text-blue-400" />
              <span>Transaction Preview</span>
            </h2>

            <div className="space-y-2.5">
              <div className="bg-[#0e1629] p-3 rounded-xl border border-slate-800/80 space-y-1 font-mono text-[11px]">
                <div className="text-slate-400 text-[10px] uppercase font-sans font-semibold">Network Target</div>
                <div className="text-white">GenLayer StudioNet (61999)</div>
              </div>

              <div className="bg-[#0e1629] p-3 rounded-xl border border-slate-800/80 space-y-1 font-mono text-[11px]">
                <div className="text-slate-400 text-[10px] uppercase font-sans font-semibold">Target Escrow Contract</div>
                <div className="text-blue-400 break-all">0x4Ec472F1fEc41cB89Fd11DfD788679786E874336</div>
              </div>

              <div className="bg-[#0e1629] p-3 rounded-xl border border-slate-800/80 space-y-1 font-mono text-[11px]">
                <div className="text-slate-400 text-[10px] uppercase font-sans font-semibold">Contract Method</div>
                <div className="text-emerald-400">create_project</div>
                <div className="text-slate-400 text-[10px]">
                  (title: str, description: str, refund_recipient: str, arbitrator: str)
                </div>
              </div>

              <div className="bg-[#0e1629] p-3 rounded-xl border border-slate-800/80 space-y-1 font-mono text-[11px]">
                <div className="text-slate-400 text-[10px] uppercase font-sans font-semibold">Caller (EOA)</div>
                <div className="text-slate-200">
                  {wallet.isConnected ? wallet.address : 'Wallet not connected'}
                </div>
              </div>

              <div className="bg-[#0e1629] p-3 rounded-xl border border-slate-800/80 space-y-1 font-mono text-[11px]">
                <div className="text-slate-400 text-[10px] uppercase font-sans font-semibold">Calldata Payload (JSON)</div>
                <pre className="text-slate-300 text-[10px] overflow-x-auto whitespace-pre-wrap">
{JSON.stringify(
  {
    title: title || '<Project Title>',
    description: description || '<Project Description>',
    refund_recipient: refundRecipient || '<Refund Address>',
    arbitrator: arbitrator || '<Arbitrator Address>',
  },
  null,
  2
)}
                </pre>
              </div>
            </div>

            {/* Explicit Submission Safety Gate */}
            <div className="pt-2 space-y-2">
              <button
                type="button"
                disabled={true}
                className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-slate-800 text-slate-400 font-semibold text-xs border border-slate-700 cursor-not-allowed opacity-70"
                title="Held at pre-deployment safety gate"
              >
                <Lock className="w-4 h-4 text-amber-400" />
                <span>Submit Transaction (Locked by Safety Gate)</span>
              </button>

              <p className="text-[10px] text-amber-300/80 text-center leading-tight">
                Held at pre-deployment safety gate (<code className="font-mono">NEXT_PUBLIC_V2_DEPLOYED=false</code>).
                No transaction is broadcast.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
