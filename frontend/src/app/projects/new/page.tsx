'use client';

import React, { useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useWallet } from '@/lib/wallet';
import { V2_ADDRESS, v2ListProjects, v2Summary, writeGateOpen } from '@/lib/escrow';
import { validateCreateProject, sameAddress, type ProjectView } from '@/lib/escrow-core';
import { TxConfirmDialog, WriteBlockerNotice, useWriteBlocker, type PendingTx } from '@/components/TxDialog';
import { ArrowLeft, AlertTriangle, FileText, CheckCircle2 } from 'lucide-react';

const input = 'w-full bg-[#0e1629] border border-slate-800 rounded-xl px-3.5 py-2.5 text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 text-xs';

export default function NewProjectPage() {
  const wallet = useWallet();
  const router = useRouter();
  const blocker = useWriteBlocker();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [refundRecipient, setRefundRecipient] = useState('');
  const [arbitrator, setArbitrator] = useState('');
  const [tx, setTx] = useState<PendingTx | null>(null);
  const [created, setCreated] = useState<ProjectView | null>(null);
  const baseline = useRef(0);

  const check = validateCreateProject({ title, description, refundRecipient, arbitrator });
  const touched = title || description || refundRecipient || arbitrator;

  const findCreated = async (caller: string): Promise<ProjectView | null> => {
    const list = await v2ListProjects();
    return (
      list
        .filter((p) => p.project_id > baseline.current && sameAddress(p.client, caller) && p.title === title.trim())
        .sort((a, b) => b.project_id - a.project_id)[0] ?? null
    );
  };

  const start = () => {
    if (!check.ok || !V2_ADDRESS || !wallet.address) return;
    const caller = wallet.address;
    setTx({
      key: `create_project:${caller}:${title.trim()}`,
      action: 'Create escrow project',
      contract: V2_ADDRESS,
      method: 'create_project',
      args: [title.trim(), description.trim(), refundRecipient.trim(), arbitrator.trim()],
      valueWei: 0n,
      preflight: async () => {
        const s = await v2Summary();
        baseline.current = Number(s.project_count);
        return { ok: true };
      },
      verify: async () => {
        const p = await findCreated(caller);
        if (p) setCreated(p);
        return !!p;
      },
    });
  };

  return (
    <div className="space-y-6 max-w-3xl mx-auto">
      <Link href="/projects" className="inline-flex items-center gap-2 text-xs text-slate-400 hover:text-white">
        <ArrowLeft className="w-3.5 h-3.5" /> Back to Projects
      </Link>

      <div className="bg-[#090e1c] border border-slate-800 rounded-2xl p-5 space-y-2">
        <h1 className="text-xl font-bold text-white">Create escrow project (TrustLedger V2)</h1>
        <p className="text-xs text-slate-400">
          Calls <code className="font-mono text-emerald-300">create_project(title, description, refund_recipient, arbitrator)</code> on{' '}
          <code className="font-mono text-blue-300 break-all">{V2_ADDRESS ?? 'unconfigured'}</code>. The caller becomes the project client. Empty
          refund recipient or arbitrator default to the caller (contract rule).
        </p>
        <p className="text-[11px] text-slate-500">
          Write gate: <span className={writeGateOpen() ? 'text-emerald-300' : 'text-amber-300'}>{writeGateOpen() ? 'OPEN (preview configuration)' : 'CLOSED'}</span>.
          Historical Run 2 Project #1 is read-only and unaffected.
        </p>
      </div>

      <WriteBlockerNotice />

      <div className="bg-[#0a0f1d] border border-slate-800 rounded-2xl p-5 space-y-3 text-xs">
        <h2 className="text-sm font-bold text-white flex items-center gap-2"><FileText className="w-4 h-4 text-blue-400" /> Project parameters</h2>
        <label className="block text-slate-300">Title (min 3)<input className={input} value={title} onChange={(e) => setTitle(e.target.value)} data-testid="np-title" /></label>
        <label className="block text-slate-300">Description (min 5)<textarea className={input} rows={3} value={description} onChange={(e) => setDescription(e.target.value)} data-testid="np-desc" /></label>
        <label className="block text-slate-300">Refund recipient (optional; must be an approved vault for refunds to be withdrawable)<input className={`${input} font-mono`} placeholder="0x… (default: caller)" value={refundRecipient} onChange={(e) => setRefundRecipient(e.target.value)} data-testid="np-refund" /></label>
        <label className="block text-slate-300">Arbitrator (optional)<input className={`${input} font-mono`} placeholder="0x… (default: caller)" value={arbitrator} onChange={(e) => setArbitrator(e.target.value)} data-testid="np-arb" /></label>
        {touched && !check.ok && (
          <div className="flex items-center gap-1.5 text-rose-300 bg-rose-500/10 border border-rose-500/30 rounded-xl p-2.5" data-testid="np-error">
            <AlertTriangle className="w-3.5 h-3.5" /> {check.reason}
          </div>
        )}
        <button type="button" onClick={start} disabled={!check.ok || !!blocker} className="w-full px-4 py-3 rounded-xl bg-blue-600 text-white font-semibold disabled:opacity-40 disabled:cursor-not-allowed" data-testid="np-submit">
          Review transaction
        </button>
      </div>

      {created && (
        <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-2xl p-4 text-xs text-emerald-200 space-y-1" data-testid="np-created">
          <div className="flex items-center gap-2 font-semibold"><CheckCircle2 className="w-4 h-4" /> Read back from contract: project #{created.project_id}</div>
          <div className="font-mono">client {created.client} · status {created.status}</div>
          <button className="underline" onClick={() => router.push(`/projects/v2/${created.project_id}`)}>Open project and add milestones →</button>
        </div>
      )}

      <TxConfirmDialog tx={tx} onClose={() => setTx(null)} />
    </div>
  );
}
